// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;
import {HouseCupEscrow} from "../src/HouseCupEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
interface Vm {function addr(uint256) external returns(address);function sign(uint256,bytes32) external returns(uint8,bytes32,bytes32);function prank(address) external;function warp(uint256) external;function chainId(uint256) external;function expectRevert() external;}
contract MockToken is ERC20 {
 bool public fail; constructor() ERC20("Local mock test token","MOCK"){} function decimals() public pure override returns(uint8){return 6;}function mint(address a,uint n) external {_mint(a,n);}function setFail(bool v) external {fail=v;}
 function transfer(address to,uint256 amount) public override returns(bool){require(!fail,"transfer paused");return super.transfer(to,amount);}
}
contract WrongDecimalsToken is ERC20 {constructor() ERC20("Wrong decimals","WRONG") {}}
contract FeeToken is ERC20 {constructor() ERC20("Fee token","FEE"){}function decimals() public pure override returns(uint8){return 6;}function mint(address a,uint n) external {_mint(a,n);}function transferFrom(address from,address to,uint amount) public override returns(bool){super.transferFrom(from,to,amount);_burn(to,1);return true;}}
contract ReentrantToken is ERC20 {
 HouseCupEscrow public target;bytes32 public id;address public other;bool public blocked;
 constructor() ERC20("Callback test","CALL"){}function decimals() public pure override returns(uint8){return 6;}function mint(address a,uint n) external {_mint(a,n);}function configure(HouseCupEscrow t,bytes32 i,address o) external {target=t;id=i;other=o;}
 function transfer(address to,uint amount) public override returns(bool){(bool ok,)=address(target).call(abi.encodeCall(target.withdrawFor,(id,other)));blocked=!ok;return super.transfer(to,amount);}
}
contract HouseCupEscrowTest {
 Vm constant vm=Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
 uint256 constant SIGNER_KEY=13579;bytes32 constant CUP=keccak256("cup");bytes32 constant RULES=keccak256("rules");
 address sponsor=address(0x1001);address relay=address(0x1002);address[4] players=[address(0x2001),address(0x2002),address(0x2003),address(0x2004)];
 MockToken token;HouseCupEscrow escrow;
 function setUp() public {vm.warp(1000);token=new MockToken();escrow=new HouseCupEscrow(token,vm.addr(SIGNER_KEY),relay,address(this));token.mint(sponsor,200_000_000);vm.prank(sponsor);token.approve(address(escrow),type(uint256).max);vm.prank(sponsor);escrow.createFundedCup(CUP,sponsor,RULES);vm.prank(relay);escrow.lockCup(CUP,players);}
 function result(uint8 stage,address winner) internal view returns(HouseCupEscrow.Result memory r){r=HouseCupEscrow.Result(CUP,escrow.matchId(CUP,stage),stage,stage<2?players[stage*2]:players[0],stage<2?players[stage*2+1]:players[2],winner,0,RULES,keccak256("replay"),1000,1,1,5500);}
 function signature(HouseCupEscrow.Result memory r) internal returns(bytes memory){(uint8 v,bytes32 x,bytes32 y)=vm.sign(SIGNER_KEY,escrow.hashResult(r));return abi.encodePacked(x,y,v);}
 function reject(HouseCupEscrow.Result memory r) internal {bytes memory sig=signature(r);vm.expectRevert();escrow.submitResult(r,sig);}
 function submit(uint8 stage,address winner) internal {HouseCupEscrow.Result memory r=result(stage,winner);escrow.submitResult(r,signature(r));}
 function complete() internal {submit(0,players[0]);submit(1,players[2]);submit(2,players[0]);}
 function testFinalAllocates70And30Once() public {complete();require(escrow.credits(CUP,players[0])==70_000_000);require(escrow.credits(CUP,players[2])==30_000_000);escrow.withdrawFor(CUP,players[0]);escrow.withdrawFor(CUP,players[2]);require(token.balanceOf(players[0])==70_000_000&&token.balanceOf(players[2])==30_000_000);vm.expectRevert();escrow.withdrawFor(CUP,players[0]);}
 function testReplayRejected() public {HouseCupEscrow.Result memory r=result(0,players[0]);bytes memory sig=signature(r);escrow.submitResult(r,sig);vm.expectRevert();escrow.submitResult(r,sig);}
 function testWrongRecipientRejected() public {reject(result(0,address(0x999)));}
 function testFinalNeedsSemifinalWinners() public {reject(result(2,players[0]));submit(0,players[1]);submit(1,players[3]);reject(result(2,players[0]));}
 function testWrongChainAndContractDomainRejected() public {HouseCupEscrow.Result memory r=result(0,players[0]);bytes memory sig=signature(r);vm.chainId(10143);vm.expectRevert();escrow.submitResult(r,sig);vm.chainId(31337);HouseCupEscrow other=new HouseCupEscrow(token,vm.addr(SIGNER_KEY),relay,address(this));vm.prank(sponsor);token.approve(address(other),type(uint256).max);vm.prank(sponsor);other.createFundedCup(CUP,sponsor,RULES);vm.prank(relay);other.lockCup(CUP,players);vm.expectRevert();other.submitResult(r,sig);}
 function testTermsSlotAndExpiryRejected() public {HouseCupEscrow.Result memory r=result(0,players[0]);r.resultSequence=2;reject(r);r=result(0,players[0]);r.matchId=keccak256("other");reject(r);r=result(0,players[0]);r.expiresAt=999;reject(r);r=result(0,players[0]);r.finishedAt=1001;reject(r);}
 function testTransferFailureRetainsCredit() public {complete();token.setFail(true);vm.expectRevert();escrow.withdrawFor(CUP,players[0]);require(escrow.credits(CUP,players[0])==70_000_000);token.setFail(false);escrow.withdrawFor(CUP,players[0]);}
 function testSponsorCannotCancelAwards() public {complete();vm.warp(6000);vm.prank(sponsor);vm.expectRevert();escrow.refundExpired(CUP);require(escrow.credits(CUP,players[0])==70_000_000);}
 function testVoidRefundExclusive() public {HouseCupEscrow.Result memory r=result(0,address(0));r.outcomeType=2;escrow.submitResult(r,signature(r));require(escrow.credits(CUP,sponsor)==100_000_000);reject(result(1,players[2]));escrow.withdrawFor(CUP,sponsor);require(escrow.getCup(CUP).reserved==0);}
 function testExpiryAndLateResultAreExclusive() public {vm.warp(5501);escrow.refundExpired(CUP);require(escrow.credits(CUP,sponsor)==100_000_000);reject(result(0,players[0]));}
 function testPausePreservesAwardsAndRefund() public {complete();escrow.pauseResults();escrow.withdrawFor(CUP,players[0]);escrow.withdrawFor(CUP,players[2]);require(escrow.getCup(CUP).reserved==0);}
 function testSignerRotationDoesNotChangeLockedCup() public {escrow.setNextSigner(address(0x999));submit(0,players[0]);require(escrow.getCup(CUP).signer==vm.addr(SIGNER_KEY));}
 function testUnapprovedLockAndDuplicateRecipientRejected() public {vm.prank(address(0x777));vm.expectRevert();escrow.lockCup(CUP,players);bytes32 id=keccak256("second");vm.prank(sponsor);escrow.createFundedCup(id,sponsor,RULES);address[4] memory dup=players;dup[3]=dup[0];vm.prank(relay);vm.expectRevert();escrow.lockCup(id,dup);}
 function testFuzzUnauthorizedRecipientCannotDrain(uint160 raw) public {address recipient=address(raw);if(recipient==players[0]||recipient==players[2])return;complete();vm.expectRevert();escrow.withdrawFor(CUP,recipient);require(token.balanceOf(address(escrow))==100_000_000);}
 function testFuzzSolvencyAndWithdrawalOrder(bool championFirst) public {complete();address first=championFirst?players[0]:players[2];address second=championFirst?players[2]:players[0];escrow.withdrawFor(CUP,first);HouseCupEscrow.Cup memory c=escrow.getCup(CUP);require(c.reserved+c.paid==100_000_000&&c.reserved==token.balanceOf(address(escrow)));escrow.withdrawFor(CUP,second);c=escrow.getCup(CUP);require(c.reserved==0&&c.paid==100_000_000&&token.balanceOf(address(escrow))==0);}
 function testPauseStillAllowsExpiredActiveRefund() public {escrow.pauseResults();vm.warp(5501);escrow.refundExpired(CUP);escrow.withdrawFor(CUP,sponsor);require(escrow.getCup(CUP).paid==100_000_000);}
 function testVoidCannotHaveWinnerAndForfeitMustHaveWinner() public {HouseCupEscrow.Result memory r=result(0,players[0]);r.outcomeType=2;reject(r);r=result(0,address(0));r.outcomeType=1;reject(r);}
 function testEverySignedFieldIsBound() public {
  HouseCupEscrow.Result memory original=result(0,players[0]);bytes memory sig=signature(original);
  for(uint i=0;i<13;i++){HouseCupEscrow.Result memory r=result(0,players[0]);
   if(i==0)r.cupId=keccak256("different");else if(i==1)r.matchId=keccak256("different");else if(i==2)r.stage=1;else if(i==3)r.participantA=players[1];else if(i==4)r.participantB=players[0];else if(i==5)r.winnerRecipient=players[1];else if(i==6)r.outcomeType=1;else if(i==7)r.rulesetHash=keccak256("different");else if(i==8)r.replayHash=keccak256("different");else if(i==9)r.finishedAt=999;else if(i==10)r.resultSequence=2;else if(i==11)r.signerEpoch=2;else r.expiresAt=5499;
   vm.expectRevert();escrow.submitResult(r,sig);
  }
 }
 function testWrongDecimalsAndTransferFeeRejected() public {WrongDecimalsToken wrong=new WrongDecimalsToken();vm.expectRevert();new HouseCupEscrow(wrong,vm.addr(SIGNER_KEY),relay,address(this));FeeToken fee=new FeeToken();HouseCupEscrow e=new HouseCupEscrow(fee,vm.addr(SIGNER_KEY),relay,address(this));fee.mint(address(this),100_000_000);fee.approve(address(e),type(uint256).max);vm.expectRevert();e.createFundedCup(CUP,address(this),RULES);require(fee.balanceOf(address(this))==100_000_000&&fee.balanceOf(address(e))==0);}
 function testReentrancyCannotConsumeOtherCredit() public {ReentrantToken callback=new ReentrantToken();HouseCupEscrow e=new HouseCupEscrow(callback,vm.addr(SIGNER_KEY),relay,address(this));callback.mint(address(this),100_000_000);callback.approve(address(e),type(uint256).max);e.createFundedCup(CUP,address(this),RULES);vm.prank(relay);e.lockCup(CUP,players);
  for(uint8 stage=0;stage<3;stage++){HouseCupEscrow.Result memory r=result(stage,stage==1?players[2]:players[0]);(uint8 v,bytes32 x,bytes32 y)=vm.sign(SIGNER_KEY,e.hashResult(r));e.submitResult(r,abi.encodePacked(x,y,v));}
  callback.configure(e,CUP,players[2]);e.withdrawFor(CUP,players[0]);require(callback.blocked()&&e.credits(CUP,players[2])==30_000_000&&callback.balanceOf(players[0])==70_000_000);
 }
}
