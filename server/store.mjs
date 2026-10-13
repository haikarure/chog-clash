import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {ROSTER} from '../online/core.mjs';
export const tokenHash=t=>createHash('sha256').update(String(t)).digest('hex');
const json=JSON.stringify;
const parse=s=>s?JSON.parse(s):null;
export class Store {
 constructor(file=':memory:') {
  if(file!==':memory:')fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(file);if(file!==':memory:')fs.chmodSync(file,0o600);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  this.db.exec(`CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,token_hash TEXT UNIQUE,expires INTEGER,wallet TEXT,wallet_expires INTEGER);
   CREATE TABLE IF NOT EXISTS nonces(nonce TEXT PRIMARY KEY,session_id TEXT,message TEXT,address TEXT,expires INTEGER,used INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS cups(id TEXT PRIMARY KEY,host TEXT,name TEXT,mode TEXT,state TEXT,created INTEGER,locked INTEGER,sponsor TEXT,chain_id TEXT,chain_cup_id TEXT,pool TEXT,contract TEXT,funding_tx TEXT,cancel_reason TEXT);
   CREATE TABLE IF NOT EXISTS participants(cup_id TEXT,slot INTEGER,invite_hash TEXT,invite_token TEXT,session_id TEXT,nickname TEXT,chog TEXT,wallet TEXT,checked INTEGER DEFAULT 0,accepted INTEGER DEFAULT 0,PRIMARY KEY(cup_id,slot),UNIQUE(cup_id,session_id),UNIQUE(cup_id,wallet));
   CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,cup_id TEXT,stage TEXT,room_id TEXT,state TEXT,players TEXT,winner TEXT,outcome TEXT,reason TEXT,result TEXT,replay TEXT,checkpoint TEXT,started INTEGER,finished INTEGER,UNIQUE(cup_id,stage));
   CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,cup_id TEXT,match_id TEXT,kind TEXT,payload TEXT,state TEXT DEFAULT 'pending',attempts INTEGER DEFAULT 0,tx_hash TEXT,tx_nonce INTEGER,error TEXT,updated INTEGER);
   CREATE TABLE IF NOT EXISTS chain_receipts(hash TEXT PRIMARY KEY,cup_id TEXT,kind TEXT,receipt TEXT);
   CREATE TABLE IF NOT EXISTS funding_progress(cup_id TEXT PRIMARY KEY,wallet TEXT,chain_id TEXT,contract TEXT,start_block TEXT,scan_block TEXT,approval_tx TEXT,deposit_tx TEXT,updated INTEGER);
   CREATE TABLE IF NOT EXISTS match_queue(session_id TEXT PRIMARY KEY,chog TEXT,nickname TEXT,kind TEXT DEFAULT 'casual',wallet TEXT,state TEXT DEFAULT 'Queued',match_id TEXT,room_id TEXT,duel_id TEXT,created INTEGER,expires INTEGER);
   CREATE TABLE IF NOT EXISTS paid_duels(id TEXT PRIMARY KEY,host TEXT,invite_hash TEXT,invite_token TEXT,players TEXT,characters TEXT,nicknames TEXT,wallets TEXT,state TEXT,created INTEGER,locked INTEGER,match_id TEXT,room_id TEXT,funded_mask INTEGER DEFAULT 0,start_block TEXT,cancel_reason TEXT);
   CREATE TABLE IF NOT EXISTS duel_funding(duel_id TEXT,wallet TEXT,start_block TEXT,scan_block TEXT,approval_tx TEXT,deposit_tx TEXT,updated INTEGER,PRIMARY KEY(duel_id,wallet));
   CREATE INDEX IF NOT EXISTS outbox_state ON outbox(state,updated);`);
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 queueJoin(session,{chog,nickname,kind='casual'}={}){
  if(!ROSTER[chog])throw Error('Choose one of the 12 CHOG');
  nickname=String(nickname||'CHOG player').trim();if(nickname.length<2||nickname.length>24)throw Error('Nickname must be 2–24 characters');
  if(!['casual','paid'].includes(kind))throw Error('Unknown queue');
  if(kind==='paid'&&(!session.wallet||session.wallet_expires<Date.now()))throw Error('Verify your testnet wallet before searching');
  this.queueExpire();const current=this.queueStatus(session.id);
  if(current)return current;
  if(this.db.prepare('SELECT count(*) n FROM matches WHERE state IN (?,?) AND players LIKE ?').get('Scheduled','Playing','%'+session.id+'%').n>=4)throw Error('Leave an existing room before searching');
  this.db.prepare('INSERT INTO match_queue(session_id,chog,nickname,kind,wallet,state,created,expires) VALUES(?,?,?,?,?,?,?,?)').run(session.id,chog,nickname,kind,kind==='paid'?session.wallet:null,'Queued',Date.now(),Date.now()+120000);
  return this.queueStatus(session.id);
 }
 queueStatus(sessionId){return this.db.prepare('SELECT * FROM match_queue WHERE session_id=?').get(sessionId)||null;}
 queueExpire(){this.db.prepare('DELETE FROM match_queue WHERE state=? AND expires<?').run('Queued',Date.now());}
 queuePair(kind='casual'){
  return this.transaction(()=>{
   this.queueExpire();const a=this.db.prepare('SELECT * FROM match_queue WHERE state=? AND kind=? ORDER BY created,session_id LIMIT 1').get('Queued',kind);if(!a)return null;
   const b=this.db.prepare('SELECT * FROM match_queue WHERE state=? AND kind=? AND session_id<>? AND (wallet IS NULL OR wallet<>?) ORDER BY created,session_id LIMIT 1').get('Queued',kind,a.session_id,a.wallet||'');if(!b)return null;
   this.db.prepare('UPDATE match_queue SET state=? WHERE session_id IN (?,?) AND state=?').run('Pairing',a.session_id,b.session_id,'Queued');
   return [a,b];
  });
 }
 queueMatched(pair,{matchId=null,roomId=null,duelId=null}){this.db.prepare('UPDATE match_queue SET state=?,match_id=?,room_id=?,duel_id=? WHERE session_id IN (?,?)').run('Matched',matchId,roomId,duelId,...pair.map(p=>p.session_id));}
 queueCancel(sessionId){const current=this.queueStatus(sessionId);if(current?.state==='Queued'){this.db.prepare('DELETE FROM match_queue WHERE session_id=? AND state=?').run(sessionId,'Queued');return null;}return current;}
 queueClear(sessionId){this.db.prepare('DELETE FROM match_queue WHERE session_id=?').run(sessionId);}
 duel(id){const row=this.db.prepare('SELECT * FROM paid_duels WHERE id=?').get(id);return row?{...row,players:parse(row.players),characters:parse(row.characters),nicknames:parse(row.nicknames),wallets:parse(row.wallets)}:null;}
 createDuel(session,{chog,nickname},peer=null){
  if(!session.wallet||session.wallet_expires<Date.now())throw Error('Verify your testnet wallet first');
  if(!ROSTER[chog])throw Error('Choose one of the 12 CHOG');nickname=String(nickname||'CHOG player').trim();if(nickname.length<2||nickname.length>24)throw Error('Nickname must be 2–24 characters');
  const active=this.db.prepare('SELECT count(*) n FROM paid_duels WHERE state NOT IN (?,?) AND players LIKE ?').get('Complete','Cancelled','%'+session.id+'%').n;
  if(active>=3)throw Error('Finish or cancel an existing paid duel');
  const id=randomUUID(),invite=randomBytes(24).toString('hex');
  this.db.prepare('INSERT INTO paid_duels(id,host,invite_hash,invite_token,players,characters,nicknames,wallets,state,created) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,session.id,tokenHash(invite),invite,json([session.id,peer?.session_id||null]),json([chog,peer?.chog||null]),json([nickname,peer?.nickname||null]),json([session.wallet,peer?.wallet||null]),peer?'Creating':'Draft',Date.now());
  return this.duel(id);
 }
 joinDuel(id,invite,session,{chog,nickname}){
  return this.transaction(()=>{const duel=this.duel(id);if(!duel)throw Error('Duel not found');if(duel.players.includes(session.id))return duel;
   if(duel.state!=='Draft'||duel.invite_hash!==tokenHash(invite||''))throw Error('Invitation is unavailable');
   if(!session.wallet||session.wallet_expires<Date.now())throw Error('Verify your testnet wallet first');
   if(duel.wallets[0].toLowerCase()===session.wallet.toLowerCase())throw Error('Two distinct player wallets are required');
   if(!ROSTER[chog])throw Error('Choose one of the 12 CHOG');nickname=String(nickname||'CHOG player').trim();if(nickname.length<2||nickname.length>24)throw Error('Nickname must be 2–24 characters');
   duel.players[1]=session.id;duel.characters[1]=chog;duel.nicknames[1]=nickname;duel.wallets[1]=session.wallet;
   this.updateDuel(id,{players:duel.players,characters:duel.characters,nicknames:duel.nicknames,wallets:duel.wallets,state:'Creating'});return this.duel(id);
  });
 }
 updateDuel(id,patch){const fields=Object.keys(patch).filter(k=>['players','characters','nicknames','wallets','state','locked','match_id','room_id','funded_mask','start_block','cancel_reason'].includes(k));if(!fields.length)return;this.db.prepare(`UPDATE paid_duels SET ${fields.map(k=>k+'=?').join(',')} WHERE id=?`).run(...fields.map(k=>['players','characters','nicknames','wallets'].includes(k)?json(patch[k]):patch[k]),id);}
 duelReport(id,sessionId=null){
  const d=this.duel(id);if(!d)return null;const match=d.match_id?this.db.prepare('SELECT result FROM matches WHERE id=?').get(d.match_id):null;
  const transactions=this.db.prepare('SELECT kind,state,tx_hash,error,payload FROM outbox WHERE cup_id=? ORDER BY updated').all(id).map(row=>({kind:row.kind,state:row.state,hash:row.tx_hash,error:row.error,recipient:parse(row.payload).recipient||null,amount:parse(row.payload).amount||null}));
  const raw=match?.result?parse(match.result):null,result=raw?{outcome:raw.outcome,reason:raw.reason,wins:raw.wins,replayHash:raw.replayHash,winnerSeat:raw.winnerSession?d.players.indexOf(raw.winnerSession):null}:null;
  return {id:d.id,host:d.host===sessionId,...(d.host===sessionId&&d.state==='Draft'?{invite:d.invite_token}:{}),seat:d.players.indexOf(sessionId),state:d.state,created:d.created,locked:d.locked,roomId:d.room_id,
   participants:d.players.map((s,i)=>({seat:i,isYou:!!s&&s===sessionId,wallet:d.wallets[i],chog:d.characters[i],nickname:d.nicknames[i],funded:!!(d.funded_mask&(1<<i))})),result,transactions,cancelReason:d.cancel_reason};
 }
 newSession(){const token=randomBytes(32).toString('hex'),id=randomUUID();this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(id,tokenHash(token),Date.now()+86400000,null,0);return {id,token};}
 session(token){if(typeof token!=='string'||token.length!==64)return null;return this.db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires>?').get(tokenHash(token),Date.now())||null;}
 putNonce(session,message,address,nonce){this.db.prepare('INSERT INTO nonces(nonce,session_id,message,address,expires) VALUES(?,?,?,?,?)').run(nonce,session.id,message,address.toLowerCase(),Date.now()+600000);}
 nonce(nonce,session){return this.db.prepare('SELECT * FROM nonces WHERE nonce=? AND session_id=? AND used=0 AND expires>?').get(nonce,session.id,Date.now());}
 consumeNonce(nonce,session,address){return this.transaction(()=>{const r=this.db.prepare('UPDATE nonces SET used=1 WHERE nonce=? AND session_id=? AND used=0 AND expires>?').run(nonce,session.id,Date.now());if(r.changes!==1)throw Error('Login nonce expired or already used');this.db.prepare('UPDATE sessions SET wallet=?,wallet_expires=? WHERE id=?').run(address.toLowerCase(),Date.now()+3600000,session.id);});}
 cup(id){return this.db.prepare('SELECT * FROM cups WHERE id=?').get(id)||null;}
 fundingProgress(id){return this.db.prepare('SELECT * FROM funding_progress WHERE cup_id=?').get(id)||null;}
 beginFunding(id,wallet,chainId,contract,block){this.db.prepare('INSERT OR IGNORE INTO funding_progress(cup_id,wallet,chain_id,contract,start_block,scan_block,updated) VALUES(?,?,?,?,?,?,?)').run(id,wallet.toLowerCase(),String(chainId),contract,block.toString(),block.toString(),Date.now());return this.fundingProgress(id);}
 noteFunding(id,phase,hash){if(!['approval','deposit'].includes(phase))throw Error('Unknown funding phase');this.db.prepare(`UPDATE funding_progress SET ${phase}_tx=?,updated=? WHERE cup_id=?`).run(hash,Date.now(),id);}
 advanceFundingScan(id,block){this.db.prepare('UPDATE funding_progress SET scan_block=?,updated=? WHERE cup_id=?').run(block.toString(),Date.now(),id);}
 participants(id){return this.db.prepare('SELECT * FROM participants WHERE cup_id=? ORDER BY slot').all(id);}
 matches(id){return this.db.prepare('SELECT * FROM matches WHERE cup_id=? ORDER BY stage').all(id).map(r=>({...r,players:parse(r.players),result:parse(r.result)}));}
 createCup(host,name,mode='practice') {
  if(!['practice','testnet','local-mock'].includes(mode))throw Error('Unknown Cup mode');
  name=String(name||'CHOG House Cup').trim();if(name.length<3||name.length>60)throw Error('Cup title must be 3–60 characters');
  const id=randomUUID();
  return this.transaction(()=>{this.db.prepare('INSERT INTO cups(id,host,name,mode,state,created,pool) VALUES(?,?,?,?,?,?,?)').run(id,host.id,name,mode,'Draft',Date.now(),mode==='practice'?'0':'100000000');
   for(let slot=0;slot<4;slot++){const invite=randomBytes(24).toString('hex');this.db.prepare('INSERT INTO participants(cup_id,slot,invite_hash,invite_token) VALUES(?,?,?,?)').run(id,slot,tokenHash(invite),invite);}
   return this.cup(id);
  });
 }
 joinCup(id,invite,session,nickname,chog) {
  const cup=this.cup(id);if(!cup||!['Draft','Funded'].includes(cup.state))throw Error('Cup is not accepting check-in');
  if(!ROSTER[chog])throw Error('Choose one of the 12 CHOG');
  nickname=String(nickname||'CHOG player').trim();if(nickname.length<2||nickname.length>24||/[\x00-\x1f]/.test(nickname))throw Error('Nickname must be 2–24 characters');
  const slot=this.db.prepare('SELECT * FROM participants WHERE cup_id=? AND invite_hash=?').get(id,tokenHash(invite||''));
  if(!slot||(slot.session_id&&slot.session_id!==session.id))throw Error('Invitation belongs to another participant');
  if(cup.mode!=='practice'&&(!session.wallet||session.wallet_expires<Date.now()))throw Error('Verify your testnet recipient wallet before check-in');
  this.db.prepare('UPDATE participants SET session_id=?,nickname=?,chog=?,wallet=?,checked=1,accepted=1 WHERE cup_id=? AND slot=?').run(session.id,nickname,chog,cup.mode==='practice'?null:session.wallet,id,slot.slot);
  return slot.slot;
 }
 uncheck(id,session,slot){const cup=this.cup(id);if(!cup||cup.host!==session.id||!['Draft','Funded'].includes(cup.state))throw Error('Host can replace a participant before lock only');
  const invite=randomBytes(24).toString('hex');this.db.prepare('UPDATE participants SET invite_hash=?,invite_token=?,session_id=NULL,nickname=NULL,chog=NULL,wallet=NULL,checked=0,accepted=0 WHERE cup_id=? AND slot=?').run(tokenHash(invite),invite,id,slot);return invite;
 }
 requireHost(id,session){const cup=this.cup(id);if(!cup||cup.host!==session.id)throw Error('Host access required');return cup;}
 lockPractice(id,session) {
  return this.transaction(()=>{const cup=this.requireHost(id,session);if(cup.mode!=='practice'||cup.state!=='Draft')throw Error('Practice Cup cannot be locked in this state');const p=this.participants(id);if(p.length!==4||p.some(x=>!x.checked||!x.accepted||!x.session_id))throw Error('Four checked-in participants are required');this.db.prepare('UPDATE cups SET state=?,locked=? WHERE id=?').run('Active',Date.now(),id);return p;});
 }
 newMatch(cupId,stage,players) {
  const id=randomUUID();this.db.prepare('INSERT INTO matches(id,cup_id,stage,state,players) VALUES(?,?,?,?,?)').run(id,cupId,stage,'Scheduled',json(players));return id;
 }
 attachRoom(id,room){this.db.prepare('UPDATE matches SET room_id=? WHERE id=?').run(room,id);}
 startMatch(id){this.db.prepare('UPDATE matches SET state=?,started=? WHERE id=? AND state=?').run('Playing',Date.now(),id,'Scheduled');}
 checkpoint(id,replay,checkpoint){this.db.prepare('UPDATE matches SET replay=?,checkpoint=? WHERE id=? AND state IN (?,?)').run(json(replay),json(checkpoint),id,'Scheduled','Playing');}
 recordResult(id,result,replay,outbox=null) {
  return this.transaction(()=>{const match=this.db.prepare('SELECT * FROM matches WHERE id=?').get(id);if(!match)throw Error('Unknown match');if(match.result)return false;
   this.db.prepare('UPDATE matches SET state=?,winner=?,outcome=?,reason=?,result=?,replay=?,finished=? WHERE id=?').run(result.outcome,result.winnerSession||null,result.outcome,result.reason,json(result),json(replay),Date.now(),id);
   if(outbox)this.enqueue(outbox);
   return true;
  });
 }
 enqueue({id=randomUUID(),cupId,matchId=null,kind,payload}){this.db.prepare('INSERT OR IGNORE INTO outbox(id,cup_id,match_id,kind,payload,state,updated) VALUES(?,?,?,?,?,?,?)').run(id,cupId,matchId,kind,json(payload),'pending',Date.now());return id;}
 outbox(){return this.db.prepare('SELECT * FROM outbox WHERE state IN (?,?) ORDER BY updated LIMIT 20').all('pending','submitted').map(r=>({...r,payload:parse(r.payload)}));}
 updateOutbox(id,patch){const keys=Object.keys(patch).filter(k=>['state','attempts','tx_hash','tx_nonce','error','payload'].includes(k));this.db.prepare(`UPDATE outbox SET ${keys.map(k=>k+'=?').join(',')},updated=? WHERE id=?`).run(...keys.map(k=>k==='payload'?json(patch[k]):patch[k]),Date.now(),id);}
 updateCup(id,patch){const keys=Object.keys(patch).filter(k=>['state','locked','sponsor','chain_id','chain_cup_id','contract','funding_tx','cancel_reason'].includes(k));this.db.prepare(`UPDATE cups SET ${keys.map(k=>k+'=?').join(',')} WHERE id=?`).run(...keys.map(k=>patch[k]),id);}
 completePractice(id){this.db.prepare('UPDATE cups SET state=? WHERE id=? AND mode=? AND state=?').run('Complete',id,'practice','Active');}
 cancelPractice(id,reason){this.db.prepare('UPDATE cups SET state=?,cancel_reason=? WHERE id=? AND mode=? AND state IN (?,?)').run('Cancelled',reason,id,'practice','Draft','Active');}
 report(id,sessionId=null) {
  const cup=this.cup(id);if(!cup)return null;
  const host=cup.host===sessionId;
  const participants=this.participants(id).map(p=>({slot:p.slot,nickname:p.nickname,chog:p.chog,wallet:p.wallet,checked:!!p.checked,accepted:!!p.accepted,isYou:p.session_id===sessionId,...(host?{invite:p.invite_token}:{})}));
  const raw=this.matches(id),bySession=new Map(this.participants(id).map(p=>[p.session_id,p]));
  const matches=raw.map(m=>({id:m.id,stage:m.stage,state:m.state,roomId:m.players.includes(sessionId)?m.room_id:null,players:m.players.map(id=>({slot:bySession.get(id)?.slot,nickname:bySession.get(id)?.nickname,chog:bySession.get(id)?.chog})),winnerSlot:bySession.get(m.winner)?.slot??null,outcome:m.outcome,reason:m.reason,started:m.started,finished:m.finished,replayHash:m.result?.replayHash||null}));
  const final=raw.find(m=>m.stage==='FINAL');
  const transactions=this.db.prepare('SELECT kind,state,tx_hash,error,payload FROM outbox WHERE cup_id=? ORDER BY updated').all(id).map(({payload,...t})=>{const p=parse(payload);return {...t,recipient:p.recipient||null,amount:p.amount||null};});
  return {id:cup.id,name:cup.name,mode:cup.mode,state:cup.state,host,created:cup.created,locked:cup.locked,pool:cup.pool,contract:cup.contract,chainId:cup.chain_id,fundingTx:cup.funding_tx,cancelReason:cup.cancel_reason,participants,matches,transactions,championSlot:bySession.get(final?.winner)?.slot??null,counts:{played:raw.filter(m=>m.outcome==='Finished').length,forfeits:raw.filter(m=>m.outcome==='Forfeit').length,void:raw.filter(m=>m.outcome==='Void').length},moneyLabel:cup.mode==='practice'?'Practice Cup · no prize or payout':cup.mode==='local-mock'?'Local mock token · no monetary value':'Monad testnet · AUSD test token, no monetary value'};
 }
 recoverInterrupted(){return this.db.prepare('SELECT * FROM matches WHERE state IN (?,?) AND result IS NULL').all('Playing','Scheduled');}
 prune(){this.db.prepare('UPDATE matches SET replay=NULL,checkpoint=NULL WHERE finished<? AND result IS NOT NULL').run(Date.now()-30*86400000);this.db.prepare('DELETE FROM nonces WHERE expires<?').run(Date.now()-86400000);}
 close(){this.db.close();}
}
