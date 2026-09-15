# Trading Journal — EC2 Deployment Runbook

Deploy the trading journal (and, later, more projects) on a single Amazon EC2 **Ubuntu** instance, reachable from any browser, with each project routed by its URL.

- **Stack:** React 18 + Vite (frontend) · Node 20 + Express (backend, port `5000`) · SQLite (single file `server/trading.db`) · snapshots stored under `server/snapshots/`
- **Router:** Nginx reverse proxy — one server block per project, keyed on the domain/IP shown in the URL
- **Process manager:** pm2 keeps the Node backend alive and starts it on boot

---

## 0. The one code change you must keep

Before you ever made changes, the frontend called `http://localhost:5000` — which would resolve to the *visitor's* machine, not the server. **This was already fixed in this repo**:

| File | Change |
|---|---|
| `client/src/api/index.ts` | `BASE_URL = '/api'`, `SNAPSHOT_BASE_URL = ''` (relative) |
| `client/src/utils/format.ts` | `snapshotUrl()` returns `/snapshots/<path>` |
| `client/vite.config.ts` | dev proxy `/api`, `/snapshots` → `:5000` (so `npm run dev` still works locally) |

Verify with `grep -r localhost client/src` → no matches expected. If you ever see `localhost:5000` creep back into `client/src`, the deployed site will break on non-local machines.

---

## 1. Create the EC2 instance (one-time)

1. Launch **Ubuntu 24.04 LTS** — `t3.small` is comfortable; `t3.medium` if you plan several projects under load.
2. **Security group — open ONLY:**
   - SSH `22` (your IP only, ideally)
   - HTTP `80`
   - HTTPS `443`
   - ❌ Do **not** open `5000`. The backend stays private behind Nginx.
3. **Allocate an Elastic IP** and attach it to the instance. Without it, DNS breaks on every restart.
4. Connect via SSH (the AWS console shows the command using your `.pem` key), then verify: `whoami && cat /etc/os-release`.

---

## 2. One-command deploy

Copy the script and run it **as a normal user with sudo access** (the default `ubuntu` user):

```bash
# from your laptop
scp -i your-key.pem deploy/deploy.sh ubuntu@<elastic-ip>:/home/ubuntu/

# on the server
ssh -i your-key.pem ubuntu@<elastic-ip>
sed -i 's/\r$//' deploy.sh     # strips Windows CRLF endings if any git/scp carried them
bash deploy.sh
```

Edit the **CONFIG block** at the top of `deploy.sh` first if you are not using the defaults:

```bash
REPO_URL="";        # set to a git URL to clone, or leave empty if you scp'd the code to /var/www/trading-journal
APP_DIR="/var/www/trading-journal"
APP_NAME="trading-journal"
PORT=5000
DOMAIN="";          # e.g. journal.example.com — empty = IP-based (port 80 default_server)
NGINX_LISTEN="80"; BODE_MAJOR=20; BACKUP_ENABLED=1
```

The script is **idempotent** — re-running it is safe (reinstalls nothing already present, rebuilds, restarts the app, rewrites the same Nginx config).

What it does, step by step:

1. Installs Node.js 20, Nginx, `build-essential` (for the sqlite3 native module), pm2
2. Clones/pulls the repo — or uses code already at `APP_DIR` (see below)
3. `npm run setup` → installs server + client deps; `npm run build` → `server/dist` + `client/dist`
4. `pm2 start` the backend on port `5000`, then `pm2 save` + `pm2 startup` (autostart on reboot)
5. Writes `/etc/nginx/conf.d/trading-journal.conf` and reloads Nginx
6. Health-checks `http://127.0.0.1:5000/api/health` (dumps pm2 logs on failure)
7. Installs a daily cron backup → `/var/backups/trading-journal-<date>.tgz`

**Done — open `http://<elastic-ip>` in any browser.**

### If you're not using git yet (scp instead)

```bash
ssh -i your-key.pem ubuntu@<elastic-ip>   # first
sudo mkdir -p /var/www
scp -i your-key.pem -r client server deploy package.json package-lock.json \
    ubuntu@<elastic-ip>:/var/www/trading-journal/
# then re-ssh and: sed -i 's/\r$//' deploy.sh && bash deploy.sh
```

### Bring your existing journal data (only first time)

The app creates an empty `trading.db` on first start. To import your local journal **before** using it:

```bash
pm2 stop trading-journal
scp -i your-key.pem server/trading.db ubuntu@<elastic-ip>:/var/www/trading-journal/server/
pm2 start trading-journal
```

---

## 3. Multiple projects on the same EC2 (your original goal)

One script run **per project**; each gets its own:

- `APP_NAME`, `APP_DIR`, `PORT`
- `DOMAIN` — **the URL you type picks the project**

| Project | URL | Port | Nginx listening on |
|---|---|---|---|
| Trading journal | `journal.example.com` | 5000 | `:80` (`server_name journal.example.com`) |
| Project 2 | `app2.example.com` | 6001 | `:80` (`server_name app2.example.com`) |
| Project 3 | `tools.example.com` | 6002 | `:80` (`server_name tools.example.com`) |

Rules:
- Only **one** project may use IP mode (`DOMAIN=""` → port-80 `default_server`). Once you have domains, give every project one and drop `default_server`.
- **DNS:** create an **A record** for each subdomain → the same Elastic IP. The machine can't infer a project from the IP alone; it needs the hostname in the request.
- Re-running `deploy.sh` for a later project skips the system install (already present) and only deploys + writes that project's Nginx conf.

---

## 4. DNS + HTTPS (do this when you own a domain)

```bash
# DNS provider (Route 53, Cloudflare, registrar...):
#   journal.example.com  A  <elastic-ip>

# then on the server:
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d journal.example.com        # repeat per domain
# certbot rewrites the server block to use SSL automatically
```

---

## 5. Day-to-day

- **Redeploy a new version:**
  ```bash
  cd /var/www/trading-journal && git pull && npm run build && cd server
  pm2 restart trading-journal
  ```
- **Check status / logs:**
  ```bash
  pm2 status
  pm2 logs trading-journal --lines 50
  sudo tail -f /var/log/nginx/error.log
  ```
- **Backups** land daily at 03:00 server time in `/var/backups/` — move them off-box (S3, another machine) if the data matters.
- **Data = two things only:** `server/trading.db` and `server/snapshots/`. Back those up; everything else is reproducible from git + `npm run build`.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Site loads but API fails | `localhost` crept back into `client/src` → rebuild (`git pull` then `npm run build`, restart). See step 0. |
| `Connection refused` on `:5000` from browser | You opened port 5000 in the SG or are hitting it directly — don't. Use `http://<elastic-ip>` (port 80 via Nginx). |
| `502 Bad Gateway` | Backend down → `pm2 logs trading-journal --lines 40`, then `pm2 restart trading-journal`. |
| Nginx conf changed but no effect | `sudo nginx -t && sudo systemctl reload nginx`. |
| `bash deploy.sh: $'\r': command not found` | Windows CRLF endings → `sed -i 's/\r$//' deploy.sh && bash deploy.sh`. |
| Can't SSH | Check the `22` rule in the security group and that your `.pem` is the one attached to the instance. |