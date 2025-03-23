// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockERC20
 * @notice Simple ERC20 token for testing ERC20 rescue functionality
 */
contract MockERC20 is ERC20, Ownable {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
    
    /**
     * @notice Mint tokens to an address
     * @param to The address to mint tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    /**
     * @notice Burn tokens from an address (for governance purposes)
     * @param from The address to burn tokens from
     * @param amount The amount of tokens to burn
     * @return success Always returns true
     */
    function governanceBurn(address from, uint256 amount) external onlyOwner returns (bool) {
        _burn(from, amount);
        return true;
    }
}