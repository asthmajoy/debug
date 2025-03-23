// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title MyProxy
 * @dev Simple proxy wrapper around ERC1967Proxy. This fixes the constructor parameter names.
 */
contract MyProxy is ERC1967Proxy {
    /**
     * @dev Initializes an upgradeable proxy managed by an implementation contract.
     * @param logic The address of the implementation contract
     * @param data The calldata that gets delegated to the implementation upon initialization
     */
    constructor(address logic, bytes memory data) 
        ERC1967Proxy(logic, data)
    {}
}