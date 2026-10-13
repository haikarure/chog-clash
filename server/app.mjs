import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {Server,matchMaker} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {randomBytes,createHash} from 'node:crypto';
import {Store} from './store.mjs';
import {Chain} from './chain.mjs';
import {PaidDuels} from './paid-duels.mjs';
import {createChallenge,verifyChallenge} from './auth.mjs';
import {makeDuelRoom,issuePermit} from './room.mjs';
import {ROSTER,RULESET} from '../online/core.mjs';
import {BUILD_HASH} from '../online/build.mjs';
const root=path.resolve(import.meta.dirname,'..');
const readCookie=req=>String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('chog_session='))?.slice(13);
export async function startServer(options={}) {
 const port=options.port??Number(process.env.PORT||5174),host=options.host||process.env.HOST||'127.0.0.1';
 const store=options.store||new Store(options.dbPath||process.env.DATABASE_PATH||path.join(import.meta.dirname,'data/house-cup.sqlite'));
 const chain=options.chain||new Chain(store,options.env||process.env);await chain.initialize();
 const app=express(),permits=new Map(),roomInvites=new Map(),buckets=new Map();
 const env=options.env||process.env;
 let origin=options.origin||process.env.PUBLIC_ORIGIN||`http://localhost:${port}`,closing=false;
 const additionalOrigins=new Set(String(env.ADDITIONAL_ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean));
 const allowedOrigin=value=>!value||value===origin||value===origin.replace('localhost','127.0.0.1')||additionalOrigins.has(value);
 const context={store,permits,onError(){console.error('CHOG authority operation failed; result requires verification.');}};
 const transport=new WebSocketTransport({maxPayload:4096,pingInterval:3000,pingMaxRetries:2,beforeUpgrade:(request)=>{if(!allowedOrigin(request.headers.get('origin')))return new Response('Origin not allowed',{status:403});}});
 const gameServer=new Server({greet:false,transport,publicAddress:env.PUBLIC_WS_ADDRESS||undefined,express:target=>{
  target.disable('x-powered-by');
  target.use((req,res,next)=>{
   res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
   if(req.path.startsWith('/api')){
    res.setHeader('Cache-Control','no-store');
    if(!allowedOrigin(req.headers.origin))return res.status(403).json({error:'Origin not allowed'});
    if(req.method!=='GET'&&!req.headers.origin&&!req.headers.authorization)return res.status(403).json({error:'Same-origin or bearer request required'});
    const key=(req.headers.authorization||req.socket.remoteAddress||'guest')+req.path.split('/').slice(0,3).join('/');
    const now=Date.now(),b=buckets.get(key)||{at:now,n:0};if(now-b.at>60000){b.at=now;b.n=0;}b.n++;buckets.set(key,b);if(b.n>300)return res.status(429).json({error:'Too many requests; wait a moment'});
   }next();
  });
  target.use(express.json({limit:'12kb'}));target.use(app);
 }});
 gameServer.define('duel',makeDuelRoom(context));
 const session=req=>store.session(req.headers.authorization?.replace(/^Bearer /,'')||readCookie(req));
 const authenticated=(req)=>{const s=session(req);if(!s)throw Error('Session expired; reload the game');return s;};
 const route=(method,url,fn)=>app[method](url,async(req,res)=>{try{const data=await fn(req,res);if(!res.headersSent)res.json(data??{ok:true});}catch(error){const message=String(error.shortMessage||error.message||'Request could not be verified');if(!res.headersSent)res.status(400).json({error:message.startsWith('UNIQUE constraint')?'That participant or wallet already has a Cup seat':message.startsWith('SQLITE')?'Could not save this action; try again':message.slice(0,180)});}});
 async function createRoom(config){const permit=issuePermit(context,config);const listing=await matchMaker.createRoom('duel',{permit});store.attachRoom(config.matchId,listing.roomId);if(config.invite)roomInvites.set(listing.roomId,{key:config.invite,host:config.sessions[0]});return listing.roomId;}
 const duels=new PaidDuels({chain,store,createRoom,env});await duels.initialize();chain.duelService=duels;
 let pairing=null;
 const queueReport=sessionId=>{store.queueExpire();const q=store.queueStatus(sessionId);return q?{state:q.state,kind:q.kind,roomId:q.room_id,duelId:q.duel_id,expiresAt:q.expires}:{state:'Idle'};};
 async function pairQueue(){
  if(pairing)return pairing;
  pairing=(async()=>{let pair;while((pair=store.queuePair('casual'))){
   const sessions=pair.map(p=>p.session_id),id=store.newMatch(null,'quick',sessions);
   try{const roomId=await createRoom({matchId:id,sessions,characters:pair.map(p=>p.chog),nicknames:pair.map(p=>p.nickname),restricted:true,matchKind:'quick',stage:'house-cup'});store.queueMatched(pair,{matchId:id,roomId});}
   catch(error){for(const p of pair)store.queueClear(p.session_id);store.recordResult(id,{outcome:'Void',winnerSession:null,reason:'room_creation_failed'},[]);throw error;}
  }
  if(duels.enabled)while((pair=store.queuePair('paid'))){
   try{const a=store.db.prepare('SELECT * FROM sessions WHERE id=?').get(pair[0].session_id);const d=duels.create(a,{chog:pair[0].chog,nickname:pair[0].nickname},pair[1]);store.queueMatched(pair,{duelId:d.id});}
   catch(error){for(const p of pair)store.queueClear(p.session_id);throw error;}
  }
  })();try{await pairing;}finally{pairing=null;}
 }
 async function createCupMatch(cup,stage,players){let row=store.matches(cup.id).find(m=>m.stage===stage);if(row?.room_id)return row.room_id;
  const id=row?.id||store.newMatch(cup.id,stage,players),p=new Map(store.participants(cup.id).map(p=>[p.session_id,p]));
  return createRoom({matchId:id,cupId:cup.id,cupLockedAt:cup.locked,sessions:players,characters:players.map(id=>p.get(id).chog),nicknames:players.map(id=>p.get(id).nickname),stage:'house-cup'});
 }
 const advancing=new Map();
 async function advanceCup(id){if(advancing.has(id))return advancing.get(id);const task=advanceCupOnce(id);advancing.set(id,task);try{await task;}finally{advancing.delete(id);}}
 async function advanceCupOnce(id){const cup=store.cup(id);if(!cup||cup.state!=='Active')return;
  const matches=store.matches(id);if(matches.some(m=>m.outcome==='Void')){if(cup.mode==='practice')store.cancelPractice(id,'void_match');return;}
  const participants=store.participants(id);if(matches.length<2){await createCupMatch(cup,'SF1',[participants[0].session_id,participants[1].session_id]);await createCupMatch(cup,'SF2',[participants[2].session_id,participants[3].session_id]);return;}
  const semis=matches.filter(m=>m.stage==='SF1'||m.stage==='SF2');
  if(semis.length!==2||semis.some(m=>!m.winner))return;
  if(cup.mode!=='practice'){const confirmed=store.db.prepare('SELECT match_id FROM outbox WHERE cup_id=? AND kind=? AND state=?').all(id,'result','confirmed');if(semis.some(m=>!confirmed.some(c=>c.match_id===m.id)))return;}
  const final=matches.find(m=>m.stage==='FINAL');if(!final){await createCupMatch(cup,'FINAL',[semis.find(m=>m.stage==='SF1').winner,semis.find(m=>m.stage==='SF2').winner]);}
  else if(final.result&&cup.mode==='practice')store.completePractice(id);
 }
 context.finished=(permit,result,replay,snapshot)=>{
  if(permit.duelId){const outbox=duels.enqueueResult(permit.duelId,permit.matchId,result);if(store.recordResult(permit.matchId,result,replay,outbox))store.updateDuel(permit.duelId,{state:'Settling'});return;}
  const cup=permit.cupId?store.cup(permit.cupId):null;
  const outbox=cup&&cup.mode!=='practice'?chain.enqueueResult(cup.id,permit.matchId,result):null;
  if(store.recordResult(permit.matchId,result,replay,outbox)&&cup)advanceCup(cup.id).catch(()=>context.onError());
 };
 chain.onAccepted=job=>job.kind.startsWith('duel-')?duels.advance(job.cup_id):advanceCup(job.cup_id);
 // A restarted process cannot claim it continued an in-memory fight.
 for(const row of store.recoverInterrupted()){
  const cup=row.cup_id?store.cup(row.cup_id):null,checkpoint=row.checkpoint?JSON.parse(row.checkpoint):{};
  const result={winner:null,winnerSession:null,outcome:'Void',reason:'server_restart',wins:[0,0],replayHash:'0x'+createHash('sha256').update(JSON.stringify(checkpoint)).digest('hex'),finishedAt:Math.floor(Date.now()/1000)};
  const paid=store.db.prepare('SELECT id FROM paid_duels WHERE match_id=?').get(row.id);
  store.recordResult(row.id,result,row.replay?JSON.parse(row.replay):[],paid?duels.enqueueResult(paid.id,row.id,result):cup&&cup.mode!=='practice'?chain.enqueueResult(cup.id,row.id,result):null);
  if(paid)store.updateDuel(paid.id,{state:'Settling'});
  if(cup?.mode==='practice')store.cancelPractice(cup.id,'server_restart');
 }
 // Queue leases/room assignments cannot survive an in-memory authority restart.
 store.db.prepare('DELETE FROM match_queue').run();
 route('get','/api/config',()=>({ruleset:RULESET,buildHash:BUILD_HASH,online:true,settlement:chain.info(),paidDuel:duels.info(),quickMatch:true,roster:Object.keys(ROSTER)}));
 route('get','/api/session',(req,res)=>{let token=readCookie(req),s=store.session(token);if(!s){const created=store.newSession();token=created.token;s=store.session(token);res.setHeader('Set-Cookie',`chog_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${origin.startsWith('https:')?'; Secure':''}`);}return {token,wallet:s.wallet,walletExpires:s.wallet_expires};});
 route('post','/api/queue',async req=>{const s=authenticated(req);if(req.body.kind==='paid')duels.requireEnabled();store.queueJoin(s,req.body);await pairQueue();return queueReport(s.id);});
 route('get','/api/queue',req=>queueReport(authenticated(req).id));
 route('post','/api/queue/cancel',req=>{const s=authenticated(req);store.queueCancel(s.id);return queueReport(s.id);});
 route('post','/api/queue/ack',req=>{const s=authenticated(req);if(store.queueStatus(s.id)?.state==='Matched')store.queueClear(s.id);return {ok:true};});
 route('post','/api/auth/challenge',req=>createChallenge(store,authenticated(req),req.body.address,origin,chain.chainId));
 route('post','/api/auth/verify',async req=>({wallet:await verifyChallenge(store,authenticated(req),req.body.message,req.body.signature,origin,chain.chainId)}));
 const requiredDuel=id=>{const d=store.duel(id);if(!d)throw Error('Duel not found');return d;};
 route('post','/api/duels',req=>duels.create(authenticated(req),req.body));
 route('get','/api/duels/:id',req=>duels.report(req.params.id,session(req)?.id));
 route('post','/api/duels/:id/join',req=>duels.join(req.params.id,req.body.invite,authenticated(req),req.body));
 route('get','/api/duels/:id/funding-status',req=>duels.fundingStatus(requiredDuel(req.params.id),authenticated(req)));
 route('post','/api/duels/:id/funding',req=>duels.funding(requiredDuel(req.params.id),authenticated(req)));
 route('post','/api/duels/:id/funding-progress',req=>duels.note(requiredDuel(req.params.id),authenticated(req),req.body.phase,req.body.hash));
 route('post','/api/duels/:id/confirm-funding',req=>duels.confirmFunding(requiredDuel(req.params.id),authenticated(req),req.body.hash));
 route('post','/api/duels/:id/cancel',req=>{const s=authenticated(req);duels.cancel(requiredDuel(req.params.id),s);return duels.report(req.params.id,s.id);});
 route('post','/api/duels/:id/retry-payout',async req=>{const d=requiredDuel(req.params.id),s=authenticated(req);duels.participant(d,s);chain.retry(d.id);await chain.poll();return duels.report(d.id,s.id);});
 route('post','/api/duels/:id/claim',req=>duels.claim(requiredDuel(req.params.id),authenticated(req)));
 route('post','/api/duels/:id/confirm-claim',req=>duels.confirmClaim(requiredDuel(req.params.id),authenticated(req),req.body.hash));
 route('post','/api/rooms',async req=>{const s=authenticated(req);const existing=store.db.prepare('SELECT count(*) n FROM matches WHERE cup_id IS NULL AND state IN (?,?) AND players LIKE ?').get('Scheduled','Playing','%'+s.id+'%');if(existing.n>=4)throw Error('Close an existing room before creating another');
  const invite=randomBytes(24).toString('hex'),chog=ROSTER[req.body.chog]?req.body.chog:'yot',stage=['rayj-house','cwo-alley','house-cup','neon-street','cwo-rally'].includes(req.body.stage)?req.body.stage:'house-cup';
  const id=store.newMatch(null,'casual',[s.id,null]);const roomId=await createRoom({matchId:id,sessions:[s.id,null],characters:[chog,'mamio'],invite,stage});return {roomId,invite};
 });
 route('get','/api/rooms/:id',req=>{const s=authenticated(req),data=roomInvites.get(req.params.id);if(!data||(!(data.host===s.id)&&req.query.invite!==data.key))throw Error('Invitation required');return {roomId:req.params.id,invite:data.key};});
 route('post','/api/cups',req=>{const s=authenticated(req),mode=req.body.mode||'practice';if(store.db.prepare('SELECT count(*) n FROM cups WHERE host=? AND state NOT IN (?,?)').get(s.id,'Complete','Cancelled').n>=4)throw Error('Finish or cancel an existing Cup before creating another');if(mode!=='practice'&&(!chain.enabled||mode!==chain.mode))throw Error('Funded prizes are unavailable; choose Practice Cup');return store.report(store.createCup(s,req.body.name,mode).id,s.id);});
 route('get','/api/cups/:id',req=>{const report=store.report(req.params.id,session(req)?.id);if(!report)throw Error('Cup not found');return report;});
 route('post','/api/cups/:id/check-in',req=>{const s=authenticated(req);const slot=store.joinCup(req.params.id,req.body.invite,s,req.body.nickname,req.body.chog);return {slot,report:store.report(req.params.id,s.id)};});
 route('post','/api/cups/:id/replace',req=>{const s=authenticated(req);store.uncheck(req.params.id,s,req.body.slot);return store.report(req.params.id,s.id);});
 route('post','/api/cups/:id/start',async req=>{const s=authenticated(req),cup=store.requireHost(req.params.id,s);if(cup.mode==='practice'){if(cup.state==='Draft')store.lockPractice(cup.id,s);await advanceCup(cup.id);}else await chain.lock(cup,store.participants(cup.id));return store.report(cup.id,s.id);});
 route('post','/api/cups/:id/funding',req=>chain.funding(store.requireHost(req.params.id,authenticated(req)),authenticated(req)));
 route('get','/api/cups/:id/funding-status',req=>{const s=authenticated(req);return chain.fundingStatus(store.requireHost(req.params.id,s),s);});
 route('post','/api/cups/:id/funding-progress',req=>{const s=authenticated(req);return chain.noteFunding(store.requireHost(req.params.id,s),s,req.body.phase,req.body.hash);});
 route('post','/api/cups/:id/confirm-funding',async req=>{const s=authenticated(req);await chain.confirmFunding(store.requireHost(req.params.id,s),s,req.body.hash);return store.report(req.params.id,s.id);});
 route('post','/api/cups/:id/retry-payout',async req=>{const s=authenticated(req),cup=store.cup(req.params.id);if(!cup||(!store.participants(cup.id).some(p=>p.session_id===s.id)&&cup.host!==s.id))throw Error('Cup participant required');chain.retry(cup.id);await chain.poll();return store.report(cup.id,s.id);});
 route('post','/api/cups/:id/cancel-funding',req=>{const s=authenticated(req);return chain.cancelFunding(store.requireHost(req.params.id,s),s);});
 route('post','/api/cups/:id/confirm-cancellation',async req=>{const s=authenticated(req);await chain.confirmCancellation(store.requireHost(req.params.id,s),req.body.hash);return store.report(req.params.id,s.id);});
 route('post','/api/cups/:id/claim',req=>{const s=authenticated(req),cup=store.cup(req.params.id);if(!cup)throw Error('Cup not found');return chain.claim(cup,s);});
 route('post','/api/cups/:id/confirm-claim',async req=>{const s=authenticated(req),cup=store.cup(req.params.id);if(!cup)throw Error('Cup not found');await chain.confirmClaim(cup,s,req.body.hash);return store.report(cup.id,s.id);});
 route('post','/api/cups/:id/refund-expired',req=>{const s=authenticated(req),cup=store.requireHost(req.params.id,s);if(!chain.enabled||cup.mode==='practice'||cup.state!=='Active'||Date.now()<(cup.locked||0)+4500000)throw Error('Refund is not available yet');store.enqueue({id:cup.id+':expiry',cupId:cup.id,kind:'refund-expired',payload:{}});return store.report(cup.id,s.id);});
 route('post','/api/cups/:id/cancel-practice',req=>{const s=authenticated(req),cup=store.requireHost(req.params.id,s);if(cup.mode!=='practice'||cup.state!=='Draft')throw Error('Only a draft Practice Cup can be cancelled');store.cancelPractice(cup.id,'host_cancelled');return store.report(cup.id,s.id);});
 app.use((req,res,next)=>{let pathname;try{pathname=decodeURIComponent(req.path);}catch{return res.status(400).end();}if(pathname.startsWith('/server/')||pathname.startsWith('/contracts/')||pathname.includes('..')||pathname.split('/').some(p=>p.startsWith('.')))return res.status(404).end();
  const allowed=pathname==='/'||/^\/(?:assets\/|online\/|tools\/|validation\/)/.test(pathname)||/^\/[a-zA-Z0-9_-]+\.(?:html|css|js|json|md)$/.test(pathname)||['/LICENSE','/THIRD_PARTY_NOTICES.md'].includes(pathname);
  if(!allowed)return res.status(404).end();next();});
 app.use(express.static(root,{dotfiles:'deny',setHeaders:(res,file)=>{if(/\.(?:m?js|html|css|json)$/.test(file))res.setHeader('Cache-Control','no-cache');}}));
 app.use((error,req,res,next)=>{if(!res.headersSent)res.status(error.status||400).json({error:'Request could not be read'});});
 await gameServer.listen(port,host);const actualPort=transport.server.address().port;if(port===0)origin=`http://localhost:${actualPort}`;
 const interval=setInterval(()=>{if(!closing){chain.poll().catch(()=>{});duels.poll().catch(()=>{});}},1000);interval.unref();
 const cleanup=setInterval(()=>{for(const [k,v] of buckets)if(Date.now()-v.at>120000)buckets.delete(k);for(const cup of store.db.prepare('SELECT id FROM cups WHERE state=?').all('Active'))advanceCup(cup.id).catch(()=>{});},5000);cleanup.unref();
 store.prune();const retention=setInterval(()=>store.prune(),3600000);retention.unref();
 return {port:actualPort,origin,store,chain,duels,gameServer,context,async close(){closing=true;clearInterval(interval);clearInterval(cleanup);clearInterval(retention);await gameServer.gracefullyShutdown(false);store.close();}};
}
