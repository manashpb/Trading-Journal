#!/usr/bin/env bash
#
# deploy.sh — one-shot provisioning + deploy for a project on a fresh Ubuntu EC2.
#
# What it does:
#   1. installs the system stack (Node.js, nginx, build-essential, pm2) — idempotent
#   2. fetches the code (git clone/pull) OR uses code you placed at APP_DIR
#   3. installs npm deps, builds server + client, starts the backend under pm2
#   4. writes an nginx server block for this app (domain-based, or IP default_server)
#   5. reloads nginx, runs a health check, installs a daily backup cron
#
# Running it for multiple projects on one EC2:
#   - Each project = one run of this script. The system stack installs only once;
#     later runs skip straight to "Deploying".
#   - Give each project its own APP_NAME, APP_DIR, PORT, and a DOMAIN.
#   - The bare-IP mode uses "port 80 default_server", which only ONE project can claim.
#     So projects 2+ need a DOMAIN (A record -> Elastic IP), or set NGINX_LISTEN to a
#     distinct port (e.g. "8080") so each listens on its own port.
#
# Usage (run as a normal user with sudo access, NOT as root):
#   scp deploy.sh ubuntu@<ip>:/home/ubuntu/
#   ssh  ubuntu@<ip>  "bash deploy.sh"
#
set -euo pipefail

# ───────────────────────────── CONFIG — edit me ─────────────────────────────
REPO_URL=""       # git URL to clone, e.g. "https://github.com/you/trading-journal.git"
                  # leave empty if the code is already on the server at APP_DIR (e.g. scp'd there)
APP_DIR="/var/www/trading-journal"
APP_NAME="trading-journal"
PORT=5000
DOMAIN=""         # e.g. "journal.example.com" — empty = bind to the server's IP (port 80 default_server)
NGINX_LISTEN="80" # nginx listen port; use a distinct port per project when you have no domain
NODE_MAJOR=22     # minimum Node.js major version to ensure
BACKUP_ENABLED=1  # 1 = install a daily cron backup of journal.db + snapshots
# ─────────────────────────────────────────────────────────────────────────────

PUBLIC_IP=""

