import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {Store} from '../store.mjs';
import {startServer} from '../app.mjs';
import {BUILD_HASH} from '../../online/build.mjs';
import {RULESET} from '../../online/core.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<160;i++){if(fn())return;await sleep(25);}throw Error('Queue room did not advance');}
test('queue leases, cancellation and repeated search preserve one FIFO entry',()=>{
 const store=new Store(),a=store.newSession(),b=store.newSession();
 try{
  const sa=store.session(a.token),sb=store.session(b.token);
  store.queueJoin(sa,{chog:'yot',nickname:'First'});
  const first=store.queueStatus(sa.id);store.queueJoin(sa,{chog:'mamio',nickname:'Repeated'});
  assert.equal(store.queueStatus(sa.id).created,first.created);assert.equal(store.queueStatus(sa.id).chog,'yot');
  assert.equal(store.queuePair(),null);assert.equal(store.queueCancel(sa.id),null);
  store.queueJoin(sa,{chog:'yot',nickname:'First'});store.db.prepare('UPDATE match_queue SET expires=?').run(Date.now()-1);
  store.queueJoin(sb,{chog:'toad',nickname:'Second'});assert.equal(store.queuePair(),null);assert.equal(store.queueStatus(sa.id),null);
 }finally{store.close();}
});
test('paid queue never pairs two sessions controlling the same wallet',()=>{
 const store=new Store(),sessions=Array.from({length:3},()=>store.session(store.newSession().token));
 try{
  for(let i=0;i<3;i++){sessions[i].wallet='0x'+String(i===2?'22':'11').repeat(20);sessions[i].wallet_expires=Date.now()+60000;store.queueJoin(sessions[i],{chog:'yot',nickname:'Player '+i,kind:'paid'});}
  const pair=store.queuePair('paid');assert.ok(pair);assert.notEqual(pair[0].wallet,pair[1].wallet);assert.equal(store.queuePair('paid'),null);
 }finally{store.close();}
});
test('concurrent Quick Match requests reserve exactly two seats and reject an outsider',{timeout:12000},async()=>{
 const server=await startServer({port:0,dbPath:':memory:',env:{}}),base=`http://localhost:${server.port}`,rooms=[];
 const request=async(path,token,body)=>{
  const response=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await response.json();if(!response.ok)throw Error(result.error);return result;
 };
 try{
  const [a,b,c]=await Promise.all(Array.from({length:3},()=>request('/session')));
  await Promise.all([request('/queue',a.token,{chog:'mamio',nickname:'First'}),request('/queue',a.token,{chog:'yot',nickname:'Duplicate'}),request('/queue',b.token,{chog:'toad',nickname:'Second'})]);
  const qa=await request('/queue',a.token),qb=await request('/queue',b.token);
  assert.equal(qa.state,'Matched');assert.equal(qa.roomId,qb.roomId);assert.equal(server.store.db.prepare('SELECT count(*) n FROM matches').get().n,1);
  const join=async(token)=>{const room=await new Client(base).joinById(qa.roomId,{authToken:token});rooms.push(room);const state={room,snapshot:null};room.onMessage('snapshot',v=>state.snapshot=v);room.onMessage('seat',()=>{});room.onMessage('server-ping',v=>room.send('server-pong',v));room.send('hello');await until(()=>state.snapshot);return state;};
  await assert.rejects(new Client(base).joinById(qa.roomId,{authToken:c.token}),/another participant/);
  const pa=await join(a.token),pb=await join(b.token);
  await until(()=>pa.snapshot.slots.every(s=>s.connected));
  assert.equal(pa.snapshot.matchKind,'quick');assert.deepEqual(pa.snapshot.slots.map(s=>s.nickname),['First','Second']);
  [pa,pb].forEach(p=>p.room.send('ready',{ruleset:RULESET,buildHash:BUILD_HASH,assetsReady:true}));
  await until(()=>pa.snapshot.sim);pb.room.send('surrender');await until(()=>pa.snapshot.persisted);
  assert.equal(pa.snapshot.sim.rules.outcome,'Forfeit');
  await request('/queue/ack',a.token,{});assert.equal((await request('/queue',a.token)).state,'Idle');
 }finally{await Promise.allSettled(rooms.map(r=>r.leave()));await server.close();}
});
