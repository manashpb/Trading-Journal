import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, LayoutGrid, List, ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';
import { fetchTrades, fetchTrade, fetchInstruments, fetchTagCategories, deleteTrade } from '../api';
import type { Instrument, TagCategory, Trade, TradeStatus, ContractType } from '../types';
import { fmtIST, fmtPnl, pnlClass, snapshotUrl } from '../utils/format';
import { exportTradesCsv } from '../utils/csv';
import TradeForm from '../components/TradeForm';

type ViewMode = 'table' | 'card';
type SortKey = 'entryDateTime' | 'instrumentName' | 'direction' | 'pnl' | 'status' | 'quantity';

export default function TradeLog() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [tagCategories, setTagCategories] = useState<TagCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('card');

  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterStatus, setFilterStatus] = useState<TradeStatus | ''>('');
  const [filterContract, setFilterContract] = useState<ContractType | ''>('');
  const [filterInstrument, setFilterInstrument] = useState<number | ''>('');
  const [filterTag, setFilterTag] = useState<number | ''>('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('entryDateTime');
  const [sortAsc, setSortAsc] = useState(false);

  // Card cursor for keyboard navigation
  const [cardCursor, setCardCursor] = useState<number>(0);

  // Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editTrade, setEditTrade] = useState<Trade | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchTrades(), fetchInstruments(), fetchTagCategories()])
      .then(([t, i, c]) => { setTrades(t); setInstruments(i); setTagCategories(c); })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Keep latest filtered list in a ref so the keyboard handler never goes stale
  const listRef = useRef<Trade[]>([]);

  // Keyboard navigation
  useEffect(() => {
    if (formOpen || view !== 'card') return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      const len = listRef.current.length;
      setCardCursor(c => {
        if (e.key === 'ArrowRight') return Math.min(c + 1, len - 1);
        if (e.key === 'ArrowLeft') return Math.max(c - 1, 0);
        if (e.key === 'ArrowDown') return Math.min(c + 3, len - 1);
        if (e.key === 'ArrowUp') return Math.max(c - 3, 0);
        return c;
      });
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [formOpen, view]);

  const allTags = useMemo(() => tagCategories.flatMap(c => c.tags), [tagCategories]);

  const filteredTrades = useMemo(() => {
    return trades
      .filter(t => {
        if (filterDateFrom && t.entryDateTime.slice(0, 10) < filterDateFrom) return false;
        if (filterDateTo && t.entryDateTime.slice(0, 10) > filterDateTo) return false;
        if (filterStatus && t.status !== filterStatus) return false;
        if (filterContract && t.contractType !== filterContract) return false;
        if (filterInstrument && t.instrumentId !== filterInstrument) return false;
        if (filterTag && !t.tags.includes(Number(filterTag))) return false;
        return true;
      })
      .sort((a, b) => {
        const av = sortVal(a, sortKey);
        const bv = sortVal(b, sortKey);
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return sortAsc ? cmp : -cmp;
      });
  }, [trades, filterDateFrom, filterDateTo, filterStatus, filterContract, filterInstrument, filterTag, sortKey, sortAsc]);

  // Keep latest filtered list in a ref so the keyboard handler never goes stale,
  // and clamp the card cursor when filters shrink the list.
  useEffect(() => {
    listRef.current = filteredTrades;
    if (cardCursor > 0 && cardCursor >= filteredTrades.length) setCardCursor(0);
  }, [filteredTrades, cardCursor]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  async function handleDelete(id: number) {
    if (!confirm('Delete this trade?')) return;
    try {
      await deleteTrade(id);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function openNew() { setEditTrade(null); setFormOpen(true); }
  async function openEdit(id: number) {
    try {
      const detail = await fetchTrade(id);
      setEditTrade(detail);
      setFormOpen(true);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Trade Log</h2>
          <div className="sub">{trades.length} total trades · {filteredTrades.length} in view · All times in IST</div>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> New Trade</button>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="form-field">
          <label>Search / Date From</label>
          <input type="date" className="input" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Date To</label>
          <input type="date" className="input" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Status</label>
          <select className="select" value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}>
            <option value="">All</option>
            <option value="Open">Open</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <div className="form-field">
          <label>Contract</label>
          <select className="select" value={filterContract} onChange={e => setFilterContract(e.target.value as any)}>
            <option value="">All</option>
            <option value="CFD">CFD</option>
            <option value="Futures">Futures</option>
          </select>
        </div>
        <div className="form-field">
          <label>Instrument</label>
          <select className="select" value={filterInstrument} onChange={e => setFilterInstrument(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All</option>
            {instruments.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label>Tag</label>
          <select className="select" value={filterTag} onChange={e => setFilterTag(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All</option>
            {allTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="group">
          <div className="view-toggle">
            <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>
              <List size={14} /> Table
            </button>
            <button className={view === 'card' ? 'active' : ''} onClick={() => setView('card')}>
              <LayoutGrid size={14} /> Cards
            </button>
          </div>
        </div>
        <div className="group">
          {view === 'card' && filteredTrades.length > 0 && (
            <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 8 }}>
              ← → ↑ ↓ to navigate · {cardCursor + 1}/{filteredTrades.length}
            </span>
          )}
          <button className="btn" onClick={() => exportTradesCsv(filteredTrades)} disabled={filteredTrades.length === 0}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Table view */}
      {view === 'table' && (
        <div className="card table-wrap">
          {loading ? (
            <div className="loading"><div className="spinner" />Loading trades...</div>
          ) : filteredTrades.length === 0 ? (
            <div className="empty-state"><p>No trades match the current filters</p></div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <SortCol label="Date" sortKey="entryDateTime" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <SortCol label="Instrument" sortKey="instrumentName" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <SortCol label="Direction" sortKey="direction" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <SortCol label="Qty" sortKey="quantity" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <th>Entry</th><th>SL</th><th>Target</th><th>Exit</th>
                  <SortCol label="PnL" sortKey="pnl" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <SortCol label="Status" sortKey="status" current={sortKey} asc={sortAsc} onClick={toggleSort} />
                  <th>Tags</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map(t => (
                  <tr key={t.id} onDoubleClick={() => openEdit(t.id)}>
                    <td style={{ fontSize: 12 }}>{fmtIST(t.entryDateTime)}</td>
                    <td>{t.instrumentName}</td>
                    <td><span className={`chip ${t.direction === 'Long' ? 'chip-long' : 'chip-short'}`}>{t.direction}</span></td>
                    <td>{t.quantity}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{t.entryPrice}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: '#f87171' }}>{t.slPrice ?? '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums', color: '#34d399' }}>{t.targetPrice ?? '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{t.exitPrice ?? '—'}</td>
                    <td className={pnlClass(t.pnl)} style={{ fontWeight: 600 }}>{fmtPnl(t.pnl)}</td>
                    <td><span className={`chip ${t.status === 'Open' ? 'chip-open' : 'chip-closed'}`}>{t.status}</span></td>
                    <td style={{ whiteSpace: 'normal' }}>
                      {(t.tagNames ?? []).length > 0 ? (
                        <div className="tags-grid" style={{ gap: 4 }}>
                          {t.tagNames!.map((name, i) => (
                            <span key={i} className="tag-pill" style={{ padding: '2px 7px', fontSize: 11 }}>{name}</span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: '#64748b' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions" style={{ display: 'flex', gap: 4 }}>
                        <button className="icon-btn" title="Edit" onClick={() => openEdit(t.id)}><Pencil size={13} /></button>
                        <button className="icon-btn" title="Delete" onClick={() => handleDelete(t.id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Card view */}
      {view === 'card' && (
        <>
          {loading ? (
            <div className="loading"><div className="spinner" />Loading trades...</div>
          ) : filteredTrades.length === 0 ? (
            <div className="empty-state"><p>No trades match the current filters</p></div>
          ) : (
            <>
              <div className="trade-cards">
                {filteredTrades.map((t, i) => {
                  const thumb = t.firstSnapshot ?? null;
                  const isActive = i === cardCursor;
                  return (
                    <div key={t.id}
                      className={`trade-card ${isActive ? 'active' : ''}`}
                      onClick={() => { setCardCursor(i); openEdit(t.id); }}
                      ref={el => { if (isActive) el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }}
                    >
                      <div className="trade-card-thumb">
                        {thumb ? (
                          <img src={snapshotUrl(thumb)} alt="trade snapshot" />
                        ) : (
                          <span className="thumb-empty">No snapshot</span>
                        )}
                        {(t.snapshotCount ?? 0) > 1 && (
                          <span className="thumb-count">{t.snapshotCount}</span>
                        )}
                      </div>
                      <div className="trade-card-body">
                        <div className="trade-card-top">
                          <span className="trade-card-name">{t.instrumentName}</span>
                          <div className="badges">
                            <span className={`chip ${t.direction === 'Long' ? 'chip-long' : 'chip-short'}`}>{t.direction}</span>
                            <span className={`chip ${t.status === 'Open' ? 'chip-open' : 'chip-closed'}`}>{t.status}</span>
                          </div>
                        </div>
                        <div className="trade-card-meta">
                          <span>{fmtIST(t.entryDateTime)}</span>
                          <span>Qty {t.quantity} · {t.contractType}</span>
                        </div>
                        {(t.tagNames?.length ?? 0) > 0 && (
                          <div className="tags-grid" style={{ gap: 4 }}>
                            {t.tagNames!.map((name, i) => (
                              <span key={i} className="tag-pill" style={{ padding: '2px 7px', fontSize: 11 }}>{name}</span>
                            ))}
                          </div>
                        )}
                        <div className={`trade-card-pnl ${pnlClass(t.pnl)}`}>
                          {fmtPnl(t.pnl)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Keyboard nav buttons for mobile */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '16px 0' }}>
                <button className="btn" disabled={cardCursor <= 0} onClick={() => setCardCursor(c => Math.max(0, c - 1))}>
                  <ChevronLeft size={16} /> Prev
                </button>
                <button className="btn" disabled={cardCursor >= filteredTrades.length - 1} onClick={() => setCardCursor(c => Math.min(filteredTrades.length - 1, c + 1))}>
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* Trade form modal */}
      <TradeForm open={formOpen} trade={editTrade} onClose={() => setFormOpen(false)} onSaved={load} />
    </div>
  );
}

/* ── Sort column header ────────────────────────────────── */

function SortCol({ label, sortKey: key, current, asc, onClick }: {
  label: string; sortKey: SortKey; current: SortKey; asc: boolean; onClick: (k: SortKey) => void;
}) {
  return (
    <th onClick={() => onClick(key)} style={{ cursor: 'pointer' }}>
      {label}{' '}
      {current === key && <span className="sort-arrow">{asc ? '▲' : '▼'}</span>}
    </th>
  );
}

function sortVal(t: Trade, key: SortKey): string | number {
  switch (key) {
    case 'entryDateTime': return t.entryDateTime;
    case 'instrumentName': return t.instrumentName ?? '';
    case 'direction': return t.direction;
    case 'pnl': return t.pnl ?? -Infinity;
    case 'status': return t.status;
    case 'quantity': return t.quantity;
    default: return 0;
  }
}