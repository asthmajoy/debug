// src/contexts/Web3Context.jsx
// Enhanced error handling and contract initialization with better debugging

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import JustTokenABI from '../config/abis/JustTokenUpgradeable.json';
import JustGovernanceABI from '../config/abis/JustGovernanceUpgradeable.json';
import JustTimelockABI from '../config/abis/JustTimelockUpgradeable.json';
import JustAnalyticsHelperABI from '../config/abis/JustAnalyticsHelperUpgradeable.json';
import JustDAOHelperABI from '../config/abis/JustDAOHelperUpgradeable.json';
import { CONTRACT_ADDRESSES } from '../utils/constants.js';

const Web3Context = createContext();
 
export function useWeb3() {
  return useContext(Web3Context);
}

export function Web3Provider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [networkId, setNetworkId] = useState(null);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [contracts, setContracts] = useState({
    token: null,
    governance: null,
    timelock: null,
    analyticsHelper: null,
    daoHelper: null,
    securityManager: null // Additional reference for security settings
  });
  const [contractsReady, setContractsReady] = useState(false);
  const [contractErrors, setContractErrors] = useState({});
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [connectionError, setConnectionError] = useState(null);
  
  // Expected network is Sepolia (chainId 11155111)
  const EXPECTED_NETWORK_ID = 11155111;
  const NETWORK_NAME = "Sepolia";
  
  // Use refs to store functions that need to access other functions
  // This prevents dependency cycles without hooks
  const functionsRef = useRef({});

  // Initialize contracts function
  functionsRef.current.initializeContracts = async (provider, signer) => {
    try {
      setContractsReady(false);
      const newContractErrors = {};
      const newContracts = {};
      
      console.log("Initializing contracts with addresses:", CONTRACT_ADDRESSES);
      
      // Initialize token contract
      try {
        const tokenContract = new ethers.Contract(
          CONTRACT_ADDRESSES.token,
          JustTokenABI.abi,
          signer
        );
        // Verify contract is accessible by calling a view function
        await tokenContract.name();
        newContracts.token = tokenContract;
        console.log("Token contract initialized successfully");
      } catch (error) {
        console.error("Error initializing token contract:", error);
        newContractErrors.token = error.message;
      }
      
      // Initialize governance contract
      try {
        const governanceContract = new ethers.Contract(
          CONTRACT_ADDRESSES.governance,
          JustGovernanceABI.abi,
          signer
        );
        // Verify contract works
        try {
          // Try to call a view function to verify
          await governanceContract.govParams();
        } catch (verifyError) {
          console.error("Error verifying governance contract:", verifyError);
          throw verifyError;
        }
        newContracts.governance = governanceContract;
        console.log("Governance contract initialized successfully");
      } catch (error) {
        console.error("Error initializing governance contract:", error);
        newContractErrors.governance = error.message;
      }
      
      // Initialize timelock contract
      try {
        const timelockContract = new ethers.Contract(
          CONTRACT_ADDRESSES.timelock,
          JustTimelockABI.abi,
          signer
        );
        // Verify contract works
        try {
          await timelockContract.minDelay();
        } catch (verifyError) {
          console.error("Error verifying timelock contract:", verifyError);
          throw verifyError;
        }
        newContracts.timelock = timelockContract;
        console.log("Timelock contract initialized successfully");
      } catch (error) {
        console.error("Error initializing timelock contract:", error);
        newContractErrors.timelock = error.message;
      }
      
      // Initialize analytics helper contract
      try {
        const analyticsHelperContract = new ethers.Contract(
          CONTRACT_ADDRESSES.analyticsHelper,
          JustAnalyticsHelperABI.abi,
          signer
        );
        
        newContracts.analyticsHelper = analyticsHelperContract;
        console.log("Analytics helper contract initialized successfully");
      } catch (error) {
        console.error("Error initializing analytics helper contract:", error);
        newContractErrors.analyticsHelper = error.message;
      }
      
      // Initialize DAO helper contract
      try {
        const daoHelperContract = new ethers.Contract(
          CONTRACT_ADDRESSES.daoHelper,
          JustDAOHelperABI.abi,
          signer
        );
        newContracts.daoHelper = daoHelperContract;
        console.log("DAO helper contract initialized successfully");
      } catch (error) {
        console.error("Error initializing DAO helper contract:", error);
        newContractErrors.daoHelper = error.message;
      }
      
      // For security settings - governance contract also handles this
      newContracts.securityManager = newContracts.governance;
      
      setContracts(newContracts);
      setContractErrors(newContractErrors);
      
      // Mark as ready if at least token and governance are available
      const isReady = newContracts.token && newContracts.governance;
      setContractsReady(isReady);
      
      // Set a refresh flag to trigger data reloads
      setRefreshCounter(prev => prev + 1);
      
      return isReady;
    } catch (error) {
      console.error("Error in contract initialization:", error);
      setContractErrors({global: error.message});
      setConnectionError("Failed to initialize contracts. Please check your connection.");
      setContractsReady(false);
      return false;
    }
  };

  // Define handler functions and store in functionsRef
  functionsRef.current.handleAccountsChanged = (accounts) => {
    if (accounts.length === 0) {
      // User has disconnected all accounts
      setIsConnected(false);
      setAccount('');
      setContractsReady(false);
    } else {
      setAccount(accounts[0]);
      // Refresh contract data with new account
      if (provider) {
        const signer = provider.getSigner();
        setSigner(signer);
        functionsRef.current.initializeContracts(provider, signer);
      }
    }
  };

  functionsRef.current.handleChainChanged = (chainIdHex) => {
    const chainId = parseInt(chainIdHex, 16);
    // Reload the page when the chain changes
    setNetworkId(chainId);
    setIsCorrectNetwork(chainId === EXPECTED_NETWORK_ID);
    
    // If network changed, reinitialize contracts
    if (provider && isConnected) {
      const signer = provider.getSigner();
      setSigner(signer);
      functionsRef.current.initializeContracts(provider, signer);
    }
    
    console.log("Network changed to:", chainId);
  };

  // Check if wallet is already connected on page load
  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          // Check if already connected
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            // Get network info
            const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
            const network = await web3Provider.getNetwork();
            const chainId = network.chainId;
            
            setAccount(accounts[0]);
            setProvider(web3Provider);
            setSigner(web3Provider.getSigner());
            setIsConnected(true);
            setNetworkId(chainId);
            setIsCorrectNetwork(chainId === EXPECTED_NETWORK_ID);
            
            // Initialize contracts
            if (chainId === EXPECTED_NETWORK_ID) {
              await functionsRef.current.initializeContracts(web3Provider, web3Provider.getSigner());
            }
            
            // Set up listeners
            window.ethereum.on('accountsChanged', functionsRef.current.handleAccountsChanged);
            window.ethereum.on('chainChanged', functionsRef.current.handleChainChanged);
            
            console.log("Connected to wallet:", accounts[0]);
            console.log("Network:", network.name, "ChainId:", chainId);
          }
        } catch (error) {
          console.error("Error checking wallet connection:", error);
          setConnectionError("Error connecting to wallet. Please try again.");
        }
      }
    };
    
    checkConnection();
    
    // Cleanup function
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', functionsRef.current.handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', functionsRef.current.handleChainChanged);
      }
    };
  }, []); // No dependencies - this runs once on mount

  async function switchToCorrectNetwork() {
    if (!window.ethereum) return false;
    
    try {
      // Try to switch to the Sepolia network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x' + EXPECTED_NETWORK_ID.toString(16) }],
      });
      return true;
    } catch (error) {
      if (error.code === 4902) {
        // Network not added to MetaMask, let's add it
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0x' + EXPECTED_NETWORK_ID.toString(16),
                chainName: 'Sepolia Test Network',
                nativeCurrency: {
                  name: 'Sepolia ETH',
                  symbol: 'ETH',
                  decimals: 18
                },
                rpcUrls: ['https://sepolia.infura.io/v3/'],
                blockExplorerUrls: ['https://sepolia.etherscan.io/']
              }
            ],
          });
          return true;
        } catch (addError) {
          console.error("Error adding Sepolia network:", addError);
          setConnectionError("Failed to add Sepolia network to your wallet.");
          return false;
        }
      }
      console.error("Error switching network:", error);
      setConnectionError("Failed to switch to Sepolia network.");
      return false;
    }
  }

  async function connectWallet() {
    setConnectionError(null);
    try {
      // Check if MetaMask is installed
      if (window.ethereum) {
        // Reset any previous errors
        setContractErrors({});
        
        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // Get network info
        const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
        const network = await web3Provider.getNetwork();
        const chainId = network.chainId;
        
        // Check if we're on the correct network
        const correctNetwork = chainId === EXPECTED_NETWORK_ID;
        setIsCorrectNetwork(correctNetwork);
        
        // If not on correct network, prompt to switch
        if (!correctNetwork) {
          const networkSwitched = await switchToCorrectNetwork();
          if (!networkSwitched) {
            setConnectionError(`Please switch to ${NETWORK_NAME} network to use this application.`);
            return false;
          }
        }
        
        setAccount(accounts[0]);
        setProvider(web3Provider);
        setSigner(web3Provider.getSigner());
        setIsConnected(true);
        setNetworkId(chainId);
        
        // Initialize contracts
        const success = await functionsRef.current.initializeContracts(web3Provider, web3Provider.getSigner());
        
        // Set up listeners
        window.ethereum.on('accountsChanged', functionsRef.current.handleAccountsChanged);
        window.ethereum.on('chainChanged', functionsRef.current.handleChainChanged);
        
        console.log("Connected to:", accounts[0]);
        console.log("Network:", network.name, "ChainId:", chainId);
        
        return success;
      } else {
        console.error("MetaMask is not installed");
        setConnectionError("Please install MetaMask to use this application");
        return false;
      }
    } catch (error) {
      console.error("Error connecting to wallet:", error);
      setConnectionError("Failed to connect to wallet: " + error.message);
      return false;
    }
  }

  async function refreshData() {
    // Trigger a refresh of all data by incrementing the counter
    setRefreshCounter(prev => prev + 1);
  }

  async function disconnectWallet() {
    setIsConnected(false);
    setAccount('');
    setSigner(null);
    setContracts({
      token: null,
      governance: null,
      timelock: null,
      analyticsHelper: null,
      daoHelper: null,
      securityManager: null
    });
    setContractsReady(false);
    setContractErrors({});
    setConnectionError(null);
    
    // Remove listeners
    if (window.ethereum) {
      window.ethereum.removeListener('accountsChanged', functionsRef.current.handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', functionsRef.current.handleChainChanged);
    }
  }

  const value = {
    provider,
    signer,
    account,
    isConnected,
    networkId,
    isCorrectNetwork,
    contracts,
    contractsReady,
    contractErrors,
    refreshCounter,
    connectionError,
    connectWallet,
    disconnectWallet,
    refreshData,
    switchToCorrectNetwork
  };

  return (
    <Web3Context.Provider value={value}>
      {children}
    </Web3Context.Provider>
  );
}