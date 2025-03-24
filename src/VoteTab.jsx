import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

import { Clock, Check, X, X as XIcon, Calendar, Users, BarChart2 } from 'lucide-react';
import { PROPOSAL_STATES, VOTE_TYPES } from '../utils/constants';
import { formatCountdown } from '../utils/formatters';
import Loader from './Loader';

const VoteTab = ({ proposals, castVote, hasVoted, getVotingPower, getProposalVoteTotals, voting, account, governanceContract, provider, contractAddress }) => {
  const [voteFilter, setVoteFilter] = useState('active');
  const [votingPowers, setVotingPowers] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [quorum, setQuorum] = useState(null);
  const [proposalVotes, setProposalVotes] = useState({});
  
  // Track locally which proposals the user has voted on and how
  const [votedProposals, setVotedProposals] = useState({});
  // Track pending transactions to show optimistic UI updates
  const [pendingVotes, setPendingVotes] = useState({});
  
  // Function to get vote data from blockchain events - more reliable than contract methods in some cases
  const getEventBasedVoteData = useCallback(async (proposalId) => {
    try {
      if (!governanceContract || !provider) {
        console.error("Governance contract or provider not available");
        return null;
      }
      
      console.log(`Querying blockchain events for proposal #${proposalId}...`);
      
      // Get all VoteCast events for this proposal
      const filter = governanceContract.filters.VoteCast(proposalId);
      const events = await governanceContract.queryFilter(filter);
      console.log(`Found ${events.length} VoteCast events for proposal #${proposalId}`);
      
      if (events.length === 0) {
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
      
      // Use maps to track the latest vote for each voter
      const voterVotes = new Map(); // address -> {type, power}
      
      // Process all events to build an accurate picture
      for (const event of events) {
        try {
          const { voter, support, votingPower } = event.args;
          const voterAddress = voter.toLowerCase();
          const powerValue = parseFloat(ethers.utils.formatEther(votingPower));
          
          // Store or update this voter's vote (only keeping most recent)
          voterVotes.set(voterAddress, {
            type: Number(support),
            power: powerValue
          });
        } catch (error) {
          console.warn("Error processing vote event:", error);
        }
      }
      
      // Count total unique voters
      const totalVoters = voterVotes.size;
      
      // Initialize vote counts
      let votesByType = {0: 0, 1: 0, 2: 0}; // Count of voters
      let votingPowerByType = {0: 0, 1: 0, 2: 0}; // Total voting power
      
      // Count votes by type
      for (const [, voteData] of voterVotes.entries()) {
        const { type, power } = voteData;
        
        // Count the voter (1 vote per person)
        votesByType[type]++;
        
        // Add their voting power
        votingPowerByType[type] += power;
      }
      
      // Calculate totals
      const totalVotes = votesByType[0] + votesByType[1] + votesByType[2]; // Total unique voters
      const totalVotingPower = votingPowerByType[0] + votingPowerByType[1] + votingPowerByType[2]; // Total voting power
      
      // Calculate percentages based on voting power (not count)
      const yesPercentage = totalVotingPower > 0 ? (votingPowerByType[1] / totalVotingPower) * 100 : 0;
      const noPercentage = totalVotingPower > 0 ? (votingPowerByType[0] / totalVotingPower) * 100 : 0;
      const abstainPercentage = totalVotingPower > 0 ? (votingPowerByType[2] / totalVotingPower) * 100 : 0;
      
      return {
        yesVotes: votesByType[1],
        noVotes: votesByType[0],
        abstainVotes: votesByType[2],
        totalVotes,
        yesVotingPower: votingPowerByType[1],
        noVotingPower: votingPowerByType[0],
        abstainVotingPower: votingPowerByType[2],
        totalVotingPower,
        totalVoters,
        yesPercentage,
        noPercentage,
        abstainPercentage,
        source: 'events'
      };
    } catch (error) {
      console.error("Error querying blockchain events:", error);
      return null;
    }
  }, [governanceContract, provider]);

  // Function to fetch proposal vote data combining multiple sources
  const fetchProposalVotes = useCallback(async (proposalId) => {
    try {
      if (!governanceContract || !getProposalVoteTotals) {
        return null;
      }
      
      console.log(`Fetching vote data for proposal #${proposalId}`);
      
      // Try different methods to get vote data - start with most reliable
      let blockchainData = null;
      
      // 1. First try direct contract call to getProposalVotes
      try {
        blockchainData = await getProposalVoteTotals(proposalId);
        console.log(`Got vote data from contract for proposal #${proposalId}:`, blockchainData);
      } catch (error) {
        console.warn(`Error calling getProposalVoteTotals for proposal #${proposalId}:`, error);
      }
      
      // 2. If that fails, try getting data from blockchain events
      if (!blockchainData) {
        try {
          blockchainData = await getEventBasedVoteData(proposalId);
          console.log(`Got vote data from events for proposal #${proposalId}:`, blockchainData);
        } catch (error) {
          console.warn(`Error getting event data for proposal #${proposalId}:`, error);
        }
      }
      
      // Check if we got data from either method
      if (!blockchainData) {
        console.warn(`Could not get blockchain data for proposal #${proposalId}`);
        return null;
      }
      
      // Add pending votes (optimistic UI for this user's recent votes)
      let voteData = {...blockchainData};
      const pendingVote = pendingVotes[proposalId];
      
      // Only apply pending votes if they're recent (less than 1 minute old) and not yet confirmed
      if (pendingVote && (Date.now() - pendingVote.timestamp) < 60000) {
        console.log(`Applying pending vote for proposal #${proposalId}:`, pendingVote);
        
        // Only apply the pending vote if it's not already counted in blockchain data
        if (!votedProposals[proposalId] || blockchainData.totalVoters === 0) {
          // Add the pending vote to the appropriate category
          if (pendingVote.voteType === VOTE_TYPES.FOR) {
            voteData.yesVotes += 1;
            voteData.yesVotingPower += pendingVote.votingPower || 1;
          } else if (pendingVote.voteType === VOTE_TYPES.AGAINST) {
            voteData.noVotes += 1;
            voteData.noVotingPower += pendingVote.votingPower || 1;
          } else if (pendingVote.voteType === VOTE_TYPES.ABSTAIN) {
            voteData.abstainVotes += 1;
            voteData.abstainVotingPower += pendingVote.votingPower || 1;
          }
          
          // Update totals
          voteData.totalVotes += 1;
          voteData.totalVoters += 1;
          voteData.totalVotingPower += pendingVote.votingPower || 1;
          
          // Recalculate percentages
          const totalVotingPower = voteData.totalVotingPower || 1;
          voteData.yesPercentage = (voteData.yesVotingPower / totalVotingPower) * 100;
          voteData.noPercentage = (voteData.noVotingPower / totalVotingPower) * 100;
          voteData.abstainPercentage = (voteData.abstainVotingPower / totalVotingPower) * 100;
          
          // Mark as including optimistic updates
          voteData.includesPending = true;
        }
      }
      
      // Return the combined data
      return voteData;
    } catch (error) {
      console.error(`Error fetching votes for proposal #${proposalId}:`, error);
      return null;
    }
  }, [getProposalVoteTotals, getEventBasedVoteData, governanceContract, pendingVotes, votedProposals]);

  // Poll for updated vote data with exponential backoff after a vote
  const refreshProposalWithBackoff = useCallback(async (proposalId) => {
    // Retry multiple times with increasing delays to handle blockchain latency
    let currentDelay = 2000; // Start with 2 seconds
    const maxDelay = 10000; // Max delay of 10 seconds
    const maxRetries = 5;
    
    for (let retry = 0; retry < maxRetries; retry++) {
      await new Promise(resolve => setTimeout(resolve, currentDelay));
      
      // Try to fetch the latest data
      try {
        const freshData = await fetchProposalVotes(proposalId);
        if (freshData) {
          console.log(`Refreshed data for proposal #${proposalId} (retry ${retry+1}):`, freshData);
          setProposalVotes(prev => ({
            ...prev,
            [proposalId]: freshData
          }));
          
          // If we received data with the total voters > 0, we can stop retrying
          if (freshData.totalVoters > 0) {
            console.log(`Received valid data with ${freshData.totalVoters} voters - stopping retries`);
            break;
          }
        }
      } catch (err) {
        console.warn(`Error refreshing proposal #${proposalId} (retry ${retry+1}):`, err);
      }
      
      // Increase delay for next attempt (exponential backoff)
      currentDelay = Math.min(currentDelay * 1.5, maxDelay);
    }
  }, [fetchProposalVotes]);

  // Function to refresh all proposal vote data
  const refreshAllProposals = useCallback(async () => {
    if (!proposals.length) return;
    
    setLoading(true);
    try {
      // Fetch data for all proposals
      const results = await Promise.all(
        proposals.map(async (proposal) => {
          try {
            return { 
              id: proposal.id, 
              data: await fetchProposalVotes(proposal.id)
            };
          } catch (error) {
            console.error(`Error refreshing proposal #${proposal.id}:`, error);
            return { id: proposal.id, data: null };
          }
        })
      );
      
      // Update state with any successful results
      const newVotes = {...proposalVotes};
      let hasUpdates = false;
      
      results.forEach(result => {
        if (result.data) {
          newVotes[result.id] = result.data;
          hasUpdates = true;
        }
      });
      
      if (hasUpdates) {
        setProposalVotes(newVotes);
      }
    } catch (error) {
      console.error("Error refreshing all proposals:", error);
    } finally {
      setLoading(false);
    }
  }, [proposals, fetchProposalVotes, proposalVotes]);

  // Poll for vote data on interval
  useEffect(() => {
    // Don't poll if there are no proposals
    if (!proposals.length) return;
    
    // Initial load
    refreshAllProposals();
    
    // Setup polling interval
    const pollInterval = setInterval(() => {
      refreshAllProposals();
    }, 10000); // Poll every 10 seconds
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [proposals, refreshAllProposals]);

  // Fetch voting powers for each proposal
  useEffect(() => {
    const fetchVotingPowers = async () => {
      if (!getVotingPower || !proposals.length || !account) return;
      
      const powers = {};
      for (const proposal of proposals) {
        try {
          if (proposal.snapshotId) {
            const power = await getVotingPower(proposal.snapshotId);
            powers[proposal.id] = power;
          }
        } catch (err) {
          console.error(`Error getting voting power for proposal ${proposal.id}:`, err);
          powers[proposal.id] = "0";
        }
      }
      
      setVotingPowers(powers);
    };
    
    fetchVotingPowers();
  }, [getVotingPower, proposals, account]);

  // Initialize votedProposals from the proposals data
  useEffect(() => {
    const voted = {};
    proposals.forEach(proposal => {
      if (proposal.hasVoted) {
        // Set default vote type to abstain if not specified
        let voteType = VOTE_TYPES.ABSTAIN;
        if (proposal.votedYes) voteType = VOTE_TYPES.FOR;
        if (proposal.votedNo) voteType = VOTE_TYPES.AGAINST;
        
        voted[proposal.id] = voteType;
      }
    });
    setVotedProposals(voted);
  }, [proposals]);
  
  // Fetch quorum from governance contract
  useEffect(() => {
    const fetchQuorum = async () => {
      if (!governanceContract) return;
      
      try {
        // Call the governanceContract to get the govParams
        const params = await governanceContract.govParams();
        if (params && params.quorum) {
          // Convert from wei or other base units if necessary
          const quorumValue = parseInt(params.quorum.toString());
          setQuorum(quorumValue);
          console.log("Fetched quorum:", quorumValue);
        }
      } catch (error) {
        console.error("Error fetching quorum:", error);
      }
    };
    
    fetchQuorum();
  }, [governanceContract]);

  // Filter proposals based on vote status
  const filteredProposals = proposals.filter(proposal => {
    // Check if we've locally voted on this proposal
    const locallyVoted = votedProposals[proposal.id] !== undefined;
    
    if (voteFilter === 'active') {
      // Only check if proposal is active, don't exclude based on vote status
      return proposal.state === PROPOSAL_STATES.ACTIVE;
    } else if (voteFilter === 'voted') {
      return proposal.hasVoted || locallyVoted;
    }
    return true; // 'all' filter
  });

  // Check if the user has voted on the proposal (either from data or local state)
  const hasUserVoted = useCallback((proposal) => {
    return proposal.hasVoted || votedProposals[proposal.id] !== undefined;
  }, [votedProposals]);
  
  // Get the vote type
  const getUserVoteType = useCallback((proposal) => {
    // First check our local state
    if (votedProposals[proposal.id] !== undefined) {
      return votedProposals[proposal.id];
    }
    
    // Then fall back to the proposal data
    if (proposal.votedYes) return VOTE_TYPES.FOR;
    if (proposal.votedNo) return VOTE_TYPES.AGAINST;
    if (proposal.hasVoted) return VOTE_TYPES.ABSTAIN;
    
    return null;
  }, [votedProposals]);

  // Function to submit a vote with better error handling
  const submitVote = async (proposalId, support) => {
    try {
      // Find the proposal in the list
      const proposal = proposals.find(p => p.id === proposalId);
      if (!proposal) {
        console.error("Proposal not found:", proposalId);
        return;
      }
      
      console.log(`Submitting vote for proposal #${proposalId} with type ${support}`);
      
      // Get the user's voting power for this proposal
      let userVotingPower = parseFloat(votingPowers[proposalId] || "0");
      if (userVotingPower <= 0) {
        // Try to get the voting power one more time
        try {
          if (proposal.snapshotId && getVotingPower) {
            const refreshedPower = await getVotingPower(proposal.snapshotId);
            userVotingPower = parseFloat(refreshedPower);
          }
        } catch (err) {
          console.warn("Error refreshing voting power:", err);
        }
        
        // If still 0, use a minimum value for UI
        if (userVotingPower <= 0) {
          userVotingPower = 1;
        }
      }
      
      // Create the pending vote for optimistic UI
      const pendingVote = {
        proposalId,
        voteType: support,
        votingPower: userVotingPower,
        timestamp: Date.now()
      };
      
      // Update pending votes state for optimistic UI
      setPendingVotes(prev => ({
        ...prev,
        [proposalId]: pendingVote
      }));
      
      // Update proposal votes with optimistic data before blockchain confirms
      const currentVotes = proposalVotes[proposalId] || {
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
      
      // Create optimistic update that adds this vote to existing data
      const optimisticVotes = {...currentVotes};
      
      // Only add our vote if we haven't already voted (according to blockchain data)
      // We don't want to double-count votes
      if (!hasUserVoted(proposal)) {
        if (support === VOTE_TYPES.FOR) {
          optimisticVotes.yesVotes += 1;
          optimisticVotes.yesVotingPower += userVotingPower;
        } else if (support === VOTE_TYPES.AGAINST) {
          optimisticVotes.noVotes += 1;
          optimisticVotes.noVotingPower += userVotingPower;
        } else {
          optimisticVotes.abstainVotes += 1;
          optimisticVotes.abstainVotingPower += userVotingPower;
        }
        
        // Update totals
        optimisticVotes.totalVotes += 1;
        optimisticVotes.totalVoters += 1;
        optimisticVotes.totalVotingPower += userVotingPower;
        
        // Recalculate percentages
        const totalVotingPower = optimisticVotes.totalVotingPower || 1;
        optimisticVotes.yesPercentage = (optimisticVotes.yesVotingPower / totalVotingPower) * 100;
        optimisticVotes.noPercentage = (optimisticVotes.noVotingPower / totalVotingPower) * 100;
        optimisticVotes.abstainPercentage = (optimisticVotes.abstainVotingPower / totalVotingPower) * 100;
        
        // Mark as optimistic update
        optimisticVotes.isOptimistic = true;
        
        // Update the UI immediately (optimistically)
        setProposalVotes(prev => ({
          ...prev,
          [proposalId]: optimisticVotes
        }));
      }
      
      // Actually send the vote transaction to the blockchain
      const result = await castVote(proposalId, support);
      console.log("Vote transaction confirmed:", result);
      
      // Update the voted proposals state (local tracking of user votes)
      setVotedProposals(prev => ({
        ...prev,
        [proposalId]: support
      }));
      
      // Start polling with backoff to get the latest data after our vote
      refreshProposalWithBackoff(proposalId);
      
      return result;
    } catch (error) {
      console.error("Error submitting vote:", error);
      
      // Remove the pending vote since the transaction failed
      setPendingVotes(prev => {
        const updated = {...prev};
        delete updated[proposalId];
        return updated;
      });
      
      // Refresh the vote data to ensure UI is correct
      refreshProposalWithBackoff(proposalId);
      
      // Propagate the error
      throw error;
    }
  };

  // Helper to convert vote type to text
  const getVoteTypeText = (voteType) => {
    if (voteType === VOTE_TYPES.FOR) return 'Yes';
    if (voteType === VOTE_TYPES.AGAINST) return 'No';
    if (voteType === VOTE_TYPES.ABSTAIN) return 'Abstain';
    return '';
  };

  // Function to calculate vote data for display 
  const getVoteData = useCallback((proposal) => {
    // Get data from the proposalVotes state
    const voteData = proposalVotes[proposal.id];
    
    // If we have vote data, return it
    if (voteData) {
      return voteData;
    }
    
    // If we have a pending vote for this proposal, create synthetic data
    const pendingVote = pendingVotes[proposal.id];
    if (pendingVote) {
      // Create synthetic data based on the pending vote
      return {
        yesVotes: pendingVote.voteType === VOTE_TYPES.FOR ? 1 : 0,
        noVotes: pendingVote.voteType === VOTE_TYPES.AGAINST ? 1 : 0,
        abstainVotes: pendingVote.voteType === VOTE_TYPES.ABSTAIN ? 1 : 0,
        totalVotes: 1,
        yesVotingPower: pendingVote.voteType === VOTE_TYPES.FOR ? pendingVote.votingPower : 0,
        noVotingPower: pendingVote.voteType === VOTE_TYPES.AGAINST ? pendingVote.votingPower : 0,
        abstainVotingPower: pendingVote.voteType === VOTE_TYPES.ABSTAIN ? pendingVote.votingPower : 0,
        totalVotingPower: pendingVote.votingPower,
        totalVoters: 1,
        yesPercentage: pendingVote.voteType === VOTE_TYPES.FOR ? 100 : 0,
        noPercentage: pendingVote.voteType === VOTE_TYPES.AGAINST ? 100 : 0,
        abstainPercentage: pendingVote.voteType === VOTE_TYPES.ABSTAIN ? 100 : 0,
        isPending: true
      };
    }
    
    // Return empty data if nothing else available
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
  }, [proposalVotes, pendingVotes]);

  // Render vote percentage bar based on voting power
  const renderVoteBar = useCallback((proposal) => {
    const voteData = getVoteData(proposal);
    
    // If there's no voting power, show empty bar
    if (voteData.totalVotingPower <= 0) {
      return (
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full w-full bg-gray-300"></div>
        </div>
      );
    }
    
    // Show vote percentages with color coding
    return (
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="flex h-full">
          <div 
            className="bg-green-500 h-full" 
            style={{ width: `${voteData.yesPercentage}%` }}
          ></div>
          <div 
            className="bg-red-500 h-full" 
            style={{ width: `${voteData.noPercentage}%` }}
          ></div>
          <div 
            className="bg-gray-400 h-full" 
            style={{ width: `${voteData.abstainPercentage}%` }}
          ></div>
        </div>
      </div>
    );
  }, [getVoteData]);

  // Determine if a proposal has a pending vote
  const hasPendingVote = useCallback((proposalId) => {
    return pendingVotes[proposalId] !== undefined && 
           (Date.now() - pendingVotes[proposalId].timestamp) < 60000; // Consider pending if less than 1 minute old
  }, [pendingVotes]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Vote</h2>
        <p className="text-gray-500">Cast your votes on active proposals</p>
      </div>
      
      {/* Filter options */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex flex-wrap gap-2">
          {['active', 'voted', 'all'].map(filter => (
            <button
              key={filter}
              className={`px-3 py-1 rounded-full text-sm ${voteFilter === filter ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}
              onClick={() => setVoteFilter(filter)}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Voting cards */}
      <div className="space-y-6">
        {voting.loading || loading ? (
          <div className="flex justify-center py-8">
            <Loader size="large" text="Loading proposals..." />
          </div>
        ) : filteredProposals.length > 0 ? (
          filteredProposals.map((proposal, idx) => {
            // Get voting power for this proposal
            const votingPower = votingPowers[proposal.id] || "0";
            const hasVotingPower = parseFloat(votingPower) > 0;
            
            // Check if the user has voted
            const userVoted = hasUserVoted(proposal);
            const voteType = getUserVoteType(proposal);
            
            // Get vote data
            const voteData = getVoteData(proposal);
            const isPending = hasPendingVote(proposal.id);
            
            return (
              <div key={idx} className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-medium">{proposal.title}</h3>
                    <p className="text-xs text-gray-500">Proposal #{proposal.id}</p>
                  </div>
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatCountdown(proposal.deadline)}
                  </span>
                </div>
                
                <p className="text-gray-700 mb-4">{proposal.description.substring(0, 150)}...</p>
                
                {/* Vote data display */}
                <div className="mb-4">
                  {/* Vote percentages */}
                  <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm mb-2">
                    <div className="text-green-600 font-medium">Yes: {voteData.yesPercentage.toFixed(1)}%</div>
                    <div className="text-red-600 font-medium text-center">No: {voteData.noPercentage.toFixed(1)}%</div>
                    <div className="text-gray-600 font-medium text-right">Abstain: {voteData.abstainPercentage.toFixed(1)}%</div>
                  </div>
                  
                  {/* Vote bar */}
                  {renderVoteBar(proposal)}
                  
                  {/* Vote counts */}
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 mt-1">
                    <div>{voteData.yesVotes} voter{voteData.yesVotes !== 1 && 's'}</div>
                    <div className="text-center">{voteData.noVotes} voter{voteData.noVotes !== 1 && 's'}</div>
                    <div className="text-right">{voteData.abstainVotes} voter{voteData.abstainVotes !== 1 && 's'}</div>
                  </div>
                  
                  {/* Voting power section */}
                  <div className="mt-3 text-xs text-gray-500">
                    <div className="flex justify-between mb-1">
                      <span>Voting Power:</span>
                      <span>{Math.round(voteData.totalVotingPower || 0).toLocaleString()} JUST total</span>
                    </div>
                    
                    {/* Display voting power values */}
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 mt-1">
                      <div>{Math.round(voteData.yesVotingPower || 0).toLocaleString()} JUST</div>
                      <div className="text-center">{Math.round(voteData.noVotingPower || 0).toLocaleString()} JUST</div>
                      <div className="text-right">{Math.round(voteData.abstainVotingPower || 0).toLocaleString()} JUST</div>
                    </div>
                  </div>
                  
                  {/* Show if the data includes pending votes */}
                  {isPending && (
                    <div className="text-xs text-yellow-600 mt-2 italic">
                      Vote in progress, waiting for blockchain confirmation...
                    </div>
                  )}
                  
                  {/* Total voters count */}
                  <div className="text-xs text-gray-500 mt-2 text-right">
                    Total voters: {voteData.totalVoters || 0}
                  </div>
                </div>
                
                {userVoted ? (
                  <div className="flex items-center text-sm text-gray-700">
                    <span className="mr-2">You voted:</span>
                    <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                      {getVoteTypeText(voteType)}
                    </span>
                  </div>
                ) : proposal.state === PROPOSAL_STATES.ACTIVE && (
                  <div>
                    {hasVotingPower ? (
                      <div>
                        <div className="mb-2 text-sm text-gray-600">
                          Your voting power: {votingPower} JUST
                        </div>
                        
                        {quorum && (
                          <div className="mt-4">
                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                              <span>Quorum Progress</span>
                              <span>
                                {Math.round(voteData.totalVotingPower || 0).toLocaleString()} / {quorum.toLocaleString()} JUST
                                ({Math.min(100, Math.round((voteData.totalVotingPower / quorum) * 100))}%)
                              </span>
                            </div>
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="bg-blue-500 h-full rounded-full" 
                                style={{ width: `${Math.min(100, (voteData.totalVotingPower / quorum) * 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-4">
                          <button 
                            className="flex-1 min-w-0 bg-green-500 hover:bg-green-600 text-white py-2 px-1 rounded-md flex items-center justify-center text-xs sm:text-sm"
                            onClick={() => submitVote(proposal.id, VOTE_TYPES.FOR)}
                            disabled={voting.processing || isPending}
                          >
                            <Check className="w-3 h-3 sm:w-4 sm:h-4 mr-1 flex-shrink-0" />
                            <span className="truncate">Yes</span>
                          </button>
                          <button 
                            className="flex-1 min-w-0 bg-red-500 hover:bg-red-600 text-white py-2 px-1 rounded-md flex items-center justify-center text-xs sm:text-sm"
                            onClick={() => submitVote(proposal.id, VOTE_TYPES.AGAINST)}
                            disabled={voting.processing || isPending}
                          >
                            <X className="w-3 h-3 sm:w-4 sm:h-4 mr-1 flex-shrink-0" />
                            <span className="truncate">No</span>
                          </button>
                          <button 
                            className="flex-1 min-w-0 bg-gray-500 hover:bg-gray-600 text-white py-2 px-1 rounded-md flex items-center justify-center text-xs sm:text-sm"
                            onClick={() => submitVote(proposal.id, VOTE_TYPES.ABSTAIN)}
                            disabled={voting.processing || isPending}
                          >
                            <span className="truncate">Abstain</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-2 text-red-500">
                        You don't have voting power for this proposal. You may need to delegate to yourself or acquire tokens before the snapshot.
                      </div>
                    )}
                  </div>
                )}
                
                <div className="mt-4 text-center">
                  <button 
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                    onClick={() => {
                      setSelectedProposal(proposal);
                      setShowModal(true);
                    }}
                  >
                    View Full Details
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-gray-500">
            No proposals found for this filter
          </div>
        )}
      </div>
      
      {/* Proposal Details Modal */}
      {showModal && selectedProposal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start p-4 border-b">
              <div>
                <h3 className="text-xl font-semibold">{selectedProposal.title}</h3>
                <p className="text-sm text-gray-500">Proposal #{selectedProposal.id}</p>
              </div>
              <button 
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setShowModal(false)}
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4">
              {/* Proposal type and status */}
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded-full">
                  {selectedProposal.proposalType || "General Proposal"}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  selectedProposal.state === PROPOSAL_STATES.ACTIVE 
                    ? "bg-yellow-100 text-yellow-800"
                    : selectedProposal.state === PROPOSAL_STATES.SUCCEEDED
                    ? "bg-green-100 text-green-800"
                    : selectedProposal.state === PROPOSAL_STATES.DEFEATED
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-800"
                }`}>
                  {PROPOSAL_STATES[selectedProposal.state] || "Active"}
                </span>
              </div>
              
              {/* Proposal metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="flex items-center text-sm">
                  <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                  <div>
                    <span className="text-gray-600">Created:</span> {new Date(selectedProposal.createdAt*1000).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center text-sm">
                  <Clock className="w-4 h-4 mr-2 text-gray-500" />
                  <div>
                    <span className="text-gray-600">Deadline:</span> {formatCountdown(selectedProposal.deadline)}
                  </div>
                </div>
                <div className="flex items-center text-sm">
                  <Users className="w-4 h-4 mr-2 text-gray-500" />
                  <div>
                    <span className="text-gray-600">Proposer:</span> {selectedProposal.proposer?.substring(0, 6)}...{selectedProposal.proposer?.slice(-4)}
                  </div>
                </div>
                <div className="flex items-center text-sm">
                  <BarChart2 className="w-4 h-4 mr-2 text-gray-500" />
                  <div>
                    <span className="text-gray-600">Quorum:</span> {quorum ? `${quorum.toLocaleString()} JUST` : "Loading..."}
                  </div>
                </div>
              </div>
              
              {/* Full description */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
                <div className="bg-gray-50 p-3 rounded border text-sm whitespace-pre-wrap">
                  {selectedProposal.description}
                </div>
              </div>
              
              {/* Vote results */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Voting Results</h4>
                <div className="bg-gray-50 p-4 rounded border">
                  {(() => {
                    const voteData = getVoteData(selectedProposal);
                    const isPending = hasPendingVote(selectedProposal.id);
                    
                    return (
                      <>
                        {/* Vote counts */}
                        <h5 className="text-sm font-medium mb-3">Vote Counts (1 vote per person)</h5>
                        
                        <div className="grid grid-cols-3 gap-4 text-center mb-3">
                          <div>
                            <div className="text-green-600 font-medium">{voteData.yesVotes}</div>
                            <div className="text-xs text-gray-500">Yes Votes</div>
                          </div>
                          <div>
                            <div className="text-red-600 font-medium">{voteData.noVotes}</div>
                            <div className="text-xs text-gray-500">No Votes</div>
                          </div>
                          <div>
                            <div className="text-gray-600 font-medium">{voteData.abstainVotes}</div>
                            <div className="text-xs text-gray-500">Abstain</div>
                          </div>
                        </div>
                        
                        {/* Percentage labels */}
                        <div className="grid grid-cols-3 gap-4 text-center mb-3 text-xs text-gray-500">
                          <div>Yes: {voteData.yesPercentage.toFixed(1)}%</div>
                          <div>No: {voteData.noPercentage.toFixed(1)}%</div>
                          <div>Abstain: {voteData.abstainPercentage.toFixed(1)}%</div>
                        </div>
                        
                        {/* Vote bar */}
                        {renderVoteBar(selectedProposal)}
                        
                        {/* Show pending vote notice if applicable */}
                        {isPending && (
                          <div className="text-xs text-yellow-600 mt-2 italic text-center">
                            Vote in progress, waiting for blockchain confirmation...
                          </div>
                        )}
                        
                        {/* Total voters count */}
                        <div className="text-center text-xs text-gray-500 mt-3 mb-5">
                          Total voters: {voteData.totalVoters || 0}
                        </div>
                        
                        {/* Voting power heading */}
                        <h5 className="text-sm font-medium mt-5 mb-3">Voting Power Distribution</h5>
                        
                        {/* Voting power display */}
                        <div className="grid grid-cols-3 gap-4 text-center mb-3">
                          <div>
                            <div className="text-green-600 font-medium">{Math.round(voteData.yesVotingPower || 0).toLocaleString()}</div>
                            <div className="text-xs text-gray-500">Yes JUST</div>
                          </div>
                          <div>
                            <div className="text-red-600 font-medium">{Math.round(voteData.noVotingPower || 0).toLocaleString()}</div>
                            <div className="text-xs text-gray-500">No JUST</div>
                          </div>
                          <div>
                            <div className="text-gray-600 font-medium">{Math.round(voteData.abstainVotingPower || 0).toLocaleString()}</div>
                            <div className="text-xs text-gray-500">Abstain JUST</div>
                          </div>
                        </div>
                        
                        {/* Total voting power */}
                        <div className="text-center text-xs text-gray-500 mt-3">
                          Total voting power: {Math.round(voteData.totalVotingPower || 0).toLocaleString()} JUST
                        </div>
                      </>
                    );
                  })()}
                  
                  {/* User's vote */}
                  {hasUserVoted(selectedProposal) && (
                    <div className="mt-5 text-center text-sm">
                      <span className="text-gray-600">Your vote:</span> 
                      <span className={`ml-1 font-medium ${
                        getUserVoteType(selectedProposal) === VOTE_TYPES.FOR 
                          ? "text-green-600" 
                          : getUserVoteType(selectedProposal) === VOTE_TYPES.AGAINST
                          ? "text-red-600" 
                          : "text-gray-600"
                      }`}>
                        {getVoteTypeText(getUserVoteType(selectedProposal))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Additional proposal details */}
              {selectedProposal.actions && selectedProposal.actions.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Actions</h4>
                  <div className="bg-gray-50 p-3 rounded border">
                    <ul className="list-disc pl-5 text-sm">
                      {selectedProposal.actions.map((action, i) => (
                        <li key={i} className="mb-1">{action}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              
              {/* Transaction details if available */}
              {selectedProposal.txHash && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Transaction Hash</h4>
                  <div className="bg-gray-50 p-3 rounded border text-sm break-all">
                    {selectedProposal.txHash}
                  </div>
                </div>
              )}
            </div>
            
            <div className="border-t p-4 flex justify-end">
              <button
                className="px-4 py-2 bg-gray-200 rounded-md text-gray-800 hover:bg-gray-300"
                onClick={() => setShowModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoteTab;