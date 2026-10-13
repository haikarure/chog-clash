import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {startServer} from '../app.mjs';
import {BUILD_HASH} from '../../online/build.mjs';
import {RULESET} from '../../online/core.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await sleep(25);}throw Error('Timed out waiting for authoritative state');}
test('real WebSocket PvP, server authority, rematch and a four-player Practice Cup', {timeout:60000},async()=>{
 const server=await startServer({port:0,dbPath:':memory:',env:{}}),base=`http://localhost:${server.port}`,rooms=[];
 const request=async(path,token,body)=>{const res=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await res.json();if(!res.ok)throw Error(data.error);return data;};
 const session=()=>request('/session');
 const join=async(roomId,s,invite,chog='yot')=>{const room=await new Client(base).joinById(roomId,{authToken:s.token,invite,chog,nickname:'Test CHOG'});rooms.push(room);const state={room,snapshot:null,errors:[]};room.onMessage('snapshot',v=>state.snapshot=v);room.onMessage('seat',()=>{});room.onMessage('error',v=>state.errors.push(v.message));room.onMessage('server-ping',v=>room.send('server-pong',v));room.send('hello');await until(()=>state.snapshot);return state;};
 const ready=state=>state.room.send('ready',{ruleset:RULESET,buildHash:BUILD_HASH,assetsReady:true});
 try{
  const a=await session(),b=await session(),outsider=await session();
  server.context.onError=error=>console.error('Authority test error',error?.stack);const invitation=await request('/rooms',a.token,{chog:'yot'});
  await assert.rejects(new Client(base).joinById(invitation.roomId,{authToken:outsider.token}),/Invitation required/);
  await assert.rejects(new Client(base).create('duel',{}),/Create an invitation/);
  const pa=await join(invitation.roomId,a,invitation.invite),pb=await join(invitation.roomId,b,invitation.invite,'bigchog');
  await assert.rejects(new Client(base).joinById(invitation.roomId,{authToken:a.token,invite:invitation.invite}),/connected seat|locked/);
  ready(pa);pb.room.send('ready',{ruleset:RULESET,buildHash:'0x'+'00'.repeat(32),assetsReady:true});await sleep(150);assert.ok(!pa.snapshot.sim,'mismatched build cannot start');
  ready(pb);await until(()=>pa.snapshot.sim?.rules.phase==='fight'&&pb.snapshot.sim);
  console.info('PvP reached fight');const original=pa.snapshot.matchId;
  // A real transport drop freezes both actors and resumes the original room.
  pb.room.reconnection.minUptime=0;pb.room.reconnection.delay=1000;pb.room.reconnection.minDelay=1000;pb.room.reconnection.maxDelay=1000;
  pb.room.connection.close(4010,'transport drop test');await until(()=>pa.snapshot.slots[1].connected===false);
  const frozen=pa.snapshot.sim.tick;await sleep(350);assert.equal(pa.snapshot.sim.tick,frozen);await until(()=>pa.snapshot.slots.every(s=>s.connected));assert.equal(pa.snapshot.matchId,original);
  pa.room.send('result',{winner:0,hp:9999});await until(()=>pa.errors.length);assert.equal(pa.snapshot.sim.rules.winner,null);
  let seq=[0,0];const drive=setInterval(()=>{[pa,pb].forEach((p,i)=>{const actors=p.snapshot.sim.actors,me=actors[i],other=actors[1-i],distance=Math.abs(me.x-other.x);p.room.send('input',{matchId:original,tick:p.snapshot.sim.tick,seq:++seq[i],bits:(distance>100?(me.x<other.x?2:1):0)|(seq[i]%24<2?16:0)|(seq[i]%90<2?32:0)|(seq[i]%160<2?64:0)});});},17);
  try{await until(()=>pa.snapshot.sim.actors.some(p=>p.hp<200),10000);}finally{clearInterval(drive);}
  console.info('Authority damage received');assert.deepEqual(pa.snapshot.slots.map(s=>s.chog),['yot','bigchog']);
  pb.room.send('surrender');await until(()=>pa.snapshot.persisted&&pa.snapshot.sim.rules.outcome==='Forfeit');
  console.info('Forfeit persisted');const recorded=server.store.db.prepare('SELECT result FROM matches WHERE id=?').get(original);assert.equal(JSON.parse(recorded.result).winnerSession,server.store.session(a.token).id);assert.ok(JSON.parse(recorded.result).performance.stepP95Ms<8);
  pa.room.send('rematch');await sleep(120);assert.equal(pa.snapshot.matchId,original,'one vote cannot reset a result');pb.room.send('rematch');await until(()=>pa.snapshot.matchId!==original&&pa.snapshot.sim.rules.phase==='intro');assert.equal(pa.snapshot.slots[0].lastProcessed,0);
  await pa.room.leave();await until(()=>pb.snapshot.sim.rules.outcome==='Forfeit');
  console.info('Rematch verified');const host=await session(),players=await Promise.all([session(),session(),session(),session()]);
  let cup=await request('/cups',host.token,{name:'Automated four-player Cup',mode:'practice'});
  await assert.rejects(request(`/cups/${cup.id}/start`,host.token,{}),/Four checked-in/);
  for(let i=0;i<4;i++)await request(`/cups/${cup.id}/check-in`,players[i].token,{invite:cup.participants[i].invite,nickname:'CHOG '+i,chog:['mamio','novee','rogue','toad'][i]});
  await assert.rejects(request(`/cups/${cup.id}/start`,outsider.token,{}),/Host access/);
  const anonymous=await request(`/cups/${cup.id}`);assert.ok(anonymous.participants.every(p=>!p.invite));
  await request(`/cups/${cup.id}/start`,host.token,{});
  await assert.rejects(request(`/cups/${cup.id}/replace`,host.token,{slot:0}),/before lock/);
  const fight=async(stage,indices)=>{let report=await request(`/cups/${cup.id}`,players[indices[0]].token),m=report.matches.find(m=>m.stage===stage);assert.ok(m?.roomId);const one=await join(m.roomId,players[indices[0]]),two=await join(m.roomId,players[indices[1]]);await until(()=>one.snapshot.slots.every(s=>s.rttSamples>=10),13000);ready(one);ready(two);await until(()=>one.snapshot.sim);two.room.send('surrender');await until(()=>one.snapshot.persisted);return one;};
  // Both semifinals run concurrently. These are deliberately labelled forfeits.
  console.info('Cup semifinals created');await Promise.all([fight('SF1',[0,1]),fight('SF2',[2,3])]);
  await until(()=>server.store.matches(cup.id).some(m=>m.stage==='FINAL'));
  console.info('Cup final created');await fight('FINAL',[0,2]);
  cup=await request(`/cups/${cup.id}`,host.token);assert.equal(cup.state,'Complete');assert.equal(cup.championSlot,0);assert.deepEqual(cup.counts,{played:0,forfeits:3,void:0});assert.equal(cup.pool,'0');assert.equal(cup.transactions.length,0);
  for(const path of ['/server/.env','/server/store.mjs','/contracts/out/HouseCupEscrow.sol/HouseCupEscrow.json'])assert.equal((await fetch(base+path)).status,404);
 }finally{await Promise.allSettled(rooms.map(r=>Promise.race([r.leave(),sleep(250)])));await Promise.race([server.close(),sleep(500)]);}
});
