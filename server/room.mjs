import {Room,ServerError} from '@colyseus/core';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createCombat,ROSTER,RULESET,cleanInput} from '../online/core.mjs';
import {BUILD_HASH} from '../online/build.mjs';
const stages=new Set(['rayj-house','cwo-alley','house-cup','neon-street','cwo-rally']);
export function makeDuelRoom(context) {
 return class DuelRoom extends Room {
  onCreate(options) {
   const permit=context.permits.get(options.permit);context.permits.delete(options.permit);
   if(!permit)throw new ServerError(403,'Create an invitation through the game first');
   // Keep a vacant invitation alive after a failed auth attempt; an outsider must not delete it.
   this.permit=permit;this.maxClients=2;this.maxMessagesPerSecond=120;this.autoDispose=false;
   this.slots=[0,1].map(seat=>({seat,sessionId:permit.sessions[seat],nickname:permit.nicknames?.[seat]||`Player ${seat+1}`,chog:permit.characters?.[seat]||['yot','mamio'][seat],connected:false,ready:false,queue:[],lastSeq:0,lastProcessed:0,lastInputAt:0,bits:0,graceSpent:0,rematch:false}));
   this.stage=permit.stage||'house-cup';this.sim=null;this.persisted=false;this.replay=[];this.readyDeadline=permit.cupId||permit.duelId?Date.now()+60000:0;
   this.lastLoop=performance.now();this.steps=[];this.stateMessageCounter=0;
   this.clock.setTimeout(()=>{if(!this.sim||['complete','void'].includes(this.sim.rules.phase))this.disconnect();},3600000);
   this.clock.setTimeout(()=>{if(!this.permit.cupId&&!this.sim&&this.slots.every(s=>!s.connected))this.disconnect();},180000);
   this.onMessage('input',(client,raw)=>this.input(client,raw));
   this.onMessage('select',(client,msg)=>this.select(client,msg));
   this.onMessage('ready',(client,msg)=>this.ready(client,msg));
   this.onMessage('unready',client=>{if(!this.sim&&this.slot(client)){this.slots.forEach(s=>s.ready=false);this.publish();}});
   this.onMessage('hello',client=>{const s=this.slot(client);if(s){client.send('seat',{seat:s.seat,roomId:this.roomId,cupId:this.permit.cupId||null,duelId:this.permit.duelId||null});client.send('snapshot',this.publicState());}});
   this.onMessage('ping',(client,stamp)=>client.send('pong',{stamp,at:Date.now()}));
   this.onMessage('server-pong',(client,value)=>{const s=this.slot(client);if(s&&s.pendingPing&&value===s.pendingPing.nonce){const value=performance.now()-s.pendingPing.at;s.pendingPing=null;s.rtts??=[];s.rtts.push(value);if(s.rtts.length>120)s.rtts.shift();}});
   this.onMessage('surrender',client=>{const slot=this.slot(client);if(this.sim&&slot)this.sim.forfeit(slot.seat,'surrender');});
   this.onMessage('rematch',client=>{const s=this.slot(client);if(!s||this.permit.cupId||this.permit.duelId||!this.sim||!['complete','void'].includes(this.sim.rules.phase))return;s.rematch=true;if(this.slots.every(s=>s.rematch&&s.connected))this.start(true);else this.publish();});
   this.onMessage('result',client=>client.send('error',{message:'Only the server can determine a result'}));
   this.setFixedTimestep(()=>this.fixedStep(),60,{subSteps:2});
  }
  onAuth(client,options,auth) {
   const session=context.store.session(options.authToken||auth.token);if(!session)throw new ServerError(401,'Session expired');
   const existing=this.slots.find(s=>s.sessionId===session.id);
   if(this.permit.cupId||this.permit.restricted){if(!existing)throw new ServerError(403,this.permit.cupId?'This Cup seat belongs to another participant':'This seat belongs to another participant');}
   else if(session.id!==this.permit.sessions[0]&&options.invite!==this.permit.invite)throw new ServerError(403,'Invitation required');
   if(existing?.connected)throw new ServerError(409,'This participant already has a connected seat');
   if(this.sim&&!['complete','void'].includes(this.sim.rules.phase))throw new ServerError(403,'Use your existing reconnect session');
   return {sessionId:session.id};
  }
  onJoin(client,options,auth) {
   const sessionId=(client.auth||auth).sessionId;
   let slot=this.slots.find(s=>s.sessionId===sessionId);
   if(!slot)slot=this.slots.find(s=>!s.sessionId);
   if(!slot)throw new ServerError(403,'Room has no available participant seat');
   slot.sessionId=sessionId;slot.clientId=client.sessionId;slot.connected=true;
   if(!this.permit.cupId&&!this.permit.duelId&&typeof options.nickname==='string')slot.nickname=options.nickname.trim().slice(0,24)||slot.nickname;
   if(!this.permit.cupId&&!this.permit.duelId&&!this.sim&&ROSTER[options.chog])slot.chog=options.chog;
   client.send('seat',{seat:slot.seat,roomId:this.roomId,cupId:this.permit.cupId||null,duelId:this.permit.duelId||null});
   this.publish();
   if(!this.readyDeadline&&!this.sim&&this.slots.every(s=>s.connected))this.readyDeadline=Date.now()+60000;
  }
  slot(client){return this.slots.find(s=>s.clientId===client.sessionId);}
  select(client,msg={}){const slot=this.slot(client);if(!slot||this.sim||this.permit.cupId||this.permit.duelId||slot.ready)return;if(ROSTER[msg.chog]){slot.chog=msg.chog;this.slots.forEach(s=>s.ready=false);}
   if(slot.seat===0&&stages.has(msg.stage)){this.stage=msg.stage;this.slots.forEach(s=>s.ready=false);}this.publish();
  }
  ready(client,msg={}){const slot=this.slot(client);if(!slot||this.sim||msg.ruleset!==RULESET||msg.buildHash!==BUILD_HASH||msg.assetsReady!==true)return;
   if(this.permit.cupId||this.permit.duelId){const rtts=slot.rtts||[];if(rtts.length<10){client.send('error',{message:'Checking connection for 10 seconds before Ready'});return;}const p95=[...rtts].sort((a,b)=>a-b)[Math.floor(rtts.length*.95)];if(p95>180){client.send('error',{message:'Connection is too slow for this match. Retry on a closer network.'});return;}}
   slot.ready=true;this.publish();if(this.slots.every(s=>s.ready&&s.connected))this.start();
  }
  start(rematch=false){
   if(rematch){this.permit.matchId=context.store.newMatch(null,'casual',this.slots.map(s=>s.sessionId));context.store.attachRoom(this.permit.matchId,this.roomId);}
   context.store.db.prepare('UPDATE matches SET players=? WHERE id=?').run(JSON.stringify(this.slots.map(s=>s.sessionId)),this.permit.matchId);
   this.sim=createCombat({characters:this.slots.map(s=>s.chog),matchId:this.permit.matchId,seed:this.permit.seed||18741});this.replay=[];this.persisted=false;
   this.slots.forEach(s=>Object.assign(s,{queue:[],lastSeq:0,lastProcessed:0,lastInputAt:performance.now(),bits:0,graceSpent:0,rematch:false}));
   context.store.startMatch(this.permit.matchId);this.publish();
  }
  input(client,raw) {
   const slot=this.slot(client);if(!slot||!this.sim||['complete','void'].includes(this.sim.rules.phase)||raw?.matchId!==this.permit.matchId)return;
   const frame=cleanInput(raw);if(frame.seq<=slot.lastSeq||frame.seq>slot.lastSeq+120||!Number.isSafeInteger(raw.tick)||raw.tick>this.sim.tick+180||raw.tick<this.sim.tick-600)return;
   if(slot.queue.length>=8)return;
   slot.lastSeq=frame.seq;slot.queue.push(frame);slot.lastInputAt=performance.now();
  }
  fixedStep() {
   const start=performance.now(),gap=start-this.lastLoop;this.lastLoop=start;
   try{
    if(!this.sim){if(this.readyDeadline&&Date.now()>=this.readyDeadline){this.start();const ready=this.slots.map(s=>s.ready&&s.connected);if(ready[0]!==ready[1])this.sim.forfeit(ready[0]?1:0,'ready_timeout');else this.sim.void('both_not_ready');}}
    else if(!['complete','void'].includes(this.sim.rules.phase)){
     if(gap>250){this.sim.void('server_tick_health');}
     else if(this.permit.cupLockedAt&&Date.now()>this.permit.cupLockedAt+3600000){this.sim.void('cup_play_deadline');}
     else if(this.slots.some(s=>!s.connected)){
      this.sim.pauseWall(1/60);
      for(const s of this.slots)if(!s.connected){s.bits=0;s.queue=[];s.graceSpent+=1/60;}
      const expired=this.slots.find(s=>!s.connected&&s.graceSpent>=20);
      if(expired){if(this.slots.every(s=>!s.connected))this.sim.void('both_disconnected');else this.sim.forfeit(expired.seat,'disconnect_timeout');}
     }else{
      const frames=this.slots.map(s=>{const frame=s.queue.shift();if(frame){s.bits=frame.bits;s.lastProcessed=frame.seq;return frame;}
       if(performance.now()-s.lastInputAt>100)s.bits=0;
       return {bits:s.bits,seq:s.lastProcessed};});
      this.replay.push(frames);this.sim.step(frames);
      if(this.sim.tick%300===0)context.store.checkpoint(this.permit.matchId,this.replay,this.sim.snapshot());
     }
    }
    if(this.sim&&['complete','void'].includes(this.sim.rules.phase)&&!this.persisted){
     const snapshot=this.sim.snapshot(),replayHash='0x'+createHash('sha256').update(JSON.stringify({ruleset:RULESET,characters:this.slots.map(s=>s.chog),inputs:this.replay,snapshot})).digest('hex');
     const times=[...this.steps].sort((a,b)=>a-b);
     const result={winner:this.sim.rules.winner,winnerSession:this.sim.rules.winner===null?null:this.slots[this.sim.rules.winner].sessionId,outcome:this.sim.rules.outcome,reason:this.sim.rules.reason,wins:this.sim.rules.wins,replayHash,finishedAt:Math.floor(Date.now()/1000),performance:{samples:times.length,stepP95Ms:times[Math.floor(times.length*.95)]||0,tickHz:60,physicsHz:120,snapshotHz:20}};
     context.finished(this.permit,result,this.replay,snapshot);this.persisted=true;
    }
    if(++this.stateMessageCounter%60===0){for(const s of this.slots)if(s.connected){s.pendingPing={nonce:randomBytes(8).toString('hex'),at:performance.now()};this.clients.get(s.clientId)?.send('server-ping',s.pendingPing.nonce);}}
    if(this.stateMessageCounter%3===0)this.publish();
   }catch(error){if(this.sim&&!['complete','void'].includes(this.sim.rules.phase))this.sim.void('authority_exception');this.broadcast('error',{message:'Server could not verify this match. The match is void.'});context.onError?.(error);}
   const elapsed=performance.now()-start;this.steps.push(elapsed);if(this.steps.length>600)this.steps.shift();
  }
  publicState(){const sim=this.sim?.snapshot();return {roomId:this.roomId,cupId:this.permit.cupId||null,duelId:this.permit.duelId||null,matchKind:this.permit.matchKind||'invite',matchId:this.permit.matchId,persisted:this.persisted,ruleset:RULESET,buildHash:BUILD_HASH,stage:this.stage,slots:this.slots.map(s=>({seat:s.seat,nickname:s.nickname,chog:s.chog,connected:s.connected,ready:s.ready,rematch:s.rematch,graceRemaining:Math.max(0,20-s.graceSpent),lastProcessed:s.lastProcessed,rtt:s.rtts?.at(-1)||0,rttSamples:s.rtts?.length||0})),readySeconds:this.readyDeadline?Math.max(0,(this.readyDeadline-Date.now())/1000):null,sim};}
  publish(){this.broadcast('snapshot',this.publicState());}
  async onDrop(client){const slot=this.slot(client);if(!slot)return;slot.connected=false;slot.ready=false;slot.bits=0;slot.queue=[];this.publish();
   try{await this.allowReconnection(client,Math.max(.05,20-slot.graceSpent));}catch{}
  }
  onReconnect(client){const slot=this.slot(client);if(slot){slot.connected=true;slot.bits=0;slot.lastInputAt=performance.now();this.publish();}}
  onLeave(client){const slot=this.slot(client);if(slot){slot.connected=false;slot.bits=0;slot.ready=false;if(!this.sim&&!this.permit.cupId){this.start();this.sim.void('left_before_ready');}else if(this.sim&&!['complete','void'].includes(this.sim.rules.phase)){if(this.slots.some(s=>s!==slot&&s.connected))this.sim.forfeit(slot.seat,'left_match');else this.sim.void('both_left');}this.publish();if(!this.permit.cupId&&this.slots.every(s=>!s.connected))this.clock.setTimeout(()=>this.disconnect(),500);}}
  onDispose(){if(!this.permit||!this.slots)return;if(!this.sim)this.start();if(!['complete','void'].includes(this.sim.rules.phase)){this.sim.void('room_disposed');this.fixedStep();}else if(!this.persisted)this.fixedStep();}
 };
}
export function issuePermit(context,config){const permit=randomBytes(32).toString('hex');context.permits.set(permit,config);return permit;}
