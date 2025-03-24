// src/hooks/useVoting.js - Removed localStorage dependency
import { useState, useCallback, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { VOTE_TYPES } from '../utils/constants';

export function useVoting() {
  const { contracts, account, isConnected, contractsReady, refreshCounter } = useWeb3();
  const [voting, setVoting] = useState({
    loading: false,
    processing: false,
    error: null,
    success: false,
    lastVotedProposalId: null
  });
  
  // In-memory vote cache (replaces localStorage)
  const [inMemoryVoteCache, setInMemoryVoteCache] = useState({});
  
  // Ref to track proposals we've already checked with the blockchain
  const checkedProposals = useRef(new Set());

  // Get snapshot ID for a proposal using events
  const getProposalSnapshotId = useCallback(async (proposalId) => {
    if (!contracts.governance) return 0;
    
    try {
      // Try to find the creation event for this proposal
      const filter = contracts.governance.filters.ProposalEvent(proposalId, 0); // Type 0 is creation event
      const events = await contracts.governance.queryFilter(filter);
      
      if (events.length > 0) {
        const creationEvent = events[0];
        
        // Try to decode the data which contains type and snapshotId
        try {
          const data = creationEvent.args.data;
          const decoded = ethers.utils.defaultAbiCoder.decode(['uint8', 'uint256'], data);
          return decoded[1].toNumber(); // The snapshotId is the second parameter
        } catch (decodeErr) {
          console.warn("Couldn't decode event data for snapshot ID:", decodeErr);
        }
      }
      
      // If we can't get it from events, try to get the current snapshot as fallback
      return await contracts.token.getCurrentSnapshotId();
    } catch (err) {
      console.warn("Error getting proposal snapshot ID:", err);
      // Return the current snapshot as fallback
      try {
        return await contracts.token.getCurrentSnapshotId();
      } catch (fallbackErr) {
        console.error("Error getting current snapshot ID:", fallbackErr);
        return 0;
      }
    }
  }, [contracts]);

  // Check if user has voted on a specific proposal by querying the blockchain directly
  const hasVoted = useCallback(async (proposalId) => {
    // First check in-memory cache for optimistic UI
    if (inMemoryVoteCache[proposalId]) {
      return true;
    }
    
    // Then check blockchain
    if (!isConnected || !contractsReady || !account || !proposalId) return false;
    if (!contracts.governance) return false;
    
    try {
      // Try the most direct method first
      if (typeof contracts.governance.hasVoted === 'function') {
        return await contracts.governance.hasVoted(proposalId, account);
      }
      
      // Alternative: check if user has voting power allocated to this proposal
      const voterInfo = await contracts.governance.proposalVoterInfo(proposalId, account);
      return !voterInfo.isZero();
    } catch (err) {
      console.error(`Error checking if user has voted on proposal ${proposalId}:`, err);
      return false;
    }
  }, [contracts, account, isConnected, contractsReady, inMemoryVoteCache]);
  
  // Get the voting power of the user for a specific snapshot
  const getVotingPower = useCallback(async (snapshotId) => {
    if (!isConnected || !contractsReady || !account) return "0";
    if (!contracts.token) return "0";
    
    try {
      // If no snapshot ID is provided, get the current one
      let actualSnapshotId = snapshotId;
      
      if (!actualSnapshotId) {
        actualSnapshotId = await contracts.token.getCurrentSnapshotId();
      }
      
      // Try different methods depending on what's available on the contract
      if (typeof contracts.token.getEffectiveVotingPower === 'function') {
        const votingPower = await contracts.token.getEffectiveVotingPower(account, actualSnapshotId);
        return ethers.utils.formatEther(votingPower);
      } 
      
      // Alternative: check if getPastVotes is available (more standard)
      if (typeof contracts.token.getPastVotes === 'function') {
        const votingPower = await contracts.token.getPastVotes(account, actualSnapshotId);
        return ethers.utils.formatEther(votingPower);
      }
      
      // Fallback: use balanceOf if delegation is to self
      const delegate = await contracts.token.delegates(account);
      if (delegate === account || delegate === ethers.constants.AddressZero) {
        const balance = await contracts.token.balanceOf(account);
        return ethers.utils.formatEther(balance);
      }
      
      return "0"; // Not self-delegated and no direct method
    } catch (err) {
      console.error("Error getting voting power:", err);
      return "0";
    }
  }, [contracts, account, isConnected, contractsReady]);
  
  // Get detailed information about how a user voted on a proposal
  const getVoteDetails = useCallback(async (proposalId) => {
    // First check in-memory cache for optimistic UI
    const cachedVote = inMemoryVoteCache[proposalId];
    if (cachedVote) {
      return {
        hasVoted: true,
        votingPower: cachedVote.votingPower || "1",
        voteType: cachedVote.voteType
      };
    }
    
    // Then check blockchain
    if (!isConnected || !contractsReady || !account || !proposalId) {
      return { hasVoted: false, votingPower: "0", voteType: null };
    }
    
    try {
      // Try to detect which method is available on the contract
      if (typeof contracts.governance.getReceipt === 'function') {
        // OpenZeppelin Governor standard method
        const receipt = await contracts.governance.getReceipt(proposalId, account);
        if (receipt && receipt.hasVoted) {
          return {
            hasVoted: receipt.hasVoted,
            votingPower: ethers.utils.formatEther(receipt.votes),
            voteType: receipt.support
          };
        }
      }
      
      // Custom method: try to check voter info
      if (typeof contracts.governance.proposalVoterInfo === 'function') {
        const voterInfo = await contracts.governance.proposalVoterInfo(proposalId, account);
        
        if (voterInfo.isZero()) {
          return { hasVoted: false, votingPower: "0", voteType: null };
        }
        
        // Try to determine how they voted by checking events
        const votingPower = ethers.utils.formatEther(voterInfo);
        let voteType = null;
        
        try {
          // Check for VoteCast events for this proposal and user
          const filter = contracts.governance.filters.VoteCast(proposalId, account);
          const events = await contracts.governance.queryFilter(filter);
          
          if (events.length > 0) {
            // Use the most recent vote (in case of any issues)
            const latestEvent = events[events.length - 1];
            voteType = latestEvent.args.support;
            
            // Update in-memory cache with this blockchain data
            const updatedCache = {...inMemoryVoteCache};
            updatedCache[proposalId] = {
              proposalId,
              voteType: Number(voteType),
              votingPower,
              timestamp: Date.now(),
              fromBlockchain: true
            };
            setInMemoryVoteCache(updatedCache);
          }
        } catch (err) {
          console.warn("Couldn't determine vote type from events:", err);
        }
        
        return {
          hasVoted: true,
          votingPower: votingPower,
          voteType: voteType !== null ? Number(voteType) : null
        };
      }
      
      // No recognized methods available
      return { hasVoted: false, votingPower: "0", voteType: null };
    } catch (err) {
      console.error("Error getting vote details:", err);
      return { hasVoted: false, votingPower: "0", voteType: null };
    }
  }, [contracts, account, isConnected, contractsReady, inMemoryVoteCache]);

  // Improved vote totals fetching with fallbacks and multiple approaches
  const getProposalVoteTotals = useCallback(async (proposalId) => {
    if (!proposalId || !contracts.governance) {
      return {
        yesVotes: 0,
        noVotes: 0,
        abstainVotes: 0,
        totalVotes: 0,
        yesVotingPower: 0,
        noVotingPower: 0,
        abstainVotingPower: 0,
        totalVotingPower: 0,
        totalVoters: 0,
        yesPercentage: 0,
        noPercentage: 0,
        abstainPercentage: 0
      };
    }

    try {
      // Check if this user has voted (from memory cache or blockchain)
      let userVoteData = null;
      
      // 1. Check in-memory cache first
      const cachedVote = inMemoryVoteCache[proposalId];
      if (cachedVote) {
        userVoteData = {
          hasVoted: true,
          votingPower: cachedVote.votingPower || "1",
          voteType: cachedVote.voteType
        };
      } 
      // 2. Or fetch from blockchain if account is connected
      else if (account && isConnected && !checkedProposals.current.has(proposalId)) {
        try {
          userVoteData = await getVoteDetails(proposalId);
          // Mark this proposal as checked to avoid repeated checks
          checkedProposals.current.add(proposalId);
        } catch (err) {
          console.warn(`Error getting user vote details for proposal ${proposalId}:`, err);
        }
      }

      // Try different methods to get vote totals from blockchain
      let blockchainVoteData = null;
      
      // APPROACH 1: Use the standard proposalVotes method if available (OZ Governor standard)
      if (typeof contracts.governance.proposalVotes === 'function') {
        try {
          const votes = await contracts.governance.proposalVotes(proposalId);
          
          // Format votes - typically [against, for, abstain]
          const yesVotingPower = parseFloat(ethers.utils.formatEther(votes[1]));
          const noVotingPower = parseFloat(ethers.utils.formatEther(votes[0]));
          const abstainVotingPower = parseFloat(ethers.utils.formatEther(votes[2]));
          const totalVotingPower = yesVotingPower + noVotingPower + abstainVotingPower;
          
          // Use voting power to estimate voter count (not 100% accurate but reasonable)
          const avgVotingPower = totalVotingPower > 0 ? totalVotingPower / Math.max(1, (yesVotingPower > 0 ? 1 : 0) + (noVotingPower > 0 ? 1 : 0) + (abstainVotingPower > 0 ? 1 : 0)) : 1;
          
          const yesVotes = Math.max(1, Math.round(yesVotingPower / avgVotingPower));
          const noVotes = Math.max(1, Math.round(noVotingPower / avgVotingPower));
          const abstainVotes = Math.max(1, Math.round(abstainVotingPower / avgVotingPower));
          const totalVoters = yesVotes + noVotes + abstainVotes;
          
          blockchainVoteData = {
            yesVotes,
            noVotes,
            abstainVotes,
            totalVotes: totalVoters,
            yesVotingPower,
            noVotingPower,
            abstainVotingPower,
            totalVotingPower,
            totalVoters,
            yesPercentage: totalVotingPower > 0 ? (yesVotingPower / totalVotingPower) * 100 : 0,
            noPercentage: totalVotingPower > 0 ? (noVotingPower / totalVotingPower) * 100 : 0,
            abstainPercentage: totalVotingPower > 0 ? (abstainVotingPower / totalVotingPower) * 100 : 0,
            source: 'proposalVotes'
          };
        } catch (err) {
          console.warn(`Error calling proposalVotes for ${proposalId}:`, err);
        }
      }
      
      // APPROACH 2: Try custom getProposalVotes method if available
      if (!blockchainVoteData && typeof contracts.governance.getProposalVotes === 'function') {
        try {
          const voteData = await contracts.governance.getProposalVotes(proposalId);
          
          // The expected format depends on the contract implementation:
          // Could be [yesVotes, noVotes, abstainVotes, totalVotingPower, totalVoters]
          // or an object with properties for each
          
          let yesVotingPower = 0, noVotingPower = 0, abstainVotingPower = 0, totalVoters = 0;
          
          if (Array.isArray(voteData)) {
            // Array format - convert BigNumbers if needed
            yesVotingPower = parseFloat(ethers.utils.formatEther(voteData[0] || 0));
            noVotingPower = parseFloat(ethers.utils.formatEther(voteData[1] || 0));
            abstainVotingPower = parseFloat(ethers.utils.formatEther(voteData[2] || 0));
            totalVoters = voteData[4] ? voteData[4].toNumber() : 0;
          } else {
            // Object format
            yesVotingPower = parseFloat(ethers.utils.formatEther(voteData.yesVotes || 0));
            noVotingPower = parseFloat(ethers.utils.formatEther(voteData.noVotes || 0));
            abstainVotingPower = parseFloat(ethers.utils.formatEther(voteData.abstainVotes || 0));
            totalVoters = voteData.totalVoters || 0;
          }
          
          const totalVotingPower = yesVotingPower + noVotingPower + abstainVotingPower;
          
          // Estimate vote counts if totalVoters is 0
          let yesVotes = 0, noVotes = 0, abstainVotes = 0;
          
          if (totalVoters > 0) {
            // Use distribution of voting power to estimate counts
            yesVotes = Math.round((yesVotingPower / totalVotingPower) * totalVoters);
            noVotes = Math.round((noVotingPower / totalVotingPower) * totalVoters);
            abstainVotes = Math.round((abstainVotingPower / totalVotingPower) * totalVoters);
            
            // Ensure counts add up to totalVoters
            const sum = yesVotes + noVotes + abstainVotes;
            if (sum !== totalVoters) {
              const diff = totalVoters - sum;
              // Add the difference to the largest count
              if (yesVotes >= noVotes && yesVotes >= abstainVotes) {
                yesVotes += diff;
              } else if (noVotes >= yesVotes && noVotes >= abstainVotes) {
                noVotes += diff;
              } else {
                abstainVotes += diff;
              }
            }
          } else if (totalVotingPower > 0) {
            // If we have voting power but no voter count, use 1 voter per non-zero vote type
            yesVotes = yesVotingPower > 0 ? 1 : 0;
            noVotes = noVotingPower > 0 ? 1 : 0;
            abstainVotes = abstainVotingPower > 0 ? 1 : 0;
            totalVoters = yesVotes + noVotes + abstainVotes;
          }
          
          blockchainVoteData = {
            yesVotes,
            noVotes,
            abstainVotes,
            totalVotes: totalVoters,
            yesVotingPower,
            noVotingPower,
            abstainVotingPower,
            totalVotingPower,
            totalVoters,
            yesPercentage: totalVotingPower > 0 ? (yesVotingPower / totalVotingPower) * 100 : 0,
            noPercentage: totalVotingPower > 0 ? (noVotingPower / totalVotingPower) * 100 : 0,
            abstainPercentage: totalVotingPower > 0 ? (abstainVotingPower / totalVotingPower) * 100 : 0,
            source: 'getProposalVotes'
          };
        } catch (err) {
          console.warn(`Error calling getProposalVotes for ${proposalId}:`, err);
        }
      }
      
      // APPROACH 3: VoteCast events
      if (!blockchainVoteData) {
        try {
          const filter = contracts.governance.filters.VoteCast(proposalId);
          const events = await contracts.governance.queryFilter(filter);
          
          if (events.length > 0) {
            // Use maps to track unique voters and their votes
            const voterVotes = new Map(); // address -> {type, power}
            
            // Process all events to get the latest vote for each voter
            for (const event of events) {
              try {
                const { voter, support, votingPower } = event.args;
                const voterAddress = voter.toLowerCase();
                const powerValue = parseFloat(ethers.utils.formatEther(votingPower));
                
                // Store or update this voter's vote (keeping most recent)
                voterVotes.set(voterAddress, {
                  type: Number(support),
                  power: powerValue
                });
              } catch (parseErr) {
                console.warn("Error parsing vote event:", parseErr);
              }
            }
            
            // Count votes and voting power by type
            let votesByType = {0: 0, 1: 0, 2: 0}; // Count of votes
            let votingPowerByType = {0: 0, 1: 0, 2: 0}; // Sum of voting power
            
            for (const [, voteData] of voterVotes.entries()) {
              const { type, power } = voteData;
              votesByType[type]++;
              votingPowerByType[type] += power;
            }
            
            const totalVoters = voterVotes.size;
            const totalVotingPower = votingPowerByType[0] + votingPowerByType[1] + votingPowerByType[2];
            
            blockchainVoteData = {
              yesVotes: votesByType[1],
              noVotes: votesByType[0],
              abstainVotes: votesByType[2],
              totalVotes: totalVoters,
              yesVotingPower: votingPowerByType[1],
              noVotingPower: votingPowerByType[0],
              abstainVotingPower: votingPowerByType[2],
              totalVotingPower,
              totalVoters,
              yesPercentage: totalVotingPower > 0 ? (votingPowerByType[1] / totalVotingPower) * 100 : 0,
              noPercentage: totalVotingPower > 0 ? (votingPowerByType[0] / totalVotingPower) * 100 : 0,
              abstainPercentage: totalVotingPower > 0 ? (votingPowerByType[2] / totalVotingPower) * 100 : 0,
              source: 'events'
            };
          }
        } catch (eventError) {
          console.error("Error processing vote events:", eventError);
        }
      }
      
      // If we have no blockchain data but the user has voted, create synthetic data
      if (!blockchainVoteData && userVoteData && userVoteData.hasVoted) {
        const userVotingPower = parseFloat(userVoteData.votingPower || "1");
        const voteType = userVoteData.voteType;
        
        const yesVotingPower = voteType === VOTE_TYPES.FOR ? userVotingPower : 0;
        const noVotingPower = voteType === VOTE_TYPES.AGAINST ? userVotingPower : 0;
        const abstainVotingPower = voteType === VOTE_TYPES.ABSTAIN ? userVotingPower : 0;
        
        blockchainVoteData = {
          yesVotes: voteType === VOTE_TYPES.FOR ? 1 : 0,
          noVotes: voteType === VOTE_TYPES.AGAINST ? 1 : 0,
          abstainVotes: voteType === VOTE_TYPES.ABSTAIN ? 1 : 0,
          totalVotes: 1,
          yesVotingPower,
          noVotingPower,
          abstainVotingPower,
          totalVotingPower: userVotingPower,
          totalVoters: 1,
          yesPercentage: voteType === VOTE_TYPES.FOR ? 100 : 0,
          noPercentage: voteType === VOTE_TYPES.AGAINST ? 100 : 0,
          abstainPercentage: voteType === VOTE_TYPES.ABSTAIN ? 100 : 0,
          source: 'userVote'
        };
      }
      
      // If we still have no data, return zeros
      if (!blockchainVoteData) {
        return {
          yesVotes: 0,
          noVotes: 0,
          abstainVotes: 0,
          totalVotes: 0,
          yesVotingPower: 0,
          noVotingPower: 0,
          abstainVotingPower: 0,
          totalVotingPower: 0,
          totalVoters: 0,
          yesPercentage: 0,
          noPercentage: 0,
          abstainPercentage: 0,
          source: 'default'
        };
      }
      
      return blockchainVoteData;
    } catch (error) {
      console.error("Error getting vote totals:", error);
      return {
        yesVotes: 0,
        noVotes: 0,
        abstainVotes: 0,
        totalVotes: 0,
        yesVotingPower: 0,
        noVotingPower: 0,
        abstainVotingPower: 0,
        totalVotingPower: 0,
        totalVoters: 0,
        yesPercentage: 0,
        noPercentage: 0,
        abstainPercentage: 0,
        source: 'error'
      };
    }
  }, [contracts, account, isConnected, getVoteDetails, inMemoryVoteCache]);

  // Enhanced vote casting with better error handling and verification
  const castVote = async (proposalId, voteType) => {
    if (!isConnected || !contractsReady) throw new Error("Not connected to blockchain");
    if (!contracts.governance) throw new Error("Governance contract not initialized");
    
    try {
      setVoting({ 
        loading: true,
        processing: true,
        error: null, 
        success: false,
        lastVotedProposalId: null
      });
      
      console.log(`Attempting to cast vote on proposal #${proposalId} with vote type ${voteType}`);
      
      // Validate vote type
      if (![VOTE_TYPES.AGAINST, VOTE_TYPES.FOR, VOTE_TYPES.ABSTAIN].includes(Number(voteType))) {
        throw new Error("Invalid vote type. Must be 0 (Against), 1 (For), or 2 (Abstain)");
      }
      
      // Check if the user has already voted from in-memory cache
      if (inMemoryVoteCache[proposalId]) {
        console.log("User has already voted according to cache");
        throw new Error("You have already voted on this proposal");
      }
      
      // Check if the proposal is active
      const proposalState = await contracts.governance.getProposalState(proposalId);
      if (proposalState !== 0) { // 0 = Active
        throw new Error("Proposal is not active. Cannot vote on inactive proposals.");
      }
      
      // Check if the user has already voted on the blockchain
      const hasAlreadyVoted = await hasVoted(proposalId);
      if (hasAlreadyVoted) {
        throw new Error("You have already voted on this proposal");
      }
      
      // Get the user's voting power
      const snapshotId = await getProposalSnapshotId(proposalId);
      const votingPower = await getVotingPower(snapshotId);
      
      if (parseFloat(votingPower) <= 0) {
        throw new Error("You don't have any voting power for this proposal. You may need to delegate to yourself or acquire tokens before the snapshot.");
      }
      
      console.log(`Casting vote with ${votingPower} voting power`);
      
      // IMMEDIATELY update in-memory cache for UI consistency (optimistic update)
      const voteDetails = {
        proposalId,
        voteType: Number(voteType),
        votingPower,
        timestamp: Date.now()
      };
      
      // Update in-memory cache state
      setInMemoryVoteCache(prev => ({...prev, [proposalId]: voteDetails}));
      
      // Cast the vote on the blockchain with safeguards
      const gasLimit = 300000; // Set a reasonable gas limit for voting

      // Different contracts use different voting methods
      let tx;
      if (typeof contracts.governance.castVote === 'function') {
        tx = await contracts.governance.castVote(proposalId, voteType, {
          gasLimit
        });
      } else if (typeof contracts.governance.castVoteWithReason === 'function') {
        tx = await contracts.governance.castVoteWithReason(proposalId, voteType, "Vote via DAO UI", {
          gasLimit
        });
      } else {
        throw new Error("No valid voting method found on contract");
      }
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log("Vote transaction confirmed:", receipt.transactionHash);
      
      // Update vote details with transaction hash
      voteDetails.transactionHash = receipt.transactionHash;
      setInMemoryVoteCache(prev => ({...prev, [proposalId]: voteDetails}));
      
      // Poll for updated vote data to reflect the change
      let retryCount = 0;
      const maxRetries = 5;
      const pollInterval = 2000; // 2 seconds
      
      const pollForUpdatedVoteData = async () => {
        if (retryCount >= maxRetries) return;
        
        try {
          // Try to get the updated vote data
          const updatedData = await getProposalVoteTotals(proposalId);
          console.log(`Poll ${retryCount + 1}: Updated vote data`, updatedData);
          
          // Clear the proposal from checked set to force a fresh check next time
          checkedProposals.current.delete(proposalId);
          
          retryCount++;
          setTimeout(pollForUpdatedVoteData, pollInterval);
        } catch (err) {
          console.warn(`Error in poll ${retryCount + 1}:`, err);
          retryCount++;
          setTimeout(pollForUpdatedVoteData, pollInterval);
        }
      };
      
      // Start polling
      setTimeout(pollForUpdatedVoteData, pollInterval);
      
      setVoting({ 
        loading: false,
        processing: false, 
        error: null, 
        success: true,
        lastVotedProposalId: proposalId
      });
      
      return {
        success: true,
        votingPower,
        voteType,
        transactionHash: receipt.transactionHash
      };
    } catch (err) {
      console.error("Error casting vote:", err);
      const errorMessage = err.reason || err.message || "Unknown error";
      
      // If there was an error, remove the optimistic update
      if (inMemoryVoteCache[proposalId] && !inMemoryVoteCache[proposalId].transactionHash) {
        setInMemoryVoteCache(prev => {
          const updated = {...prev};
          delete updated[proposalId];
          return updated;
        });
      }
      
      setVoting({ 
        loading: false,
        processing: false,
        error: errorMessage, 
        success: false,
        lastVotedProposalId: null
      });
      
      throw err;
    }
  };

  // Reset in-memory state when dependencies change to avoid stale data
  useEffect(() => {
    if (account || refreshCounter) {
      // Clear in-memory cache when account changes
      setInMemoryVoteCache({});
      checkedProposals.current.clear();
    }
  }, [account, refreshCounter]);

  return {
    castVote,
    hasVoted,
    getVotingPower,
    getVoteDetails,
    getProposalVoteTotals,
    voting,
    userVotes: inMemoryVoteCache  // Export the in-memory vote cache
  };
}

// Also export as default for components using default import
export default useVoting;