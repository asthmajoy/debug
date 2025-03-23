import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from './Web3Context';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const { isConnected, account, contracts, contractsReady } = useWeb3();
  const [user, setUser] = useState({
    address: '',
    roles: ['user'],
    balance: 0,
    votingPower: 0,
    delegate: '',
    lockedTokens: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUserData() {
      if (isConnected && account && contractsReady && contracts.token && contracts.governance) {
        try {
          setLoading(true);
          
          // Get token balance
          const balance = await contracts.token.balanceOf(account);
          
          // Get current snapshot ID
          const snapshotId = await contracts.token.getCurrentSnapshotId();
          
          // Get voting power
          const votingPower = await contracts.token.getEffectiveVotingPower(account, snapshotId);
          
          // Get delegation info
          const delegate = await contracts.token.getDelegate(account);
          const lockedTokens = await contracts.token.getLockedTokens(account);
          
          // Check roles
          const roles = ['user'];
          
          // Check for admin role
          try {
            const adminRoleHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ADMIN_ROLE"));
            const isAdmin = await contracts.governance.hasRole(adminRoleHash, account);
            if (isAdmin) roles.push('admin');
          } catch (error) {
            console.error("Error checking admin role:", error);
          }
          
          // Check for analytics role
          try {
            const analyticsRoleHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ANALYTICS_ROLE"));
            const isAnalytics = await contracts.governance.hasRole(analyticsRoleHash, account);
            if (isAnalytics) roles.push('analytics');
          } catch (error) {
            console.error("Error checking analytics role:", error);
          }
          
          // Check for guardian role
          try {
            const guardianRoleHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GUARDIAN_ROLE"));
            const isGuardian = await contracts.governance.hasRole(guardianRoleHash, account);
            if (isGuardian) roles.push('guardian');
          } catch (error) {
            console.error("Error checking guardian role:", error);
          }
          
          // Check for governance role
          try {
            const governanceRoleHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
            const isGovernance = await contracts.governance.hasRole(governanceRoleHash, account);
            if (isGovernance) roles.push('governance');
          } catch (error) {
            console.error("Error checking governance role:", error);
          }
          
          // Update user state
          setUser({
            address: account,
            roles,
            balance: ethers.utils.formatEther(balance),
            votingPower: ethers.utils.formatEther(votingPower),
            delegate: delegate,
            lockedTokens: ethers.utils.formatEther(lockedTokens)
          });
          
        } catch (error) {
          console.error("Error fetching user data:", error);
        } finally {
          setLoading(false);
        }
      } else {
        // If not connected, reset user to default state
        setUser({
          address: '',
          roles: ['user'],
          balance: 0,
          votingPower: 0,
          delegate: '',
          lockedTokens: 0
        });
        setLoading(false);
      }
    }
    
    fetchUserData();
  }, [isConnected, account, contracts, contractsReady]);

  const hasRole = (role) => {
    return user.roles.includes(role);
  };

  const value = {
    user,
    loading,
    hasRole
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}