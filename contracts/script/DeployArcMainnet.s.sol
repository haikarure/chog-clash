// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PaidDuelEscrow} from "../src/PaidDuelEscrow.sol";
import {HouseCupEscrow} from "../src/HouseCupEscrow.sol";

interface VmArcDeployment {
    function envAddress(string calldata name) external view returns (address);
    function envOr(string calldata name, uint256 defaultValue) external view returns (uint256);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(address deployer) external;
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploy both CHOG escrows with canonical USDC on Circle's Arc mainnet.
/// @dev Supports a local .env private key, keystore or hardware wallet; never logs keys.
contract DeployArcMainnet {
    VmArcDeployment private constant vm = VmArcDeployment(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 public constant CHAIN_ID = 5042;
    address public constant USDC = 0x3600000000000000000000000000000000000000;

    struct Config {
        address owner;
        address resultSigner;
        address relay;
        address treasury;
        uint256 feeBps;
    }

    event EscrowsDeployed(address indexed paidDuel, address indexed houseCup, address token, address owner);

    function readDeployerAddress() public view virtual returns (address) {
        return vm.envAddress("ARC_DEPLOYER_ADDRESS");
    }

    function readDeployerPrivateKey() internal view virtual returns (uint256) {
        return vm.envOr("ARC_DEPLOYER_PRIVATE_KEY", uint256(0));
    }

    function readConfig() public view virtual returns (Config memory) {
        return Config({
            owner: vm.envAddress("ARC_OWNER_ADDRESS"),
            resultSigner: vm.envAddress("ARC_RESULT_SIGNER_ADDRESS"),
            relay: vm.envAddress("ARC_RELAY_ADDRESS"),
            treasury: vm.envAddress("ARC_TREASURY_ADDRESS"),
            feeBps: vm.envOr("ARC_DUEL_FEE_BPS", uint256(500))
        });
    }

    function validateConfig(Config memory config) public view {
        require(block.chainid == CHAIN_ID, "Arc mainnet chain 5042 required");
        require(
            config.owner != address(0) && config.resultSigner != address(0) && config.relay != address(0)
                && config.treasury != address(0),
            "nonzero roles required"
        );
        require(
            config.owner != config.resultSigner && config.owner != config.relay && config.resultSigner != config.relay,
            "owner, signer and relay must differ"
        );
        require(config.resultSigner.code.length == 0, "result signer must be an EOA");
        require(config.feeBps <= 1000, "fee exceeds ten percent");
        require(USDC.code.length > 0, "canonical USDC has no code");
        (bool ok, bytes memory value) = USDC.staticcall(abi.encodeWithSignature("decimals()"));
        require(ok && value.length >= 32 && abi.decode(value, (uint256)) == 6, "six-decimal USDC required");
    }

    function run() external returns (PaidDuelEscrow duel, HouseCupEscrow cup) {
        Config memory config = readConfig();
        validateConfig(config);
        address deployer = readDeployerAddress();
        require(deployer != address(0), "nonzero deployer required");
        uint256 privateKey = readDeployerPrivateKey();
        if (privateKey != 0) {
            require(vm.addr(privateKey) == deployer, "private key does not match deployer address");
            vm.startBroadcast(privateKey);
        } else {
            vm.startBroadcast(deployer);
        }
        duel = new PaidDuelEscrow(
            IERC20(USDC), config.resultSigner, config.relay, config.treasury, uint16(config.feeBps), config.owner
        );
        cup = new HouseCupEscrow(IERC20(USDC), config.resultSigner, config.relay, config.owner);
        vm.stopBroadcast();
        emit EscrowsDeployed(address(duel), address(cup), USDC, config.owner);
    }
}
