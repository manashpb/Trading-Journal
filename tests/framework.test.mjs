import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { calculateLeg } from '../shared/calculations.js';

const dir = await mkdtemp(path.join(os.tmpdir(), 'journal-test-'));
const port = 15300 + Math.floor(Math.random() * 1000);
let logs = '';
const child = spawn(process.execPath, ['server/dist/index.js'], { env:{...process.env, PORT:String(port), NODE_ENV:'production', JOURNAL_USER:'test', JOURNAL_PASSWORD:'test-password', DB_PATH:path.join(dir,'test.db'), SNAPSHOTS_DIR:path.join(dir,'snapshots')}, stdio:['ignore','pipe','pipe'] });
child.stdout.on('data', b => logs += b);
child.stderr.on('data', b => logs += b);
const base = `http://127.0.0.1:${port}`;
async function request(url, method = 'GET', body, status = 200) {
  const res = await fetch(base + url, {method, headers:{Authorization:'Basic ' + Buffer.from('test:test-password').toString('base64'),'Content-Type':'application/json'}, body:body ? JSON.stringify(body) : undefined});
  const data = await res.json(); assert.equal(res.status,status, JSON.stringify(data)); return data;
}
try {
  // Fresh SQLite migrations can take longer on a cloud disk than on local SSDs.
  let ready = false;
  for (let i=0; i<600; i++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error('Test server exited before startup');
    try { if ((await fetch(base+'/api/health')).ok) { ready = true; break; } } catch {}
    await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready, 'Test server did not become ready within 60 seconds');
  assert.equal((await fetch(base+'/api/trades')).status,401);
  assert.equal((await fetch(base+'/trades')).status,401);
  const html = await fetch(base+'/trades',{headers:{Authorization:'Basic '+Buffer.from('test:test-password').toString('base64')}});
  assert.equal(html.status,200); assert.match(await html.text(), /<div id="root">/);
  const profiles = await request('/api/profiles'); assert.equal(profiles.length,4);
  const instrument = await request('/api/instruments','POST',{name:'TEST',type:'Option',pointValue:1});
  await request('/api/instruments','POST',{name:'Bad',type:'Option',pointValue:0},400);
  const common = {instrumentId:instrument.id,direction:'Long',contractType:'Option',entryDateTime:'2026-10-09T04:00:00Z',entryPrice:100,quantity:1,exitDateTime:'2026-10-09T05:00:00Z',exitPrice:110,status:'Closed',account:'Test',costs:5,plannedRisk:100};
  const leg = {symbol:'TEST',assetType:'Option',side:'Buy',expiry:'2026-10-29',strike:100,optionType:'Call',quantity:10,multiplier:1,entryPrice:100,exitPrice:110};
  const hedge = {...common,profile:'options_hedged',assetType:'Option',holdingStyle:'Positional',framework:{analysis:{iv:25,ivp:70},legs:[leg,{...leg,side:'Sell',entryPrice:50,exitPrice:45}]}};
  const {id} = await request('/api/trades','POST',hedge);
  const saved = await request('/api/trades/'+id); assert.equal(saved.grossPnl,150); assert.equal(saved.pnl,145); assert.equal(saved.framework.legs.length,2);
  const timedLeg = {...leg,entryDateTime:common.entryDateTime,exitDateTime:common.exitDateTime};
  const timed = await request('/api/trades','POST',{...hedge,framework:{...hedge.framework,legs:[timedLeg,{...timedLeg,side:'Sell'}]}});
  const timedSaved = await request('/api/trades/'+timed.id);
  assert.equal(timedSaved.framework.legs[0].entryDateTime,common.entryDateTime);
  assert.equal(timedSaved.framework.legs[0].exitDateTime,common.exitDateTime);
  await request('/api/trades/'+timed.id,'PUT',{...timedSaved,framework:{...timedSaved.framework,legs:[{...timedLeg,exitDateTime:'2026-10-09T04:30:00Z'},timedLeg]}});
  assert.equal((await request('/api/trades/'+timed.id)).framework.legs[0].exitDateTime,'2026-10-09T04:30:00Z');
  for (const patch of [{entryDateTime:'invalid'},{exitDateTime:'invalid'},{exitDateTime:'2026-10-09T03:00:00Z'}]) await request('/api/trades','POST',{...hedge,framework:{...hedge.framework,legs:[{...timedLeg,...patch},timedLeg]}},400);
  await request('/api/trades','POST',{...hedge,framework:{...hedge.framework,analysis:{ivp:101}}},400);
  await request('/api/trades','POST',{...hedge,framework:{...hedge.framework,legs:[leg]}},400);
  await request('/api/trades','POST',{...hedge,framework:{...hedge.framework,legs:[{...leg,quantity:-1},leg]}},400);
  const fields = [...profiles.find(p=>p.id==='options_hedged').fields,{key:'customNote',label:'Custom note',type:'text'}];
  await request('/api/profiles/options_hedged','PUT',{fields});
  await request('/api/trades/'+id,'PUT',{...saved,framework:{...saved.framework,review:'Reviewed'}});
  assert.equal((await request('/api/trades/'+id)).framework.templateVersion,1);
  const newTrade = await request('/api/trades','POST',{...hedge,framework:{...hedge.framework,analysis:{customNote:'New'}}});
  assert.equal((await request('/api/trades/'+newTrade.id)).framework.templateVersion,2);
  for (const profile of ['cash','prop','options_scalping']) {
    const options = profile.startsWith('options');
    const trade = await request('/api/trades','POST',{...common, profile, assetType:profile==='cash'?'Equity':options?'Option':'CFD', contractType:profile==='cash'?'Equity':options?'Option':'CFD',framework:{analysis:{},legs:options?[leg]:[]}});
    assert.equal((await request('/api/trades/'+trade.id)).profile,profile);
  }
  const scalp = {...common,profile:'options_scalping',assetType:'Option',framework:{optionType:'PE',strike:25000,delta:-0.45,legs:[]}};
  const scalpId = (await request('/api/trades','POST',scalp)).id;
  const scalpSaved = await request('/api/trades/'+scalpId);
  assert.equal(scalpSaved.framework.optionType,'PE'); assert.equal(scalpSaved.framework.strike,25000); assert.equal(scalpSaved.framework.delta,-0.45); assert.equal(scalpSaved.pnl,5);
  await request('/api/trades/'+scalpId,'PUT',{...scalpSaved,framework:{...scalpSaved.framework,optionType:'CE',delta:0.6}});
  assert.equal((await request('/api/trades/'+scalpId)).framework.delta,0.6);
  for (const patch of [{optionType:'invalid'},{strike:0},{delta:1.1},{delta:-1.1}]) await request('/api/trades','POST',{...scalp,framework:{...scalp.framework,...patch}},400);
  await request('/api/trades','POST',{...common,profile:'options_scalping',assetType:'Option',holdingStyle:'Swing',framework:{legs:[leg]}},400);
  const executions = [{action:'Entry',time:'2026-10-09T04:00:00Z',quantity:10,price:100,costs:1},{action:'Exit',time:'2026-10-09T04:30:00Z',quantity:4,price:120,costs:1}];
  const partial = await request('/api/trades','POST',{...common,status:'Open',exitDateTime:null,exitPrice:null,profile:'options_scalping',assetType:'Option',framework:{legs:[{...leg,exitPrice:null,markPrice:110,executions}]}});
  const result = await request('/api/trades/'+partial.id); assert.equal(result.realisedPnl,73); assert.equal(result.unrealisedPnl,60); assert.equal(result.pnl,null);
  await request('/api/trades/'+partial.id,'PUT',{...result,status:'Closed',exitDateTime:common.exitDateTime},400);
  assert.throws(()=>calculateLeg({...leg,executions:[...executions,{action:'Exit',time:'2026-10-09T04:40:00Z',quantity:7,price:120,costs:0}]}),/exceeds/);
  const category = await request('/api/tags/categories','POST',{name:'Regression tags'});
  const tag = await request('/api/tags/categories/' + category.id + '/tags','POST',{name:'Breakout, confirmed'});
  const tagged = await request('/api/trades','POST',{...common,profile:'cash',assetType:'Equity',contractType:'Equity',tags:[tag.id]});
  let taggedDetail = await request('/api/trades/' + tagged.id);
  assert.deepEqual(taggedDetail.tags,[tag.id]); assert.deepEqual(taggedDetail.tagNames,['Breakout, confirmed']);
  await request('/api/trades/' + tagged.id,'PUT',{...taggedDetail,comments:'Updated without changing tags'});
  taggedDetail = await request('/api/trades/' + tagged.id); assert.deepEqual(taggedDetail.tags,[tag.id]);
  const {tags:ignoredTags, ...withoutTags} = taggedDetail;
  await request('/api/trades/' + tagged.id,'PUT',withoutTags);
  assert.deepEqual((await request('/api/trades/' + tagged.id)).tags,[tag.id]);
  await request('/api/trades/' + tagged.id,'PUT',{...taggedDetail,tags:[]});
  assert.deepEqual((await request('/api/trades/' + tagged.id)).tags,[]);
  const count = (await request('/api/trades')).length;
  await request('/api/trades','POST',{...hedge,tags:[999999]},500);
  assert.equal((await request('/api/trades')).length,count,'Failed write must roll back');
  await request('/api/trades/'+id,'DELETE'); await request('/api/trades/'+id,'GET',undefined,404);
  const snapshot = await fetch(base+'/api/trades/999999/snapshots',{method:'POST',headers:{Authorization:'Basic '+Buffer.from('test:test-password').toString('base64')}}); assert.equal(snapshot.status,404);
  console.log('PASS: four profiles, multi-leg P&L, partial exits, validation, template history, rollback, tag persistence/unselection, auth, production SPA serving');
} catch (e) { console.error(logs); throw e; }
finally { if (child.exitCode === null && child.signalCode === null) { const stopped = new Promise(r=>child.once('exit',r)); child.kill(); await stopped; } await rm(dir,{recursive:true,force:true}); }
