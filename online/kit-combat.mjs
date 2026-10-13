/* Generated strike/projectile/summon port. Do not edit: run server/tools/build-ports.mjs. */
import Fenr from './kits/fenr.mjs';
import Mira from './kits/mira.mjs';
import Cora from './kits/cora.mjs';
import Naja from './kits/naja.mjs';
import Haldor from './kits/haldor.mjs';
import Zanni from './kits/zanni.mjs';
import Isolde from './kits/isolde.mjs';
import Rhea from './kits/rhea.mjs';
import Solan from './kits/solan.mjs';
import Nib from './kits/nib.mjs';
import Edda from './kits/edda.mjs';
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
function hurtbox(actor){
    const low=actor.state==='down'||actor.state==='recover',height=low?65:actor.state==='crouch'?145:205;
    const kind=actor===hero?selectedCharacter:opponentCharacter,width=kind==='fenr'?112:kind==='haldor'?96:84;
    return {x:actor.x-width/2,y:actor.y-height,w:width,h:height};
  }
function overlap(a,b){return a.x<=b.x+b.w&&a.x+a.w>=b.x&&a.y<=b.y+b.h&&a.y+a.h>=b.y;}
function meleeBox(actor,move){
    const reach=move.reach||140,around=move.around||(move.area&&((actor===hero?selectedCharacter:opponentCharacter)==='fenr'));
    return {x:around?actor.x-reach:actor.facing===1?actor.x:actor.x-reach,y:actor.y-185,w:around?reach*2:reach,h:170};
  }
function meleeContact(actor,target,move){return overlap(meleeBox(actor,move),hurtbox(target));}
function projectileBox(p,oldX=p.x){const radius=Math.max(10,Math.min(28,(p.size||64)*.2));return {x:Math.min(oldX,p.x)-radius,y:p.y-radius,w:Math.abs(p.x-oldX)+radius*2,h:radius*2};}
function attackRange(index) {
    if(selectedCharacter==='fenr')return F.move(hero,'attack',index).reach;
    if(KITS[selectedCharacter])return KITS[selectedCharacter].move('attack',index).reach;
    const name = `attack${index}`, data = manifest?.combat?.hitRanges?.[name];
    const measured = metrics?.states?.[name]?.frames;
    return typeof data === 'number' ? data : data?.reach || (measured?.length ? Math.max(...measured.map(f => f.bounds.right)) : [122, 143, 176][index - 1]);
  }
function emitter(name) {
    const measured = metrics?.emitters?.[name];
    if (measured && Number.isFinite(measured.x) && Number.isFinite(measured.y)) return { x: hero.x + hero.facing * measured.x, y: hero.y + measured.y };
    // Fallbacks measured on the first atlas, not inferred from the cell dimensions.
    const fallback = { attack1: [61, -105], attack2: [27, -157], attack3: [47, -102], skill1: [89, -113], skill2: [30, 0], ultimate: [88, -93] }[name] || [50, -100];
    return { x: hero.x + hero.facing * fallback[0], y: hero.y + fallback[1] };
  }
function meleeHit(index) {
    if(selectedCharacter==='fenr'){fenrStrike(hero,F.move(hero,'attack',index));return;}
    if(selectedCharacter==='mira'){miraStrike(hero,M.move('attack',index));return;}
    if(selectedCharacter==='cora'){coraStrike(hero,C.move('attack',index));return;}
    if(selectedCharacter==='naja'){najaStrike(hero,N.move('attack',index));return;}
    if(selectedCharacter==='haldor'){haldorStrike(hero,HD.move('attack',index));return;}
    if(selectedCharacter==='zanni'){zanniStrike(hero,Z.move('attack',index));return;}
    if(selectedCharacter==='isolde'){isoldeStrike(hero,IS.move('attack',index));return;}
    if(selectedCharacter==='rhea'){rheaStrike(hero,RH.move('attack',index));return;}
    if(selectedCharacter==='solan'){solanStrike(hero,SO.move('attack',index));return;}
    if(selectedCharacter==='nib'){nibStrike(hero,NB.move('attack',index));return;}
    if(selectedCharacter==='edda'){eddaStrike(hero,ED.move('attack',index));return;}
    const reach = attackRange(index), dx = (dummy.x - hero.x) * hero.facing, y = emitter(`attack${index}`).y;
    effects.push({ type: 'slash', x: hero.x + hero.facing * 48, y: y + 5, life: .22, maxLife: .22, facing: hero.facing, index, color: index === 3 ? '#ffe4a5' : '#cffbf0' });
    if (meleeContact(hero,dummy,{reach})) {
      const connected = hitDummy(BALANCE.combo[index-1].damage, BALANCE.combo[index-1].knockback, index === 3 ? '#ffdf92' : '#c6fff0', hero.x, y);
      if (connected) for (const name of Object.keys(cooldownMax)) {
        if(hero.cooldowns[name]>0) rechargePulse[name]=.22;
        hero.cooldowns[name] = Math.max(0, hero.cooldowns[name] - cooldownMax[name] * BALANCE.basicCooldownRefund);
      }
    }
    else sound('step');
  }
function fireSkill(action) {
    if(selectedCharacter==='fenr'){fenrStrike(hero,action);return;}
    if(selectedCharacter==='mira'){miraStrike(hero,action);return;}
    if(selectedCharacter==='cora'){coraStrike(hero,action);return;}
    if(selectedCharacter==='naja'){najaStrike(hero,action);return;}
    if(selectedCharacter==='haldor'){haldorStrike(hero,action);return;}
    if(selectedCharacter==='zanni'){zanniStrike(hero,action);return;}
    if(selectedCharacter==='isolde'){isoldeStrike(hero,action);return;}
    if(selectedCharacter==='rhea'){rheaStrike(hero,action);return;}
    if(selectedCharacter==='solan'){solanStrike(hero,action);return;}
    if(selectedCharacter==='nib'){nibStrike(hero,action);return;}
    if(selectedCharacter==='edda'){eddaStrike(hero,action);return;}
    const name = action.type, origin = emitter(name);
    if (name === 'skill1') { projectiles.push({ x: origin.x, y: origin.y, vx: hero.facing * 920, life: 1.6, facing: hero.facing }); effects.push({ type: 'muzzle', x: origin.x, y: origin.y, life: .25, maxLife: .25 }); spawnParticles(origin.x, origin.y, '#a9f8ef', 12, 140); }
    if (name === 'skill2') { const x = origin.x; effects.push({ type: 'slam', x, y: CONFIG.groundY - 2, life: .8, maxLife: .8 }); spawnParticles(x, CONFIG.groundY - 8, '#c7eafd', 40, 370); trauma = Math.min(1, trauma + .35); sound('heavy'); if (Math.abs(dummy.x - x) < BALANCE.skill2.radius && dummy.y > CONFIG.groundY - 125) hitDummy(BALANCE.skill2.damage, BALANCE.skill2.knockback, '#bfe9ff', hero.x, dummy.y - 65); }
  }
function startSquadron(actor = hero) {
    const target=actor===hero?dummy:hero;
    const centerX = clamp(actor.x, 220, W - 220), baseY = clamp(actor.y, 480, CONFIG.groundY);
    const offsets = [[-150,-240],[-55,-310],[65,-305],[160,-235]];
    const group = { t: 0, owner:actor===hero?'player':'enemy', facing: actor.facing, casterX: actor.x, targeted: (target.x - actor.x) * actor.facing >= 0,
      shots: 0, phase: 'cutin', drones: offsets.map(([dx,dy], i) => ({ id: i, x: centerX + actor.facing * (dx - 360), y: -130 - i * 55,
        startX: centerX + actor.facing * (dx - 360), startY: -130 - i * 55, targetX: centerX + actor.facing * dx,
        targetY: baseY + dy, delay: .46 + i * .10, fired: false, visible: false, alpha: 1, angle: 0 })) };
    if(actor===hero)squad=group;else enemySquad=group;
    cinematic = .9; announceTimer = 0;
    startUltimateVoice('arco',actor);
  }
