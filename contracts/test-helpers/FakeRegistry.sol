// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev PoC only — not part of the real system. Mimics DocumentRegistryTemplate's
///      owner()/holderOf() interface but lies about both, to test whether
///      CredentialRegistry actually verifies parentRegistry is a genuine
///      factory-deployed registry (it does not, as of this writing).
contract FakeRegistry {
    address public fakeOwner;
    address public fakeHolder;

    constructor(address _fakeOwner, address _fakeHolder) {
        fakeOwner = _fakeOwner;
        fakeHolder = _fakeHolder;
    }

    function owner() external view returns (address) {
        return fakeOwner;
    }

    function holderOf(bytes32) external view returns (address) {
        return fakeHolder;
    }
}
