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
  // Enhanced fetch vote data for all proposals
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
          const voteData = await getProposalVoteTotals(proposal.id);
          
          // Only update if we got valid data (might be null if request failed)
          if (voteData) {
            voteTotals[proposal.id] = voteData;
            hasLoadedData = true;
            
            // Log the vote data we received
            console.log(`Vote data received for proposal #${proposal.id}:`, {
              yes: voteData.yesVotes,
              no: voteData.noVotes,
              abstain: voteData.abstainVotes,
              total: voteData.totalVotes,
              voters: voteData.totalVoters
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
}, [getProposalVoteTotals, proposals]);


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
  
  // Enhanced fetch vote data for all proposals
  useEffect(() => {
    const fetchVoteData = async () => {
      if (!getProposalVoteTotals || !proposals.length) return;
      
      setLoading(true);
      try {
        const voteTotals = {};
        
        // Process proposals in batches to avoid overwhelming the network
        const batchSize = 3;
        for (let i = 0; i < proposals.length; i += batchSize) {
          const batch = proposals.slice(i, i + batchSize);
          
          // Use Promise.all to fetch data for proposals in parallel
          const batchPromises = batch.map(async (proposal) => {
            try {
              // Ensure we're forcing a fresh request from the blockchain
              const voteData = await getProposalVoteTotals(proposal.id);
              return { id: proposal.id, data: voteData };
            } catch (error) {
              console.error(`Error fetching vote data for proposal #${proposal.id}:`, error);
              return null;
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          
          // Process the results
          batchResults.forEach(result => {
            if (result && result.data) {
              voteTotals[result.id] = result.data;
            }
          });
          
          // Small delay between batches to avoid rate limiting
          if (i + batchSize < proposals.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        console.log("Updated proposal votes from blockchain:", voteTotals);
        setProposalVotes(voteTotals);
      } catch (error) {
        console.error("Error fetching vote data:", error);
      } finally {
        setLoading(false);
      }
    };
    
    // Initial fetch
    fetchVoteData();
    
    // Set up polling with a shorter interval for more responsive updates
    // But use a staggered approach to avoid constant loading state
    let isRefreshing = false;
    const intervalId = setInterval(async () => {
      if (!isRefreshing) {
        isRefreshing = true;
        await fetchVoteData();
        isRefreshing = false;
      }
    }, 10000); // Poll every 10 seconds
    
    return () => clearInterval(intervalId);
  }, [getProposalVoteTotals, proposals]);

  // Filter proposals based on vote status - FIXED: Keep active proposals in active filter even if voted
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

  // Enhanced vote submission with immediate UI update and blockchain refresh
  const submitVote = async (proposalId, support) => {
    try {
      // Find the proposal in the list
      const proposal = proposals.find(p => p.id === proposalId);
      if (!proposal) {
        console.error("Proposal not found:", proposalId);
        return;
      }
  
      // Get current voting power for this proposal
      const votingPower = parseFloat(votingPowers[proposalId] || "0");
      
      // Immediately update UI to show the vote (optimistic UI)
      const newVotedProposals = {...votedProposals};
      newVotedProposals[proposalId] = support;
      setVotedProposals(newVotedProposals);
      
      // Get current vote data or initialize if not available
      const currentVoteData = proposalVotes[proposalId] || {
        yesVotes: 0,
        noVotes: 0,
        abstainVotes: 0,
        totalVotes: 0,
        totalVoters: 0,
        yesPercentage: 0,
        noPercentage: 0,
        abstainPercentage: 0
      };
      
      // Create a copy for our update
      const updatedVoteData = { ...currentVoteData };
      
      // Add the user as a voter if they weren't counted before
      if (!hasUserVoted(proposal)) {
        updatedVoteData.totalVoters = (updatedVoteData.totalVoters || 0) + 1;
      }
      
      // Add vote power to the appropriate category
      if (support === VOTE_TYPES.FOR) {
        updatedVoteData.yesVotes += votingPower;
      } else if (support === VOTE_TYPES.AGAINST) {
        updatedVoteData.noVotes += votingPower;
      } else if (support === VOTE_TYPES.ABSTAIN) {
        updatedVoteData.abstainVotes += votingPower;
      }
      
      // Recalculate total votes and percentages
      updatedVoteData.totalVotes = 
        updatedVoteData.yesVotes + updatedVoteData.noVotes + updatedVoteData.abstainVotes;
      
      if (updatedVoteData.totalVotes > 0) {
        updatedVoteData.yesPercentage = (updatedVoteData.yesVotes / updatedVoteData.totalVotes) * 100;
        updatedVoteData.noPercentage = (updatedVoteData.noVotes / updatedVoteData.totalVotes) * 100;
        updatedVoteData.abstainPercentage = (updatedVoteData.abstainVotes / updatedVoteData.totalVotes) * 100;
      }
      
      // Update the UI with our optimistic vote data
      setProposalVotes(prev => ({
        ...prev,
        [proposalId]: updatedVoteData
      }));
      
      console.log(`Optimistically updated vote data for proposal #${proposalId}:`, updatedVoteData);
      
      // Actually cast the vote on the blockchain
      const result = await castVote(proposalId, support);
      console.log("Vote successfully cast:", result);
      
      // Force a refresh of the vote data after transaction completes
      setTimeout(async () => {
        try {
          const freshVoteData = await getProposalVoteTotals(proposalId);
          console.log("Fresh vote data after blockchain confirmation:", freshVoteData);
          
          // Only update if we got real data
          if (freshVoteData) {
            setProposalVotes(prev => ({
              ...prev,
              [proposalId]: freshVoteData
            }));
          }
        } catch (refreshError) {
          console.error("Error refreshing vote data after cast:", refreshError);
        }
      }, 2000); // Wait 2 seconds after transaction confirmation
    } catch (error) {
      console.error("Error casting vote:", error);
      alert("Error casting vote: " + (error.message || "See console for details"));
      
      // Revert the UI change if there was an error
      const newVotedProposals = {...votedProposals};
      delete newVotedProposals[proposalId];
      setVotedProposals(newVotedProposals);
    }
  };

  // Helper to convert vote type to text
  const getVoteTypeText = (voteType) => {
    if (voteType === VOTE_TYPES.FOR) return 'Yes';
    if (voteType === VOTE_TYPES.AGAINST) return 'No';
    if (voteType === VOTE_TYPES.ABSTAIN) return 'Abstain';
    return '';
  };

  // Calculate vote percentages - using contract data when available
  const calculateVotePercentages = (proposal) => {
    // First check if we have direct contract data for this proposal
    const contractVotes = proposalVotes[proposal.id];
    
    let yesVotes, noVotes, abstainVotes, totalVoters = 0;
    
    if (contractVotes) {
      // Use the contract data if available (RECOMMENDED)
      yesVotes = contractVotes.yesVotes;
      noVotes = contractVotes.noVotes;
      abstainVotes = contractVotes.abstainVotes;
      totalVoters = contractVotes.totalVoters || 0;
      
      console.log(`Using contract data for proposal #${proposal.id} votes:`, contractVotes);
    } else {
      // Fall back to extracting from the proposal object if contract data isn't available yet
      const extractNumber = (str) => {
        if (typeof str === 'number') return str;
        if (!str) return 0;
        // Remove any commas and convert to number
        return parseFloat(str.toString().replace(/,/g, '')) || 0;
      };
      
      yesVotes = extractNumber(proposal.yesVotes);
      noVotes = extractNumber(proposal.noVotes);
      abstainVotes = extractNumber(proposal.abstainVotes);
      
      console.log(`Using extracted data for proposal #${proposal.id} votes:`, {
        yesVotes, noVotes, abstainVotes
      });
    }
    
    // Check if the user has voted
    const userVoted = hasUserVoted(proposal);
    const voteType = getUserVoteType(proposal);
    
    // If the user has voted but their vote doesn't seem to be counted in the contract yet,
    // make sure to show at least 1 vote in the appropriate category
    if (userVoted && !contractVotes) {
      if (voteType === VOTE_TYPES.FOR && yesVotes < 1) yesVotes = 1;
      if (voteType === VOTE_TYPES.AGAINST && noVotes < 1) noVotes = 1;
      if (voteType === VOTE_TYPES.ABSTAIN && abstainVotes < 1) abstainVotes = 1;
    }
    
    // Calculate total and percentages
    const totalVotes = yesVotes + noVotes + abstainVotes;
    
    // IMPORTANT: If the user has voted on this proposal, ensure they're counted in total voters
    if (userVoted && totalVoters === 0) {
      totalVoters = 1; // At minimum, the current user is a voter
    }
    
    // Log the vote data for debugging
    console.log(`VoteTab - Proposal ${proposal.id} final vote data:`, {
      contractDataAvailable: !!contractVotes,
      yesVotes,
      noVotes,
      abstainVotes,
      totalVotes,
      totalVoters,
      userVoted,
      voteType
    });
    
    return {
      yesVotes,
      noVotes,
      abstainVotes,
      totalVotes,
      totalVoters,
      yesPercentage: totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 0,
      noPercentage: totalVotes > 0 ? (noVotes / totalVotes) * 100 : 0,
      abstainPercentage: totalVotes > 0 ? (abstainVotes / totalVotes) * 100 : 0
    };
  };

  // Render vote percentage bar
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
                
                <div className="mb-4">
                  {/* Vote percentages - more compact and responsive */}
                  <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm mb-2">
                    <div className="text-green-600 font-medium">Yes: {voteData.yesPercentage.toFixed(1)}%</div>
                    <div className="text-red-600 font-medium text-center">No: {voteData.noPercentage.toFixed(1)}%</div>
                    <div className="text-gray-600 font-medium text-right">Abstain: {voteData.abstainPercentage.toFixed(1)}%</div>
                  </div>
                  
                  {/* Vote bar */}
                  {renderVoteBar(proposal)}
                  
                  {/* Vote counts */}
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 mt-1">
                    <div>{Math.round(voteData.yesVotes)} votes</div>
                    <div className="text-center">{Math.round(voteData.noVotes)} votes</div>
                    <div className="text-right">{Math.round(voteData.abstainVotes)} votes</div>
                  </div>
                  
                  {/* Total voters count - NEW */}
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
                                {Math.round(voteData.totalVotes).toLocaleString()} / {quorum.toLocaleString()} votes
                                ({Math.min(100, Math.round((voteData.totalVotes / quorum) * 100))}%)
                              </span>
                            </div>
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="bg-blue-500 h-full rounded-full" 
                                style={{ width: `${Math.min(100, (voteData.totalVotes / quorum) * 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
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
                      if (getProposalVoteTotals && proposal.id !== undefined) {
                        try {
                          const voteData = await getProposalVoteTotals(proposal.id);
                          
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
                    <span className="text-gray-600">Quorum:</span> {quorum ? `${quorum.toLocaleString()} votes` : "Loading..."}
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
                        <div className="grid grid-cols-3 gap-4 text-center mb-3">
                          <div>
                            <div className="text-green-600 font-medium">{Math.round(voteData.yesVotes).toLocaleString()}</div>
                            <div className="text-xs text-gray-500">Yes Votes</div>
                          </div>
                          <div>
                            <div className="text-red-600 font-medium">{Math.round(voteData.noVotes).toLocaleString()}</div>
                            <div className="text-xs text-gray-500">No Votes</div>
                          </div>
                          <div>
                            <div className="text-gray-600 font-medium">{Math.round(voteData.abstainVotes).toLocaleString()}</div>
                            <div className="text-xs text-gray-500">Abstain</div>
                          </div>
                        </div>
                        
                        {/* Add percentage labels */}
                        <div className="grid grid-cols-3 gap-4 text-center mb-3 text-xs text-gray-500">
                          <div>Yes: {voteData.yesPercentage.toFixed(1)}%</div>
                          <div>No: {voteData.noPercentage.toFixed(1)}%</div>
                          <div>Abstain: {voteData.abstainPercentage.toFixed(1)}%</div>
                        </div>
                        
                        {/* Add total voters count - NEW */}
                        <div className="text-center text-xs text-gray-500 mb-3">
                          Total voters: {voteData.totalVoters || 0}
                        </div>
                      </>
                    );
                  })()}
                  
                  {/* Vote bar in modal */}
                  {renderVoteBar(selectedProposal)}
                  
                  {/* User's vote */}
                  {hasUserVoted(selectedProposal) && (
                    <div className="mt-3 text-center text-sm">
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