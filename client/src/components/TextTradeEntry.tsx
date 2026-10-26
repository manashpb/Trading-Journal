import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { createTrade, fetchProfiles } from '../api';
import type { Instrument, TagCategory, TradeProfile } from '../types';
import { parseTextTrade, selectedTextTags, toggleTextTag, tradeTemplate } from '../utils/textTrade';
import { fmtPnl } from '../utils/format';

interface Props {
  instruments: Instrument[];
  categories: TagCategory[];
  ready: boolean;
  loadError: string;
  draft: string;
  onDraft: (text: string) => void;
  saving: boolean;
  onSaving: (saving: boolean) => void;
  onSaved: () => void;
  onClose: () => void;
}

const istTime = (value?: string | null) => value ? new Date(Date.parse(value) + 330 * 60000).toISOString().slice(0,16).replace('T', ' ') : 'Not recorded';

export default function TextTradeEntry({ instruments, categories, ready, loadError: configError, draft, onDraft, saving, onSaving, onSaved, onClose }: Props) {
  const [profiles, setProfiles] = useState<TradeProfile[]>([]);
  const [profile, setProfile] = useState('prop');
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  useEffect(() => { fetchProfiles().then(setProfiles).catch(e => setLoadError(e.message)); }, []);
  const context = useMemo(() => ({ instruments, categories, profiles }), [instruments, categories, profiles]);
  const loaded = ready && profiles.length > 0;
  useEffect(() => {
    if (loaded && !initialized.current) {
      initialized.current = true;
      if (!draft) onDraft(tradeTemplate(profiles.find(p => p.id === profile) || profiles[0], context));
    }
  }, [loaded, draft, profiles, profile, context, onDraft]);
  const parsed = useMemo(() => loaded && draft ? parseTextTrade(draft, context) : { errors: [] }, [loaded, draft, context]);
  const selected = useMemo(() => selectedTextTags(draft), [draft]);
  const p = parsed.payload;
  function loadTemplate() {
    if (draft && !window.confirm('Replace the current text with a fresh template? Download it first if you want to keep a copy.')) return;
    onDraft(tradeTemplate(profiles.find(p => p.id === profile) || profiles[0], context));
  }
  function download() {
    const url = URL.createObjectURL(new Blob([draft], { type: 'text/yaml;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'new-trade.yaml'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importFile(file: File) {
    if (file.size > 256 * 1024) return toast.error('Trade text files must be smaller than 256 KB');
    try {
      const text = await file.text();
      if (!text.trim()) return toast.error('The selected file is empty');
      if (draft && !window.confirm('Replace the current text with this file?')) return;
      onDraft(text);
    } catch { toast.error('Could not read the selected file'); }
  }
  async function save() {
    if (saving || !loaded) return;
    const result = parseTextTrade(draft, context);
    if (!result.payload) return toast.error('Fix the highlighted trade details first');
    onSaving(true);
    setSaveError('');
    try {
      await createTrade(result.payload);
      toast.success('Trade added');
      onDraft(''); onSaved(); onClose();
    } catch (e) { setSaveError((e as Error).message); toast.error((e as Error).message); }
    finally { onSaving(false); }
  }
  return <div className="text-trade-entry">
    <div className="modal-body">
    <p className="text-muted">Edit the YAML below or load a .yaml / .txt file. Lines beginning with # are comments. Times are IST. Form and Text keep separate drafts; this tab creates the text draft.</p>
    {loadError && <p role="alert" className="rule-warning">Could not load profiles: {loadError}. Close and reopen the window to retry.</p>}
    {configError && <p role="alert" className="rule-warning">Could not load instruments or tags: {configError}. Close and reopen the window to retry.</p>}
    {!ready && !configError && <p role="status">Loading instruments and tags…</p>}
    <div className="text-trade-toolbar">
      <label htmlFor="text-trade-profile">Template profile</label>
      <select id="text-trade-profile" className="select" value={profile} disabled={!loaded || saving} onChange={e => setProfile(e.target.value)}>
        {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button type="button" className="btn btn-sm" disabled={!loaded || saving} onClick={loadTemplate}>Load template</button>
      <button type="button" className="btn btn-sm" disabled={!draft || saving} onClick={download}>Download text</button>
      <button type="button" className="btn btn-sm" disabled={!loaded || saving} onClick={() => fileInput.current?.click()}>Load file</button>
      <input ref={fileInput} hidden type="file" accept=".yaml,.yml,.txt,text/plain" onChange={e => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ''; }} />
    </div>
    <label htmlFor="text-trade-yaml">Trade text</label>
    <textarea id="text-trade-yaml" className="textarea text-trade-editor" value={draft} spellCheck={false} disabled={!loaded || saving} onChange={e => onDraft(e.target.value)} aria-describedby="text-trade-validation" />
    <details className="text-trade-tags" open>
      <summary>Tags · click to add or remove in the text</summary>
      {categories.length === 0 && <p className="text-muted">No tags configured. Add categories and tags in Configuration.</p>}
      {categories.map(c => <div key={c.id} style={{ marginTop: 10 }}><strong>{c.name}</strong><div className="tags-grid">
        {c.tags.map(t => <button key={t.id} type="button" className="tag-pill" aria-pressed={Array.isArray(selected[c.name]) && selected[c.name].includes(t.name)} disabled={!loaded || saving} style={{ cursor: 'pointer', opacity: Array.isArray(selected[c.name]) && selected[c.name].includes(t.name) ? 1 : 0.55 }} onClick={() => {
          try { onDraft(toggleTextTag(draft, c.name, t.name)); } catch (e) { toast.error((e as Error).message); }
        }}>{t.name}</button>)}
      </div></div>)}
    </details>
    <div id="text-trade-validation" aria-live="polite" className="text-trade-preview">
      {loaded && parsed.errors.length > 0 && <><strong>Complete or correct these details</strong><ul>{parsed.errors.map((error, i) => <li key={i}>{error}</li>)}</ul></>}
      {p && <><strong>Ready to create</strong><p>{profiles.find(x => x.id === p.profile)?.name} · {instruments.find(i => i.id === p.instrumentId)?.name} · {p.direction} · {p.status}</p>
        <p>Entry (IST): {istTime(p.entryDateTime)} · {p.framework?.legs.length ? `${p.framework.legs.length} legs` : `Quantity ${p.quantity} @ ${p.entryPrice}`}</p>
        <p>Selected tags: {categories.flatMap(c => c.tags.filter(t => p.tags?.includes(t.id)).map(t => `${c.name}: ${t.name}`)).join(', ') || 'None'} · Net P&amp;L: {parsed.pnl == null ? '—' : fmtPnl(parsed.pnl)}</p>
        {p.profile === 'options_scalping' && p.exitDateTime && new Date(Date.parse(p.entryDateTime!) + 330 * 60000).toISOString().slice(0,10) !== new Date(Date.parse(p.exitDateTime) + 330 * 60000).toISOString().slice(0,10) && <p className="rule-warning">Rule violation: this options scalp was held overnight.</p>}
        <details><summary>Full trade preview</summary>
          <p>Account: {p.account} · Strategy: {p.strategy || 'Not recorded'} · Holding style: {p.holdingStyle} · Asset: {p.assetType}</p>
          <p>Exit (IST): {istTime(p.exitDateTime)} · Exit price: {p.exitPrice ?? 'Not recorded'} · Stop loss: {p.slPrice ?? 'Not recorded'} · Target: {p.targetPrice ?? 'Not recorded'}</p>
          <p>Additional costs: ₹{p.costs} · Multiplier: {p.multiplier} · Planned risk: {p.plannedRisk ?? 'Not recorded'} · Capital committed: {p.capitalCommitted ?? 'Not recorded'}</p>
          {p.profile === 'options_scalping' && <p>Option: {p.framework?.optionType || 'Not recorded'} · Strike: {p.framework?.strike ?? 'Not recorded'} · Delta: {p.framework?.delta ?? 'Not recorded'}</p>}
          <p>Analysis observed (IST): {istTime(p.framework?.observedAt)} · Source: {p.framework?.source || 'Not recorded'}</p>
          {p.framework?.fields.filter(f => p.framework?.analysis[f.key] != null).map(f => <p key={f.key}>{f.label}: {p.framework?.analysis[f.key]}</p>)}
          {p.framework?.legs.map((l, i) => <p key={i}>Leg {i + 1}: {l.symbol} · {l.assetType} · {l.side} · {l.quantity} × {l.multiplier} @ {l.entryPrice} → {l.exitPrice ?? 'Open'}{l.assetType === 'Option' ? ` · ${l.optionType} ${l.strike} · Expiry ${l.expiry}` : ''} · Entry (IST): {istTime(l.entryDateTime)} · Exit (IST): {istTime(l.exitDateTime)}</p>)}
          {[['Thesis', p.framework?.thesis], ['Comments', p.comments], ['Adjustments', p.framework?.adjustments], ['Exit reason', p.framework?.exitReason], ['Review', p.framework?.review]].filter(([, v]) => v).map(([label, value]) => <p key={label} style={{ whiteSpace: 'pre-wrap' }}><strong>{label}: </strong>{value}</p>)}
        </details>
      </>}
    </div>
    {saveError && <p role="alert" className="rule-warning">Trade was not created: {saveError}. Your text has been kept.</p>}
    <p className="text-muted">Snapshots can be added after creating the trade. Draft text stays available in this window after a failed save.</p>
    </div>
    <div className="modal-footer">
      <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
      <button type="button" className="btn btn-primary" onClick={save} disabled={!loaded || !p || saving}>{saving ? 'Saving…' : 'Create New Trade'}</button>
    </div>
  </div>;
}
