import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { request } from 'node:http';
import { createServer } from 'vite';
import { developmentHosts } from '../../../scripts/vite-security';

assert.deepEqual(developmentHosts({}), []);
assert.deepEqual(developmentHosts({ APP_ORIGIN:'https://owned.example', REPLIT_DEV_DOMAIN:'dev.example', REPLIT_DOMAINS:'dev.example,second.example' }), ['owned.example','dev.example','second.example']);
assert.deepEqual(developmentHosts({ APP_ORIGIN:'file:///etc/passwd', REPLIT_DOMAINS:'.com,*,bad host' }), []);

const file=`client_secret_probe_${randomUUID()}.json`;
const path=resolve(file);
await writeFile(path, JSON.stringify({synthetic:'not a credential'}), {flag:'wx'});
const server=await createServer({server:{host:'127.0.0.1',port:0}, clearScreen:false});
try {
 await server.listen();
 const address=server.httpServer!.address();
 if(!address||typeof address==='string')throw Error('Missing test server address');
 const base=`http://127.0.0.1:${address.port}`;
 assert.equal((await fetch(base)).status,200,'Local development remains usable');
 const hostileStatus=await new Promise<number|undefined>((resolve,reject)=>{
  const req=request(base,{headers:{Host:'attacker.invalid'}},res=>{res.resume();resolve(res.statusCode);});
  req.on('error',reject);req.end();
 });
 assert.equal(hostileStatus,403,'Untrusted Host must be blocked');
 assert.equal((await fetch(base+`/@fs${resolve('../api-server/src/routes/focus.ts')}`)).status,403,'Backend source is outside the frontend serving boundary');
 for(const route of [`/${file}`,`/@fs${path}`]) {
  const response=await fetch(base+route);
  assert.equal(response.status,403,'Credential downloads must be denied');
  assert.ok(!(await response.text()).includes('not a credential'),'Denied response cannot include file contents');
 }
 console.log('PASS: explicit development hosts, DNS-rebinding rejection, local app access and credential-file blocking');
} finally { await server.close(); await unlink(path); }
