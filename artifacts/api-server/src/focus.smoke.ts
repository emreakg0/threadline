import assert from 'node:assert/strict';
import app from './app';
import { pool } from '@workspace/db';
const server=app.listen(0,'127.0.0.1');
await new Promise<void>(resolve=>server.on('listening',resolve));
const address=server.address();
if(!address||typeof address==='string') throw new Error('No server address');
const base=`http://127.0.0.1:${address.port}/api`;
try {
 const me=await fetch(base+'/auth/me');assert.equal(me.status,200);assert.equal(((await me.json()) as {user:unknown}).user,null);
 for(const path of ['/projects','/tasks'])assert.equal((await fetch(base+path)).status,401);
 assert.equal((await fetch(base+'/tasks',{headers:{cookie:'focus_session=invalid'}})).status,401);
 assert.equal((await fetch(base+'/tasks',{method:'POST',headers:{origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/auth/google/callback?state=invalid')).status,400);
 console.log('PASS: anonymous access, invalid sessions, origin protection, OAuth state');
} finally {server.close();await pool.end();}
