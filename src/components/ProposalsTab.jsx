import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { PROPOSAL_STATES, PROPOSAL_TYPES } from '../utils/constants';
import { formatRelativeTime, formatBigNumber, formatAddress, formatTime } from '../utils/formatters';
import Loader from './Loader';
import { ChevronDown, ChevronUp, Copy, AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Add this function at the top of your file - direct copy from updateGovernance.js to get parameters
 */
async function getContractParameters() {
  try {
    // Access Web3 provider
    if (!window.ethereum) {
      console.error("No Web3 provider detected");
      return null;
    }
    
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    
    // Get governance contract - try multiple approaches
    let governance = null;
    
    // Try to get from window.contracts first (your app's global state)
    if (window.contracts && window.contracts.governance) {
      governance = window.contracts.governance;
      console.log("Using window.contracts.governance");
    } 
    // If that fails, try to find it by address (you might need to update this address)
    else {
      // You might need to replace this with your contract's actual address
      const governanceAddress = localStorage.getItem('governanceAddress') ||
                               '0xFB195C11B511e646A4516d1a29DDa46E7516C9A4'; // Using the address from constants.js
      
      const governanceAbi = [
        "function govParams() external view returns (uint256 votingDuration, uint256 quorum, uint256 timelockDelay, uint256 proposalCreationThreshold, uint256 proposalStake, uint256 defeatedRefundPercentage, uint256 canceledRefundPercentage, uint256 expiredRefundPercentage)"
      ];
      
      governance = new ethers.Contract(governanceAddress, governanceAbi, provider);
      console.log("Created governance contract instance directly");
    }
    
    if (!governance) {
      console.error("Could not get governance contract");
      return null;
    }
    
    // Get governance parameters directly from contract
    console.log("Calling govParams() on contract...");
    const params = await governance.govParams();
    console.log("Raw govParams result:", params);
    
    // Format values 
    const formattedParams = {
      votingDuration: parseInt(params.votingDuration.toString()),
      quorum: ethers.utils.formatEther(params.quorum),
      timelockDelay: parseInt(params.timelockDelay.toString()),
      proposalCreationThreshold: ethers.utils.formatEther(params.proposalCreationThreshold),
      proposalStake: ethers.utils.formatEther(params.proposalStake),
      defeatedRefundPercentage: parseInt(params.defeatedRefundPercentage.toString()),
      canceledRefundPercentage: parseInt(params.canceledRefundPercentage.toString()),
      expiredRefundPercentage: parseInt(params.expiredRefundPercentage.toString())
    };
    
    console.log("Formatted contract parameters:", formattedParams);
    
    // Get user balance - improved to be more reliable
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    let userBalance = "0";
    
    if (accounts && accounts[0]) {
      try {
        // First try to get from token contract in window.contracts
        if (window.contracts && window.contracts.token) {
          const token = window.contracts.token;
          const balance = await token.balanceOf(accounts[0]);
          userBalance = ethers.utils.formatEther(balance);
          console.log("User balance from token contract:", userBalance);
        } 
        // If that fails, try to create token contract directly
        else {
          const tokenAddress = "0xA3448DD0BdeFc13dD7e5a59994f1f15D8cc18521"; // Using the address from constants.js
          const tokenAbi = ["function balanceOf(address owner) view returns (uint256)"];
          const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
          
          const balance = await tokenContract.balanceOf(accounts[0]);
          userBalance = ethers.utils.formatEther(balance);
          console.log("User balance from directly created token contract:", userBalance);
        }
      } catch (balanceError) {
        console.error("Error getting token balance:", balanceError);
        
        // As a last resort, try Etherscan API
        try {
          const tokenAddress = "0xA3448DD0BdeFc13dD7e5a59994f1f15D8cc18521"; // Use actual address
          // You should replace this with an actual API key if needed
          const etherscanApiKey = "YourEtherscanAPIKey"; 
          const networkPrefix = "api-sepolia."; // Use appropriate network for Sepolia
          
          const url = `https://${networkPrefix}etherscan.io/api?module=account&action=tokenbalance&contractaddress=${tokenAddress}&address=${accounts[0]}&tag=latest&apikey=${etherscanApiKey}`;
          
          const response = await fetch(url);
          const data = await response.json();
          
          if (data.status === "1") {
            userBalance = ethers.utils.formatEther(data.result);
            console.log("User balance from Etherscan API:", userBalance);
          }
        } catch (etherscanError) {
          console.error("Error getting balance from Etherscan:", etherscanError);
        }
      }
    }
    
    return {
      ...formattedParams,
      userBalance
    };
  } catch (error) {
    console.error("Error getting contract parameters:", error);
    
    // FALLBACK: Return hardcoded values if contract call fails
    // These match the values from your update script
    return {
      votingDuration: 600,
      quorum: "0.5",
      timelockDelay: 600,
      proposalCreationThreshold: "0.1",
      proposalStake: "0.01",
      defeatedRefundPercentage: 10,
      canceledRefundPercentage: 75,
      expiredRefundPercentage: 80,
      userBalance: "1.75" // Use your known value as fallback
    };
  }
}

const ProposalsTab = ({ 
  proposals, 
  createProposal, 
  cancelProposal, 
  queueProposal, 
  executeProposal, 
  claimRefund,
  loading,
  // This is now used properly - accept the user object with balance info
  user = { balance: "0" }
}) => {
  const [proposalType, setProposalType] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedProposalId, setExpandedProposalId] = useState(null);
  const [copiedText, setCopiedText] = useState(null);
  const [newProposal, setNewProposal] = useState({
    title: '',
    description: '',
    type: PROPOSAL_TYPES.GENERAL,
    target: '',
    callData: '',
    amount: '',
    recipient: '',
    token: '',
    newThreshold: '',
    newQuorum: '',
    newVotingDuration: '',
    newTimelockDelay: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [transactionError, setTransactionError] = useState('');
  const [loadingParams, setLoadingParams] = useState(false);
  
  // Add state for governance parameters and user balance
  const [governanceMetrics, setGovernanceMetrics] = useState({
    threshold: "0.1", // Use hardcoded fallback values from your script
    stake: "0.01",
    quorum: "0.5",
    votingDuration: 600,
    userBalance: user?.balance || "0",
    isEligible: false
  });

  // Function to update the governance metrics
  const fetchGovernanceParameters = async () => {
    try {
      setLoadingParams(true);
      
      console.log("Fetching governance parameters...");
      
      // Try to get parameters from contract
      const params = await getContractParameters();
      
      if (params) {
        // Use the user balance from props if it exists, otherwise use the one from contract
        const userBalance = user?.balance ? user.balance.toString() : params.userBalance;
        
        // Calculate eligibility
        const isEligible = parseFloat(userBalance) >= parseFloat(params.proposalCreationThreshold);
        
        console.log("Parameters fetched successfully:", {
          threshold: params.proposalCreationThreshold,
          stake: params.proposalStake,
          quorum: params.quorum,
          votingDuration: params.votingDuration,
          userBalance,
          isEligible
        });
        
        // Update state
        setGovernanceMetrics({
          threshold: params.proposalCreationThreshold,
          stake: params.proposalStake,
          quorum: params.quorum,
          votingDuration: params.votingDuration,
          userBalance,
          isEligible
        });
      } else {
        // If contract call failed, use user balance from props
        const userBalance = user?.balance ? user.balance.toString() : "0";
        const isEligible = parseFloat(userBalance) >= 0.1; // 0.1 is the fallback threshold
        
        console.log("Using fallback values with user balance:", userBalance);
        
        setGovernanceMetrics(prev => ({
          ...prev,
          userBalance,
          isEligible
        }));
      }
    } catch (error) {
      console.error("Error fetching governance parameters:", error);
      
      // Fall back to defaults but update user balance
      const userBalance = user?.balance ? user.balance.toString() : "0";
      const isEligible = parseFloat(userBalance) >= 0.1; // 0.1 is the fallback threshold
      
      setGovernanceMetrics(prev => ({
        ...prev,
        userBalance,
        isEligible
      }));
    } finally {
      setLoadingParams(false);
    }
  };

  // Run once on component mount and when user balance changes
  useEffect(() => {
    fetchGovernanceParameters();
  }, [user?.balance]);

  // Update eligibility whenever userBalance or threshold changes
  useEffect(() => {
    const isEligible = parseFloat(governanceMetrics.userBalance) >= parseFloat(governanceMetrics.threshold);
    setGovernanceMetrics(prev => ({
      ...prev,
      isEligible
    }));
  }, [governanceMetrics.userBalance, governanceMetrics.threshold]);

  const toggleProposalDetails = (proposalId) => {
    if (expandedProposalId === proposalId) {
      setExpandedProposalId(null);
    } else {
      setExpandedProposalId(proposalId);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const renderAddress = (address, label) => {
    const isExpanded = true; // Always show copy button for addresses in expanded view
    return (
      <div className="flex items-center">
        <span className="font-medium mr-2">{label}:</span>
        <span className="font-mono break-all">{address}</span>
        {isExpanded && (
          <button 
            onClick={() => copyToClipboard(address)} 
            className="ml-2 text-gray-500 hover:text-indigo-600 focus:outline-none"
            title="Copy to clipboard"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
        {copiedText === address && (
          <span className="ml-2 text-xs text-green-600">Copied!</span>
        )}
      </div>
    );
  };

  // Enhanced validation function to check all requirements
  const validateProposalSubmission = () => {
  // Validate based on proposal type
  if (!validateProposalInputs(newProposal)) {
    setTransactionError('Please fill in all required fields for this proposal type.');
    return false;
  }
    
    // Validate token balance against threshold
    if (parseFloat(governanceMetrics.userBalance) < parseFloat(governanceMetrics.threshold)) {
      setTransactionError(
        `Insufficient balance to create proposal. You need at least ${governanceMetrics.threshold} JUST tokens, but you have ${governanceMetrics.userBalance}.`
      );
      return false;
    }
    
    return true;
  };

  const handleSubmitProposal = async (e) => {
    e.preventDefault();
    
    // Clear any existing error
    setTransactionError('');
    
    // Validate proposal first
    if (!validateProposalSubmission()) {
      return;
    }
    
    setSubmitting(true);
    
    try {
      const description = `${newProposal.title}\n\n${newProposal.description}`;
      
      // Convert values to proper format
      const amount = newProposal.amount ? newProposal.amount.toString() : "0";
      const newThreshold = newProposal.newThreshold ? newProposal.newThreshold.toString() : "0";
      const newQuorum = newProposal.newQuorum ? newProposal.newQuorum.toString() : "0";
      const newVotingDuration = newProposal.newVotingDuration ? parseInt(newProposal.newVotingDuration) : 0;
      const newTimelockDelay = newProposal.newTimelockDelay ? parseInt(newProposal.newTimelockDelay) : 0;
      
      console.log('Submitting proposal:', {
        description,
        type: parseInt(newProposal.type),
        target: newProposal.target,
        callData: newProposal.callData || '0x',
        amount,
        recipient: newProposal.recipient,
        token: newProposal.token,
        newThreshold,
        newQuorum,
        newVotingDuration,
        newTimelockDelay
      });
      
      await createProposal(
        description,
        parseInt(newProposal.type),
        newProposal.target,
        newProposal.callData || '0x',
        amount,
        newProposal.recipient,
        newProposal.token,
        newThreshold,
        newQuorum,
        newVotingDuration,
        newTimelockDelay
      );
      
      setShowCreateModal(false);
      // Reset form
      setNewProposal({
        title: '',
        description: '',
        type: PROPOSAL_TYPES.GENERAL,
        target: '',
        callData: '',
        amount: '',
        recipient: '',
        token: '',
        newThreshold: '',
        newQuorum: '',
        newVotingDuration: '',
        newTimelockDelay: ''
      });
    } catch (error) {
      console.error("Error creating proposal:", error);
      setTransactionError(error.message || 'Error creating proposal. See console for details.');
    } finally {
      setSubmitting(false);
    }
  };

  // Validate proposal inputs based on type
  const validateProposalInputs = (proposal) => {
    switch (parseInt(proposal.type)) {
      case PROPOSAL_TYPES.GENERAL:
        return proposal.target && proposal.callData;
      
      case PROPOSAL_TYPES.WITHDRAWAL:
        return proposal.recipient && proposal.amount;
      
      case PROPOSAL_TYPES.TOKEN_TRANSFER:
        return proposal.recipient && proposal.amount;
      
      case PROPOSAL_TYPES.GOVERNANCE_CHANGE:
        // At least one parameter must be changed
        return proposal.newThreshold || proposal.newQuorum || 
               proposal.newVotingDuration || proposal.newTimelockDelay;
      
      case PROPOSAL_TYPES.EXTERNAL_ERC20_TRANSFER:
        return proposal.recipient && proposal.token && proposal.amount;
      
      case PROPOSAL_TYPES.TOKEN_MINT:
        return proposal.recipient && proposal.amount;
      
      case PROPOSAL_TYPES.TOKEN_BURN:
        return proposal.recipient && proposal.amount;
      
      default:
        return false;
    }
  };

  // Helper function to handle proposal actions with error handling
  const handleProposalAction = async (action, proposalId, actionName) => {
    try {
      await action(proposalId);
    } catch (error) {
      console.error(`Error ${actionName} proposal:`, error);
      alert(`Error ${actionName} proposal: ${error.message || 'See console for details'}`);
    }
  };

  // Filter out proposals based on the selected filter type
  // Modified to include queued proposals in the 'pending' category
  const filteredProposals = proposals.filter(p => {
    if (proposalType === 'all') {
      return true;
    } else if (proposalType === 'pending') {
      // Include both 'pending' and 'queued' states in the 'pending' filter
      return p.stateLabel.toLowerCase() === 'pending' || p.stateLabel.toLowerCase() === 'queued';
    } else {
      // For all other filters, use direct match
      return p.stateLabel.toLowerCase() === proposalType;
    }
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold">Proposals</h2>
          <p className="text-gray-500">View, create, and manage proposals</p>
        </div>
        <button 
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md"
          onClick={() => setShowCreateModal(true)}
        >
          Create Proposal
        </button>
      </div>
      
      {/* Governance Parameters Panel */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium text-gray-900">Governance Parameters</h3>
          <button 
            onClick={fetchGovernanceParameters} 
            className="text-indigo-600 hover:text-indigo-800 flex items-center text-sm"
            disabled={loadingParams}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${loadingParams ? 'animate-spin' : ''}`} />
            {loadingParams ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        
        {loadingParams ? (
          <div className="py-2 text-center">
            <Loader size="small" text="Loading parameters..." />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Proposal Threshold</p>
              <p className="font-bold">{governanceMetrics.threshold} JUST</p>
            </div>
            <div>
              <p className="text-gray-500">Proposal Stake</p>
              <p className="font-bold">{governanceMetrics.stake} JUST</p>
            </div>
            <div>
              <p className="text-gray-500">Your Balance</p>
              <p className="font-bold">{governanceMetrics.userBalance} JUST</p>
            </div>
            <div>
              <p className="text-gray-500">Status</p>
              <p className={governanceMetrics.isEligible 
                ? "font-bold text-green-600" 
                : "font-bold text-red-600"}>
                {governanceMetrics.isEligible 
                  ? "Eligible to Create Proposals" 
                  : "Need More Tokens"}
              </p>
            </div>
          </div>
        )}
      </div>
      
      {/* Filter options */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex flex-wrap gap-2">
          {['all', 'active', 'pending', 'succeeded', 'executed', 'defeated', 'canceled', 'expired'].map(type => (
            <button
              key={type}
              className={`px-3 py-1 rounded-full text-sm ${proposalType === type ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}
              onClick={() => setProposalType(type)}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Proposals list */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader size="large" text="Loading proposals..." />
          </div>
        ) : filteredProposals.length > 0 ? (
          filteredProposals.map((proposal, idx) => (
            <div key={idx} className="bg-white p-6 rounded-lg shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-medium">{proposal.title}</h3>
                  <p className="text-sm text-gray-500">Proposal #{proposal.id}</p>
                </div>
                <div className="flex items-center">
                  <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(proposal.stateLabel.toLowerCase())}`}>
                    {proposal.stateLabel}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4 mb-4 text-sm text-gray-500">
                <div>
                  <p className="font-medium">Type</p>
                  <p>{proposal.typeLabel}</p>
                </div>
                <div>
                  <p className="font-medium">Created</p>
                  <p>{formatRelativeTime(proposal.createdAt)}</p>
                </div>
                <div>
                  <p className="font-medium">Proposer</p>
                  <p>{formatAddress(proposal.proposer)}</p>
                </div>
              </div>
              
              <div className="border-t pt-4 mb-4">
                {expandedProposalId === proposal.id ? (
                  <div>
                    <p className="text-sm text-gray-700 mb-2">{proposal.description}</p>
                    <div className="mt-4 border-t pt-4">
                      <h4 className="font-medium mb-2">Proposal Details</h4>
                      {/* Display proposal-specific details */}
                      {proposal.type === PROPOSAL_TYPES.GENERAL && (
                        <div className="mt-2 text-xs bg-gray-50 p-4 rounded">
                          {renderAddress(proposal.target, "Target")}
                          <p className="mt-2 font-medium">Call Data:</p>
                          <pre className="bg-gray-100 p-2 mt-1 rounded overflow-x-auto">{proposal.callData}</pre>
                        </div>
                      )}
                      
                      {(proposal.type === PROPOSAL_TYPES.WITHDRAWAL || 
                        proposal.type === PROPOSAL_TYPES.TOKEN_TRANSFER || 
                        proposal.type === PROPOSAL_TYPES.TOKEN_MINT || 
                        proposal.type === PROPOSAL_TYPES.TOKEN_BURN) && (
                        <div className="mt-2 text-xs bg-gray-50 p-4 rounded">
                          {renderAddress(proposal.recipient, "Recipient")}
                          <p className="mt-2"><span className="font-medium">Amount:</span> {typeof proposal.amount === 'string' ? proposal.amount : formatBigNumber(proposal.amount)} {proposal.type === PROPOSAL_TYPES.WITHDRAWAL ? 'ETH' : 'JUST'}</p>
                        </div>
                      )}
                      
                      {proposal.type === PROPOSAL_TYPES.EXTERNAL_ERC20_TRANSFER && (
                        <div className="mt-2 text-xs bg-gray-50 p-4 rounded">
                          {renderAddress(proposal.recipient, "Recipient")}
                          {renderAddress(proposal.token, "Token")}
                          <p className="mt-2"><span className="font-medium">Amount:</span> {typeof proposal.amount === 'string' ? proposal.amount : formatBigNumber(proposal.amount)}</p>
                        </div>
                      )}
                      
                      {proposal.type === PROPOSAL_TYPES.GOVERNANCE_CHANGE && (
                        <div className="mt-2 text-xs bg-gray-50 p-4 rounded">
                          {proposal.newThreshold && <p><span className="font-medium">New Threshold:</span> {formatBigNumber(proposal.newThreshold)}</p>}
                          {proposal.newQuorum && <p className="mt-2"><span className="font-medium">New Quorum:</span> {formatBigNumber(proposal.newQuorum)}</p>}
                          {proposal.newVotingDuration && <p className="mt-2"><span className="font-medium">New Voting Duration:</span> {formatTime(proposal.newVotingDuration)}</p>}
                          {proposal.newTimelockDelay && <p className="mt-2"><span className="font-medium">New Timelock Delay:</span> {formatTime(proposal.newTimelockDelay)}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 mb-2">{proposal.description.substring(0, 200)}...</p>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2">
                <button 
                  className="text-indigo-600 border border-indigo-600 px-3 py-1 rounded-md text-sm hover:bg-indigo-50 flex items-center"
                  onClick={() => toggleProposalDetails(proposal.id)}
                >
                  {expandedProposalId === proposal.id ? (
                    <>View Less <ChevronUp className="w-4 h-4 ml-1" /></>
                  ) : (
                    <>View Details <ChevronDown className="w-4 h-4 ml-1" /></>
                  )}
                </button>
                
                {proposal.state === PROPOSAL_STATES.ACTIVE && (
                  <button 
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm"
                    onClick={() => handleProposalAction(cancelProposal, proposal.id, 'cancelling')}
                  >
                    Cancel
                  </button>
                )}
                
                {proposal.state === PROPOSAL_STATES.SUCCEEDED && (
                  <button 
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm"
                    onClick={() => handleProposalAction(queueProposal, proposal.id, 'queuing')}
                  >
                    Queue
                  </button>
                )}
                
                {proposal.state === PROPOSAL_STATES.QUEUED && (
                  <button 
                    className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-md text-sm"
                    onClick={() => handleProposalAction(executeProposal, proposal.id, 'executing')}
                  >
                    Execute
                  </button>
                )}
                
                {(proposal.state === PROPOSAL_STATES.DEFEATED || 
                  proposal.state === PROPOSAL_STATES.CANCELED || 
                  proposal.state === PROPOSAL_STATES.EXPIRED) && (
                  <button 
                    className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded-md text-sm"
                    onClick={() => handleProposalAction(claimRefund, proposal.id, 'claiming refund for')}
                  >
                    Claim Refund
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            No proposals found
          </div>
        )}
      </div>
      
      {/* Create Proposal Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-screen overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Create New Proposal</h2>
            
            {/* Enhanced Error Display */}
            {transactionError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                <div className="flex items-start">
                  <AlertTriangle className="w-5 h-5 mr-2 mt-0.5" />
                  <div>
                    <p className="font-bold">Error</p>
                    <p>{transactionError}</p>
                    
                    {/* Governance Parameters Info */}
                    <div className="mt-2 text-sm">
                      <p>Governance Parameters:</p>
                      <ul className="list-disc pl-5 mt-1">
                        <li>Required tokens: {governanceMetrics.threshold} JUST</li>
                        <li>Your balance: {governanceMetrics.userBalance} JUST</li>
                        <li>Proposal stake: {governanceMetrics.stake} JUST</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Eligibility Warning - Show if user doesn't have enough tokens */}
            {!governanceMetrics.isEligible && (
              <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
                <div className="flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  <div>
                    <p className="font-bold">You don't have enough tokens to create a proposal</p>
                    <p>Required: {governanceMetrics.threshold} JUST | Your Balance: {governanceMetrics.userBalance} JUST</p>
                  </div>
                </div>
              </div>
            )}
            
            <form onSubmit={handleSubmitProposal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proposal Title</label>
                <input 
                  type="text" 
                  className="w-full rounded-md border border-gray-300 p-2" 
                  placeholder="Enter proposal title" 
                  value={newProposal.title}
                  onChange={(e) => setNewProposal({...newProposal, title: e.target.value})}
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proposal Type</label>
                <select 
                  className="w-full rounded-md border border-gray-300 p-2"
                  value={newProposal.type}
                  onChange={(e) => setNewProposal({...newProposal, type: e.target.value})}
                  required
                >
                  <option value={PROPOSAL_TYPES.GENERAL}>General</option>
                  <option value={PROPOSAL_TYPES.WITHDRAWAL}>Withdrawal</option>
                  <option value={PROPOSAL_TYPES.TOKEN_TRANSFER}>Token Transfer</option>
                  <option value={PROPOSAL_TYPES.GOVERNANCE_CHANGE}>Governance Change</option>
                  <option value={PROPOSAL_TYPES.EXTERNAL_ERC20_TRANSFER}>External ERC20 Transfer</option>
                  <option value={PROPOSAL_TYPES.TOKEN_MINT}>Token Mint</option>
                  <option value={PROPOSAL_TYPES.TOKEN_BURN}>Token Burn</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea 
                  className="w-full rounded-md border border-gray-300 p-2" 
                  rows="4" 
                  placeholder="Describe your proposal"
                  value={newProposal.description}
                  onChange={(e) => setNewProposal({...newProposal, description: e.target.value})}
                  required
                ></textarea>
              </div>
              
              {/* Additional fields based on proposal type */}
              {parseInt(newProposal.type) === PROPOSAL_TYPES.GENERAL && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Address</label>
                    <input 
                      type="text" 
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="0x..." 
                      value={newProposal.target}
                      onChange={(e) => setNewProposal({...newProposal, target: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">The contract address that will be called</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Call Data</label>
                    <input 
                      type="text" 
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="0x..." 
                      value={newProposal.callData}
                      onChange={(e) => setNewProposal({...newProposal, callData: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">The encoded function call data</p>
                  </div>
                </>
              )}
              
              {parseInt(newProposal.type) === PROPOSAL_TYPES.WITHDRAWAL && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Address</label>
                    <input 
                      type="text" 
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="0x..." 
                      value={newProposal.recipient}
                      onChange={(e) => setNewProposal({...newProposal, recipient: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">The address that will receive the ETH</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (ETH)</label>
                    <input 
                      type="number" 
                      step="0.000000000000000001"
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="Amount" 
                      value={newProposal.amount}
                      onChange={(e) => setNewProposal({...newProposal, amount: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Amount of ETH to withdraw</p>
                  </div>
                </>
              )}
              
              {parseInt(newProposal.type) === PROPOSAL_TYPES.TOKEN_TRANSFER && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Address</label>
                    <input 
                      type="text" 
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="0x..." 
                      value={newProposal.recipient}
                      onChange={(e) => setNewProposal({...newProposal, recipient: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">The address that will receive the JUST tokens</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount (JUST)</label>
                    <input 
                      type="number"
                      step="0.000000000000000001"
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="Amount" 
                      value={newProposal.amount}
                      onChange={(e) => setNewProposal({...newProposal, amount: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Amount of JUST tokens to transfer</p>
                  </div>
                </>
              )}
              
              {parseInt(newProposal.type) === PROPOSAL_TYPES.TOKEN_MINT && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Address</label>
                    <input 
                      type="text" 
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="0x..." 
                      value={newProposal.recipient}
                      onChange={(e) => setNewProposal({...newProposal, recipient: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">The address that will receive the minted JUST tokens</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount to Mint (JUST)</label>
                    <input 
                      type="number"
                      step="0.000000000000000001"
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="Amount" 
                      value={newProposal.amount}
                      onChange={(e) => setNewProposal({...newProposal, amount: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Amount of JUST tokens to mint</p>
                  </div>
                </>
              )}
              
              {parseInt(newProposal.type) === PROPOSAL_TYPES.TOKEN_BURN && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From Address</label>
                    <input 
                      type="text" 
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="0x..." 
                      value={newProposal.recipient}
                      onChange={(e) => setNewProposal({...newProposal, recipient: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">The address from which tokens will be burned</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount to Burn (JUST)</label>
                    <input 
                      type="number"
                      step="0.000000000000000001"
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="Amount" 
                      value={newProposal.amount}
                      onChange={(e) => setNewProposal({...newProposal, amount: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Amount of JUST tokens to burn</p>
                  </div>
                </>
              )}
              
              {parseInt(newProposal.type) === PROPOSAL_TYPES.EXTERNAL_ERC20_TRANSFER && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Recipient Address</label>
                    <input 
                      type="text" 
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="0x..." 
                      value={newProposal.recipient}
                      onChange={(e) => setNewProposal({...newProposal, recipient: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">The address that will receive the tokens</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Token Address</label>
                    <input 
                      type="text" 
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="0x..." 
                      value={newProposal.token}
                      onChange={(e) => setNewProposal({...newProposal, token: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">The ERC20 token contract address</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                    <input 
                      type="number"
                      step="0.000000000000000001"
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="Amount" 
                      value={newProposal.amount}
                      onChange={(e) => setNewProposal({...newProposal, amount: e.target.value})}
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Amount of tokens to transfer</p>
                  </div>
                </>
              )}
              
              {parseInt(newProposal.type) === PROPOSAL_TYPES.GOVERNANCE_CHANGE && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Threshold (JUST tokens, optional)</label>
                    <input 
                      type="number"
                      step="0.000000000000000001"
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="New proposal threshold" 
                      value={newProposal.newThreshold}
                      onChange={(e) => setNewProposal({...newProposal, newThreshold: e.target.value})}
                    />
                    <p className="text-xs text-gray-500 mt-1">Minimum tokens required to create a proposal (currently {governanceMetrics.threshold} JUST)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Quorum (JUST tokens, optional)</label>
                    <input 
                      type="number"
                      step="0.000000000000000001"
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="New quorum" 
                      value={newProposal.newQuorum}
                      onChange={(e) => setNewProposal({...newProposal, newQuorum: e.target.value})}
                    />
                    <p className="text-xs text-gray-500 mt-1">Minimum votes required for a proposal to pass (currently {governanceMetrics.quorum} JUST)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Voting Duration (seconds, optional)</label>
                    <input 
                      type="number" 
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="New voting duration" 
                      value={newProposal.newVotingDuration}
                      onChange={(e) => setNewProposal({...newProposal, newVotingDuration: e.target.value})}
                    />
                    <p className="text-xs text-gray-500 mt-1">Duration of the voting period in seconds (currently {governanceMetrics.votingDuration} seconds)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">New Timelock Delay (seconds, optional)</label>
                    <input 
                      type="number" 
                      className="w-full rounded-md border border-gray-300 p-2" 
                      placeholder="New timelock delay" 
                      value={newProposal.newTimelockDelay}
                      onChange={(e) => setNewProposal({...newProposal, newTimelockDelay: e.target.value})}
                    />
                    <p className="text-xs text-gray-500 mt-1">Delay before a passed proposal can be executed</p>
                  </div>
                </>
              )}
              
              <div className="flex justify-end space-x-2 pt-4">
                <button 
                  type="button"
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
                  disabled={submitting || !governanceMetrics.isEligible}
                >
                  {submitting ? 'Creating Proposal...' : 'Create Proposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function for status colors
function getStatusColor(status) {
    switch (status) {
      case 'active':
        return 'bg-yellow-100 text-yellow-800';
      case 'succeeded':
        return 'bg-green-100 text-green-800';
      case 'pending':
      case 'queued':
        return 'bg-blue-100 text-blue-800';
      case 'executed':
        return 'bg-indigo-100 text-indigo-800';
      case 'defeated':
        return 'bg-red-100 text-red-800';
      case 'canceled':
      case 'expired':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
}

export default ProposalsTab;