import React, { useState, useEffect } from 'react';
import { Lock, ShieldAlert, Eye, AlertTriangle, Shield, Users } from 'lucide-react';
import Loader from '../components/Loader';

const SecuritySettingsTab = ({ contracts }) => {
  const [securitySettings, setSecuritySettings] = useState({
    proposalReviewRequired: false,
    proposalVotingDelay: 0,
    delegationLimit: 0,
    threatAssessmentEnabled: false,
    guardianDelay: 0,
    emergencyPauseEnabled: true,
    permissionlessProposals: false,
    multisigThreshold: 0,
    multisigMembers: []
  });
  
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Load security settings
  useEffect(() => {
    const loadSecuritySettings = async () => {
      if (!contracts.governance || !contracts.securityManager) {
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        // Fetch security settings from the contract
        const securityConfig = await contracts.securityManager.getSecurityConfiguration();
        
        // Get delegation limit
        const delegationLimit = await contracts.token.getDelegationLimit();
        
        // Get multisig details if available
        let multisigThreshold = 0;
        let multisigMembers = [];
        
        if (contracts.multisig) {
          multisigThreshold = await contracts.multisig.threshold();
          const memberCount = await contracts.multisig.getOwnerCount();
          
          for (let i = 0; i < memberCount; i++) {
            const owner = await contracts.multisig.owners(i);
            multisigMembers.push(owner);
          }
        }
        
        setSecuritySettings({
          proposalReviewRequired: securityConfig.proposalReviewRequired,
          proposalVotingDelay: securityConfig.proposalVotingDelay.toNumber(),
          delegationLimit: delegationLimit.toNumber(),
          threatAssessmentEnabled: securityConfig.threatAssessmentEnabled,
          guardianDelay: securityConfig.guardianDelay.toNumber(),
          emergencyPauseEnabled: securityConfig.emergencyPauseEnabled,
          permissionlessProposals: securityConfig.permissionlessProposals,
          multisigThreshold,
          multisigMembers
        });
      } catch (error) {
        console.error("Error loading security settings:", error);
        setErrorMessage("Failed to load security settings");
      } finally {
        setLoading(false);
      }
    };
    
    loadSecuritySettings();
  }, [contracts.governance, contracts.securityManager, contracts.token, contracts.multisig]);
  
  // Handle security setting updates
  const updateSecuritySetting = async (setting, value) => {
    setErrorMessage('');
    setSuccessMessage('');
    setUpdating(true);
    
    try {
      let tx;
      
      switch (setting) {
        case 'proposalReviewRequired':
          tx = await contracts.securityManager.setProposalReviewRequired(value);
          break;
        case 'proposalVotingDelay':
          tx = await contracts.securityManager.setProposalVotingDelay(value);
          break;
        case 'delegationLimit':
          tx = await contracts.token.setDelegationLimit(value);
          break;
        case 'threatAssessmentEnabled':
          tx = await contracts.securityManager.setThreatAssessmentEnabled(value);
          break;
        case 'guardianDelay':
          tx = await contracts.securityManager.setGuardianDelay(value);
          break;
        case 'emergencyPauseEnabled':
          tx = await contracts.securityManager.setEmergencyPauseEnabled(value);
          break;
        case 'permissionlessProposals':
          tx = await contracts.securityManager.setPermissionlessProposals(value);
          break;
        default:
          throw new Error('Invalid setting');
      }
      
      await tx.wait();
      
      // Update local state
      setSecuritySettings({
        ...securitySettings,
        [setting]: value
      });
      
      setSuccessMessage(`Successfully updated ${setting}`);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error(`Error updating ${setting}:`, error);
      setErrorMessage(error.message || `Failed to update ${setting}`);
    } finally {
      setUpdating(false);
    }
  };
  
  // Format time in seconds to readable format
  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 86400)} days`;
  };

  // Handle adding a new multisig member
  const handleAddMultisigMember = async (address) => {
    setErrorMessage('');
    setSuccessMessage('');
    setUpdating(true);
    
    try {
      if (!contracts.multisig) {
        throw new Error('Multisig contract not available');
      }
      
      // Validate address format
      if (!address || !address.startsWith('0x') || address.length !== 42) {
        throw new Error('Invalid Ethereum address format');
      }
      
      // Check if address is already a member
      if (securitySettings.multisigMembers.includes(address)) {
        throw new Error('Address is already a multisig member');
      }
      
      const tx = await contracts.multisig.addOwner(address);
      await tx.wait();
      
      // Update local state
      setSecuritySettings({
        ...securitySettings,
        multisigMembers: [...securitySettings.multisigMembers, address]
      });
      
      setSuccessMessage(`Successfully added multisig member: ${address}`);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error("Error adding multisig member:", error);
      setErrorMessage(error.message || 'Failed to add multisig member');
    } finally {
      setUpdating(false);
    }
  };
  
  // Handle removing a multisig member
  const handleRemoveMultisigMember = async (address) => {
    setErrorMessage('');
    setSuccessMessage('');
    setUpdating(true);
    
    try {
      if (!contracts.multisig) {
        throw new Error('Multisig contract not available');
      }
      
      // Check if we'd go below threshold after removal
      if (securitySettings.multisigMembers.length <= securitySettings.multisigThreshold) {
        throw new Error('Cannot remove member: would go below required threshold');
      }
      
      const tx = await contracts.multisig.removeOwner(address);
      await tx.wait();
      
      // Update local state
      setSecuritySettings({
        ...securitySettings,
        multisigMembers: securitySettings.multisigMembers.filter(member => member !== address)
      });
      
      setSuccessMessage(`Successfully removed multisig member: ${address}`);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error("Error removing multisig member:", error);
      setErrorMessage(error.message || 'Failed to remove multisig member');
    } finally {
      setUpdating(false);
    }
  };
  
  // Handle updating multisig threshold
  const handleUpdateMultisigThreshold = async (threshold) => {
    setErrorMessage('');
    setSuccessMessage('');
    setUpdating(true);
    
    try {
      if (!contracts.multisig) {
        throw new Error('Multisig contract not available');
      }
      
      // Validate threshold
      const numThreshold = parseInt(threshold);
      if (isNaN(numThreshold) || numThreshold < 1) {
        throw new Error('Threshold must be at least 1');
      }
      
      if (numThreshold > securitySettings.multisigMembers.length) {
        throw new Error('Threshold cannot be greater than the number of members');
      }
      
      const tx = await contracts.multisig.changeThreshold(numThreshold);
      await tx.wait();
      
      // Update local state
      setSecuritySettings({
        ...securitySettings,
        multisigThreshold: numThreshold
      });
      
      setSuccessMessage(`Successfully updated multisig threshold to ${numThreshold}`);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 3000);
    } catch (error) {
      console.error("Error updating multisig threshold:", error);
      setErrorMessage(error.message || 'Failed to update multisig threshold');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Security Settings</h2>
        <p className="text-gray-500">Configure security parameters for the DAO</p>
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
          <Loader size="large" text="Loading security settings..." />
        </div>
      ) : (
        <>
          {/* Proposal Security */}
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <div className="flex items-center mb-4">
              <Lock className="w-5 h-5 text-indigo-500 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Proposal Security</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Proposal Review Required</p>
                  <p className="text-sm text-gray-500">
                    Require administrative review of proposals before they can be voted on
                  </p>
                </div>
                <div className="relative inline-block w-12 mr-2 align-middle select-none">
                  <input 
                    type="checkbox" 
                    name="toggle" 
                    id="toggleProposalReview" 
                    className="sr-only"
                    checked={securitySettings.proposalReviewRequired}
                    onChange={() => updateSecuritySetting('proposalReviewRequired', !securitySettings.proposalReviewRequired)}
                    disabled={updating}
                  />
                  <label 
                    htmlFor="toggleProposalReview" 
                    className={`block overflow-hidden h-6 rounded-full cursor-pointer ${updating ? 'opacity-50' : ''}`}
                    style={{ backgroundColor: securitySettings.proposalReviewRequired ? '#4f46e5' : '#cbd5e0' }}
                  >
                    <span className={`block h-6 w-6 rounded-full bg-white transform transition-transform duration-200 ease-in ${securitySettings.proposalReviewRequired ? 'translate-x-6' : 'translate-x-0'}`}></span>
                  </label>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Threat Assessment</p>
                  <p className="text-sm text-gray-500">
                    Automatically analyze proposals for security threats
                  </p>
                </div>
                <div className="relative inline-block w-12 mr-2 align-middle select-none">
                  <input 
                    type="checkbox" 
                    name="toggle" 
                    id="toggleThreatAssessment" 
                    className="sr-only"
                    checked={securitySettings.threatAssessmentEnabled}
                    onChange={() => updateSecuritySetting('threatAssessmentEnabled', !securitySettings.threatAssessmentEnabled)}
                    disabled={updating}
                  />
                  <label 
                    htmlFor="toggleThreatAssessment" 
                    className={`block overflow-hidden h-6 rounded-full cursor-pointer ${updating ? 'opacity-50' : ''}`}
                    style={{ backgroundColor: securitySettings.threatAssessmentEnabled ? '#4f46e5' : '#cbd5e0' }}
                  >
                    <span className={`block h-6 w-6 rounded-full bg-white transform transition-transform duration-200 ease-in ${securitySettings.threatAssessmentEnabled ? 'translate-x-6' : 'translate-x-0'}`}></span>
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proposal Voting Delay (seconds)</label>
                <div className="flex space-x-2">
                  <input 
                    type="number" 
                    className="flex-1 rounded-md border border-gray-300 p-2" 
                    value={securitySettings.proposalVotingDelay}
                    onChange={(e) => setSecuritySettings({...securitySettings, proposalVotingDelay: parseInt(e.target.value)})}
                    min="0"
                  />
                  <button 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md disabled:bg-indigo-400"
                    onClick={() => updateSecuritySetting('proposalVotingDelay', securitySettings.proposalVotingDelay)}
                    disabled={updating}
                  >
                    Update
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Current: {formatTime(securitySettings.proposalVotingDelay)}</p>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Permissionless Proposals</p>
                  <p className="text-sm text-gray-500">
                    Allow anyone to create proposals without needing special permissions
                  </p>
                </div>
                <div className="relative inline-block w-12 mr-2 align-middle select-none">
                  <input 
                    type="checkbox" 
                    name="toggle" 
                    id="togglePermissionlessProposals" 
                    className="sr-only"
                    checked={securitySettings.permissionlessProposals}
                    onChange={() => updateSecuritySetting('permissionlessProposals', !securitySettings.permissionlessProposals)}
                    disabled={updating}
                  />
                  <label 
                    htmlFor="togglePermissionlessProposals" 
                    className={`block overflow-hidden h-6 rounded-full cursor-pointer ${updating ? 'opacity-50' : ''}`}
                    style={{ backgroundColor: securitySettings.permissionlessProposals ? '#4f46e5' : '#cbd5e0' }}
                  >
                    <span className={`block h-6 w-6 rounded-full bg-white transform transition-transform duration-200 ease-in ${securitySettings.permissionlessProposals ? 'translate-x-6' : 'translate-x-0'}`}></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          {/* Delegation Security */}
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <div className="flex items-center mb-4">
              <Eye className="w-5 h-5 text-indigo-500 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Delegation Security</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delegation Depth Limit</label>
                <div className="flex space-x-2">
                  <input 
                    type="number" 
                    className="flex-1 rounded-md border border-gray-300 p-2" 
                    value={securitySettings.delegationLimit}
                    onChange={(e) => setSecuritySettings({...securitySettings, delegationLimit: parseInt(e.target.value)})}
                    min="0"
                    max="10"
                  />
                  <button 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md disabled:bg-indigo-400"
                    onClick={() => updateSecuritySetting('delegationLimit', securitySettings.delegationLimit)}
                    disabled={updating}
                  >
                    Update
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Maximum delegation depth (0 = no limit, recommended: 3)
                </p>
              </div>
            </div>
          </div>
          
          {/* Emergency Controls */}
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <div className="flex items-center mb-4">
              <ShieldAlert className="w-5 h-5 text-indigo-500 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Emergency Controls</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Emergency Pause Enabled</p>
                  <p className="text-sm text-gray-500">
                    Allow guardians to temporarily pause DAO governance in an emergency
                  </p>
                </div>
                <div className="relative inline-block w-12 mr-2 align-middle select-none">
                  <input 
                    type="checkbox" 
                    name="toggle" 
                    id="toggleEmergencyPause" 
                    className="sr-only"
                    checked={securitySettings.emergencyPauseEnabled}
                    onChange={() => updateSecuritySetting('emergencyPauseEnabled', !securitySettings.emergencyPauseEnabled)}
                    disabled={updating}
                  />
                  <label 
                    htmlFor="toggleEmergencyPause" 
                    className={`block overflow-hidden h-6 rounded-full cursor-pointer ${updating ? 'opacity-50' : ''}`}
                    style={{ backgroundColor: securitySettings.emergencyPauseEnabled ? '#4f46e5' : '#cbd5e0' }}
                  >
                    <span className={`block h-6 w-6 rounded-full bg-white transform transition-transform duration-200 ease-in ${securitySettings.emergencyPauseEnabled ? 'translate-x-6' : 'translate-x-0'}`}></span>
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Action Delay (seconds)</label>
                <div className="flex space-x-2">
                  <input 
                    type="number" 
                    className="flex-1 rounded-md border border-gray-300 p-2" 
                    value={securitySettings.guardianDelay}
                    onChange={(e) => setSecuritySettings({...securitySettings, guardianDelay: parseInt(e.target.value)})}
                    min="0"
                  />
                  <button 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md disabled:bg-indigo-400"
                    onClick={() => updateSecuritySetting('guardianDelay', securitySettings.guardianDelay)}
                    disabled={updating}
                  >
                    Update
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Current: {formatTime(securitySettings.guardianDelay)}</p>
                <p className="text-xs text-gray-500">Time delay before guardian actions take effect</p>
              </div>
            </div>
          </div>
          
          {/* Multisig Settings */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center mb-4">
              <Users className="w-5 h-5 text-indigo-500 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Multisig Security</h3>
            </div>
            
            {contracts.multisig ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Multisig Threshold</label>
                  <div className="flex space-x-2">
                    <input 
                      type="number" 
                      className="flex-1 rounded-md border border-gray-300 p-2" 
                      value={securitySettings.multisigThreshold}
                      onChange={(e) => setSecuritySettings({...securitySettings, multisigThreshold: parseInt(e.target.value)})}
                      min="1"
                      max={securitySettings.multisigMembers.length}
                    />
                    <button 
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md disabled:bg-indigo-400"
                      onClick={() => handleUpdateMultisigThreshold(securitySettings.multisigThreshold)}
                      disabled={updating}
                    >
                      Update
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Number of signers required to approve multisig transactions
                  </p>
                </div>
                
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-medium">Multisig Members ({securitySettings.multisigMembers.length})</h4>
                  </div>
                  
                  <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                    {securitySettings.multisigMembers.map((member, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <span className="text-sm font-mono">{member}</span>
                        <button 
                          className="text-red-600 hover:text-red-800 text-sm"
                          onClick={() => handleRemoveMultisigMember(member)}
                          disabled={updating || securitySettings.multisigMembers.length <= securitySettings.multisigThreshold}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Add New Member</label>
                    <div className="flex space-x-2">
                      <input 
                        type="text" 
                        id="newMemberAddress"
                        className="flex-1 rounded-md border border-gray-300 p-2" 
                        placeholder="0x..."
                      />
                      <button 
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md disabled:bg-indigo-400"
                        onClick={() => {
                          const address = document.getElementById('newMemberAddress').value;
                          handleAddMultisigMember(address);
                          document.getElementById('newMemberAddress').value = '';
                        }}
                        disabled={updating}
                      >
                        Add
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Enter Ethereum address of new multisig member
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <Shield className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p>Multisig contract not available or configured for this DAO</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SecuritySettingsTab;