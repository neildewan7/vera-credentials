// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IRevocationRegistry.sol";

contract DocumentRegistryTemplate {
    enum Status {
        Unknown,
        Active,
        Revoked
    }

    struct Document {
        bytes32 docHash;
        address issuer;
        address holder;
        uint256 issuedAt;
        string uri;
    }

    address public owner;
    address public revocationRegistry;
    mapping(bytes32 => Document) private documents;

    event DocumentRegistered(bytes32 indexed docId, bytes32 indexed docHash, address indexed issuer, address holder, string uri, uint256 timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address initialOwner, address _revocationRegistry) {
        require(initialOwner != address(0), "Invalid owner");
        owner = initialOwner;
        revocationRegistry = _revocationRegistry;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function registerDocument(bytes32 docId, bytes32 docHash, string calldata uri, address holder) external onlyOwner {
        require(documents[docId].issuedAt == 0, "Document exists");
        require(docHash != bytes32(0), "Invalid hash");
        require(holder != address(0), "Invalid holder");

        documents[docId] = Document({
            docHash: docHash,
            issuer: msg.sender,
            holder: holder,
            issuedAt: block.timestamp,
            uri: uri
        });

        // Mirror-register on the paired revocation registry
        if (revocationRegistry != address(0)) {
            IRevocationRegistry(revocationRegistry).register(docHash);
        }

        emit DocumentRegistered(docId, docHash, msg.sender, holder, uri, block.timestamp);
    }

    function verifyDocument(bytes32 docId, bytes32 docHash) external view returns (bool) {
        Document memory doc = documents[docId];
        return doc.issuedAt != 0 && doc.docHash == docHash;
    }

    /// @notice Who a given record belongs to. Used by CredentialRegistry to
    ///         confirm a caller linking a credential actually holds the
    ///         degree they're linking it to.
    function holderOf(bytes32 docId) external view returns (address) {
        return documents[docId].holder;
    }

    /// @notice Returns Active/Revoked/Unknown by also consulting the paired
    ///         revocation registry, unlike verifyDocument() above.
    function verify(bytes32 docId, bytes32 docHash) external view returns (Status) {
        Document memory doc = documents[docId];
        if (doc.issuedAt == 0 || doc.docHash != docHash) {
            return Status.Unknown;
        }
        if (revocationRegistry != address(0) && !IRevocationRegistry(revocationRegistry).isValid(doc.docHash)) {
            return Status.Revoked;
        }
        return Status.Active;
    }
}
