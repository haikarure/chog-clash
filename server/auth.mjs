import {randomBytes} from 'node:crypto';
import {getAddress,recoverMessageAddress,isAddress} from 'viem';
import {createSiweMessage,parseSiweMessage} from 'viem/siwe';
export function createChallenge(store,session,address,origin,chainId=10143) {
 if(!isAddress(address))throw Error('Invalid wallet address');
 const nonce=randomBytes(16).toString('hex'),now=new Date();
 const message=createSiweMessage({domain:new URL(origin).host,address:getAddress(address),statement:'Bind this recipient to your CHOG House Cup session. No transfer is authorized.',uri:origin,version:'1',chainId,nonce,issuedAt:now,expirationTime:new Date(now.getTime()+600000)});
 store.putNonce(session,message,address,nonce);return {message,nonce,chainId};
}
export async function verifyChallenge(store,session,message,signature,origin,chainId=10143) {
 if(typeof message!=='string'||message.length>3000||typeof signature!=='string'||signature.length>150)throw Error('Invalid login proof');
 const fields=parseSiweMessage(message),record=store.nonce(fields.nonce,session);
 if(!record||record.message!==message||fields.domain!==new URL(origin).host||fields.uri!==origin||fields.chainId!==chainId||fields.expirationTime<=new Date()||!fields.address)throw Error('Login proof domain, chain, nonce or expiry mismatch');
 const recovered=await recoverMessageAddress({message,signature});if(recovered.toLowerCase()!==fields.address.toLowerCase()||record.address!==recovered.toLowerCase())throw Error('Only an EOA recipient controlled by this session is supported');
 store.consumeNonce(fields.nonce,session,recovered);return recovered;
}
