import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { fetchTrades } from '../api';
import type { Trade } from '../types';
import { fmtMoney, fmtPnl, fmtIST, istDateKey, pnlClass } from '../utils/format';

const UP = '#34d399';
const DOWN = '#f87171';
const MUTED = '#94a3b8';
const PRIMARY = '#22d3ee';

interface DayStat {
  date: string;
  pnl: number;
  wins: number;
  losses: number;
  hasTrade: boolean;
}

export default function Dashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrades()
      .then(setTrades)
      .catch((e) => toast.error(`Failed to load dashboard: ${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => computeStats(trades), [trades]);
  const equityData = useMemo(() => buildEquityCurve(trades), [trades]);
  const calendarDays = useMemo(() => buildCalendar(trades), [trades]);
  const byInstrument = useMemo(() => buildByInstrument(trades), [trades]);
  const monthly = useMemo(() => buildMonthly(trades), [trades]);
  const recent = useMemo(() => [...trades].sort((a, b) => b.entryDateTime.localeCompare(a.entryDateTime)).slice(0, 8), [trades]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        Loading dashboard...
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <div className="sub">Performance overview — all times in IST</div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="stats-grid">
        <StatTile label="Total Trades" value={String(stats.total)} hint={`${stats.open} open`} />
        <StatTile label="Net PnL" value={fmtMoney(stats.netPnl)} valueClass={pnlClass(stats.netPnl)} hint={`${stats.wins}W / ${stats.losses}L`} />
        <StatTile label="Win Rate" value={`${stats.winRate}%`} />
        <StatTile label="Profit Factor" value={stats.profitFactor} hint="gross win / gross loss" />
        <StatTile label="Avg Win" value={fmtMoney(stats.avgWin)} valueClass="text-up" />
        <StatTile label="Avg Loss" value={fmtMoney(stats.avgLoss)} valueClass="text-down" />
        <StatTile label="Best Day" value={fmtMoney(stats.bestDay)} valueClass={pnlClass(stats.bestDay)} />
        <StatTile label="Worst Day" value={fmtMoney(stats.worstDay)} valueClass={pnlClass(stats.worstDay)} />
      </div>

      <div className="chart-row">
        {/* Equity curve */}
        <div className="card chart-full">
          <div className="card-title">Equity Curve</div>
          {equityData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={equityData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} width={70}
                  tickFormatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="equity" name="Equity" stroke={PRIMARY} strokeWidth={2} fill="url(#eqGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="chart-row">
        {/* PnL by instrument */}
        <div className="card">
          <div className="card-title">PnL by Instrument</div>
          {byInstrument.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byInstrument} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fill: MUTED, fontSize: 12 }} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="pnl" name="PnL" radius={[0, 4, 4, 0]}>
                  {byInstrument.map((d, i) => (
                    <Cell key={i} fill={d.pnl >= 0 ? UP : DOWN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Monthly PnL */}
        <div className="card">
          <div className="card-title">Monthly PnL</div>
          {monthly.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} tickFormatter={(v) => `₹${v}`} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="pnl" name="PnL" radius={[4, 4, 0, 0]}>
                  {monthly.map((d, i) => (
                    <Cell key={i} fill={d.pnl >= 0 ? UP : DOWN} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="chart-row">
        {/* Win/Loss pie for closed trades */}
        <div className="card">
          <div className="card-title">Closed Trade Outcomes</div>
          {trades.filter(t => t.status === 'Closed').length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={stats.outcomeData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={80} innerRadius={48} paddingAngle={3}>
                  {stats.outcomeData.map((d, i) => (
                    <Cell key={i} fill={d.name === 'Wins' ? UP : d.name === 'Losses' ? DOWN : MUTED} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTip />} />
                <Legend formatter={(v) => <span style={{ color: MUTED, fontSize: 12 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent trades */}
        <div className="card">
          <div className="card-title">Recent Trades</div>
          {recent.length === 0 ? <Empty text="No trades yet" /> : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th><th>Instrument</th><th>Direction</th><th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontSize: 12 }}>{fmtIST(t.entryDateTime)}</td>
                    <td style={{ fontSize: 12 }}>{t.instrumentName}</td>
                    <td><span className={`chip ${t.direction === 'Long' ? 'chip-long' : 'chip-short'}`}>{t.direction}</span></td>
                    <td style={{ fontSize: 12 }} className={pnlClass(t.pnl)}>{fmtPnl(t.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Day-wise PnL calendar */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Day-wise PnL Calendar (IST)</div>
        {calendarDays.length === 0 ? <Empty text="No closed trades to chart" /> : (
          <>
            <CalendarLegend />
            <div className="calendar-heatmap">
              {calendarDays.flatMap(m => m.weeks).map((week, i) => (
                <div key={i} style={{ display: 'contents' }}>
                  {week.map(day => {
                    if (!day) return <div key={`e${i}`} style={{ minHeight: 32 }} />;
                    const cls = day.pnl > 0 ? 'day-won' : day.pnl < 0 ? 'day-lost' : day.pnl === 0 && day.hasTrade ? 'day-zero' : 'day-0';
                    return (
                      <div key={day.date} className={`calendar-cell ${cls}`}
                        title={day.hasTrade ? `${fmtMoney(day.pnl)} (W:${day.wins} L:${day.losses})` : ''}
                      >
                        {day.dayNum}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Sub components ────────────────────────────────────── */

function StatTile({ label, value, hint, valueClass }: { label: string; value: string; hint?: string; valueClass?: string }) {
  return (
    <div className="stat-tile">
      <div className="label">{label}</div>
      <div className={`value ${valueClass ?? ''}`}>{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function Empty({ text = 'No data yet' }: { text?: string }) {
  return <div className="empty-state"><p>{text}</p></div>;
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0b1220', border: '1px solid #334155', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#f1f5f9' }}>
      <div>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {typeof p.value === 'number' ? fmtMoney(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}

function CalendarLegend() {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
      <LegendDot cls="day-won" label="Winning day" />
      <LegendDot cls="day-lost" label="Losing day" />
      <LegendDot cls="day-zero" label="Break-even / no trade" />
      <LegendDot cls="day-0" label="No session" />
    </div>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
      <span className={`calendar-cell ${cls}`} style={{ width: 14, height: 14, minHeight: 14 }} /> {label}
    </span>
  );
}

/* ── Computation helpers ───────────────────────────────── */

function computeStats(trades: Trade[]) {
  const closed = trades.filter(t => t.status === 'Closed');
  const wins = closed.filter(t => (t.pnl ?? 0) > 0);
  const losses = closed.filter(t => (t.pnl ?? 0) < 0);
  const grossWin = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const netPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);

  const byDay = new Map<string, { pnl: number }>();
  for (const t of closed) {
    const key = istDateKey(t.exitDateTime);
    byDay.set(key, { pnl: (byDay.get(key)?.pnl ?? 0) + (t.pnl ?? 0) });
  }
  const dayValues = [...byDay.values()].map(d => d.pnl);

  const winRate = closed.length ? Math.round((wins.length / closed.length) * 100) : 0;

  return {
    total: trades.length,
    open: trades.filter(t => t.status === 'Open').length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    netPnl,
    winRate,
    profitFactor: grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : grossWin > 0 ? '∞' : '—',
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    bestDay: dayValues.length ? Math.max(...dayValues) : 0,
    worstDay: dayValues.length ? Math.min(...dayValues) : 0,
    outcomeData: [
      { name: 'Wins', value: wins.length },
      { name: 'Losses', value: losses.length },
      { name: 'Break-even', value: closed.filter(t => t.pnl === 0).length },
    ].filter(d => d.value > 0),
  };
}

function buildEquityCurve(trades: Trade[]) {
  const sorted = [...trades].sort((a, b) => a.entryDateTime.localeCompare(b.entryDateTime));
  let equity = 0;
  return sorted.map((t, i) => {
    equity += t.pnl ?? 0;
    return { label: `#${i + 1}`, date: fmtIST(t.entryDateTime), equity: Math.round(equity * 100) / 100 };
  });
}

