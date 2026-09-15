import type { Trade } from '../types';

export const IST_TZ = 'Asia/Kolkata';

const istFormatter = new Intl.DateTimeFormat('en-IN', {
  year: 'numeric', month: 'short', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
  timeZone: IST_TZ,
});

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  year: 'numeric', month: 'short', day: '2-digit',
  timeZone: IST_TZ,
});

const dateOnlyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Format a datetime string to IST display string. */
export function fmtIST(dt: string | null | undefined): string {
  if (!dt) return '—';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  return istFormatter.format(d);
}

export function fmtDate(dt: string | null | undefined): string {
  if (!dt) return '—';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  return dateFormatter.format(d);
}

/** YYYY-MM-DD in IST (for calendar / date keys). */
export function istDateKey(dt: string | null | undefined): string {
  if (!dt) return '—';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt.slice(0, 10);
  return dateOnlyFormatter.format(d);
}

export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const abs = Math.abs(v);
  return `${v < 0 ? '-' : ''}₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPnl(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const s = fmtMoney(v);
  return v > 0 ? `+${s}` : s;
}

export function pnlClass(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return 'text-muted';
  return v > 0 ? 'text-up' : 'text-down';
}

export function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Client-side PnL calc using the instrument point value (mirrors server). */
export function calcPnl(trade: Pick<Trade, 'direction' | 'entryPrice' | 'exitPrice' | 'quantity' | 'status'>, pointValue: number | undefined): number | null {
  if (!pointValue || trade.status !== 'Closed' || trade.exitPrice == null || trade.entryPrice == null) return null;
  const signed = trade.direction === 'Long' ? trade.exitPrice - trade.entryPrice : trade.entryPrice - trade.exitPrice;
  return Math.round(signed * trade.quantity * pointValue * 100) / 100;
}

/** Local datetime-local input value from a stored IST string, honoring IST. */
export function toLocalInputValue(dt: string | null | undefined): string {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  const ist = new Date(d.toLocaleString('en-US', { timeZone: IST_TZ }));
  return `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}T${pad(ist.getHours())}:${pad(ist.getMinutes())}`;
}

/** Snapshot URL for display (relative to the app origin). */
export function snapshotUrl(relPath: string): string {
  return `/snapshots/${relPath.replace(/\\/g, '/')}`;
}

export function downloadFile(content: BlobPart, filename: string, mime = 'application/octet-stream') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}