import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
// Isolated configuration for this test process only; no external OAuth requests.
process.env.APP_ORIGIN='http://localhost:5173';
process.env.GOOGLE_CLIENT_ID='integration-test-client';
process.env.GOOGLE_CLIENT_SECRET='integration-test-secret';
const {default:app}=await import('./app');
const {pool}=await import('@workspace/db');
const {api}=await import(new URL('../../productivity-app/src/api.ts', import.meta.url).href);
const server=app.listen(0,'127.0.0.1');
await new Promise<void>(resolve=>server.on('listening',resolve));
const address=server.address();if(!address||typeof address==='string')throw Error('No address');
const base=`http://127.0.0.1:${address.port}/api`;
const ids=[`focus-test-${randomUUID()}`,`focus-test-${randomUUID()}`];
const projects=[randomUUID(),randomUUID()];
const tokens=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')];
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const headers=(i=0)=>({cookie:`focus_session=${tokens[i]}`,origin:process.env.APP_ORIGIN!,'Content-Type':'application/json'});
const realFetch=globalThis.fetch;
let oauthState:string|undefined;
try {
 let response=await fetch(base+'/auth/me');assert.equal(response.status,200);assert.match(response.headers.get('content-type')! ,/application\/json/);assert.deepEqual(await response.json(),{user:null,configured:true});
 assert.equal((await fetch(base+'/tasks')).status,401);
 response=await fetch(base+'/auth/google',{redirect:'manual'});assert.equal(response.status,302);const url=new URL(response.headers.get('location')!);assert.equal(url.searchParams.get('redirect_uri'),'http://localhost:5173/api/auth/google/callback');oauthState=url.searchParams.get('state')!;
 response=await fetch(base+'/auth/google/callback?state=invalid');assert.equal(response.status,400);assert.ok((await response.json() as {error:string}).error);
 for(let i=0;i<2;i++){
 await pool.query('INSERT INTO focus_users VALUES($1,$2,$3)',[ids[i],'Integration test','test@example.invalid']);
 await pool.query("INSERT INTO focus_sessions VALUES($1,$2,now()+interval '1 hour')",[hash(tokens[i]),ids[i]]);
 await pool.query("INSERT INTO focus_projects(id,user_id,name,inbox) VALUES($1,$2,'Test Inbox',true)",[projects[i],ids[i]]);
 }
 response=await fetch(base+'/auth/me',{headers:headers()});assert.equal((await response.json() as {user:{id:string}}).user.id,ids[0]);
 response=await fetch(base+'/tasks',{method:'POST',headers:headers(),body:JSON.stringify({title:'Integration task',project_id:projects[0],priority:'high',due_date:'2027-01-12'})});assert.equal(response.status,201);const task=await response.json() as {id:string;version:number;city_slot:number};
 assert.equal(Number.isInteger(task.city_slot),true);
 response=await fetch(base+'/tasks',{headers:headers()});const refreshed=await response.json() as {id:string;title:string;city_slot:number}[];
 assert.equal(refreshed[0].id,task.id);assert.equal(refreshed[0].title,'Integration task');assert.equal(refreshed[0].city_slot,task.city_slot);
 response=await fetch(base+'/tasks',{headers:headers(1)});assert.deepEqual(await response.json(),[]);
 response=await fetch(base+'/tasks',{method:'POST',headers:headers(1),body:JSON.stringify({title:'Unauthorized project',project_id:projects[0]})});assert.equal(response.status,404);
 const patch={title:'Edited task',description:'Saved',status:'done',priority:'high',due_date:'2027-01-12',version:task.version};
 response=await fetch(base+'/tasks/'+task.id,{method:'PATCH',headers:headers(),body:JSON.stringify(patch)});assert.equal(response.status,200);
 response=await fetch(base+'/tasks',{headers:headers()});const saved=(await response.json() as {status:string;title:string;description:string;priority:string;due_date:string;city_slot:number}[])[0];
 assert.equal(saved.status,'done');assert.equal(saved.title,'Edited task');assert.equal(saved.description,'Saved');assert.equal(saved.priority,'high');assert.equal(saved.due_date,'2027-01-12');assert.equal(saved.city_slot,task.city_slot);
 response=await fetch(base+'/tasks/'+task.id,{method:'PATCH',headers:headers(),body:JSON.stringify(patch)});assert.equal(response.status,409);
 response=await fetch(base+'/tasks/'+task.id,{method:'DELETE',headers:headers(1)});assert.equal(response.status,204);
 response=await fetch(base+'/tasks',{headers:headers()});assert.equal((await response.json() as unknown[]).length,1);
 response=await fetch(base+'/tasks/'+task.id,{method:'DELETE',headers:headers()});assert.equal(response.status,204);
 response=await fetch(base+'/tasks',{headers:headers()});assert.deepEqual(await response.json(),[]);
 response=await fetch(base+'/tasks',{method:'POST',headers:headers(),body:JSON.stringify({title:'Next building',project_id:projects[0]})});assert.equal(response.status,201);assert.ok((await response.json() as {city_slot:number}).city_slot>task.city_slot);
 response=await fetch(base+'/tasks',{method:'POST',headers:headers(),body:'{'});assert.equal(response.status,400);assert.ok((await response.json() as {error:string}).error);
 response=await fetch(base+'/auth/logout',{method:'POST',headers:headers()});assert.equal(response.status,204);
 response=await fetch(base+'/auth/me',{headers:headers()});assert.equal((await response.json() as {user:unknown}).user,null);
 for(const [status,body] of [[500,''],[502,'Bad gateway'],[200,'<html>fallback</html>'],[200,'']] as const){globalThis.fetch=async()=>new Response(body,{status});await assert.rejects(()=>api('/auth/me'),error=>error instanceof Error && !/Unexpected/.test(error.message) && error.message.includes('/api/auth/me'));}
 globalThis.fetch=async()=>new Response(JSON.stringify({user:null,configured:true}),{status:200});assert.deepEqual(await api('/auth/me'),{user:null,configured:true});
 globalThis.fetch=async()=>new Response(null,{status:204});assert.equal(await api('/tasks/123','DELETE'),null);
 console.log('PASS: refresh persistence, stable building slots, monotonic allocation, auth initialization, Google redirect/state, persistent task CRUD, isolation, version conflicts, logout, malformed bodies, empty/non-JSON response handling');
} finally {
 globalThis.fetch=realFetch;
 if(oauthState)await pool.query('DELETE FROM focus_oauth_states WHERE state_hash=$1',[hash(oauthState)]);
 await pool.query('DELETE FROM focus_tasks WHERE user_id=ANY($1::text[])',[ids]);
 await pool.query('DELETE FROM focus_projects WHERE user_id=ANY($1::text[])',[ids]);
 await pool.query('DELETE FROM focus_sessions WHERE user_id=ANY($1::text[])',[ids]);
 await pool.query('DELETE FROM focus_users WHERE id=ANY($1::text[])',[ids]);
 await pool.query('DELETE FROM focus_city_counters WHERE scope=ANY($1::text[])',[[...ids.map(id=>'user:'+id),...projects.map(id=>'project:'+id)]]);
 await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await pool.end();
}