function updateSquadron(dt, s = squad) {
    if (!s) return;
    const target=s.owner==='enemy'?hero:dummy;s.t += dt;
    s.phase = s.t < SQUAD.cutinDuration ? 'cutin' : s.t < SQUAD.firstShot ? 'lock-on' : s.t < SQUAD.departure ? 'firing' : 'departing';
    for (const d of s.drones) {
      const entry = clamp((s.t - d.delay) / .60, 0, 1), ease = 1 - Math.pow(1 - entry, 3);
      d.visible = s.t >= d.delay;
      d.x = d.startX + (d.targetX - d.startX) * ease;
      d.y = d.startY + (d.targetY - d.startY) * ease;
      if (entry === 1) d.y += Math.sin((s.t - d.delay) * 5 + d.id) * 2;
      if (s.t > SQUAD.departure) { const exit = clamp((s.t - SQUAD.departure) / .6, 0, 1); d.x += s.facing * exit * exit * 280; d.y -= exit * exit * 470; d.alpha = 1 - exit; }
      const targetX = s.targeted ? target.x : (s.facing === 1 ? W + 50 : -50);
      const targetY = s.targeted ? target.y - 85 : CONFIG.groundY - 90;
      d.angle = s.facing * Math.atan2(targetY - d.y, Math.abs(targetX - d.x));
      if (!d.fired && s.t >= SQUAD.firstShot + d.id * SQUAD.shotGap) {
        d.fired = true; s.shots++;
        const origin = droneMuzzle(d, s.facing);
        effects.push({ type: 'drone-laser', owner:s.owner, x: origin.x, y: origin.y, endX: targetX, endY: targetY, life: .65, maxLife: .65, droneId: d.id });
        effects.push({ type: 'muzzle', x: origin.x, y: origin.y, life: .19, maxLife: .19, color: '#fff0be' });
        spawnParticles(origin.x, origin.y, '#a8fff0', 8, 90);
        trauma = Math.max(trauma, d.id === 3 ? .5 : .23); sound('cast');
        if (s.targeted && (target.x - s.casterX) * s.facing >= -30) {
          if(s.owner==='enemy')hitHero(BALANCE.ultimate.damagePerDrone,d.id === 3 ? BALANCE.ultimate.knockback : 45,'#ffe2a0',s.casterX,targetY,false,false);
          else hitDummy(BALANCE.ultimate.damagePerDrone, d.id === 3 ? BALANCE.ultimate.knockback : 45, '#ffe2a0', s.casterX, targetY, false, false);
        }
      }
    }
    for (const e of effects) {
      if (e.type !== 'drone-laser'||e.owner!==s.owner) continue;
      const origin = droneMuzzle(s.drones[e.droneId], s.facing);
      e.x = origin.x; e.y = origin.y;
      if (s.targeted) { e.endX = target.x; e.endY = target.y - 85; }
    }
    if (s.t >= SQUAD.duration) { if(s.owner==='enemy')enemySquad=null;else squad=null;if (voiceActive && voiceKind === 'arco' && (voiceActor===dummy)===(s.owner==='enemy')) stopUltimateVoice(); }
  }
function startRocketParade(actor = hero) {
    const target = actor === hero ? dummy : hero, P = M.parade;
    const group = { t: 0, owner: actor === hero ? 'player' : 'enemy', facing: actor.facing, casterX: actor.x,
      targeted: (target.x - actor.x) * actor.facing >= 0, hits: 0, launched: 0, exploded: 0, phase: 'cutin',
      rockets: Array.from({ length: M.balance.rockets }, (_, i) => ({ id: i, pod: i % 2, launchAt: P.launchStart + i * P.launchGap,
        impactAt: P.impactStart + i * P.impactGap, spread: ((i * 7) % 11 - 5) * 9, lift: 250 + ((i * 5) % 4) * 38,
        state: 'loaded', locked: false, x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, angle: 0 })) };
    if (actor === hero) parade = group; else enemyParade = group;
    cinematic = .9; announceTimer = 0;
    startUltimateVoice('mira', actor);
  }
function paradeAim(s, r, target) {
    if (s.targeted) return { x: target.x + r.spread, y: target.y - 70 - Math.abs(r.spread) * .6 };
    return { x: clamp(s.casterX + s.facing * (380 + r.id * 22), 40, W - 40), y: CONFIG.groundY - 14 };
  }
function updateParade(dt, s) {
    if (!s) return;
    const actor = s.owner === 'enemy' ? dummy : hero, target = s.owner === 'enemy' ? hero : dummy, P = M.parade;
    const pods = kitEnv.MIRA_METRICS?.emitters?.ultimatePods?.pods || [{ x: -34, y: -168 }, { x: 71, y: -147 }];
    s.t += dt;
    for (const r of s.rockets) {
      if (r.state === 'loaded' && s.t >= r.launchAt) {
        // Rockets leave the pods where the robot stands now; the salvo keeps its own cast direction and target lock.
        const pod = pods[r.pod % pods.length];
        r.state = 'flying'; r.sx = r.x = actor.x + actor.facing * pod.x; r.sy = r.y = actor.y + pod.y; s.launched++;
        effects.push({ type: 'muzzle', x: r.sx, y: r.sy, life: .16, maxLife: .16, color: '#ffe38a' });
        if (r.id % 3 === 0) sound('cast');
      }
      if (r.state !== 'flying') continue;
      const u = clamp((s.t - r.launchAt) / (r.impactAt - r.launchAt), 0, 1);
      if (!r.locked) { const aim = paradeAim(s, r, target); r.tx = aim.x; r.ty = aim.y; r.locked = u >= .8; }
      const cx = r.sx + (r.tx - r.sx) * .35, cy = Math.min(r.sy, r.ty) - r.lift, inv = 1 - u;
      const nx = inv * inv * r.sx + 2 * inv * u * cx + u * u * r.tx, ny = inv * inv * r.sy + 2 * inv * u * cy + u * u * r.ty;
      if (nx !== r.x || ny !== r.y) r.angle = Math.atan2(ny - r.y, nx - r.x);
      r.x = nx; r.y = ny;
      if ((stepCount + r.id) % 4 === 0) particles.push({ kind: 'dust', x: r.x - Math.cos(r.angle) * 24, y: r.y - Math.sin(r.angle) * 24, vx: -Math.cos(r.angle) * 40, vy: -Math.sin(r.angle) * 40, life: .32, maxLife: .32, size: 3 + random() * 3, color: r.id % 2 ? '#ffc7ea' : '#ffe39a' });
      if (u < 1) continue;
      r.state = 'done'; s.exploded++;
      effects.push({ type: 'mira-fx', asset: 'mira-burst', x: r.x, y: r.y, facing: 1, life: .34, maxLife: .34, size: 92 });
      spawnParticles(r.x, r.y, '#ffc6ec', 6, 150);
      if (s.targeted && Math.abs(target.x - r.x) < 85 && Math.abs(target.y - 90 - r.y) < 115) {
        const last = r.id === s.rockets.length - 1;
        const connected = s.owner === 'enemy' ? hitHero(M.balance.rocketDamage,last ? 190 : 30,'#ffd86b',s.casterX,r.y,false,false,.3)
          : hitDummy(M.balance.rocketDamage, last ? 190 : 30, '#ffd86b', s.casterX, r.y, false, false, .3);
        if (connected) s.hits++;
      }
    }
    s.phase = s.t < P.cutinDuration ? 'cutin' : s.exploded < s.rockets.length ? 'barrage' : 'clearing';
    if (s.t >= P.duration) { if (s.owner === 'enemy') enemyParade = null; else parade = null; }
  }
function startSummon(actor) { const id = actor === hero ? selectedCharacter : opponentCharacter; if (id === 'cora') startMurmuration(actor); else if (id === 'naja') startSerpent(actor); else if (id === 'haldor') startQuake(actor); else if (id === 'zanni') startFinale(actor); else if (id === 'isolde') startSkyfall(actor); else if (id === 'rhea') startOrrery(actor); else if (id === 'solan') startSunroar(actor); else if (id === 'nib') startDelivery(actor); else if (id === 'edda') startTortoise(actor); else startRocketParade(actor); }
function startMurmuration(actor = hero) {
    const U = C.murmuration;
    const group = { t: 0, owner: actor === hero ? 'player' : 'enemy', facing: actor.facing, casterX: actor.x, hits: 0, phase: 'cutin',
      passes: U.passStart.map((at, id) => ({ id, at, y: CONFIG.groundY + U.passHeights[id], front: actor.x - actor.facing * 140, state: 'waiting', hit: false })) };
    if (actor === hero) flock = group; else enemyFlock = group;
    cinematic = .9; announceTimer = 0;
    startUltimateVoice('cora', actor);
  }
