# Move both applications to another Linux machine

This procedure preserves journal trades, configurations, instruments, profile
customizations/templates, tags/categories and associations, screenshots, and FNO
server data. Custom browser watchlists are outside this migration's scope.

## What must be retained

| Item | Current location | Contents |
| --- | --- | --- |
| Complete journal database | /opt/trading-journal/server/journal.db | Trades and analysis, instruments, tags/categories, trade-tag links, screenshot metadata, saved profile templates and versions |
| Journal screenshot tree | /opt/trading-journal/server/snapshots/ | Actual image files; preserve relative directory/file names |
| Journal/portal environment | /opt/trading-journal/.env | Login credentials, origin, ports and any custom data paths |
| Journal code at deployed commit | /opt/trading-journal | Built-in profile definitions in shared/profiles.json, calculations and matching application schema |
| FNO runtime directory | /var/lib/fno-analyzer/ | OI history database, symbol map and other persistent server files |
| FNO credentials/config | /etc/fno-analyzer/ | Environment file and external JSON settings |
| FNO code at deployed commit | /opt/fno-analyzer | Matching Python and frontend version |
| FNO systemd unit | /etc/systemd/system/fno-analyzer.service | Service user, startup and allowed writable paths |
| Installed Nginx site | /etc/nginx/conf.d/trading-journal.conf | Routes, authentication checks and any TLS additions |

Confirm any DB_PATH, SNAPSHOTS_DIR, FNO_DATA_DIR or FNO_CONFIG overrides privately
before copying. Include the actual paths instead if they differ from this table.
CSV export is not a full journal backup: transfer the complete SQLite database.
Do not initialize a fresh database and manually re-enter settings.

## 1. Prepare before the disk becomes completely full

Maintain off-machine backups. If the volume is already full, stop the writers
first. Avoid updates/builds or creating a large tar file on that disk. A full disk
can cause failed writes or an inconsistent database, so verification is mandatory.
Streaming a backup off the machine requires no full-size local archive.

On the old machine, record both deployed revisions and service definitions:

```bash
git -C /opt/trading-journal rev-parse HEAD
sudo git -C /opt/fno-analyzer rev-parse HEAD
pm2 show trading-journal
pm2 show trading-workspace
sudo systemctl cat fno-analyzer
```

Save the two commit IDs privately on the destination. Check for uncommitted
tracked changes in both checkouts and preserve any intentional changes separately.
Install the same code revisions on the destination first. Upgrade versions only
after a successful migration, to separate data restoration from schema changes.

## 2. Stop writers for a consistent copy

Wait for FNO jobs to finish, then run on the old server as ubuntu:

```bash
pm2 stop trading-journal trading-workspace
sudo systemctl stop fno-analyzer
```

Do not restart these services until the copy is complete. For a final cutover,
keep the old instance stopped to avoid two diverging copies of your records.
A standalone SQLite database copied while writes are active can miss committed
WAL transactions. Transfer any existing SQLite sidecars with the database.
Never delete WAL files to make a backup smaller.

## 3. Stream a private archive onto the NEW Linux machine

Run the following from Bash on the destination, using your real SSH key path and
old host. It assumes the old ubuntu account has passwordless sudo, as is typical
on EC2. Confirm `ssh ... 'sudo -n true'` succeeds first. If it does not, arrange
SSH/privileged read access; do not pipe a sudo password into the archive stream.

```bash
mkdir -p "$HOME/trading-migration"
chmod 700 "$HOME/trading-migration"
cd "$HOME/trading-migration"
umask 077
set -o pipefail

ssh -i /path/to/ec2-key.pem ubuntu@52.66.251.235 \
  'sudo -n tar -czf - -C / --exclude=opt/trading-journal/server/node_modules --exclude=opt/trading-journal/server/dist opt/trading-journal/server opt/trading-journal/.env var/lib/fno-analyzer etc/fno-analyzer etc/systemd/system/fno-analyzer.service etc/nginx/conf.d/trading-journal.conf' \
  > trading-migration.tgz
```

The server directory is included in full except dependencies/build output, so
SQLite sidecars and every screenshot subdirectory are retained. The archive also
contains server source, which is harmless; use the pinned Git revision as the
code installation source. Check SSH/tar exit status immediately. On any nonzero
status, the archive is incomplete: do not restore or cut over.

```bash
tar -tzf trading-migration.tgz > archive-files.txt
sha256sum trading-migration.tgz > trading-migration.tgz.sha256
sha256sum -c trading-migration.tgz.sha256
mkdir restored
tar --no-same-owner -xzf trading-migration.tgz -C restored
```

The archive contains secrets and personal records. Keep it private, transfer over
SSH, and keep a protected copy off the destination too. The checksum verifies
later archive transfers/storage; database and record checks below verify content.
If existing TLS references /etc/letsencrypt or other certificate paths, migrate
those separately and securely or obtain certificates on the destination. The HTTP
configuration used during this deployment has no certificate directory.

## 4. Install matching applications on the destination

Install Git, Node 22+, npm, PM2, Nginx, Python 3.11+ with venv support, and rsync.
Clone the journal to /opt/trading-journal and FNO to /opt/fno-analyzer. Check out
each recorded commit (`git switch --detach COMMIT`). Build native dependencies
on the new Linux machine; do not transfer node_modules or the Python .venv.

Install journal dependencies using `npm ci --prefix server` and
`npm ci --prefix client`, then build with
`JOURNAL_BASE_PATH=/journal/ npm run build` from its root.
Create the FNO venv and install its requirements. Follow WORKSPACE.md for initial
service setup; do not start either application until data is restored.

