# EC2 operations: Trading Journal and FNO Analyzer

Last updated: 23 October 2026 (Asia/Kolkata).

This guide records the deployment completed through the chat. Server facts come
from the supplied command output and the user's completion reports; this document
was prepared locally, not by inspecting the live server over SSH. Commands below
run on EC2 as `ubuntu`, except the explicitly marked Windows publishing commands.

## 1. Server layout

| Component | Setting |
| --- | --- |
| Operating system | Ubuntu 26.04.1 LTS |
| Public IP | 52.66.251.235 |
| SSH/deployment account | ubuntu |
| Node executable | /usr/bin/node |
| Node version after repair | 22.22.1; verify with `node --version` |
| Journal repository | https://github.com/manashpb/Trading-Journal.git |
| Journal branch / deployment checkout | main / /opt/trading-journal |
| Journal process | PM2: trading-journal, port 5002 |
| Shared login process | PM2: trading-workspace, 127.0.0.1:5001 |
| FNO repository | https://github.com/manashpb/FNO-Analyzer |
| FNO branch / deployment checkout | main / /opt/fno-analyzer |
| FNO process | systemd: fno-analyzer.service, 127.0.0.1:8001 |
| Nginx active site configuration | /etc/nginx/conf.d/trading-journal.conf |
| Nginx source template | /opt/trading-journal/deploy/workspace.nginx.conf |

The instance previously reported roughly 908 MiB RAM, no swap and a 6.7 GiB root
disk. Free space was under 1 GiB during installation. Check `df -h /` and `free -h`
before updates; do not continue through disk-full or out-of-memory failures.

The journal currently calls `app.listen(PORT)` without a loopback host argument,
so it can listen on all interfaces. Its port must be blocked by EC2 security-group
rules. The portal and FNO bind to loopback. Nginx reaches all apps locally.

## 2. Browser routes and authentication

| URL | Behaviour |
| --- | --- |
| http://52.66.251.235/ | Login form; application chooser after sign-in |
| /login | Login page |
| /logout | POST with the session's CSRF token; use the Sign out button |
| /journal/ | Journal frontend, API and images; authentication required |
| /fnoanalyzer/ | FNO frontend and API; authentication required |
| /_portal_verify | Internal Nginx authentication subrequest; no public access |
| /verify | Public requests blocked by Nginx |

Nginx checks the portal session before forwarding either application's requests.
It strips `/journal/` or `/fnoanalyzer/` before forwarding to the corresponding
backend. For the journal it supplies the existing Basic credentials internally,
so users only sign in once through the portal. The journal build must use
`JOURNAL_BASE_PATH=/journal/` for router, assets, API and screenshot URLs.

The portal has one shared owner account. Cookies are HttpOnly and SameSite=Lax.
Authenticated sessions last 12 hours and live in memory; restarting the portal
signs everyone out. Login pages have a 15-minute CSRF session. Ten login POST
attempts per client IP are allowed per 15-minute window, including successful
attempts. Direct application requests without a session redirect to `/login`.

## 3. Journal and portal configuration

Both PM2 processes use the same private file:
`/opt/trading-journal/.env`. Do not commit it or paste its contents into chat.

```ini
NODE_ENV=production
PORT=5002
PORTAL_PORT=5001
PORTAL_ORIGIN=http://52.66.251.235
JOURNAL_USER=your-username
JOURNAL_PASSWORD="your-strong-password"
```

`PORTAL_ORIGIN` must exactly match the browser origin, including HTTP/HTTPS and
any non-default port, without a trailing slash. A different hostname, localhost,
or an SSH-tunnel URL will fail the login origin check unless configured to match.
Do not set a different journal username/password for the portal.

```bash
chmod 600 /opt/trading-journal/.env
```

Journal persistence defaults:

- `/opt/trading-journal/server/journal.db`
- `/opt/trading-journal/server/snapshots/`

Do not delete these during routine updates. `DB_PATH` and `SNAPSHOTS_DIR`, if
explicitly configured later, override these defaults and must also be reflected
in backup procedures.

Initial process creation, only if these names do not already exist:

```bash
cd /opt/trading-journal
pm2 start server/dist/index.js --name trading-journal --node-args="--env-file=.env"
pm2 start deploy/portal.mjs --name trading-workspace --node-args="--env-file=.env"
pm2 save
```

For reboot persistence, run `pm2 startup` as `ubuntu`, execute the exact privileged
command it prints, then `pm2 save`. Check `systemctl status pm2-ubuntu --no-pager`.
Run PM2 commands as `ubuntu`, not `sudo pm2`, to use the correct process list.

Change login credentials with `nano /opt/trading-journal/.env`, then:

```bash
pm2 restart trading-journal trading-workspace --update-env
pm2 save
```

