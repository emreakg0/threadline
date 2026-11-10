// Requires a Chromium instance listening on remote debugging port 9222.
// All users, sessions and tasks below are isolated test fixtures, removed in finally.
import pg from '../node_modules/pg/lib/index.js';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const count=Number(process.env.CITY_TEST_COUNT??18);
assert.ok(Number.isInteger(count)&&count>=0&&count<=100);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const extraProject=randomUUID();
const uid='city-browser-'+randomUUID(),project=randomUUID(),token=randomBytes(32).toString('hex');
let ws,target;const pending=new Map();let seq=0;const errors=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},20000);pending.set(id,{resolve:r=>{clearTimeout(timeout);resolve(r)},reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
const until=async expression=>{const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(`Boolean(${expression})`))return;await new Promise(r=>setTimeout(r,200));}console.log('BODY',await evaluate('document.body.innerText'));console.log('ERRORS',errors);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/focus-city-failure.png',Buffer.from(shot.data,'base64'));throw Error('Browser assertion timed out: '+expression);};
try{
 await pool.query('INSERT INTO focus_users VALUES($1,$2,$3)',[uid,'City QA','qa@example.invalid']);
 await pool.query("INSERT INTO focus_sessions VALUES($1,$2,now()+interval '10 minutes')",[createHash('sha256').update(token).digest('hex'),uid]);
 await pool.query("INSERT INTO focus_projects(id,user_id,name) VALUES($1,$2,'Creative Quarter')",[project,uid]);
 await pool.query("INSERT INTO focus_projects(id,user_id,name) VALUES($1,$2,'Zen Quarter')",[extraProject,uid]);
 for(let i=0;i<count;i++)await pool.query('INSERT INTO focus_tasks(id,user_id,project_id,title,description,status,priority,due_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),uid,project,'City QA task '+(i+1),'A saved task, represented by a real building.',count===1?'todo':i%3===0?'done':i%3===1?'in_progress':'todo',count===1?'medium':['high','medium','low'][i%3],'2027-01-12']);
 target=await (await fetch('http://127.0.0.1:9222/json/new?about:blank',{method:'PUT'})).json();ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(JSON.stringify(m.params.exceptionDetails));});
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCookie',{name:'focus_session',value:token,url:'http://127.0.0.1:21644',httpOnly:true,sameSite:'Lax'});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1200,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:21644'});
 await until(`document.querySelector('.city-canvas canvas')`);
 await new Promise(r=>setTimeout(r,2000));
 assert.equal(await evaluate(`document.querySelectorAll('.city-task-picker option').length`),count+1);
const canvasRect=await evaluate(`(()=>{const r=document.querySelector('.city-canvas').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`);
 const overview=await send('Page.captureScreenshot',{format:'png',clip:canvasRect,captureBeyondViewport:true});await writeFile(`/tmp/focus-city-${count}-overview.png`,Buffer.from(overview.data,'base64'));
 if(count>0){
 const rect=await evaluate(`(()=>{const r=document.querySelector('.city-canvas canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
 let clicked=false;for(const fy of [.5,.6,.7]){for(const fx of [.5,.45,.55]){const x=rect.x+rect.w*fx,y=rect.y+rect.h*fy;await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,100));if(await evaluate(`Boolean(document.querySelector('.building-inspector'))`)){clicked=true;break;}}if(clicked)break;}assert.ok(clicked,'Click-to-select building');
 const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile('/tmp/focus-city-desktop.png',Buffer.from(screenshot.data,'base64'));
 await evaluate(`(()=>{const s=document.querySelector('.city-task-picker select');s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await until(`document.querySelector('.building-inspector')?.textContent.includes('A saved task')`);
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Edit details')).click()`);
 assert.equal(await evaluate(`document.activeElement?.getAttribute('name')`),'title');
 }
 await evaluate(`Array.from(document.querySelectorAll('.view-switch button')).find(b=>b.textContent.includes('List')).click()`);await until(`!document.querySelector('.city-panel')`);
 await evaluate(`Array.from(document.querySelectorAll('.view-switch button')).find(b=>b.textContent.includes('City')).click()`);await until(`document.querySelector('.city-canvas canvas')`);
await evaluate(`document.querySelectorAll('.district-badges button')[1].click()`);await until(`document.querySelectorAll('.district-badges button')[1].getAttribute('aria-pressed')==='true' && document.querySelector('.city-empty')`);
 await evaluate(`document.querySelectorAll('.district-badges button')[0].click()`);await until(`document.querySelectorAll('.district-badges button')[0].getAttribute('aria-pressed')==='true'`);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,600));
 assert.ok(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth+1`),'Mobile horizontal overflow');
 await evaluate(`document.querySelector('.city-panel').scrollIntoView({block:'start'})`);
 const mobile=await send('Page.captureScreenshot',{format:'png'});await writeFile(`/tmp/focus-city-${count}-mobile.png`,Buffer.from(mobile.data,'base64'));
 await evaluate(`document.querySelector('.city-canvas canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`);await until(`document.querySelector('.city-fallback')?.textContent.includes('Open List View')`);
 await evaluate(`document.querySelector('.city-fallback button').click()`);await until(`!document.querySelector('.city-panel')`);
 await pool.query('DELETE FROM focus_tasks WHERE user_id=$1',[uid]);await send('Page.reload');await until(`document.querySelector('.city-empty') && document.querySelector('.city-canvas canvas')`);assert.equal(await evaluate(`document.querySelectorAll('.city-task-picker option').length`),1);
 assert.deepEqual(errors,[]);console.log(`PASS: ${count}-task city rendering, framing screenshot, selection/editor when populated, view/neighborhood switching, mobile overflow, real context-loss fallback and empty city; no browser exceptions`);
}finally{
 if(target)await fetch('http://127.0.0.1:9222/json/close/'+target.id).catch(()=>{});ws?.close();
 await pool.query('DELETE FROM focus_tasks WHERE user_id=$1',[uid]);await pool.query('DELETE FROM focus_projects WHERE user_id=$1',[uid]);await pool.query('DELETE FROM focus_sessions WHERE user_id=$1',[uid]);await pool.query('DELETE FROM focus_users WHERE id=$1',[uid]);await pool.query('DELETE FROM focus_city_counters WHERE scope=ANY($1::text[])',[['user:'+uid,'project:'+project,'project:'+extraProject]]);await pool.end();
}