function updateMurmuration(dt, s) {
    if (!s) return;
    const target = s.owner === 'enemy' ? hero : dummy, U = C.murmuration, tail = (U.ravens - 1) * U.spacing;
    s.t += dt;
    for (const p of s.passes) {
      if (p.state === 'waiting' && s.t >= p.at) { p.state = 'flying'; sound('cast'); }
      if (p.state !== 'flying') continue;
      const old = p.front; p.front += s.facing * U.speed * dt;
      if (!p.hit && (target.x - old) * s.facing >= 0 && (target.x - p.front) * s.facing < 0) {
        // Only a target in front of the cast whose body overlaps this pass height is struck; a jump can clear the low pass.
        p.hit = true;
        if ((target.x - s.casterX) * s.facing >= -30 && p.y > target.y - 200 && p.y < target.y + 20) {
          const connected = s.owner === 'enemy' ? hitHero(C.balance.passDamage,p.id === s.passes.length - 1 ? 190 : 60,'#d9c2ff',s.casterX,p.y,false,false,.6)
            : hitDummy(C.balance.passDamage, p.id === s.passes.length - 1 ? 190 : 60, '#d9c2ff', s.casterX, p.y, false, false, .6);
          if (connected) { s.hits++; spawnParticles(target.x, p.y, '#3a2d58', 10, 180); }
        }
      }
      if ((stepCount + p.id) % 5 === 0) particles.push({ kind: 'dust', x: p.front - s.facing * random() * tail, y: p.y + (random() - .5) * 40, vx: -s.facing * 30, vy: 30, life: .5, maxLife: .5, size: 2 + random() * 2, color: '#3a2d58' });
      const tailX = p.front - s.facing * tail;
      if (s.facing > 0 ? tailX > W + 80 : tailX < -80) p.state = 'done';
    }
    s.phase = s.t < U.cutinDuration ? 'cutin' : s.passes.some(p => p.state !== 'done') ? 'sweeping' : 'clearing';
    if (s.t >= U.duration) { if (s.owner === 'enemy') enemyFlock = null; else flock = null; }
  }
function startSerpent(actor = hero) {
    const U = N.serpent, target = actor === hero ? dummy : hero;
    const group = { t: 0, owner: actor === hero ? 'player' : 'enemy', facing: actor.facing, casterX: actor.x, hits: 0, phase: 'cutin',
      strikes: U.strikes.map((at, id) => ({ id, at, lockAt: at - U.telegraph, appearAt: id ? U.strikes[id - 1] - U.telegraph : U.follow,
        x: id ? target.x : clamp(actor.x + actor.facing * 90, 60, W - 60), state: 'waiting', lockedAt: 0, hit: false })) };
    if (actor === hero) serpent = group; else enemySerpent = group;
    cinematic = .9; announceTimer = 0;
    startUltimateVoice('naja', actor);
  }
function updateSerpent(dt, s) {
    if (!s) return;
    const target = s.owner === 'enemy' ? hero : dummy, U = N.serpent;
    s.t += dt;
    for (const k of s.strikes) {
      if (k.state === 'waiting' && s.t >= k.appearAt) { k.state = 'tracking'; if (k.id) k.x = s.strikes[k.id - 1].x; }
      if (k.state === 'tracking') {
        k.x = clamp(approach(k.x, target.x, U.speed * dt), 60, W - 60);
        if (s.t >= k.lockAt) { k.state = 'locked'; k.lockedAt = time; sound('step'); }
      }
      if (k.state === 'locked' && s.t >= k.at) {
        k.state = 'erupting'; trauma = Math.min(1, trauma + .22); sound('heavy');
        spawnParticles(k.x, CONFIG.groundY - 12, '#e3bf78', 22, 300, 'dust'); spawnParticles(k.x, CONFIG.groundY - 60, '#f6dc9c', 12, 260);
        if (!k.hit && Math.abs(target.x - k.x) < U.radius && CONFIG.groundY - target.y < U.height) {
          k.hit = true;
          const last = k.id === s.strikes.length - 1;
          const connected = s.owner === 'enemy' ? hitHero(N.balance.biteDamage,last ? 190 : 60,'#ffd98a',s.casterX,target.y - 100,false,false,.6)
            : hitDummy(N.balance.biteDamage, last ? 190 : 60, '#ffd98a', s.casterX, target.y - 100, false, false, .6);
          if (connected) s.hits++;
        }
      }
      if (k.state === 'erupting' && s.t >= k.at + U.rise) k.state = 'done';
    }
    s.phase = s.t < U.cutinDuration ? 'cutin' : s.strikes.some(k => k.state !== 'done') ? 'striking' : 'clearing';
    if (s.t >= U.duration) { if (s.owner === 'enemy') enemySerpent = null; else serpent = null; }
  }
function startQuake(actor = hero) {
    const group = { t: 0, owner: actor === hero ? 'player' : 'enemy', facing: actor.facing, x: clamp(actor.x + actor.facing * 70, 60, W - 60), slams: 0, phase: 'cutin' };
    if (actor === hero) quake = group; else enemyQuake = group;
    cinematic = .9; announceTimer = 0;
    startUltimateVoice('haldor', actor);
  }
function updateQuake(dt, s) {
    if (!s) return;
    const U = HD.quake;
    s.t += dt;
    while (s.slams < U.slams.length && s.t >= U.slams[s.slams]) {
      const last = s.slams === U.slams.length - 1; s.slams++;
      effects.push({ type: 'haldor-fx', asset: 'haldor-splash', x: s.x, y: CONFIG.groundY - 24, facing: s.facing, life: .35, maxLife: .35, size: 170 });
      spawnParticles(s.x, CONFIG.groundY - 10, '#ff8a2a', 20, 320); dust(s.x, 16); trauma = Math.min(1, trauma + .3); sound('heavy');
      for (const dir of [-1, 1]) projectiles.push({ x: s.x + dir * 30, y: CONFIG.groundY - 22, vx: dir * U.speed, life: 1.9, facing: dir, owner: s.owner, damage: HD.balance.quakeDamage, knockback: last ? 190 : 60, asset: 'haldor-quake', size: 124, color: '#ffb35c' });
    }
    s.phase = s.t < U.cutinDuration ? 'cutin' : s.slams < U.slams.length ? 'slamming' : 'rolling';
    if (s.t >= U.duration) { if (s.owner === 'enemy') enemyQuake = null; else quake = null; }
  }
function startFinale(actor = hero) {
    const group = { t: 0, owner: actor === hero ? 'player' : 'enemy', facing: actor.facing, throws: 0, phase: 'cutin' };
    if (actor === hero) finale = group; else enemyFinale = group;
    cinematic = .9; announceTimer = 0;
    startUltimateVoice('zanni', actor);
  }
function updateFinale(dt, s) {
    if (!s) return;
    const U = Z.finale, a = s.owner === 'enemy' ? dummy : hero, em = kitEnv.ZANNI_METRICS?.emitters?.ultimate;
    s.t += dt;
    while (s.throws < U.throws.length && s.t >= U.throws[s.throws]) {
      const last = s.throws === U.throws.length - 1; s.throws++;
      const x = a.x + s.facing * (em?.x ?? 90), y = clamp(a.y + (em?.y ?? -95), a.y - 130, a.y - 70);
      projectiles.push({ x, y, vx: s.facing * U.speed, life: 4, facing: s.facing, owner: s.owner, damage: Z.balance.finaleDamage, knockback: last ? 190 : 50, asset: 'zanni-bigring', size: U.size, color: '#e4f36a',
        boomerang: true, range: Math.max(120, s.facing > 0 ? W - 60 - x : x - 60), travel: 0, spin: 16, freeze: false });
      effects.push({ type: 'zanni-fx', asset: 'zanni-confetti', x: x + s.facing * 20, y, facing: s.facing, life: .35, maxLife: .35, size: 170 });
      spawnParticles(x, y, '#e4f36a', 14, 260); sound('cast');
    }
    s.phase = s.t < U.cutinDuration ? 'cutin' : s.throws < U.throws.length ? 'throwing' : 'returning';
    if (s.t >= U.duration && !projectiles.some(p => p.asset === 'zanni-bigring' && p.owner === s.owner)) { if (s.owner === 'enemy') enemyFinale = null; else finale = null; }
  }
function startSkyfall(actor = hero) {
    const group = { t: 0, owner: actor === hero ? 'player' : 'enemy', facing: actor.facing, calls: 0, phase: 'cutin' };
    if (actor === hero) skyfall = group; else enemySkyfall = group;
    cinematic = .9; announceTimer = 0;
    startUltimateVoice('isolde', actor);
  }
