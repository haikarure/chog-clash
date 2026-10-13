// Controlled localhost WebSocket impairment. Application-message loss models
// missed inputs/snapshots; it does not claim kernel packet loss or physical WAN.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {WebSocket,WebSocketServer} from 'ws';
import {Client} from '@colyseus/sdk';
import {startServer} from '../app.mjs';
import {BUILD_HASH} from '../../online/build.mjs';
import {createCombat,ROSTER,RULESET} from '../../online/core.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const report={status:'RUNNING',checkedAt:new Date().toISOString(),evidenceType:'Automated bot clients over a real localhost WebSocket proxy; no browser prediction, physical devices or human playtest',technique:'Seeded uniform delay per direction, ordered delivery; 1% Bernoulli loss on input/snapshot application messages only. Handshake, Ready, ping/pong and control messages retained. This is application-message loss, not TCP/kernel packet loss.',profiles:[],matches:[]};
const output=path.resolve(import.meta.dirname,'../../validation/final/network.json');fs.mkdirSync(path.dirname(output),{recursive:true});
const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
async function until(fn,label,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await sleep(25);}throw Error('Timed out: '+label);}
const percentile=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))]||0;
let seed=0x13579abc;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
const sockets=new Set(),pendingTimers=new Set();let server,profile;
const proxy=http.createServer((req,res)=>{res.statusCode=404;res.end();}),wss=new WebSocketServer({noServer:true});
await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
proxy.on('upgrade',(req,socket,head)=>wss.handleUpgrade(req,socket,head,downstream=>{
 const upstream=new WebSocket(`ws://127.0.0.1:${server.port}${req.url}`);sockets.add(downstream);sockets.add(upstream);
 const boundProfile=profile;
 const forward=(destination)=>{let previous=0;return(data,isBinary)=>{
  const bytes=Buffer.from(data),eligible=bytes.includes(Buffer.from('input'))||bytes.includes(Buffer.from('snapshot'));boundProfile.frames++;if(eligible)boundProfile.lossEligible++;
  if(eligible&&random()<.01){boundProfile.dropped++;return;}
  const delay=boundProfile.targetRttMs/2+(random()-.5)*30;const at=Math.max(performance.now()+delay,previous+.01);previous=at;
  const timer=setTimeout(()=>{pendingTimers.delete(timer);if(destination.readyState===WebSocket.OPEN)destination.send(bytes,{binary:isBinary});},Math.max(0,at-performance.now()));pendingTimers.add(timer);
 };};
 const toUp=forward(upstream),toDown=forward(downstream),buffer=[];
 downstream.on('message',(data,binary)=>{if(upstream.readyState===WebSocket.OPEN)toUp(data,binary);else buffer.push([data,binary]);});upstream.on('open',()=>{for(const frame of buffer)toUp(...frame);});upstream.on('message',toDown);
 downstream.on('close',()=>{sockets.delete(downstream);if(upstream.readyState<2)upstream.close();});upstream.on('close',()=>{sockets.delete(upstream);if(downstream.readyState<2)downstream.close();});
 for(const s of [upstream,downstream])s.on('error',()=>s.terminate());
}));
try{
 server=await startServer({port:0,dbPath:':memory:',env:{PUBLIC_WS_ADDRESS:`localhost:${proxy.address().port}`}});const base=`http://localhost:${server.port}`;
 const request=async(url,s,body)=>{const r=await fetch(base+'/api'+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(s?{Authorization:'Bearer '+s.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
 const runMatch=async(character,index)=>{
  const sessions=await Promise.all([request('/session'),request('/session')]);const invite=await request('/rooms',sessions[0],{chog:character}),states=[],rooms=[],rtts=[];
  try{
   for(let i=0;i<2;i++){const room=await new Client(base).joinById(invite.roomId,{authToken:sessions[i].token,invite:invite.invite,chog:i?'yot':character}),state={room,snapshot:null};rooms.push(room);room.reconnection.enabled=false;room.onMessage('seat',()=>{});room.onMessage('error',e=>{throw Error(e.message);});room.onMessage('server-ping',v=>room.send('server-pong',v));room.onMessage('snapshot',v=>{state.snapshot=v;for(const slot of v.slots)if(slot.rttSamples)rtts.push(slot.rtt);});room.send('hello');states.push(state);}
   await until(()=>states.every(s=>s.snapshot?.slots.every(p=>p.connected)),'two connections',20000);
   states.forEach(s=>s.room.send('ready',{ruleset:RULESET,buildHash:BUILD_HASH,assetsReady:true}));await until(()=>states.every(s=>s.snapshot?.sim),'Ready',20000);
   let seq=0;const drive=setInterval(()=>{const s=states[0].snapshot;if(!s?.sim||['complete','void'].includes(s.sim.rules.phase))return;const [a,b]=s.sim.actors,distance=Math.abs(a.x-b.x),move=distance>90?(a.x<b.x?2:1):0;const bits=move|(seq%32===0?16:0)|(seq%150===0?32:0)|(seq%280===0?64:0)|(seq%600===0?128:0);states[0].room.send('input',{matchId:s.matchId,tick:s.sim.tick,seq:++seq,bits});states[1].room.send('input',{matchId:s.matchId,tick:s.sim.tick,seq,bits:0});},1000/60);
   try{await until(()=>states.every(s=>s.snapshot?.persisted),'played result',240000);}finally{clearInterval(drive);}
   const a=states[0].snapshot,b=states[1].snapshot;assert.equal(a.matchId,b.matchId);assert.deepEqual(a.sim.rules,b.sim.rules);assert.equal(a.sim.rules.outcome,'Finished');assert.ok(percentile(rtts,.5)>=profile.targetRttMs-30,'Proxy latency must reach the clients');
   const row=server.store.db.prepare('SELECT result,replay FROM matches WHERE id=?').get(a.matchId),result=JSON.parse(row.result),inputs=JSON.parse(row.replay);assert.equal(result.winner,0);
   const replay=createCombat({characters:[character,'yot'],matchId:a.matchId,seed:18741});for(const frame of inputs)replay.step(frame);const snapshot=replay.snapshot();assert.deepEqual(snapshot.rules,a.sim.rules);
   const digest='0x'+createHash('sha256').update(JSON.stringify({ruleset:RULESET,characters:[character,'yot'],inputs,snapshot})).digest('hex');assert.equal(digest,result.replayHash);assert.ok(result.performance.stepP95Ms<8);
   report.matches.push({index,profileRttMs:profile.targetRttMs,character,matchId:a.matchId,outcome:'Finished',wins:result.wins,serverStepP95Ms:result.performance.stepP95Ms,observedRttMedianMs:percentile(rtts,.5),observedRttP95Ms:percentile(rtts,.95),clientsAgree:true,replayHashMatches:true,inputFrames:inputs.length});save();console.log('PASS played network match',index,character,'RTT',Math.round(percentile(rtts,.5)));
  }finally{await Promise.allSettled(rooms.map(r=>r.leave()));}
 };
 profile={targetRttMs:100,oneWayJitterRangeMs:[-15,15],lossProbability:.01,frames:0,lossEligible:0,dropped:0};report.profiles.push(profile);save();const characters=Object.keys(ROSTER);
 for(let i=0;i<10;i+=2)await Promise.all([runMatch(characters[i],i),runMatch(characters[i+1],i+1)]);
 profile={targetRttMs:200,oneWayJitterRangeMs:[-15,15],lossProbability:.01,frames:0,lossEligible:0,dropped:0,stress:true};report.profiles.push(profile);await runMatch('cookie',10);
 assert.equal(report.matches.filter(m=>m.profileRttMs===100).length,10);assert.ok(report.profiles.every(p=>p.dropped>0));report.status='PASS';report.completedAt=new Date().toISOString();save();
}catch(e){report.status='FAIL';report.error=e.message;save();console.error(e);process.exitCode=1;}
finally{for(const s of sockets)s.terminate();for(const t of pendingTimers)clearTimeout(t);wss.close();await new Promise(resolve=>proxy.close(resolve));if(server)await server.close();}
