import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { useAuth } from '../contexts/AuthContext';
import { useDelegation } from '../hooks/useDelegation';
import { useProposals } from '../hooks/useProposals';
import useVoting from '../hooks/useVoting';
import { useDAOStats } from '../hooks/useDAOStats';
import { formatAddress } from '../utils/formatters';
import { PROPOSAL_STATES } from '../utils/constants';
import SecuritySettingsTab from './SecuritySettingsTab';
import RoleManagementTab from './RoleManagementTab';
import TimelockSettingsTab from './TimelockSettingsTab';
import EmergencyControlsTab from './EmergencyControlsTab';
import ProposalsTab from './ProposalsTab';
import VoteTab from './VoteTab';
import DelegationTab from './DelegationTab';
import AnalyticsTab from './AnalyticsTab';
import DashboardTab from './DashboardTab';

const JustDAODashboard = () => {
  // State for active tab
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // State for active security subtab
  const [securitySubtab, setSecuritySubtab] = useState('general');
  
  // Web3 context for blockchain connection
  const { account, isConnected, connectWallet, disconnectWallet, contracts } = useWeb3();
  
  // Custom hooks for DAO functionality
  const delegation = useDelegation();
  const proposalsHook = useProposals();
  const votingHook = useVoting();
  
  // Auth context for user data
  const { user, hasRole } = useAuth();
  
  // Use the enhanced DAO stats hook
  const daoStats = useDAOStats();
  
  // Enhanced address formatter for responsive UI
  const formatAddressResponsive = (address, chars = 6) => {
    if (!address) return '';
    return `${address.substring(0, chars)}...${address.substring(address.length - 4)}`;
  };
  
  // Debug log for voting power calculation
  useEffect(() => {
    console.log("Voting power calculation data:", {
      userBalance: user.balance,
      userDelegate: user.delegate,
      account: account,
      isSelfDelegated: user.delegate === account || user.delegate === ethers.constants.AddressZero,
      delegatedToYou: delegation?.delegationInfo?.delegatedToYou || "0"
    });
  }, [user, account, delegation?.delegationInfo]);
  
  // Helper function to safely handle BigNumber objects
  const safeBigNumberToString = (value) => {
    if (value === null || value === undefined) return "0";
    
    // Check if it's a BigNumber object
    if (value && typeof value === 'object' && value._isBigNumber) {
      try {
        return value.toString();
      } catch (e) {
        return "0";
      }
    }
    
    // If it's already a string or number, just return it as a string
    return String(value);
  };
  
  // Helper function to safely convert to number
  const safeBigNumberToNumber = (value) => {
    const strValue = safeBigNumberToString(value);
    const numValue = parseFloat(strValue);
    return isNaN(numValue) ? 0 : numValue;
  };
  
  // Format numbers to be more readable
  const formatNumber = (value, decimals = 2) => {
    // First convert any BigNumber objects to string
    const safeValue = safeBigNumberToString(value);
    
    // Handle potentially invalid input
    const numValue = parseFloat(safeValue);
    if (isNaN(numValue)) return "0";
    
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
  
  // Format token values to 5 decimal places
  const formatToFiveDecimals = (value) => {
    // Convert BigNumber objects to string first
    const safeValue = safeBigNumberToString(value);
    
    // Handle potentially invalid input
    const numValue = parseFloat(safeValue);
    if (isNaN(numValue)) return "0.00000";
    
    // Return with exactly 5 decimal places
    return numValue.toFixed(5);
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
  
  // Helper function to properly detect self-delegation
  const isSelfDelegated = (userAddress, delegateAddress) => {
    if (!userAddress || !delegateAddress) return true; // Default to self-delegated if addresses aren't available
    
    // Normalize addresses for comparison
    const normalizedUserAddr = userAddress.toLowerCase();
    const normalizedDelegateAddr = delegateAddress.toLowerCase();
    
    // Check if delegate is self or zero address
    return normalizedUserAddr === normalizedDelegateAddr || 
           delegateAddress === '0x0000000000000000000000000000000000000000';
  };
  
  // Calculate voting power based on delegation status
  const calculateVotingPower = () => {
    const delegationInfo = delegation?.delegationInfo || {};
    const balance = parseFloat(safeBigNumberToString(user.balance) || "0");
    const delegatedToYou = parseFloat(safeBigNumberToString(delegationInfo.delegatedToYou) || "0");
    return formatToFiveDecimals(balance + delegatedToYou);
  };
  
  // Check if user is self-delegated
  const checkSelfDelegated = () => {
    const userDelegate = user?.delegate || ethers.constants.AddressZero;
    return isSelfDelegated(account, userDelegate);
  };

  // Prepare safe stats object with all BigNumbers converted to standard formats
  const safeStats = {
    totalHolders: formatNumber(daoStats.totalHolders, 0),
    circulatingSupply: formatNumber(daoStats.circulatingSupply),
    // Make sure these values are safely converted
    activeProposals: safeBigNumberToNumber(daoStats.activeProposals),
    totalProposals: safeBigNumberToNumber(daoStats.totalProposals),
    participationRate: safeBigNumberToNumber(daoStats.participationRate),
    delegationRate: safeBigNumberToNumber(daoStats.delegationRate),
    proposalSuccessRate: safeBigNumberToNumber(daoStats.proposalSuccessRate),
    // These are already formatted
    formattedParticipationRate: daoStats.formattedParticipationRate || "0%",
    formattedDelegationRate: daoStats.formattedDelegationRate || "0%",
    formattedSuccessRate: daoStats.formattedSuccessRate || "0%"
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap justify-between items-center">
          <div className="flex items-center mb-2 md:mb-0">
            <h1 className="text-2xl font-bold text-indigo-600">JustDAO</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {isConnected ? (
              <div className="text-sm text-gray-700 mr-2">
                <div className="flex flex-wrap items-center">
                  <span className="hidden sm:inline mr-2">{formatAddress(account)}</span>
                  <span className="sm:hidden mr-2">{formatAddressResponsive(account, 4)}</span>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {/* On small screens, show compact format */}
                  <span className="hidden sm:inline">{formatToFiveDecimals(user.balance)} JUST</span>
                  <span className="sm:hidden">{parseFloat(formatToFiveDecimals(user.balance)).toFixed(2)} JUST</span>
                  <span className="mx-1">|</span>
                  <span className="whitespace-nowrap">
                    <span className="hidden sm:inline">
                      {checkSelfDelegated() ? 
                        calculateVotingPower() : "0.00000"} 
                    </span>
                    <span className="sm:hidden">
                      {checkSelfDelegated() ? 
                        parseFloat(calculateVotingPower()).toFixed(2) : "0.00"} 
                    </span>
                    <span className="hidden xs:inline"> Voting Power</span>
                    <span className="xs:hidden"> VP</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-700">Not connected</div>
            )}
            {isConnected ? (
              <button 
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 sm:px-4 sm:py-2 text-sm rounded-md whitespace-nowrap"
                onClick={disconnectWallet}
              >
                <span className="hidden sm:inline">Disconnect</span>
                <span className="sm:hidden">Disc.</span>
              </button>
            ) : (
              <button 
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 sm:px-4 sm:py-2 text-sm rounded-md whitespace-nowrap"
                onClick={connectWallet}
              >
                <span className="hidden sm:inline">Connect Wallet</span>
                <span className="sm:hidden">Connect</span>
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
              ...user,
              balance: formatToFiveDecimals(user.balance),
              votingPower: checkSelfDelegated() ? calculateVotingPower() : "0.00000"
            }}
            stats={safeStats} // Using our safely prepared stats object
            loading={daoStats.isLoading}
            proposals={proposalsHook.proposals
              .filter(p => safeBigNumberToNumber(p.state) === PROPOSAL_STATES.ACTIVE)
              .map(p => ({
                ...p,
                state: safeBigNumberToNumber(p.state),
                yesVotes: formatNumber(p.yesVotes),
                noVotes: formatNumber(p.noVotes),
                abstainVotes: formatNumber(p.abstainVotes),
                // Ensure all other potentially problematic fields are converted
                id: safeBigNumberToString(p.id),
                deadline: p.deadline instanceof Date ? p.deadline : new Date(),
                snapshotId: safeBigNumberToString(p.snapshotId)
              }))
            }
          />
        )}
        {activeTab === 'proposals' && (
          <ProposalsTab 
            proposals={proposalsHook.proposals.map(proposal => ({
              ...proposal,
              // Safely convert all potential BigNumber fields
              id: safeBigNumberToString(proposal.id),
              state: safeBigNumberToNumber(proposal.state),
              yesVotes: formatNumber(proposal.yesVotes),
              noVotes: formatNumber(proposal.noVotes),
              abstainVotes: formatNumber(proposal.abstainVotes),
              snapshotId: safeBigNumberToString(proposal.snapshotId)
            }))}
            createProposal={proposalsHook.createProposal}
            cancelProposal={proposalsHook.cancelProposal}
            queueProposal={proposalsHook.queueProposal}
            executeProposal={proposalsHook.executeProposal}
            claimRefund={proposalsHook.claimRefund}
            loading={proposalsHook.loading}
          />
        )}
        {activeTab === 'vote' && (
          <VoteTab 
            proposals={proposalsHook.proposals.map(proposal => ({
              ...proposal,
              // Safely convert all potential BigNumber fields
              id: safeBigNumberToString(proposal.id),
              state: safeBigNumberToNumber(proposal.state),
              yesVotes: formatNumber(proposal.yesVotes),
              noVotes: formatNumber(proposal.noVotes),
              abstainVotes: formatNumber(proposal.abstainVotes),
              snapshotId: safeBigNumberToString(proposal.snapshotId)
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
              ...user,
              balance: formatToFiveDecimals(user.balance),
              votingPower: checkSelfDelegated() ? calculateVotingPower() : "0.00000"
            }}
            delegation={delegation}
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