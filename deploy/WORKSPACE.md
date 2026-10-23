# EC2 shared login

Use Node 22+, Nginx and PM2. Install this checkout at /opt/trading-journal.
The portal uses 127.0.0.1:5001, the NEW journal port 5002, existing FNO port 8001.

1. Run npm ci and npm run setup in the checkout.
2. Build: JOURNAL_BASE_PATH=/journal/ npm run build
3. Create a mode-600 .env in the checkout with JOURNAL_USER, JOURNAL_PASSWORD,
   NODE_ENV=production and PORT=5002. Use strong credentials.
4. Start from the checkout root:
   pm2 start server/dist/index.js --name trading-journal --node-args="--env-file=.env"
   pm2 save
5. Create a second mode-600 portal.env with the same credentials plus
   PORTAL_ORIGIN=http://52.66.251.235 (no trailing slash).
   pm2 start deploy/portal.mjs --name trading-workspace --node-args="--env-file=portal.env"
   pm2 save
   Enable PM2 startup integration for your deployment account.
6. Inspect sudo nginx -T and current services before cutover. Replace the server
   block in /etc/nginx/conf.d/trading-journal.conf using workspace.nginx.conf.
   Preserve existing TLS settings. Remove old /api, /snapshots, /dashboard,
   root/static aliases and any other routes exposing the old journal.
7. Run sudo nginx -t && sudo systemctl reload nginx.
8. Visit the IP: sign in, open each app, test save/upload and FNO live data.
   Sign out: direct API/image URLs must redirect to login.

Use HTTPS before transmitting real credentials publicly. Set PORTAL_ORIGIN to
exactly the HTTPS origin once enabled and restart the portal. Secure cookies are
then enabled. For initial HTTP verification use an SSH tunnel or restrict inbound
access to your IP. Keep application ports 5000,5001,5002,8001 closed publicly in
EC2 security groups. The new journal uses server/journal.db and server/snapshots.
Do not run the older deploy.sh for this shared gateway configuration.

The portal has one owner account, 12-hour sessions, CSRF checks, logout and login
rate limiting. Restarting it signs everyone out. Nginx checks sessions for both
applications and supplies the existing journal Basic credentials internally.

## Previous journal removal

The user requested full removal. The user confirmed deletion locally and on EC2, including databases, screenshots and backups. Local deletion was blocked by automatic approval review. EC2 SSH was blocked by overly open key permissions. Do not delete the new checkout or FNO Analyzer.
Identify the old process and exact working directory with pm2 list/pm2 show,
systemd units and ss -ltnp. Locate its data, screenshots, backups, cron jobs and
any Docker volumes. Stop/disable only the old journal service and remove its PM2
entry, then pm2 save. After verifying cutover and confirming deletion scope,
remove the confirmed old checkout, database, screenshots, backup jobs, backups,
and stale configuration. Exact deletion commands depend on actual server paths.

This preparation has NOT been deployed to EC2.
