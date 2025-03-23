import React, { useState } from 'react';
import { ethers } from 'ethers';
import { PROPOSAL_STATES, PROPOSAL_TYPES } from '../utils/constants';
import { formatRelativeTime, formatBigNumber, formatAddress, formatTime } from '../utils/formatters';
import Loader from './Loader';
import { ChevronDown, ChevronUp, Copy } from 'lucide-react';

const ProposalsTab = ({ 
  proposals, 
  createProposal, 
  cancelProposal, 
  queueProposal, 
  executeProposal, 
  claimRefund,
  loading
}) => {
  const [proposalType, setProposalType] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedProposalId, setExpandedProposalId] = useState(null);
  const [copiedAddressId, setCopiedAddressId] = useState(null);
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

  const toggleProposalDetails = (proposalId) => {
    if (expandedProposalId === proposalId) {
      setExpandedProposalId(null);
    } else {
      setExpandedProposalId(proposalId);
    }
  };

  const copyToClipboard = (text, addressId) => {
    navigator.clipboard.writeText(text);
    setCopiedAddressId(addressId);
    setTimeout(() => setCopiedAddressId(null), 2000);
  };

  const renderAddress = (address, label, size = "normal", index = 0) => {
    const isExpanded = true; // Always show copy button for addresses in expanded view
    const addressId = `${label}-${index}-${address.substring(0, 8)}`;
    const textSize = size === "small" ? "text-xs" : "";
    
    return (
      <div className={`flex items-center ${textSize}`}>
        <span className="font-medium mr-2">{label}:</span>
        <span className="font-mono break-all">{address}</span>
        {isExpanded && (
          <button 
            onClick={() => copyToClipboard(address, addressId)} 
            className="ml-2 text-gray-500 hover:text-indigo-600 focus:outline-none"
            title="Copy to clipboard"
          >
            <Copy className="w-4 h-4" />
          </button>
        )}
        {copiedAddressId === addressId && (
          <span className="ml-2 text-xs text-green-600">Copied!</span>
        )}
      </div>
    );
  };

  const handleSubmitProposal = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setTransactionError('');
    
    try {
      const description = `${newProposal.title}\n\n${newProposal.description}`;
      
      // Convert values to proper format
      const amount = newProposal.amount ? ethers.utils.parseEther(newProposal.amount.toString()) : 0;
      const newThreshold = newProposal.newThreshold ? ethers.utils.parseEther(newProposal.newThreshold.toString()) : 0;
      const newQuorum = newProposal.newQuorum ? ethers.utils.parseEther(newProposal.newQuorum.toString()) : 0;
      const newVotingDuration = newProposal.newVotingDuration ? parseInt(newProposal.newVotingDuration) : 0;
      const newTimelockDelay = newProposal.newTimelockDelay ? parseInt(newProposal.newTimelockDelay) : 0;
      
      // Validate inputs based on proposal type
      if (!validateProposalInputs(newProposal)) {
        setTransactionError('Please fill in all required fields for this proposal type.');
        setSubmitting(false);
        return;
      }
      
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
              
              <div className="border-t-2 pt-4 mb-4">
                {expandedProposalId === proposal.id ? (
                  <div>
                    <p className="text-sm text-gray-700 mb-2">{proposal.description}</p>
                    <div className="mt-4 border-t pt-4">
                      <h4 className="font-medium mb-2">Proposal Details</h4>
                      {renderAddress(proposal.proposer, "Proposer Address", "small", proposal.id)}
                      {/* Display proposal-specific details */}
                      {proposal.type === PROPOSAL_TYPES.GENERAL && (
                        <div className="mt-2 text-xs bg-gray-50 p-4 rounded">
                          {renderAddress(proposal.target, "Target", "normal", `${proposal.id}-target`)}
                          <p className="mt-2 font-medium">Call Data:</p>
                          <pre className="bg-gray-100 p-2 mt-1 rounded overflow-x-auto">{proposal.callData}</pre>
                        </div>
                      )}
                      
                      {(proposal.type === PROPOSAL_TYPES.WITHDRAWAL || 
                        proposal.type === PROPOSAL_TYPES.TOKEN_TRANSFER || 
                        proposal.type === PROPOSAL_TYPES.TOKEN_MINT || 
                        proposal.type === PROPOSAL_TYPES.TOKEN_BURN) && (
                        <div className="mt-2 text-xs bg-gray-50 p-4 rounded">
                          {renderAddress(proposal.recipient, "Recipient", "normal", `${proposal.id}-recipient`)}
                          <p className="mt-2"><span className="font-medium">Amount:</span> {typeof proposal.amount === 'string' ? proposal.amount : formatBigNumber(proposal.amount)} {proposal.type === PROPOSAL_TYPES.WITHDRAWAL ? 'ETH' : 'JUST'}</p>
                        </div>
                      )}
                      
                      {proposal.type === PROPOSAL_TYPES.EXTERNAL_ERC20_TRANSFER && (
                        <div className="mt-2 text-xs bg-gray-50 p-4 rounded">
                          {renderAddress(proposal.recipient, "Recipient", "normal", `${proposal.id}-recipient`)}
                          {renderAddress(proposal.token, "Token", "normal", `${proposal.id}-token`)}
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
            
            {transactionError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                <p className="font-bold">Error</p>
                <p>{transactionError}</p>
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
                    <p className="text-xs text-gray-500 mt-1">Minimum tokens required to create a proposal</p>
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
                    <p className="text-xs text-gray-500 mt-1">Minimum votes required for a proposal to pass</p>
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
                    <p className="text-xs text-gray-500 mt-1">Duration of the voting period in seconds</p>
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
                  disabled={submitting}
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