function updateSkyfall(dt, s) {
    if (!s) return;
    const U = IS.skyfall, target = s.owner === 'enemy' ? hero : dummy;
    s.t += dt;
    while (s.calls < U.calls.length && s.t >= U.calls[s.calls]) {
      const last = s.calls === U.calls.length - 1; s.calls++;
      const tx = clamp(target.x, 40, W - 40), land = CONFIG.groundY - 40, x = tx - s.facing * U.back, y = land - U.height;
      projectiles.push({ x, y, vx: s.facing * U.back / U.flight, vy: U.height / U.flight, life: U.flight + .3, facing: s.facing, owner: s.owner, damage: IS.balance.lanceDamage, knockback: last ? 190 : 50,
        asset: 'isolde-skyfall', size: U.size, color: '#bfe6ff', landY: land, shatter: U.shatter, freeze: false });
      spawnParticles(x, y + 40, '#dff3ff', 8, 160);
    }
    s.phase = s.t < U.cutinDuration ? 'cutin' : s.calls < U.calls.length ? 'calling' : 'falling';
    if (s.t >= U.duration && !projectiles.some(p => p.asset === 'isolde-skyfall' && p.owner === s.owner)) { if (s.owner === 'enemy') enemySkyfall = null; else skyfall = null; }
  }
function lanceShatter(p) {
    effects.push({ type: 'isolde-fx', asset: 'isolde-shatter', x: p.x, y: CONFIG.groundY - 40, facing: p.facing, life: .4, maxLife: .4, size: 190 });
    spawnParticles(p.x, CONFIG.groundY - 20, '#dff3ff', 18, 280); dust(p.x, 14); sound('heavy'); trauma = Math.min(1, trauma + .18);
    if (p.owner === 'enemy') { if (Math.abs(hero.x - p.x) < p.shatter && hero.y > CONFIG.groundY - 70) hitHero(p.damage,p.knockback,p.color,p.x - p.facing * 20,CONFIG.groundY - 60,false,false); }
    else if (Math.abs(dummy.x - p.x) < p.shatter && dummy.y > CONFIG.groundY - 70) hitDummy(p.damage, p.knockback, p.color, p.x - p.facing * 20, CONFIG.groundY - 60, false, false);
  }
function startOrrery(actor = hero) {
    const group = { t: 0, owner: actor === hero ? 'player' : 'enemy', facing: actor.facing, released: 0, phase: 'cutin' };
    if (actor === hero) orrery = group; else enemyOrrery = group;
    cinematic = .9; announceTimer = 0;
    startUltimateVoice('rhea', actor);
  }
function updateOrrery(dt, s) {
    if (!s) return;
    const U = RH.orrery, a = s.owner === 'enemy' ? dummy : hero;
    s.t += dt;
    while (s.released < U.releases.length && s.t >= U.releases[s.released]) {
      const last = s.released === U.releases.length - 1; s.released++;
      projectiles.push({ x: a.x + s.facing * U.rx, y: a.y - 90, vx: 0, life: U.lap + .2, facing: s.facing, owner: s.owner, damage: RH.balance.planetDamage, knockback: last ? 190 : 40,
        asset: 'rhea-planet', size: U.size, color: '#f2c77a', orbit: true, angle: 0, lap: U.lap, rx: U.rx, ry: U.ry, spin: 2, freeze: false });
      effects.push({ type: 'rhea-fx', asset: 'rhea-burst', x: a.x + s.facing * U.rx, y: a.y - 90, facing: s.facing, life: .3, maxLife: .3, size: 150 });
      spawnParticles(a.x, a.y - 90, '#f2c77a', 12, 220); sound('cast');
    }
    s.phase = s.t < U.cutinDuration ? 'cutin' : s.released < U.releases.length ? 'releasing' : 'orbiting';
    if (s.t >= U.duration && !projectiles.some(p => p.asset === 'rhea-planet' && p.owner === s.owner)) { if (s.owner === 'enemy') enemyOrrery = null; else orrery = null; }
  }
function wellBurst(p) {
    effects.push({ type: 'rhea-fx', asset: 'rhea-burst', x: p.x, y: p.y, facing: p.facing, life: .35, maxLife: .35, size: 200 });
    spawnParticles(p.x, p.y, '#e8b0c0', 18, 260); sound('heavy'); trauma = Math.min(1, trauma + .15);
    if (p.owner === 'enemy') { if (Math.abs(hero.x - p.x) < p.radius && hero.y > CONFIG.groundY - 150) hitHero(p.damage,p.knockback,p.color,p.x,p.y,false,true); }
    else if (Math.abs(dummy.x - p.x) < p.radius && dummy.y > CONFIG.groundY - 150) hitDummy(p.damage, p.knockback, p.color, p.x, p.y, false, true);
  }
function startSunroar(actor = hero) {
    const group = { t: 0, owner: actor === hero ? 'player' : 'enemy', facing: actor.facing, roars: 0, phase: 'cutin' };
    if (actor === hero) sunroar = group; else enemySunroar = group;
    cinematic = .9; announceTimer = 0;
    startUltimateVoice('solan', actor);
  }
function updateSunroar(dt, s) {
    if (!s) return;
    const U = SO.roar, a = s.owner === 'enemy' ? dummy : hero;
    s.t += dt;
    while (s.roars < U.roars.length && s.t >= U.roars[s.roars]) {
      const last = s.roars === U.roars.length - 1; s.roars++;
      effects.push({ type: 'solan-fx', asset: 'solan-sunburst', x: a.x, y: a.y - 110, facing: s.facing, life: .3, maxLife: .3, size: 160 });
      spawnParticles(a.x, a.y - 95, '#ffd36a', 16, 260); trauma = Math.min(1, trauma + .25); sound('heavy');
      for (const dir of [-1, 1]) projectiles.push({ x: a.x + dir * 40, y: CONFIG.groundY - 110, vx: dir * U.speed, life: U.range / U.speed, facing: dir, owner: s.owner, damage: SO.balance.roarDamage, knockback: last ? 190 : 50,
        asset: 'solan-roar', size: U.size, color: '#ffd36a', tall: U.tall, freeze: false });
    }
    s.phase = s.t < U.cutinDuration ? 'cutin' : s.roars < U.roars.length ? 'roaring' : 'fading';
    if (s.t >= U.duration && !projectiles.some(p => p.asset === 'solan-roar' && p.owner === s.owner)) { if (s.owner === 'enemy') enemySunroar = null; else sunroar = null; }
  }
function startDelivery(actor = hero) {
    const group = { t: 0, owner: actor === hero ? 'player' : 'enemy', facing: actor.facing, released: 0, phase: 'cutin' };
    if (actor === hero) delivery = group; else enemyDelivery = group;
    cinematic = .9; announceTimer = 0;
    startUltimateVoice('nib', actor);
  }
function updateDelivery(dt, s) {
    if (!s) return;
    const U = NB.delivery, a = s.owner === 'enemy' ? dummy : hero;
    s.t += dt;
    while (s.released < U.releases.length && s.t >= U.releases[s.released]) {
      const last = s.released === U.releases.length - 1; s.released++;
      const x = a.x + s.facing * 30, y = a.y - 110;
      projectiles.push({ x, y, vx: s.facing * U.speed * .6, vy: -U.speed * .8, life: U.life, facing: s.facing, owner: s.owner, damage: NB.balance.planeDamage, knockback: last ? 180 : 40,
        asset: 'nib-plane', size: U.size, color: '#8fd4ff', homing: true, speedH: U.speed, turn: U.turn, freeze: false });
      effects.push({ type: 'nib-fx', asset: 'nib-stamp', x, y, facing: s.facing, life: .3, maxLife: .3, size: 130 });
      spawnParticles(x, y, '#f4efe2', 10, 200); sound('cast');
    }
    s.phase = s.t < U.cutinDuration ? 'cutin' : s.released < U.releases.length ? 'releasing' : 'flying';
    if (s.t >= U.duration && !projectiles.some(p => p.asset === 'nib-plane' && p.owner === s.owner)) { if (s.owner === 'enemy') enemyDelivery = null; else delivery = null; }
  }
function startTortoise(actor = hero) {
    const U = ED.tortoise, group = { t: 0, owner: actor === hero ? 'player' : 'enemy', facing: actor.facing, x: clamp(actor.x + actor.facing * U.ahead, 60, W - 60), stomped: 0, phase: 'cutin', spirit: null };
    if (actor === hero) tortoise = group; else enemyTortoise = group;
    cinematic = .9; announceTimer = 0;
    startUltimateVoice('edda', actor);
  }
