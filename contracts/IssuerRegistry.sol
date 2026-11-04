// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IssuerRegistry
/// @notice Owner-controlled allowlist of addresses trusted to issue
///         credentials. Used to decide what counts as "verified" rather
///         than to gate who may write to the chain at all.
contract IssuerRegistry {
    address public owner;
    mapping(address => bool) private issuers;

    event IssuerAdded(address indexed issuer);
    event IssuerRemoved(address indexed issuer);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addIssuer(address issuer) external onlyOwner {
        require(issuer != address(0), "Invalid issuer");
        issuers[issuer] = true;
        emit IssuerAdded(issuer);
    }

    function removeIssuer(address issuer) external onlyOwner {
        issuers[issuer] = false;
        emit IssuerRemoved(issuer);
    }

    function isIssuer(address issuer) external view returns (bool) {
        return issuers[issuer];
    }
}
