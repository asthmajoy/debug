// VoteTotals.jsx - A shared component for displaying vote totals
import React, { useState, useEffect } from 'react';

const VoteTotals = ({ 
  proposal, 
  getProposalVoteTotals,
  votedProposals, 
  votingPowers,
  userVoteType
}) => {
  const [voteData, setVoteData] = useState({
    yesVotes: 0,
    noVotes: 0,
    abstainVotes: 0,
    totalVotes: 0,
    totalVoters: 0,
    yesPercentage: 0,
    noPercentage: 0,
    abstainPercentage: 0
  });
  
  // Fetch vote data on mount and when proposal or voted status changes
  useEffect(() => {
    const fetchVoteData = async () => {
      if (!proposal || !proposal.id || !getProposalVoteTotals) return;
      
      try {
        const data = await getProposalVoteTotals(proposal.id);
        if (data) {
          console.log(`VoteTotals: Fetched data for proposal #${proposal.id}:`, data);
          setVoteData(data);
        }
      } catch (error) {
        console.error(`Error fetching vote data for proposal #${proposal.id}:`, error);
      }
    };
    
    fetchVoteData();
    
    // Set up a polling interval to keep the data fresh
    const intervalId = setInterval(fetchVoteData, 15000); // Poll every 15 seconds
    
    return () => clearInterval(intervalId);
  }, [proposal, getProposalVoteTotals, votedProposals]);
  
  // Get vote numbers to display
  const roundedYesVotes = Math.round(voteData.yesVotes);
  const roundedNoVotes = Math.round(voteData.noVotes);
  const roundedAbstainVotes = Math.round(voteData.abstainVotes);
  
  return (
    <div>
      {/* Vote percentages */}
      <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm mb-2">
        <div className="text-green-600 font-medium">Yes: {voteData.yesPercentage.toFixed(1)}%</div>
        <div className="text-red-600 font-medium text-center">No: {voteData.noPercentage.toFixed(1)}%</div>
        <div className="text-gray-600 font-medium text-right">Abstain: {voteData.abstainPercentage.toFixed(1)}%</div>
      </div>
      
      {/* Vote bar */}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="flex h-full">
          <div className="bg-green-500 h-full" style={{ width: `${voteData.yesPercentage}%` }}></div>
          <div className="bg-red-500 h-full" style={{ width: `${voteData.noPercentage}%` }}></div>
          <div className="bg-gray-400 h-full" style={{ width: `${voteData.abstainPercentage}%` }}></div>
        </div>
      </div>
      
      {/* Vote counts */}
      <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 mt-1">
        <div>{roundedYesVotes} votes</div>
        <div className="text-center">{roundedNoVotes} votes</div>
        <div className="text-right">{roundedAbstainVotes} votes</div>
      </div>
      
      {/* Total voters count */}
      <div className="text-xs text-gray-500 mt-1 text-right">
        Total voters: {voteData.totalVoters || 0}
      </div>
    </div>
  );
};

export default VoteTotals;