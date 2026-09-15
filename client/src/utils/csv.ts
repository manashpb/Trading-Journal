import type { Trade } from '../types';
import { fmtIST, istDateKey } from '../utils/format';

function esc(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function tradesToCsv(trades: Trade[]): string {
  const header = [
    'Trade ID', 'Instrument', 'Contract Type', 'Direction',
    'Entry DateTime (IST)', 'Entry Price', 'SL Price', 'Target Price', 'Quantity',
    'Exit DateTime (IST)', 'Exit Price', 'Status', 'PnL (₹)',
    'Tags', 'Comments', 'Snapshot Paths',
  ];

  const rows = trades.map(t => [
    t.id,
    t.instrumentName ?? '',
    t.contractType,
    t.direction,
    fmtIST(t.entryDateTime),
    t.entryPrice,
    t.slPrice ?? '',
    t.targetPrice ?? '',
    t.quantity,
    fmtIST(t.exitDateTime),
    t.exitPrice ?? '',
    t.status,
    t.pnl ?? '',
    (t.tagNames ?? []).join(';'),
    t.comments ?? '',
    (t.snapshotPaths ?? []).join(';'),
  ]);

  return [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
}

export function exportTradesCsv(trades: Trade[], filename?: string) {
  const csv = tradesToCsv(trades);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `trades_${istDateKey(new Date().toISOString())}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}