function updateTortoise(dt, s) {
    if (!s) return;
    const U = ED.tortoise; s.t += dt;
    if (!s.spirit && s.t >= U.appear) {
      s.spirit = { type: 'edda-spirit', asset: 'edda-tortoise', x: s.x, y: CONFIG.groundY + 8, facing: s.facing, life: U.duration - U.appear, maxLife: U.duration - U.appear, size: U.size, lift: 0 };
      effects.push(s.spirit); spawnParticles(s.x, CONFIG.groundY - 20, '#8fe3b4', 24, 260); sound('cast');
    }
    if (s.spirit) {
      s.x = clamp(s.x + s.facing * U.speed * dt, 60, W - 60); s.spirit.x = s.x;
      s.spirit.lift = U.stomps.reduce((m, ts) => Math.max(m, 34 * Math.max(0, 1 - Math.abs(s.t - (ts - .16)) / .16)), 0);
    }
    while (s.stomped < U.stomps.length && s.t >= U.stomps[s.stomped]) {
      const last = s.stomped === U.stomps.length - 1, target = s.owner === 'enemy' ? hero : dummy; s.stomped++;
      effects.push({ type: 'edda-fx', asset: 'edda-stomp', x: s.x + s.facing * 50, y: CONFIG.groundY - 30, facing: s.facing, life: .35, maxLife: .35, size: 220 });
      spawnParticles(s.x + s.facing * 50, CONFIG.groundY - 8, '#d8c089', 22, 320); sound('heavy'); trauma = Math.min(1, trauma + .22);
      if (Math.abs(target.x - s.x) < U.half && target.y > CONFIG.groundY - 40) {
        if (s.owner === 'enemy') hitHero(ED.balance.stompDamage,last ? 200 : 40,'#8fe3b4',s.x,CONFIG.groundY - 60,false,false);
        else hitDummy(ED.balance.stompDamage, last ? 200 : 40, '#8fe3b4', s.x, CONFIG.groundY - 60, false, false);
      }
    }
    s.phase = s.t < U.cutinDuration ? 'cutin' : s.stomped < U.stomps.length ? 'stomping' : 'fading';
    if (s.t >= U.duration) { if (s.owner === 'enemy') enemyTortoise = null; else tortoise = null; }
  }
function shellGuard(actor) {
    const a = actor.action; if (!a?.guard || a.countered || a.t >= a.guardEnd) return false;
    a.countered = true; if (a.t < .34) { a.t = .34; actor.stateTime = .34; }
    const target = actor === hero ? dummy : hero, em = kitEnv.EDDA_METRICS?.emitters?.skill2, dx = target.x - actor.x;
    effects.push({ type: 'edda-fx', asset: 'edda-shell', x: actor.x, y: actor.y - 80, facing: actor.facing, life: .35, maxLife: .35, size: 170 });
    spawnParticles(actor.x, actor.y - 80, '#e8d9a8', 14, 240); sound('heavy');
    if (Math.abs(dx) < ED.counter.reach && Math.abs(target.y - actor.y) < 115) {
      actor.facing = Math.sign(dx) || actor.facing;
      const hy = actor.y + (em?.y ?? -90);
      effects.push({ type: 'whip', x: actor.x, y: hy, facing: actor.facing, tip: em?.x ?? 130, life: .16, maxLife: .16, index: 3, color: '#ffe9a8' });
      if (actor === hero) hitDummy(ED.counter.damage, ED.counter.knockback, '#ffe9a8', actor.x, hy, false, true); else hitHero(ED.counter.damage,ED.counter.knockback,'#ffe9a8',actor.x,hy,false,true);
    }
    return true;
  }
function droneMuzzle(d, facing) {
    const muzzle = kitEnv.DRONE_ASSET?.muzzle || { x: 51, y: 0 };
    const c = Math.cos(d.angle), s = Math.sin(d.angle), x = facing * muzzle.x, y = muzzle.y;
    return { x: d.x + x * c - y * s, y: d.y + x * s + y * c };
  }
function slagSplash(p) {
    effects.push({ type: 'haldor-fx', asset: 'haldor-splash', x: p.x, y: CONFIG.groundY - 26, facing: p.facing, life: .4, maxLife: .4, size: 150 });
    spawnParticles(p.x, CONFIG.groundY - 12, '#ff9a3c', 16, 260); sound('heavy'); trauma = Math.min(1, trauma + .12);
    if (p.owner === 'enemy') { if (Math.abs(hero.x - p.x) < p.splash && hero.y > CONFIG.groundY - 60) hitHero(p.damage,p.knockback,p.color,p.x - p.facing * 20,CONFIG.groundY - 45,false,false); }
    else if (Math.abs(dummy.x - p.x) < p.splash && dummy.y > CONFIG.groundY - 60) hitDummy(p.damage, p.knockback, p.color, p.x - p.facing * 20, CONFIG.groundY - 45, false, false);
  }
function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) { const p = projectiles[i], oldX = p.x;
      // NIB paper planes steer toward the rival's chest, turning at most p.turn rad/s.
      if (p.homing) { const t = p.owner === 'enemy' ? hero : dummy, want = Math.atan2(t.y - 85 - p.y, t.x - p.x), cur = Math.atan2(p.vy, p.vx); let d = want - cur; d = Math.atan2(Math.sin(d), Math.cos(d)); const ang = cur + clamp(d, -p.turn * dt, p.turn * dt); p.vx = Math.cos(ang) * p.speedH; p.vy = Math.sin(ang) * p.speedH; p.facing = p.vx >= 0 ? 1 : -1; }
      // EDDA Stone Skip: the stone falls under its own gravity and hops off the floor p.bounces more times, then sinks.
      if (p.skip) { p.vy += p.skipG * dt; if (p.vy > 0 && p.y + p.vy * dt >= CONFIG.groundY - 14) { effects.push({ type: 'edda-fx', asset: 'edda-ripple', x: p.x, y: CONFIG.groundY - 14, facing: p.facing, life: .3, maxLife: .3, size: 110 }); if (p.bounces-- > 0) { p.y = CONFIG.groundY - 14; p.vy = -p.hop; sound('step'); } else { projectiles.splice(i, 1); continue; } } }
      if (p.gravity) p.vy += p.gravity * dt; p.x += p.vx * dt; p.y += (p.vy || 0) * dt; p.life -= dt;
      if (p.gravity && p.y >= CONFIG.groundY - 8) { slagSplash(p); projectiles.splice(i, 1); continue; }
      if (p.landY && p.y >= p.landY) { lanceShatter(p); projectiles.splice(i, 1); continue; }
      // RHEA: a Gravity Well waits in place and collapses; an Orrery planet laps around its owner.
      if (p.inert) { if (p.life <= 0) { wellBurst(p); projectiles.splice(i, 1); } continue; }
      if (p.orbit) {
        const home = p.owner === 'enemy' ? dummy : hero; p.angle += Math.PI * 2 * dt / p.lap;
        if (p.angle >= Math.PI * 2) { projectiles.splice(i, 1); continue; }
        p.x = home.x + p.facing * p.rx * Math.cos(p.angle); p.y = home.y - 90 + p.ry * Math.sin(p.angle);
      }
      // ZANNI rings fly out `range` px, then home back to the thrower and vanish in his hand. One hit per ring (`spent`).
      if (p.boomerang) {
        p.travel += Math.abs(p.x - oldX);
        if (!p.returning && p.travel >= p.range) p.returning = true;
        if (p.returning) { const home = p.owner === 'enemy' ? dummy : hero; p.vx = Math.sign(home.x - p.x || 1) * Math.abs(p.vx); p.facing = Math.sign(p.vx); p.y += (clamp(home.y - 95, home.y - 130, home.y - 60) - p.y) * Math.min(1, dt * 6); if (Math.abs(home.x - p.x) < 34 && p.travel > 80) { projectiles.splice(i, 1); continue; } }
      }
      if (p.spent) { if (p.life <= 0) projectiles.splice(i, 1); continue; }
      if(p.owner==='enemy') {
        if(overlap(projectileBox(p,oldX),hurtbox(hero))&&hitHero(p.damage||BALANCE.skill1.damage,p.knockback ?? BALANCE.skill1.knockback,p.color || '#94ffde',oldX,p.y,false,false))p.boomerang?(p.spent=true,p.returning=true):p.orbit?(p.spent=true):p.life=0;
        if(p.life<=0||p.x<-100||p.x>W+100)projectiles.splice(i,1);continue;
      }
      // Swept x interval keeps a high-speed bolt from tunneling through a target.
      if (overlap(projectileBox(p,oldX),hurtbox(dummy)) && dummy.state !== 'down' && dummy.state !== 'recover') { if (hitDummy(p.damage||BALANCE.skill1.damage, p.knockback ?? BALANCE.skill1.knockback, p.color || '#94ffde', oldX, p.y, false, false)) { if (p.boomerang) { p.spent = true; p.returning = true; } else if (p.orbit) p.spent = true; else p.life = 0; } }
      if (p.life <= 0 || p.x < -100 || p.x > W + 100) projectiles.splice(i, 1);
    }
  }
