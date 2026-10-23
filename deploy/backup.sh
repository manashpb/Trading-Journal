#!/usr/bin/env bash
set -euo pipefail
umask 077
app_dir="${1:?Pass the application directory}"
app_name="${2:?Pass the PM2 application name}"
backup_dir="${3:?Pass the backup directory}"
mkdir -p "$backup_dir"
pm2 stop "$app_name" >/dev/null
trap 'pm2 restart "$app_name" >/dev/null' EXIT
tar czf "$backup_dir/journal-$(date +%F-%H%M%S).tgz" -C "$app_dir/server" journal.db snapshots
