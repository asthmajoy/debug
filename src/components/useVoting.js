import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { VOTE_TYPES } from '../utils/constants';

// Export as both named and default export to support both import styles
export function useVoting() {
  const { contracts, account, isConnected, contractsReady, refreshCounter } = useWeb3();
  const [voting, setVoting] = useState({
    loading: false,
    processing: false,
    error: null,
    success: false,
    lastVotedProposalId: null
  });

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
  }, [contracts, account, isConnected, contractsReady]);
  
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
  }, [contracts, account, isConnected, contractsReady]);

  // REVISED: Get proposal vote totals - count 1 vote per person, not by token balance
  const getProposalVoteTotals = useCallback(async (proposalId) => {
    try {
      if (!contracts.governance || !contracts.governance.provider) {
        console.error("Governance contract or provider not available");
        return null;
      }
      
      console.log(`Fetching vote data for proposal #${proposalId} directly from contract...`);
      
      // Use VoteCast events to get vote data
      try {
        console.log("Using VoteCast events to get vote data...");
        const filter = contracts.governance.filters.VoteCast(proposalId);
        const events = await contracts.governance.queryFilter(filter);
        console.log(`Found ${events.length} VoteCast events for proposal #${proposalId}`);
        
        if (events.length > 0) {
          let yesVotes = 0, noVotes = 0, abstainVotes = 0;
          // Track unique voters
          const voterMap = new Map();
          
          for (const event of events) {
            try {
              const { voter, support } = event.args;
              // Store the voter's most recent vote type
              voterMap.set(voter.toLowerCase(), support);
              
              // Each voter gets 1 vote, regardless of token balance
              const powerValue = 1; 
              
              console.log(`Vote by ${voter}: type=${support}, counted as ${powerValue} vote`);
              
              if (support === 0) noVotes += powerValue;
              else if (support === 1) yesVotes += powerValue;
              else if (support === 2) abstainVotes += powerValue;
            } catch (parseError) {
              console.warn("Error parsing event:", parseError);
            }
          }
          
          const totalVotes = yesVotes + noVotes + abstainVotes;
          
          return {
            yesVotes,
            noVotes,
            abstainVotes,
            totalVotes,
            totalVoters: voterMap.size, // Count of unique addresses that voted
            yesPercentage: totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 0,
            noPercentage: totalVotes > 0 ? (noVotes / totalVotes) * 100 : 0,
            abstainPercentage: totalVotes > 0 ? (abstainVotes / totalVotes) * 100 : 0
          };
        }
      } catch (eventError) {
        console.error("Error using VoteCast events:", eventError);
      }
      
      // If no events found, try to get direct vote data from contract
      try {
        if (typeof contracts.governance.getProposalVotes === 'function') {
          const voteData = await contracts.governance.getProposalVotes(proposalId);
          console.log("Retrieved vote data from contract method:", voteData);
          
          // Convert raw vote counts to 1 vote per person if needed
          // If your contract already returns the count of voters per type, use these as is
          let yesVotes = 0, noVotes = 0, abstainVotes = 0, totalVoters = 0;
          
          // Format depends on whether result is array or object
          if (Array.isArray(voteData)) {
            // If it returns array, we need to check what format
            // Example: if vote power in wei, convert to count
            if (voteData[0]._isBigNumber) {
              // If the result is vote power, divide by 10^18 to roughly estimate voters
              // This is a rough estimate - adjust as needed for your token decimals
              yesVotes = voteData[0].gt(0) ? 1 : 0;  // If any yes votes, count as 1
              noVotes = voteData[1].gt(0) ? 1 : 0;   // If any no votes, count as 1
              abstainVotes = voteData[2].gt(0) ? 1 : 0; // If any abstain, count as 1
              totalVoters = yesVotes + noVotes + abstainVotes;
            } else {
              // Already count-based
              yesVotes = Number(voteData[0]) || 0;
              noVotes = Number(voteData[1]) || 0;
              abstainVotes = Number(voteData[2]) || 0;
              totalVoters = Number(voteData[3]) || 0;
            }
          } else {
            // Object-based response
            // If these are already counts, use as is
            yesVotes = Number(voteData.yesVotes) || 0;
            noVotes = Number(voteData.noVotes) || 0;
            abstainVotes = Number(voteData.abstainVotes) || 0;
            totalVoters = Number(voteData.totalVoters) || 0;
          }
          
          const totalVotes = yesVotes + noVotes + abstainVotes;
          
          return {
            yesVotes,
            noVotes,
            abstainVotes,
            totalVotes,
            totalVoters: totalVoters || totalVotes, // Use provided totalVoters or fallback to sum
            yesPercentage: totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 0,
            noPercentage: totalVotes > 0 ? (noVotes / totalVotes) * 100 : 0,
            abstainPercentage: totalVotes > 0 ? (abstainVotes / totalVotes) * 100 : 0
          };
        }
      } catch (directError) {
        console.warn("Error using direct contract method:", directError);
      }
      
      // Last resort: return zeros
      console.warn("All approaches to get vote data failed. Returning zeros.");
      return {
        yesVotes: 0,
        noVotes: 0,
        abstainVotes: 0,
        totalVotes: 0,
        totalVoters: 0,
        yesPercentage: 0,
        noPercentage: 0,
        abstainPercentage: 0
      };
    } catch (error) {
      console.error("Error getting vote totals:", error);
      return null;
    }
  }, [contracts]);

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
      
      console.log(`Attempting to cast vote on proposal ${proposalId} with vote type ${voteType}`);
      
      // Validate vote type
      if (![VOTE_TYPES.AGAINST, VOTE_TYPES.FOR, VOTE_TYPES.ABSTAIN].includes(Number(voteType))) {
        throw new Error("Invalid vote type. Must be 0 (Against), 1 (For), or 2 (Abstain)");
      }
      
      // Check if the proposal is active
      const proposalState = await contracts.governance.getProposalState(proposalId);
      if (proposalState !== 0) { // 0 = Active
        throw new Error("Proposal is not active. Cannot vote on inactive proposals.");
      }
      
      // Check if the user has already voted
      const hasAlreadyVoted = await hasVoted(proposalId);
      if (hasAlreadyVoted) {
        throw new Error("You have already voted on this proposal");
      }
      
      // Get the snapshot ID
      const snapshotId = await getProposalSnapshotId(proposalId);
      
      // Check if the user has any voting power
      const votingPower = await contracts.token.getEffectiveVotingPower(account, snapshotId);
      
      if (votingPower.isZero()) {
        throw new Error("You don't have any voting power for this proposal. You may need to delegate to yourself or acquire tokens before the snapshot.");
      }
      
      console.log(`Casting vote with ${ethers.utils.formatEther(votingPower)} voting power`);
      
      // Cast the vote with proper gas limit to prevent issues
      const tx = await contracts.governance.castVote(proposalId, voteType, {
        gasLimit: 300000 // Set a reasonable gas limit
      });
      
      const receipt = await tx.wait();
      console.log("Vote transaction confirmed:", receipt.transactionHash);
      
      // Verify the vote was actually recorded on-chain
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const votedNow = await hasVoted(proposalId);
      if (!votedNow) {
        console.warn("Transaction successful but vote not detected. This could be a UI synchronization issue.");
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
        votingPower: ethers.utils.formatEther(votingPower),
        voteType,
        transactionHash: receipt.transactionHash
      };
    } catch (err) {
      console.error("Error casting vote:", err);
      const errorMessage = err.reason || err.message || "Unknown error";
      
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

  // Clear voting state when dependencies change
  useEffect(() => {
    setVoting({
      loading: false,
      processing: false,
      error: null,
      success: false,
      lastVotedProposalId: null
    });
  }, [account, isConnected, contractsReady, refreshCounter]);

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
      
      // Calculate totals and percentages
      const totalVotes = votesByType[0] + votesByType[1] + votesByType[2];
      const totalVotingPower = votingPowerByType[0] + votingPowerByType[1] + votingPowerByType[2];
      
      return {
        // Vote counts (1 per person)
        yesVotes: votesByType[1],
        noVotes: votesByType[0],
        abstainVotes: votesByType[2],
        totalVotes,
        
        // Voting power
        yesVotingPower: votingPowerByType[1],
        noVotingPower: votingPowerByType[0],
        abstainVotingPower: votingPowerByType[2],
        totalVotingPower,
        
        // Total unique voters
        totalVoters: voterVotes.size,
        
        // Percentages based on vote counts (not voting power)
        yesPercentage: totalVotes > 0 ? (votesByType[1] / totalVotes) * 100 : 0,
        noPercentage: totalVotes > 0 ? (votesByType[0] / totalVotes) * 100 : 0,
        abstainPercentage: totalVotes > 0 ? (votesByType[2] / totalVotes) * 100 : 0
      };
    } catch (error) {
      console.error("Error indexing vote data:", error);
      return null;
    }
  }, [contracts]);

  return {
    castVote,
    hasVoted,
    getVotingPower,
    getVoteDetails,
    getProposalVoteTotals,
    getIndexedVoteData,
    voting
  };
}

// Also export as default for components using default import
export default useVoting;