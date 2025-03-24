import React, { useState, useEffect } from 'react';
import { Shield, PlusCircle, Trash2 } from 'lucide-react';
import Loader from '../components/Loader';

const RoleManagementTab = ({ contracts }) => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleData, setNewRoleData] = useState({
    address: '',
    role: 'admin',
    customRole: ''
  });
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Available roles
  const availableRoles = [
    { id: 'admin', name: 'Admin', description: 'Full administrative control over the DAO' },
    { id: 'analytics', name: 'Analytics', description: 'Access to analytics and reporting data' },
    { id: 'guardian', name: 'Guardian', description: 'Emergency response capabilities' },
    { id: 'proposer', name: 'Proposer', description: 'Can create proposals without threshold' },
    { id: 'timelock', name: 'Timelock Manager', description: 'Can manage timelock operations' },
    { id: 'executor', name: 'Executor', description: 'Can execute passed proposals' },
    { id: 'custom', name: 'Custom Role', description: 'Define a custom role' }
  ];

  // Load roles data
  useEffect(() => {
    const loadRoles = async () => {
      if (!contracts.roleManager) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Get all role assignments
        const roleEvents = await contracts.roleManager.queryFilter(contracts.roleManager.filters.RoleGranted());
        const revokedEvents = await contracts.roleManager.queryFilter(contracts.roleManager.filters.RoleRevoked());
        
        // Process events to get current role assignments
        const revokedRoles = new Set();
        revokedEvents.forEach(event => {
          const key = `${event.args.role}-${event.args.account}`;
          revokedRoles.add(key);
        });
        
        const currentRoles = [];
        for (const event of roleEvents) {
          const key = `${event.args.role}-${event.args.account}`;
          if (!revokedRoles.has(key)) {
            // Check if this is a known role or custom
            const roleName = getRoleName(event.args.role);
            
            currentRoles.push({
              address: event.args.account,
              role: event.args.role,
              displayName: roleName,
              grantedAt: new Date(event.blockTimestamp * 1000).toLocaleDateString(),
              txHash: event.transactionHash
            });
          }
        }
        
        setRoles(currentRoles);
      } catch (error) {
        console.error("Error loading roles:", error);
      } finally {
        setLoading(false);
      }
    };

    loadRoles();
  }, [contracts.roleManager]);

  // Helper function to get readable role name from role hash
  const getRoleName = (roleHash) => {
    // Check against known role hashes
    const knownRoles = {
      '0x0000000000000000000000000000000000000000000000000000000000000000': 'Default Admin',
      '0xd0b7542f66b44067c25524298865c94b7d42a42a7e08177fd482a14eee469dbf': 'Admin',
      '0x964d976a856d5d2ae0dd75615803d9eab5f16a935919603edacadbe9649f1da4': 'Guardian',
      '0x8f2157482fb2bf7ba9a48d0daf4a0d28ce79f04a471517936083435cf5943366': 'Analytics',
      '0xb923c69a54657b9dbaf776310c008e80b6f272711895f60f84f24b949fefd194': 'Proposer',
      '0xb6046f344147d0b1496229c76f12a9b631e32c7b6dc5388a71f365232bcf150c': 'Timelock Manager',
      '0x7a9ac023163a81858ee74272cc1c75623b6237e15b9ced95c3d14a32c3ba2a3a': 'Executor'
    };
    
    return knownRoles[roleHash] || 'Custom Role';
  };

  // Handle granting new role
  const handleGrantRole = async () => {
    setErrorMessage('');
    
    if (!newRoleData.address) {
      setErrorMessage('Please enter a valid address');
      return;
    }
    
    const roleId = newRoleData.role === 'custom' ? newRoleData.customRole : newRoleData.role;
    
    setTransactionLoading(true);
    try {
      // Grant the role
      const tx = await contracts.roleManager.grantRole(roleId, newRoleData.address);
      await tx.wait();
      
      // Update UI
      setRoles([...roles, {
        address: newRoleData.address,
        role: roleId,
        displayName: getRoleName(roleId),
        grantedAt: new Date().toLocaleDateString(),
        txHash: tx.hash
      }]);
      
      // Close modal and reset form
      setShowAddRoleModal(false);
      setNewRoleData({
        address: '',
        role: 'admin',
        customRole: ''
      });
    } catch (error) {
      console.error("Error granting role:", error);
      setErrorMessage(error.message || 'Error granting role. See console for details.');
    } finally {
      setTransactionLoading(false);
    }
  };

  // Handle revoking a role
  const handleRevokeRole = async (roleHash, address) => {
    if (!window.confirm(`Are you sure you want to revoke this role from ${address}?`)) {
      return;
    }
    
    try {
      const tx = await contracts.roleManager.revokeRole(roleHash, address);
      await tx.wait();
      
      // Update UI by removing the revoked role
      setRoles(roles.filter(r => !(r.role === roleHash && r.address === address)));
    } catch (error) {
      console.error("Error revoking role:", error);
      alert('Error revoking role. See console for details.');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold">Role Management</h2>
          <p className="text-gray-500">Assign and manage roles for DAO participants</p>
        </div>
        <button 
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md flex items-center"
          onClick={() => setShowAddRoleModal(true)}
        >
          <PlusCircle className="w-4 h-4 mr-1" />
          Assign Role
        </button>
      </div>
      
      {/* Roles List */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Current Role Assignments</h3>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader size="large" text="Loading roles..." />
          </div>
        ) : roles.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            No custom roles have been assigned yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Granted On</th>
                  <th className="px-6 py-3 bg-gray-50 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {roles.map((role, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Shield className="w-5 h-5 text-indigo-500 mr-2" />
                        <span className="text-sm font-medium">{role.displayName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {role.address}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {role.grantedAt}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        className="text-red-600 hover:text-red-900 flex items-center ml-auto"
                        onClick={() => handleRevokeRole(role.role, role.address)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Add Role Modal */}
      {showAddRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-semibold mb-4">Assign New Role</h2>
            
            {errorMessage && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                <p>{errorMessage}</p>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input 
                  type="text" 
                  className="w-full rounded-md border border-gray-300 p-2" 
                  placeholder="0x..."
                  value={newRoleData.address}
                  onChange={(e) => setNewRoleData({...newRoleData, address: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select 
                  className="w-full rounded-md border border-gray-300 p-2"
                  value={newRoleData.role}
                  onChange={(e) => setNewRoleData({...newRoleData, role: e.target.value})}
                >
                  {availableRoles.map(role => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {availableRoles.find(r => r.id === newRoleData.role)?.description}
                </p>
              </div>
              
              {newRoleData.role === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Custom Role ID</label>
                  <input 
                    type="text" 
                    className="w-full rounded-md border border-gray-300 p-2" 
                    placeholder="0x..."
                    value={newRoleData.customRole}
                    onChange={(e) => setNewRoleData({...newRoleData, customRole: e.target.value})}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the keccak256 hash of the role name
                  </p>
                </div>
              )}
              
              <div className="flex justify-end space-x-2 pt-4">
                <button 
                  type="button"
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  onClick={() => setShowAddRoleModal(false)}
                  disabled={transactionLoading}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
                  onClick={handleGrantRole}
                  disabled={transactionLoading}
                >
                  {transactionLoading ? 'Assigning...' : 'Assign Role'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagementTab;