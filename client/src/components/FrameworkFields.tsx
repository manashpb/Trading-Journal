import ExecutionEditor from './ExecutionEditor';
import { useEffect, useState } from 'react';
import { fetchProfiles } from '../api';
import type { Framework, Leg, Trade, TradeProfile } from '../types';

export const emptyFramework = (): Framework => ({ templateVersion: 1, fields: [], analysis: {}, observedAt: '', source: '', thesis: '', exitReason: '', review: '', adjustments: '', legs: [] });
export const profileNames: Record<string, string> = { prop: 'Prop trades', options_scalping: 'Options scalping', options_hedged: 'Options positional hedge', cash: 'Cash stocks' };
export function FrameworkFields({ value, onChange }: { value: Partial<Trade>; onChange: (v: Partial<Trade>) => void }) {
  const [profiles, setProfiles] = useState<TradeProfile[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { fetchProfiles().then(setProfiles).catch(e => setError(e.message)); }, []);
  const isProp = (value.profile || 'prop') === 'prop';
  const isPositional = value.profile === 'options_hedged';
  const isScalping = value.profile === 'options_scalping';
  const f = value.framework || emptyFramework();
  const p = profiles.find(p => p.id === (value.profile || 'prop'));
  const set = (key: keyof Trade, v: any) => onChange({ ...value, [key]: v });
  const setF = (key: keyof Framework, v: any) => set('framework', { ...f, [key]: v });
  const fields = f.fields.length ? f.fields : p?.fields || [];
  const updateLeg = (i: number, key: keyof Leg, v: any) => setF('legs', f.legs.map((l, n) => n === i ? { ...l, [key]: v } : l));
  function switchProfile(id: string) {
    const next = profiles.find(p => p.id === id)!;
    onChange({ ...value, profile: id, holdingStyle: next.holdingStyles[0], assetType: id.startsWith('options') ? 'Option' : id === 'cash' ? 'Equity' : 'CFD', framework: { ...f, fields: next.fields, templateVersion: next.version, analysis: {}, legs: [] } });
  }
  return <div className="framework-section">
    <p className="text-muted" style={{marginBottom:12}}>Choose the profile first. Changing it resets profile analysis and legs.</p>
    <div className="form-grid">
      <div className="form-field"><label htmlFor="recording-profile">Recording profile</label><select id="recording-profile" className="select" value={value.profile || 'prop'} onChange={e => switchProfile(e.target.value)}>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{error && <span role="alert">{error}</span>}</div>
      <div className="form-field"><label htmlFor="holding-style">Holding style</label><select id="holding-style" className="select" value={value.holdingStyle || 'Intraday'} onChange={e => set('holdingStyle', e.target.value)}>{p?.holdingStyles.map(h => <option key={h}>{h}</option>)}</select></div>
      <div className="form-field"><label htmlFor="asset-type">Asset type</label><select id="asset-type" className="select" value={value.assetType || 'CFD'} onChange={e => set('assetType', e.target.value)}>{['Option','Equity','Futures','CFD'].map(a => <option key={a}>{a}</option>)}</select></div>
      <div className="form-field"><label>Account / broker / firm (INR)</label><input className="input" value={value.account || ''} onChange={e => set('account', e.target.value)} placeholder="Personal / firm account" /></div>
      {isProp && <div className="form-field"><label htmlFor="analysis-stage">Account stage</label><select id="analysis-stage" className="select" value={f.analysis.stage ?? ''} onChange={e => setF('analysis', { ...f.analysis, stage: e.target.value })}><option value="">Not recorded</option>{(fields.find(field => field.key === 'stage')?.options || ['Evaluation', 'Funded']).map(stage => <option key={stage}>{stage}</option>)}</select></div>}
      <div className="form-field"><label>Strategy / setup</label><input className="input" value={value.strategy || ''} onChange={e => set('strategy', e.target.value)} /></div>
      {!isScalping && !isProp && <div className="form-field"><label>Planned risk at entry (₹)</label><input type="number" min="0.01" step="any" className="input" value={value.plannedRisk ?? ''} onChange={e => set('plannedRisk', e.target.value === '' ? null : Number(e.target.value))} /></div>}
      {!isScalping && !isProp && <div className="form-field"><label>Capital / margin committed (₹)</label><input className="input" type="number" min="0" step="any" value={value.capitalCommitted ?? ''} onChange={e => set('capitalCommitted', e.target.value === '' ? null : Number(e.target.value))} /></div>}
      {!isProp && <div className="form-field"><label>Additional costs (₹)</label><input type="number" min="0" step="any" className="input" value={value.costs ?? 0} onChange={e => set('costs', Number(e.target.value))} /></div>}
      <div className="form-field"><label>Value per price point per quantity unit</label><input type="number" min="0.000001" step="any" className="input" value={value.multiplier ?? ''} placeholder="Defaults to instrument point value" onChange={e => set('multiplier', e.target.value === '' ? undefined : Number(e.target.value))} /></div>
    </div>
    {!isProp && <details open><summary>Entry context · template v{f.fields.length ? f.templateVersion : p?.version || 1}</summary><div className="form-grid">
      <div className="form-field full"><label>Entry thesis</label><textarea className="textarea" value={f.thesis} onChange={e => setF('thesis', e.target.value)} /></div>
      <div className="form-field"><label>Analysis observed at (IST)</label><input className="input" type="datetime-local" value={f.observedAt ? localDate(f.observedAt) : ''} onChange={e => setF('observedAt', e.target.value ? new Date(e.target.value + '+05:30').toISOString() : '')} /></div>
      {!isScalping && !isProp && <div className="form-field"><label>Analysis source / measurement basis</label><input className="input" value={f.source} onChange={e => setF('source', e.target.value)} /></div>}
      {fields.map(field => <div className="form-field" key={field.key}><label htmlFor={"analysis-" + field.key}>{field.label}</label>{field.type === 'select' ? <select id={'analysis-' + field.key} className="select" value={f.analysis[field.key] ?? ''} onChange={e => setF('analysis', { ...f.analysis, [field.key]: e.target.value })}><option value="">Not recorded</option>{field.options?.map(o => <option key={o}>{o}</option>)}</select> : <input id={'analysis-' + field.key} className="input" type={field.type === 'number' ? 'number' : 'text'} step="any" value={f.analysis[field.key] ?? ''} placeholder="Not recorded" onChange={e => setF('analysis', { ...f.analysis, [field.key]: field.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value })} />}</div>)}
    </div></details>}
    {!isScalping && !isProp && <details open={value.assetType === 'Option' || f.legs.length > 0}><summary>Legs · {f.legs.length} contracts</summary>
      <p className="text-muted">Use quantities in units and multiplier 1, or lots and the captured lot size. Leg totals determine strategy P&amp;L; execution fills override summary prices and quantities. Additional costs exclude fill costs; the main instrument identifies the underlying.</p>
      {f.legs.map((l, i) => <div className="leg-card" key={i}><div className="section-heading"><strong>Leg {i + 1}</strong><button type="button" className="btn btn-sm" onClick={() => setF('legs', f.legs.filter((_, n) => n !== i))}>Remove</button></div><div className="form-grid">
        <div className="form-field"><label>Symbol</label><input required className="input" value={l.symbol} onChange={e => updateLeg(i, 'symbol', e.target.value)} /></div>
        <div className="form-field"><label>Asset</label><select className="select" value={l.assetType} onChange={e => updateLeg(i, 'assetType', e.target.value)}>{['Option','Equity','Futures','CFD'].map(a => <option key={a}>{a}</option>)}</select></div>
        <div className="form-field"><label>Side</label><select className="select" value={l.side} onChange={e => updateLeg(i, 'side', e.target.value)}><option>Buy</option><option>Sell</option></select></div>
        {l.assetType === 'Option' && <><div className="form-field"><label>Expiry</label><input required className="input" type="date" value={l.expiry} onChange={e => updateLeg(i, 'expiry', e.target.value)} /></div><div className="form-field"><label>Call / Put</label><select className="select" value={l.optionType} onChange={e => updateLeg(i, 'optionType', e.target.value)}><option>Call</option><option>Put</option></select></div><div className="form-field"><label>Strike</label><input required className="input" type="number" step="any" min="0.01" value={l.strike ?? ''} onChange={e => updateLeg(i, 'strike', e.target.value === '' ? null : Number(e.target.value))} /></div></>}
        {isPositional && (['entryDateTime', 'exitDateTime'] as const).map(key => <div className="form-field" key={key}><label htmlFor={'leg-' + i + '-' + key}>{key === 'entryDateTime' ? 'Entry time (IST)' : 'Exit time (IST)'}</label><input id={'leg-' + i + '-' + key} className="input" type="datetime-local" value={l[key] ? localDate(l[key]) : ''} onChange={e => updateLeg(i, key, e.target.value ? new Date(e.target.value + '+05:30').toISOString() : '')} /></div>)}
        {(['quantity','multiplier','entryPrice','exitPrice'] as const).map(k => <div className="form-field" key={k}><label>{{quantity:'Quantity',multiplier:'Multiplier / lot size',entryPrice:'Entry price',exitPrice:'Exit price'}[k]}</label><input className="input" type="number" step="any" min={k === 'quantity' || k === 'multiplier' ? '0.000001' : '0'} value={l[k] ?? ''} required={k !== 'exitPrice'} onChange={e => updateLeg(i, k, e.target.value === '' ? null : Number(e.target.value))} /></div>)}
      </div><ExecutionEditor leg={l} onChange={patch => setF('legs', f.legs.map((leg,n) => n === i ? {...leg,...patch} : leg))} /></div>)}
      <button type="button" className="btn" onClick={() => setF('legs', [...f.legs, { symbol:'', assetType:value.assetType || 'Option', side:'Buy', expiry:'', strike:null, optionType:'Call', quantity:1, multiplier:1, entryPrice:0, exitPrice:null }])}>+ Add leg</button>
    </details>}
    {!isScalping && !isProp && <details><summary>Adjustments and post-trade review</summary><div className="form-grid">{(['adjustments','exitReason','review'] as const).map(k => <div className="form-field full" key={k}><label>{{adjustments:'Adjustment history (include date/time and reason)',exitReason:'Exit reason',review:'Review / adherence / lessons'}[k]}</label><textarea className="textarea" value={f[k]} onChange={e => setF(k, e.target.value)} /></div>)}</div></details>}
  </div>;
}
function localDate(iso: string) { return new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0,16); }
