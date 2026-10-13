// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;
import {PaidDuelEscrow} from "../src/PaidDuelEscrow.sol";
import {MockToken,Vm} from "./HouseCupEscrow.t.sol";

contract PaidDuelEscrowTest {
    Vm constant vm=Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 constant KEY=0xA11CE;
    bytes32 constant ID=keccak256("paid-duel");
    bytes32 constant RULES=keccak256("combat-build");
    bytes32 constant REPLAY=keccak256("played-inputs");
    MockToken token;
    PaidDuelEscrow escrow;
    address relay=address(0x123);
    address treasury=address(0x456);
    address[2] players=[address(0xA),address(0xB)];
    function setUp() public {
        vm.chainId(31337);vm.warp(1000);token=new MockToken();escrow=new PaidDuelEscrow(token,vm.addr(KEY),relay,treasury,500,address(this));
        for(uint256 i=0;i<2;i++){token.mint(players[i],10_000_000);vm.prank(players[i]);token.approve(address(escrow),type(uint256).max);}
        create(ID);fund(ID,0);fund(ID,1);vm.prank(relay);escrow.activateDuel(ID);
    }
    function create(bytes32 id) internal {vm.prank(relay);escrow.createDuel(id,players,RULES);}
    function fund(bytes32 id,uint8 seat) internal {vm.prank(players[seat]);escrow.fundDuel(id);}
    function result() internal view returns(PaidDuelEscrow.Result memory){
        return PaidDuelEscrow.Result(ID,escrow.matchId(ID),players[0],players[1],players[0],0,RULES,REPLAY,1000,1,1,5500);
    }
    function sign(PaidDuelEscrow.Result memory r) internal returns(bytes memory){(uint8 v,bytes32 rr,bytes32 s)=vm.sign(KEY,escrow.hashResult(r));return abi.encodePacked(rr,s,v);}
    function reject(PaidDuelEscrow.Result memory r) internal {bytes memory sig=sign(r);vm.expectRevert();escrow.submitResult(r,sig);}
    function complete() internal {PaidDuelEscrow.Result memory r=result();escrow.submitResult(r,sign(r));}
    function testTwoEntriesProduceWinnerAndTreasuryCredits() public {
        complete();require(escrow.credits(ID,players[0])==1_900_000 && escrow.credits(ID,treasury)==100_000 && escrow.credits(ID,players[1])==0);
        escrow.withdrawFor(ID,players[0]);escrow.withdrawFor(ID,treasury);
        require(token.balanceOf(players[0])==10_900_000 && token.balanceOf(treasury)==100_000 && token.balanceOf(address(escrow))==0);
        PaidDuelEscrow.Duel memory d=escrow.getDuel(ID);require(d.paid==2_000_000 && d.reserved==0);
    }
    function testBothEntriesRequiredBeforeActivation() public {bytes32 id=keccak256("partial");create(id);fund(id,0);vm.prank(relay);vm.expectRevert();escrow.activateDuel(id);}
    function testOnlyAssignedWalletCanFundAndCannotPayTwice() public {bytes32 id=keccak256("fund-once");create(id);vm.prank(address(0x999));vm.expectRevert();escrow.fundDuel(id);fund(id,0);vm.prank(players[0]);vm.expectRevert();escrow.fundDuel(id);}
    function testCreatorAndPlayersAreBound() public {vm.prank(players[0]);vm.expectRevert();escrow.createDuel(keccak256("attack"),players,RULES);address[2] memory duplicates=[players[0],players[0]];vm.prank(relay);vm.expectRevert();escrow.createDuel(keccak256("same-wallet"),duplicates,RULES);}
    function testPartialFundingCancellationRefundsOnlyDepositorWithoutFee() public {bytes32 id=keccak256("cancel-partial");create(id);fund(id,0);vm.prank(players[1]);escrow.cancelBeforeStart(id);require(escrow.credits(id,players[0])==1_000_000 && escrow.credits(id,players[1])==0 && escrow.credits(id,treasury)==0);escrow.withdrawFor(id,players[0]);require(escrow.getDuel(id).reserved==0);}
    function testBothFundedCanCancelBeforeActivationWithNoFee() public {bytes32 id=keccak256("cancel-both");create(id);fund(id,0);fund(id,1);vm.prank(players[0]);escrow.cancelBeforeStart(id);require(escrow.credits(id,players[0])==1_000_000 && escrow.credits(id,players[1])==1_000_000 && escrow.credits(id,treasury)==0);vm.prank(relay);vm.expectRevert();escrow.activateDuel(id);}
    function testFundingTimeoutMakesSingleEntryRefundable() public {bytes32 id=keccak256("fund-expiry");create(id);fund(id,1);vm.warp(1901);escrow.refundExpired(id);require(escrow.credits(id,players[1])==1_000_000);vm.prank(players[0]);vm.expectRevert();escrow.fundDuel(id);}
    function testVoidReturnsBothEntriesWithoutTreasuryFee() public {PaidDuelEscrow.Result memory r=result();r.outcomeType=2;r.winnerRecipient=address(0);escrow.submitResult(r,sign(r));require(escrow.credits(ID,players[0])==1_000_000 && escrow.credits(ID,players[1])==1_000_000 && escrow.credits(ID,treasury)==0);reject(result());}
    function testForfeitAwardsWinnerAndFee() public {PaidDuelEscrow.Result memory r=result();r.outcomeType=1;r.winnerRecipient=players[1];escrow.submitResult(r,sign(r));require(escrow.credits(ID,players[1])==1_900_000 && escrow.credits(ID,treasury)==100_000);}
    function testActiveDuelCannotBeCancelledByPlayer() public {vm.prank(players[0]);vm.expectRevert();escrow.cancelBeforeStart(ID);}
    function testResultReplayAndExpiredResultsCannotChangeCredits() public {complete();reject(result());vm.warp(5501);vm.expectRevert();escrow.refundExpired(ID);require(escrow.credits(ID,players[0])==1_900_000);}
    function testPausePreservesWithdrawalsAndExpiredRefunds() public {escrow.pauseResults();vm.warp(5501);escrow.refundExpired(ID);escrow.withdrawFor(ID,players[0]);escrow.withdrawFor(ID,players[1]);require(escrow.getDuel(ID).paid==2_000_000);}
    function testTransferFailureRetainsCredit() public {complete();token.setFail(true);vm.expectRevert();escrow.withdrawFor(ID,players[0]);require(escrow.credits(ID,players[0])==1_900_000);token.setFail(false);escrow.withdrawFor(ID,players[0]);}
    function testLockedSignerSurvivesRotation() public {escrow.setNextSigner(address(0x999));complete();require(escrow.getDuel(ID).signer==vm.addr(KEY));}
    function testEverySignedFieldAndOutcomeIsValidated() public {
        PaidDuelEscrow.Result memory r=result();r.participantA=address(0x999);reject(r);r=result();r.participantB=players[0];reject(r);
        r=result();r.matchId=keccak256("wrong");reject(r);r=result();r.rulesetHash=keccak256("other-build");reject(r);
        r=result();r.winnerRecipient=address(0x999);reject(r);r=result();r.outcomeType=2;reject(r);
        r=result();r.replayHash=bytes32(0);reject(r);r=result();r.finishedAt=999;reject(r);r=result();r.finishedAt=1001;reject(r);
        r=result();r.resultSequence=2;reject(r);r=result();r.signerEpoch=2;reject(r);r=result();r.expiresAt=999;reject(r);
    }
    function testSignatureIsBoundToChainAndContract() public {PaidDuelEscrow.Result memory r=result();bytes memory sig=sign(r);vm.chainId(10143);vm.expectRevert();escrow.submitResult(r,sig);}
    function testFuzzWithdrawalOrderPreservesSolvency(bool winnerFirst) public {complete();address first=winnerFirst?players[0]:treasury;address second=winnerFirst?treasury:players[0];escrow.withdrawFor(ID,first);PaidDuelEscrow.Duel memory d=escrow.getDuel(ID);require(d.reserved+d.paid==2_000_000 && d.reserved==token.balanceOf(address(escrow)));escrow.withdrawFor(ID,second);require(escrow.getDuel(ID).reserved==0);}
    function testFuzzUnauthorizedRecipientHasNoCredit(uint160 raw) public {address recipient=address(raw);if(recipient==players[0]||recipient==treasury)return;complete();vm.expectRevert();escrow.withdrawFor(ID,recipient);require(token.balanceOf(address(escrow))==2_000_000);}
}
