import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createPublicClient,createWalletClient,defineChain,http} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
import {Client} from '@colyseus/sdk';
import {startServer} from '../app.mjs';
import {BUILD_HASH} from '../../online/build.mjs';
import {RULESET} from '../../online/core.mjs';
import {cupHash} from '../chain.mjs';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await sleep(100);}throw Error('Paid duel did not reach the verified state');}
const artifact=name=>JSON.parse(fs.readFileSync(new URL('../../contracts/out/'+name,import.meta.url)));
test('paid invite/auto-match: real two-entry escrow, recovered deposit, fee, cancel refund and restart Void',{timeout:150000},async()=>{
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
 const child=spawn('anvil',['--silent','--port',String(port),'--chain-id','31337'],{stdio:'ignore'});
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'chog-paid-test-')),rooms=[];let server;
 // Public Anvil development seed; this test can only use localhost chain 31337.
 const accounts=Array.from({length:10},(_,i)=>mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:i}));
 try{
  const rpc=`http://127.0.0.1:${port}`,network=defineChain({id:31337,name:'Local mock',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpc]}}});
  const client=createPublicClient({chain:network,transport:http(rpc,{retryCount:0})});await until(async()=>{try{return await client.getChainId()===31337;}catch{return false;}});
  const wallets=accounts.map(account=>createWalletClient({chain:network,account,transport:http(rpc)}));
  const deploy=async(a,args=[])=>{const receipt=await client.waitForTransactionReceipt({hash:await wallets[0].deployContract({abi:a.abi,bytecode:a.bytecode.object,args})});return receipt.contractAddress;};
  const tokenArtifact=artifact('HouseCupEscrow.t.sol/MockToken.json'),cupArtifact=artifact('HouseCupEscrow.sol/HouseCupEscrow.json'),duelArtifact=artifact('PaidDuelEscrow.sol/PaidDuelEscrow.json');
  const token=await deploy(tokenArtifact),cup=await deploy(cupArtifact,[token,accounts[8].address,accounts[9].address,accounts[0].address]);
  const escrow=await deploy(duelArtifact,[token,accounts[8].address,accounts[9].address,accounts[0].address,500,accounts[0].address]);
  for(const a of [accounts[1],accounts[2]])await client.waitForTransactionReceipt({hash:await wallets[0].writeContract({address:token,abi:tokenArtifact.abi,functionName:'mint',args:[a.address,10000000n]})});
  const options={port:0,dbPath:path.join(directory,'paid.sqlite'),env:{CHAIN_MODE:'local-mock',MONAD_TESTNET_RPC_URL:rpc,LOCAL_MOCK_TOKEN:token,CUP_ESCROW_ADDRESS:cup,DUEL_ESCROW_ADDRESS:escrow,DUEL_TREASURY_ADDRESS:accounts[0].address,DUEL_FEE_BPS:'500',RESULT_SIGNER_PRIVATE_KEY:'0x'+Buffer.from(accounts[8].getHdKey().privateKey).toString('hex'),RELAY_PRIVATE_KEY:'0x'+Buffer.from(accounts[9].getHdKey().privateKey).toString('hex')}};
  server=await startServer(options);let base=`http://localhost:${server.port}`;
  const patch=s=>{const nonce=s.chain.public.getTransactionCount;s.chain.public.getTransactionCount=async args=>args.blockTag==='pending'?Math.max(0,(await nonce({...args,blockTag:'latest'}))-1):nonce(args);const logs=s.chain.public.getLogs;s.chain.public.getLogs=async args=>{assert.ok(args.toBlock-args.fromBlock<=9n);return logs(args);};};patch(server);
  const request=async(url,s,body)=>{const response=await fetch(base+'/api'+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','Connection':'close',...(s?{Authorization:'Bearer '+s.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!response.ok)throw Error(data.error);return data;};
  const config=await request('/config');assert.equal(config.paidDuel.enabled,true);assert.equal(config.paidDuel.feeBps,500);
  const sessions=await Promise.all(Array.from({length:3},()=>request('/session')));
  for(let i=0;i<2;i++){const p=await request('/auth/challenge',sessions[i],{address:accounts[i+1].address});await request('/auth/verify',sessions[i],{message:p.message,signature:await accounts[i+1].signMessage({message:p.message})});}
  const create=async()=>{const d=await request('/duels',sessions[0],{chog:'mamio',nickname:'First player'});await request(`/duels/${d.id}/join`,sessions[1],{invite:d.invite,chog:'toad',nickname:'Second player'});await until(()=>server.store.duel(d.id).state==='Funding');return d;};
  let duel=await create();assert.equal((await request(`/duels/${duel.id}`)).invite,undefined);
  await assert.rejects(request(`/duels/${duel.id}/funding-status`,sessions[2]),/participant access/);
  const fund=async(id,index,confirm=true)=>{const plan=await request(`/duels/${id}/funding`,sessions[index],{});let hash;for(const step of plan.steps){hash=await wallets[index+1].sendTransaction({...step.transaction,value:0n});await client.waitForTransactionReceipt({hash});if(step.phase==='approval')await request(`/duels/${id}/funding-progress`,sessions[index],{phase:'approval',hash});}if(confirm)await request(`/duels/${id}/confirm-funding`,sessions[index],{hash});return hash;};
  const hashA=await fund(duel.id,0,false);const savedPort=server.port;await server.close();server=await startServer({...options,port:savedPort});patch(server);
  const recovered=await request(`/duels/${duel.id}/funding-status`,sessions[0]);assert.equal(recovered.phase,'confirmed');assert.equal(recovered.depositTx,hashA);assert.equal(recovered.canFund,false);
  await fund(duel.id,1);await until(()=>server.store.duel(duel.id).room_id);
  duel=await request(`/duels/${duel.id}`,sessions[0]);assert.equal(duel.state,'Active');await assert.rejects(request(`/duels/${duel.id}/cancel`,sessions[0],{}),/locked duel/);
  const states=[];
  for(const s of sessions.slice(0,2)){const room=await new Client(base).joinById(duel.roomId,{authToken:s.token});rooms.push(room);const state={room,snapshot:null};room.onMessage('snapshot',v=>state.snapshot=v);room.onMessage('seat',()=>{});room.onMessage('error',()=>{});room.onMessage('server-ping',v=>room.send('server-pong',v));room.send('hello');states.push(state);}
  await until(()=>states.every(s=>s.snapshot?.slots.every(p=>p.rttSamples>=10)),14000);
  states.forEach(s=>s.room.send('ready',{ruleset:RULESET,buildHash:BUILD_HASH,assetsReady:true}));await until(()=>states[0].snapshot?.sim);
  states[1].room.send('surrender');await until(()=>server.store.duel(duel.id).state==='Complete');await until(()=>server.store.duelReport(duel.id).transactions.filter(j=>j.kind==='duel-withdraw'&&j.state==='paid').length===2);
  const balance=address=>client.readContract({address:token,abi:tokenArtifact.abi,functionName:'balanceOf',args:[address]});
  assert.equal(await balance(accounts[1].address),10900000n);assert.equal(await balance(accounts[2].address),9000000n);assert.equal(await balance(accounts[0].address),100000n);
  console.info('Paid duel winner 1.90 and treasury 0.10 transfers verified');
  const qa=await request('/queue',sessions[0],{kind:'paid',chog:'yot',nickname:'First player'});assert.equal(qa.state,'Queued');
  const qb=await request('/queue',sessions[1],{kind:'paid',chog:'cookie',nickname:'Second player'});const matched=await request('/queue',sessions[0]);assert.equal(qb.duelId,matched.duelId);assert.ok(qb.duelId);await until(()=>server.store.duel(qb.duelId).state==='Funding');
  await fund(qb.duelId,0);const beforeRefund=await balance(accounts[1].address);await request(`/duels/${qb.duelId}/cancel`,sessions[1],{});await until(()=>server.store.duelReport(qb.duelId).transactions.some(j=>j.kind==='duel-withdraw'&&j.state==='paid'));
  assert.equal(await balance(accounts[1].address),beforeRefund+1000000n);assert.equal(await balance(accounts[0].address),100000n);assert.equal(server.store.duel(qb.duelId).state,'Cancelled');console.info('Partial paid entry cancellation refunded with no fee');
  const crashed=await create();await fund(crashed.id,0);await fund(crashed.id,1);await until(()=>server.store.duel(crashed.id).room_id);
  await server.close();server=await startServer({...options,port:savedPort});patch(server);
  await until(()=>server.store.duel(crashed.id).state==='Cancelled');await until(()=>server.store.duelReport(crashed.id).transactions.filter(j=>j.kind==='duel-withdraw'&&j.state==='paid').length===2);
  assert.equal(server.store.duelReport(crashed.id).result.outcome,'Void');assert.equal(await balance(accounts[0].address),100000n);console.info('Paid server restart creates Void and both entry refunds');
  server.duels.createRoom=async()=>{throw Error('Injected room creation failure');};
  const unavailable=await create(),beforeA=await balance(accounts[1].address),beforeB=await balance(accounts[2].address);await fund(unavailable.id,0);await fund(unavailable.id,1);
  await until(()=>server.store.duelReport(unavailable.id).transactions.filter(j=>j.kind==='duel-withdraw'&&j.state==='paid').length===2);
  assert.equal(server.store.duelReport(unavailable.id).result.reason,'room_creation_failed');assert.equal(await balance(accounts[1].address),beforeA);assert.equal(await balance(accounts[2].address),beforeB);assert.equal(await balance(accounts[0].address),100000n);console.info('Paid room creation failure produces Void and full refunds');
  const external=await create();await fund(external.id,0);await client.waitForTransactionReceipt({hash:await wallets[1].writeContract({address:escrow,abi:duelArtifact.abi,functionName:'cancelBeforeStart',args:[cupHash(external.id)]})});
  await until(()=>server.store.duelReport(external.id).transactions.some(j=>j.kind==='duel-withdraw'&&j.state==='paid'));assert.equal(server.store.duel(external.id).state,'Cancelled');assert.equal(await balance(accounts[1].address),beforeA);console.info('Direct wallet cancellation is reconciled and refunded by the backend');
 }finally{for(const r of rooms)try{await Promise.race([r.leave(),sleep(100)]);}catch{}if(server)await server.close();child.kill('SIGTERM');fs.rmSync(directory,{recursive:true,force:true});}
});
