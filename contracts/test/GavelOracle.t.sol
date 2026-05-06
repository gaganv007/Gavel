// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GavelOracle} from "../src/GavelOracle.sol";

contract GavelOracleTest is Test {
    GavelOracle oracle;
    address signer = address(0xBEEF);
    address randomUser = address(0xCAFE);

    function setUp() public {
        oracle = new GavelOracle(signer);
    }

    function test_postVerdict_byOracle() public {
        bytes32 q = keccak256("did Trump win 2024");
        bytes32 ev = keccak256("evidence blob");

        vm.prank(signer);
        oracle.postVerdict(q, GavelOracle.VerdictKind.YES, 9800, ev);

        (
            GavelOracle.VerdictKind kind,
            uint16 confidence,
            bytes32 evHash,
            uint64 resolvedAt,
            address postedBy
        ) = oracle.verdicts(q);

        assertEq(uint(kind), uint(GavelOracle.VerdictKind.YES));
        assertEq(confidence, 9800);
        assertEq(evHash, ev);
        assertGt(resolvedAt, 0);
        assertEq(postedBy, signer);
    }

    function test_revert_whenNotSigner() public {
        bytes32 q = keccak256("q");
        vm.prank(randomUser);
        vm.expectRevert(GavelOracle.NotOracleSigner.selector);
        oracle.postVerdict(q, GavelOracle.VerdictKind.YES, 9000, bytes32(0));
    }

    function test_revert_whenAlreadyResolved() public {
        bytes32 q = keccak256("q");
        vm.startPrank(signer);
        oracle.postVerdict(q, GavelOracle.VerdictKind.YES, 9000, bytes32(0));
        vm.expectRevert(GavelOracle.AlreadyResolved.selector);
        oracle.postVerdict(q, GavelOracle.VerdictKind.NO, 5000, bytes32(0));
        vm.stopPrank();
    }

    function test_isResolved() public {
        bytes32 q = keccak256("q");
        assertFalse(oracle.isResolved(q));
        vm.prank(signer);
        oracle.postVerdict(q, GavelOracle.VerdictKind.NO, 7500, bytes32(0));
        assertTrue(oracle.isResolved(q));
    }
}
