import test from 'node:test';
import assert from 'node:assert/strict';
import {paidPrizeStatus} from '../../online/client.mjs';

const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20),treasury='0x'+'33'.repeat(20),hash='0x'+'aa'.repeat(32);
const duel={participants:[{seat:0,wallet:a},{seat:1,wallet:b}],transactions:[]};
test('winning a paid duel never claims the prize is paid before the winner transfer is verified',()=>{
 for(const state of ['submitted','awaiting','failed']){
  const d={...duel,state:'Complete',transactions:[{kind:'duel-withdraw',recipient:a,amount:'1900000',state,hash}]};
  const p=paidPrizeStatus(d,0,0);assert.equal(p.playerWon,true);assert.equal(p.confirmed,false);assert.equal(p.amount,'1900000');assert.equal(p.hash,hash);
 }
 const d={...duel,transactions:[{kind:'duel-withdraw',recipient:treasury,amount:'100000',state:'paid',hash}]};assert.equal(paidPrizeStatus(d,0,0).confirmed,false);
});
test('winner and loser see the same verified payout without giving the loser a win',()=>{
 const d={...duel,transactions:[{kind:'duel-withdraw',recipient:a,amount:'1900000',state:'paid',hash}]};
 assert.equal(paidPrizeStatus(d,0,0).playerWon,true);assert.equal(paidPrizeStatus(d,0,1).playerWon,false);assert.equal(paidPrizeStatus(d,0,1).confirmed,true);
});
test('a Void reports each player’s own verified refund, never another player’s transfer',()=>{
 const d={...duel,transactions:[{kind:'duel-withdraw',recipient:a,amount:'1000000',state:'paid',hash}]};
 const p=paidPrizeStatus(d,null,0);assert.equal(p.refund,true);assert.equal(p.confirmed,true);assert.equal(p.amount,'1000000');assert.equal(paidPrizeStatus(d,null,1).confirmed,false);
});
test('a combined winner and treasury credit remains a verified winner payment',()=>{
 const d={...duel,transactions:[{kind:'duel-withdraw',recipient:a,amount:'2000000',state:'paid',hash}]};assert.equal(paidPrizeStatus(d,0,0).confirmed,true);
 assert.equal(paidPrizeStatus(null,0,0).confirmed,false);
});