function fenrStrike(actor,move) {
    const enemy=actor===dummy,target=enemy?hero:dummy,actorMetrics=actor.form==='wolf'?kitEnv.FENR_WOLF_METRICS:kitEnv.FENR_HUMAN_METRICS,origin=actorMetrics?.emitters?.[move.name],fy=actor.y+(origin?.y??-(actor.form==='wolf'?120:105));
    effects.push({type:'fenr-fx',asset:move.fx,x:move.area?actor.x:actor.x+actor.facing*65,y:fy,facing:actor.facing,life:.32,maxLife:.32,size:move.area?move.reach*2:130});
    if(move.projectile){projectiles.push({x:actor.x+actor.facing*(origin?.x??62),y:fy,vx:actor.facing*720,life:1.15,facing:actor.facing,owner:enemy?'enemy':'player',damage:move.damage,asset:'gale'});sound('cast');return;}
    const dx=(target.x-actor.x)*actor.facing,near=move.area?Math.abs(dx)<move.reach:dx>-22&&dx<move.reach+27;
    if(!meleeContact(actor,target,move)){sound('whiff',actor);return;}
    const connected=enemy?hitHero(move.damage,move.knockback,'#ffe6ba',actor.x,fy,false,move.type==='attack'):hitDummy(move.damage,move.knockback,'#ffe6ba',actor.x,fy,false,move.type==='attack');
    if(connected && move.type==='attack') {F.refund(actor);if(!enemy)for(const n of Object.keys(rechargePulse))rechargePulse[n]=.22;}

  }
function miraStrike(actor,move) {
    const enemy=actor===dummy,target=enemy?hero:dummy,em=kitEnv.MIRA_METRICS?.emitters?.[move.name];
    const ox=actor.x+actor.facing*(em?.x??100),oy=actor.y+(em?.y??-125);
    if(move.projectile){
      projectiles.push({x:ox,y:oy,vx:actor.facing*move.speed,life:1.3,facing:actor.facing,owner:enemy?'enemy':'player',damage:move.damage,asset:'mira-star',color:'#ffe27a'});
      effects.push({type:'muzzle',x:ox,y:oy,life:.2,maxLife:.2,color:'#fff1a8'});spawnParticles(ox,oy,'#ffe27a',10,140);sound('cast');return;
    }
    if(move.type==='attack')effects.push({type:'slash',x:actor.x+actor.facing*62,y:oy+5,life:.22,maxLife:.22,facing:actor.facing,index:move.index,color:move.index===3?'#ffe27a':'#f0d2ff'});
    else effects.push({type:'mira-fx',asset:'mira-crash',x:ox,y:oy,facing:actor.facing,life:.3,maxLife:.3,size:150});
    const dx=(target.x-actor.x)*actor.facing;
    if(!meleeContact(actor,target,move)){sound('whiff',actor);return;}
    const connected=enemy?hitHero(move.damage,move.knockback,'#ffd6f5',actor.x,oy,false,move.type==='attack'):hitDummy(move.damage,move.knockback,'#ffd6f5',actor.x,oy,false,move.type==='attack');
    if(connected&&move.type==='attack') {
      if(enemy)M.refund(dummy);
      else for(const name of Object.keys(cooldownMax)){if(hero.cooldowns[name]>0)rechargePulse[name]=.22;hero.cooldowns[name]=Math.max(0,hero.cooldowns[name]-cooldownMax[name]*BALANCE.basicCooldownRefund);}
    }

  }
function coraStrike(actor,move) {
    const enemy=actor===dummy,target=enemy?hero:dummy,em=kitEnv.CORA_METRICS?.emitters?.[move.name];
    const ox=actor.x+actor.facing*(em?.x??95),oy=actor.y+(em?.y??-140),hy=clamp(oy,actor.y-165,actor.y-60);
    if(move.projectile){
      // The straight feather flies a little faster, so the fan lands as a quick three-hit burst instead of one stacked hit.
      move.feathers.forEach((damage,i)=>{const angle=(i-1)*move.spread,speed=move.speed*(1-Math.abs(i-1)*.06);projectiles.push({x:ox,y:oy,vx:actor.facing*speed*Math.cos(angle),vy:speed*Math.sin(angle),life:1,facing:actor.facing,owner:enemy?'enemy':'player',damage,knockback:move.knockback,asset:'cora-feather',size:74,color:'#c9a2ff'});});
      effects.push({type:'muzzle',x:ox,y:oy,life:.18,maxLife:.18,color:'#e0c8ff'});spawnParticles(ox,oy,'#b58cff',10,140);sound('cast');return;
    }
    if(move.type==='attack')effects.push({type:'slash',x:actor.x+actor.facing*55,y:hy+5,life:.22,maxLife:.22,facing:actor.facing,index:move.index,color:move.index===3?'#ffc86b':'#dcc6ff'});
    else {effects.push({type:'cora-fx',asset:'cora-gust',x:actor.x+actor.facing*140,y:actor.y-100,facing:actor.facing,life:.34,maxLife:.34,size:170});spawnParticles(actor.x+actor.facing*120,actor.y-100,'#3a2d58',12,220);}
    const dx=(target.x-actor.x)*actor.facing,near=move.area?dx>-30&&dx<move.reach:dx>-22&&dx<move.reach+27;
    if(!meleeContact(actor,target,move)){sound('whiff',actor);return;}
    const connected=enemy?hitHero(move.damage,move.knockback,move.area?'#e8d8ff':'#e2ccff',actor.x,hy,false,move.type==='attack'):hitDummy(move.damage,move.knockback,move.area?'#e8d8ff':'#e2ccff',actor.x,hy,false,move.type==='attack');
    if(connected&&move.type==='attack') {
      if(enemy)C.refund(dummy);
      else for(const name of Object.keys(cooldownMax)){if(hero.cooldowns[name]>0)rechargePulse[name]=.22;hero.cooldowns[name]=Math.max(0,hero.cooldowns[name]-cooldownMax[name]*BALANCE.basicCooldownRefund);}
    }

  }
function najaStrike(actor,move) {
    const enemy=actor===dummy,target=enemy?hero:dummy,em=kitEnv.NAJA_METRICS?.emitters?.[move.name];
    const hy=clamp(actor.y+(em?.y??-100),actor.y-150,actor.y-50);
    if(move.projectile){
      // Sand Fang runs along the floor from her palm slam: any small jump clears it.
      const x=actor.x+actor.facing*(em?.x??90);
      projectiles.push({x,y:actor.y-24,vx:actor.facing*move.speed,life:1.1,facing:actor.facing,owner:enemy?'enemy':'player',damage:move.damage,knockback:move.knockback,asset:'naja-sandwave',size:130,color:'#f2c86b'});
      dust(x,10);spawnParticles(x,actor.y-14,'#e8c27a',10,160);sound('cast');return;
    }
    // The urumi cracks out to its measured tip; the cyclone spins all the way around her.
    if(move.type==='attack')effects.push({type:'whip',x:actor.x,y:hy,facing:actor.facing,tip:em?.x??move.reach+25,life:.2,maxLife:.2,index:move.index,color:move.index===3?'#ffe7a8':'#f2d9a0'});
    else {effects.push({type:'naja-fx',asset:'naja-cyclone',x:actor.x,y:actor.y-72,facing:actor.facing,life:.36,maxLife:.36,size:270});spawnParticles(actor.x,actor.y-40,'#e3bf78',16,260,'dust');}
    const dx=(target.x-actor.x)*actor.facing,near=move.around?Math.abs(dx)<move.reach:dx>-22&&dx<move.reach+27;
    if(!meleeContact(actor,target,move)){sound('whiff',actor);return;}
    const connected=enemy?hitHero(move.damage,move.knockback,move.around?'#ffe7b0':'#f7dca0',actor.x,hy,false,move.type==='attack'):hitDummy(move.damage,move.knockback,move.around?'#ffe7b0':'#f7dca0',actor.x,hy,false,move.type==='attack');
    if(connected&&move.type==='attack') {
      if(enemy)N.refund(dummy);
      else for(const name of Object.keys(cooldownMax)){if(hero.cooldowns[name]>0)rechargePulse[name]=.22;hero.cooldowns[name]=Math.max(0,hero.cooldowns[name]-cooldownMax[name]*BALANCE.basicCooldownRefund);}
    }

  }
