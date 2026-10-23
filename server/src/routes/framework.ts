import express from 'express';
import { calculateStrategy, calculateLeg } from '../../../shared/calculations.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Database } from '../db/database.js';

const defaults = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../../shared/profiles.json', import.meta.url)), 'utf8'));
function invalid(message: string): never { throw Object.assign(new Error(message), { status: 400 }); }
const number = (v: any, label: string, min = 0) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) invalid(`${label} must be a finite number >= ${min}`);
  return v as number;
};
const text = (v: any, label: string) => { if (typeof v !== 'string' || v.length > 20000) invalid(`Invalid ${label}`); return v as string; };
const date = (v: any, label: string) => { if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) invalid(`Invalid ${label}`); return v; };

export async function profiles(db: Database) {
  return Promise.all(defaults.map(async (p: any) => {
    const saved = await db.get('SELECT * FROM profile_templates WHERE profile=?', [p.id]);
    return { ...p, version: saved?.version || 1, fields: saved ? JSON.parse(saved.fields) : p.fields };
  }));
}

export function frameworkRoutes(db: Database) {
  const router = express.Router();
  router.get('/', async (_req, res, next) => { try { res.json(await profiles(db)); } catch (e) { next(e); } });
  router.put('/:id', async (req, res, next) => {
    try {
      const p = (await profiles(db)).find(p => p.id === req.params.id);
      if (!p) invalid('Unknown profile');
      const fields = req.body.fields;
      if (!Array.isArray(fields) || fields.length > 100) invalid('Expected up to 100 fields');
      const keys = new Set();
      for (const f of fields) {
        if (!f || typeof f.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(f.key) || keys.has(f.key)) invalid('Field keys must be unique identifiers');
        keys.add(f.key); text(f.label, 'field label');
        if (!['text', 'number', 'select'].includes(f.type)) invalid('Unknown field type');
        if (f.type === 'select' && (!Array.isArray(f.options) || !f.options.length || f.options.some((o: any) => typeof o !== 'string' || !o.trim()))) invalid('Dropdown fields need nonempty options');
      }
      await db.run('INSERT INTO profile_templates (profile, version, fields) VALUES (?, ?, ?) ON CONFLICT(profile) DO UPDATE SET version=excluded.version, fields=excluded.fields', [p.id, p.version + 1, JSON.stringify(fields)]);
      res.json({ version: p.version + 1 });
    } catch (e) { next(e); }
  });
  return router;
}

export function enrichTrade(t: any) {
  const f = t.framework ? JSON.parse(t.framework) : null;
  const result = f?.legs?.length ? calculateStrategy(f.legs, t.costs || 0) : null;
  return { framework:f, multiplier:t.multiplier ?? t.pointValue, grossPnl:t.grossPnl ?? t.pnl,
    realisedPnl:result?.netRealised ?? t.pnl, unrealisedPnl:result?.unrealised ?? null, totalCosts:result?.costs ?? t.costs ?? 0 };
}