log()  { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── sanity checks ────────────────────────────────────────────────
[ "$(id -u)" -ne 0 ] || die "run as a normal user with sudo access (not root)."
command -v apt-get >/dev/null 2>&1 || die "this script targets Ubuntu/Debian (apt)."
command -v sudo    >/dev/null 2>&1 || die "sudo is required."
sudo -n -v 2>/dev/null || sudo -v || die "sudo access is required — make sure this user has a sudo policy, then run 'sudo -v' once interactively."

echo
log "Deploying '$APP_NAME' (port $PORT)${DOMAIN:+  |  domain: $DOMAIN}"

# ── 1. system stack (idempotent — each piece is skipped if already installed) ──
export DEBIAN_FRONTEND=noninteractive

if ! command -v nginx >/dev/null 2>&1; then
  log "Installing nginx"
  sudo apt-get update -y
  sudo apt-get install -y nginx
else
  ok "nginx present"
fi

if ! command -v g++ >/dev/null 2>&1; then
  log "Installing build-essential (needed to build the sqlite3 native module)"
  sudo apt-get update -y
  sudo apt-get install -y build-essential
else
  ok "build-essential present"
fi

node_major=""
if command -v node >/dev/null 2>&1 && node -v >/dev/null 2>&1; then
  node_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
fi
if [ -z "$node_major" ] || [ "$node_major" -lt "$NODE_MAJOR" ]; then
  log "Installing Node.js $NODE_MAJOR (found: ${node_major:-none})"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
else
  ok "Node.js v$node_major present"
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing pm2"
  sudo npm install -g pm2
else
  ok "pm2 present"
fi

sudo systemctl enable --now nginx >/dev/null 2>&1 || true

# ── 2. fetch code ────────────────────────────────────────────────
sudo mkdir -p "$(dirname "$APP_DIR")"
if [ -z "$REPO_URL" ]; then
  [ -d "$APP_DIR" ] || die "REPO_URL is empty and '$APP_DIR' does not exist." \
    "Set REPO_URL, or place the code there first (e.g. scp -r client server deploy package.json ubuntu@<ip>:$APP_DIR/)."
  log "Using existing code at $APP_DIR"
elif [ -d "$APP_DIR" ] && [ ! -d "$APP_DIR/.git" ]; then
  die "'$APP_DIR' already exists but is not a git repo." \
    "Remove it (sudo rm -rf '$APP_DIR') and re-run, or clear REPO_URL to use it as-is."
elif [ -d "$APP_DIR/.git" ]; then
  log "Pulling latest from $REPO_URL"
  git -C "$APP_DIR" pull --ff-only
else
  log "Cloning $REPO_URL"
  sudo mkdir -p "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
sudo chown -R "$(id -u):$(id -g)" "$APP_DIR"

cd "$APP_DIR"

# ── 3. install + build + run ─────────────────────────────────────
log "Installing dependencies (server + client)"
npm run setup

log "Building (server → dist, client → dist)"
npm run build

[ -f "$APP_DIR/.env" ] || die "Create $APP_DIR/.env with JOURNAL_USER and JOURNAL_PASSWORD before deployment."
log "Starting backend under pm2"
if [ -n "$(pm2 id "$APP_NAME" 2>/dev/null | tr -d '[] \n')" ]; then
  NODE_ENV=production PORT="$PORT" pm2 restart "$APP_NAME" --update-env --node-args="--env-file=$APP_DIR/.env"
else
  NODE_ENV=production PORT="$PORT" pm2 start "$APP_DIR/server/dist/index.js" --name "$APP_NAME" --node-args="--env-file=$APP_DIR/.env"
fi
pm2 save >/dev/null 2>&1 || true
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$(id -un)" --hp "$HOME" >/dev/null 2>&1 || true
ok "pm2 running '$APP_NAME' on port $PORT"

log "Health check: http://127.0.0.1:$PORT/api/health"
healthy=0
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 1
done
if [ "$healthy" -eq 1 ]; then
  ok "backend healthy"
else
  echo "Backend not healthy — last logs:"
  pm2 logs "$APP_NAME" --lines 40 --nostream || true
  die "backend failed to become healthy."
fi

# ── 4. nginx server block ────────────────────────────────────────
if [ -z "$DOMAIN" ]; then
  listen_line="80 default_server;"
  server_name_line="_"
else
  listen_line="$NGINX_LISTEN;"
  server_name_line="$DOMAIN"
fi

# remove Ubuntu's stock vhost so our IP default_server is the only one on :80
if [ -f /etc/nginx/sites-enabled/default ]; then
  sudo rm -f /etc/nginx/sites-enabled/default
fi

conf=$(cat <<'NGINX'
# Generated by deploy.sh for {{APP_NAME}}.
server {
    listen {{LISTEN}};
    server_name {{SERVER_NAME}};

    client_max_body_size 12m;
    location / {
        proxy_pass http://127.0.0.1:{{PORT}};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

}
NGINX
)
conf="${conf//{{APP_NAME}}/$APP_NAME}"
conf="${conf//{{LISTEN}}/$listen_line}"
conf="${conf//{{SERVER_NAME}}/$server_name_line}"
conf="${conf//{{APP_ROOT}}/$APP_DIR/client/dist}"
conf="${conf//{{PORT}}/$PORT}"

log "Writing nginx config  /etc/nginx/conf.d/$APP_NAME.conf"
echo "$conf" | sudo tee "/etc/nginx/conf.d/$APP_NAME.conf" >/dev/null
sudo nginx -t
sudo systemctl reload nginx
ok "nginx reloaded"

# ── 5. optional daily backup cron ────────────────────────────────
if [ "$BACKUP_ENABLED" = "1" ]; then
  backup_dir="/var/backups/$APP_NAME"
  sudo mkdir -p "$backup_dir"
  sudo chown "$(id -un):$(id -gn)" "$backup_dir"
  sudo chmod 700 "$backup_dir"
  cron_line="0 3 * * * bash $APP_DIR/deploy/backup.sh $APP_DIR $APP_NAME $backup_dir"
  existing="$(crontab -l 2>/dev/null || true)"
  filtered="$(printf '%s\n' "$existing" | grep -v "$APP_NAME" || true)"
  { printf '%s\n' "$filtered"; printf '%s\n' "$cron_line"; } | crontab -
  ok "daily consistent backup installed (briefly pauses the app at 03:00 server time)"
fi

# ── summary ──────────────────────────────────────────────────────
token=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
        -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null || true)
if [ -n "$token" ]; then
  PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $token" \
              http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
fi
[ -z "$PUBLIC_IP" ] && PUBLIC_IP='<your Elastic IP>'

echo
echo "───────────────────────────────────────────────────────────────"
echo "  Done."
if [ -n "$DOMAIN" ]; then
  echo "  URL:     http://$DOMAIN     (point an A record → $PUBLIC_IP)"
else
  echo "  URL:     http://$PUBLIC_IP"
fi
echo "  Health:  curl http://127.0.0.1:$PORT/api/health"
echo
echo "  Import existing journal data (only if you have a local journal.db):"
echo "    pm2 stop $APP_NAME"
echo "    scp server/journal.db $(id -un)@$PUBLIC_IP:$APP_DIR/server/"
echo "    pm2 start $APP_NAME"
echo "───────────────────────────────────────────────────────────────"