function haldorStrike(actor,move) {
    const enemy=actor===dummy,target=enemy?hero:dummy,em=kitEnv.HALDOR_METRICS?.emitters?.[move.name];
    const hy=clamp(actor.y+(em?.y??-90),actor.y-150,actor.y-40);
    if(move.projectile){
      // Slag Shot: lobbed at where the rival stands now (180-560 px ahead), landing after a fixed flight time.
      const L=HD.slag,x0=actor.x+actor.facing*(em?.x??70),y0=clamp(actor.y+(em?.y??-120),actor.y-170,actor.y-60);
      const ahead=(target.x-actor.x)*actor.facing,land=actor.x+actor.facing*clamp(ahead,L.minRange,L.maxRange);
      const g=2*(CONFIG.groundY-8-y0+L.rise*L.flight)/(L.flight*L.flight);
      projectiles.push({x:x0,y:y0,vx:(land-x0)/L.flight,vy:-L.rise,gravity:g,life:L.flight+.4,facing:actor.facing,owner:enemy?'enemy':'player',damage:move.damage,knockback:move.knockback,asset:'haldor-slag',size:64,color:'#ffae52',landX:land,landAt:time+L.flight,splash:L.splash});
      effects.push({type:'muzzle',x:x0,y:y0,life:.2,maxLife:.2,color:'#ffb35c'});spawnParticles(x0,y0,'#ff9a3c',10,150);sound('cast');return;
    }
    if(move.type==='attack'){
      effects.push({type:'slash',x:actor.x+actor.facing*55,y:hy+5,life:.24,maxLife:.24,facing:actor.facing,index:move.index,color:move.index===3?'#ffd28a':'#ffb05e'});
      // The overhead anvil smash lands on the floor: dust and a small shake even on a miss.
      if(move.index===3){dust(actor.x+actor.facing*(em?.x??110),14);trauma=Math.min(1,trauma+.18);}
    }
    else {effects.push({type:'haldor-fx',asset:'haldor-steam',x:actor.x-actor.facing*70,y:actor.y-80,facing:actor.facing,life:.4,maxLife:.4,size:190});spawnParticles(actor.x+actor.facing*70,actor.y-90,'#f3ecdf',12,220,'dust');}
    const dx=(target.x-actor.x)*actor.facing;
    if(!meleeContact(actor,target,move)){sound('whiff',actor);return;}
    const connected=enemy?hitHero(move.damage,move.knockback,move.type==='skill2'?'#fff1dc':'#ffc27a',actor.x,hy,false,move.type==='attack'):hitDummy(move.damage,move.knockback,move.type==='skill2'?'#fff1dc':'#ffc27a',actor.x,hy,false,move.type==='attack');
    if(connected&&move.type==='attack') {
      if(enemy)HD.refund(dummy);
      else for(const name of Object.keys(cooldownMax)){if(hero.cooldowns[name]>0)rechargePulse[name]=.22;hero.cooldowns[name]=Math.max(0,hero.cooldowns[name]-cooldownMax[name]*BALANCE.basicCooldownRefund);}
    }

  }
function zanniStrike(actor,move) {
    const enemy=actor===dummy,target=enemy?hero:dummy,em=kitEnv.ZANNI_METRICS?.emitters?.[move.name];
    const hy=clamp(actor.y+(em?.y??-100),actor.y-180,actor.y-50);
    if(move.projectile){
      // Ring Toss: a bladed ring at hand height flies out ZANNI.ring.range px and comes back to his hand.
      const x=actor.x+actor.facing*(em?.x??90),y=clamp(actor.y+(em?.y??-95),actor.y-130,actor.y-70);
      projectiles.push({x,y,vx:actor.facing*move.speed,life:2.2,facing:actor.facing,owner:enemy?'enemy':'player',damage:move.damage,knockback:move.knockback,asset:'zanni-ring',size:70,color:'#e4f36a',boomerang:true,range:Z.ring.range,travel:0,spin:18});
      effects.push({type:'muzzle',x,y,life:.2,maxLife:.2,color:'#e4f36a'});spawnParticles(x,y,'#e8d27a',10,150);sound('cast');return;
    }
    // The scissor lattice telescopes to its measured tip; Spring Snatch reaches 200 px and reels the rival in.
    if(move.type==='attack')effects.push({type:'whip',x:actor.x,y:hy,facing:actor.facing,tip:em?.x??move.reach+20,life:.18,maxLife:.18,index:move.index,color:move.index===3?'#f4f7a0':'#e4f36a'});
    else effects.push({type:'whip',x:actor.x,y:hy,facing:actor.facing,tip:em?.x??move.reach,life:.26,maxLife:.26,index:3,color:'#f2d46a'});
    const dx=(target.x-actor.x)*actor.facing;
    if(!meleeContact(actor,target,move)){sound('whiff',actor);return;}
    const connected=enemy?hitHero(move.damage,move.knockback,move.type==='skill2'?'#f6f3c8':'#e9f27a',actor.x,hy,false,move.type==='attack'):hitDummy(move.damage,move.knockback,move.type==='skill2'?'#f6f3c8':'#e9f27a',actor.x,hy,false,move.type==='attack');
    if(connected&&move.pull){
      // Reel the rival in to `pull` px in front of ZANNI (never pushes a closer rival away).
      if(dx>move.pull){target.x=clamp(actor.x+actor.facing*move.pull,70,W-70);target.vx=0;}
      effects.push({type:'zanni-fx',asset:'zanni-snatch',x:target.x,y:target.y-90,facing:actor.facing,life:.32,maxLife:.32,size:150});
    }
    if(connected&&move.type==='attack') {
      if(enemy)Z.refund(dummy);
      else for(const name of Object.keys(cooldownMax)){if(hero.cooldowns[name]>0)rechargePulse[name]=.22;hero.cooldowns[name]=Math.max(0,hero.cooldowns[name]-cooldownMax[name]*BALANCE.basicCooldownRefund);}
    }

  }
function isoldeStrike(actor,move) {
    const enemy=actor===dummy,target=enemy?hero:dummy,em=kitEnv.ISOLDE_METRICS?.emitters?.[move.name];
    const hy=clamp(actor.y+(em?.y??-95),actor.y-190,actor.y-40);
    if(move.projectile){
      // Sky Piercer: an ice bolt from the lance point on a rising line (IS.piercer.rise): anti-air, close ground poke.
      const P=IS.piercer,x=actor.x+actor.facing*Math.round((em?.x??140)*.8),y=actor.y-P.y;
      projectiles.push({x,y,vx:actor.facing*P.speed,vy:-P.speed*P.rise,life:1.1,facing:actor.facing,owner:enemy?'enemy':'player',damage:move.damage,knockback:move.knockback,asset:'isolde-piercer',size:96,color:'#bfe6ff'});
      effects.push({type:'muzzle',x,y,life:.2,maxLife:.2,color:'#dff3ff'});spawnParticles(x,y,'#dff3ff',10,160);sound('cast');return;
    }
    if(move.type==='attack')effects.push({type:'whip',x:actor.x,y:hy,facing:actor.facing,tip:em?.x??move.reach+25,life:.18,maxLife:.18,index:move.index,color:move.index===3?'#eaf7ff':'#bfe6ff'});
    else effects.push({type:'isolde-fx',asset:'isolde-frost',x:actor.x-actor.facing*60,y:actor.y-70,facing:actor.facing,life:.4,maxLife:.4,size:190});
    const dx=(target.x-actor.x)*actor.facing;
    if(!meleeContact(actor,target,move)){sound('whiff',actor);return;}
    const connected=enemy?hitHero(move.damage,move.knockback,move.type==='skill2'?'#eaf7ff':'#bfe6ff',actor.x,hy,false,move.type==='attack'):hitDummy(move.damage,move.knockback,move.type==='skill2'?'#eaf7ff':'#bfe6ff',actor.x,hy,false,move.type==='attack');
    if(connected&&move.type==='attack') {
      if(enemy)IS.refund(dummy);
      else for(const name of Object.keys(cooldownMax)){if(hero.cooldowns[name]>0)rechargePulse[name]=.22;hero.cooldowns[name]=Math.max(0,hero.cooldowns[name]-cooldownMax[name]*BALANCE.basicCooldownRefund);}
    }

  }
