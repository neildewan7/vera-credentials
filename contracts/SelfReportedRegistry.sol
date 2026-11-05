// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RevocationRegistry.sol";

/// @title SelfReportedRegistry
/// @notice A single shared registry any wallet can write into directly, with
///         no issuer approval required. The registrant is always the holder
///         — this contract proves a file wasn't altered after they added it,
///         never that any external issuer actually issued it.
contract SelfReportedRegistry {
    enum Status {
        Unknown,
        Active,
        Revoked
    }

    struct Entry {
        bytes32 docHash;
        address holder;
        uint256 registeredAt;
        string uri;
    }

    RevocationRegistry public revocationRegistry;
    mapping(bytes32 => Entry) private entries;

    event EntryRegistered(bytes32 indexed docId, bytes32 indexed docHash, address indexed holder, string uri, uint256 timestamp);

    constructor() {
        revocationRegistry = new RevocationRegistry(address(this));
        revocationRegistry.setVerificationContract(address(this));
    }

    function register(bytes32 docId, bytes32 docHash, string calldata uri) external {
        require(entries[docId].registeredAt == 0, "Entry exists");
        require(docHash != bytes32(0), "Invalid hash");

        entries[docId] = Entry({
            docHash: docHash,
            holder: msg.sender,
            registeredAt: block.timestamp,
            uri: uri
        });

        revocationRegistry.register(docHash);

        emit EntryRegistered(docId, docHash, msg.sender, uri, block.timestamp);
    }

    /// @notice Lets the original holder pull back their own entry. No one
    ///         else — not even this contract's deployer — can revoke it.
    function revokeMine(bytes32 docId, RevocationRegistry.RevocationReason reason) external {
        Entry memory entry = entries[docId];
        require(entry.registeredAt != 0, "Entry does not exist");
        require(entry.holder == msg.sender, "Not your entry");
        revocationRegistry.revoke(entry.docHash, reason);
    }

    function holderOf(bytes32 docId) external view returns (address) {
        return entries[docId].holder;
    }

    function verify(bytes32 docId, bytes32 docHash) external view returns (Status) {
        Entry memory entry = entries[docId];
        if (entry.registeredAt == 0 || entry.docHash != docHash) {
            return Status.Unknown;
        }
        if (!revocationRegistry.isValid(entry.docHash)) {
            return Status.Revoked;
        }
        return Status.Active;
    }
}