function buildCalendar(trades: Trade[]) {
  const closed = trades.filter(t => t.status === 'Closed' && t.exitDateTime);
  if (!closed.length) return [];

  const dayMap = new Map<string, DayStat>();
  for (const t of closed) {
    const key = istDateKey(t.exitDateTime);
    const cur = dayMap.get(key) ?? { date: key, pnl: 0, wins: 0, losses: 0, hasTrade: true };
    cur.pnl += t.pnl ?? 0;
    if ((t.pnl ?? 0) > 0) cur.wins++; else if ((t.pnl ?? 0) < 0) cur.losses++;
    dayMap.set(key, cur);
  }

  // Sort trade dates, group into months
  const dates = [...dayMap.keys()].sort();
  const months: { label: string; weeks: (DayCell | null)[][] }[] = [];
  for (const d of dates) {
    const mon = d.slice(0, 7);
    let m = months.find(x => x.label === mon);
    if (!m) { m = { label: mon, weeks: [[]] }; months.push(m); }
    const day = new Date(d + 'T00:00:00Z');
    const dayNum = Number(d.slice(8, 10));
    // Start IST week on Sunday
    let dow = day.getUTCDay();
    let week = m.weeks[m.weeks.length - 1];
    if (week.length === 7) { week = []; m.weeks.push(week); }
    while (week.length < dow) week.push(null);
    week.push({ date: d, dayNum, ...dayMap.get(d)! });
  }
  return months.map(m => ({ ...m, weeks: m.weeks.map(w => { while (w.length < 7) w.push(null); return w; }) }));
}

interface DayCell extends DayStat { dayNum: number }

function buildByInstrument(trades: Trade[]) {
  const map = new Map<string, number>();
  for (const t of trades) {
    const name = t.instrumentName ?? 'Unknown';
    map.set(name, (map.get(name) ?? 0) + (t.pnl ?? 0));
  }
  return [...map.entries()].map(([name, pnl]) => ({ name, pnl: Math.round(pnl * 100) / 100 }))
    .sort((a, b) => b.pnl - a.pnl);
}

function buildMonthly(trades: Trade[]) {
  const map = new Map<string, number>();
  for (const t of trades) {
    if (t.pnl == null) continue;
    const key = istDateKey(t.exitDateTime).slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + t.pnl);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, pnl]) => ({ label: key, pnl: Math.round(pnl * 100) / 100 }));
}