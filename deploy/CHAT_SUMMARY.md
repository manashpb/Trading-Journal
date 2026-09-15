# Chat Summary — EC2 Deployment of the Trading Journal

**Date:** 2026-09-15 · **Repo:** `E:\TRADING\FULL_TRADING_JOURNAL`

---

## 1. Ask
> "How do I deploy this on Amazon EC2 Ubuntu so I can access it from the web on any system, with the EC2 able to serve multiple different projects (including this one) based on the URL I type?"

## 2. App context (what we're deploying)
- **Frontend:** React 18 + TypeScript + Vite → builds to `client/dist/`
- **Backend:** Node + Express 4 (TypeScript) → `server/dist/`, listens on port **5000** (`process.env.PORT`)
- **Database:** SQLite via the native `sqlite3` module → single file `server/trading.db` (+ `server/snapshots/` for trade chart images)
- **Scripts:** `npm run setup` (install server+client), `npm run build` (tsc + vite), dev runs on 5173 → 5000

## 3. Key finding — required code fix
The frontend hardcoded `http://localhost:5000` in three places. From another machine `localhost` resolves to the *visitor's* machine, so the deployed app would break everywhere except the server itself.

**Fix applied and verified** (client builds; the built bundle contains no `localhost:5000`, and snapshot URLs are relative):
- `client/src/api/index.ts:3` → `BASE_URL = '/api'`
- `client/src/api/index.ts:100` → `SNAPSHOT_BASE_URL = ''`
- `client/src/utils/format.ts:81` → `snapshotUrl()` returns `/snapshots/<path>`
- `client/vite.config.ts` → dev proxy for `/api` and `/snapshots` → `http://localhost:5000` (keeps `npm run dev` working locally)

## 4. Architecture chosen (multi-project, URL-routed)
- **Nginx reverse proxy** on the EC2 box, one **server block (`server_name`) per project** → each proxies to its own backend port.
- Each project = **own subdomain/domain → own port → own pm2 process**.
- Project 1 (this journal) = port `5000`; subsequent projects get new ports (e.g. `6001`, `6002`).
- DNS A records per subdomain → the instance's **Elastic IP**; the hostname in the URL is what Nginx routes on.
- HTTPS via `certbot --nginx` (recommended, deferred until domains exist).
- Backend stays private: security group opens only 22/80/443; Nginx reaches backends on `127.0.0.1`.

**User decision:** *No domains yet* → IP-based access for now: Nginx `listen 80 default_server; server_name _;`, URL = `http://<elastic-ip>`. Domains can be added later without re-doing the setup (just swap `server_name` and A records).

## 5. Deliverables produced (this session)
| File | Purpose |
|---|---|
| `deploy/deploy.sh` | One-shot idempotent provisioning + deploy (system stack → code → build → pm2 → nginx → health check → backup cron). Config block at top: `REPO_URL`, `APP_DIR`, `APP_NAME`, `PORT`, `DOMAIN`, `NGINX_LISTEN`, `NODE_MAJOR`, `BACKUP_ENABLED`. |
| `deploy/README.md` | Full runbook: instance/SG/Elastic IP creation, deploy commands, multi-project table, DNS+HTTPS, maintenance, troubleshooting. |
| `deploy/CHAT_SUMMARY.md` | This file. |

## 6. Verified state
- ✅ Client builds: `npm run build` → `✓ built in 25.74s` (only a harmless chunk-size advisory)
- ✅ No `localhost`/`127.0.0.1` references left in `client/src`
- ✅ Built bundle checked — clean
- ⚠️ `deploy.sh` syntax check (`bash -n`) **not yet machine-run**: the sandbox safety classifier (`kr/minimax-m2.1`) was unavailable throughout the session; the file received a careful manual line-by-line review instead. **TODO: re-run `bash -n deploy/deploy.sh` when the classifier recovers.**

## 7. Open threads / next steps for the user
1. Re-run `bash -n deploy/deploy.sh` to formally confirm syntax (I'll do this at next opportunity; user can also run it in Git Bash).
2. Optionally `git init` a remote and push (repo currently has all-untracked files, no remote configured). `deploy/` should be committed (it is not gitignored).
3. Launch EC2 Ubuntu 24.04, attach Elastic IP, open only 22/80/443.
4. Run `deploy.sh` (IP mode), open `http://<elastic-ip>`.
5. First-run data import: copy local `server/trading.db` and `server/snapshots/` onto the server before using.
6. Later: buy a domain, add A records per subdomain, set each project's `DOMAIN`, run `certbot --nginx`.