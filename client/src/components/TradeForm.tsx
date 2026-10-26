import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Upload, Eye } from 'lucide-react';
import type { Instrument, Snapshot, TagCategory, Trade } from '../types';
import { fetchInstruments, fetchTagCategories, createTrade, updateTrade, uploadSnapshot, deleteSnapshot } from '../api';
import { calcPnl, fmtPnl, snapshotUrl, toLocalInputValue, istDateKey, pnlClass } from '../utils/format';

import { calculateStrategy } from '../../../shared/calculations.js';
import { FrameworkFields, emptyFramework } from './FrameworkFields';
import TextTradeEntry from './TextTradeEntry';

interface Props {
  open: boolean;
  trade: Trade | null;         // existing trade to edit, else null
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  instrumentId: number | '';
  direction: 'Long' | 'Short';
  contractType: 'CFD' | 'Futures' | 'Option' | 'Equity';
  entryDateTime: string;
  entryPrice: string;
  slPrice: string;
  targetPrice: string;
  quantity: string;
  exitDateTime: string;
  exitPrice: string;
  status: 'Open' | 'Closed';
  comments: string;
  tags: number[];
}

const emptyForm = (): FormState => ({
  instrumentId: '',
  direction: 'Long',
  contractType: 'CFD',
  entryDateTime: '',
  entryPrice: '',
  slPrice: '',
  targetPrice: '',
  quantity: '',
  exitDateTime: '',
  exitPrice: '',
  status: 'Open',
  comments: '',
  tags: [],
});

