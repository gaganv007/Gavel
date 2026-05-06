// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GavelOracle
/// @notice On-chain settlement layer for Gavel — the AI oracle that calls it.
/// @dev    Stores verdicts signed by a trusted off-chain agent. Prediction markets
///         read from this contract to settle their pools.
contract GavelOracle {
    enum VerdictKind {
        UNRESOLVED, // 0
        YES,        // 1
        NO          // 2
    }

    struct Verdict {
        VerdictKind kind;
        uint16 confidenceBps;   // 0-10000 (basis points; 10000 = 100%)
        bytes32 evidenceHash;   // keccak256 of agent reasoning + sources
        uint64 resolvedAt;      // block.timestamp when posted
        address postedBy;
    }

    address public immutable oracleSigner;
    mapping(bytes32 => Verdict) public verdicts;

    event VerdictResolved(
        bytes32 indexed questionHash,
        VerdictKind kind,
        uint16 confidenceBps,
        bytes32 evidenceHash,
        uint64 resolvedAt
    );

    error NotOracleSigner();
    error AlreadyResolved();
    error InvalidConfidence();

    constructor(address _oracleSigner) {
        require(_oracleSigner != address(0), "zero signer");
        oracleSigner = _oracleSigner;
    }

    function postVerdict(
        bytes32 questionHash,
        VerdictKind kind,
        uint16 confidenceBps,
        bytes32 evidenceHash
    ) external {
        if (msg.sender != oracleSigner) revert NotOracleSigner();
        if (verdicts[questionHash].resolvedAt != 0) revert AlreadyResolved();
        if (confidenceBps > 10000) revert InvalidConfidence();

        verdicts[questionHash] = Verdict({
            kind: kind,
            confidenceBps: confidenceBps,
            evidenceHash: evidenceHash,
            resolvedAt: uint64(block.timestamp),
            postedBy: msg.sender
        });

        emit VerdictResolved(
            questionHash,
            kind,
            confidenceBps,
            evidenceHash,
            uint64(block.timestamp)
        );
    }

    function isResolved(bytes32 questionHash) external view returns (bool) {
        return verdicts[questionHash].resolvedAt != 0;
    }

    function hashQuestion(string calldata question) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(question));
    }
}