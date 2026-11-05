// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SelfReportedRegistry.sol";
import "./DocumentRegistryTemplate.sol";
import "./IssuerRegistry.sol";

/// @title CredentialRegistry
/// @notice Holds links only — "this self-reported credential belongs to
///         that degree" — never credential data itself. A link is only
///         ever created by the holder's own transaction (msg.sender), so
///         no signature verification is needed; it just has to check the
///         caller actually holds BOTH records being connected.
contract CredentialRegistry {
    struct Link {
        address parentRegistry;
        bytes32 parentDocId;
        address holder;
        uint256 linkedAt;
    }

    SelfReportedRegistry public selfReportedRegistry;
    IssuerRegistry public issuerRegistry;
    mapping(bytes32 => Link) private links;

    event CredentialLinked(
        bytes32 indexed childDocId,
        address indexed parentRegistry,
        bytes32 parentDocId,
        address indexed holder,
        uint256 timestamp
    );

    constructor(address _selfReportedRegistry, address _issuerRegistry) {
        require(_selfReportedRegistry != address(0), "Invalid self-reported registry");
        require(_issuerRegistry != address(0), "Invalid issuer registry");
        selfReportedRegistry = SelfReportedRegistry(_selfReportedRegistry);
        issuerRegistry = IssuerRegistry(_issuerRegistry);
    }

    /// @param childDocId  the self-reported entry being linked
    /// @param parentRegistry  the issuer's DocumentRegistryTemplate holding the degree
    /// @param parentDocId  the degree record within that registry
    function linkCredential(bytes32 childDocId, address parentRegistry, bytes32 parentDocId) external {
        require(links[childDocId].linkedAt == 0, "Already linked");
        require(selfReportedRegistry.holderOf(childDocId) == msg.sender, "Not holder of credential");

        DocumentRegistryTemplate parent = DocumentRegistryTemplate(parentRegistry);
        require(issuerRegistry.isIssuer(parent.owner()), "Parent registry is not an approved issuer");
        require(parent.holderOf(parentDocId) == msg.sender, "Not holder of parent degree");

        links[childDocId] = Link({
            parentRegistry: parentRegistry,
            parentDocId: parentDocId,
            holder: msg.sender,
            linkedAt: block.timestamp
        });

        emit CredentialLinked(childDocId, parentRegistry, parentDocId, msg.sender, block.timestamp);
    }

    function getLink(bytes32 childDocId) external view returns (address parentRegistry, bytes32 parentDocId, address holder) {
        Link memory link = links[childDocId];
        return (link.parentRegistry, link.parentDocId, link.holder);
    }
}
