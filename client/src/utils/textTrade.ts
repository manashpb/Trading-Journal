import { LineCounter, parseDocument } from 'yaml';
import type { Instrument, TagCategory, Trade, TradeProfile, Leg } from '../types';
import { calculateStrategy } from '../../../shared/calculations.js';

export interface TextContext { instruments: Instrument[]; categories: TagCategory[]; profiles: TradeProfile[] }
const quote = (v: unknown) => JSON.stringify(v);
const assets = ['Option', 'Equity', 'Futures', 'CFD'];
export function tradeTemplate(profile: TradeProfile, ctx: TextContext): string {
  const asset = profile.id.startsWith('options') ? 'Option' : profile.id === 'cash' ? 'Equity' : 'CFD';
  const lines = [
    '# New trade · YAML · blank optional values mean not recorded.',
    '# Quote names containing # or : . Times use IST: YYYY-MM-DD HH:mm.',
    '# Select a profile above and click Load template to generate its fields.',
    '# Profiles: ' + ctx.profiles.map(p => p.id).join(' | '),
    `profile: ${profile.id}`,
    '# Instruments: ' + ctx.instruments.map(i => quote(i.name)).join(' | '),
    'instrument: "" # Required: exact configured name',
    '# Options: Long | Short', 'direction: Long',
    '# Options: ' + assets.join(' | '), `asset_type: ${asset}`,
    '# Options: ' + profile.holdingStyles.join(' | '), `holding_style: ${profile.holdingStyles[0]}`,
    'account: Personal', 'strategy: ""',
    'entry_time: "" # Required: YYYY-MM-DD HH:mm (IST)',
    'entry_price: # Required unless legs are supplied', 'quantity: # Required unless legs are supplied',
    'stop_loss:', 'target:', '# Options: Open | Closed', 'status: Open',
    'exit_time: # Required when Closed', 'exit_price: # Required when Closed without legs',
    'costs: 0', 'multiplier: # Defaults to instrument point value', 'planned_risk:', 'capital_committed:',
  ];
  if (profile.id === 'options_scalping') lines.push('# Options: CE | PE', 'option_type:', 'strike:', 'delta: # -1 to 1');
  lines.push('observed_at: # IST date/time', 'source: ""', 'thesis: |', '  ', 'analysis:');
  for (const f of profile.fields) {
    lines.push(`  # ${f.label}${f.options ? ' · Options: ' + f.options.map(quote).join(' | ') : ' · ' + f.type}`, `  ${f.key}:`);
  }
  if (!profile.fields.length) lines[lines.length - 1] = 'analysis: {}';
  lines.push('# Select tags by category. Example: "Category": ["Tag one", "Tag two"]', 'tags:' );
  for (const c of ctx.categories) lines.push('  # Options: ' + c.tags.map(t => quote(t.name)).join(' | '), `  ${quote(c.name)}: []`);
  if (!ctx.categories.length) lines[lines.length - 1] = 'tags: {}';
  if (profile.id === 'options_hedged') {
    lines.push('# At least two legs. Duplicate a leg block to add more.', '# Leg asset_type: Option | Equity | Futures | CFD; side: Buy | Sell; option_type: Call | Put', 'legs:');
    for (const side of ['Buy', 'Sell']) lines.push('  - symbol: ""', '    asset_type: Option', `    side: ${side}`, '    expiry: "" # YYYY-MM-DD', '    option_type: Call', '    strike:', '    quantity:', '    multiplier: 1', '    entry_price:', '    exit_price:', '    entry_time:', '    exit_time:');
  } else lines.push('# Optional legs use symbol, asset_type, side, expiry, option_type, strike,', '# quantity, multiplier, entry_price, exit_price, entry_time, exit_time.', '# Leg dropdowns: asset_type = Option | Equity | Futures | CFD; side = Buy | Sell; option_type = Call | Put', 'legs: []');
  lines.push('comments: |', '  ', 'adjustments: |', '  ', 'exit_reason: ""', 'review: |', '  ');
  return lines.join('\n') + '\n';
}

