import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createCombat, ROSTER, BUTTONS} from '../../online/core.mjs';
const ids=Object.keys(ROSTER);
const digest=sim=>crypto.createHash('sha256').update(JSON.stringify(sim.snapshot())).digest('hex');
const near=sim=>{sim.actors[0].x=580;sim.actors[1].x=680;};
const advance=(sim,n,input=[{bits:0,seq:0},{bits:0,seq:0}])=>{for(let i=0;i<n;i++)sim.step(input);};

test('144 online pairings initialize and advance without browser globals',()=>{
 for(const a of ids)for(const b of ids){const sim=createCombat({characters:[a,b],skipIntro:true});advance(sim,120,[{bits:2,seq:1},{bits:1,seq:1}]);assert.equal(sim.actors.length,2);for(const actor of sim.actors)assert.ok(Number.isFinite(actor.x)&&actor.hp===200);}
});
test('basic, both skills and all 12 ultimates run on both owners',()=>{
 for(const id of ids)for(const seat of [0,1])for(const key of [' ','i','o','p']){
  const sim=createCombat({characters:[id,id],skipIntro:true});near(sim);
  const frames=[{bits:0,seq:1},{bits:0,seq:1}];frames[seat].bits=BUTTONS[key];sim.step(frames);advance(sim,300);
  for(const a of sim.actors){assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.hp),`${id}/${seat}/${key}`);assert.ok(a.hp>=0&&a.hp<=200);}
  assert.ok(sim.events.length>0,`${id}/${seat}/${key} events`);
 }
});
test('damage and displacement match when a kit changes sides',()=>{
 for(const id of ids)for(const key of [' ','i','o','p']){
  const snapshots=[];
  for(const seat of [0,1]){const sim=createCombat({characters:[id,id],skipIntro:true});sim.actors[0].x=590;sim.actors[1].x=690;const f=[{bits:0,seq:1},{bits:0,seq:1}];f[seat].bits=BUTTONS[key];sim.step(f);advance(sim,240);snapshots.push(sim.snapshot());}
  const [a,b]=snapshots;assert.equal(a.actors[1].hp,b.actors[0].hp,`${id}/${key} damage`);
  assert.ok(Math.abs(a.actors[1].x-(1280-b.actors[0].x))<.001,`${id}/${key} target displacement: ${a.actors[1].x} vs ${1280-b.actors[0].x}`);
 }
});
test('simultaneous attacks trade and held buttons do not repeat',()=>{
 const sim=createCombat({characters:['rogue','rogue'],skipIntro:true});near(sim);advance(sim,120,[{bits:16,seq:1},{bits:16,seq:1}]);assert.equal(sim.actors[0].hp,194);assert.equal(sim.actors[1].hp,194);
});
test('complete snapshots reproduce future state including summons and transform',()=>{
 for(const id of ids){const opts={characters:[id,'mamio'],skipIntro:true,seed:55,matchId:'replay'};const a=createCombat(opts),b=createCombat(opts);near(a);near(b);
  for(let i=0;i<200;i++){const f=[{bits:i===0?128:i>30&&i<80?2:0,seq:i},{bits:i===0?128:i===100?32:0,seq:i}];a.step(f);b.step(f);}assert.equal(digest(a),digest(b),id);
  const restored=createCombat(opts);restored.restore(a.snapshot());
  for(let i=200;i<400;i++){const f=[{bits:i===220?64:0,seq:i},{bits:i%60===0?16:0,seq:i}];a.step(f);restored.step(f);}
  assert.equal(digest(a),digest(restored),id+' restored');
 }
});
test('three draws plus overtime terminate as Void',()=>{
 const sim=createCombat({characters:['rogue','tabsu'],skipIntro:true});advance(sim,60*330);assert.equal(sim.rules.phase,'void');assert.equal(sim.rules.reason,'overtime_draw');assert.equal(sim.rules.regulationRounds,3);
});
test('forfeit and Void are terminal and cannot be overwritten',()=>{
 const a=createCombat();a.forfeit(0);a.forfeit(1);assert.equal(a.rules.winner,1);a.void();assert.equal(a.rules.outcome,'Forfeit');
 const b=createCombat();b.void('authority_failure');b.forfeit(0);assert.equal(b.rules.outcome,'Void');
});
test('all 12 kits finish a played two-round match through combat inputs',()=>{
 for(const id of ids){const s=createCombat({characters:[id,'yot'],skipIntro:true});
  for(let i=0;i<60*310&&!['complete','void'].includes(s.rules.phase);i++){const [a,b]=s.actors;const move=Math.abs(a.x-b.x)>90?(a.x<b.x?2:1):0;s.step([{bits:move|(i%32===0?16:0)|(i%150===0?32:0)|(i%280===0?64:0)|(i%600===0?128:0),seq:i},{bits:0,seq:i}]);}
  assert.equal(s.rules.outcome,'Finished',id);assert.deepEqual(s.rules.wins,[2,0],id);assert.equal(s.rules.winner,0,id);
 }
});
