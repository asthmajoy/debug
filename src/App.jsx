// src/App.js
import React, { useState, useEffect } from 'react';
import { useWeb3 } from './contexts/Web3Context';
import { useAuth } from './contexts/AuthContext';
import { BlockchainDataProvider } from './contexts/BlockchainDataContext';
import JustDAODashboard from './components/JustDAO.jsx'; // Make sure to include the .jsx extension
import Loader from './components/Loader';

function App() {
  const { isConnected, connectWallet, contractsReady, contracts } = useWeb3();
  const { loading: authLoading } = useAuth();
  const [blockchainProviderReady, setBlockchainProviderReady] = useState(false);
  
  // Ensure we have actual contract objects before proceeding
  useEffect(() => {
    if (contractsReady && contracts) {
      console.log("Contracts status:", {
        contractsReady,
        contractKeys: Object.keys(contracts || {})
      });
      
      // Consider it ready even if contracts aren't fully available
      // Our BlockchainDataService will provide mock data in that case
      setBlockchainProviderReady(true);
    } else {
      setBlockchainProviderReady(false);
    }
  }, [contracts, contractsReady]);

  if (isConnected && (!blockchainProviderReady || authLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader size="large" text="Loading DAO data..." />
      </div>
    );
  }

  return (
    <div className="App">
      {!isConnected ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-indigo-600">JustDAO</h1>
              <p className="mt-2 text-gray-600">Connect your wallet to access the DAO dashboard</p>
            </div>
            <button
              onClick={connectWallet}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition duration-150"
            >
              Connect Wallet
            </button>
          </div>
        </div>
      ) : (
        <BlockchainDataProvider>
          <JustDAODashboard key={`dashboard-${blockchainProviderReady}`} />
        </BlockchainDataProvider>
      )}
    </div>
  );
}

export default App;