export function toggleTextTag(source: string, category: string, tag: string): string {
  const doc = parseDocument(source);
  if (doc.errors.length) throw new Error('Fix the YAML syntax before selecting tags.');
  const current = doc.getIn(['tags', category]);
  const values = current == null ? [] : (current as { toJSON?: () => unknown }).toJSON?.();
  if (!Array.isArray(values)) throw new Error('Tags for this category must be a list.');
  doc.setIn(['tags', category], values.includes(tag) ? values.filter(v => v !== tag) : [...values, tag]);
  return doc.toString();
}

export function parseTextTrade(source: string, ctx: TextContext): { payload?: Partial<Trade>; errors: string[]; pnl?: number | null } {
  const counter = new LineCounter();
  const doc = parseDocument(source, { lineCounter: counter });
  if (doc.errors.length) return { errors: doc.errors.map(e => e.message) };
  const errors: string[] = [];
  const issue = (path: (string | number)[], message: string) => {
    const node = doc.getIn(path, true) as { range?: number[] } | undefined;
    errors.push(`Line ${counter.linePos(node?.range?.[0] ?? 0).line}: ${path.join('.')}: ${message}`);
  };
  type Obj = Record<string, any>;
  const object = (v: unknown, path: (string | number)[]): Obj => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) { issue(path, 'expected a mapping'); return {}; }
    return v as Obj;
  };
  let data: unknown;
  try { data = doc.toJS({ maxAliasCount: 0 }); } catch { return { errors: ['YAML aliases are not supported. Write values directly.'] }; }
  const b = object(data, []);
  const allowed = 'profile instrument direction asset_type holding_style account strategy entry_time entry_price quantity stop_loss target status exit_time exit_price costs multiplier planned_risk capital_committed option_type strike delta observed_at source thesis analysis tags legs comments adjustments exit_reason review'.split(' ');
  const keys = (o: Obj, allowedKeys: string[], path: (string | number)[]) => Object.keys(o).forEach(k => { if (!allowedKeys.includes(k)) issue([...path, k], 'unknown field'); });
  keys(b, allowed, []);
  const str = (v: unknown, path: (string | number)[], required = false): string => {
    if (v == null || v === '') { if (required) issue(path, 'required'); return ''; }
    if (typeof v !== 'string') { issue(path, 'expected text (quote numeric names)'); return ''; }
    if (v.length > 20000) issue(path, 'too long');
    return v;
  };
  const num = (v: unknown, path: (string | number)[], required = false, min = 0): number | null => {
    if (v == null || v === '') { if (required) issue(path, 'required'); return null; }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min) { issue(path, `expected a finite number >= ${min}`); return null; }
    return v;
  };
  const choice = (v: unknown, options: string[], path: (string | number)[]) => {
    if (!options.includes(v as string)) issue(path, 'choose ' + options.join(' | '));
    return v as string;
  };
  const date = (v: unknown, path: (string | number)[], required = false): string | null => {
    const value = str(v, path, required);
    if (!value) return null;
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(value);
    const iso = match ? `${match[1]}T${match[2]}:${match[3] || '00'}+05:30` : '';
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms) || new Date(ms + 330 * 60000).toISOString().slice(0, 19) !== iso.slice(0,19)) { issue(path, 'use a valid IST date/time: YYYY-MM-DD HH:mm'); return null; }
    return new Date(ms).toISOString();
  };
  const profile = ctx.profiles.find(p => p.id === b.profile);
  if (!profile) issue(['profile'], 'choose ' + ctx.profiles.map(p => p.id).join(' | '));
  const matches = ctx.instruments.filter(i => i.name === b.instrument);
  if (matches.length !== 1) issue(['instrument'], matches.length ? 'name is ambiguous; rename duplicate instruments in Configuration' : 'choose an exact configured instrument name');
  const inst = matches[0];
  const assetType = choice(b.asset_type, assets, ['asset_type']);
  if (profile?.id.startsWith('options') && assetType !== 'Option') issue(['asset_type'], 'this profile requires Option');
  if (profile?.id === 'cash' && assetType !== 'Equity') issue(['asset_type'], 'cash requires Equity');
  const direction = choice(b.direction, ['Long', 'Short'], ['direction']) as Trade['direction'];
  const status = choice(b.status, ['Open', 'Closed'], ['status']) as Trade['status'];
  const holdingStyle = choice(b.holding_style, profile?.holdingStyles || [], ['holding_style']);
  const entryDateTime = date(b.entry_time, ['entry_time'], true);
  const exitDateTime = date(b.exit_time, ['exit_time'], status === 'Closed');
  if (entryDateTime && exitDateTime && exitDateTime < entryDateTime) issue(['exit_time'], 'exit precedes entry');
  const analysis = b.analysis == null ? {} : object(b.analysis, ['analysis']);
  keys(analysis, profile?.fields.map(f => f.key) || [], ['analysis']);
  const recorded: Record<string, string | number> = {};
  for (const f of profile?.fields || []) {
    const v = analysis[f.key]; if (v == null || v === '') continue;
    const path = ['analysis', f.key];
    if (f.type === 'number') {
      const n = num(v, path, false, -Number.MAX_VALUE);
      if (n != null) { recorded[f.key] = n; if (f.key === 'ivp' && (n < 0 || n > 100)) issue(path, 'must be 0–100'); if (/Touches$/.test(f.key) && (!Number.isInteger(n) || n < 0)) issue(path, 'must be a nonnegative integer'); }
    } else recorded[f.key] = f.type === 'select' ? choice(v, f.options || [], path) : str(v, path);
  }
  const tags: number[] = [];
  const tagMap = b.tags == null ? {} : object(b.tags, ['tags']);
  for (const [name, selected] of Object.entries(tagMap)) {
    const cats = ctx.categories.filter(c => c.name === name);
    if (cats.length !== 1) { issue(['tags', name], 'unknown or ambiguous category'); continue; }
    if (!Array.isArray(selected)) { issue(['tags', name], 'expected a list, e.g. ["Breakout"]'); continue; }
    for (const t of selected) {
      const found = cats[0].tags.filter(tag => tag.name === t);
      if (found.length !== 1) issue(['tags', name], `unknown or ambiguous tag ${quote(t)}`);
      else tags.push(found[0].id);
    }
  }
  const legs: Leg[] = [];
  if (b.legs != null && !Array.isArray(b.legs)) issue(['legs'], 'expected a list');
  if (Array.isArray(b.legs)) b.legs.forEach((raw: unknown, index: number) => {
    const path = ['legs', index]; const l = object(raw, path);
    keys(l, 'symbol asset_type side expiry option_type strike quantity multiplier entry_price exit_price entry_time exit_time'.split(' '), path);
    const at = (key: string) => [...path, key];
    const asset = choice(l.asset_type, assets, at('asset_type'));
    if (profile?.id === 'cash' && asset !== 'Equity') issue(at('asset_type'), 'cash requires Equity');
    if (profile?.id === 'options_scalping' && asset !== 'Option') issue(at('asset_type'), 'scalping requires Option');
    const expiry = str(l.expiry, at('expiry'), asset === 'Option');
    if (asset === 'Option' && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || !Number.isFinite(Date.parse(expiry)) || new Date(expiry).toISOString().slice(0,10) !== expiry)) issue(at('expiry'), 'use a valid YYYY-MM-DD date');
    const entry = date(l.entry_time, at('entry_time'));
    const exit = date(l.exit_time, at('exit_time'));
    if (entry && exit && exit < entry) issue(at('exit_time'), 'exit precedes entry');
    legs.push({ symbol: str(l.symbol, at('symbol'), true), assetType: asset,
      side: choice(l.side, ['Buy', 'Sell'], at('side')) as Leg['side'], expiry,
      optionType: asset === 'Option' ? choice(l.option_type, ['Call', 'Put'], at('option_type')) : '',
      strike: num(l.strike, at('strike'), asset === 'Option', Number.MIN_VALUE),
      quantity: num(l.quantity, at('quantity'), true, Number.MIN_VALUE) ?? 0,
      multiplier: num(l.multiplier, at('multiplier'), true, Number.MIN_VALUE) ?? 1,
      entryPrice: num(l.entry_price, at('entry_price'), true) ?? 0,
      exitPrice: num(l.exit_price, at('exit_price'), status === 'Closed'),
      ...(entry ? { entryDateTime: entry } : {}), ...(exit ? { exitDateTime: exit } : {}) });
  });
  if (legs.length > 50) issue(['legs'], 'maximum 50 legs');
  if (profile?.id === 'options_hedged' && legs.length < 2) issue(['legs'], 'hedged strategies need at least two legs');
  if (assetType === 'Option' && profile?.id !== 'options_scalping' && !legs.length) issue(['legs'], 'add option legs with expiry, strike and Call/Put');
  const entryPrice = num(b.entry_price, ['entry_price'], !legs.length);
  const quantity = num(b.quantity, ['quantity'], !legs.length, Number.MIN_VALUE);
  const exitPrice = num(b.exit_price, ['exit_price'], status === 'Closed' && !legs.length);
  const costs = num(b.costs, ['costs']) ?? 0;
  const multiplier = num(b.multiplier, ['multiplier'], false, Number.MIN_VALUE) ?? inst?.pointValue;
  const framework: NonNullable<Trade['framework']> = { templateVersion: profile?.version || 1, fields: profile?.fields || [], analysis: recorded, legs,
    observedAt: date(b.observed_at, ['observed_at']) || '', source: str(b.source, ['source']), thesis: str(b.thesis, ['thesis']),
    adjustments: str(b.adjustments, ['adjustments']), exitReason: str(b.exit_reason, ['exit_reason']), review: str(b.review, ['review']) };
  if (profile?.id === 'options_scalping') {
    framework.optionType = b.option_type == null || b.option_type === '' ? '' : choice(b.option_type, ['CE', 'PE'], ['option_type']) as 'CE' | 'PE';
    framework.strike = num(b.strike, ['strike'], false, Number.MIN_VALUE);
    framework.delta = num(b.delta, ['delta'], false, -1);
    if (framework.delta != null && framework.delta > 1) issue(['delta'], 'must be between -1 and 1');
  } else for (const key of ['option_type', 'strike', 'delta']) if (b[key] != null) issue([key], 'only used by the options_scalping profile; put option details in legs');
  const payload: Partial<Trade> = { profile: profile?.id, instrumentId: inst?.id, direction, assetType, contractType: assetType as Trade['contractType'], holdingStyle,
    account: str(b.account, ['account']) || 'Personal', strategy: str(b.strategy, ['strategy']), entryDateTime: entryDateTime || '',
    entryPrice: legs.length ? legs[0].entryPrice : entryPrice!, quantity: legs.length ? 1 : quantity!,
    slPrice: num(b.stop_loss, ['stop_loss']), targetPrice: num(b.target, ['target']), status, exitDateTime, exitPrice, costs, multiplier,
    plannedRisk: num(b.planned_risk, ['planned_risk'], false, Number.MIN_VALUE), capitalCommitted: num(b.capital_committed, ['capital_committed']),
    comments: str(b.comments, ['comments']), tags: [...new Set(tags)], framework };
  let pnl: number | null = null;
  if (!errors.length) {
    try { pnl = legs.length ? calculateStrategy(legs, costs).netRealised : status === 'Closed' ? (exitPrice! - entryPrice!) * (direction === 'Long' ? 1 : -1) * quantity! * multiplier! - costs : null; }
    catch (e) { issue(['legs'], (e as Error).message); }
  }
  return { payload: errors.length ? undefined : payload, errors, pnl };
}

export function selectedTextTags(source: string): Record<string, string[]> {
  try { const doc = parseDocument(source); if (doc.errors.length) return {}; return doc.toJS({ maxAliasCount: 0 })?.tags || {}; } catch { return {}; }
}
