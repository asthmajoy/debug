import React, { useState, useEffect } from 'react';
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
  
  // Function to get accurate vote data from events
  const getEventBasedVoteData = async (proposalId) => {
    try {
      if (!governanceContract || !provider) {
        console.error("Governance contract or provider not available");
        return null;
      }
      
      console.log(`Indexing votes for proposal #${proposalId} from blockchain events...`);
      
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
          
          console.log(`Indexed vote by ${voterAddress}: type=${support}, power=${powerValue}`);
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
      
      // Ensure we have valid percentages
      const yesPercentage = totalVotes > 0 ? (votesByType[1] / totalVotes) * 100 : 0;
      const noPercentage = totalVotes > 0 ? (votesByType[0] / totalVotes) * 100 : 0;
      const abstainPercentage = totalVotes > 0 ? (votesByType[2] / totalVotes) * 100 : 0;
      
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
        abstainPercentage
      };
    } catch (error) {
      console.error("Error indexing vote data:", error);
      return null;
    }
  };
  
  // CONSOLIDATED fetch vote data for all proposals
  useEffect(() => {
    const fetchVoteData = async () => {
      if (!getProposalVoteTotals || !proposals.length) return;
      
      setLoading(true);
      try {
        const voteTotals = {};
        let hasLoadedData = false;
        
        // Process proposals one by one with better error handling
        for (const proposal of proposals) {
          try {
            console.log(`Fetching votes for proposal #${proposal.id}`);
            
            // Try to use the getProposalVoteTotals function from the hook if it exists
            let voteData = null;
            try {
              voteData = await getProposalVoteTotals(proposal.id);
            } catch (hookError) {
              console.warn(`Error using hook's getProposalVoteTotals for proposal #${proposal.id}:`, hookError);
            }
            
            // If hook method failed or isn't available, fall back to event-based approach
            if (!voteData) {
              console.log(`Falling back to event-based vote counting for proposal #${proposal.id}`);
              voteData = await getEventBasedVoteData(proposal.id);
            }
            
            // Only update if we got valid data (might be null if both methods failed)
            if (voteData) {
              voteTotals[proposal.id] = voteData;
              hasLoadedData = true;
              
              // Log the vote data we received
              console.log(`Vote data received for proposal #${proposal.id}:`, {
                yesVotes: voteData.yesVotes,
                noVotes: voteData.noVotes,
                abstainVotes: voteData.abstainVotes,
                totalVotes: voteData.totalVotes,
                totalVoters: voteData.totalVoters,
                yesVotingPower: voteData.yesVotingPower,
                noVotingPower: voteData.noVotingPower,
                abstainVotingPower: voteData.abstainVotingPower,
                totalVotingPower: voteData.totalVotingPower
              });
            }
          } catch (error) {
            console.error(`Error fetching vote data for proposal #${proposal.id}:`, error);
          }
        }
        
        if (hasLoadedData) {
          console.log("Updated proposal votes from blockchain:", voteTotals);
          setProposalVotes(voteTotals);
        } else {
          console.warn("No vote data could be loaded from the blockchain");
        }
      } catch (error) {
        console.error("Error in fetchVoteData:", error);
      } finally {
        setLoading(false);
      }
    };
    
    // Initial fetch
    fetchVoteData();
    
    // Poll every 15 seconds but avoid setting state if unmounted
    let isMounted = true;
    const intervalId = setInterval(async () => {
      if (isMounted) {
        await fetchVoteData();
      }
    }, 15000);
    
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [getProposalVoteTotals, proposals, governanceContract, provider]);

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
  
  // Debug proposalVotes state to help troubleshoot
  useEffect(() => {
    console.log("Current proposalVotes state:", proposalVotes);
  }, [proposalVotes]);

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
  const hasUserVoted = (proposal) => {
    return proposal.hasVoted || votedProposals[proposal.id] !== undefined;
  };
  
  // Get the vote type
  const getUserVoteType = (proposal) => {
    // First check our local state
    if (votedProposals[proposal.id] !== undefined) {
      return votedProposals[proposal.id];
    }
    
    // Then fall back to the proposal data
    if (proposal.votedYes) return VOTE_TYPES.FOR;
    if (proposal.votedNo) return VOTE_TYPES.AGAINST;
    if (proposal.hasVoted) return VOTE_TYPES.ABSTAIN;
    
    return null;
  };

  // Enhanced vote submission with blockchain verification
  const submitVote = async (proposalId, support) => {
    try {
      // Find the proposal in the list
      const proposal = proposals.find(p => p.id === proposalId);
      if (!proposal) {
        console.error("Proposal not found:", proposalId);
        return;
      }
      
      console.log(`Attempting to cast vote on proposal #${proposalId} with vote type ${support}`);
      
      // Cast the vote on the blockchain without optimistic UI updates
      const result = await castVote(proposalId, support);
      console.log("Vote transaction result:", result);
      
      // Wait for blockchain confirmation - no optimistic UI updates
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify the vote was actually registered
      const hasUserVotedNow = await hasVoted(proposalId);
      
      if (hasUserVotedNow) {
        console.log("Vote confirmed on blockchain");
        
        // Now it's safe to update local state
        const newVotedProposals = {...votedProposals};
        newVotedProposals[proposalId] = support;
        setVotedProposals(newVotedProposals);
        
        // Force a refresh of the vote data after transaction completes
        try {
          // Try getting vote data from the contract first
          let freshVoteData = null;
          if (getProposalVoteTotals) {
            freshVoteData = await getProposalVoteTotals(proposalId);
          }
          
          // Fall back to event-based approach if needed
          if (!freshVoteData) {
            freshVoteData = await getEventBasedVoteData(proposalId);
          }
          
          console.log("Fresh vote data after confirmation:", freshVoteData);
          
          if (freshVoteData) {
            setProposalVotes(prev => ({
              ...prev,
              [proposalId]: freshVoteData
            }));
          }
        } catch (refreshError) {
          console.error("Error refreshing vote data after cast:", refreshError);
        }
      } else {
        console.error("Vote transaction appeared successful but vote wasn't registered on-chain");
        alert("Your vote transaction completed but wasn't properly registered. Please try again or check the transaction details.");
      }
    } catch (error) {
      console.error("Error casting vote:", error);
      alert("Error casting vote: " + (error.message || "See console for details"));
    }
  };

  // Helper to convert vote type to text
  const getVoteTypeText = (voteType) => {
    if (voteType === VOTE_TYPES.FOR) return 'Yes';
    if (voteType === VOTE_TYPES.AGAINST) return 'No';
    if (voteType === VOTE_TYPES.ABSTAIN) return 'Abstain';
    return '';
  };

  // SIMPLIFIED vote data calculation - consistent and reliable
  const calculateVotePercentages = (proposal) => {
    // First check if we have direct contract data for this proposal
    const contractVotes = proposalVotes[proposal.id];
    
    if (contractVotes) {
      // Use the contract data if available (most reliable)
      return contractVotes;
    }
    
    // Fall back to zeros if no data is available
    return {
      // Vote counts (1 per person)
      yesVotes: 0,
      noVotes: 0,
      abstainVotes: 0,
      totalVotes: 0,
      
      // Voting power
      yesVotingPower: 0,
      noVotingPower: 0,
      abstainVotingPower: 0,
      totalVotingPower: 0,
      
      // Total voters
      totalVoters: 0,
      
      // Percentages
      yesPercentage: 0,
      noPercentage: 0,
      abstainPercentage: 0
    };
  };

  // Render vote percentage bar (based on vote counts, not voting power)
  const renderVoteBar = (proposal) => {
    
    const voteData = calculateVotePercentages(proposal);
    
    if (voteData.totalVotes === 0) {
      return (
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full w-full bg-gray-300"></div>
        </div>
      );
    }
    
    return (
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="flex h-full">
          <div className="bg-green-500 h-full" style={{ width: `${voteData.yesPercentage}%` }}></div>
          <div className="bg-red-500 h-full" style={{ width: `${voteData.noPercentage}%` }}></div>
          <div className="bg-gray-400 h-full" style={{ width: `${voteData.abstainPercentage}%` }}></div>
        </div>
      </div>
    );
  };
  
  // Render voting power bar
  const renderVotingPowerBar = (proposal) => {
    const voteData = calculateVotePercentages(proposal);
    
    if (voteData.totalVotingPower === 0) {
      return (
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full w-full bg-gray-300"></div>
        </div>
      );
    }
    
    return (
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="flex h-full">
          <div 
            className="bg-green-500 h-full" 
            style={{ width: `${voteData.totalVotingPower > 0 ? (voteData.yesVotingPower / voteData.totalVotingPower) * 100 : 0}%` }}
          ></div>
          <div 
            className="bg-red-500 h-full" 
            style={{ width: `${voteData.totalVotingPower > 0 ? (voteData.noVotingPower / voteData.totalVotingPower) * 100 : 0}%` }}
          ></div>
          <div 
            className="bg-gray-400 h-full" 
            style={{ width: `${voteData.totalVotingPower > 0 ? (voteData.abstainVotingPower / voteData.totalVotingPower) * 100 : 0}%` }}
          ></div>
        </div>
      </div>
    );
  };

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
            const voteData = calculateVotePercentages(proposal);
            
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
                  {/* Vote percentages - based on 1 vote per person */}
                  <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm mb-2">
                    <div className="text-green-600 font-medium">Yes: {voteData.yesPercentage.toFixed(1)}%</div>
                    <div className="text-red-600 font-medium text-center">No: {voteData.noPercentage.toFixed(1)}%</div>
                    <div className="text-gray-600 font-medium text-right">Abstain: {voteData.abstainPercentage.toFixed(1)}%</div>
                  </div>
                  
                  {/* Vote bar - based on vote counts (1 per person) */}
                  {renderVoteBar(proposal)}
                  
                  {/* Vote counts - 1 vote per person */}
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
                    
                    {/* Voting power bar */}
                    {renderVotingPowerBar(proposal)}
                    
                    {/* Voting power counts */}
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 mt-1">
                      <div>{Math.round(voteData.yesVotingPower || 0).toLocaleString()} JUST</div>
                      <div className="text-center">{Math.round(voteData.noVotingPower || 0).toLocaleString()} JUST</div>
                      <div className="text-right">{Math.round(voteData.abstainVotingPower || 0).toLocaleString()} JUST</div>
                    </div>
                  </div>
                  
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
                            disabled={voting.processing}
                          >
                            <Check className="w-3 h-3 sm:w-4 sm:h-4 mr-1 flex-shrink-0" />
                            <span className="truncate">Yes</span>
                          </button>
                          <button 
                            className="flex-1 min-w-0 bg-red-500 hover:bg-red-600 text-white py-2 px-1 rounded-md flex items-center justify-center text-xs sm:text-sm"
                            onClick={() => submitVote(proposal.id, VOTE_TYPES.AGAINST)}
                            disabled={voting.processing}
                          >
                            <X className="w-3 h-3 sm:w-4 sm:h-4 mr-1 flex-shrink-0" />
                            <span className="truncate">No</span>
                          </button>
                          <button 
                            className="flex-1 min-w-0 bg-gray-500 hover:bg-gray-600 text-white py-2 px-1 rounded-md flex items-center justify-center text-xs sm:text-sm"
                            onClick={() => submitVote(proposal.id, VOTE_TYPES.ABSTAIN)}
                            disabled={voting.processing}
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
                    onClick={async () => {
                      setSelectedProposal(proposal);
                      setShowModal(true);
                      
                      // Get the latest vote data when opening the modal
                      try {
                        // Try getting vote data from the contract first
                        let voteData = null;
                        if (getProposalVoteTotals) {
                          voteData = await getProposalVoteTotals(proposal.id);
                        }
                        
                        // Fall back to event-based approach if needed
                        if (!voteData) {
                          voteData = await getEventBasedVoteData(proposal.id);
                        }
                        
                        if (voteData) {
                          setProposalVotes(prev => ({
                            ...prev,
                            [proposal.id]: voteData
                          }));
                          console.log("Updated vote data for modal:", voteData);
                        }
                      } catch (error) {
                        console.error("Error fetching vote data for modal:", error);
                      }
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
                    // Use the same calculation function we use elsewhere to ensure consistency
                    const voteData = calculateVotePercentages(selectedProposal);
                    return (
                      <>
                        {/* Vote counts heading */}
                        <h5 className="text-sm font-medium mb-3">Vote Counts (1 vote per person)</h5>
                        
                        {/* Vote counts display */}
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
                        
                        {/* Add percentage labels */}
                        <div className="grid grid-cols-3 gap-4 text-center mb-3 text-xs text-gray-500">
                          <div>Yes: {voteData.yesPercentage.toFixed(1)}%</div>
                          <div>No: {voteData.noPercentage.toFixed(1)}%</div>
                          <div>Abstain: {voteData.abstainPercentage.toFixed(1)}%</div>
                        </div>
                        
                        {/* Vote bar in modal */}
                        {renderVoteBar(selectedProposal)}
                        
                        {/* Add total voters count */}
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
                        
                        {/* Voting power bar */}
                        {renderVotingPowerBar(selectedProposal)}
                        
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