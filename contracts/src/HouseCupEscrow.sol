// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Finite, sponsor-funded four-player Cup. The locked signer is trusted for gameplay truth.
/// @dev Non-upgradeable. No admin withdrawal. Existing credits/refunds survive result pauses.
contract HouseCupEscrow is EIP712, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    uint256 public constant POOL = 100_000_000;
    uint256 public constant CHAMPION_AWARD = 70_000_000;
    uint256 public constant RUNNER_UP_AWARD = 30_000_000;
    bytes32 public constant RESULT_TYPEHASH = keccak256("Result(bytes32 cupId,bytes32 matchId,uint8 stage,address participantA,address participantB,address winnerRecipient,uint8 outcomeType,bytes32 rulesetHash,bytes32 replayHash,uint64 finishedAt,uint32 resultSequence,uint32 signerEpoch,uint64 expiresAt)");
    IERC20 public immutable token;
    address public immutable relay;
    address public nextSigner;
    uint32 public nextSignerEpoch = 1;
    enum State { None, Funded, Active, Complete, Cancelled }
    struct Cup {
        State state;
        address sponsor;
        address host;
        address signer;
        uint32 signerEpoch;
        uint64 lockedAt;
        uint64 playDeadline;
        uint64 settlementDeadline;
        uint8 consumed;
        bytes32 rulesetHash;
        address[4] participants;
        address[2] semifinalWinners;
        uint256 reserved;
        uint256 paid;
    }
    struct Result {
        bytes32 cupId;
        bytes32 matchId;
        uint8 stage;
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
    mapping(bytes32 => Cup) private cups;
    mapping(bytes32 => mapping(address => uint256)) public credits;
    event CupFunded(bytes32 indexed cupId, address indexed sponsor, address host, uint256 amount);
    event CupLocked(bytes32 indexed cupId, address[4] participants, bytes32 rulesetHash, uint64 playDeadline, uint64 settlementDeadline);
    event MatchAccepted(bytes32 indexed cupId, uint8 indexed stage, address winner, uint8 outcomeType, bytes32 replayHash);
    event CupCompleted(bytes32 indexed cupId, address champion, address runnerUp);
    event CreditAwarded(bytes32 indexed cupId, address indexed recipient, uint256 amount);
    event CupCancelled(bytes32 indexed cupId, address sponsor);
    event Paid(bytes32 indexed cupId, address indexed recipient, uint256 amount, address token);

    constructor(IERC20 token_, address signer_, address relay_, address owner_) EIP712("CHOG House Cup", "1") Ownable(owner_) {
        require(address(token_) != address(0) && signer_ != address(0) && relay_ != address(0), "zero address");
        require(address(token_).code.length > 0, "token has no code");
        (bool ok, bytes memory value) = address(token_).staticcall(abi.encodeWithSignature("decimals()"));
        require(ok && value.length >= 32 && abi.decode(value,(uint256)) == 6, "six-decimal token required");
        token = token_; nextSigner = signer_; relay = relay_;
    }
    function getCup(bytes32 id) external view returns (Cup memory) { return cups[id]; }
    function matchId(bytes32 id, uint8 stage) public pure returns (bytes32) { return keccak256(abi.encode(id,stage)); }
    function createFundedCup(bytes32 id, address host, bytes32 rulesetHash) external nonReentrant whenNotPaused {
        require(id != bytes32(0) && host != address(0) && rulesetHash != bytes32(0), "invalid Cup");
        require(cups[id].state == State.None, "Cup already exists");
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender,address(this),POOL);
        require(token.balanceOf(address(this)) == beforeBalance + POOL, "unsupported token transfer");
        Cup storage c = cups[id]; c.state = State.Funded; c.sponsor = msg.sender; c.host = host; c.rulesetHash = rulesetHash; c.reserved = POOL;
        emit CupFunded(id,msg.sender,host,POOL);
    }
    function lockCup(bytes32 id, address[4] calldata participants) external whenNotPaused {
        Cup storage c = cups[id]; require(c.state == State.Funded,"Cup not funded");
        require(msg.sender == c.sponsor || msg.sender == relay,"lock not authorized");
        for(uint256 i=0;i<4;i++) { require(participants[i] != address(0),"zero recipient"); for(uint256 j=0;j<i;j++)require(participants[i]!=participants[j],"duplicate recipient"); }
        c.participants = participants; c.signer = nextSigner; c.signerEpoch = nextSignerEpoch;
        c.lockedAt = uint64(block.timestamp); c.playDeadline = uint64(block.timestamp + 60 minutes); c.settlementDeadline = uint64(block.timestamp + 75 minutes); c.state = State.Active;
        emit CupLocked(id,participants,c.rulesetHash,c.playDeadline,c.settlementDeadline);
    }
    function hashResult(Result calldata r) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(RESULT_TYPEHASH,r.cupId,r.matchId,r.stage,r.participantA,r.participantB,r.winnerRecipient,r.outcomeType,r.rulesetHash,r.replayHash,r.finishedAt,r.resultSequence,r.signerEpoch,r.expiresAt)));
    }
    function submitResult(Result calldata r, bytes calldata signature) external whenNotPaused {
        Cup storage c = cups[r.cupId]; require(c.state==State.Active,"Cup not active");
        require(r.stage<3 && r.matchId==matchId(r.cupId,r.stage),"wrong match slot");
        uint8 bit=uint8(1<<r.stage);require(c.consumed & bit == 0,"result consumed");
        require(r.rulesetHash==c.rulesetHash && r.signerEpoch==c.signerEpoch && r.resultSequence==1,"result terms mismatch");
        require(r.outcomeType<=2 && r.replayHash!=bytes32(0),"invalid outcome");
        require(r.finishedAt>=c.lockedAt && r.finishedAt<=c.playDeadline && r.finishedAt<=block.timestamp,"invalid finish time");
        require(block.timestamp<=c.settlementDeadline && block.timestamp<=r.expiresAt && r.expiresAt<=c.settlementDeadline,"result expired");
        address a;address b;
        if(r.stage<2){a=c.participants[r.stage*2];b=c.participants[r.stage*2+1];}
        else {require(c.consumed & 3 == 3,"semifinals incomplete");a=c.semifinalWinners[0];b=c.semifinalWinners[1];}
        require(r.participantA==a && r.participantB==b,"wrong participants");
        require(ECDSA.recover(hashResult(r),signature)==c.signer,"unauthorized signer");
        c.consumed |= bit;
        if(r.outcomeType==2){require(r.winnerRecipient==address(0),"Void has no winner");_cancel(r.cupId,c);}
        else {
            require(r.winnerRecipient==a || r.winnerRecipient==b,"ineligible winner");
            if(r.stage<2)c.semifinalWinners[r.stage]=r.winnerRecipient;
            else {c.state=State.Complete;address loser=r.winnerRecipient==a?b:a;credits[r.cupId][r.winnerRecipient]=CHAMPION_AWARD;credits[r.cupId][loser]=RUNNER_UP_AWARD;emit CreditAwarded(r.cupId,r.winnerRecipient,CHAMPION_AWARD);emit CreditAwarded(r.cupId,loser,RUNNER_UP_AWARD);emit CupCompleted(r.cupId,r.winnerRecipient,loser);}
        }
        emit MatchAccepted(r.cupId,r.stage,r.winnerRecipient,r.outcomeType,r.replayHash);
    }
    function cancelBeforeLock(bytes32 id) external {Cup storage c=cups[id];require(c.state==State.Funded && msg.sender==c.sponsor,"cannot cancel");_cancel(id,c);}
    function refundExpired(bytes32 id) external {Cup storage c=cups[id];require(c.state==State.Active && block.timestamp>c.settlementDeadline,"refund not available");_cancel(id,c);}
    function _cancel(bytes32 id,Cup storage c) private {c.state=State.Cancelled;credits[id][c.sponsor]=POOL;emit CreditAwarded(id,c.sponsor,POOL);emit CupCancelled(id,c.sponsor);}
    function withdrawFor(bytes32 id,address recipient) external nonReentrant {
        uint256 amount=credits[id][recipient];require(amount>0,"no credit");
        credits[id][recipient]=0;Cup storage c=cups[id];c.reserved-=amount;c.paid+=amount;
        token.safeTransfer(recipient,amount);emit Paid(id,recipient,amount,address(token));
    }
    function setNextSigner(address signer) external onlyOwner {require(signer!=address(0),"zero signer");nextSigner=signer;nextSignerEpoch++;}
    function pauseResults() external onlyOwner {_pause();}
    function unpauseResults() external onlyOwner {_unpause();}
}
