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

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await sleep(75);}throw Error('Local settlement did not reach the expected verified state');}
const artifact=name=>JSON.parse(fs.readFileSync(new URL('../../contracts/out/'+name,import.meta.url)));
test('local RPC: SIWE, funded Cup, signed results, durable outbox and verified 70/30 transfer', {timeout:120000},async()=>{
 const rpcPort=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 // Well-known public Anvil development seed. This test only talks to localhost chain 31337.
 const seed='test test test test test test test test test test test junk';
 const accounts=Array.from({length:10},(_,i)=>mnemonicToAccount(seed,{addressIndex:i}));
 const child=spawn('anvil',['--silent','--port',String(rpcPort),'--chain-id','31337'],{stdio:'ignore'});
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'chog-funding-test-'));
 let server;const rooms=[];
 try{
  const rpc=`http://127.0.0.1:${rpcPort}`,chain=defineChain({id:31337,name:'Local mock',nativeCurrency:{name:'Test ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:[rpc]}}});
  const publicClient=createPublicClient({chain,transport:http(rpc,{retryCount:0})});
  await until(async()=>{try{return await publicClient.getChainId()===31337;}catch{return false;}});
  const wallet=createWalletClient({chain,account:accounts[0],transport:http(rpc)});
  const deploy=async(a,args=[])=>{const hash=await wallet.deployContract({abi:a.abi,bytecode:a.bytecode.object,args});return (await publicClient.waitForTransactionReceipt({hash})).contractAddress;};
  const tokenArtifact=artifact('HouseCupEscrow.t.sol/MockToken.json'),escrowArtifact=artifact('HouseCupEscrow.sol/HouseCupEscrow.json');
  const token=await deploy(tokenArtifact),escrow=await deploy(escrowArtifact,[token,accounts[8].address,accounts[9].address,accounts[0].address]);
  const send=async(functionName,args)=>publicClient.waitForTransactionReceipt({hash:await wallet.writeContract({address:token,abi:tokenArtifact.abi,functionName,args})});
  await send('mint',[accounts[0].address,300000000n]);
  const serverOptions={port:0,dbPath:path.join(directory,'cup.sqlite'),env:{CHAIN_MODE:'local-mock',MONAD_TESTNET_RPC_URL:rpc,LOCAL_MOCK_TOKEN:token,CUP_ESCROW_ADDRESS:escrow,RESULT_SIGNER_PRIVATE_KEY:'0x'+Buffer.from(accounts[8].getHdKey().privateKey).toString('hex'),RELAY_PRIVATE_KEY:'0x'+Buffer.from(accounts[9].getHdKey().privateKey).toString('hex')}};
  server=await startServer(serverOptions);
  // A remote provider may lag its pending nonce after a successful send.
  // Keep latest authoritative while deliberately returning stale pending values.
  const stalePending=s=>{const get=s.chain.public.getTransactionCount;s.chain.public.getTransactionCount=async args=>args.blockTag==='pending'?Math.max(0,(await get({...args,blockTag:'latest'}))-1):get(args);};
  stalePending(server);
  const base=`http://localhost:${server.port}`;
  // Restart coverage opens fresh HTTP connections; an old pooled socket can reset
  // before a request reaches the reopened server on the same port.
  const request=async(path,s,body)=>{const response=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','Connection':'close',...(s?{Authorization:'Bearer '+s.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await response.json();if(!response.ok)throw Error(data.error);return data;};
  assert.equal((await request('/config')).settlement.enabled,true);
  const host=await request('/session'),players=await Promise.all(Array.from({length:4},()=>request('/session')));
  for(const [s,a] of [[host,accounts[0]],...players.map((s,i)=>[s,accounts[i+1]])]){const proof=await request('/auth/challenge',s,{address:a.address});await request('/auth/verify',s,{message:proof.message,signature:await a.signMessage({message:proof.message})});}
  let cup=await request('/cups',host,{name:'Local mock funded test',mode:'local-mock'});
  await assert.rejects(request(`/cups/${cup.id}/confirm-funding`,host,{hash:'0x'+'11'.repeat(32)}));
  const plan=await request(`/cups/${cup.id}/funding`,host,{});let fundingHash;
  assert.deepEqual(plan.steps.map(step=>step.phase),['approval','deposit']);
  const approvalHash=await wallet.sendTransaction({...plan.steps[0].transaction,value:0n});await publicClient.waitForTransactionReceipt({hash:approvalHash});
  await request(`/cups/${cup.id}/funding-progress`,host,{phase:'approval',hash:approvalHash});
  const resumedPlan=await request(`/cups/${cup.id}/funding`,host,{});assert.deepEqual(resumedPlan.steps.map(step=>step.phase),['deposit'],'approval survives refresh and is not repeated');
  await assert.rejects(request(`/cups/${cup.id}/funding-status`,players[0]),/Host access/);
  fundingHash=await wallet.sendTransaction({...resumedPlan.steps[0].transaction,value:0n});await publicClient.waitForTransactionReceipt({hash:fundingHash});
  assert.equal(server.store.cup(cup.id).state,'Draft','simulate losing the deposit hash before browser/server confirmation');
  const reopenPort=server.port;await server.close();server=await startServer({...serverOptions,port:reopenPort});
  stalePending(server);
  assert.equal(server.store.fundingProgress(cup.id).approval_tx,approvalHash,'funding progress survives backend restart');
  await assert.rejects(request(`/cups/${cup.id}/confirm-funding`,host,{hash:approvalHash}),/Funding is not confirmed/);
  await request(`/cups/${cup.id}/funding-progress`,host,{phase:'deposit',hash:approvalHash});
  let recovered;await until(async()=>{recovered=await request(`/cups/${cup.id}/funding-status`,host);return recovered.phase==='confirmed';});
  assert.equal(recovered.report.state,'Funded');assert.equal(recovered.report.fundingTx,fundingHash,'bounded event scan recovers the actual deposit receipt');
  await request(`/cups/${cup.id}/confirm-funding`,host,{hash:fundingHash});
  assert.equal((await request(`/cups/${cup.id}/funding-status`,host)).phase,'confirmed');
  await assert.rejects(request(`/cups/${cup.id}/funding`,host,{}),/cannot be funded/);
  for(let i=0;i<4;i++)await request(`/cups/${cup.id}/check-in`,players[i],{invite:cup.participants[i].invite,nickname:'Recipient '+i,chog:['yot','mamio','rogue','cookie'][i]});
  await request(`/cups/${cup.id}/start`,host,{});await until(()=>server.store.cup(cup.id).state==='Active');
  const fight=async(stage,seats)=>{const report=await request(`/cups/${cup.id}`,players[seats[0]]),m=report.matches.find(m=>m.stage===stage);const states=[];
   for(const i of seats){const room=await new Client(base).joinById(m.roomId,{authToken:players[i].token});rooms.push(room);const state={room,snapshot:null};room.onMessage('snapshot',v=>state.snapshot=v);room.onMessage('seat',()=>{});room.onMessage('error',()=>{});room.onMessage('server-ping',v=>room.send('server-pong',v));room.send('hello');states.push(state);}
   await until(()=>states.every(p=>p.snapshot?.slots.every(s=>s.rttSamples>=10)),14000);
   for(const state of states)state.room.send('ready',{ruleset:RULESET,buildHash:BUILD_HASH,assetsReady:true});await until(()=>states.every(p=>p.snapshot.sim));states[1].room.send('surrender');await until(()=>states[0].snapshot.persisted);
  };
  await Promise.all([fight('SF1',[0,1]),fight('SF2',[2,3])]);
  await until(()=>server.store.matches(cup.id).some(m=>m.stage==='FINAL'));
  // Transfer failure must retain award credit and must never become PAID.
  await send('setFail',[true]);await fight('FINAL',[0,2]);await until(()=>server.store.cup(cup.id).state==='Complete');
  await until(()=>server.store.db.prepare('SELECT count(*) n FROM outbox WHERE kind=? AND state=?').get('withdraw','failed').n===2,15000);
  cup=await request(`/cups/${cup.id}`,host);assert.equal(cup.transactions.filter(t=>t.state==='paid').length,0);
  await assert.rejects(request(`/cups/${cup.id}/claim`,host,{}),/No award/);
  const read=(name,args=[])=>publicClient.readContract({address:escrow,abi:escrowArtifact.abi,functionName:name,args});
  assert.equal(await read('credits',[cupHash(cup.id),accounts[1].address]),70000000n);
  assert.equal(await read('credits',[cupHash(cup.id),accounts[3].address]),30000000n);
  await send('setFail',[false]);await request(`/cups/${cup.id}/retry-payout`,host,{});
  await until(()=>server.store.db.prepare('SELECT count(*) n FROM outbox WHERE kind=? AND state=?').get('withdraw','paid').n===2);
  const balance=address=>publicClient.readContract({address:token,abi:tokenArtifact.abi,functionName:'balanceOf',args:[address]});
  assert.equal(await balance(accounts[1].address),70000000n);assert.equal(await balance(accounts[3].address),30000000n);assert.equal(await balance(escrow),0n);
  assert.equal((await read('getCup',[cupHash(cup.id)])).reserved,0n);
  const rows=server.store.db.prepare('SELECT * FROM outbox').all();assert.ok(rows.every(j=>JSON.parse(j.payload).rawTx&&j.tx_hash),'exact signed transaction bytes are durable before broadcast');
  assert.equal(new Set(rows.map(j=>j.tx_nonce)).size,rows.length,'Parallel semifinal results and payout retries reserve distinct relay nonces despite stale pending RPC data');
  const paid=rows.filter(j=>j.state==='paid');assert.equal(new Set(paid.map(j=>j.tx_hash)).size,2);
  await server.chain.poll();assert.equal(await balance(accounts[1].address),70000000n,'polling cannot pay twice');
  // A second sponsor-funded Cup can be cancelled before lock and refunded in full.
  const cancelled=await request('/cups',host,{name:'Cancelled local Cup',mode:'local-mock'}),cancelPlan=await request(`/cups/${cancelled.id}/funding`,host,{});
  for(const step of cancelPlan.steps){
   if(step.phase==='deposit')await publicClient.request({method:'evm_setAutomine',params:[false]});
   fundingHash=await wallet.sendTransaction({...step.transaction,value:0n});
   await request(`/cups/${cancelled.id}/funding-progress`,host,{phase:step.phase,hash:fundingHash});
   if(step.phase==='deposit'){
    const pending=await request(`/cups/${cancelled.id}/funding-status`,host);assert.equal(pending.phase,'deposit-pending');assert.equal(pending.canFund,false);
    await assert.rejects(request(`/cups/${cancelled.id}/funding`,host,{}),/pending/);
    await publicClient.request({method:'evm_setAutomine',params:[true]});await publicClient.request({method:'evm_mine'});
   }
   await publicClient.waitForTransactionReceipt({hash:fundingHash});
  }
  await request(`/cups/${cancelled.id}/confirm-funding`,host,{hash:fundingHash});const cancellation=await request(`/cups/${cancelled.id}/cancel-funding`,host,{}),hash=await wallet.sendTransaction({...cancellation,value:0n});await publicClient.waitForTransactionReceipt({hash});server.chain.busy=true;await request(`/cups/${cancelled.id}/confirm-cancellation`,host,{hash});
  // Wallet claim is a fallback when relay polling/gas is unavailable.
  const claim=await request(`/cups/${cancelled.id}/claim`,host,{});assert.equal(claim.recipient.toLowerCase(),accounts[0].address.toLowerCase());await assert.rejects(request(`/cups/${cancelled.id}/confirm-claim`,host,{hash:fundingHash}));const claimHash=await wallet.sendTransaction({to:claim.to,data:claim.data,value:0n});await publicClient.waitForTransactionReceipt({hash:claimHash});await request(`/cups/${cancelled.id}/confirm-claim`,host,{hash:claimHash});server.chain.busy=false;
  await until(()=>server.store.report(cancelled.id).transactions.some(j=>j.state==='paid'));assert.equal(await balance(escrow),0n);assert.equal(server.store.cup(cancelled.id).state,'Cancelled');
 }finally{await Promise.allSettled(rooms.map(r=>Promise.race([r.leave(),sleep(250)])));if(server)await Promise.race([server.close(),sleep(500)]);child.kill('SIGTERM');fs.rmSync(directory,{recursive:true,force:true});}
});
