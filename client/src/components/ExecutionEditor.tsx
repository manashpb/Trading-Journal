import type { Execution, Leg } from '../types';
import { toLocalInputValue } from '../utils/format';
import { calculateLeg } from '../../../shared/calculations.js';

export default function ExecutionEditor({ leg, onChange }: { leg: Leg; onChange: (patch: Partial<Leg>) => void }) {
  const fills = leg.executions || [];
  const update = (index: number, patch: Partial<Execution>) => onChange({ executions:fills.map((f, i) => i === index ? { ...f, ...patch } : f) });
  let summary = '';
  try { const r = calculateLeg(leg); summary = `Open quantity ${r.openQuantity} · Average entry ${r.averageEntry.toFixed(2)} · Realised ₹${r.realised.toFixed(2)}`; } catch (e: any) { summary = e.message; }
  return <details><summary>Execution fills / partial exits</summary><p className="text-muted">{summary}</p>
    {fills.map((f, i) => <div className="execution-row" key={i}>
      <div className="form-field"><label>Action</label><select className="select" value={f.action} onChange={e => update(i, {action:e.target.value as Execution['action']})}><option>Entry</option><option>Exit</option></select></div>
      <div className="form-field"><label>Time (IST)</label><input required className="input" type="datetime-local" value={toLocalInputValue(f.time)} onChange={e => update(i, {time:e.target.value ? new Date(e.target.value + '+05:30').toISOString() : ''})} /></div>
      {(['quantity','price','costs'] as const).map(k => <div className="form-field" key={k}><label>{k}</label><input required className="input" type="number" step="any" min={k === 'quantity' ? '0.000001' : '0'} value={f[k]} onChange={e => update(i, {[k]:Number(e.target.value)})} /></div>)}
      <button type="button" className="btn btn-sm" onClick={() => onChange({executions:fills.filter((_, n) => n !== i)})}>Remove fill</button>
    </div>)}
    <button type="button" className="btn btn-sm" onClick={() => onChange({executions:[...fills, {action:fills.length ? 'Exit' : 'Entry',time:'',quantity:leg.quantity,price:leg.entryPrice,costs:0}]})}>+ Add fill</button>
    <div className="form-field" style={{marginTop:12}}><label>Current mark price (optional; for unrealised P&amp;L)</label><input className="input" type="number" min="0" step="any" value={leg.markPrice ?? ''} onChange={e => onChange({markPrice:e.target.value === '' ? null : Number(e.target.value)})} /></div>
  </details>;
}
