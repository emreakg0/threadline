import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
// Isolated configuration for this test process only; no external OAuth requests.
const schema='focus_test_'+randomUUID().replaceAll('-','');
process.env.PGOPTIONS='-c search_path='+schema;
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
const oauthUser = "oauth-test-" + randomUUID();
try {
 await pool.query(`CREATE SCHEMA ${schema}`);
 const migration=spawnSync(process.execPath,[new URL('../../../lib/db/scripts/migrate.mjs',import.meta.url).pathname],
  {env:process.env,encoding:'utf8',timeout:30000});
 assert.equal(migration.status,0,migration.stderr);
 let response=await fetch(base+'/auth/me');assert.equal(response.status,200);assert.match(response.headers.get('content-type')! ,/application\/json/);assert.deepEqual(await response.json(),{user:null,configured:true});
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 assert.equal(response.headers.get('x-frame-options'),'DENY');
 assert.equal(response.headers.get('x-powered-by'),null);
 assert.equal((await fetch(base+'/tasks')).status,401);
 async function startAttempt() {
  const redirect=await fetch(base+'/auth/google',{redirect:'manual'});
  assert.equal(redirect.status,302);
  const url=new URL(redirect.headers.get('location')!);
  const state=url.searchParams.get('state')!;
  const cookie=redirect.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  return { url, state, cookie };
 }
 const { url, state, cookie:oauthCookies }=await startAttempt();
 oauthState=state;
 assert.equal(url.searchParams.get('redirect_uri'),'http://localhost:5173/api/auth/google/callback');
 const verifier=oauthCookies.match(/focus_oauth_verifier=([^; ]+)/)?.[1];
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(url.searchParams.get('code_challenge'),createHash('sha256').update(verifier!).digest('base64url'));
 let oauthCalls=0;
 let exchangeFails=false;
 globalThis.fetch=async (target, init) => {
  if(String(target)==='https://oauth2.googleapis.com/token'){
   oauthCalls++;
   if(exchangeFails) return new Response(null,{status:503});
   assert.equal((init?.body as URLSearchParams).get('code_verifier'),verifier);
   return Response.json({access_token:'offline'});
  }
  if(String(target)==='https://openidconnect.googleapis.com/v1/userinfo'){
   oauthCalls++; return Response.json({sub:oauthUser,email:'synthetic@example.invalid',name:'Offline OAuth',email_verified:true});
  }
  assert.ok(String(target).startsWith(base)); return realFetch(target,init);
 };
 const exchange=base+'/auth/google/callback?code=offline&state='+oauthState;
 let completed=await fetch(exchange,{headers:{cookie:oauthCookies},redirect:'manual'});
 assert.equal(completed.status,302);
 assert.equal(completed.headers.get('location'),'/');
 const session=completed.headers.getSetCookie().find(cookie=>cookie.startsWith('focus_session='))!.split(';')[0];
 assert.equal((await (await fetch(base+'/auth/me',{headers:{cookie:session}})).json() as {user:{id:string}}).user.id,oauthUser);
 completed=await fetch(exchange,{headers:{cookie:oauthCookies},redirect:'manual'});
 assert.equal(completed.status,400);
 assert.equal(oauthCalls,2);
 await pool.query("UPDATE focus_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[oauthUser]);
 assert.equal((await fetch(base+'/tasks',{headers:{cookie:session}})).status,401);
 const rejected=await startAttempt();
 const denied=await fetch(base+'/auth/google/callback?error=access_denied&state='+rejected.state,
  {headers:{cookie:rejected.cookie},redirect:'manual'});
 assert.equal(denied.status,302);
 assert.equal(denied.headers.get('location'),'/?signin=retry');
 assert.ok(denied.headers.getSetCookie().every(value=>!value.startsWith('focus_session=')));
 const expired=await startAttempt();
 await pool.query("UPDATE focus_oauth_states SET expires_at=now()-interval '1 second' WHERE state_hash=$1",[hash(expired.state)]);
 assert.equal((await fetch(base+'/auth/google/callback?code=offline&state='+expired.state,
  {headers:{cookie:expired.cookie},redirect:'manual'})).status,400);
 assert.equal(oauthCalls,2);
 exchangeFails=true;
 const fresh=await startAttempt();
 const failedExchange=await fetch(base+'/auth/google/callback?code=offline&state='+fresh.state,
  {headers:{cookie:fresh.cookie},redirect:'manual'});
 assert.equal(failedExchange.status,302);
 assert.equal(failedExchange.headers.get('location'),'/?signin=retry');
 assert.ok(failedExchange.headers.getSetCookie().every(value=>!value.startsWith('focus_session=')));
 assert.equal(oauthCalls,3);
 globalThis.fetch=realFetch;
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
 response=await fetch(base+'/tasks/'+task.id,{method:'PATCH',headers:headers(1),body:JSON.stringify(patch)});assert.equal(response.status,409);
 for(const requestHeaders of [{...headers(),origin:'https://untrusted.example'},{cookie:`focus_session=${tokens[0]}`,'Content-Type':'application/json'}]) {
  response=await fetch(base+'/tasks/'+task.id,{method:'PATCH',headers:requestHeaders,body:JSON.stringify(patch)});assert.equal(response.status,403);
 }
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
 await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
 await pool.end();
}
