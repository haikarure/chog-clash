/* Provision private application signing roles. Agent deployments use Alchemy. */
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createPublicClient,defineChain,getAddress,http,isAddress} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';

try {
 const args=process.argv.slice(2),ownerArg=args[args.indexOf('--owner')+1];
 if(!args.includes('--owner')||!isAddress(ownerArg||''))throw Error('Provide the public contract owner address');
 const owner=getAddress(ownerArg),directory=path.resolve(import.meta.dirname,'..'),file=path.join(directory,'.env');
 if(!fs.existsSync(file))throw Error('Configure the private backend .env first');
 if(process.env.CHAIN_MODE!=='testnet'||process.env.ENABLE_TESTNET_PRIZES!=='0')throw Error('Role setup requires testnet mode with prizes disabled');
 if(process.env.CONTRACT_OWNER_ADDRESS&&getAddress(process.env.CONTRACT_OWNER_ADDRESS)!==owner)throw Error('Preserve the existing owner; inspect configuration before changing it');
 const rpc=process.env.MONAD_TESTNET_RPC_URL;
 const chain=defineChain({id:10143,name:'Monad testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:{default:{http:[rpc]}}});
 const client=createPublicClient({chain,transport:http(rpc,{timeout:15000,retryCount:0})});
 if(await client.getChainId()!==10143)throw Error('Role setup supports Monad testnet only');
 const keys={};
 for(const name of ['RESULT_SIGNER_PRIVATE_KEY','RELAY_PRIVATE_KEY']){
  const value=process.env[name]||generatePrivateKey();
  if(!/^0x[0-9a-f]{64}$/i.test(value))throw Error('A backend role key has an invalid format');
  keys[name]=value;
 }
 let signer,relay;
 try{signer=privateKeyToAccount(keys.RESULT_SIGNER_PRIVATE_KEY);relay=privateKeyToAccount(keys.RELAY_PRIVATE_KEY);}
 catch{throw Error('A backend role key is invalid');}
 if(new Set([owner,signer.address,relay.address].map(a=>a.toLowerCase())).size!==3)throw Error('Owner, result signer and relay must be separate accounts');
 const original=fs.readFileSync(file,'utf8');let content=original;
 for(const [name,value] of Object.entries({...keys,CONTRACT_OWNER_ADDRESS:owner})){
  const pattern=new RegExp('^'+name+'=.*$','m');
  content=pattern.test(content)?content.replace(pattern,()=>name+'='+value):content.trimEnd()+'\n'+name+'='+value+'\n';
 }
 if(fs.readFileSync(file,'utf8')!==original)throw Error('Configuration changed during setup; retry without overwriting it');
 const temporary=file+'.roles-'+randomBytes(6).toString('hex');
 try{fs.writeFileSync(temporary,content,{flag:'wx',mode:0o600});fs.renameSync(temporary,file);}
 finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 fs.chmodSync(file,0o600);
 const roles={chainId:10143,owner,resultSigner:signer.address,relay:relay.address,agentDeploymentSigner:'Alchemy session; no local deployer key created',prizesEnabled:false};
 const output=path.join(directory,'deployment');fs.mkdirSync(output,{recursive:true,mode:0o700});
 fs.writeFileSync(path.join(output,'roles.json'),JSON.stringify(roles,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(roles,null,2));
} catch(error) {
 console.error(error.shortMessage||(/https?:\/\//.test(error.message||'')?'Role setup failed; inspect the network without printing credentials':error.message));
 process.exitCode=1;
}
