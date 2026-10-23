import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const port=18800+Math.floor(Math.random()*100), origin=`http://127.0.0.1:${port}`;
const p=spawn(process.execPath,['deploy/portal.mjs'],{env:{...process.env,PORTAL_PORT:String(port),JOURNAL_USER:'test',JOURNAL_PASSWORD:'secret',PORTAL_ORIGIN:origin}});
try {
let r; for(let i=0;i<100;i++){try{r=await fetch(origin);break}catch{await new Promise(r=>setTimeout(r,50))}}
assert.ok(r);const cookie=r.headers.get('set-cookie').split(';')[0];const csrf=/name="csrf" value="([^"]+)"/.exec(await r.text())[1];
assert.equal((await fetch(origin+'/verify')).status,401);
const login=(password,site=origin)=>fetch(origin+'/login',{method:'POST',redirect:'manual',headers:{Cookie:cookie,Origin:site},body:new URLSearchParams({username:'test',password,csrf})});
assert.equal((await login('secret','https://evil.example')).status,403);
assert.equal((await login('bad')).status,401);
const ok=await login('secret');assert.equal(ok.status,303);const auth=ok.headers.get('set-cookie').split(';')[0];assert.notEqual(auth,cookie);
assert.equal((await fetch(origin+'/verify',{headers:{Cookie:cookie}})).status,401);
assert.equal((await fetch(origin+'/verify',{headers:{Cookie:auth}})).status,204);
const home=await(await fetch(origin,{headers:{Cookie:auth}})).text();assert.match(home,/href="\/journal\/"/);assert.match(home,/href="\/fnoanalyzer\/"/);
await fetch(origin+'/logout',{method:'POST',redirect:'manual',headers:{Cookie:auth,Origin:origin},body:new URLSearchParams({csrf:/name="csrf" value="([^"]+)"/.exec(home)[1]})});
assert.equal((await fetch(origin+'/verify',{headers:{Cookie:auth}})).status,401);
console.log('Portal login, CSRF, session rotation, links and logout passed');
}finally{p.kill()}
