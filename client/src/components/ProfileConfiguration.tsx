import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { fetchProfiles, saveProfile } from '../api';
import type { AnalysisField, TradeProfile } from '../types';

export default function ProfileConfiguration() {
  const [profiles, setProfiles] = useState<TradeProfile[]>([]);
  const [selected, setSelected] = useState('prop');
  const [fields, setFields] = useState<AnalysisField[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => fetchProfiles().then(p => { setProfiles(p); setFields(p.find(p => p.id === selected)?.fields || []); }).catch(e => toast.error(e.message));
  useEffect(() => { load(); }, [selected]);
  const update = (i: number, patch: Partial<AnalysisField>) => setFields(fields.map((f, n) => n === i ? { ...f, ...patch } : f));
  async function save() { setBusy(true); try { await saveProfile(selected, fields); toast.success('New template version saved. Existing trades retain their original fields.'); await load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }
  return <section className="card" style={{ marginBottom: 28 }}><h3>Recording profiles</h3><p className="text-muted">Configure the analysis fields for new trades. Stable keys identify fields across versions. All account amounts are recorded in INR.</p>
    <select aria-label="Configure profile" className="select" value={selected} onChange={e => setSelected(e.target.value)}>{profiles.map(p => <option key={p.id} value={p.id}>{p.name} · v{p.version}</option>)}</select>
    {fields.map((f, i) => <div className="template-row" key={i}>
      <input aria-label="Field key" className="input" value={f.key} placeholder="Stable key" onChange={e => update(i, { key:e.target.value })} />
      <input aria-label="Field label" className="input" value={f.label} placeholder="Label" onChange={e => update(i, { label:e.target.value })} />
      <select aria-label="Field type" className="select" value={f.type} onChange={e => update(i, { type:e.target.value as AnalysisField['type'] })}><option value="text">Text</option><option value="number">Number</option><option value="select">Dropdown</option></select>
      {f.type === 'select' && <input aria-label="Dropdown options" className="input" value={f.options?.join(',') || ''} placeholder="Options, separated, by commas" onChange={e => update(i, { options:e.target.value.split(',').map(s => s.trim()) })} />}
      <button type="button" className="btn btn-sm" onClick={() => setFields(fields.filter((_, n) => n !== i))}>Remove</button>
    </div>)}
    <div className="section-heading"><button className="btn" onClick={() => setFields([...fields, {key:'',label:'',type:'text'}])}>+ Add field</button><button disabled={busy} className="btn btn-primary" onClick={save}>{busy ? 'Saving…' : 'Save new version'}</button></div>
  </section>;
}