Create the fno service user if absent:

```bash
id fno >/dev/null 2>&1 || sudo useradd --system --home /opt/fno-analyzer --shell /usr/sbin/nologin fno
```

The journal should be owned/run by the new deployment account (ubuntu in these
examples). If the destination uses another account, substitute that account in
ownership and PM2 startup commands. Do not run the apps as root.

## 5. Restore before the first application startup

Keep all destination application processes stopped. Run from
$HOME/trading-migration on the destination:

```bash
cd "$HOME/trading-migration"
sudo rsync -a restored/opt/trading-journal/server/ /opt/trading-journal/server/
sudo cp restored/opt/trading-journal/.env /opt/trading-journal/.env
sudo mkdir -p /var/lib/fno-analyzer /etc/fno-analyzer
sudo rsync -a restored/var/lib/fno-analyzer/ /var/lib/fno-analyzer/
sudo rsync -a restored/etc/fno-analyzer/ /etc/fno-analyzer/
sudo cp restored/etc/systemd/system/fno-analyzer.service /etc/systemd/system/fno-analyzer.service

sudo chown -R ubuntu:ubuntu /opt/trading-journal
sudo chmod 600 /opt/trading-journal/.env
sudo chown -R fno:fno /var/lib/fno-analyzer
sudo chown -R root:fno /etc/fno-analyzer
sudo chmod 750 /etc/fno-analyzer
sudo chmod 640 /etc/fno-analyzer/fno-analyzer.env
```

Use fresh destination data directories, with no pre-existing database or SQLite
sidecars. Do not merge two independently used journals or FNO databases using
file copying. rsync above preserves all transferred files without deleting any
other paths. Restoring the server source from the same revision does not remove
newly installed node_modules or dist, which were excluded from the archive.

Edit the restored journal .env: change PORTAL_ORIGIN to the new exact browser
origin, keeping the existing credentials and data settings. Review external FNO
config for host-specific paths. Keep the same directory layout to avoid breaking
image paths and systemd writable paths.

Restore/review the saved Nginx configuration, changing server_name to the new IP
or domain, and retaining protected routes and any TLS settings. Do not blindly
overwrite an unrelated destination server block. Keep all backend ports private.

## 6. Verify data BEFORE accepting new records

Install sqlite3 tooling on the destination. For each restored database, with apps
still stopped:

```bash
sqlite3 /opt/trading-journal/server/journal.db 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
sudo -u fno sqlite3 /var/lib/fno-analyzer/oi_history.sqlite3 'PRAGMA integrity_check;'
```

Integrity checks should return `ok`; journal foreign_key_check should return no
rows. Skip the FNO SQLite check only if no history database existed on the source.
If a check fails, preserve the original files and stop the migration; do not
replace them by starting a new empty database.

Compare these counts on OLD and NEW journal databases while writers are stopped:

```sql
SELECT 'trades', COUNT(*) FROM trades
UNION ALL SELECT 'instruments', COUNT(*) FROM instruments
UNION ALL SELECT 'tag_categories', COUNT(*) FROM tag_categories
UNION ALL SELECT 'tags', COUNT(*) FROM tags
UNION ALL SELECT 'trade_tags', COUNT(*) FROM trade_tags
UNION ALL SELECT 'trade_snapshots', COUNT(*) FROM trade_snapshots
UNION ALL SELECT 'profile_templates', COUNT(*) FROM profile_templates;
```

Use the SQLite CLI or Python sqlite3 if sqlite3 is not installed on the old host.
Also compare file checksums of journal.db, any SQLite sidecars, screenshots, FNO
runtime files and private configuration before opening databases on the destination.
A SQLite integrity-check connection can checkpoint sidecars, so byte comparisons
belong before that check. The source must remain stopped throughout comparison.
For FNO, compare its SQLite table list, per-table row counts and oldest/newest
saved dates on both sides. Matching checksums of every stopped-state runtime file
provide a stronger transfer check than counts alone.

Only then create the two PM2 processes as in WORKSPACE.md, run
`sudo systemctl daemon-reload`, enable/start FNO, validate/reload Nginx and perform
the documented health checks. Enable PM2 startup for the new deployment account
and run pm2 save. A PM2 dump from another host is not required.

In the browser verify:

- Older and recent trades, execution/analysis values and totals.
- Instruments, saved profile fields/templates, tag categories and tags.
- Existing trade-tag assignments and both old/new trade template behaviour.
- Screenshots on several old trades, then one new test upload.
- FNO historical dates/data and current provider connectivity.
- Login/logout and anonymous redirects on both applications.

Restored database counts plus these checks establish that records AND settings
survived; a successful empty dashboard or health check alone does not.

## 7. Cut over and keep a recovery copy

Point the domain/Elastic IP or browser bookmark at the new host. IP movement
depends on the hosting environment; a different ordinary Linux machine may need
a new IP/domain instead. Changing scheme/host requires matching PORTAL_ORIGIN and
Nginx server_name. Portal sessions are intentionally not migrated: sign in again.

Keep the old services stopped and retain the stopped-state backup until the new
machine's data and operation are confirmed. Do not write to both deployments.
Once new records exist, a rollback requires transferring that new data back;
restarting the stale old database alone would lose those later records.

Continue scheduled off-machine backups of the database, screenshots, FNO data and
configuration. This is what protects recovery if a full disk or disk failure makes
the original instance unbootable; cloning Git alone cannot recover runtime data.