export default function TradeForm({ open, trade, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<'form' | 'text'>('form');
  const [textDraft, setTextDraft] = useState('');
  const [textReady, setTextReady] = useState(false);
  const [textLoadError, setTextLoadError] = useState('');
  const [extra, setExtra] = useState<Partial<Trade>>({ profile:'prop', holdingStyle:'Intraday', assetType:'CFD', account:'Personal', costs:0, framework:emptyFramework() });
  const [form, setForm] = useState<FormState>(emptyForm());
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode('form');
    setTextReady(false);
    setTextLoadError('');
    setExtra(trade ? { profile:trade.profile || 'prop', holdingStyle:trade.holdingStyle || 'Intraday', assetType:trade.assetType || trade.contractType, account:trade.account || 'Personal', strategy:trade.strategy || '', costs:trade.costs || 0, plannedRisk:trade.plannedRisk, capitalCommitted:trade.capitalCommitted, multiplier:trade.multiplier, framework:trade.framework || emptyFramework() } : { profile:'prop', holdingStyle:'Intraday', assetType:'CFD', account:'Personal', costs:0, framework:emptyFramework() });
    setForm(trade ? formFromTrade(trade) : emptyForm());
    setSnapshots(trade?.snapshots ?? []);
    let active = true;
    Promise.all([fetchInstruments(), fetchTagCategories()]).then(([items, tags]) => {
      if (!active) return;
      setInstruments(items); setCategories(tags); setTextReady(true);
    }).catch(e => { if (active) { toast.error(e.message); setTextLoadError(e.message); } });
    return () => { active = false; };
  }, [open, trade]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const legs = extra.framework?.legs || [];
  const selectedInstrument = instruments.find(i => i.id === form.instrumentId);
  const singlePnl = selectedInstrument ? calcPnl(
    { direction: form.direction, entryPrice: Number(form.entryPrice) || 0, exitPrice: legs.length ? null : form.exitPrice ? Number(form.exitPrice) : null, quantity: Number(form.quantity) || 0, status: form.status },
    extra.multiplier ?? selectedInstrument.pointValue
  ) : null;
  let strategyResult = null;
  try { strategyResult = legs.length ? calculateStrategy(legs, extra.costs || 0) : null; } catch {}
  const pnl = legs.length ? (strategyResult ? strategyResult.netRealised : null) : singlePnl == null ? null : singlePnl - (extra.costs || 0);
  const overnight = extra.profile === 'options_scalping' && form.exitDateTime && form.entryDateTime.slice(0,10) !== form.exitDateTime.slice(0,10);

  // Clipboard paste handler
  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (!open) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.type.startsWith('image/')) continue;
      const blob = item.getAsFile();
      if (blob) {
        e.preventDefault();
        doUpload(blob);
        break;
      }
    }
  }, [open, snapshots.length, form.entryDateTime, form.instrumentId]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  async function doUpload(file: Blob | File) {
    if (!trade?.id) {
      toast.error('Save the trade first, then add snapshots');
      return;
    }
    setSaving(true);
    try {
      const { id, filePath } = await uploadSnapshot(trade.id, file, {
        name: trade.instrumentName,
        entry: istDateKey(trade.entryDateTime),
      });
      setSnapshots(s => [...s, { id, tradeId: trade.id, filePath, createdAt: new Date().toISOString() }]);
      toast.success('Snapshot added');
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function removeSnapshot(id: number) {
    if (!confirm('Delete this snapshot?')) return;
    try {
      await deleteSnapshot(id);
      setSnapshots(s => s.filter(x => x.id !== id));
      toast.success('Snapshot deleted');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || mode === 'text') return;
    if (!form.instrumentId) return toast.error('Please select an instrument');
    if (!form.entryDateTime) return toast.error('Entry date/time is required');
    if (!legs.length && (!form.entryPrice || isNaN(Number(form.entryPrice)))) return toast.error('Entry price is required');
    if (!legs.length && (!form.quantity || isNaN(Number(form.quantity)))) return toast.error('Quantity is required');

    const payload = {
      ...extra,
      instrumentId: Number(form.instrumentId),
      direction: form.direction,
      contractType: (extra.assetType || form.contractType) as Trade['contractType'],
      entryDateTime: new Date(form.entryDateTime + '+05:30').toISOString(),
      entryPrice: legs.length ? legs[0].entryPrice : Number(form.entryPrice),
      slPrice: form.slPrice ? Number(form.slPrice) : null,
      targetPrice: form.targetPrice ? Number(form.targetPrice) : null,
      quantity: legs.length ? 1 : Number(form.quantity),
      exitDateTime: form.exitDateTime ? new Date(form.exitDateTime + '+05:30').toISOString() : null,
      exitPrice: form.exitPrice ? Number(form.exitPrice) : null,
      status: form.status,
      comments: form.comments.trim() || null,
      tags: form.tags,
    };

    setSaving(true);
    try {
      if (trade?.id) await updateTrade(trade.id, payload);
      else await createTrade(payload);
      toast.success(trade ? 'Trade updated' : 'Trade added');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <h3>{trade ? `Edit Trade #${trade.id}` : 'Add New Trade'}</h3>
          <button className="icon-btn" onClick={onClose} disabled={saving}><X size={16} /></button>
        </div>

        {!trade && <div className="trade-entry-tabs" role="tablist" aria-label="Trade entry method">
          <button id="trade-form-tab" type="button" role="tab" aria-selected={mode === 'form'} aria-controls="trade-form-panel" className={`btn ${mode === 'form' ? 'btn-primary' : ''}`} disabled={saving} onClick={() => setMode('form')}>Form</button>
          <button id="trade-text-tab" type="button" role="tab" aria-selected={mode === 'text'} aria-controls="trade-text-panel" className={`btn ${mode === 'text' ? 'btn-primary' : ''}`} disabled={saving} onClick={() => setMode('text')}>Text</button>
        </div>}
        {!trade && <div id="trade-text-panel" role="tabpanel" aria-labelledby="trade-text-tab" hidden={mode !== 'text'} className="text-trade-panel">
          <TextTradeEntry instruments={instruments} categories={categories} ready={textReady} loadError={textLoadError} draft={textDraft} onDraft={setTextDraft} saving={saving} onSaving={setSaving} onSaved={onSaved} onClose={onClose} />
        </div>}

        <form id="trade-form-panel" role="tabpanel" aria-labelledby={!trade ? 'trade-form-tab' : undefined} hidden={!trade && mode !== 'form'} onSubmit={handleSubmit}>
          <div className="modal-body">
            <FrameworkFields value={extra} onChange={setExtra} />
            {overnight && <p role="alert" className="rule-warning">Rule violation: this options scalp was held overnight.</p>}
            <h4>Trade summary / underlying</h4>
            {extra.profile === 'options_scalping' && <div className="form-grid">
              <div className="form-field"><label htmlFor="scalp-option-type">Option type</label><select id="scalp-option-type" className="select" value={extra.framework?.optionType || ''} onChange={e => setExtra(v => ({ ...v, framework: { ...(v.framework || emptyFramework()), optionType: e.target.value as 'CE' | 'PE' | '' } }))}><option value="">— Select —</option><option value="CE">CE</option><option value="PE">PE</option></select></div>
              <div className="form-field"><label htmlFor="scalp-strike">Strike</label><input id="scalp-strike" type="number" min="0.01" step="any" className="input" value={extra.framework?.strike ?? ''} onChange={e => setExtra(v => ({ ...v, framework: { ...(v.framework || emptyFramework()), strike: e.target.value === '' ? null : Number(e.target.value) } }))} /></div>
              <div className="form-field"><label htmlFor="scalp-delta">Strike delta</label><input id="scalp-delta" type="number" min="-1" max="1" step="any" className="input" value={extra.framework?.delta ?? ''} onChange={e => setExtra(v => ({ ...v, framework: { ...(v.framework || emptyFramework()), delta: e.target.value === '' ? null : Number(e.target.value) } }))} /></div>
            </div>}
            <div className="form-grid">
              <div className="form-field">
                <label>Instrument <span className="req">*</span></label>
                <select className="select" value={form.instrumentId} onChange={e => { set('instrumentId', Number(e.target.value)); setExtra(v => ({ ...v, multiplier: undefined })); }}>
                  <option value="">— Select —</option>
                  {instruments.map(i => <option key={i.id} value={i.id}>{i.name} ({i.type})</option>)}
                </select>
              </div>

              <div className="form-field">
                <label>Position <span className="req">*</span></label>
                <select className="select" value={form.direction} onChange={e => set('direction', e.target.value as any)}>
                  <option value="Long">Long</option>
                  <option value="Short">Short</option>
                </select>
              </div>

              <div className="form-field" style={{display:"none"}}>
                <label>Legacy contract <span className="req">*</span></label>
                <select className="select" value={form.contractType} onChange={e => set('contractType', e.target.value as any)}>
                  <option value="CFD">CFD</option>
                  <option value="Futures">Futures</option>
                </select>
              </div>

              <div className="form-field">
                <label>Entry Time (IST) <span className="req">*</span></label>
                <input type="datetime-local" className="input" value={form.entryDateTime}
                  onChange={e => set('entryDateTime', e.target.value)} />
              </div>

              <div className="form-field" style={legs.length ? {display:"none"} : undefined}>
                <label>Entry Price <span className="req">*</span></label>
                <input type="number" step="0.01" className="input" value={form.entryPrice}
                  onChange={e => set('entryPrice', e.target.value)} placeholder="0.00" />
              </div>

              <div className="form-field">
                <label>SL Price</label>
                <input type="number" step="0.01" className="input" value={form.slPrice}
                  onChange={e => set('slPrice', e.target.value)} placeholder="0.00" />
              </div>

              <div className="form-field">
                <label>Target Price</label>
                <input type="number" step="0.01" className="input" value={form.targetPrice}
                  onChange={e => set('targetPrice', e.target.value)} placeholder="0.00" />
              </div>

              <div className="form-field" style={legs.length ? {display:"none"} : undefined}>
                <label>Quantity <span className="req">*</span></label>
                <input type="number" step="0.01" className="input" value={form.quantity}
                  onChange={e => set('quantity', e.target.value)} placeholder="0" />
              </div>

              <div className="form-field">
                <label>Exit Time (IST)</label>
                <input type="datetime-local" className="input" value={form.exitDateTime}
                  onChange={e => set('exitDateTime', e.target.value)} />
              </div>

              <div className="form-field" style={legs.length ? {display:"none"} : undefined}>
                <label>Exit Price</label>
                <input type="number" step="0.01" className="input" value={form.exitPrice}
                  onChange={e => set('exitPrice', e.target.value)} placeholder="0.00" />
              </div>

              <div className="form-field">
                <label>Status</label>
                <select className="select" value={form.status} onChange={e => set('status', e.target.value as any)}>
                  <option value="Open">Open</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>

              <div className="form-field" style={{ justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 13 }}>
                  <span className="text-muted">Net PnL (auto):</span>
                  <span className={pnlClass(pnl)} style={{ fontSize: 18, fontWeight: 700 }}>{pnl != null ? fmtPnl(pnl) : '—'}</span>
                </div>
              </div>

              <div className="form-field full">
                <label>Comments</label>
                <textarea className="textarea" value={form.comments} onChange={e => set('comments', e.target.value)}
                  placeholder="Setup notes, mistakes, lessons..." />
              </div>

              {/* Tags */}
              <div className="form-field full">
                <label>Tags</label>
                {categories.length === 0
                  ? <span className="text-muted" style={{ fontSize: 13 }}>No tags configured yet — add some in Configuration.</span>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {categories.map(cat => (
                        <div key={cat.id}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>{cat.name}</div>
                          <div className="tags-grid">
                            {cat.tags.map(tag => (
                              <label key={tag.id} className="tag-pill" style={{ cursor: 'pointer', opacity: form.tags.includes(tag.id) ? 1 : 0.55 }}>
                                <input type="checkbox" checked={form.tags.includes(tag.id)} style={{ display: 'none' }}
                                  onChange={e => {
                                    set('tags', e.target.checked
                                      ? [...form.tags, tag.id]
                                      : form.tags.filter(t => t !== tag.id));
                                  }} />
                                {tag.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Snapshots */}
              <div className="form-field full">
                <label>Snapshots</label>
                <div className="dropzone" style={dragging ? { borderColor: '#22d3ee' } : {}}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => {
                    e.preventDefault(); setDragging(false);
                    const files: File[] = [];
                    for (let i = 0; i < e.dataTransfer.files.length; i++) {
                      const f = e.dataTransfer.files[i];
                      if (f.type.startsWith('image/')) files.push(f);
                    }
                    if (!files.length) { toast.error('Only images allowed'); return; }
                    files.forEach(doUpload);
                  }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <Upload size={22} />
                    <span><strong>Click to upload</strong> or drop images here</span>
                    <span style={{ fontSize: 12 }}>Or press <strong>Ctrl+V</strong> to paste a screenshot from clipboard</span>
                  </div>
                  <input ref={fileInput} type="file" accept="image/*" multiple hidden
                    onChange={e => {
                      const fl = e.target.files;
                      if (fl) {
                        for (let i = 0; i < fl.length; i++) {
                          const f = fl[i];
                          if (f.type.startsWith('image/')) doUpload(f);
                        }
                      }
                      e.target.value = '';
                    }} />
                </div>

                {snapshots.length > 0 && (
                  <div className="snapshot-grid">
                    {snapshots.map(s => (
                      <div key={s.id} className="snapshot-item">
                        <img src={snapshotUrl(s.filePath)} alt="snapshot" loading="lazy"
                          onClick={() => setLightbox(snapshotUrl(s.filePath))} style={{ cursor: 'zoom-in' }} />
                        <button type="button" className="del-btn" onClick={() => removeSnapshot(s.id)} disabled={saving}>✕</button>
                        <button type="button" className="view-btn" onClick={() => setLightbox(snapshotUrl(s.filePath))}><Eye size={11} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : trade ? 'Save Changes' : 'Add Trade'}
            </button>
          </div>
        </form>
      </div>

      {lightbox && (
        <div className="lightbox-overlay" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="snapshot preview" />
        </div>
      )}
    </div>
  );
}

function formFromTrade(t: Trade): FormState {
  return {
    instrumentId: t.instrumentId,
    direction: t.direction,
    contractType: t.contractType,
    entryDateTime: toLocalInputValue(t.entryDateTime),
    entryPrice: String(t.entryPrice ?? ''),
    slPrice: t.slPrice != null ? String(t.slPrice) : '',
    targetPrice: t.targetPrice != null ? String(t.targetPrice) : '',
    quantity: String(t.quantity ?? ''),
    exitDateTime: toLocalInputValue(t.exitDateTime),
    exitPrice: t.exitPrice != null ? String(t.exitPrice) : '',
    status: t.status,
    comments: t.comments ?? '',
    tags: (t.tags ?? []).map(Number),
  };
}
