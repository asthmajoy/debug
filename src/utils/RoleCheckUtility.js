import { ethers } from 'ethers';
import React, { useState, useEffect } from 'react';

const RoleCheckUtility = ({ contract, account }) => {
  const [hasAnalyticsRole, setHasAnalyticsRole] = useState(false);
  const [hasAdminRole, setHasAdminRole] = useState(false);
  const [analyticsRoleConstant, setAnalyticsRoleConstant] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkRoles = async () => {
      if (!contract || !account) {
        setLoading(false);
        setError("Contract or account not connected");
        return;
      }

      try {
        // Get the ANALYTICS_ROLE constant directly from the contract
        const analyticsRole = await contract.ANALYTICS_ROLE();
        setAnalyticsRoleConstant(analyticsRole);
        
        // For comparison - compute the role hash locally
        const computedRole = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ANALYTICS_ROLE"));
        console.log("Computed ANALYTICS_ROLE:", computedRole);
        console.log("Contract ANALYTICS_ROLE:", analyticsRole);
        
        // Check if the account has the analytics role
        const hasRole = await contract.hasRole(analyticsRole, account);
        setHasAnalyticsRole(hasRole);
        
        // Check if the account has admin role
        const adminRole = await contract.ADMIN_ROLE();
        const isAdmin = await contract.hasRole(adminRole, account);
        setHasAdminRole(isAdmin);
        
        setLoading(false);
      } catch (err) {
        console.error("Error checking roles:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    checkRoles();
  }, [contract, account]);

  const grantAnalyticsRole = async () => {
    if (!contract || !account || !hasAdminRole) return;
    
    try {
      // Get accounts that can be granted the role
      const userAddress = window.prompt("Enter address to grant ANALYTICS_ROLE to:");
      if (!userAddress || !ethers.utils.isAddress(userAddress)) {
        alert("Invalid Ethereum address");
        return;
      }
      
      // Grant role - this requires admin role
      const tx = await contract.grantRole(analyticsRoleConstant, userAddress);
      await tx.wait();
      
      alert(`ANALYTICS_ROLE granted to ${userAddress}`);
    } catch (err) {
      console.error("Error granting role:", err);
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return <div className="p-4">Checking roles...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  return (
    <div className="p-4 border rounded-lg bg-white">
      <h3 className="text-lg font-bold mb-4">Role Check Utility</h3>
      
      <div className="space-y-4">
        <div>
          <p><strong>Connected Account:</strong> {account}</p>
          <p><strong>Has ANALYTICS_ROLE:</strong> {hasAnalyticsRole ? '✅ Yes' : '❌ No'}</p>
          <p><strong>Has ADMIN_ROLE:</strong> {hasAdminRole ? '✅ Yes' : '❌ No'}</p>
          <p><strong>ANALYTICS_ROLE value:</strong> <span className="font-mono text-xs break-all">{analyticsRoleConstant}</span></p>
        </div>
        
        {hasAdminRole && (
          <div>
            <button 
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              onClick={grantAnalyticsRole}
            >
              Grant ANALYTICS_ROLE to Address
            </button>
            <p className="text-sm text-gray-500 mt-2">
              As an admin, you can grant the ANALYTICS_ROLE to other addresses.
            </p>
          </div>
        )}
        
        {!hasAnalyticsRole && !hasAdminRole && (
          <div className="bg-yellow-100 p-3 rounded border border-yellow-300">
            <p className="text-yellow-800">
              Your account doesn't have the ANALYTICS_ROLE or ADMIN_ROLE. 
              You need to contact an admin to grant you the ANALYTICS_ROLE.
            </p>
          </div>
        )}
        
        <div className="bg-gray-100 p-3 rounded text-sm">
          <h4 className="font-semibold">How Roles Work</h4>
          <p>
            The smart contract uses OpenZeppelin's AccessControl to manage roles.
            The ANALYTICS_ROLE is computed as: keccak256("ANALYTICS_ROLE").
            Only accounts with this role can view analytics data.
          </p>
          <p className="mt-2">
            If you're seeing "The analytics tab is not visible even for people with the analytics role",
            the most likely issue is that the account has not actually been granted the role.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RoleCheckUtility;