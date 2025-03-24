import React, { useState, useEffect } from 'react';
import { ClockIcon, History, ArrowRight, AlertTriangle } from 'lucide-react';
import Loader from '../components/Loader';

const TimelockSettingsTab = ({ contracts }) => {
  const [timelockSettings, setTimelockSettings] = useState({
    minDelay: 0,
    highRiskDelay: 0,
    criticalRiskDelay: 0,
    executors: [],
    proposers: [],
    cancellers: []
  });
  
  const [pendingTransactions, setPendingTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Load timelock settings
  useEffect(() => {
    const loadTimelockSettings = async () => {
      if (!contracts.timelock) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        // Get timelock configuration
        const minDelay = await contracts.timelock.getMinDelay();
        
        // Get additional risk-based delays if available
        let highRiskDelay = minDelay;
        let criticalRiskDelay = minDelay;
        
        if (contracts.timelockController) {
          highRiskDelay = await contracts.timelockController.getRiskBasedDelay(2); // High risk level
          criticalRiskDelay = await contracts.timelockController.getRiskBasedDelay(3); // Critical risk level
        }
        
        // Get roles
        const EXECUTOR_ROLE = await contracts.timelock.EXECUTOR_ROLE();
        const PROPOSER_ROLE = await contracts.timelock.PROPOSER_ROLE();
        const CANCELLER_ROLE = await contracts.timelock.CANCELLER_ROLE();
        
        // Fetch role holders from past events
        const executorEvents = await contracts.timelock.queryFilter(contracts.timelock.filters.RoleGranted(EXECUTOR_ROLE));
        const proposerEvents = await contracts.timelock.queryFilter(contracts.timelock.filters.RoleGranted(PROPOSER_ROLE));
        const cancellerEvents = await contracts.timelock.queryFilter(contracts.timelock.filters.RoleGranted(CANCELLER_ROLE));
        
        // Extract unique addresses
        const executors = [...new Set(executorEvents.map(e => e.args.account))];
        const proposers = [...new Set(proposerEvents.map(e => e.args.account))];
        const cancellers = [...new Set(cancellerEvents.map(e => e.args.account))];
        
        setTimelockSettings({
          minDelay: minDelay.toNumber(),
          highRiskDelay: highRiskDelay.toNumber(),
          criticalRiskDelay: criticalRiskDelay.toNumber(),
          executors,
          proposers,
          cancellers
        });
        
        // Get pending transactions
        await loadPendingTransactions();
      } catch (error) {
        console.error("Error loading timelock settings:", error);
        setErrorMessage("Failed to load timelock settings");
      } finally {
        setLoading(false);
      }
    };
    
    const loadPendingTransactions = async () => {
      try {
        // Query for scheduled events that haven't been executed yet
        const scheduledEvents = await contracts.timelock.queryFilter(contracts.timelock.filters.CallScheduled());
        const executedEvents = await contracts.timelock.queryFilter(contracts.timelock.filters.CallExecuted());
        const cancelledEvents = await contracts.timelock.queryFilter(contracts.timelock.filters.Cancelled());
        
        // Create sets of executed and cancelled operation IDs for quick lookup
        const executedIds = new Set(executedEvents.map(e => e.args.id));
        const cancelledIds = new Set(cancelledEvents.map(e => e.args.id));
        
        // Filter scheduled operations that haven't been executed or cancelled
        const pending = scheduledEvents
          .filter(e => !executedIds.has(e.args.id) && !cancelledIds.has(e.args.id))
          .map(e => ({
            id: e.args.id,
            target: e.args.target,
            value: e.args.value.toString(),
            data: e.args.data,
            predecessor: e.args.predecessor,
            delay: e.args.delay.toNumber(),
            scheduledAt: new Date(e.args.timestamp.toNumber() * 1000),
            readyAt: new Date((e.args.timestamp.toNumber() + e.args.delay.toNumber()) * 1000),
            canExecute: (Date.now() / 1000) >= (e.args.timestamp.toNumber() + e.args.delay.toNumber()),
            // Try to extract some meaningful info from the data
            description: parseTransactionData(e.args.data)
          }));
        
        setPendingTransactions(pending);
      } catch (error) {
        console.error("Error loading pending transactions:", error);
      }
    };
    
    loadTimelockSettings();
  }, [contracts.timelock, contracts.timelockController]);
  
  // Parse transaction data to try and extract a human-readable description
  const parseTransactionData = (data) => {
    try {
      // Try to extract function signature (first 4 bytes of the data)
      const functionSignature = data.slice(0, 10);
      
      // Known function signatures
      const signatures = {
        '0x5c39fcc1': 'setQuorum',
        '0xf437bc59': 'setVotingPeriod',
        '0x91ddadf4': 'setProposalThreshold',
        '0x3a66f901': 'setTimelockDelay',
        '0x40c10f19': 'mint',
        '0xa9059cbb': 'transfer',
        '0x2d61a355': 'setDelegationLimit',
        '0x23b872dd': 'transferFrom',
        '0x9a1fcda6': 'upgradeContract'
      };
      
      if (signatures[functionSignature]) {
        return `${signatures[functionSignature]} operation`;
      }
      
      return 'Unknown operation';
    } catch (error) {
      return 'Transaction data';
    }
  };
  
  // Update timelock delay
  const updateTimelockDelay = async (delayType) => {
    setErrorMessage('');
    setSuccessMessage('');
    setTxLoading(true);
    
    try {
      let tx;
      
      if (delayType === 'minDelay') {
        tx = await contracts.timelock.updateDelay(timelockSettings.minDelay);
      } else if (contracts.timelockController) {
        if (delayType === 'highRiskDelay') {
          tx = await contracts.timelockController.setRiskBasedDelay(2, timelockSettings.highRiskDelay);
        } else if (delayType === 'criticalRiskDelay') {
          tx = await contracts.timelockController.setRiskBasedDelay(3, timelockSettings.criticalRiskDelay);
        }
      } else {
        throw new Error('Unsupported delay type');
      }
      
      await tx.wait();
      setSuccessMessage(`Successfully updated ${delayType === 'minDelay' ? 'minimum delay' : delayType === 'highRiskDelay' ? 'high risk delay' : 'critical risk delay'}`);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error(`Error updating ${delayType}:`, error);
      setErrorMessage(error.message || `Failed to update ${delayType}`);
    } finally {
      setTxLoading(false);
    }
  };
  
  // Execute a scheduled transaction
  const executeTransaction = async (id, target, value, data, predecessor) => {
    setErrorMessage('');
    setSuccessMessage('');
    setTxLoading(true);
    
    try {
      const tx = await contracts.timelock.execute(
        target,
        value,
        data,
        predecessor,
        id
      );
      
      await tx.wait();
      
      // Remove from pending transactions
      setPendingTransactions(pendingTransactions.filter(t => t.id !== id));
      
      setSuccessMessage('Transaction executed successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error("Error executing transaction:", error);
      setErrorMessage(error.message || 'Failed to execute transaction');
    } finally {
      setTxLoading(false);
    }
  };
  
  // Cancel a scheduled transaction
  const cancelTransaction = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this transaction? This action cannot be undone.')) {
      return;
    }
    
    setErrorMessage('');
    setSuccessMessage('');
    setTxLoading(true);
    
    try {
      const tx = await contracts.timelock.cancel(id);
      await tx.wait();
      
      // Remove from pending transactions
      setPendingTransactions(pendingTransactions.filter(t => t.id !== id));
      
      setSuccessMessage('Transaction cancelled successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error("Error cancelling transaction:", error);
      setErrorMessage(error.message || 'Failed to cancel transaction');
    } finally {
      setTxLoading(false);
    }
  };
  
  // Format time
  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days`;
    return `${Math.floor(seconds / 604800)} weeks`;
  };
  
  // Format date
  const formatDate = (date) => {
    return date.toLocaleString();
  };
  
  // Format address
  const formatAddress = (address) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Timelock Settings</h2>
        <p className="text-gray-500">Manage delayed execution settings for governance actions</p>
      </div>
      
      {errorMessage && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex items-start">
          <AlertTriangle className="w-5 h-5 mr-2 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}
      
      {successMessage && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {successMessage}
        </div>
      )}
      
      {loading ? (
        <div className="bg-white p-6 rounded-lg shadow">
          <Loader size="large" text="Loading timelock settings..." />
        </div>
      ) : (
        <>
          {/* Timelock Delays */}
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <div className="flex items-center mb-4">
              <ClockIcon className="w-5 h-5 text-indigo-500 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Timelock Delays</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Delay (seconds)</label>
                <div className="flex space-x-2">
                  <input 
                    type="number" 
                    className="flex-1 rounded-md border border-gray-300 p-2" 
                    value={timelockSettings.minDelay}
                    onChange={(e) => setTimelockSettings({...timelockSettings, minDelay: parseInt(e.target.value)})}
                    min="0"
                  />
                  <button 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md disabled:bg-indigo-400"
                    onClick={() => updateTimelockDelay('minDelay')}
                    disabled={txLoading}
                  >
                    Update
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Standard delay for low-risk actions: {formatTime(timelockSettings.minDelay)}</p>
              </div>
              
              {contracts.timelockController && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">High-Risk Action Delay (seconds)</label>
                    <div className="flex space-x-2">
                      <input 
                        type="number" 
                        className="flex-1 rounded-md border border-gray-300 p-2" 
                        value={timelockSettings.highRiskDelay}
                        onChange={(e) => setTimelockSettings({...timelockSettings, highRiskDelay: parseInt(e.target.value)})}
                        min={timelockSettings.minDelay}
                      />
                      <button 
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md disabled:bg-indigo-400"
                        onClick={() => updateTimelockDelay('highRiskDelay')}
                        disabled={txLoading}
                      >
                        Update
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Delay for high-risk actions: {formatTime(timelockSettings.highRiskDelay)}</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Critical-Risk Action Delay (seconds)</label>
                    <div className="flex space-x-2">
                      <input 
                        type="number" 
                        className="flex-1 rounded-md border border-gray-300 p-2" 
                        value={timelockSettings.criticalRiskDelay}
                        onChange={(e) => setTimelockSettings({...timelockSettings, criticalRiskDelay: parseInt(e.target.value)})}
                        min={timelockSettings.highRiskDelay}
                      />
                      <button 
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md disabled:bg-indigo-400"
                        onClick={() => updateTimelockDelay('criticalRiskDelay')}
                        disabled={txLoading}
                      >
                        Update
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Delay for critical-risk actions: {formatTime(timelockSettings.criticalRiskDelay)}</p>
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Timelock Roles */}
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <div className="flex items-center mb-4">
              <History className="w-5 h-5 text-indigo-500 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Timelock Roles</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-medium mb-2">Executors</h4>
                <div className="space-y-1 mb-2">
                  {timelockSettings.executors.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">None (anyone can execute)</p>
                  ) : (
                    timelockSettings.executors.map((address, idx) => (
                      <div key={idx} className="text-sm bg-gray-50 p-2 rounded-md">
                        {formatAddress(address)}
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-gray-500">Accounts that can execute timelock operations</p>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Proposers</h4>
                <div className="space-y-1 mb-2">
                  {timelockSettings.proposers.map((address, idx) => (
                    <div key={idx} className="text-sm bg-gray-50 p-2 rounded-md">
                      {formatAddress(address)}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500">Accounts that can schedule operations</p>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Cancellers</h4>
                <div className="space-y-1 mb-2">
                  {timelockSettings.cancellers.map((address, idx) => (
                    <div key={idx} className="text-sm bg-gray-50 p-2 rounded-md">
                      {formatAddress(address)}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500">Accounts that can cancel operations</p>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                <strong>Note:</strong> Adding or removing roles requires a proposal to be passed through governance.
              </p>
            </div>
          </div>
          
          {/* Pending Transactions */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center mb-4">
              <ArrowRight className="w-5 h-5 text-indigo-500 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Pending Transactions</h3>
            </div>
            
            {pendingTransactions.length === 0 ? (
              <p className="text-center py-4 text-gray-500">No pending transactions</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Operation</th>
                      <th className="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                      <th className="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled</th>
                      <th className="px-4 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ready At</th>
                      <th className="px-4 py-3 bg-gray-50 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pendingTransactions.map((tx, idx) => (
                      <tr key={tx.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {tx.description}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatAddress(tx.target)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(tx.scheduledAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(tx.readyAt)}
                          <div className="text-xs">
                            {tx.canExecute ? (
                              <span className="text-green-600">Ready to execute</span>
                            ) : (
                              <span className="text-yellow-600">Waiting for delay</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <button
                              className={`px-2 py-1 rounded-md text-xs font-medium ${
                                tx.canExecute 
                                  ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              }`}
                              onClick={() => tx.canExecute && executeTransaction(tx.id, tx.target, tx.value, tx.data, tx.predecessor)}
                              disabled={!tx.canExecute || txLoading}
                            >
                              Execute
                            </button>
                            <button
                              className="px-2 py-1 bg-red-100 text-red-800 rounded-md text-xs font-medium hover:bg-red-200"
                              onClick={() => cancelTransaction(tx.id)}
                              disabled={txLoading}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TimelockSettingsTab;