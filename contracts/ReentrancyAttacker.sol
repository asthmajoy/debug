// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function deposit() external payable;
    function rescueETH() external;
    function emergency(bool isPause, address tokenAddress) external;
    function burnTokens(uint256 amount) external;
    function delegate(address delegatee) external;
    function governanceTransfer(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function getDelegate(address account) external view returns (address);
    function createSnapshot() external returns (uint256);
    function mint(address to, uint256 amount) external;
}

/**
 * @title Enhanced ReentrancyAttacker
 * @notice More sophisticated attacker contract to test reentrancy vulnerabilities
 * in various functions of the JustTokenUpgradeable contract
 */
contract ReentrancyAttackerV3 {
    IToken public token;
    address public attacker;
    uint256 public attackCount;
    uint256 public successfulAttacks;
    bool public attackInProgress;
    
    // Tracking variables for analysis
    uint256 public initialBalance;
    uint256 public finalBalance;
    uint256 public initialETHBalance;
    uint256 public finalETHBalance;
    
    // Attack targets
    mapping(bytes4 => bool) public attackTargets;
    
    // Events for easier testing and debugging
    event AttackAttempted(string functionName, uint256 attemptCount);
    event ReentrancyDetected(string functionName, uint256 depth);
    event AttackCompleted(string functionName, bool successful, uint256 attempts);
    
    constructor(address _token) {
        token = IToken(_token);
        attacker = msg.sender;
        
        // Set up attack targets - function selectors we'll try to reenter
        attackTargets[bytes4(keccak256("transfer(address,uint256)"))] = true;
        attackTargets[bytes4(keccak256("deposit()"))] = true;
        attackTargets[bytes4(keccak256("rescueETH()"))] = true;
        attackTargets[bytes4(keccak256("burnTokens(uint256)"))] = true;
        attackTargets[bytes4(keccak256("delegate(address)"))] = true;
        attackTargets[bytes4(keccak256("governanceTransfer(address,address,uint256)"))] = true;
    }
    
    /**
     * @notice Attack the token transfer function
     * @param amount Amount of tokens to transfer in the attack
     */
    function attackTransfer(uint256 amount) external {
        require(!attackInProgress, "Attack already in progress");
        attackInProgress = true;
        attackCount = 0;
        successfulAttacks = 0;
        initialBalance = token.balanceOf(address(this));
        
        emit AttackAttempted("transfer", 1);
        // Initiate transfer to trigger potential reentrancy
        token.transfer(attacker, amount);
        
        finalBalance = token.balanceOf(address(this));
        attackInProgress = false;
        
        emit AttackCompleted("transfer", successfulAttacks > 0, attackCount);
    }
    
    /**
     * @notice Attack the deposit function
     */
    function attackDeposit() external payable {
        require(!attackInProgress, "Attack already in progress");
        attackInProgress = true;
        attackCount = 0;
        successfulAttacks = 0;
        initialETHBalance = address(this).balance - msg.value; // Subtract incoming ETH
        initialBalance = token.balanceOf(address(this));
        
        emit AttackAttempted("deposit", 1);
        // Make initial deposit to trigger potential reentrancy
        token.deposit{value: msg.value}();
        
        finalBalance = token.balanceOf(address(this));
        finalETHBalance = address(this).balance;
        attackInProgress = false;
        
        emit AttackCompleted("deposit", successfulAttacks > 0, attackCount);
    }
    
    /**
     * @notice Attack the rescueETH function
     * @dev This function needs admin rights on the token contract to succeed
     */
    function attackRescueETH() external {
        require(!attackInProgress, "Attack already in progress");
        attackInProgress = true;
        attackCount = 0;
        successfulAttacks = 0;
        initialETHBalance = address(this).balance;
        
        emit AttackAttempted("rescueETH", 1);
        // Try to trigger reentrancy through rescueETH
        try token.rescueETH() {
            // Success - unlikely unless this contract has admin role
        } catch {
            // Expected to fail due to lack of permissions
        }
        
        finalETHBalance = address(this).balance;
        attackInProgress = false;
        
        emit AttackCompleted("rescueETH", successfulAttacks > 0, attackCount);
    }
    
    /**
     * @notice Attack the burnTokens function
     * @param amount Amount of tokens to burn in the attack
     */
    function attackBurn(uint256 amount) external {
        require(!attackInProgress, "Attack already in progress");
        attackInProgress = true;
        attackCount = 0;
        successfulAttacks = 0;
        initialBalance = token.balanceOf(address(this));
        
        emit AttackAttempted("burnTokens", 1);
        // Try to burn tokens to trigger potential reentrancy
        token.burnTokens(amount);
        
        finalBalance = token.balanceOf(address(this));
        attackInProgress = false;
        
        emit AttackCompleted("burnTokens", successfulAttacks > 0, attackCount);
    }
    
    /**
     * @notice Attack the delegate function
     * @param delegatee Address to delegate to
     */
    function attackDelegate(address delegatee) external {
        require(!attackInProgress, "Attack already in progress");
        attackInProgress = true;
        attackCount = 0;
        successfulAttacks = 0;
        
        emit AttackAttempted("delegate", 1);
        // Try to delegate to trigger potential reentrancy
        token.delegate(delegatee);
        
        attackInProgress = false;
        emit AttackCompleted("delegate", successfulAttacks > 0, attackCount);
    }
    
    /**
     * @notice Attack the governanceTransfer function
     * @dev This function needs governance role on the token to succeed
     */
    function attackGovernanceTransfer(address from, address to, uint256 amount) external {
        require(!attackInProgress, "Attack already in progress");
        attackInProgress = true;
        attackCount = 0;
        successfulAttacks = 0;
        
        emit AttackAttempted("governanceTransfer", 1);
        // Try to use governance transfer to trigger potential reentrancy
        try token.governanceTransfer(from, to, amount) {
            // Success - unlikely unless this contract has governance role
        } catch {
            // Expected to fail due to lack of permissions
        }
        
        attackInProgress = false;
        emit AttackCompleted("governanceTransfer", successfulAttacks > 0, attackCount);
    }
    
    /**
     * @notice Multi-function attack to test several entry points simultaneously
     * @param amount Amount to use in the attack
     */
    function multiAttack(uint256 amount) external payable {
        require(!attackInProgress, "Attack already in progress");
        attackInProgress = true;
        attackCount = 0;
        successfulAttacks = 0;
        initialBalance = token.balanceOf(address(this));
        initialETHBalance = address(this).balance - msg.value;
        
        // Try multiple attack vectors
        if (msg.value > 0) {
            emit AttackAttempted("deposit", 1);
            token.deposit{value: msg.value}();
        }
        
        if (token.balanceOf(address(this)) >= amount) {
            emit AttackAttempted("transfer", 2);
            token.transfer(msg.sender, amount);
            
            emit AttackAttempted("burnTokens", 3);
            token.burnTokens(amount / 2);
        }
        
        emit AttackAttempted("delegate", 4);
        token.delegate(address(this));
        
        finalBalance = token.balanceOf(address(this));
        finalETHBalance = address(this).balance;
        attackInProgress = false;
        
        emit AttackCompleted("multiAttack", successfulAttacks > 0, attackCount);
    }
    
    /**
     * @notice Receive ETH and attempt reentrancy
     */
    receive() external payable {
        if (!attackInProgress) return; // Only attempt reentrancy during an attack
        
        attackCount++;
        emit ReentrancyDetected("receive", attackCount);
        
        // Only attempt reentrant calls for a limited number of times to avoid gas issues
        if (attackCount < 3) {
            successfulAttacks++;
            
            // Try to reenter various functions
            if (address(this).balance >= 0.01 ether) {
                try token.deposit{value: 0.01 ether}() {
                    // Successfully reentered deposit
                } catch {
                    // Reentrancy prevented - good!
                }
            }
            
            uint256 balance = token.balanceOf(address(this));
            if (balance > 100) {
                try token.transfer(attacker, 100) {
                    // Successfully reentered transfer
                } catch {
                    // Reentrancy prevented - good!
                }
            }
            
            if (balance > 50) {
                try token.burnTokens(50) {
                    // Successfully reentered burnTokens
                } catch {
                    // Reentrancy prevented - good!
                }
            }
            
            try token.delegate(address(this)) {
                // Successfully reentered delegate
            } catch {
                // Reentrancy prevented - good!
            }
            
            try token.rescueETH() {
                // Successfully reentered rescueETH
            } catch {
                // Reentrancy prevented - good!
            }
        }
    }
    
    /**
     * @notice Fallback function - also tries to perform reentrancy attacks
     */
    fallback() external payable {
        if (!attackInProgress) return;
        
        attackCount++;
        emit ReentrancyDetected("fallback", attackCount);
        
        // Similar logic to receive, but we'll try different functions to be thorough
        if (attackCount < 3) {
            successfulAttacks++;
            
            // Try to reenter with different functions
            uint256 balance = token.balanceOf(address(this));
            
            if (balance > 75) {
                try token.transfer(attacker, 75) {
                    // Successfully reentered transfer
                } catch {
                    // Reentrancy prevented - good!
                }
            }
            
            try token.createSnapshot() {
                // Successfully reentered createSnapshot
            } catch {
                // Reentrancy prevented or permission issue - expected
            }
        }
    }
    
    /**
     * @notice Allows the attacker to withdraw ETH from this contract
     */
    function withdraw() external {
        require(msg.sender == attacker, "Only attacker can withdraw");
        payable(attacker).transfer(address(this).balance);
    }

    // Add this function to your ReentrancyAttacker contract
function attackRescue() external {
    attackCount = 0;
    // Try to rescue ETH
    try token.rescueETH() {
        // If successful, this could trigger the receive function for reentrancy
    } catch {
        // Expected to fail if no admin rights
    }
}

    // Simple attack function that matches the function name in your test
function attack(uint256 amount) external {
    attackCount = 0;
    successfulAttacks = 0;
    
    // Attempt transfer to trigger potential reentrancy
    token.transfer(msg.sender, amount);
}

    
    /**
     * @notice Allows the attacker to withdraw tokens from this contract
     */
    function withdrawTokens() external {
        require(msg.sender == attacker, "Only attacker can withdraw tokens");
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            token.transfer(attacker, balance);
        }
    }
}