import React, { useState, useEffect } from 'react';
import { AlertTriangle, Shield, AlertCircle, Lock, X, Check } from 'lucide-react';
import Loader from '../components/Loader';

const EmergencyControlsTab = ({ contracts, account, hasRole }) => {
  // Your component code here
  const [emergencyStatus, setEmergencyStatus] = useState({
    paused: false,
    pauseExpiry: null,
    lastPausedBy: '',
    lastPausedAt: null,
    pauseCount: 0,
    activeThreatLevel: 0
  });
  const [emergencyLog, setEmergencyLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Pause duration options
  const pauseDurations = [
    { value: 3600, label: '1 hour' },
    { value: 86400, label: '1 day' },
    { value: 259200, label: '3 days' },
    { value: 604800, label: '1 week' }
  ];
  const [selectedPauseDuration, setSelectedPauseDuration] = useState(pauseDurations[0].value);
  const [pauseReason, setPauseReason] = useState('');
  
  // Threat levels
  const threatLevels = [
    { level: 0, label: 'None', color: 'bg-green-100 text-green-800' },
    { level: 1, label: 'Low', color: 'bg-blue-100 text-blue-800' },
    { level: 2, label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
    { level: 3, label: 'High', color: 'bg-orange-100 text-orange-800' },
    { level: 4, label: 'Critical', color: 'bg-red-100 text-red-800' }
  ];
  
  // Load emergency status
  useEffect(() => {
    const loadEmergencyStatus = async () => {
      if (!contracts.emergencyManager) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        // Get current emergency status
        const isPaused = await contracts.emergencyManager.paused();
        let pauseExpiry = null;
        let lastPausedBy = '';
        let lastPausedAt = null;
        let pauseCount = 0;
        let activeThreatLevel = 0;
        
        if (isPaused) {
          pauseExpiry = await contracts.emergencyManager.pauseExpiry();
          lastPausedBy = await contracts.emergencyManager.lastPausedBy();
          const lastPausedTimestamp = await contracts.emergencyManager.lastPausedAt();
          lastPausedAt = new Date(lastPausedTimestamp.toNumber() * 1000);
        }
        
        pauseCount = (await contracts.emergencyManager.pauseCount()).toNumber();
        
        // Get threat level if available
        if (contracts.securityManager) {
          activeThreatLevel = (await contracts.securityManager.activeThreatLevel()).toNumber();
        }
        
        setEmergencyStatus({
          paused: isPaused,
          pauseExpiry: pauseExpiry ? new Date(pauseExpiry.toNumber() * 1000) : null,
          lastPausedBy,
          lastPausedAt,
          pauseCount,
          activeThreatLevel
        });
        
        // Get emergency log
        await loadEmergencyLog();
      } catch (error) {
        console.error("Error loading emergency status:", error);
        setErrorMessage("Failed to load emergency status");
      } finally {
        setLoading(false);
      }
    };
    
    const loadEmergencyLog = async () => {
      try {
        // Get emergency events
        const pauseEvents = await contracts.emergencyManager.queryFilter(contracts.emergencyManager.filters.Paused());
        const unpauseEvents = await contracts.emergencyManager.queryFilter(contracts.emergencyManager.filters.Unpaused());
        
        // Combine and sort events
        const allEvents = [
          ...pauseEvents.map(e => ({
            type: 'pause',
            by: e.args.account,
            reason: e.args.reason || 'No reason provided',
            timestamp: e.args.timestamp ? new Date(e.args.timestamp.toNumber() * 1000) : new Date(e.blockTimestamp * 1000),
            txHash: e.transactionHash
          })),
          ...unpauseEvents.map(e => ({
            type: 'unpause',
            by: e.args ? e.args.account : account,
            timestamp: e.args && e.args.timestamp ? new Date(e.args.timestamp.toNumber() * 1000) : new Date(e.blockTimestamp * 1000),
            txHash: e.transactionHash
          }))
        ].sort((a, b) => b.timestamp - a.timestamp);
        
        setEmergencyLog(allEvents);
      } catch (error) {
        console.error("Error loading emergency logs:", error);
      }
    };
    
    loadEmergencyStatus();
  }, [contracts.emergencyManager, contracts.securityManager, account]);
  
  // Pause governance
  const pauseGovernance = async () => {
    if (!pauseReason.trim()) {
      setErrorMessage('Please provide a reason for the pause');
      return;
    }
    
    setErrorMessage('');
    setSuccessMessage('');
    setTransactionLoading(true);
    
    try {
      // Calculate expiry timestamp
      const now = Math.floor(Date.now() / 1000);
      const expiryTime = now + selectedPauseDuration;
      
      // Pause governance
      const tx = await contracts.emergencyManager.pause(expiryTime, pauseReason);
      await tx.wait();
      
      // Update state
      setEmergencyStatus({
        ...emergencyStatus,
        paused: true,
        pauseExpiry: new Date(expiryTime * 1000),
        lastPausedBy: account,
        lastPausedAt: new Date(),
        pauseCount: emergencyStatus.pauseCount + 1
      });
      
      // Add to log
      setEmergencyLog([
        {
          type: 'pause',
          by: account,
          reason: pauseReason,
          timestamp: new Date(),
          txHash: tx.hash
        },
        ...emergencyLog
      ]);
      
      setSuccessMessage('Governance paused successfully');
      setPauseReason('');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error("Error pausing governance:", error);
      setErrorMessage(error.message || 'Failed to pause governance');
    } finally {
      setTransactionLoading(false);
    }
  };
  
  // Unpause governance
  const unpauseGovernance = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setTransactionLoading(true);
    
    try {
      // Unpause governance
      const tx = await contracts.emergencyManager.unpause();
      await tx.wait();
      
      // Update state
      setEmergencyStatus({
        ...emergencyStatus,
        paused: false,
        pauseExpiry: null
      });
      
      // Add to log
      setEmergencyLog([
        {
          type: 'unpause',
          by: account,
          timestamp: new Date(),
          txHash: tx.hash
        },
        ...emergencyLog
      ]);
      
      setSuccessMessage('Governance unpaused successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error("Error unpausing governance:", error);
      setErrorMessage(error.message || 'Failed to unpause governance');
    } finally {
      setTransactionLoading(false);
    }
  };
  
  // Update threat level
  const updateThreatLevel = async (level) => {
    if (!contracts.securityManager) return;
    
    setErrorMessage('');
    setSuccessMessage('');
    setTransactionLoading(true);
    
    try {
      // Update threat level
      const tx = await contracts.securityManager.setActiveThreatLevel(level);
      await tx.wait();
      
      // Update state
      setEmergencyStatus({
        ...emergencyStatus,
        activeThreatLevel: level
      });
      
      setSuccessMessage(`Threat level updated to ${threatLevels[level].label}`);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error("Error updating threat level:", error);
      setErrorMessage(error.message || 'Failed to update threat level');
    } finally {
      setTransactionLoading(false);
    }
  };
  
  // Format date
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return date.toLocaleString();
  };
  
  // Format address
  const formatAddress = (address) => {
    if (!address) return 'N/A';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };
  
  // Format time remaining
  const formatTimeRemaining = (expiry) => {
    if (!expiry) return 'N/A';
    const now = new Date();
    if (now > expiry) return 'Expired';
    
    const diffMs = expiry - now;
    const diffSecs = Math.floor(diffMs / 1000);
    
    if (diffSecs < 60) return `${diffSecs} seconds`;
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)} minutes`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)} hours`;
    return `${Math.floor(diffSecs / 86400)} days`;
  };
  
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Emergency Controls</h2>
        <p className="text-gray-500">Guardian and emergency management functions</p>
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
      
      {!hasRole('admin') && !hasRole('guardian') && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          You do not have the required permissions to use emergency controls.
        </div>
      )}
      
      {loading ? (
        <div className="bg-white p-6 rounded-lg shadow">
          <Loader size="large" text="Loading emergency status..." />
        </div>
      ) : (
        <>
          {/* Emergency Status */}
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <div className="flex items-center mb-4">
              <Shield className="w-5 h-5 text-indigo-500 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Emergency Status</h3>
            </div>
            
            <div className="flex items-center mb-4">
              <div className={`py-1 px-3 rounded-full text-sm ${emergencyStatus.paused ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                {emergencyStatus.paused ? 'Governance Paused' : 'Governance Active'}
              </div>
              
              {emergencyStatus.paused && (
                <div className="ml-4 text-sm">
                  <span className="text-gray-500">Expires in:</span> {formatTimeRemaining(emergencyStatus.pauseExpiry)}
                </div>
              )}
              
              {contracts.securityManager && (
                <div className={`ml-4 py-1 px-3 rounded-full text-sm ${threatLevels[emergencyStatus.activeThreatLevel].color}`}>
                  Threat Level: {threatLevels[emergencyStatus.activeThreatLevel].label}
                </div>
              )}
            </div>
            
            {emergencyStatus.paused && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <p className="text-gray-500">Paused By</p>
                  <p>{formatAddress(emergencyStatus.lastPausedBy)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Paused At</p>
                  <p>{formatDate(emergencyStatus.lastPausedAt)}</p>
                </div>
              </div>
            )}
            
            <p className="text-sm text-gray-600 mb-4">Total pause count: {emergencyStatus.pauseCount}</p>
            
            {/* Emergency Controls */}
            {(hasRole('admin') || hasRole('guardian')) && (
              <div className="border-t border-gray-200 pt-4">
                {emergencyStatus.paused ? (
                  <button
                    className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md disabled:bg-green-300"
                    onClick={unpauseGovernance}
                    disabled={transactionLoading}
                  >
                    Unpause Governance
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pause Duration</label>
                      <select
                        className="w-full md:w-auto rounded-md border border-gray-300 p-2"
                        value={selectedPauseDuration}
                        onChange={(e) => setSelectedPauseDuration(parseInt(e.target.value))}
                      >
                        {pauseDurations.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Pause</label>
                      <textarea
                        className="w-full rounded-md border border-gray-300 p-2"
                        rows="2"
                        value={pauseReason}
                        onChange={(e) => setPauseReason(e.target.value)}
                        placeholder="Provide a reason for pausing governance"
                      ></textarea>
                    </div>
                    
                    <button
                      className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md disabled:bg-red-300"
                      onClick={pauseGovernance}
                      disabled={transactionLoading}
                    >
                      Pause Governance
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Threat Level Controls */}
          {(hasRole('admin') || hasRole('guardian')) && contracts.securityManager && (
            <div className="bg-white p-6 rounded-lg shadow mb-6">
              <div className="flex items-center mb-4">
                <AlertCircle className="w-5 h-5 text-indigo-500 mr-2" />
                <h3 className="text-lg font-medium text-gray-900">Threat Level Controls</h3>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Set the active threat level to adjust security measures and timelock delays.
              </p>
              
              <div className="flex flex-wrap gap-2">
                {threatLevels.map(threat => (
                  <button
                    key={threat.level}
                    className={`px-4 py-2 rounded-md text-sm font-medium ${
                      emergencyStatus.activeThreatLevel === threat.level
                        ? 'bg-indigo-600 text-white'
                        : threat.color
                    }`}
                    onClick={() => updateThreatLevel(threat.level)}
                    disabled={transactionLoading || emergencyStatus.activeThreatLevel === threat.level}
                  >
                    {threat.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Emergency Log */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center mb-4">
              <Lock className="w-5 h-5 text-indigo-500 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Emergency Actions Log</h3>
            </div>
            
            {emergencyLog.length === 0 ? (
              <p className="text-center py-4 text-gray-500">No emergency actions recorded</p>
            ) : (
              <div className="space-y-4">
                {emergencyLog.map((log, idx) => (
                  <div key={idx} className={`p-4 rounded-lg border ${log.type === 'pause' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                    <div className="flex items-center mb-2">
                      {log.type === 'pause' ? (
                        <X className="w-5 h-5 text-red-500 mr-2" />
                      ) : (
                        <Check className="w-5 h-5 text-green-500 mr-2" />
                      )}
                      <span className="font-medium">{log.type === 'pause' ? 'Governance Paused' : 'Governance Unpaused'}</span>
                      <span className="text-sm text-gray-500 ml-auto">{formatDate(log.timestamp)}</span>
                    </div>
                    <div className="text-sm">
                      <p><span className="text-gray-500">By:</span> {formatAddress(log.by)}</p>
                      {log.type === 'pause' && log.reason && (
                        <p className="mt-1"><span className="text-gray-500">Reason:</span> {log.reason}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default EmergencyControlsTab;