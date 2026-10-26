import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../client/package.json', import.meta.url));
const ts = require('typescript');
const source = await readFile(new URL('../client/src/utils/textTrade.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace("from 'yaml'", `from '${new URL('../client/node_modules/yaml/dist/index.js', import.meta.url).href}'`)
  .replace("from '../../../shared/calculations.js'", `from '${new URL('../shared/calculations.js', import.meta.url).href}'`);
const { parseTextTrade, tradeTemplate, toggleTextTag } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const profiles = JSON.parse(await readFile(new URL('../shared/profiles.json', import.meta.url), 'utf8')).map(p => ({ ...p, version: 1 }));
const ctx = { profiles, instruments: [{ id: 1, name: 'TEST: #1', type: 'CFD', pointValue: 2 }], categories: [
  { id: 1, name: 'Setup: #1', tags: [{ id: 11, name: 'Breakout' }, { id: 12, name: 'Tag, with comma' }] },
  { id: 2, name: 'Execution', tags: [{ id: 21, name: 'Breakout' }] },
] };
const base = `profile: prop
instrument: "TEST: #1"
asset_type: CFD
holding_style: Intraday
direction: Long
entry_time: "2026-10-26 09:30"
entry_price: 100
quantity: 2
status: Closed
exit_time: "2026-10-26 10:30"
exit_price: 110
costs: 5
analysis:
  stage: Funded
tags:
  "Setup: #1": [Breakout, "Tag, with comma"]
  Execution: [Breakout]
comments: |
  Preserve # in comments.
  And a second line: here.
`;
const parse = text => parseTextTrade(text, ctx);
const good = parse(base);
assert.deepEqual(good.errors, []);
assert.equal(good.payload.entryDateTime, '2026-10-26T04:00:00.000Z');
assert.deepEqual(good.payload.tags, [11, 12, 21]);
assert.equal(good.pnl, 35);
assert.match(good.payload.comments, /Preserve # in comments.\nAnd a second line: here./);
assert.equal(parse(toggleTextTag(base, 'Setup: #1', 'Breakout')).payload.tags.includes(11), false);
const noTags = base.replace(/tags:[\s\S]*?comments:/, 'comments:');
assert.deepEqual(parse(toggleTextTag(noTags, 'Setup: #1', 'Breakout')).payload.tags, [11]);
assert.match(toggleTextTag('# Keep this comment\n' + base, 'Setup: #1', 'Breakout'), /# Keep this comment/);
const bad = (text, pattern) => assert.match(parse(text).errors.join('\n'), pattern);
bad(base + 'entyr_price: 10\n', /Line \d+: entyr_price: unknown/);
bad(base.replace('09:30', '25:30'), /valid IST/);
bad(base.replace('2026-10-26 09:30', '2026-02-30 09:30'), /valid IST/);
bad(base.replace('10:30', '08:30'), /exit precedes/);
bad(base.replace('entry_price: 100', 'entry_price: .inf'), /finite number/);
bad(base.replace('quantity: 2', 'quantity: 0'), /quantity/);
bad(base.replace('stage: Funded', 'stage: Wrong'), /Evaluation \| Funded/);
bad(base.replace('Execution: [Breakout]', 'Execution: [Unknown]'), /unknown or ambiguous tag/);
bad(base.replace('Execution: [Breakout]', 'Execution: Breakout'), /expected a list/);
bad(base + 'quantity: 5\n', /unique/);
bad('profile: &p prop\naccount: *p\n', /aliases/);
bad(base.replace('costs: 5', 'costs: "5"'), /finite number/);
bad(base.replace('exit_price: 110', 'exit_price:'), /exit_price: required/);
for (const p of profiles) {
  const template = tradeTemplate(p, ctx);
  assert.match(template, /# Instruments: "TEST: #1"/);
  assert.match(template, /# Options: "Breakout" \| "Tag, with comma"/);
  assert.doesNotMatch(parse(template).errors.join('\n'), /unknown field|expected a mapping|must be unique/);
  for (const f of p.fields.filter(f => f.type === 'select')) for (const opt of f.options) assert.ok(template.includes(JSON.stringify(opt)));
}
const leg = `  - symbol: TEST
    asset_type: Option
    side: Buy
    expiry: "2026-10-29"
    option_type: Call
    strike: 100
    quantity: 2
    multiplier: 1
    entry_price: 10
    exit_price: 15
`;
const hedge = base.replace('profile: prop', 'profile: options_hedged').replace('asset_type: CFD', 'asset_type: Option').replace('holding_style: Intraday', 'holding_style: Positional').replace('  stage: Funded', '  ivp: 50') + 'legs:\n' + leg + leg.replace('side: Buy', 'side: Sell');
assert.deepEqual(parse(hedge).errors, []);
assert.equal(parse(hedge).pnl, -5);
bad(hedge.replace('option_type: Call', 'option_type: CE'), /Call \| Put/);
bad(hedge.replace('expiry: "2026-10-29"', 'expiry: "2026-02-30"'), /valid YYYY-MM-DD/);
bad(hedge.replace('  ivp: 50', '  ivp: 101'), /0–100/);
const scalp = base.replace('profile: prop', 'profile: options_scalping').replace('asset_type: CFD', 'asset_type: Option').replace('  stage: Funded', '  supportStrength: Strong') + 'option_type: CE\nstrike: 100\ndelta: 0.5\n';
assert.deepEqual(parse(scalp).errors, []);
bad(scalp.replace('delta: 0.5', 'delta: 1.5'), /between -1 and 1/);
console.log('Text trade parser, templates, tags, dates, and strategy validation passed');
