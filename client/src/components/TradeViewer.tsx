import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from 'lucide-react';
import { fetchTrade } from '../api';
import type { Trade } from '../types';
import { fmtIST, fmtPnl, fmtMoney, snapshotUrl } from '../utils/format';
import { profileNames } from './FrameworkFields';

interface Props { trade: Trade; position: number; count: number; onNavigate: (step: number) => void; onClose: () => void; onEdit: (id: number) => void; }

export default function TradeViewer({ trade, position, count, onNavigate, onClose, onEdit }: Props) {
  const [detail, setDetail] = useState<Trade | null>(null);
  const [error, setError] = useState('');
  const [imageIndex, setImageIndex] = useState(0);
  const [enlarged, setEnlarged] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const fullscreenActive = useRef(false);

  useEffect(() => {
    let active = true;
    setDetail(null); setError(''); setImageIndex(0);
    body.current?.scrollTo({ top: 0 });
    fetchTrade(trade.id).then(t => { if (active) setDetail(t); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [trade.id]);

  useEffect(() => {
    if (!root.current?.contains(document.activeElement)) closeButton.current?.focus();
  }, [detail]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; closeButton.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); if (document.fullscreenElement === root.current) void document.exitFullscreen(); };
  }, []);

  useEffect(() => {
    const changed = () => {
      if (document.fullscreenElement === root.current) fullscreenActive.current = true;
      else if (fullscreenActive.current) { fullscreenActive.current = false; setEnlarged(false); }
    };
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  async function restore() {
    if (document.fullscreenElement === root.current) await document.exitFullscreen();
    setEnlarged(false);
  }
  async function enlarge() {
    setEnlarged(true);
    try { await root.current?.requestFullscreen?.(); } catch { /* Use viewport enlargement if browser fullscreen is unavailable. */ }
  }

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (enlarged) void restore(); else onClose(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); if (count > 1) onNavigate(e.key === 'ArrowLeft' ? -1 : 1); }
      if (e.key === 'Tab') {
        const controls = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') || []).filter(el => el.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [enlarged, count, onNavigate, onClose]);

  const loaded = detail?.id === trade.id ? detail : null;
  const current = loaded || trade;
  const paths = loaded ? loaded.snapshots?.map(s => s.filePath) || [] : trade.snapshotPaths || [];
  const image = paths[imageIndex];
  const fields = current.framework?.fields || [];
  return <div ref={root} className={`trade-viewer-overlay ${enlarged ? 'is-enlarged' : ''}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="trade-viewer" role="dialog" aria-modal="true" aria-labelledby="trade-viewer-title">
      <header className="trade-viewer-header">
        <div><h3 id="trade-viewer-title">{current.instrumentName} · Trade #{current.id}</h3><small>{position + 1} / {count} trades · ← / → navigate · Esc {enlarged ? 'restore' : 'close'}</small></div>
        <div className="trade-viewer-actions">
          <button className="icon-btn" disabled={count < 2} aria-label="Previous trade" onClick={() => onNavigate(-1)}><ChevronLeft /></button>
          <button className="icon-btn" disabled={count < 2} aria-label="Next trade" onClick={() => onNavigate(1)}><ChevronRight /></button>
          {enlarged && <button className="icon-btn" aria-label="Restore viewer" onClick={() => void restore()}><Minimize /></button>}
          <button ref={closeButton} className="icon-btn" aria-label="Close trade viewer" onClick={onClose}><X /></button>
        </div>
      </header>
      <div ref={body} className="trade-viewer-body">
        {error && <p role="alert">Could not load trade details: {error}</p>}
        <div className="trade-viewer-image">
          {image ? <button className="trade-viewer-image-button" aria-label={enlarged ? 'Restore screenshot view' : 'Enlarge screenshot'} onClick={() => enlarged ? void restore() : void enlarge()}><img src={snapshotUrl(image)} alt={`${current.instrumentName} trade screenshot ${imageIndex + 1}`} /><span><Maximize size={16} /> {enlarged ? 'Click to restore' : 'Click for fullscreen'}</span></button> : <div className="empty-state">{!detail ? 'Loading screenshots…' : 'No screenshots for this trade'}</div>}
        </div>
        {paths.length > 1 && <div className="trade-viewer-thumbnails" aria-label="Trade screenshots">{paths.map((p, i) => <button key={p} aria-label={`Screenshot ${i + 1}`} aria-pressed={i === imageIndex} onClick={() => setImageIndex(i)}><img src={snapshotUrl(p)} alt={`Screenshot ${i + 1}`} /></button>)}</div>}
        <div className="trade-viewer-details" aria-busy={!detail && !error}>
          <div className="section-heading"><h4>Trade details</h4><button className="btn btn-sm" onClick={() => onEdit(current.id)}>Edit trade</button></div>
          <dl className="trade-detail-grid">{[
            ['Profile', profileNames[current.profile || 'prop']], ['Account', current.account || 'Personal'], ['Strategy', current.strategy || '—'],
            ['Asset / holding', `${current.assetType || current.contractType} / ${current.holdingStyle || '—'}`], ['Direction', current.direction], ['Status', current.status],
            ['Entry time (IST)', fmtIST(current.entryDateTime)], ['Exit time (IST)', fmtIST(current.exitDateTime)], ['Entry price', current.entryPrice], ['Exit price', current.exitPrice ?? '—'],
            ['Quantity', current.quantity], ['Stop / target', `${current.slPrice ?? '—'} / ${current.targetPrice ?? '—'}`], ['Gross P&L', fmtPnl(current.grossPnl)],
            ['Costs', fmtMoney(current.totalCosts ?? current.costs)], ['Net P&L', fmtPnl(current.pnl)], ['Planned risk', fmtMoney(current.plannedRisk)],
            ['R multiple', current.pnl != null && current.plannedRisk ? (current.pnl / current.plannedRisk).toFixed(2) + 'R' : '—'],
            ['Capital / margin', fmtMoney(current.capitalCommitted)], ['Realised P&L', fmtPnl(current.realisedPnl)], ['Unrealised P&L', fmtPnl(current.unrealisedPnl)]
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <h4>Tags</h4><div className="tags-grid">{current.tagNames?.length ? current.tagNames.map((name, i) => <span className="tag-pill" key={i}>{name}</span>) : <span className="text-muted">No tags</span>}</div>
          {current.framework && <><h4>Entry analysis</h4><dl className="trade-detail-grid">{fields.map(f => <div key={f.key}><dt>{f.label}</dt><dd>{current.framework?.analysis[f.key] ?? 'Not recorded'}</dd></div>)}</dl>
            <p>Observed: {fmtIST(current.framework.observedAt)} · Source: {current.framework.source || 'Not recorded'}</p>
            {current.framework.legs.length > 0 && <><h4>Legs</h4>{current.framework.legs.map((l, i) => <div className="trade-viewer-leg" key={i}><p>{l.side} {l.symbol} · {l.assetType} {l.optionType} {l.strike} · Expiry {l.expiry || '—'} · Qty {l.quantity} × {l.multiplier} · Entry {l.entryPrice} · Exit {l.exitPrice ?? 'Open'}</p>{l.executions?.map((fill, n) => <p key={n}>{fmtIST(fill.time)} · {fill.action} {fill.quantity} @ {fill.price} · Costs {fmtMoney(fill.costs)}</p>)}</div>)}</>}
            {[['Entry thesis', current.framework.thesis], ['Adjustments', current.framework.adjustments], ['Exit reason', current.framework.exitReason], ['Review', current.framework.review]].map(([label, value]) => value ? <div key={label}><h4>{label}</h4><p className="trade-viewer-notes">{value}</p></div> : null)}</>}
          {current.comments && <><h4>Comments</h4><p className="trade-viewer-notes">{current.comments}</p></>}
        </div>
      </div>
    </section>
  </div>;
}
