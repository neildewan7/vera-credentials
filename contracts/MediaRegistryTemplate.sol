// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IRevocationRegistry.sol";

contract MediaRegistryTemplate {
    enum Status {
        Unknown,
        Active,
        Revoked
    }

    struct Media {
        bytes32 mediaHash;
        address issuer;
        address holder;
        uint256 createdAt;
        string uri;
    }

    address public owner;
    address public revocationRegistry;
    mapping(bytes32 => Media) private mediaRecords;

    event MediaRegistered(bytes32 indexed mediaId, bytes32 indexed mediaHash, address indexed issuer, address holder, string uri, uint256 timestamp);
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

    function registerMedia(bytes32 mediaId, bytes32 mediaHash, string calldata uri, address holder) external onlyOwner {
        require(mediaRecords[mediaId].createdAt == 0, "Media exists");
        require(mediaHash != bytes32(0), "Invalid hash");
        require(holder != address(0), "Invalid holder");

        mediaRecords[mediaId] = Media({
            mediaHash: mediaHash,
            issuer: msg.sender,
            holder: holder,
            createdAt: block.timestamp,
            uri: uri
        });

        // Mirror-register on the paired revocation registry
        if (revocationRegistry != address(0)) {
            IRevocationRegistry(revocationRegistry).register(mediaHash);
        }

        emit MediaRegistered(mediaId, mediaHash, msg.sender, holder, uri, block.timestamp);
    }

    /// @dev Ignores revocation — kept only for backward compatibility. Use verify() instead.
    function verifyImage(bytes32 mediaId, bytes32 mediaHash) external view returns (bool) {
        Media memory m = mediaRecords[mediaId];
        return m.createdAt != 0 && m.mediaHash == mediaHash;
    }

    function holderOf(bytes32 mediaId) external view returns (address) {
        return mediaRecords[mediaId].holder;
    }

    function verify(bytes32 mediaId, bytes32 mediaHash) external view returns (Status) {
        Media memory m = mediaRecords[mediaId];
        if (m.createdAt == 0 || m.mediaHash != mediaHash) {
            return Status.Unknown;
        }
        if (revocationRegistry != address(0) && !IRevocationRegistry(revocationRegistry).isValid(m.mediaHash)) {
            return Status.Revoked;
        }
        return Status.Active;
    }
}
