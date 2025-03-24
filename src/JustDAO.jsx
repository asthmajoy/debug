// src/components/JustDAO.jsx - Fixed import line and references
import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { useAuth } from '../contexts/AuthContext';
import { useBlockchainData } from '../contexts/BlockchainDataContext';
import { formatAddress } from '../utils/formatters';
import { formatTokenAmount, formatTokenForHeader } from '../utils/tokenFormatters';
import { PROPOSAL_STATES } from '../utils/constants';

// Import components
import SecuritySettingsTab from './SecuritySettingsTab';
import RoleManagementTab from './RoleManagementTab';
import TimelockSettingsTab from './TimelockSettingsTab';
import EmergencyControlsTab from './EmergencyControlsTab';
import ProposalsTab from './ProposalsTab';
import VoteTab from './VoteTab';
import DelegationTab from './DelegationTab';
import AnalyticsTab from './AnalyticsTab';
import DashboardTab from './DashboardTab';

// Helper function to safely convert string to number
const safeStringToNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const numValue = parseFloat(String(value));
  return isNaN(numValue) ? 0 : numValue;
};

const JustDAODashboard = () => {
  // State for active tab
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // State for active security subtab
  const [securitySubtab, setSecuritySubtab] = useState('general');
  
  // Web3 context for blockchain connection
  const { account, isConnected, connectWallet, disconnectWallet, contracts } = useWeb3();
  
  // Auth context for user roles
  const { hasRole } = useAuth();
  
  // Use our blockchain data context
  const { 
    userData, 
    daoStats, 
    isLoading: dataLoading, 
    refreshData, 
    getProposalVoteTotals 
  } = useBlockchainData();
  
  // Import delegationHook, proposalsHook, and votingHook as before
  // These would be used for actions, while our blockchain data context handles data fetching
  const { useDelegation } = require('../hooks/useDelegation');
  const { useProposals } = require('../hooks/useProposals');
  const { useVoting } = require('../hooks/useVoting');
  
  const delegation = useDelegation();
  const proposalsHook = useProposals();
  const votingHook = useVoting();
  
  // Format numbers to be more readable
  const formatNumber = (value, decimals = 2) => {
    // Handle potentially invalid input
    const numValue = safeStringToNumber(value);
    
    // If it's a whole number or very close to it, don't show decimals
    if (Math.abs(numValue - Math.round(numValue)) < 0.00001) {
      return numValue.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }
    
    // Format with the specified number of decimal places
    return numValue.toLocaleString(undefined, { 
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals
    });
  };
  
  // Render security subcomponent based on securitySubtab state
  const renderSecuritySubtab = () => {
    switch (securitySubtab) {
      case 'general':
        return <SecuritySettingsTab contracts={contracts} />;
      case 'roles':
        return <RoleManagementTab contracts={contracts} />;
      case 'timelock':
        return <TimelockSettingsTab contracts={contracts} />;
      case 'emergency':
        return <EmergencyControlsTab contracts={contracts} account={account} hasRole={hasRole} />;
      default:
        return <SecuritySettingsTab contracts={contracts} />;
    }
  };

  // Handle manual refresh button click
  const handleRefresh = () => {
    refreshData();
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-indigo-600">JustDAO</h1>
          </div>
          <div className="flex items-center gap-4">
            {isConnected ? (
              <div className="text-sm text-gray-700">
                <div>{formatAddress(account)}</div>
                <div className="flex gap-2">
                  <span>{formatTokenForHeader(userData.balance)} JUST</span>
                  <span>|</span>
                  <span>{formatTokenForHeader(userData.votingPower)} Voting Power</span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-700">Not connected</div>
            )}
            {isConnected ? (
              <div className="flex gap-2">
                <button 
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 p-2 rounded-md"
                  onClick={handleRefresh}
                  title="Refresh data"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                </button>
                <button 
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md"
                  onClick={disconnectWallet}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button 
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md"
                onClick={connectWallet}
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white shadow-sm mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex overflow-x-auto">
            <div 
              className={`py-4 px-6 cursor-pointer border-b-2 ${activeTab === 'dashboard' ? 'border-indigo-500 text-indigo-600' : 'border-transparent hover:text-gray-700 hover:border-gray-300'}`}
              onClick={() => setActiveTab('dashboard')}
              data-tab="dashboard"
            >
              Dashboard
            </div>
            <div 
              className={`py-4 px-6 cursor-pointer border-b-2 ${activeTab === 'proposals' ? 'border-indigo-500 text-indigo-600' : 'border-transparent hover:text-gray-700 hover:border-gray-300'}`}
              onClick={() => setActiveTab('proposals')}
              data-tab="proposals"
            >
              Proposals
            </div>
            <div 
              className={`py-4 px-6 cursor-pointer border-b-2 ${activeTab === 'vote' ? 'border-indigo-500 text-indigo-600' : 'border-transparent hover:text-gray-700 hover:border-gray-300'}`}
              onClick={() => setActiveTab('vote')}
              data-tab="vote"
            >
              Vote
            </div>
            <div 
              className={`py-4 px-6 cursor-pointer border-b-2 ${activeTab === 'delegation' ? 'border-indigo-500 text-indigo-600' : 'border-transparent hover:text-gray-700 hover:border-gray-300'}`}
              onClick={() => setActiveTab('delegation')}
              data-tab="delegation"
            >
              Delegation
            </div>
            
            {/* Analytics tab - only visible to analytics role */}
            {hasRole('analytics') && (
              <div 
                className={`py-4 px-6 cursor-pointer border-b-2 ${activeTab === 'analytics' ? 'border-indigo-500 text-indigo-600' : 'border-transparent hover:text-gray-700 hover:border-gray-300'}`}
                onClick={() => setActiveTab('analytics')}
                data-tab="analytics"
              >
                Analytics
              </div>
            )}
            
            {/* Security tab - only visible to admin or guardian roles */}
            {(hasRole('admin') || hasRole('guardian')) && (
              <div 
                className={`py-4 px-6 cursor-pointer border-b-2 ${activeTab === 'security' ? 'border-indigo-500 text-indigo-600' : 'border-transparent hover:text-gray-700 hover:border-gray-300'}`}
                onClick={() => {
                  setActiveTab('security');
                  setSecuritySubtab('general');
                }}
                data-tab="security"
              >
                Security
              </div>
            )}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        {activeTab === 'dashboard' && (
          <DashboardTab 
            user={{
              ...userData,
              balance: formatTokenAmount(userData.balance),
              votingPower: formatTokenAmount(userData.votingPower)
            }}
            stats={daoStats} 
            loading={dataLoading}
            proposals={proposalsHook.proposals
              .filter(p => safeStringToNumber(p.state) === PROPOSAL_STATES.ACTIVE)
              .map(p => ({
                ...p,
                state: safeStringToNumber(p.state),
                yesVotes: formatNumber(p.yesVotes),
                noVotes: formatNumber(p.noVotes),
                abstainVotes: formatNumber(p.abstainVotes),
                id: String(p.id),
                deadline: p.deadline instanceof Date ? p.deadline : new Date(),
                snapshotId: String(p.snapshotId)
              }))
            }
            getProposalVoteTotals={getProposalVoteTotals}
          />
        )}
        
        {activeTab === 'proposals' && (
          <ProposalsTab 
            proposals={proposalsHook.proposals.map(proposal => ({
              ...proposal,
              id: String(proposal.id),
              state: safeStringToNumber(proposal.state),
              yesVotes: formatNumber(proposal.yesVotes),
              noVotes: formatNumber(proposal.noVotes),
              abstainVotes: formatNumber(proposal.abstainVotes),
              snapshotId: String(proposal.snapshotId)
            }))}
            createProposal={proposalsHook.createProposal}
            cancelProposal={proposalsHook.cancelProposal}
            queueProposal={proposalsHook.queueProposal}
            executeProposal={proposalsHook.executeProposal}
            claimRefund={proposalsHook.claimRefund}
            loading={proposalsHook.loading}
            user={{
              ...userData,
              balance: formatTokenAmount(userData.balance)
            }}
          />
        )}
        
        {activeTab === 'vote' && (
          <VoteTab 
            proposals={proposalsHook.proposals.map(proposal => ({
              ...proposal,
              id: String(proposal.id),
              state: safeStringToNumber(proposal.state),
              yesVotes: formatNumber(proposal.yesVotes),
              noVotes: formatNumber(proposal.noVotes),
              abstainVotes: formatNumber(proposal.abstainVotes),
              snapshotId: String(proposal.snapshotId)
            }))}
            castVote={votingHook.castVote}
            hasVoted={votingHook.hasVoted}
            getVotingPower={votingHook.getVotingPower}
            voting={votingHook.voting}
            account={account}
          />
        )}
        
        {activeTab === 'delegation' && (
          <DelegationTab 
            user={{
              ...userData,
              address: account,
              balance: formatTokenAmount(userData.balance),
              votingPower: formatTokenAmount(userData.votingPower)
            }}
            delegation={{
              ...delegation,
              delegationInfo: {
                currentDelegate: userData.delegate,
                lockedTokens: userData.lockedTokens,
                delegatedToYou: userData.delegatedToYou,
                delegators: userData.delegators
              },
              loading: dataLoading
            }}
          />
        )}
        
        {activeTab === 'analytics' && hasRole('analytics') && (
          <AnalyticsTab contracts={contracts} />
        )}
        
        {activeTab === 'security' && (hasRole('admin') || hasRole('guardian')) && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Security & Administration</h2>
              <p className="text-gray-500">Manage security settings and administrative functions</p>
            </div>
            
            {/* Security Subtabs */}
            <div className="bg-white p-4 rounded-lg shadow mb-6">
              <div className="flex flex-wrap gap-2">
                <button
                  className={`px-3 py-1 rounded-full text-sm ${securitySubtab === 'general' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}
                  onClick={() => setSecuritySubtab('general')}
                >
                  General Security
                </button>
                
                {hasRole('admin') && (
                  <button
                    className={`px-3 py-1 rounded-full text-sm ${securitySubtab === 'roles' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}
                    onClick={() => setSecuritySubtab('roles')}
                  >
                    Role Management
                  </button>
                )}
                
                {hasRole('admin') && (
                  <button
                    className={`px-3 py-1 rounded-full text-sm ${securitySubtab === 'timelock' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}
                    onClick={() => setSecuritySubtab('timelock')}
                  >
                    Timelock
                  </button>
                )}
                
                {(hasRole('admin') || hasRole('guardian')) && (
                  <button
                    className={`px-3 py-1 rounded-full text-sm ${securitySubtab === 'emergency' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}
                    onClick={() => setSecuritySubtab('emergency')}
                  >
                    Emergency Controls
                  </button>
                )}
              </div>
            </div>
            
            {/* Render the selected security subtab */}
            {renderSecuritySubtab()}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          JustDAO &copy; {new Date().getFullYear()} - Powered by JustDAO Governance Framework
        </div>
      </footer>
    </div>
  );
};

export default JustDAODashboard;