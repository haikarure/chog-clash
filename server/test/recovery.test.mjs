import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {Client} from '@colyseus/sdk';
import {Store} from '../store.mjs';
import {Chain} from '../chain.mjs';
import {BUILD_HASH} from '../../online/build.mjs';
import {RULESET} from '../../online/core.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=10000){const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch{}await sleep(50);}throw Error('Recovery test timed out');}
test('SIGKILL during a real match recovers SQLite to Void, never an invented winner', {timeout:25000},async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'chog-recovery-')),db=path.join(directory,'cup.sqlite');
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const base=`http://localhost:${port}`,rooms=[];let child;
 const start=()=>spawn(process.execPath,['--experimental-strip-types','index.ts'],{cwd:new URL('../',import.meta.url),env:{PATH:process.env.PATH,HOST:'127.0.0.1',PORT:String(port),PUBLIC_ORIGIN:base,DATABASE_PATH:db},stdio:'ignore'});
 const request=async(p,s,body)=>{const response=await fetch(base+'/api'+p,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(s?{Authorization:'Bearer '+s.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return response.json();};
 try{child=start();await until(async()=>!!(await request('/config')).online);
  const sessions=await Promise.all([request('/session'),request('/session')]),invite=await request('/rooms',sessions[0],{chog:'rogue'}),states=[];
  for(const s of sessions){const room=await new Client(base).joinById(invite.roomId,{authToken:s.token,invite:invite.invite});rooms.push(room);room.reconnection.enabled=false;const state={room,snapshot:null};room.onMessage('seat',()=>{});room.onMessage('snapshot',v=>state.snapshot=v);room.onMessage('server-ping',v=>room.send('server-pong',v));room.send('hello');states.push(state);}
  for(const s of states)s.room.send('ready',{ruleset:RULESET,buildHash:BUILD_HASH,assetsReady:true});await until(()=>states.every(s=>s.snapshot?.sim?.tick>=310));
  const id=states[0].snapshot.matchId;child.kill('SIGKILL');await new Promise(r=>child.once('exit',r));child=start();await until(async()=>!!(await request('/config')).online);
  const recovered=new Store(db);try{const match=recovered.db.prepare('SELECT * FROM matches WHERE id=?').get(id);assert.equal(match.state,'Void');assert.equal(match.winner,null);assert.equal(match.reason,'server_restart');assert.ok(JSON.parse(match.result).replayHash);assert.ok(JSON.parse(match.replay).length>=300);assert.equal(recovered.session(sessions[0].token).id,JSON.parse(match.players)[0]);assert.equal(recovered.outbox().length,0);}finally{recovered.close();}
 }finally{for(const r of rooms)r.connection.close();if(child&&!child.killed){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(1000)]);}fs.rmSync(directory,{recursive:true,force:true});}
});
test('signed outbox bytes, nonce and credits metadata survive a database reopen',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'chog-outbox-')),file=path.join(directory,'cup.sqlite');let store=new Store(file);
 try{const host=store.newSession(),cup=store.createCup(host,'Restart evidence','local-mock'),id=store.enqueue({id:'durable',cupId:cup.id,kind:'withdraw',payload:{recipient:'0x'+'11'.repeat(20),amount:'70000000',rawTx:'0x02abcd',signed:{signature:'test fixture'}}});store.updateOutbox(id,{state:'submitted',tx_hash:'0x'+'22'.repeat(32),tx_nonce:8,attempts:1});store.close();store=new Store(file);const job=store.outbox()[0];assert.equal(job.tx_nonce,8);assert.equal(job.payload.rawTx,'0x02abcd');assert.equal(job.payload.amount,'70000000');assert.equal(job.state,'submitted');assert.equal(fs.statSync(file).mode&0o777,0o600);}finally{store.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('manual retry rebroadcasts an unconfirmed transaction without replacing its hash, nonce or signed bytes',async()=>{
 const store=new Store(':memory:');
 try{const host=store.newSession(),cup=store.createCup(host,'Unavailable relay','local-mock'),raw='0x02abcd',hash='0x'+'33'.repeat(32);
  const id=store.enqueue({id:'unconfirmed',cupId:cup.id,kind:'withdraw',payload:{rawTx:raw,_broadcasts:3,_nextTry:Date.now()+60000,recipient:'0x'+'11'.repeat(20),amount:'1000000'}});
  store.updateOutbox(id,{state:'submitted',tx_hash:hash,tx_nonce:8,attempts:3});
  const chain=new Chain(store,{}),sent=[];chain.enabled=true;chain.public={async getTransactionReceipt(){return null;},async sendRawTransaction({serializedTransaction}){sent.push(serializedTransaction);return hash;}};
  chain.retry(cup.id);await chain.poll();const job=store.outbox()[0];
  assert.deepEqual(sent,[raw]);assert.equal(job.tx_hash,hash);assert.equal(job.tx_nonce,8);assert.equal(job.payload.rawTx,raw);assert.equal(job.attempts,1);assert.equal(job.payload._broadcasts,4);
 }finally{store.close();}
});
