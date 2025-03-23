import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { VOTE_TYPES } from '../utils/constants';

// Export as both named and default export to support both import styles
export function useVoting() {
  const { contracts, account, isConnected, contractsReady, refreshCounter } = useWeb3();
  const [voting, setVoting] = useState({
    loading: false,
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

  // ENHANCED FUNCTION: Get proposal vote totals from contract events
const getProposalVoteTotals = useCallback(async (proposalId) => {
  try {
    if (!contracts.governance || !contracts.governance.provider || !isConnected) {
      console.error("Governance contract or provider not available");
      return null;
    }
    
    console.log(`Fetching vote data for proposal #${proposalId} directly from contract...`);
    
    // APPROACH 1: Try to get votes directly from the proposal struct
    // This is the most reliable approach when it works
    try {
      // First check if the proposal exists
      const state = await contracts.governance.getProposalState(proposalId);
      console.log(`Proposal #${proposalId} exists with state:`, state);
      
      // Direct calls to get vote counts from the proposal's storage - if these exist
      // Note: This depends on your contract having these public getter methods
      try {
        if (typeof contracts.governance.getProposalVotes === 'function') {
          const voteData = await contracts.governance.getProposalVotes(proposalId);
          console.log("Retrieved vote data from contract method:", voteData);
          
          // Convert the returned values to numbers (assuming voteData has yes, no, abstain votes)
          const yesVotes = parseFloat(ethers.utils.formatEther(voteData.yesVotes || voteData[0] || 0));
          const noVotes = parseFloat(ethers.utils.formatEther(voteData.noVotes || voteData[1] || 0));
          const abstainVotes = parseFloat(ethers.utils.formatEther(voteData.abstainVotes || voteData[2] || 0));
          const totalVotes = yesVotes + noVotes + abstainVotes;
          
          return {
            yesVotes,
            noVotes,
            abstainVotes,
            totalVotes,
            totalVoters: voteData.totalVoters || 0,
            yesPercentage: totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 0,
            noPercentage: totalVotes > 0 ? (noVotes / totalVotes) * 100 : 0,
            abstainPercentage: totalVotes > 0 ? (abstainVotes / totalVotes) * 100 : 0
          };
        }
      } catch (directError) {
        console.log("No direct getter method available for proposal votes:", directError.message);
      }
    } catch (stateError) {
      console.warn("Error getting proposal state:", stateError.message);
    }
    
    // APPROACH 2: Try to get proposal data directly by accessing public mapping
    // This attempts to access the proposal struct directly through a mapping
    try {
      // Access the proposals mapping if it's public
      // This is a fallback if your contract has a public proposals mapping
      if (typeof contracts.governance.proposals === 'function') {
        const proposal = await contracts.governance.proposals(proposalId);
        console.log("Retrieved proposal data from mapping:", proposal);
        
        if (proposal && (proposal.yesVotes || proposal[3])) { // Check if we got real data
          // Convert the returned values to numbers
          const yesVotes = parseFloat(ethers.utils.formatEther(proposal.yesVotes || proposal[3] || 0));
          const noVotes = parseFloat(ethers.utils.formatEther(proposal.noVotes || proposal[4] || 0));
          const abstainVotes = parseFloat(ethers.utils.formatEther(proposal.abstainVotes || proposal[5] || 0));
          const totalVotes = yesVotes + noVotes + abstainVotes;
          
          return {
            yesVotes,
            noVotes,
            abstainVotes,
            totalVotes,
            totalVoters: proposal.totalVoters || 0,
            yesPercentage: totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 0,
            noPercentage: totalVotes > 0 ? (noVotes / totalVotes) * 100 : 0,
            abstainPercentage: totalVotes > 0 ? (abstainVotes / totalVotes) * 100 : 0
          };
        }
      }
    } catch (mappingError) {
      console.log("No public proposals mapping available:", mappingError.message);
    }
    
    // APPROACH 3: Fall back to events-based approach
    console.log("Falling back to events-based approach...");
    
    // First try to use the contract's events directly
    try {
      // Try to get all VoteCast events for this proposal
      const filter = contracts.governance.filters.VoteCast(proposalId);
      const events = await contracts.governance.queryFilter(filter);
      console.log(`Found ${events.length} VoteCast events using contract method for proposal #${proposalId}`);
      
      if (events.length > 0) {
        let yesVotes = 0, noVotes = 0, abstainVotes = 0;
        const voters = new Set();
        
        for (const event of events) {
          const { voter, support, votingPower } = event.args;
          voters.add(voter.toLowerCase());
          
          const powerValue = parseFloat(ethers.utils.formatEther(votingPower));
          console.log(`Vote by ${voter}: type=${support}, power=${powerValue}`);
          
          if (support === 0) noVotes += powerValue;
          else if (support === 1) yesVotes += powerValue;
          else if (support === 2) abstainVotes += powerValue;
        }
        
        const totalVotes = yesVotes + noVotes + abstainVotes;
        
        return {
          yesVotes,
          noVotes,
          abstainVotes,
          totalVotes,
          totalVoters: voters.size,
          yesPercentage: totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 0,
          noPercentage: totalVotes > 0 ? (noVotes / totalVotes) * 100 : 0,
          abstainPercentage: totalVotes > 0 ? (abstainVotes / totalVotes) * 100 : 0
        };
      }
    } catch (eventError) {
      console.log("Error using contract events directly:", eventError.message);
    }
    
    // APPROACH 4: If all else fails, use low-level getLogs approach
    try {
      // Use a more generic approach with getLogs
      const eventSignature = "VoteCast(uint256,address,uint8,uint256)";
      const eventTopic = ethers.utils.id(eventSignature);
      
      const filter = {
        address: contracts.governance.address,
        topics: [
          eventTopic,
          ethers.utils.hexZeroPad(ethers.utils.hexlify(proposalId), 32)
        ],
        fromBlock: 0,
        toBlock: 'latest'
      };
      
      const logs = await contracts.governance.provider.getLogs(filter);
      console.log(`Found ${logs.length} VoteCast events for proposal #${proposalId} using getLogs`);
      
      if (logs.length > 0) {
        let yesVotes = 0, noVotes = 0, abstainVotes = 0;
        const voters = new Set();
        
        const voteInterface = new ethers.utils.Interface([
          "event VoteCast(uint256 indexed proposalId, address indexed voter, uint8 support, uint256 votingPower)"
        ]);
        
        for (const log of logs) {
          try {
            const parsedLog = voteInterface.parseLog(log);
            const voter = parsedLog.args.voter.toLowerCase();
            const support = Number(parsedLog.args.support);
            
            // Handle different types of BigNumber formats with proper error logging
            let votingPower = 0;
            try {
              if (parsedLog.args.votingPower._isBigNumber) {
                votingPower = parseFloat(ethers.utils.formatEther(parsedLog.args.votingPower));
              } else if (typeof parsedLog.args.votingPower === 'object') {
                votingPower = parseFloat(ethers.utils.formatEther(parsedLog.args.votingPower.toString()));
              } else {
                votingPower = parseFloat(ethers.utils.formatEther(parsedLog.args.votingPower));
              }
            } catch (powerError) {
              console.error("Error parsing voting power:", powerError);
              // Try direct conversion as fallback
              try {
                votingPower = Number(parsedLog.args.votingPower) / 1e18;
              } catch (fallbackError) {
                console.error("Fallback conversion failed:", fallbackError);
              }
            }
            
            console.log(`Vote from ${voter}: type=${support}, power=${votingPower}`);
            voters.add(voter);
            
            if (support === 0) noVotes += votingPower;
            else if (support === 1) yesVotes += votingPower;
            else if (support === 2) abstainVotes += votingPower;
          } catch (parseError) {
            console.warn("Error parsing log:", parseError);
          }
        }
        
        const totalVotes = yesVotes + noVotes + abstainVotes;
        console.log(`Vote tally for proposal #${proposalId}:`, {
          yesVotes, noVotes, abstainVotes, totalVotes, totalVoters: voters.size
        });
        
        return {
          yesVotes,
          noVotes,
          abstainVotes,
          totalVotes,
          totalVoters: voters.size,
          yesPercentage: totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 0,
          noPercentage: totalVotes > 0 ? (noVotes / totalVotes) * 100 : 0,
          abstainPercentage: totalVotes > 0 ? (abstainVotes / totalVotes) * 100 : 0
        };
      }
    } catch (lowLevelError) {
      console.error("Error with low-level getLogs approach:", lowLevelError);
    }
    
    // APPROACH 5: Direct access to proposalVoterInfo
    // We can try to check each address's voting info for this proposal
    try {
      // If we have the current account, at least check its vote
      if (account) {
        const voterInfo = await contracts.governance.proposalVoterInfo(proposalId, account);
        if (!voterInfo.isZero()) {
          console.log(`Found voter info for current account: power=${ethers.utils.formatEther(voterInfo)}`);
          
          // We can't determine vote direction this way, but we can at least show some votes exist
          const votePower = parseFloat(ethers.utils.formatEther(voterInfo));
          
          // We can try to get direction from our state
          let direction = 1; // Default to "yes" if we can't determine
          
          return {
            yesVotes: direction === 1 ? votePower : 0,
            noVotes: direction === 0 ? votePower : 0,
            abstainVotes: direction === 2 ? votePower : 0,
            totalVotes: votePower,
            totalVoters: 1,
            yesPercentage: direction === 1 ? 100 : 0,
            noPercentage: direction === 0 ? 100 : 0,
            abstainPercentage: direction === 2 ? 100 : 0
          };
        }
      }
    } catch (voterInfoError) {
      console.log("Error checking proposalVoterInfo:", voterInfoError.message);
    }
    
    // Last resort: If we couldn't get data from any approach, return zeros
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
}, [contracts, isConnected, account]);

  // Enhanced vote casting with better error handling and immediate vote data update
  const castVote = async (proposalId, voteType) => {
    if (!isConnected || !contractsReady) throw new Error("Not connected to blockchain");
    if (!contracts.governance) throw new Error("Governance contract not initialized");
    
    try {
      setVoting({ 
        loading: true, 
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
      
      // Get the snapshot ID using our new approach
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
      
      // Try to update vote data immediately after successful vote
      try {
        // Force a small delay to allow the blockchain to update
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Manually check for the new vote event
        const voteFilter = contracts.governance.filters.VoteCast(proposalId, account);
        const voteEvents = await contracts.governance.queryFilter(voteFilter, receipt.blockNumber, receipt.blockNumber);
        
        if (voteEvents.length > 0) {
          console.log("Vote event confirmed on chain:", voteEvents[0]);
        } else {
          console.warn("Vote transaction successful but event not found. This is unusual.");
        }
      } catch (updateErr) {
        console.warn("Error checking for vote event after transaction:", updateErr);
      }
      
      setVoting({ 
        loading: false, 
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
        error: errorMessage, 
        success: false,
        lastVotedProposalId: null
      });
      
      throw err;
    }
  };
  
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

  // Clear voting state when dependencies change
  useEffect(() => {
    setVoting({
      loading: false,
      error: null,
      success: false,
      lastVotedProposalId: null
    });
  }, [account, isConnected, contractsReady, refreshCounter]);

  return {
    castVote,
    hasVoted,
    getVotingPower,
    getVoteDetails,
    getProposalVoteTotals, // Added the new function to the return object
    voting
  };
}

// Also export as default for components using default import
export default useVoting;