export async function validateFramework(db: Database, b: any, inst: any, existing: any) {
  const p = (await profiles(db)).find(p => p.id === (b.profile || 'prop'));
  if (!p) invalid('Unknown recording profile');
  if (!['Long', 'Short'].includes(b.direction) || !['CFD', 'Futures', 'Option', 'Equity'].includes(b.contractType)) invalid('Invalid direction or base contract');
  if (!['Open', 'Closed'].includes(b.status)) invalid('Invalid status');
  date(b.entryDateTime, 'entry time');
  if (b.exitDateTime) { date(b.exitDateTime, 'exit time'); if (Date.parse(b.exitDateTime) < Date.parse(b.entryDateTime)) invalid('Exit precedes entry'); }
  if (b.status === 'Closed' && !b.exitDateTime) invalid('Closed trades need an exit time');
  number(b.entryPrice, 'Entry price'); number(b.quantity, 'Quantity', Number.MIN_VALUE);
  if (b.exitPrice != null) number(b.exitPrice, 'Exit price');
  for (const k of ['slPrice', 'targetPrice']) if (b[k] != null) number(b[k], k);
  const holdingStyle = b.holdingStyle || p.holdingStyles[0];
  if (!p.holdingStyles.includes(holdingStyle)) invalid('Invalid holding style for this profile');
  const assetType = b.assetType || inst.type;
  if (!['Option', 'Equity', 'Futures', 'CFD'].includes(assetType)) invalid('Invalid asset type');
  if (p.id.startsWith('options') && assetType !== 'Option') invalid('Options profiles require Option asset type');
  if (p.id === 'cash' && assetType !== 'Equity') invalid('Cash profile requires Equity asset type');
  const costs = number(b.costs ?? 0, 'Costs');
  const plannedRisk = b.plannedRisk == null ? null : number(b.plannedRisk, 'Planned risk', Number.MIN_VALUE);
  const capitalCommitted = b.capitalCommitted == null ? null : number(b.capitalCommitted, 'Capital / margin committed');
  const multiplier = number(b.multiplier ?? existing?.multiplier ?? inst.pointValue, 'Multiplier', Number.MIN_VALUE);
  const old = existing?.framework ? JSON.parse(existing.framework) : null;
  const f = b.framework || {};
  const template = old && existing.profile === p.id ? { fields: old.fields, version: old.templateVersion } : p;
  const analysis = f.analysis || {};
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) invalid('Invalid analysis');
  for (const [key, value] of Object.entries(analysis)) {
    const field = template.fields.find((a: any) => a.key === key);
    if (!field) invalid(`Unknown analysis field: ${key}`);
    if (value === '') continue;
    if (field.type === 'number') {
      number(value, field.label, -Number.MAX_VALUE);
      if (key === 'ivp' && ((value as number) < 0 || (value as number) > 100)) invalid('IVP must be 0–100');
      if (/Touches$/.test(key) && (!Number.isInteger(value) || (value as number) < 0)) invalid('Touches must be nonnegative integers');
    } else { text(value, field.label); if (field.type === 'select' && !field.options.includes(value)) invalid(`Invalid ${field.label}`); }
  }
  const legs = f.legs || [];
  if (!Array.isArray(legs) || legs.length > 50) invalid('Invalid legs');
  if (p.id === 'options_hedged' && legs.length < 2) invalid('A hedged strategy requires at least two legs');
  for (const l of legs) {
    if (l.entryDateTime) date(l.entryDateTime, 'leg entry time');
    if (l.exitDateTime) date(l.exitDateTime, 'leg exit time');
    if (l.entryDateTime && l.exitDateTime && Date.parse(l.exitDateTime) < Date.parse(l.entryDateTime)) invalid('Leg exit precedes entry');
    if (!text(l.symbol, 'leg symbol').trim()) invalid('Leg symbol required');
    if (!['Buy', 'Sell'].includes(l.side)) invalid('Invalid leg side');
    if (!['Option', 'Equity', 'Futures', 'CFD'].includes(l.assetType)) invalid('Invalid leg asset');
    if (p.id === 'cash' && l.assetType !== 'Equity') invalid('Cash trades require equity legs');
    if (p.id === 'options_scalping' && l.assetType !== 'Option') invalid('Options scalping requires option legs');
    number(l.quantity, 'Leg quantity', Number.MIN_VALUE); number(l.multiplier, 'Leg multiplier', Number.MIN_VALUE); number(l.entryPrice, 'Leg entry');
    if (l.exitPrice != null) number(l.exitPrice, 'Leg exit');
    if (l.markPrice != null) number(l.markPrice, 'Mark price');
    if (l.executions != null) {
      if (!Array.isArray(l.executions) || l.executions.length > 500) invalid('Invalid executions');
      for (const fill of l.executions) {
        if (!['Entry', 'Exit'].includes(fill.action)) invalid('Invalid execution action');
        date(fill.time, 'execution time'); number(fill.quantity, 'Execution quantity', Number.MIN_VALUE);
        number(fill.price, 'Execution price'); number(fill.costs, 'Execution costs');
        if (Date.parse(fill.time) < Date.parse(b.entryDateTime)) invalid('Execution precedes trade entry');
        if (b.exitDateTime && Date.parse(fill.time) > Date.parse(b.exitDateTime)) invalid('Execution follows trade exit');
      }
      try { calculateLeg(l); } catch (e) { invalid((e as Error).message); }
    }
    if (b.status === 'Closed' && calculateLeg(l).openQuantity > 0) invalid('Close all legs before closing the strategy');
    if (l.assetType === 'Option') {
      if (!['Call', 'Put'].includes(l.optionType)) invalid('Option leg needs Call/Put');
      number(l.strike, 'Strike', Number.MIN_VALUE); date(l.expiry, 'expiry');
    }
  }
  if (assetType === 'Option' && p.id !== 'options_scalping' && !legs.length) invalid('Add an option leg with expiry, strike and Call/Put');
  const optionSummary: { optionType?: string; strike?: number | null; delta?: number | null } = {};
  if (p.id === 'options_scalping') {
    if (f.optionType != null && f.optionType !== '' && !['CE', 'PE'].includes(f.optionType)) invalid('Option type must be CE or PE');
    optionSummary.optionType = f.optionType || '';
    optionSummary.strike = f.strike == null ? null : number(f.strike, 'Strike', Number.MIN_VALUE);
    optionSummary.delta = f.delta == null ? null : number(f.delta, 'Strike delta', -1);
    if (optionSummary.delta != null && optionSummary.delta > 1) invalid('Strike delta must be between -1 and 1');
  }
  if (b.status === 'Closed' && !legs.length && b.exitPrice == null) invalid('Closed trades need an exit price');
  const grossPnl = b.status === 'Closed' ? Math.round((legs.length ? calculateStrategy(legs).grossRealised : (b.exitPrice - b.entryPrice) * (b.direction === 'Long' ? 1 : -1) * b.quantity * multiplier) * 100) / 100 : null;
  return { profile: p.id, holdingStyle, assetType, account: text(b.account || 'Personal', 'account'), strategy: text(b.strategy || '', 'strategy'), plannedRisk, capitalCommitted, costs, multiplier, grossPnl,
    pnl: grossPnl == null ? null : Math.round((grossPnl - (legs.length ? calculateStrategy(legs, costs).costs : costs)) * 100) / 100,
    framework: { ...optionSummary, templateVersion: template.version, fields: template.fields, analysis,
      observedAt: f.observedAt ? date(f.observedAt, 'observation time') : '', source: text(f.source || '', 'source'),
      thesis: text(f.thesis || '', 'thesis'), exitReason: text(f.exitReason || '', 'exit reason'), review: text(f.review || '', 'review'),
      adjustments: text(f.adjustments || '', 'adjustments'), legs }
  };
}
