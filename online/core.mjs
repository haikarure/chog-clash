/* Shared server/browser simulation. No window, DOM, renderer, audio or clock APIs. */
import {createKitCombat, kits} from './kit-combat.mjs';
import data from './kit-data.mjs';
export const ROSTER = Object.freeze({yot:'arco',mamio:'fenr',benja:'solan',toad:'edda',ping:'naja',novee:'cora',tonashiro:'isolde',bigchog:'haldor',rogue:'zanni',tabsu:'mira',venty:'nib',cookie:'rhea'});
export const RULESET = 'house-cup-online-v1';
export const BUTTONS = Object.freeze({a:1,d:2,w:4,s:8,' ':16,i:32,o:64,p:128});
export const CONFIG = Object.freeze({groundY:599,walkSpeed:320,runSpeed:520,jumpSpeed:830,doubleJumpSpeed:790,gravity:2900,fastFall:1180,doubleTapWindow:.26,rollDuration:.28});
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const approach=(v,target,n)=>v<target?Math.min(target,v+n):Math.max(target,v-n);
const clone=v=>structuredClone(v);
export function cleanInput(input={}) {
 const bits=Number.isSafeInteger(input.bits)&&input.bits>=0&&input.bits<=255?input.bits:0;
 const seq=Number.isSafeInteger(input.seq)&&input.seq>=0?input.seq:0;
 return {bits,seq};
}
export function moveFor(actor, name, index=1) {
 if(actor.kit==='fenr')return kits.fenr.move(actor,name,index);
 if(kits[actor.kit])return kits[actor.kit].move(name,index);
 const state=name==='attack'?`attack${index}`:name,row=data.MECHA_MANIFEST.animation.rows[state];
 const duration=name==='ultimate'?.5:(row.frames||4)/row.fps;
 if(name==='attack'){const reach=data.MECHA_MANIFEST.combat?.hitRanges?.[state];return {name:state,type:name,index,damage:[6,8,12][index-1],knockback:[75,100,180][index-1],reach:typeof reach==='number'?reach:reach?.reach||[122,143,176][index-1],duration,hitAt:.5};}
 return {name:state,type:name,damage:name==='skill1'?16:name==='skill2'?24:0,knockback:name==='skill1'?140:220,duration,hitAt:name==='skill2'?.53:.5};
}
function actor(chog,seat) {
 if(!ROSTER[chog])throw Error('Unknown CHOG');
 const a={seat,chog,kit:ROSTER[chog],x:seat?930:350,y:CONFIG.groundY,vx:0,vy:0,facing:seat?-1:1,hp:200,grounded:true,jumps:0,state:'idle',animTime:0,stateTime:0,walkPhase:0,airTime:0,landTime:0,doublePose:0,rollDuration:.28,rollBuffer:null,action:null,runDirection:0,hurtTime:0,invuln:0,koTime:0,cooldowns:{skill1:0,skill2:0,ultimate:0},form:'human',formTime:0,transformPending:0,transformElapsed:99,formChanges:0,bits:0,previousBits:0,taps:{a:-10,d:-10,s:-10},buffer:null,lastInputSeq:0,damage:0,ko:false};
 return a;
}
export function createCombat(options={}) {
 const ids=options.characters||['yot','mamio'];
 const actors=[actor(ids[0],0),actor(ids[1],1)];
 let tick=0,time=0,wallTime=0,hitstop=0,eventCounter=0,events=[],intents=[],pendingMoves=[];
 let rules={phase:options.skipIntro?'fight':'intro',round:1,regulationRounds:0,wins:[0,0],seconds:90,phaseTime:0,overtime:false,winner:null,outcome:null,reason:null};
 const config={...CONFIG,groundY:options.groundY??CONFIG.groundY};
 actors.forEach(a=>a.y=config.groundY);
 const emit=(type,payload={})=>{const copy=clone(payload);if(copy.type){copy.detailType=copy.type;delete copy.type;}const event={id:`${options.matchId||'match'}:${++eventCounter}`,tick,type,...copy};events.push(event);if(events.length>96)events.shift();};
 const ports={seed:options.seed??18741,event:emit,hit:(source,target,hit)=>{
  const defender=actors[target];
  if(rules.phase!=='fight'||defender.hp<=0||defender.invuln>0||['down','recover'].includes(defender.state))return false;
  if(defender.action?.guard&&kitCombat.guard(defender))return false;
  intents.push({source,target,...hit});return true;
 }};
 let kitCombat=createKitCombat(actors,config,ports);
 function state(a,name){if(a.state!==name){a.state=name;a.animTime=a.stateTime=0;}}
 function canAct(a){return rules.phase==='fight'&&a.hp>0&&a.hurtTime<=0&&!['down','recover'].includes(a.state);}
 function jump(a,second=false) {
  if(!canAct(a))return false;
  if(a.action?.type==='attack'){if(!a.action.fired){a.action.cancelInto='jump';a.action.queued=0;return true;}a.action=null;}
  if(a.action||a.transformPending>0)return false;
  if(second||!a.grounded){if(a.jumps>=2)return false;a.jumps=2;a.vy=-config.doubleJumpSpeed;a.doublePose=.28;state(a,'doublejump');}
  else{a.jumps=1;a.vy=-config.jumpSpeed;state(a,'jump');}
  a.grounded=false;a.airTime=0;emit('sound',{seat:a.seat,type:'jump'});return true;
 }
 function startAction(a,name,index=1) {
  if(!canAct(a))return false;
  if(a.doublePose>0){a.rollBuffer=name;return true;}
  if(name==='attack'&&a.action?.type==='attack'){if(a.action.index<3){a.action.queued=Math.min(3-a.action.index,(a.action.queued||0)+1);a.action.cancelInto=null;}return false;}
  const cd=kits[a.kit]?.balance?.cooldowns||{skill1:3,skill2:6,ultimate:18};
  if(name!=='attack'&&((a.cooldowns[name]||0)>0||(name==='ultimate'&&(kitCombat.hasSummon(a.seat)||(a.kit==='fenr'&&a.form==='wolf')))))return false;
  if(a.action?.type==='attack'&&name!=='attack')a.action=null;
  if(a.action||a.transformPending>0)return false;
  const move=moveFor(a,name,index);
  if(name==='ultimate'&&a.kit==='fenr'){if(!kits.fenr.begin(a))return false;}
  else if(name!=='attack')a.cooldowns[name]=cd[name];
  a.action={...move,t:0,fired:false,queued:0};a.runDirection=0;state(a,move.name);
  if(name==='ultimate')kitCombat.ultimate(a.seat);
  else if(name!=='attack')emit('sound',{seat:a.seat,type:'cast'});
  return true;
 }
 function edge(a,key) {
  if(!canAct(a)){if(['w',' ','i','o','p'].includes(key))a.buffer={key,expires:wallTime+.1};return;}
  if(key==='a'||key==='d'){
   const dir=key==='a'?-1:1;a.runDirection=time-a.taps[key]<=config.doubleTapWindow?dir:0;a.taps[key]=time;a.taps[key==='a'?'d':'a']=-10;
   if(a.action?.type==='attack'){if(a.action.fired){a.action=null;state(a,a.grounded?'idle':'jump');}else{a.action.cancelInto='move';a.action.queued=0;}}
  }
  if(key==='w')jump(a);
  if(key==='s'){if(time-a.taps.s<=config.doubleTapWindow)jump(a,true);a.taps.s=time;}
  if(key===' ')startAction(a,'attack');
  if(key==='i')startAction(a,'skill1');if(key==='o')startAction(a,'skill2');if(key==='p')startAction(a,'ultimate');
 }
 function applyInput(seat,frame) {
  const a=actors[seat],input=cleanInput(frame);a.previousBits=a.bits;a.bits=input.bits;a.lastInputSeq=input.seq;
  if((a.runDirection===-1&&!(a.bits&1))||(a.runDirection===1&&!(a.bits&2)))a.runDirection=0;
  for(const [key,bit] of Object.entries(BUTTONS))if((a.bits&bit)&&!(a.previousBits&bit))edge(a,key);
 }
 function resolveHits() {
  const hits=intents;intents=[];
  // Eligibility is sampled before either actor's damage is committed: simultaneous trades are valid.
  for(const h of hits){const a=actors[h.target];a.hp=Math.max(0,a.hp-h.damage);a.damage=200-a.hp;a.ko=a.hp===0;
   if(a.transformPending>0)kits.fenr.end(a);
   a.action=null;a.rollBuffer=null;a.doublePose=0;a.hurtTime=a.hp>0?.42:0;
   const direction=Math.abs(h.sourceX-a.x)<1e-6?actors[h.source].facing:h.sourceX<a.x?1:-1;
   a.vx=direction*h.power;
   state(a,a.hp>0&&!h.knockdown?'hurt':'down');if(h.knockdown||a.hp===0){a.vy=-330;a.grounded=false;a.koTime=1.7;}
   if(h.freeze)hitstop=Math.max(hitstop,h.damage>=30?.085:.045);
   emit('hit',{seat:h.source,target:h.target,damage:h.damage,x:a.x,y:h.impactY??a.y-100,color:h.color??'#ffd36a'});
  }
 }
 function resetRound() {
  actors.forEach((a,i)=>Object.assign(a,actor(ids[i],i),{y:config.groundY}));
  kitCombat=createKitCombat(actors,config,ports);hitstop=0;
 }
 function finish(winner,outcome='Finished',reason='score') {
  if(['complete','void'].includes(rules.phase))return;
  rules.winner=winner;rules.outcome=outcome;rules.reason=reason;rules.phase=outcome==='Void'?'void':'complete';
  actors.forEach(a=>a.bits=0);emit('result',{winner,outcome,reason,wins:[...rules.wins]});
 }
 function advanceRules(dt) {
  rules.phaseTime+=dt;
  if(rules.phase==='intro'&&rules.phaseTime>=1.85){rules.phase='fight';rules.phaseTime=0;emit('round-start',{round:rules.round,overtime:rules.overtime});}
  else if(rules.phase==='fight'){
   rules.seconds=Math.max(0,rules.seconds-dt);
   if(actors.some(a=>a.hp<=0)||rules.seconds<=1e-7){
    const winner=actors[0].hp===actors[1].hp?null:actors[0].hp>actors[1].hp?0:1;
    if(winner!==null)rules.wins[winner]++;
    rules.regulationRounds+=rules.overtime?0:1;
    rules.lastRoundWinner=winner;emit('round-end',{winner,round:rules.round,timeout:rules.seconds<=1e-7,doubleKO:actors.every(a=>a.hp<=0)});rules.phase='ko';rules.phaseTime=0;
    if(rules.overtime){rules.pendingResult=winner===null?{winner:null,outcome:'Void',reason:'overtime_draw'}:{winner,outcome:'Finished',reason:'overtime'};}
    else if(rules.wins.some(w=>w>=2))rules.pendingResult={winner:rules.wins[0]>rules.wins[1]?0:1,outcome:'Finished',reason:'two_round_wins'};
    else if(rules.regulationRounds>=3&&rules.wins[0]!==rules.wins[1])rules.pendingResult={winner:rules.wins[0]>rules.wins[1]?0:1,outcome:'Finished',reason:'three_round_score'};
   }
  }else if(rules.phase==='ko'&&rules.phaseTime>=2.2){
   if(rules.pendingResult){const r=rules.pendingResult;delete rules.pendingResult;finish(r.winner,r.outcome,r.reason);}
   else{resetRound();rules.round++;rules.overtime=rules.regulationRounds>=3;rules.seconds=rules.overtime?30:90;rules.phase='intro';rules.phaseTime=0;emit('round-intro',{round:rules.round,overtime:rules.overtime});}
  }
 }
 function physics(dt) {
  pendingMoves=[];
  for(const a of actors){
   a.animTime+=dt;a.stateTime+=dt;a.invuln=Math.max(0,a.invuln-dt);a.doublePose=Math.max(0,a.doublePose-dt);a.landTime=Math.max(0,a.landTime-dt);
   for(const key of Object.keys(a.cooldowns))a.cooldowns[key]=Math.max(0,a.cooldowns[key]-dt);
   if(a.kit==='fenr')kits.fenr.advance(a,dt,a.hp>0);
   if(a.hurtTime>0){a.hurtTime=Math.max(0,a.hurtTime-dt);state(a,'hurt');if(a.hurtTime===0)a.invuln=.9;}
   if(a.buffer){if(a.buffer.expires<wallTime)a.buffer=null;else if(canAct(a)&&!a.action){const {key}=a.buffer;a.buffer=null;edge(a,key);}}
   if(a.rollBuffer&&a.doublePose<=0&&canAct(a)){const b=a.rollBuffer;a.rollBuffer=null;startAction(a,b);}
   const dir=((a.bits&2)?1:0)-((a.bits&1)?1:0),crouch=!!(a.bits&8)&&a.grounded&&!a.action;
   if(!a.action&&canAct(a)){
    if(dir&&a.doublePose<=0)a.facing=dir;if(a.runDirection&&a.runDirection!==dir)a.runDirection=0;
    const speed=(a.runDirection===dir&&dir?config.runSpeed:config.walkSpeed)*(a.kit==='fenr'&&a.form==='wolf'?1.08:1);
    a.vx=approach(a.vx,crouch?0:dir*speed,dt*(a.grounded?2800:1600));state(a,a.grounded?(crouch?'crouch':dir?(a.runDirection?'run':'walk'):'idle'):(a.doublePose>0?'doublejump':'jump'));
   }else a.vx=approach(a.vx,0,dt*1900);
   if(a.hp<=0)state(a,'down');
   if(a.action){const m=a.action;m.t+=dt;state(a,m.name);
    if(m.dash&&m.t>m.duration*.2&&m.t<m.duration*.6)a.vx=a.facing*m.dash;
    if(m.type!=='ultimate'&&!m.fired&&m.t>=m.duration*(m.hitAt??.5)){m.fired=true;pendingMoves.push({seat:a.seat,move:clone(m)});}
   }
   a.x=clamp(a.x+a.vx*dt,70,1210);
   if(!a.grounded){if((a.bits&8)&&a.vy>0&&a.doublePose<=0)a.vy=Math.max(a.vy,config.fastFall);a.vy+=config.gravity*dt;a.y+=a.vy*dt;a.airTime+=dt;
    if(a.y>=config.groundY){a.y=config.groundY;a.vy=0;a.grounded=true;a.jumps=0;a.doublePose=0;a.airTime=0;a.landTime=.09;emit('sound',{seat:a.seat,type:'landing'});}
   }else a.airTime=0;
   a.walkPhase+=Math.abs(a.vx)*dt/(a.state==='run'?184:148);
  }
  const [a,b]=actors,ga=kitCombat.geometry.hurtbox(a),gb=kitCombat.geometry.hurtbox(b),gap=(ga.w+gb.w)/2-10;
  if(!actors.some(a=>['down','recover'].includes(a.state))&&a.y>config.groundY-130&&b.y>config.groundY-130&&Math.abs(a.x-b.x)<gap){
   const sign=a.x<=b.x?-1:1,mid=(a.x+b.x)/2;a.x=clamp(mid+sign*gap/2,70,1210);b.x=clamp(mid-sign*gap/2,70,1210);
   if(Math.abs(a.x-b.x)<gap){if(a.x===70||a.x===1210)b.x=a.x-sign*gap;else a.x=b.x+sign*gap;}a.vx=b.vx=0;
  }
  // Both hit tests see the same positions and HP, before resolution.
  for(const pending of pendingMoves)kitCombat.strike(pending.seat,pending.move);
  kitCombat.update(dt,time,tick);resolveHits();
  for(const a of actors){const m=a.action;if(!m)continue;
   if(m.fired&&m.cancelInto){const into=m.cancelInto;a.action=null;state(a,a.grounded?'idle':'jump');if(into==='jump')jump(a);}
   else if(m.t>=m.duration){const queued=m.queued&&m.index<3,next=(m.index||0)+1,remaining=Math.max(0,(m.queued||0)-1);a.action=null;if(queued){startAction(a,'attack',next);if(a.action)a.action.queued=remaining;}else state(a,a.grounded?'idle':'jump');}
  }
 }
 const api={actors,config,
  step(inputs=[null,null],dt=1/60){if(!Number.isFinite(dt)||dt<=0||dt>1/30)throw Error('Fixed input timestep required');if(['complete','void'].includes(rules.phase))return;
   tick++;wallTime+=dt;if(wallTime>=480){finish(null,'Void','match_deadline');return;}
   inputs.forEach((input,i)=>{if(input)applyInput(i,input);});
   if(rules.phase==='fight'){for(let sub=0;sub<2;sub++){const d=dt/2;if(hitstop>0)hitstop=Math.max(0,hitstop-d);else{time+=d;physics(d);}}}
   advanceRules(dt);
  },
  pauseWall(dt){wallTime+=dt;if(wallTime>=480)finish(null,'Void','match_deadline');},
  forfeit(seat,reason='surrender'){if(seat!==0&&seat!==1)throw Error('Invalid seat');finish(1-seat,'Forfeit',reason);},
  void(reason='authority_failure'){finish(null,'Void',reason);},
  snapshot(){return clone({version:1,ruleset:RULESET,characters:ids,config,tick,time,wallTime,hitstop,eventCounter,events,actors,rules,kit:kitCombat.snapshot()});},
  restore(s){if(s.version!==1||s.ruleset!==RULESET||s.characters.join()!==ids.join())throw Error('Snapshot ruleset/roster mismatch');
   tick=s.tick;time=s.time;wallTime=s.wallTime;hitstop=s.hitstop;eventCounter=s.eventCounter;events=clone(s.events);rules=clone(s.rules);actors.forEach((a,i)=>Object.assign(a,clone(s.actors[i])));kitCombat.restore(s.kit);intents=[];
  },
  get rules(){return rules;},get tick(){return tick;},get events(){return events;},move:(seat,name,index)=>moveFor(actors[seat],name,index),
 };
 if(!options.skipIntro)emit('round-intro',{round:1,overtime:false});
 return api;
}
