// src/contexts/BlockchainDataContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useWeb3 } from './Web3Context';
import { getBlockchainDataService } from '../services/BlockchainDataService';

// Create the context
const BlockchainDataContext = createContext(null);

export const BlockchainDataProvider = ({ children }) => {
  const { account, isConnected, contracts, provider, contractsReady } = useWeb3();
  const [dataService, setDataService] = useState(null);
  const [serviceReady, setServiceReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [userData, setUserData] = useState({
    balance: "0",
    votingPower: "0",
    delegate: null,
    lockedTokens: "0",
    delegatedToYou: "0",
    delegators: []
  });
  const [daoStats, setDaoStats] = useState({
    totalHolders: 0,
    circulatingSupply: "0",
    activeProposals: 0,
    totalProposals: 0,
    participationRate: 0,
    delegationRate: 0,
    proposalSuccessRate: 0,
    isLoading: true
  });

  // Check if contracts have required methods
  const verifyContracts = useCallback((contractsObj) => {
    if (!contractsObj) return false;
    
    // Check if justToken contract exists and has required methods
    const hasJustToken = contractsObj.justToken && 
      typeof contractsObj.justToken.balanceOf === 'function' &&
      typeof contractsObj.justToken.getDelegate === 'function';
    
    // Check if governance contract exists
    const hasGovernance = contractsObj.governance && 
      typeof contractsObj.governance.getActiveProposalCount === 'function';
    
    console.log("Contract verification:", { hasJustToken, hasGovernance });
    
    return hasJustToken && hasGovernance;
  }, []);

  // Initialize the blockchain data service
  useEffect(() => {
    // Only initialize if we have provider and contracts are ready
    if (!provider || !contractsReady || !contracts) {
      console.log("Waiting for provider and contracts to be available");
      setServiceReady(false);
      return;
    }
    
    // Verify contracts have required methods
    const contractsValid = verifyContracts(contracts);
    if (!contractsValid) {
      console.error("Contracts missing required methods");
      setServiceReady(false);
      return;
    }
    
    console.log("Initializing BlockchainDataService with verified contracts");
    const service = getBlockchainDataService({ provider }, contracts);
    setDataService(service);
    setServiceReady(true);
  }, [provider, contracts, contractsReady, verifyContracts]);

  // Fetch user data when account changes or on manual refresh
  const fetchUserData = useCallback(async () => {
    if (!serviceReady || !dataService || !account || !isConnected) {
      console.log("Cannot fetch user data - prerequisites not met", {
        serviceReady, 
        hasDataService: Boolean(dataService), 
        hasAccount: Boolean(account), 
        isConnected
      });
      return;
    }

    setIsLoading(true);
    try {
      console.log(`Fetching user data for account ${account}`);
      
      // Fetch all user data in parallel
      const [balance, delegationInfo, votingPower] = await Promise.all([
        dataService.getTokenBalance(account),
        dataService.getDelegationInfo(account),
        dataService.getVotingPower(account)
      ]);

      console.log(`User data fetched for account ${account}:`, {
        balance,
        delegate: delegationInfo.currentDelegate,
        votingPower
      });

      setUserData({
        balance,
        votingPower,
        delegate: delegationInfo.currentDelegate,
        lockedTokens: delegationInfo.lockedTokens,
        delegatedToYou: delegationInfo.delegatedToYou,
        delegators: delegationInfo.delegators
      });
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [dataService, account, isConnected, serviceReady]);

  // Fetch DAO stats
  const fetchDAOStats = useCallback(async () => {
    if (!serviceReady || !dataService) {
      console.log("Cannot fetch DAO stats - prerequisites not met", {
        serviceReady, 
        hasDataService: Boolean(dataService)
      });
      return;
    }

    setDaoStats(prev => ({ ...prev, isLoading: true }));
    try {
      console.log("Fetching DAO stats");
      const stats = await dataService.getDAOStats();
      console.log("DAO stats fetched:", stats);
      setDaoStats(stats);
    } catch (error) {
      console.error("Error fetching DAO stats:", error);
      setDaoStats(prev => ({ ...prev, isLoading: false }));
    }
  }, [dataService, serviceReady]);

  // Fetch proposal vote data
  const getProposalVoteTotals = useCallback(async (proposalId) => {
    if (!serviceReady || !dataService || !proposalId) {
      console.log("Cannot fetch proposal votes - prerequisites not met", {
        serviceReady, 
        hasDataService: Boolean(dataService),
        hasProposalId: Boolean(proposalId)
      });
      return null;
    }
    
    try {
      console.log(`Fetching vote totals for proposal ${proposalId}`);
      return await dataService.getProposalVoteTotals(proposalId);
    } catch (error) {
      console.error(`Error fetching vote data for proposal ${proposalId}:`, error);
      return null;
    }
  }, [dataService, serviceReady]);

  // Refresh all data
  const refreshData = useCallback(() => {
    if (!serviceReady) {
      console.log("Cannot refresh data - service not ready");
      return;
    }
    
    console.log("Manual refresh of blockchain data triggered");
    fetchUserData();
    fetchDAOStats();
  }, [fetchUserData, fetchDAOStats, serviceReady]);

  // Clear cache and refresh data
  const forceRefresh = useCallback(() => {
    if (!serviceReady || !dataService) {
      console.log("Cannot force refresh - prerequisites not met");
      return;
    }
    
    console.log("Force refresh with cache clearing");
    dataService.clearCache();
    refreshData();
  }, [dataService, refreshData, serviceReady]);

  // Initial data fetch when account or service changes
  useEffect(() => {
    if (isConnected && account && serviceReady && dataService) {
      console.log(`Initial data fetch for account ${account}`);
      fetchUserData();
    }
  }, [isConnected, account, serviceReady, dataService, fetchUserData]);

  // Fetch DAO stats when service is ready
  useEffect(() => {
    if (serviceReady && dataService) {
      fetchDAOStats();
      
      // Set up polling for stats updates every 30 seconds
      const intervalId = setInterval(fetchDAOStats, 30000);
      
      return () => clearInterval(intervalId);
    }
  }, [serviceReady, dataService, fetchDAOStats]);

  // Provide context value
  const value = {
    userData,
    daoStats,
    isLoading,
    refreshData,
    forceRefresh,
    getProposalVoteTotals,
    dataService,
    serviceReady
  };

  return (
    <BlockchainDataContext.Provider value={value}>
      {children}
    </BlockchainDataContext.Provider>
  );
};

// Custom hook to use the blockchain data context
export const useBlockchainData = () => {
  const context = useContext(BlockchainDataContext);
  if (!context) {
    throw new Error('useBlockchainData must be used within a BlockchainDataProvider');
  }
  return context;
};

export default BlockchainDataContext;