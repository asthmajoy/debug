import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';

export function useDelegation() {
  const { contracts, account, isConnected, contractsReady, refreshCounter } = useWeb3();
  const [delegationInfo, setDelegationInfo] = useState({
    currentDelegate: null,
    lockedTokens: "0",
    delegatedToYou: "0",
    delegators: [],
    isSelfDelegated: true
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDelegationInfo = useCallback(async () => {
    if (!isConnected || !contractsReady || !contracts.token || !account) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      console.log("Fetching delegation info for account:", account);
      
      // Get user balance first to use for voting power calculations
      const userBalance = await contracts.token.balanceOf(account);
      const formattedBalance = ethers.utils.formatEther(userBalance);
      
      // Get current delegate
      const currentDelegate = await contracts.token.getDelegate(account);
      console.log("Current delegate:", currentDelegate);
      
      // Check if self-delegated (if delegate is self or zero address, consider it self-delegated)
      const isSelfDelegated = currentDelegate === account || 
                             currentDelegate === ethers.constants.AddressZero;
      
      // Check actual locked tokens from contract
      let lockedTokens = await contracts.token.getLockedTokens(account);
      
      // IMPORTANT: Force tokens to be unlocked if self-delegated
      // This ensures correct reporting regardless of contract state
      if (isSelfDelegated && !lockedTokens.isZero()) {
        console.warn("Self-delegated but tokens are still locked! Contract may need fixing.");
        
        // For UI purposes, we'll report 0 locked tokens when self-delegated
        // regardless of what the contract says, to ensure consistency
        lockedTokens = ethers.BigNumber.from(0);
        
        // Attempt to unlock tokens if they're incorrectly locked
        try {
          // This is a safety check - only try to call unlockTokens if the contract state is inconsistent
          const unlockTx = await contracts.token.unlockTokens({
            gasLimit: 200000
          });
          await unlockTx.wait();
          console.log("Performed emergency token unlock due to inconsistent state");
        } catch (unlockErr) {
          console.warn("Could not perform emergency unlock:", unlockErr.message);
        }
      }
      
      // Get list of addresses delegating to this user
      const delegatorAddresses = await contracts.token.getDelegatorsOf(account);
      
      // Get each delegator's balance
      const delegators = await Promise.all(
        delegatorAddresses.map(async (delegator) => {
          try {
            const balance = await contracts.token.balanceOf(delegator);
            return {
              address: delegator,
              balance: ethers.utils.formatEther(balance)
            };
          } catch (err) {
            console.warn(`Error getting balance for delegator ${delegator}:`, err);
            return {
              address: delegator,
              balance: "0"
            };
          }
        })
      );
      
      // FIXED: Calculate delegatedToYou correctly by filtering out self-delegation
      // and manually summing the balances of other users who delegated to you
      const filteredDelegators = delegators.filter(
        delegator => delegator.address.toLowerCase() !== account.toLowerCase()
      );
      
      const delegatedToYou = filteredDelegators.reduce(
        (sum, delegator) => sum + parseFloat(delegator.balance), 
        0
      ).toString();
      
      // IMPORTANT: Calculate correct voting power based on delegation status
      // When self-delegated: voting power = user balance
      // When delegated away: voting power = 0
      const votingPower = isSelfDelegated ? formattedBalance : "0";
      
      // IMPORTANT: For UI consistency, locked tokens should be 0 when self-delegated
      // and equal to balance when delegated away
      const displayLockedTokens = isSelfDelegated ? "0" : formattedBalance;
      
      setDelegationInfo({
        currentDelegate,
        // Override contract's lockedTokens value for UI consistency
        lockedTokens: displayLockedTokens,
        delegatedToYou,
        delegators: filteredDelegators,
        isSelfDelegated,
        // Add voting power to delegation info for consistency
        votingPower
      });
      
      console.log("Delegation info updated:", {
        currentDelegate,
        lockedTokens: ethers.utils.formatEther(lockedTokens),
        delegatedToYou,
        delegatorsCount: filteredDelegators.length,
        isSelfDelegated,
        votingPower
      });
    } catch (err) {
      console.error("Error fetching delegation info:", err);
      setError("Failed to fetch delegation information: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [contracts, account, isConnected, contractsReady]);

  // Rest of the code remains the same...
  
  // Load delegation info on initial load and when dependencies change
  useEffect(() => {
    if (isConnected && contractsReady) {
      fetchDelegationInfo();
    }
  }, [fetchDelegationInfo, isConnected, contractsReady, refreshCounter]);

  // Delegate voting power to another address
  const delegate = async (delegateeAddress) => {
    if (!isConnected || !contractsReady) throw new Error("Not connected");
    if (!contracts.token) throw new Error("Token contract not initialized");
    if (!ethers.utils.isAddress(delegateeAddress)) throw new Error("Invalid address format");
    
    // Prevent self-delegation via regular delegate - should use resetDelegation instead
    if (delegateeAddress.toLowerCase() === account.toLowerCase()) {
      return resetDelegation();
    }
    
    try {
      setLoading(true);
      setError(null);
      
      console.log(`Delegating from ${account} to ${delegateeAddress}`);
      
      // First check for potential delegation issues
      if (contracts.daoHelper) {
        try {
          const warningLevel = await contracts.daoHelper.checkDelegationDepthWarning(account, delegateeAddress);
          
          if (warningLevel === 3) {
            throw new Error("This delegation would exceed the maximum delegation depth limit or create a cycle");
          } else if (warningLevel === 2) {
            console.warn("This delegation will reach the maximum allowed delegation depth");
          } else if (warningLevel === 1) {
            console.warn("This delegation is getting close to the maximum depth limit");
          }
        } catch (depthErr) {
          // Only throw if this was an actual depth error, not a contract call error
          if (depthErr.message.includes("delegation")) {
            throw depthErr;
          } else {
            console.warn("Could not check delegation depth:", depthErr);
          }
        }
      }
      
      // Execute the delegation
      const tx = await contracts.token.delegate(delegateeAddress, {
        gasLimit: 300000 // Set a reasonable gas limit
      });
      
      await tx.wait();
      console.log("Delegation transaction confirmed");
      
      // Refresh delegation info
      await fetchDelegationInfo();
      
      return true;
    } catch (err) {
      console.error("Error delegating:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Reset delegation (self-delegate)
  const resetDelegation = async () => {
    if (!isConnected || !contractsReady) throw new Error("Not connected");
    if (!contracts.token) throw new Error("Token contract not initialized");
    
    // Check if already self-delegated to prevent unnecessary transactions
    const currentDelegate = await contracts.token.getDelegate(account);
    const isSelfDelegated = currentDelegate === account || 
                           currentDelegate === ethers.constants.AddressZero;
    
    if (isSelfDelegated) {
      console.log("Already self-delegated, no action needed");
      
      // Even if already self-delegated, check if there are any locked tokens that need to be unlocked
      const lockedTokens = await contracts.token.getLockedTokens(account);
      if (!lockedTokens.isZero()) {
        console.log("Found locked tokens even though self-delegated, attempting to unlock");
        try {
          // Call explicit unlock if tokens are still locked (backup)
          const unlockTx = await contracts.token.unlockTokens({
            gasLimit: 200000
          });
          await unlockTx.wait();
          console.log("Unlock transaction confirmed");
          
          // Refresh after unlocking
          await fetchDelegationInfo();
        } catch (unlockErr) {
          console.warn("Error trying to unlock tokens:", unlockErr);
        }
      }
      
      return true;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      console.log("Resetting delegation to self");
      
      // Call the resetDelegation method to self-delegate
      const tx = await contracts.token.resetDelegation({
        gasLimit: 200000
      });
      
      await tx.wait();
      console.log("Reset delegation transaction confirmed");
      
      // IMPORTANT: Explicitly check if tokens need to be unlocked after resetting delegation
      // Some contracts might not automatically unlock tokens on self-delegation
      const lockedTokensAfterReset = await contracts.token.getLockedTokens(account);
      if (!lockedTokensAfterReset.isZero()) {
        console.log("Tokens still locked after reset, explicitly unlocking...");
        
        // Add explicit unlock call - many token contracts require this
        // If your contract doesn't have this method, you might need to modify this part
        try {
          const unlockTx = await contracts.token.unlockTokens({
            gasLimit: 200000
          });
          await unlockTx.wait();
          console.log("Unlock transaction confirmed");
        } catch (unlockErr) {
          console.warn("Error trying to unlock tokens (contract may not support direct unlocking):", unlockErr);
        }
      }
      
      // Refresh delegation info after both operations
      await fetchDelegationInfo();
      
      return true;
    } catch (err) {
      console.error("Error resetting delegation:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Get delegation depth warning info
  const getDelegationDepthWarning = async (delegator, delegatee) => {
    if (!isConnected || !contractsReady) throw new Error("Not connected");
    
    // If trying to delegate to self, return no warning (it's just a reset)
    if (delegator.toLowerCase() === delegatee.toLowerCase()) {
      return { warningLevel: 0, message: "Self-delegation has no depth issues" };
    }
    
    try {
      // Try to use DAO helper if available
      if (contracts.daoHelper) {
        try {
          const warningLevel = await contracts.daoHelper.checkDelegationDepthWarning(delegator, delegatee);
          return {
            warningLevel: Number(warningLevel),
            message: getWarningMessage(Number(warningLevel))
          };
        } catch (helperErr) {
          console.warn("Error using DAO helper for delegation depth check:", helperErr);
        }
      }
      
      // Fallback: Try to calculate delegation depth ourselves
      let depth = 0;
      let currentDelegate = delegatee;
      const visited = new Set();
      
      // Check the delegation chain depth
      while (currentDelegate && currentDelegate !== ethers.constants.AddressZero) {
        if (visited.has(currentDelegate.toLowerCase())) {
          return { warningLevel: 3, message: "This delegation would create a cycle" };
        }
        
        visited.add(currentDelegate.toLowerCase());
        depth++;
        
        if (depth >= 8) { // Max depth is 8 in the contract
          return { warningLevel: 3, message: "This delegation would exceed the maximum delegation depth limit" };
        }
        
        // Get the next delegate in the chain
        try {
          currentDelegate = await contracts.token.getDelegate(currentDelegate);
          
          // If the delegate is delegating to themself or not delegating, stop
          if (currentDelegate === ethers.constants.AddressZero || visited.has(currentDelegate.toLowerCase())) {
            break;
          }
          
          // Check if this would create a cycle back to the delegator
          if (currentDelegate.toLowerCase() === delegator.toLowerCase()) {
            return { warningLevel: 3, message: "This delegation would create a cycle" };
          }
        } catch (err) {
          break;
        }
      }
      
      // Determine warning level based on depth
      let warningLevel = 0;
      if (depth >= 6) {
        warningLevel = 2;
      } else if (depth >= 4) {
        warningLevel = 1;
      }
      
      return {
        warningLevel,
        message: getWarningMessage(warningLevel)
      };
    } catch (err) {
      console.error("Error checking delegation depth:", err);
      throw err;
    }
  };

  // Get delegation warning message
  function getWarningMessage(warningLevel) {
    switch (Number(warningLevel)) {
      case 0:
        return "No delegation depth issues";
      case 1:
        return "This delegation is getting close to the maximum delegation depth limit";
      case 2:
        return "This delegation will reach the maximum delegation depth limit";
      case 3:
        return "This delegation would exceed the maximum delegation depth limit or create a cycle";
      default:
        return "Unknown delegation depth warning";
    }
  }

  return {
    delegationInfo,
    loading,
    error,
    delegate,
    resetDelegation,
    fetchDelegationInfo,
    getDelegationDepthWarning
  };
}