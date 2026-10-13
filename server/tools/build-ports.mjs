/* Derive headless kit/strike modules from the attributed MIT combat source.
 * No DOM/audio emulation: generated modules receive actors, hit/event ports.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { parse } from 'acorn';
const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'online');
fs.mkdirSync(path.join(out, 'kits'), { recursive: true });
const kitNames = { fenr:'Fenr', mira:'Mira', cora:'Cora', naja:'Naja', haldor:'Haldor', zanni:'Zanni', isolde:'Isolde', rhea:'Rhea', solan:'Solan', nib:'Nib', edda:'Edda' };
const hashes = {};
for (const [id, name] of Object.entries(kitNames)) {
  const src = fs.readFileSync(path.join(root, id+'.js'), 'utf8');
  hashes[id+'.js'] = crypto.createHash('sha256').update(src).digest('hex');
  const module = src.replace(`window.${name}=`, 'return ');
  fs.writeFileSync(path.join(out, 'kits', id+'.mjs'), `/* Generated from ${id}.js; MIT attribution in THIRD_PARTY_NOTICES.md. */\nexport default ${module.trim().replace(/^\/\*[\s\S]*?\*\//,'').trim().replace(/;\s*$/, '')};\n`);
}
const env = { window: {} };
for (const file of fs.readdirSync(path.join(root,'assets/chog/fighters'), { recursive:true }).filter(p=>p.endsWith('manifest.js'))) {
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/chog/fighters',file),'utf8'),env);
}
vm.runInNewContext(fs.readFileSync(path.join(root,'assets/chog/effects/drone-config.js'),'utf8'), env);
const data = {};
for (const [key, value] of Object.entries(env.window)) {
  if (key.endsWith('_METRICS')) data[key] = { emitters:value.emitters, states:Object.fromEntries(Object.entries(value.states||{}).map(([s,v])=>[s,{stride_estimate:v.stride_estimate,frames:v.frames?.map(f=>({bounds:f.bounds}))}])) };
  if (key.endsWith('_MANIFEST')) data[key] = { animation:value.animation,combat:value.combat,locomotion:value.locomotion };
  if(key==='DRONE_ASSET') data[key] = {muzzle:value.muzzle};
}
fs.writeFileSync(path.join(out,'kit-data.mjs'), '/* Generated gameplay geometry/timing; no images or DOM. */\nexport default '+JSON.stringify(data)+';\n');
const source = fs.readFileSync(path.join(root,'game.js'),'utf8');
hashes['game.js'] = crypto.createHash('sha256').update(source).digest('hex');
const ast = parse(source, {ecmaVersion:'latest'});
const fn = ast.body[0].expression.callee.body.body.filter(n=>n.type==='FunctionDeclaration');
const names = ('hurtbox overlap meleeBox meleeContact projectileBox attackRange emitter meleeHit fireSkill startSquadron updateSquadron startRocketParade paradeAim updateParade startSummon startMurmuration updateMurmuration startSerpent updateSerpent startQuake updateQuake startFinale updateFinale startSkyfall updateSkyfall lanceShatter startOrrery updateOrrery wellBurst startSunroar updateSunroar startDelivery updateDelivery startTortoise updateTortoise shellGuard droneMuzzle slagSplash updateProjectiles fenrStrike miraStrike coraStrike najaStrike haldorStrike zanniStrike isoldeStrike rheaStrike solanStrike nibStrike eddaStrike').split(' ');
function walk(node, callback) {
  if (!node || typeof node!=='object') return;
  if(node.type) callback(node);
  for(const [key,v] of Object.entries(node)) {if(key==='start'||key==='end')continue;if(Array.isArray(v))v.forEach(n=>walk(n,callback));else if(v&&typeof v==='object')walk(v,callback);}
}
const pieces = names.map(name=>{
  const node = fn.find(n=>n.id.name===name); if(!node)throw Error('Missing '+name);
  const calls = [];walk(node,n=>{if(n.type==='CallExpression')calls.push(n);});
  const dummyHits=calls.filter(n=>n.callee.type==='Identifier'&&n.callee.name==='hitDummy');
  const patches=[];
  for(const call of calls.filter(n=>source.slice(n.callee.start,n.callee.end)==='window.__game.receiveHit')) {
    const damage=source.slice(call.arguments[0].start,call.arguments[0].end);
    const candidates=dummyHits.filter(n=>{const text=source.slice(n.arguments[0].start,n.arguments[0].end);return text===damage||text.startsWith(damage+'||');}).sort((a,b)=>Math.abs(a.start-call.start)-Math.abs(b.start-call.start));
    const match=candidates[0];
    if(!match)throw Error('No symmetric hit metadata for '+name+': '+damage);
    const args=match.arguments.map(n=>source.slice(n.start,n.end).replace(/\bhero\b/g,'__opponent__').replace(/\bdummy\b/g,'hero').replace(/\b__opponent__\b/g,'dummy')).join(',');
    patches.push({start:call.start-node.start,end:call.end-node.start,text:'hitHero('+args+')'});
  }
  let result=source.slice(node.start,node.end);
  for(const patch of patches.sort((a,b)=>b.start-a.start))result=result.slice(0,patch.start)+patch.text+result.slice(patch.end);
  return result.replace(/\bwindow\./g,'kitEnv.');
});
const prefix = `/* Generated strike/projectile/summon port. Do not edit: run server/tools/build-ports.mjs. */
${Object.keys(kitNames).map(id=>`import ${kitNames[id]} from './kits/${id}.mjs';`).join('\n')}
import kitEnv from './kit-data.mjs';
export const kits={fenr:Fenr,mira:Mira,cora:Cora,naja:Naja,haldor:Haldor,zanni:Zanni,isolde:Isolde,rhea:Rhea,solan:Solan,nib:Nib,edda:Edda};
export function createKitCombat(actors, CONFIG, ports={}) {
 const [hero,dummy]=actors, W=1280;
 const selectedCharacter=hero.kit,opponentCharacter=dummy.kit;
 const F=Fenr,M=Mira,C=Cora,N=Naja,HD=Haldor,Z=Zanni,IS=Isolde,RH=Rhea,SO=Solan,NB=Nib,ED=Edda;
 const KITS={mira:M,cora:C,naja:N,haldor:HD,zanni:Z,isolde:IS,rhea:RH,solan:SO,nib:NB,edda:ED};
 const manifest=kitEnv.MECHA_MANIFEST,metrics=kitEnv.MECHA_METRICS;
 const BALANCE={combo:[{damage:6,knockback:75},{damage:8,knockback:100},{damage:12,knockback:180}],skill1:{damage:16,knockback:140},skill2:{damage:24,knockback:220,radius:220},ultimate:{damagePerDrone:12,knockback:190},basicCooldownRefund:.05};
 const cooldownMax={skill1:3,skill2:6,ultimate:18},rechargePulse={skill1:0,skill2:0,ultimate:0};
 const SQUAD={duration:2.85,cutinDuration:.78,firstShot:1.50,shotGap:.095,departure:2.24,droneWidth:112};
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const approach=(v,target,amount)=>v<target?Math.min(target,v+amount):Math.max(target,v-amount);
 let squad=null,enemySquad=null,parade=null,enemyParade=null,flock=null,enemyFlock=null,serpent=null,enemySerpent=null,quake=null,enemyQuake=null,finale=null,enemyFinale=null,skyfall=null,enemySkyfall=null,orrery=null,enemyOrrery=null,sunroar=null,enemySunroar=null,delivery=null,enemyDelivery=null,tortoise=null,enemyTortoise=null;
 let trauma=0,cinematic=0,announceTimer=0,time=0,stepCount=0,seed=ports.seed??18741,activeSeat=0;
 const projectiles=[],effects=[],particles={push(){}};
 const originalPush=effects.push.bind(effects);
 effects.push=(...items)=>{for(const item of items){item.owner??=activeSeat===0?'player':'enemy';ports.event?.('fx',{...item});originalPush(item);}return effects.length;};
 const voiceActive=false,voiceKind='',voiceActor=null;
 const stopUltimateVoice=()=>{},startUltimateVoice=(kind,actor)=>ports.event?.('ultimate',{seat:actor===hero?0:1,kit:kind}),spawnParticles=()=>{},dust=()=>{};
 const sound=(type,actor=actors[activeSeat])=>ports.event?.('sound',{seat:actor===hero?0:1,type});
 const hitDummy=(damage,power,color,sourceX,impactY,knockdown=false,freeze=true,shake=1)=>ports.hit?.(0,1,{damage:damage??16,power:power??140,color,sourceX,impactY,knockdown,freeze,shake})||false;
 const hitHero=(damage,power,color,sourceX,impactY,knockdown=false,freeze=true,shake=1)=>ports.hit?.(1,0,{damage:damage??16,power:power??140,color,sourceX,impactY,knockdown,freeze,shake})||false;
`;
const suffix = `
 const strikes={fenr:fenrStrike,mira:miraStrike,cora:coraStrike,naja:najaStrike,haldor:haldorStrike,zanni:zanniStrike,isolde:isoldeStrike,rhea:rheaStrike,solan:solanStrike,nib:nibStrike,edda:eddaStrike};
 function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
 function groups(){return {squad,enemySquad,parade,enemyParade,flock,enemyFlock,serpent,enemySerpent,quake,enemyQuake,finale,enemyFinale,skyfall,enemySkyfall,orrery,enemyOrrery,sunroar,enemySunroar,delivery,enemyDelivery,tortoise,enemyTortoise};}
 function hasSummon(seat){const g=groups();return Object.entries(g).some(([key,v])=>v&&(seat===1?key.startsWith('enemy'):!key.startsWith('enemy')));}
 return {kits,geometry:{hurtbox,meleeBox,overlap,projectileBox},
  strike(seat,move){activeSeat=seat;const actor=actors[seat];if(strikes[actor.kit])strikes[actor.kit](actor,move);else if(seat===0){if(move.type==='attack')meleeHit(move.index);else fireSkill(move);}else{
   const em=metrics?.emitters?.[move.name]||{x:move.type==='skill2'?30:89,y:move.type==='skill2'?0:-113};
   if(move.type==='attack'){effects.push({type:'slash',x:actor.x+actor.facing*48,y:actor.y-100,life:.22,maxLife:.22,facing:actor.facing,index:move.index,color:'#cffbf0'});if(meleeContact(actor,hero,move)){if(hitHero(move.damage,move.knockback,'#cffbf0',actor.x,actor.y-100))for(const name of Object.keys(cooldownMax))actor.cooldowns[name]=Math.max(0,actor.cooldowns[name]-cooldownMax[name]*.05);}}
   else if(move.type==='skill1'){projectiles.push({x:actor.x+actor.facing*em.x,y:actor.y+em.y,vx:actor.facing*920,life:1.6,facing:actor.facing,owner:'enemy',damage:16,knockback:140});effects.push({type:'muzzle',x:actor.x+actor.facing*em.x,y:actor.y+em.y,life:.25,maxLife:.25});}
   else if(move.type==='skill2'){const x=actor.x+actor.facing*em.x;effects.push({type:'slam',x,y:CONFIG.groundY-2,life:.8,maxLife:.8});if(Math.abs(hero.x-x)<220&&hero.y>CONFIG.groundY-125)hitHero(24,220,'#bfe9ff',actor.x,hero.y-65);}
  }},
  ultimate(seat){activeSeat=seat;const a=actors[seat];if(a.kit==='arco')startSquadron(a);else if(a.kit!=='fenr')startSummon(a);else ports.event?.('ultimate',{seat,kit:'fenr'});},
  guard:actor=>shellGuard(actor),hasSummon,
  update(dt,clock,tick){time=clock;stepCount=tick;
   for(let i=effects.length-1;i>=0;i--){effects[i].life-=dt;if(effects[i].life<=0)effects.splice(i,1);}
   updateProjectiles(dt);
   const updates=[[updateSquadron,squad],[updateSquadron,enemySquad],[updateParade,parade],[updateParade,enemyParade],[updateMurmuration,flock],[updateMurmuration,enemyFlock],[updateSerpent,serpent],[updateSerpent,enemySerpent],[updateQuake,quake],[updateQuake,enemyQuake],[updateFinale,finale],[updateFinale,enemyFinale],[updateSkyfall,skyfall],[updateSkyfall,enemySkyfall],[updateOrrery,orrery],[updateOrrery,enemyOrrery],[updateSunroar,sunroar],[updateSunroar,enemySunroar],[updateDelivery,delivery],[updateDelivery,enemyDelivery],[updateTortoise,tortoise],[updateTortoise,enemyTortoise]];
   for(const [update,group] of updates){activeSeat=group?.owner==='enemy'?1:0;update(dt,group);}
  },
  snapshot(){return structuredClone({groups:groups(),projectiles:[...projectiles],effects:[...effects],seed,time,stepCount});},
  restore(s){({squad,enemySquad,parade,enemyParade,flock,enemyFlock,serpent,enemySerpent,quake,enemyQuake,finale,enemyFinale,skyfall,enemySkyfall,orrery,enemyOrrery,sunroar,enemySunroar,delivery,enemyDelivery,tortoise,enemyTortoise}=structuredClone(s.groups));projectiles.splice(0,projectiles.length,...structuredClone(s.projectiles));effects.splice(0,effects.length,...structuredClone(s.effects));seed=s.seed;time=s.time;stepCount=s.stepCount;
   for(const group of [tortoise,enemyTortoise])if(group?.spirit){const effect=effects.find(e=>e.type==='edda-spirit'&&e.owner===group.owner);if(effect)group.spirit=effect;}
  }
 };
}
`;
fs.writeFileSync(path.join(out,'kit-combat.mjs'),prefix+pieces.join('\n')+suffix);
fs.writeFileSync(path.join(out,'port-provenance.json'),JSON.stringify({generatedFrom:'Attributed MIT kit/combat source',hashes,ownerHitMetadata:'P2 hit metadata normalized to P1 counterpart; symmetric physics in core.mjs'},null,2)+'\n');
console.log('Generated 11 headless kits, geometry and '+names.length+' strike/summon helpers.');
