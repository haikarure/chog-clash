// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {DeployArcMainnet} from "../script/DeployArcMainnet.s.sol";
import {PaidDuelEscrow} from "../src/PaidDuelEscrow.sol";
import {HouseCupEscrow} from "../src/HouseCupEscrow.sol";
import {MockToken, WrongDecimalsToken} from "./HouseCupEscrow.t.sol";

interface VmArcTest {
    function chainId(uint256) external;
    function etch(address, bytes calldata) external;
    function expectRevert() external;
    function addr(uint256) external returns (address);
    function setEnv(string calldata, string calldata) external;
}

contract ArcDeploymentFixture is DeployArcMainnet {
    address private fixtureDeployer = address(0x1005);
    uint256 private fixturePrivateKey;

    function setCredentials(address deployer, uint256 privateKey) external {
        fixtureDeployer = deployer;
        fixturePrivateKey = privateKey;
    }

    function readDeployerAddress() public view override returns (address) {
        return fixtureDeployer;
    }

    function readDeployerPrivateKey() internal view override returns (uint256) {
        return fixturePrivateKey;
    }

    function readConfig() public pure override returns (Config memory) {
        return Config(address(0x1001), address(0x1002), address(0x1003), address(0x1004), 500);
    }
}

contract ArcEnvironmentProbe is DeployArcMainnet {
    function privateKeyIsUnset() external view returns (bool) {
        return readDeployerPrivateKey() == 0;
    }
}

/// @dev Standard EVM tests of deployment guards and terms, not a simulation of Arc's native runtime.
contract ArcMainnetDeploymentTest {
    VmArcTest private constant vm = VmArcTest(address(uint160(uint256(keccak256("hevm cheat code")))));
    ArcDeploymentFixture private script;

    function setUp() public {
        vm.chainId(5042);
        script = new ArcDeploymentFixture();
        vm.etch(script.USDC(), address(new MockToken()).code);
    }

    function testDeploysBothEscrowsWithCanonicalUSDCAndRoles() public {
        (PaidDuelEscrow duel, HouseCupEscrow cup) = script.run();
        DeployArcMainnet.Config memory config = script.readConfig();
        require(address(duel.token()) == script.USDC() && address(cup.token()) == script.USDC());
        require(duel.owner() == config.owner && cup.owner() == config.owner);
        require(duel.nextSigner() == config.resultSigner && cup.nextSigner() == config.resultSigner);
        require(duel.relay() == config.relay && cup.relay() == config.relay);
        require(duel.treasury() == config.treasury && duel.feeBps() == 500);
        require(duel.ENTRY() == 1_000_000 && duel.POOL() == 2_000_000);
        require(cup.POOL() == 100_000_000 && cup.CHAMPION_AWARD() == 70_000_000 && cup.RUNNER_UP_AWARD() == 30_000_000);
        (,,, uint256 duelChain, address duelVerifier,,) = duel.eip712Domain();
        (,,, uint256 cupChain, address cupVerifier,,) = cup.eip712Domain();
        require(duelChain == 5042 && cupChain == 5042);
        require(duelVerifier == address(duel) && cupVerifier == address(cup));
    }

    function testRejectsMonadAndArcTestnetBeforeBroadcast() public {
        vm.chainId(10143);
        vm.expectRevert();
        script.run();
        vm.chainId(5042002);
        vm.expectRevert();
        script.run();
    }

    function testRejectsMissingUSDCCode() public {
        vm.etch(script.USDC(), hex"");
        vm.expectRevert();
        script.run();
    }

    function testRejectsNative18DecimalAmountsAsTokenConfiguration() public {
        vm.etch(script.USDC(), address(new WrongDecimalsToken()).code);
        vm.expectRevert();
        script.run();
    }

    function testRejectsZeroAndSharedRoles() public {
        DeployArcMainnet.Config memory config = script.readConfig();
        config.treasury = address(0);
        vm.expectRevert();
        script.validateConfig(config);
        config = script.readConfig();
        config.resultSigner = config.owner;
        vm.expectRevert();
        script.validateConfig(config);
        config = script.readConfig();
        config.relay = config.resultSigner;
        vm.expectRevert();
        script.validateConfig(config);
    }

    function testRejectsContractResultSigner() public {
        DeployArcMainnet.Config memory config = script.readConfig();
        config.resultSigner = address(script);
        vm.expectRevert();
        script.validateConfig(config);
    }

    function testFeeBoundsBeforeNarrowingToUint16() public {
        DeployArcMainnet.Config memory config = script.readConfig();
        config.feeBps = 1000;
        script.validateConfig(config);
        config.feeBps = 1001;
        vm.expectRevert();
        script.validateConfig(config);
        config.feeBps = 65536;
        vm.expectRevert();
        script.validateConfig(config);
    }

    function testPrivateKeyDeploysFromMatchingDeployer() public {
        // Public test fixture key, never a production credential.
        script.setCredentials(vm.addr(1), 1);
        (PaidDuelEscrow duel, HouseCupEscrow cup) = script.run();
        require(duel.owner() == address(0x1001) && cup.owner() == address(0x1001));
    }

    function testPrivateKeyAddressMismatchRejectedBeforeBroadcast() public {
        script.setCredentials(address(0x1005), 1);
        vm.expectRevert();
        script.run();
    }

    function testZeroDeployerRejectedBeforeBroadcast() public {
        script.setCredentials(address(0), 0);
        vm.expectRevert();
        script.run();
    }

    function testBlankPrivateKeyUsesKeystorePath() public {
        vm.setEnv("ARC_DEPLOYER_PRIVATE_KEY", "");
        require(new ArcEnvironmentProbe().privateKeyIsUnset());
    }
}
