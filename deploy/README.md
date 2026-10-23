# Remote deployment

Run this private single-owner journal with Docker, or Node.js 22+ behind Nginx. API and frontend URLs are relative; no hostname is hardcoded in the client.

## Docker (recommended)

Copy the source to the server:

```sh
cp .env.example .env
# Edit .env: choose JOURNAL_USER and a strong JOURNAL_PASSWORD.
docker compose up -d --build
```

The service binds to `127.0.0.1:5000`. The named `journal-data` volume persists SQLite and screenshots across rebuilds. Keep the volume when updating.

Nginx configuration, replacing the domain:

```nginx
server {
    listen 80;
    server_name journal.example.com;
    client_max_body_size 12m;
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable HTTPS with your certificate tooling before entering credentials publicly. Allow inbound HTTPS and restricted SSH; application port 5000 stays on loopback. The browser asks for the configured username/password.

Updates and health checks:

```sh
docker compose up -d --build
docker compose logs --tail=50 journal
curl http://127.0.0.1:5000/api/health
```

For a consistent backup, stop the application, archive the complete volume, then restart. Copy backups off the machine. Restore by stopping the service and replacing `journal.db` and `snapshots/` together before restart.

## Node / PM2 alternative

Keep `client/`, `server/`, `shared/`, root package files and `deploy/` together. Install dependencies on Linux rather than copying laptop `node_modules`.

```sh
npm install
npm run setup
npm run build
cp .env.example .env
# Set credentials in .env.
chmod 600 .env
NODE_ENV=production pm2 start server/dist/index.js --name trading-journal --node-args="--env-file=.env"
pm2 save
```

Run from the repository root. Configure Nginx as above and PM2 startup integration for your server account. The existing `deploy.sh` automates Ubuntu/PM2 setup and requires `.env` in its configured `APP_DIR`. Its optional daily backup briefly stops the app at 03:00 server time, archives the database and screenshots, then restarts it; backups have private permissions.

Without PM2:

```sh
NODE_ENV=production node --env-file=.env server/dist/index.js
```

Default persistent files: `server/journal.db` and `server/snapshots/`. Stop the process before copying for a consistent backup. Update your backup procedure when overriding paths. The old `trading.db` is not used.

Docker files are supplied for deployment preparation; verify the container build on the target machine before hosting.