function rheaStrike(actor,move) {
    const enemy=actor===dummy,target=enemy?hero:dummy,em=kitEnv.RHEA_METRICS?.emitters?.[move.name];
    const hy=clamp(actor.y+(em?.y??-95),actor.y-180,actor.y-40);
    if(move.projectile){
      // Planet Drift: a slow little planet at chest height that crosses the arena.
      const x=actor.x+actor.facing*(em?.x??80),y=actor.y-95;
      projectiles.push({x,y,vx:actor.facing*move.speed,life:RH.drift.life,facing:actor.facing,owner:enemy?'enemy':'player',damage:move.damage,knockback:move.knockback,asset:'rhea-drift',size:78,color:'#f2c77a',spin:3});
      effects.push({type:'muzzle',x,y,life:.2,maxLife:.2,color:'#f2c77a'});spawnParticles(x,y,'#f2c77a',10,150);sound('cast');return;
    }
    if(move.well){
      // Gravity Well: a vortex opens RH.well.at px ahead and collapses after RH.well.fuse s.
      const W0=RH.well,x=clamp(actor.x+actor.facing*W0.at,40,W-40);
      projectiles.push({x,y:CONFIG.groundY-80,vx:0,life:W0.fuse,facing:actor.facing,owner:enemy?'enemy':'player',damage:move.damage,knockback:move.knockback,asset:'rhea-well',size:170,color:'#e8b0c0',inert:true,radius:W0.radius,spin:-6});
      sound('cast');return;
    }
    effects.push({type:'whip',x:actor.x,y:hy,facing:actor.facing,tip:em?.x??move.reach+20,life:.18,maxLife:.18,index:move.index,color:move.index===3?'#f7e3b0':'#f2c77a'});
    const dx=(target.x-actor.x)*actor.facing;
    if(!meleeContact(actor,target,move)){sound('whiff',actor);return;}
    const connected=enemy?hitHero(move.damage,move.knockback,'#f2c77a',actor.x,hy,false,true):hitDummy(move.damage,move.knockback,'#f2c77a',actor.x,hy,false,true);
    if(connected) {
      if(enemy)RH.refund(dummy);
      else for(const name of Object.keys(cooldownMax)){if(hero.cooldowns[name]>0)rechargePulse[name]=.22;hero.cooldowns[name]=Math.max(0,hero.cooldowns[name]-cooldownMax[name]*BALANCE.basicCooldownRefund);}
    }

  }
function solanStrike(actor,move) {
    const enemy=actor===dummy,target=enemy?hero:dummy,em=kitEnv.SOLAN_METRICS?.emitters?.[move.name];
    const hy=clamp(actor.y+(em?.y??-95),actor.y-190,actor.y-40);
    if(move.projectile){
      // Solar Crescent: a golden crescent wave from the blade edge at chest height, SO.crescent.range px long.
      const x=actor.x+actor.facing*Math.round((em?.x??110)*.7),y=actor.y-95;
      projectiles.push({x,y,vx:actor.facing*move.speed,life:move.range/move.speed,facing:actor.facing,owner:enemy?'enemy':'player',damage:move.damage,knockback:move.knockback,asset:'solan-crescent',size:150,color:'#ffd36a'});
      spawnParticles(x,y,'#ffd36a',10,160);sound('cast');return;
    }
    let hitX=null;
    if(move.leap){
      // Leonine Leap lands: the blade hits the floor SO.leap.ahead px in front; everything within the radius is hit.
      hitX=actor.x+actor.facing*SO.leap.ahead;
      effects.push({type:'solan-fx',asset:'solan-impact',x:hitX,y:CONFIG.groundY-40,facing:actor.facing,life:.4,maxLife:.4,size:220});
      dust(hitX,18);spawnParticles(hitX,CONFIG.groundY-10,'#e8c07a',18,300,'dust');trauma=Math.min(1,trauma+.3);
    } else effects.push({type:'slash',x:actor.x+actor.facing*55,y:hy+5,life:.24,maxLife:.24,facing:actor.facing,index:move.index,color:move.index===3?'#ffe7a0':'#ffd36a'});
    if(move.type==='attack'&&move.index===3){dust(actor.x+actor.facing*(em?.x??110),12);trauma=Math.min(1,trauma+.15);}
    const dx=(target.x-actor.x)*actor.facing;
    const inside=hitX!==null?Math.abs(target.x-hitX)<SO.leap.radius&&target.y>CONFIG.groundY-130:meleeContact(actor,target,move);
    if(!inside){sound('whiff',actor);return;}
    const connected=enemy?hitHero(move.damage,move.knockback,move.leap?'#fff1c8':'#ffd36a',hitX??actor.x,hy,false,true):hitDummy(move.damage,move.knockback,move.leap?'#fff1c8':'#ffd36a',hitX??actor.x,hy,false,true);
    if(connected&&move.type==='attack') {
      if(enemy)SO.refund(dummy);
      else for(const name of Object.keys(cooldownMax)){if(hero.cooldowns[name]>0)rechargePulse[name]=.22;hero.cooldowns[name]=Math.max(0,hero.cooldowns[name]-cooldownMax[name]*BALANCE.basicCooldownRefund);}
    }

  }
function nibStrike(actor,move) {
    const enemy=actor===dummy,target=enemy?hero:dummy,em=kitEnv.NIB_METRICS?.emitters?.[move.name];
    const hy=clamp(actor.y+(em?.y??-80),actor.y-170,actor.y-40);
    if(move.projectile){
      // Express Letter: a sealed letter thrown flat at chest height; the fastest projectile, NB.letter.range px long.
      const x=actor.x+actor.facing*Math.round((em?.x??80)*.8),y=actor.y-90;
      projectiles.push({x,y,vx:actor.facing*move.speed,life:move.range/move.speed,facing:actor.facing,owner:enemy?'enemy':'player',damage:move.damage,knockback:move.knockback,asset:'nib-letter',size:70,color:'#f4efe2'});
      spawnParticles(x,y,'#f4efe2',8,150);sound('cast');return;
    }
    effects.push({type:'whip',x:actor.x,y:hy,facing:actor.facing,tip:em?.x??move.reach+15,life:.14,maxLife:.14,index:move.index||3,color:move.slip?'#bfe8ff':'#8fd4ff'});
    const dx=(target.x-actor.x)*actor.facing;
    if(!meleeContact(actor,target,move)){sound('whiff',actor);return;}
    const connected=enemy?hitHero(move.damage,move.knockback,move.slip?'#bfe8ff':'#8fd4ff',actor.x,hy,false,true):hitDummy(move.damage,move.knockback,move.slip?'#bfe8ff':'#8fd4ff',actor.x,hy,false,true);
    if(connected&&move.slip){
      // Rooftop Slip: slip past the rival and turn around to face them (the dash stops there).
      effects.push({type:'nib-fx',asset:'nib-slip',x:target.x,y:target.y-80,facing:actor.facing,life:.3,maxLife:.3,size:150});
      actor.x=clamp(target.x+actor.facing*NB.slip.behind,70,W-70);actor.facing*=-1;actor.vx=0;if(actor.action)actor.action.dash=0;
    }
    if(connected&&move.type==='attack') {
      if(enemy)NB.refund(dummy);
      else for(const name of Object.keys(cooldownMax)){if(hero.cooldowns[name]>0)rechargePulse[name]=.22;hero.cooldowns[name]=Math.max(0,hero.cooldowns[name]-cooldownMax[name]*BALANCE.basicCooldownRefund);}
    }

  }
function eddaStrike(actor,move) {
    if(move.guard)return;
    const enemy=actor===dummy,target=enemy?hero:dummy,em=kitEnv.EDDA_METRICS?.emitters?.[move.name];
    const hy=clamp(actor.y+(em?.y??-80),actor.y-170,actor.y-30);
    if(move.projectile){
      // Stone Skip: a flat jade stone flicked low; it skips along the floor (ED.stone) and hits once.
      const x=actor.x+actor.facing*Math.round((em?.x??70)*.8),y=clamp(actor.y+(em?.y??-60),actor.y-60,actor.y-40);
      projectiles.push({x,y,vx:actor.facing*move.speed,vy:-ED.stone.rise,skip:true,skipG:ED.stone.gravity,bounces:ED.stone.bounces,hop:ED.stone.hop,life:3,facing:actor.facing,owner:enemy?'enemy':'player',damage:move.damage,knockback:move.knockback,asset:'edda-stone',size:54,color:'#9fe0b8',spin:14});
      spawnParticles(x,y,'#9fe0b8',8,150);sound('cast');return;
    }
    effects.push({type:'whip',x:actor.x,y:hy,facing:actor.facing,tip:em?.x??move.reach+15,life:.14,maxLife:.14,index:move.index||3,color:'#9fe0b8'});
    if(move.index===3)effects.push({type:'edda-fx',asset:'edda-ripple',x:actor.x+actor.facing*(em?.x??100),y:CONFIG.groundY-14,facing:actor.facing,life:.3,maxLife:.3,size:130});
    const dx=(target.x-actor.x)*actor.facing;
    if(!meleeContact(actor,target,move)){sound('whiff',actor);return;}
    const connected=enemy?hitHero(move.damage,move.knockback,'#9fe0b8',actor.x,hy,false,true):hitDummy(move.damage,move.knockback,'#9fe0b8',actor.x,hy,false,true);
    if(connected&&move.type==='attack') {
      if(enemy)ED.refund(dummy);
      else for(const name of Object.keys(cooldownMax)){if(hero.cooldowns[name]>0)rechargePulse[name]=.22;hero.cooldowns[name]=Math.max(0,hero.cooldowns[name]-cooldownMax[name]*BALANCE.basicCooldownRefund);}
    }

  }
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
