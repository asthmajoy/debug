import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { VOTE_TYPES } from '../utils/constants';

// Export as both named and default export to support both import styles
export function useVoting() {
  const { contracts, account, isConnected, contractsReady, _ } = useWeb3(); // Using _ instead of refreshCounter since it's not used
  const [voting, setVoting] = useState({
    loading: false,
    processing: false,
    error: null,
    success: false,
    lastVotedProposalId: null
  });
  
  // Local cache of user votes to ensure UI consistency
  const [localVoteCache, setLocalVoteCache] = useState({});
  
  // Load saved votes from localStorage on initial render
  useEffect(() => {
    try {
      const savedVotes = localStorage.getItem('userVotes');
      if (savedVotes) {
        const parsedVotes = JSON.parse(savedVotes);
        console.log('Loaded saved votes from localStorage:', parsedVotes);
        setLocalVoteCache(parsedVotes);
      }
    } catch (err) {
      console.warn('Failed to load votes from localStorage:', err);
    }
  }, []);

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

  // Check if user has voted on a specific proposal
  const hasVoted = useCallback(async (proposalId) => {
    // First check local cache - this ensures UI consistency
    if (localVoteCache[proposalId]) {
      return true;
    }
    
    // Then check blockchain
    if (!isConnected || !contractsReady || !account) return false;
    if (!contracts.governance) return false;
    
    try {
      // Check if user has voted on this proposal
      const voterInfo = await contracts.governance.proposalVoterInfo(proposalId, account);
      return !voterInfo.isZero();
    } catch (err) {
      console.error(`Error checking if user has voted on proposal ${proposalId}:`, err);
      return false;
    }
  }, [contracts, account, isConnected, contractsReady, localVoteCache]);
  
  // Get the voting power of the user for a specific snapshot
  const getVotingPower = useCallback(async (snapshotId) => {
    if (!isConnected || !contractsReady || !account) return "0";
    if (!contracts.token) return "0";
    
    try {
      console.log(`Getting voting power for snapshot ${snapshotId}`);
      
      // If no snapshot ID is provided, get the current one
      let actualSnapshotId = snapshotId;
      
      if (!actualSnapshotId) {
        actualSnapshotId = await contracts.token.getCurrentSnapshotId();
      }
      
      const votingPower = await contracts.token.getEffectiveVotingPower(account, actualSnapshotId);
      const formattedPower = ethers.utils.formatEther(votingPower);
      
      console.log(`Voting power at snapshot ${actualSnapshotId}: ${formattedPower}`);
      return formattedPower;
    } catch (err) {
      console.error("Error getting voting power:", err);
      return "0";
    }
  }, [contracts, account, isConnected, contractsReady]);
  
  // Get detailed information about how a user voted on a proposal
  const getVoteDetails = useCallback(async (proposalId) => {
    // First check local cache to ensure UI consistency
    const cachedVote = localVoteCache[proposalId];
    if (cachedVote) {
      return {
        hasVoted: true,
        votingPower: cachedVote.votingPower || "1",
        voteType: cachedVote.voteType
      };
    }
    
    // Then check blockchain
    if (!isConnected || !contractsReady || !account) {
      return { hasVoted: false, votingPower: "0", voteType: null };
    }
    
    try {
      // First check if the user has voted
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
          
          // Update local cache with this blockchain data
          const updatedCache = {...localVoteCache};
          updatedCache[proposalId] = {
            proposalId,
            voteType,
            votingPower,
            timestamp: Date.now(),
            fromBlockchain: true
          };
          setLocalVoteCache(updatedCache);
          
          // Also update localStorage
          try {
            localStorage.setItem('userVotes', JSON.stringify(updatedCache));
          } catch (storageErr) {
            console.warn("Failed to update localStorage:", storageErr);
          }
        }
      } catch (err) {
        console.warn("Couldn't determine vote type from events:", err);
      }
      
      return {
        hasVoted: true,
        votingPower: votingPower,
        voteType: voteType
      };
    } catch (err) {
      console.error("Error getting vote details:", err);
      return { hasVoted: false, votingPower: "0", voteType: null };
    }
  }, [contracts, account, isConnected, contractsReady, localVoteCache]);

  // IMPROVED: More robust approach to getting proposal vote totals
  const getProposalVoteTotals = useCallback(async (proposalId) => {
    try {
      if (!contracts.governance || !contracts.governance.provider) {
        console.error("Governance contract or provider not available");
        return null;
      }
      
      console.log(`Fetching vote data for proposal #${proposalId} from contract...`);
      
      // IMPORTANT NEW STEP: Check local vote cache first for any user votes
      const localUserVote = localVoteCache[proposalId];
      let userVoteData = null;
      
      // Check if there's a cached vote for this proposal
      if (localUserVote) {
        userVoteData = {
          hasVoted: true,
          votingPower: localUserVote.votingPower || "1",
          voteType: localUserVote.voteType
        };
        console.log(`Found cached user vote for proposal #${proposalId}:`, userVoteData);
      } 
      // If no cached vote, try to get from blockchain
      else if (account && isConnected) {
        try {
          userVoteData = await getVoteDetails(proposalId);
          console.log(`User vote data from blockchain for proposal #${proposalId}:`, userVoteData);
        } catch (err) {
          console.warn(`Error getting user vote details for proposal #${proposalId}:`, err);
        }
      }
      
      // Default values for vote data
      let adjustedYesVotingPower = 0;
      let adjustedNoVotingPower = 0;
      let adjustedAbstainVotingPower = 0;
      let adjustedTotalVoters = 0;
      let adjustedYesVotes = 0;
      let adjustedNoVotes = 0;
      let adjustedAbstainVotes = 0;
      let dataFromBlockchain = false;
      
      // FIRST APPROACH: Direct contract method (most reliable)
      try {
        console.log("Calling getProposalVotes contract method...");
        
        // This directly calls the contract's getProposalVotes function
        const voteData = await contracts.governance.getProposalVotes(proposalId);
        dataFromBlockchain = true;
        
        // Process the returned data - contract returns [yesVotes, noVotes, abstainVotes, totalVotingPower, totalVoters]
        const yesVotesRaw = voteData[0];
        const noVotesRaw = voteData[1];
        const abstainVotesRaw = voteData[2];
        // const totalVotingPower = voteData[3]; // Commented out since it's not used
        const totalVoters = voteData[4];
        
        // Format the voting power values
        adjustedYesVotingPower = parseFloat(ethers.utils.formatEther(yesVotesRaw));
        adjustedNoVotingPower = parseFloat(ethers.utils.formatEther(noVotesRaw));
        adjustedAbstainVotingPower = parseFloat(ethers.utils.formatEther(abstainVotesRaw));
        
        // Set vote counts
        adjustedYesVotes = Math.round(adjustedYesVotingPower > 0 ? Math.max(1, adjustedYesVotingPower) : 0);
        adjustedNoVotes = Math.round(adjustedNoVotingPower > 0 ? Math.max(1, adjustedNoVotingPower) : 0);
        adjustedAbstainVotes = Math.round(adjustedAbstainVotingPower > 0 ? Math.max(1, adjustedAbstainVotingPower) : 0);
        adjustedTotalVoters = Math.max(totalVoters.toNumber(), adjustedYesVotes + adjustedNoVotes + adjustedAbstainVotes);
        
        console.log("Raw vote data from contract:", {
          yesVotingPower: adjustedYesVotingPower,
          noVotingPower: adjustedNoVotingPower,
          abstainVotingPower: adjustedAbstainVotingPower,
          totalVoters: adjustedTotalVoters
        });
      } catch (contractErr) {
        console.warn("Error using getProposalVotes:", contractErr);
      }
      
      // If we don't have blockchain data, try fallback approach using events
      if (!dataFromBlockchain) {
        try {
          console.log("Falling back to VoteCast events for vote data...");
          const filter = contracts.governance.filters.VoteCast(proposalId);
          const events = await contracts.governance.queryFilter(filter);
          console.log(`Found ${events.length} VoteCast events for proposal #${proposalId}`);
          
          if (events.length > 0) {
            dataFromBlockchain = true;
            
            // Use maps to track unique voters and their votes
            const voterVotes = new Map(); // address -> {type, power}
            
            // Process all events to get the latest vote for each voter
            for (const event of events) {
              try {
                const { voter, support, votingPower } = event.args;
                const voterAddress = voter.toLowerCase();
                const powerValue = parseFloat(ethers.utils.formatEther(votingPower));
                
                // Store or update this voter's vote (keep most recent)
                voterVotes.set(voterAddress, {
                  type: Number(support),
                  power: powerValue
                });
                
                console.log(`Vote by ${voterAddress}: type=${support}, power=${powerValue}`);
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
            
            // Set the vote data based on events
            adjustedYesVotes = votesByType[1];
            adjustedNoVotes = votesByType[0];
            adjustedAbstainVotes = votesByType[2];
            adjustedTotalVoters = voterVotes.size;
            
            adjustedYesVotingPower = votingPowerByType[1];
            adjustedNoVotingPower = votingPowerByType[0];
            adjustedAbstainVotingPower = votingPowerByType[2];
            
            console.log("Vote data calculated from events:", {
              yesVotes: adjustedYesVotes,
              noVotes: adjustedNoVotes,
              abstainVotes: adjustedAbstainVotes,
              totalVoters: adjustedTotalVoters,
              yesVotingPower: adjustedYesVotingPower,
              noVotingPower: adjustedNoVotingPower,
              abstainVotingPower: adjustedAbstainVotingPower
            });
          }
        } catch (eventError) {
          console.error("Error processing vote events:", eventError);
        }
      }
      
      // IMPORTANT: If blockchain data shows 0 voters but user has voted according to local cache or blockchain check,
      // manually add their vote to the results
      if (userVoteData && userVoteData.hasVoted && !dataFromBlockchain) {
        console.log(`No blockchain data available. Creating vote data based on user's vote`);
        const userVotingPower = parseFloat(userVoteData.votingPower || "1");
        
        // Add the user's vote based on vote type
        if (userVoteData.voteType === VOTE_TYPES.FOR) {
          adjustedYesVotingPower = userVotingPower;
          adjustedYesVotes = 1;
        } else if (userVoteData.voteType === VOTE_TYPES.AGAINST) {
          adjustedNoVotingPower = userVotingPower;
          adjustedNoVotes = 1;
        } else if (userVoteData.voteType === VOTE_TYPES.ABSTAIN) {
          adjustedAbstainVotingPower = userVotingPower;
          adjustedAbstainVotes = 1;
        }
        
        // Update total voters
        adjustedTotalVoters = 1;
      }
      // If blockchain data shows 0 voters but user has voted, add their vote
      else if (userVoteData && userVoteData.hasVoted && adjustedTotalVoters === 0) {
        console.log(`Adjusting vote data with user's vote that hasn't propagated yet`);
        const userVotingPower = parseFloat(userVoteData.votingPower || "1");
        
        // Add the user's vote based on vote type
        if (userVoteData.voteType === VOTE_TYPES.FOR && adjustedYesVotes === 0) {
          adjustedYesVotingPower += userVotingPower;
          adjustedYesVotes = 1;
        } else if (userVoteData.voteType === VOTE_TYPES.AGAINST && adjustedNoVotes === 0) {
          adjustedNoVotingPower += userVotingPower;
          adjustedNoVotes = 1;
        } else if (userVoteData.voteType === VOTE_TYPES.ABSTAIN && adjustedAbstainVotes === 0) {
          adjustedAbstainVotingPower += userVotingPower;
          adjustedAbstainVotes = 1;
        }
        
        // Update total voters
        adjustedTotalVoters = Math.max(1, adjustedTotalVoters);
      }
      
      // Recalculate total voting power and percentages
      const adjustedTotalVotingPower = adjustedYesVotingPower + adjustedNoVotingPower + adjustedAbstainVotingPower;
      
      // Avoid division by zero
      const adjustedYesPercentage = adjustedTotalVotingPower > 0 ? (adjustedYesVotingPower / adjustedTotalVotingPower) * 100 : 0;
      const adjustedNoPercentage = adjustedTotalVotingPower > 0 ? (adjustedNoVotingPower / adjustedTotalVotingPower) * 100 : 0;
      const adjustedAbstainPercentage = adjustedTotalVotingPower > 0 ? (adjustedAbstainVotingPower / adjustedTotalVotingPower) * 100 : 0;
      
      // Ensure we have at least 1 vote power for voted options (avoid showing 0 JUST)
      if (adjustedYesVotes > 0 && adjustedYesVotingPower <= 0) adjustedYesVotingPower = 1;
      if (adjustedNoVotes > 0 && adjustedNoVotingPower <= 0) adjustedNoVotingPower = 1;
      if (adjustedAbstainVotes > 0 && adjustedAbstainVotingPower <= 0) adjustedAbstainVotingPower = 1;
      
      // Log final calculated vote data
      console.log("Final calculated vote data:", {
        yesVotingPower: adjustedYesVotingPower,
        noVotingPower: adjustedNoVotingPower,
        abstainVotingPower: adjustedAbstainVotingPower,
        totalVotingPower: adjustedTotalVotingPower,
        totalVoters: adjustedTotalVoters,
        yesPercentage: adjustedYesPercentage,
        noPercentage: adjustedNoPercentage,
        abstainPercentage: adjustedAbstainPercentage,
        fromBlockchain: dataFromBlockchain,
        userVoteIncluded: userVoteData && userVoteData.hasVoted
      });
      
      return {
        // For count of voters (not voting power)
        yesVotes: adjustedYesVotes,
        noVotes: adjustedNoVotes,
        abstainVotes: adjustedAbstainVotes,
        totalVotes: adjustedTotalVoters,
        
        // Voting power values
        yesVotingPower: adjustedYesVotingPower,
        noVotingPower: adjustedNoVotingPower,
        abstainVotingPower: adjustedAbstainVotingPower,
        totalVotingPower: adjustedTotalVotingPower,
        
        // Count of unique voters
        totalVoters: adjustedTotalVoters,
        
        // Percentages based on voting power
        yesPercentage: adjustedYesPercentage,
        noPercentage: adjustedNoPercentage,
        abstainPercentage: adjustedAbstainPercentage,
        
        // Flags for data source
        isAdjusted: !dataFromBlockchain || userVoteData?.hasVoted,
        fromBlockchain: dataFromBlockchain,
        includesUserVote: userVoteData?.hasVoted
      };
    } catch (error) {
      console.error("Error getting vote totals:", error);
      
      // FALLBACK FOR ANY ERROR: Check if the user has voted on this proposal from local cache
      const localUserVote = localVoteCache[proposalId];
      if (localUserVote) {
        console.log(`Error getting vote data from blockchain, using local vote data for proposal #${proposalId}`);
        const userVotingPower = parseFloat(localUserVote.votingPower || "1");
        
        // Create synthetic vote data based on local vote
        return {
          yesVotes: localUserVote.voteType === VOTE_TYPES.FOR ? 1 : 0,
          noVotes: localUserVote.voteType === VOTE_TYPES.AGAINST ? 1 : 0,
          abstainVotes: localUserVote.voteType === VOTE_TYPES.ABSTAIN ? 1 : 0,
          totalVotes: 1,
          yesVotingPower: localUserVote.voteType === VOTE_TYPES.FOR ? userVotingPower : 0,
          noVotingPower: localUserVote.voteType === VOTE_TYPES.AGAINST ? userVotingPower : 0,
          abstainVotingPower: localUserVote.voteType === VOTE_TYPES.ABSTAIN ? userVotingPower : 0,
          totalVotingPower: userVotingPower,
          totalVoters: 1,
          yesPercentage: localUserVote.voteType === VOTE_TYPES.FOR ? 100 : 0,
          noPercentage: localUserVote.voteType === VOTE_TYPES.AGAINST ? 100 : 0,
          abstainPercentage: localUserVote.voteType === VOTE_TYPES.ABSTAIN ? 100 : 0,
          isAdjusted: true,
          fromLocalCache: true
        };
      }
      
      // Last resort: return zeros
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
  }, [contracts, account, isConnected, getVoteDetails, localVoteCache]);
  
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
      
      // Check if the user has already voted locally (for UI consistency)
      if (localVoteCache[proposalId]) {
        console.log("User has already voted according to local cache");
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
      
      // Get the snapshot ID
      const snapshotId = await getProposalSnapshotId(proposalId);
      
      // Check if the user has any voting power
      const votingPower = await contracts.token.getEffectiveVotingPower(account, snapshotId);
      const votingPowerFormatted = ethers.utils.formatEther(votingPower);
      
      if (votingPower.isZero()) {
        throw new Error("You don't have any voting power for this proposal. You may need to delegate to yourself or acquire tokens before the snapshot.");
      }
      
      console.log(`Casting vote with ${votingPowerFormatted} voting power`);
      
      // IMPORTANT: Immediately update local cache for UI consistency (optimistic update)
      const voteDetails = {
        proposalId,
        voteType,
        votingPower: votingPowerFormatted,
        timestamp: Date.now()
      };
      
      // Update local cache state
      const updatedCache = {...localVoteCache, [proposalId]: voteDetails};
      setLocalVoteCache(updatedCache);
      
      // Update localStorage
      try {
        localStorage.setItem('userVotes', JSON.stringify(updatedCache));
      } catch (storageErr) {
        console.warn("Failed to update localStorage:", storageErr);
      }
      
      // Cast the vote with proper gas limit to prevent issues
      const tx = await contracts.governance.castVote(proposalId, voteType, {
        gasLimit: 300000 // Set a reasonable gas limit
      });
      
      // Wait for transaction to be confirmed
      const receipt = await tx.wait();
      console.log("Vote transaction confirmed:", receipt.transactionHash);
      
      // Update vote details with transaction hash
      voteDetails.transactionHash = receipt.transactionHash;
      updatedCache[proposalId] = voteDetails;
      
      // Update local cache and localStorage again with transaction hash
      setLocalVoteCache(updatedCache);
      try {
        localStorage.setItem('userVotes', JSON.stringify(updatedCache));
      } catch (storageErr) {
        console.warn("Failed to update localStorage with transaction hash:", storageErr);
      }
      
      // Wait briefly to allow the blockchain to update
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify the vote was actually recorded on-chain
      const votedNow = await hasVoted(proposalId);
      if (!votedNow) {
        console.warn("Transaction successful but vote not detected. This could be a UI synchronization issue.");
      }
      
      // IMPORTANT: Refresh vote data immediately after successful vote with extended retries
      try {
        console.log("Refreshing vote data after successful vote");
        // Force a refresh of vote data for this proposal - RETRY UP TO 5 TIMES with increasing delays
        let freshVoteData = null;
        for (let i = 0; i < 5 && !freshVoteData; i++) {
          try {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))); // Exponential backoff: 1s, 2s, 4s, 8s, 16s
            freshVoteData = await getProposalVoteTotals(proposalId);
            if (i > 0) console.log(`Retry ${i} succeeded in getting vote data`);
          } catch (retryErr) {
            console.warn(`Retry ${i} failed:`, retryErr);
          }
        }
        
        console.log("Updated vote data after vote:", freshVoteData);
      } catch (refreshError) {
        console.error("Error refreshing vote data after successful vote:", refreshError);
      }
      
      setVoting({ 
        loading: false,
        processing: false, 
        error: null, 
        success: true,
        lastVotedProposalId: proposalId
      });
      
      return {
        success: true,
        votingPower: votingPowerFormatted,
        voteType,
        transactionHash: receipt.transactionHash
      };
    } catch (err) {
      console.error("Error casting vote:", err);
      const errorMessage = err.reason || err.message || "Unknown error";
      
      // If there was an error, remove the optimistic update
      if (localVoteCache[proposalId] && !localVoteCache[proposalId].transactionHash) {
        const updatedCache = {...localVoteCache};
        delete updatedCache[proposalId];
        setLocalVoteCache(updatedCache);
        
        try {
          localStorage.setItem('userVotes', JSON.stringify(updatedCache));
        } catch (storageErr) {
          console.warn("Failed to update localStorage after error:", storageErr);
        }
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

  // Function to get accurate vote counts using event indexing
  const getIndexedVoteData = useCallback(async (proposalId) => {
    try {
      // Get all VoteCast events for this proposal
      const filter = contracts.governance.filters.VoteCast(proposalId);
      const events = await contracts.governance.queryFilter(filter);
      
      // Use maps to track the latest vote for each voter
      const voterVotes = new Map(); // address -> {type, power}
      
      // Process all events to build an accurate picture
      for (const event of events) {
        const { voter, support, votingPower } = event.args;
        const voterAddress = voter.toLowerCase();
        const powerValue = parseFloat(ethers.utils.formatEther(votingPower));
        
        // Store or update this voter's vote (only most recent)
        voterVotes.set(voterAddress, {
          type: Number(support),
          power: powerValue
        });
      }
      
      // Count voters and voting power by type
      let votesByType = {0: 0, 1: 0, 2: 0}; // Counts
      let votingPowerByType = {0: 0, 1: 0, 2: 0}; // Power
      
      for (const [, voteData] of voterVotes.entries()) {
        const { type, power } = voteData;
        votesByType[type]++;
        votingPowerByType[type] += power;
      }
      
      // These variables are commented out as they're not used directly
      // but we're keeping the calculation logic in case it becomes useful
      // in the future
      // const totalVotes = votesByType[0] + votesByType[1] + votesByType[2];
      // const totalVotingPower = votingPowerByType[0] + votingPowerByType[1] + votingPowerByType[2];
      
      // Check if user has voted according to local cache and events don't show it
      const localUserVote = localVoteCache[proposalId];
      if (localUserVote && voterVotes.size === 0) {
        console.log(`Adding local vote data to indexed data for proposal #${proposalId}`);
        const userVotingPower = parseFloat(localUserVote.votingPower || "1");
        
        // Add the user's vote based on vote type
        if (localUserVote.voteType === VOTE_TYPES.FOR) {
          votesByType[1] += 1;
          votingPowerByType[1] += userVotingPower;
        } else if (localUserVote.voteType === VOTE_TYPES.AGAINST) {
          votesByType[0] += 1;
          votingPowerByType[0] += userVotingPower;
        } else if (localUserVote.voteType === VOTE_TYPES.ABSTAIN) {
          votesByType[2] += 1;
          votingPowerByType[2] += userVotingPower;
        }
      }
      
      // Recalculate totals if we added a local vote
      const adjustedTotalVotes = votesByType[0] + votesByType[1] + votesByType[2];
      const adjustedTotalVotingPower = votingPowerByType[0] + votingPowerByType[1] + votingPowerByType[2];
      
      return {
        // Vote counts (1 per person)
        yesVotes: votesByType[1],
        noVotes: votesByType[0],
        abstainVotes: votesByType[2],
        totalVotes: adjustedTotalVotes,
        
        // Voting power
        yesVotingPower: votingPowerByType[1],
        noVotingPower: votingPowerByType[0],
        abstainVotingPower: votingPowerByType[2],
        totalVotingPower: adjustedTotalVotingPower,
        
        // Total unique voters
        totalVoters: voterVotes.size + (localUserVote && voterVotes.size === 0 ? 1 : 0),
        
        // Percentages based on voting power (not vote counts)
        yesPercentage: adjustedTotalVotingPower > 0 ? (votingPowerByType[1] / adjustedTotalVotingPower) * 100 : 0,
        noPercentage: adjustedTotalVotingPower > 0 ? (votingPowerByType[0] / adjustedTotalVotingPower) * 100 : 0,
        abstainPercentage: adjustedTotalVotingPower > 0 ? (votingPowerByType[2] / adjustedTotalVotingPower) * 100 : 0,
        
        // Flag for source of data
        fromEvents: true,
        includesLocalVote: localUserVote && voterVotes.size === 0
      };
    } catch (error) {
      console.error("Error indexing vote data:", error);
      
      // Fallback to local vote if available
      const localUserVote = localVoteCache[proposalId];
      if (localUserVote) {
        console.log(`Error getting indexed data, using local vote data for proposal #${proposalId}`);
        const userVotingPower = parseFloat(localUserVote.votingPower || "1");
        
        // Create synthetic vote data based on local vote
        return {
          yesVotes: localUserVote.voteType === VOTE_TYPES.FOR ? 1 : 0,
          noVotes: localUserVote.voteType === VOTE_TYPES.AGAINST ? 1 : 0,
          abstainVotes: localUserVote.voteType === VOTE_TYPES.ABSTAIN ? 1 : 0,
          totalVotes: 1,
          yesVotingPower: localUserVote.voteType === VOTE_TYPES.FOR ? userVotingPower : 0,
          noVotingPower: localUserVote.voteType === VOTE_TYPES.AGAINST ? userVotingPower : 0,
          abstainVotingPower: localUserVote.voteType === VOTE_TYPES.ABSTAIN ? userVotingPower : 0,
          totalVotingPower: userVotingPower,
          totalVoters: 1,
          yesPercentage: localUserVote.voteType === VOTE_TYPES.FOR ? 100 : 0,
          noPercentage: localUserVote.voteType === VOTE_TYPES.AGAINST ? 100 : 0,
          abstainPercentage: localUserVote.voteType === VOTE_TYPES.ABSTAIN ? 100 : 0,
          isAdjusted: true,
          fromLocalCache: true
        };
      }
      
      return null;
    }
  }, [contracts, localVoteCache]);

  return {
    castVote,
    hasVoted,
    getVotingPower,
    getVoteDetails,
    getProposalVoteTotals,
    getIndexedVoteData,
    voting,
    localVoteCache  // Export the local vote cache for components that need it
  };
}

// Also export as default for components using default import
export default useVoting;