Node reads the env file again on process startup. Avoid setting conflicting
JOURNAL_USER/JOURNAL_PASSWORD/PORT values in the shell or PM2 environment, since
existing process environment values take precedence over Node's env file.

## 4. Nginx configuration

The full server block is maintained beside this guide in
[`workspace.nginx.conf`](workspace.nginx.conf). It replaces the old journal's
server block; it is not an additional FNO snippet to include alongside it.

The old static root, `/api`, `/snapshots` locations and
`include /etc/nginx/snippets/fno-analyzer-subpath.conf;` must not remain in this
server block. The shared template already defines protected FNO routes. An unused
snippet file can remain on disk; do not include it again.

The template uses port 80, `server_name 52.66.251.235`, a 12 MiB request-body limit
and a 120-second FNO proxy read timeout. Journal uploads remain subject to the
application's own limits as well.

To apply an intentional Nginx change:

```bash
sudo cp /etc/nginx/conf.d/trading-journal.conf \
  /etc/nginx/trading-journal.conf.previous
sudo cp /opt/trading-journal/deploy/workspace.nginx.conf \
  /etc/nginx/conf.d/trading-journal.conf
sudo nginx -t && sudo systemctl reload nginx
```

Keep backups outside `conf.d/*.conf` and `sites-enabled`, which Nginx loads.
Review the template before copying it: once HTTPS is added, retain the installed
TLS/certificate settings instead of overwriting them with the HTTP-only template.
Ordinary application updates do not require an Nginx reload.

## 5. FNO service, configuration and persistence

The repository's service runs as `fno:fno` with:

- WorkingDirectory: `/opt/fno-analyzer`
- ExecStart: `/opt/fno-analyzer/.venv/bin/python -m fno_analyzer`
- PYTHONPATH: `/opt/fno-analyzer/src`
- EnvironmentFile: `/etc/fno-analyzer/fno-analyzer.env`
- Installed unit: `/etc/systemd/system/fno-analyzer.service`
- Runtime data directory: `/var/lib/fno-analyzer`
- External configuration: `/etc/fno-analyzer/config.json`, selected by FNO_CONFIG
  in the environment file (the unit's fallback points inside the checkout).

Confirm the installed values with `sudo systemctl cat fno-analyzer`; environment
file values take precedence over the unit's fallback environment settings.
Do not publish the credentials file when sharing diagnostics.

Expected deployment settings include:

```ini
FNO_SERVER_HOST=127.0.0.1
FNO_SERVER_PORT=8001
FNO_DATA_DIR=/var/lib/fno-analyzer
FNO_CONFIG=/etc/fno-analyzer/config.json
FNO_DHAN_JWT=your-current-jwt
FNO_AOC_TOKEN=your-current-aoc-token
FNO_DHAN_AUTHORISATION=Token
```

Retain other existing provider settings in that file. Update tokens using:

```bash
sudo nano /etc/fno-analyzer/fno-analyzer.env
sudo systemctl restart fno-analyzer
sudo systemctl status fno-analyzer --no-pager
```

Use raw token values without a Bearer prefix. No Nginx reload is required.
Keep the external JSON configuration, credentials and `/var/lib/fno-analyzer`
through code updates. Runtime data can include `dhan_map.json` and
`oi_history.sqlite3`; do not unnecessarily rebuild the symbol map.

## 6. Publish repository changes from Windows

In the relevant local checkout:

- Journal: `E:\TRADING\WEB_JOURNAL_TRADING\Trading-Journal`
- FNO: `E:\TRADING\FNO_ANALYSIS\FNO-Analyzer`

```powershell
git status --short
# Stage explicit intended source/documentation paths, for example:
# git add deploy/WORKSPACE.md
git diff --cached --stat
git diff --cached --check
git commit -m "Describe the change"
git push origin main
```

If already committed, only the push is needed. Never commit `.env`, provider
credentials, runtime databases, trade screenshots or backups. A push changes
GitHub; the EC2 checkout is updated separately using the procedures below.

## 7. Update Trading Journal and the login portal on EC2

This procedure briefly stops the journal. The portal can continue serving FNO
while the journal builds. Restarting the portal at the end invalidates sessions.
Stop immediately if any command fails; commands are shown sequentially, not as
an unattended script. Do not use `git reset --hard` or `git clean` to fix a dirty
checkout: first inspect and preserve intentional server changes.

First inspect the checkout and record the deployed revision:

```bash
cd /opt/trading-journal
git status --short
git rev-parse HEAD
df -h /
free -h
```

Proceed only with a clean tracked working tree. Make a consistent private backup
before updating (the ignored runtime files do not appear in normal git status):

```bash
mkdir -p /home/ubuntu/journal-backups
chmod 700 /home/ubuntu/journal-backups
pm2 stop trading-journal
mkdir -p server/snapshots
(umask 077; tar -czf "/home/ubuntu/journal-backups/journal-$(date +%F-%H%M%S).tgz" \
  -C /opt/trading-journal/server journal.db snapshots)
```

If backup fails, restart the journal and resolve the problem before proceeding.
A fresh installation without a database must first be started successfully.
Transfer backups off the instance and manage retention; the root disk is small.
The environment file should be backed up separately in private storage.

```bash
cd /opt/trading-journal
git pull --ff-only origin main
npm ci --prefix server
npm ci --prefix client
JOURNAL_BASE_PATH=/journal/ npm run build
npm test
node tests/portal.test.mjs
pm2 restart trading-journal --update-env
pm2 restart trading-workspace --update-env
pm2 save
```

Keep `.env`, `server/journal.db` and `server/snapshots/`. `npm ci` replaces
node_modules, which is why the journal is stopped first. If install/build/tests
fail, do not restart unverified output; resolve the failure or follow rollback.
Do not run the older `deploy/deploy.sh` for this shared-portal setup.
If only journal code changed, restarting `trading-workspace` is optional and can
be skipped to retain login sessions. Portal code or credential changes require it.

Use section 9 to verify. Press Ctrl+F5 for changed frontend assets. Nginx does not
need reloading unless its installed configuration was intentionally changed.

## 8. Update FNO Analyzer on EC2

Wait for active scanners/archive downloads to finish before stopping the service.
Restarting terminates those workers. Existing saved data remains in the data dir.
The original deployment used a root-owned checkout, so Git/pip commands use sudo.

```bash
cd /opt/fno-analyzer
sudo git status --short
sudo git rev-parse HEAD
df -h /
sudo systemctl stop fno-analyzer
```

Proceed with a clean tracked working tree. If desired, make a private consistent
runtime backup while the service is stopped:

```bash
sudo install -d -m 700 /var/backups/fno-analyzer
sudo sh -c 'umask 077; tar -czf "/var/backups/fno-analyzer/runtime-$(date +%F-%H%M%S).tgz" -C /var/lib fno-analyzer'
```

Then update and restart, stopping on any failure:

```bash
cd /opt/fno-analyzer
sudo git pull --ff-only origin main
sudo /opt/fno-analyzer/.venv/bin/pip install -r /opt/fno-analyzer/requirements.txt
sudo /opt/fno-analyzer/.venv/bin/python -m unittest discover -s tests
sudo systemctl restart fno-analyzer
sudo systemctl status fno-analyzer --no-pager
curl -f http://127.0.0.1:8001/api/health
curl -f http://127.0.0.1:8001/api/ready
```

Dependency installation can be skipped if requirements did not change. FNO serves
its frontend directly; it does not use the journal's npm build. Keep subpath-aware
frontend requests under `/fnoanalyzer/`. Refresh the browser with Ctrl+F5.

Do not reapply the FNO repository's older standalone Nginx snippet or restore its
pre-portal configuration: that would bypass the shared authentication. Likewise,
its old deployment guide's public health check now redirects anonymous users to
login. Test backend health directly and protected behaviour through Nginx.

Only when an update intentionally changes the systemd unit: review and merge its
changes into the installed unit, preserve external config/data settings, then run
`sudo systemctl daemon-reload` and restart FNO. Routine Python/static updates do
not require daemon-reload, an Nginx reload or a server reboot.

## 9. Health and access verification

```bash
pm2 list
sudo systemctl status fno-analyzer --no-pager
sudo nginx -t
curl -f http://127.0.0.1:5002/api/health
curl -s -o /dev/null -w 'portal: %{http_code}\n' http://127.0.0.1:5001/
curl -f http://127.0.0.1:8001/api/health
curl -f http://127.0.0.1:8001/api/ready

for path in / /journal/ /fnoanalyzer/; do
  curl -s -o /dev/null -w "$path -> %{http_code}\n" \
    -H 'Host: 52.66.251.235' "http://127.0.0.1$path"
done
```

Portal direct: 200. Anonymous Nginx routes: **200, 302, 302**, respectively.
Do not add `-L` when checking redirects. The portal accepts GET, not HEAD, so
`curl -I` produces 405 on its pages and is not a valid portal health check.
Readiness may report a provider/config problem even when FNO health is good.

In a browser: sign in, open each app, save/reopen a journal trade, test screenshot
upload, check FNO live data, then sign out. Direct protected API/image requests
must also redirect to login after logout. Backend health alone does not prove
that browser routing, provider credentials or authentication work.

## 10. Troubleshooting

```bash
pm2 logs trading-journal --lines 60 --nostream
pm2 logs trading-workspace --lines 60 --nostream
sudo journalctl -u fno-analyzer -n 80 --no-pager
sudo tail -n 60 /var/log/nginx/error.log
sudo nginx -T
sudo ss -ltnp
```

Inspect logs locally and redact sensitive information before sharing.

| Symptom | Check |
| --- | --- |
| Root/journal 500 and FNO 200 before login | Old Nginx config may still be active and pointing at deleted files; inspect nginx -T, install shared template, validate and reload |
| 502 Bad Gateway | Corresponding process stopped/crashed or proxy port mismatched |
| 500 on all protected routes | Portal/auth subrequest failure; check portal process and Nginx error log |
| 405 on curl -I for portal | HEAD unsupported; use the GET checks above |
| Login 403: invalid origin | Browser origin differs from PORTAL_ORIGIN; edit .env and restart portal |
| Login 403: session expired | Reload /login for a fresh cookie/CSRF token |
| Login 429 | Wait for the 15-minute attempt window to expire |
| Journal browser Basic-auth prompt after portal login | Check journal/portal credentials match and Nginx supplies the auth subrequest header |
| Assets/API fail after journal build | Rebuild with JOURNAL_BASE_PATH=/journal/ and refresh browser |
| FNO provider calls fail | Check token expiry, external config, service logs and /api/ready |
| npm command missing after OS Node upgrade | Ubuntu npm is packaged separately; see installation repair below |

### Node 20 to 22 installation repair recorded during this deployment

The machine previously used NodeSource Node 20. Ubuntu's `node-corepack` unpack
initially collided with `/usr/bin/corepack` owned by that package. Node 22 was
subsequently unpacked; completing installation resolved the transition:

```bash
sudo apt-get --fix-broken install \
  nodejs=22.22.1+dfsg+~cs22.19.15-1ubuntu1 node-corepack
sudo dpkg --configure -a
sudo apt-get install --no-install-recommends npm
hash -r
node --version
npm --version
sudo dpkg --audit
```

These commands document the observed incident, not a routine update step. The
exact version may no longer be available later. Diagnose the current apt log and
package policy before reusing them; do not force-overwrite package files.

## 11. Backups and rollback

Record the current Git commit before each update. Keep private backups of the
journal database/screenshots, FNO data, credential files and external config.
Copy important backups off EC2; files on the same root volume are not sufficient
protection against instance/disk loss. Do not copy an actively written SQLite DB
alone: stop its writer or use a consistent SQLite backup operation.

For code rollback, stop the affected app, ensure the tracked checkout is clean,
then check out the recorded known-good commit with `git switch --detach COMMIT`.
Reinstall the matching dependencies, rebuild the journal with its prefix if
applicable, and restart/verify. This intentionally leaves a detached HEAD; return
to `main` and pull when ready to update again. Do not blindly downgrade code after
a schema migration: restore a matching data backup if required by that release.
Data restoration must happen while the affected app is stopped; keep correct
ownership (`ubuntu` for journal runtime files, `fno:fno` for FNO runtime files).

For Nginx rollback, restore only a reviewed known-good **shared portal** config,
then `sudo nginx -t && sudo systemctl reload nginx`. The saved
`/etc/nginx/trading-journal.conf.before-portal` and any `before-fno` backups are
historical configs: they can refer to deleted paths or bypass authentication.

## 12. Network and HTTPS

The recorded configuration uses HTTP only. Restrict port 80 to your public IP
for initial testing. Public HTTP does not encrypt login credentials or sessions.
Configure HTTPS before broader access; when doing so, preserve routing/auth checks,
change PORTAL_ORIGIN to the exact HTTPS origin and restart the portal. It then
sets Secure session cookies. Retain TLS settings on future Nginx updates.

EC2 security group: SSH restricted to your administrative IP; HTTP/HTTPS only as
needed. Do not expose backend ports 5000, 5001, 5002 or 8001. Confirm PM2 startup
and FNO/Nginx enablement before relying on recovery after a reboot.

## 13. Previous journal and unrelated services

The old checkout was `/home/ubuntu/DATA/TRADING_JOURNALS/Prop-Journal`, served on
port 5000 under the PM2 name `trading-journal`. The user reported successful
removal before starting the replacement. The new journal intentionally reuses
that PM2 name but runs from `/opt/trading-journal` on 5002. Never repeat old
process-deletion commands now: they would stop the new deployment.

Old backup files outside that checkout were not inventoried in the supplied
follow-up output; do not assume every historical backup was deleted. Local old
journal deletion was blocked earlier and is not verified by EC2 completion.

The supplied ubuntu crontab contains an unrelated Medlea email automation job;
leave it unchanged. No journal backup cron job was shown, and root had no
crontab. The new deployment does not automatically schedule backups.

## 14. Move to another Linux machine

See [the migration guide](MIGRATION.md) for a consistent streamed transfer of journal records, profile settings, instruments, tags, screenshots, FNO data and configuration, including restoration and verification.
