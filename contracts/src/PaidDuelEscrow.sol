// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Equal-entry test-token duel. Gameplay truth is trusted to the locked server signer.
/// @dev Non-upgradeable. No admin withdrawal; cancellation/Void creates full entry credits.
contract PaidDuelEscrow is EIP712, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    uint256 public constant ENTRY = 1_000_000;
    uint256 public constant POOL = 2_000_000;
    bytes32 public constant RESULT_TYPEHASH = keccak256("Result(bytes32 duelId,bytes32 matchId,address participantA,address participantB,address winnerRecipient,uint8 outcomeType,bytes32 rulesetHash,bytes32 replayHash,uint64 finishedAt,uint32 resultSequence,uint32 signerEpoch,uint64 expiresAt)");
    IERC20 public immutable token;
    address public immutable relay;
    address public immutable treasury;
    uint16 public immutable feeBps;
    address public nextSigner;
    uint32 public nextSignerEpoch = 1;
    enum State { None, Funding, Active, Complete, Cancelled }
    struct Duel {
        State state;
        address[2] players;
        address signer;
        uint32 signerEpoch;
        uint8 fundedMask;
        uint64 fundingDeadline;
        uint64 lockedAt;
        uint64 playDeadline;
        uint64 settlementDeadline;
        bytes32 rulesetHash;
        uint256 reserved;
        uint256 paid;
    }
    struct Result {
        bytes32 duelId;
        bytes32 matchId;
        address participantA;
        address participantB;
        address winnerRecipient;
        uint8 outcomeType; // 0 Finished, 1 Forfeit, 2 Void
        bytes32 rulesetHash;
        bytes32 replayHash;
        uint64 finishedAt;
        uint32 resultSequence;
        uint32 signerEpoch;
        uint64 expiresAt;
    }
    mapping(bytes32 => Duel) private duels;
    mapping(bytes32 => mapping(address => uint256)) public credits;
    event DuelCreated(bytes32 indexed duelId, address[2] players, bytes32 rulesetHash, uint64 fundingDeadline);
    event DuelFunded(bytes32 indexed duelId, address indexed player, uint256 amount, uint8 fundedMask);
    event DuelActivated(bytes32 indexed duelId, uint64 playDeadline, uint64 settlementDeadline);
    event DuelSettled(bytes32 indexed duelId, address winner, uint8 outcomeType, bytes32 replayHash);
    event DuelCancelled(bytes32 indexed duelId, uint8 reason);
    event CreditAwarded(bytes32 indexed duelId, address indexed recipient, uint256 amount);
    event Paid(bytes32 indexed duelId, address indexed recipient, uint256 amount, address token);

    constructor(IERC20 token_, address signer_, address relay_, address treasury_, uint16 feeBps_, address owner_)
        EIP712("CHOG Paid Duel", "1") Ownable(owner_)
    {
        require(address(token_).code.length>0 && signer_!=address(0) && relay_!=address(0) && treasury_!=address(0),"invalid role or token");
        require(feeBps_<=1000,"fee exceeds ten percent");
        (bool ok,bytes memory value)=address(token_).staticcall(abi.encodeWithSignature("decimals()"));
        require(ok && value.length>=32 && abi.decode(value,(uint256))==6,"six-decimal token required");
        token=token_;nextSigner=signer_;relay=relay_;treasury=treasury_;feeBps=feeBps_;
    }
    function getDuel(bytes32 id) external view returns(Duel memory){return duels[id];}
    function matchId(bytes32 id) public pure returns(bytes32){return keccak256(abi.encode(id,uint8(0)));}
    function createDuel(bytes32 id,address[2] calldata players,bytes32 rulesetHash) external whenNotPaused {
        require(msg.sender==relay,"only relay creates duels");
        require(id!=bytes32(0) && rulesetHash!=bytes32(0) && duels[id].state==State.None,"invalid or duplicate duel");
        require(players[0]!=address(0) && players[1]!=address(0) && players[0]!=players[1],"two distinct players required");
        Duel storage d=duels[id];d.state=State.Funding;d.players=players;d.rulesetHash=rulesetHash;
        d.signer=nextSigner;d.signerEpoch=nextSignerEpoch;d.fundingDeadline=uint64(block.timestamp+15 minutes);
        emit DuelCreated(id,players,rulesetHash,d.fundingDeadline);
    }
    function fundDuel(bytes32 id) external nonReentrant whenNotPaused {
        Duel storage d=duels[id];require(d.state==State.Funding && block.timestamp<=d.fundingDeadline,"funding closed");
        uint8 bit=msg.sender==d.players[0]?1:msg.sender==d.players[1]?2:0;
        require(bit!=0 && d.fundedMask & bit==0,"ineligible or already funded");
        uint256 beforeBalance=token.balanceOf(address(this));token.safeTransferFrom(msg.sender,address(this),ENTRY);
        require(token.balanceOf(address(this))==beforeBalance+ENTRY,"unsupported token transfer");
        d.fundedMask|=bit;d.reserved+=ENTRY;emit DuelFunded(id,msg.sender,ENTRY,d.fundedMask);
    }
    function activateDuel(bytes32 id) external whenNotPaused {
        Duel storage d=duels[id];require(msg.sender==relay && d.state==State.Funding && d.fundedMask==3 && block.timestamp<=d.fundingDeadline,"duel not fully funded");
        d.state=State.Active;d.lockedAt=uint64(block.timestamp);d.playDeadline=uint64(block.timestamp+60 minutes);d.settlementDeadline=uint64(block.timestamp+75 minutes);
        emit DuelActivated(id,d.playDeadline,d.settlementDeadline);
    }
    function hashResult(Result calldata r) public view returns(bytes32){
        return _hashTypedDataV4(keccak256(abi.encode(RESULT_TYPEHASH,r.duelId,r.matchId,r.participantA,r.participantB,r.winnerRecipient,r.outcomeType,r.rulesetHash,r.replayHash,r.finishedAt,r.resultSequence,r.signerEpoch,r.expiresAt)));
    }
    function submitResult(Result calldata r,bytes calldata signature) external whenNotPaused {
        Duel storage d=duels[r.duelId];require(d.state==State.Active,"duel not active");
        require(r.matchId==matchId(r.duelId) && r.resultSequence==1,"wrong match or sequence");
        require(r.participantA==d.players[0] && r.participantB==d.players[1] && r.rulesetHash==d.rulesetHash && r.signerEpoch==d.signerEpoch,"result terms mismatch");
        require(r.outcomeType<=2 && r.replayHash!=bytes32(0),"invalid outcome");
        require(r.finishedAt>=d.lockedAt && r.finishedAt<=d.playDeadline && r.finishedAt<=block.timestamp,"invalid finish time");
        require(block.timestamp<=d.settlementDeadline && block.timestamp<=r.expiresAt && r.expiresAt<=d.settlementDeadline,"result expired");
        require(ECDSA.recover(hashResult(r),signature)==d.signer,"unauthorized signer");
        if(r.outcomeType==2){require(r.winnerRecipient==address(0),"Void has no winner");_cancel(r.duelId,d,1);}
        else {
            require(r.winnerRecipient==d.players[0] || r.winnerRecipient==d.players[1],"ineligible winner");
            d.state=State.Complete;uint256 fee=POOL*feeBps/10000;
            _credit(r.duelId,r.winnerRecipient,POOL-fee);if(fee>0)_credit(r.duelId,treasury,fee);
        }
        emit DuelSettled(r.duelId,r.winnerRecipient,r.outcomeType,r.replayHash);
    }
    function cancelBeforeStart(bytes32 id) external {
        Duel storage d=duels[id];require(d.state==State.Funding && (msg.sender==d.players[0] || msg.sender==d.players[1] || msg.sender==relay),"cannot cancel");_cancel(id,d,0);
    }
    function refundExpired(bytes32 id) external {
        Duel storage d=duels[id];require((d.state==State.Funding && block.timestamp>d.fundingDeadline) || (d.state==State.Active && block.timestamp>d.settlementDeadline),"refund not available");_cancel(id,d,2);
    }
    function _cancel(bytes32 id,Duel storage d,uint8 reason) private {
        d.state=State.Cancelled;for(uint8 i=0;i<2;i++)if(d.fundedMask & uint8(1<<i)!=0)_credit(id,d.players[i],ENTRY);emit DuelCancelled(id,reason);
    }
    function _credit(bytes32 id,address recipient,uint256 amount) private {credits[id][recipient]+=amount;emit CreditAwarded(id,recipient,amount);}
    function withdrawFor(bytes32 id,address recipient) external nonReentrant {
        uint256 amount=credits[id][recipient];require(amount>0,"no credit");credits[id][recipient]=0;
        Duel storage d=duels[id];d.reserved-=amount;d.paid+=amount;token.safeTransfer(recipient,amount);emit Paid(id,recipient,amount,address(token));
    }
    function setNextSigner(address signer) external onlyOwner {require(signer!=address(0),"zero signer");nextSigner=signer;nextSignerEpoch++;}
    function pauseResults() external onlyOwner {_pause();}
    function unpauseResults() external onlyOwner {_unpause();}
}
