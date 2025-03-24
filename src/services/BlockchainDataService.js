// src/services/BlockchainDataService.js
import { ethers } from 'ethers';

/**
 * Service for fetching token and delegation data directly from the blockchain
 * with NO mock/placeholder data whatsoever
 */
class BlockchainDataService {
  constructor(web3Context, contracts) {
    this.web3Context = web3Context;
    this.contracts = contracts;
    this.tokenContract = contracts?.justToken;
    this.provider = web3Context?.provider;
    
    console.log('BlockchainDataService initialized with:', {
      provider: Boolean(this.provider),
      tokenContract: Boolean(this.tokenContract),
      contractKeys: Object.keys(contracts || {})
    });
    
    // Cache settings
    this.cache = {
      balances: new Map(),
      delegations: new Map(),
      votingPower: new Map(),
      proposals: new Map(),
      stats: null
    };
    this.cacheTTL = 5000; // 5 seconds cache lifetime (shorter for development)
    this.cacheTimestamps = {
      balances: new Map(),
      delegations: new Map(),
      votingPower: new Map(),
      proposals: new Map(),
      stats: 0
    };
  }

  /**
   * Initialize the service with updated context if needed
   */
  initialize(web3Context, contracts) {
    this.web3Context = web3Context || this.web3Context;
    this.contracts = contracts || this.contracts;
    this.tokenContract = this.contracts?.justToken;
    this.provider = this.web3Context?.provider;
    
    console.log('BlockchainDataService re-initialized with:', {
      provider: Boolean(this.provider),
      tokenContract: Boolean(this.tokenContract),
      contractKeys: Object.keys(this.contracts || {})
    });
    
    this.clearCache();
  }

  /**
   * Clear the entire cache or a specific cache type
   */
  clearCache(cacheType = null) {
    if (cacheType) {
      this.cache[cacheType].clear();
      if (this.cacheTimestamps[cacheType] instanceof Map) {
        this.cacheTimestamps[cacheType].clear();
      } else {
        this.cacheTimestamps[cacheType] = 0;
      }
    } else {
      this.cache.balances.clear();
      this.cache.delegations.clear();
      this.cache.votingPower.clear();
      this.cache.proposals.clear();
      this.cache.stats = null;
      
      this.cacheTimestamps.balances.clear();
      this.cacheTimestamps.delegations.clear();
      this.cacheTimestamps.votingPower.clear();
      this.cacheTimestamps.proposals.clear();
      this.cacheTimestamps.stats = 0;
    }
  }

  /**
   * Check if cached data is still valid
   */
  isCacheValid(cacheType, key = null) {
    const now = Date.now();
    if (key) {
      const timestamp = this.cacheTimestamps[cacheType].get(key);
      return timestamp && (now - timestamp < this.cacheTTL);
    } else {
      return this.cacheTimestamps[cacheType] && (now - this.cacheTimestamps[cacheType] < this.cacheTTL);
    }
  }

  /**
   * Update cache with new data
   */
  updateCache(cacheType, key, data) {
    if (key) {
      this.cache[cacheType].set(key, data);
      this.cacheTimestamps[cacheType].set(key, Date.now());
    } else {
      this.cache[cacheType] = data;
      this.cacheTimestamps[cacheType] = Date.now();
    }
  }

  /**
   * Check if contract is available and has required method
   * @param {string} contractName - Name of the contract in this.contracts object
   * @param {string} methodName - Name of the method to check
   * @returns {boolean} Whether the contract and method are available
   */
  hasContractMethod(contractName, methodName) {
    if (!this.contracts || !this.contracts[contractName]) {
      console.error(`Contract ${contractName} not available`);
      return false;
    }
    
    const contract = this.contracts[contractName];
    if (!contract[methodName] || typeof contract[methodName] !== 'function') {
      console.error(`Method ${methodName} not found on contract ${contractName}`);
      return false;
    }
    
    return true;
  }

  /**
   * Fetch token balance for an address directly from the blockchain
   */
  async getTokenBalance(address) {
    if (!address) {
      console.error("Missing address for getTokenBalance");
      return "0";
    }
    
    if (!this.hasContractMethod('justToken', 'balanceOf')) {
      console.error("Token contract balanceOf method not available");
      return "0";
    }

    try {
      // Check cache first
      if (this.isCacheValid('balances', address)) {
        return this.cache.balances.get(address);
      }

      // If not in cache or expired, fetch from blockchain
      console.log(`Fetching balance for ${address}`);
      const balance = await this.tokenContract.balanceOf(address);
      const formattedBalance = balance.toString();
      console.log(`Raw balance for ${address}:`, formattedBalance);
      
      // Update cache
      this.updateCache('balances', address, formattedBalance);
      
      return formattedBalance;
    } catch (error) {
      console.error("Error fetching token balance:", error);
      return "0";
    }
  }

  /**
   * Fetch delegation info for an address
   */
  async getDelegationInfo(address) {
    if (!address) {
      console.error("Missing address for getDelegationInfo");
      return {
        currentDelegate: null,
        lockedTokens: "0",
        delegatedToYou: "0",
        delegators: []
      };
    }

    // Check required contract methods
    const hasDelegate = this.hasContractMethod('justToken', 'getDelegate');
    const hasLockedTokens = this.hasContractMethod('justToken', 'getLockedTokens');
    const hasDelegatedToAddress = this.hasContractMethod('justToken', 'getDelegatedToAddress');
    const hasDelegatorsOf = this.hasContractMethod('justToken', 'getDelegatorsOf');
    
    if (!hasDelegate || !hasLockedTokens || !hasDelegatedToAddress || !hasDelegatorsOf) {
      console.error("Required delegation methods not available on contract");
      return {
        currentDelegate: null,
        lockedTokens: "0",
        delegatedToYou: "0",
        delegators: []
      };
    }

    try {
      // Check cache first
      if (this.isCacheValid('delegations', address)) {
        return this.cache.delegations.get(address);
      }

      // If not in cache or expired, fetch from blockchain
      console.log(`Fetching delegation info for ${address}`);
      const currentDelegate = await this.tokenContract.getDelegate(address);
      const lockedTokens = await this.tokenContract.getLockedTokens(address);
      const delegatedToYou = await this.tokenContract.getDelegatedToAddress(address);
      const delegatorAddresses = await this.tokenContract.getDelegatorsOf(address);
      
      console.log(`Delegation data for ${address}:`, {
        currentDelegate,
        lockedTokens: lockedTokens.toString(),
        delegatedToYou: delegatedToYou.toString(),
        delegatorCount: delegatorAddresses.length
      });
      
      // Get balance for each delegator
      const delegators = await Promise.all(
        delegatorAddresses.map(async (delegatorAddr) => {
          const balance = await this.getTokenBalance(delegatorAddr);
          return {
            address: delegatorAddr,
            balance
          };
        })
      );

      const delegationInfo = {
        currentDelegate,
        lockedTokens: lockedTokens.toString(),
        delegatedToYou: delegatedToYou.toString(),
        delegators
      };
      
      // Update cache
      this.updateCache('delegations', address, delegationInfo);
      
      return delegationInfo;
    } catch (error) {
      console.error("Error fetching delegation info:", error);
      return {
        currentDelegate: null,
        lockedTokens: "0",
        delegatedToYou: "0",
        delegators: []
      };
    }
  }

  /**
   * Calculate voting power for an address
   */
  async getVotingPower(address) {
    if (!address) {
      console.error("Missing address for getVotingPower");
      return "0";
    }

    if (!this.hasContractMethod('justToken', 'balanceOf') || 
        !this.hasContractMethod('justToken', 'getDelegate') ||
        !this.hasContractMethod('justToken', 'getDelegatedToAddress')) {
      console.error("Required voting power methods not available on contract");
      return "0";
    }

    try {
      // Check cache first
      if (this.isCacheValid('votingPower', address)) {
        return this.cache.votingPower.get(address);
      }

      console.log(`Calculating voting power for ${address}`);
      
      // Get the balance and delegation info
      const balance = await this.getTokenBalance(address);
      const delegationInfo = await this.getDelegationInfo(address);
      
      // If self-delegated, add delegated tokens to voting power
      // Otherwise, voting power is 0 (delegated away)
      let votingPower = "0";
      
      if (delegationInfo.currentDelegate === address || 
          delegationInfo.currentDelegate === ethers.constants.AddressZero ||
          delegationInfo.currentDelegate === null) {
        // Self-delegated - voting power is own balance + delegated to you
        const ownBalance = ethers.BigNumber.from(balance);
        const delegated = ethers.BigNumber.from(delegationInfo.delegatedToYou || "0");
        votingPower = ownBalance.add(delegated).toString();
        console.log(`Voting power components for ${address}:`, {
          ownBalance: ownBalance.toString(),
          delegated: delegated.toString(),
          total: votingPower
        });
      } else {
        console.log(`User ${address} has delegated to ${delegationInfo.currentDelegate}, voting power is 0`);
      }
      
      // Update cache
      this.updateCache('votingPower', address, votingPower);
      
      return votingPower;
    } catch (error) {
      console.error("Error calculating voting power:", error);
      return "0";
    }
  }

  /**
   * Fetch proposal vote totals from the blockchain
   */
  async getProposalVoteTotals(proposalId) {
    if (!proposalId) {
      console.error("Missing proposal ID for getProposalVoteTotals");
      return {
        yesVotes: "0",
        noVotes: "0",
        abstainVotes: "0",
        totalVoters: 0,
        yesPercentage: 0,
        noPercentage: 0,
        abstainPercentage: 0
      };
    }
    
    // Check required methods
    const hasYesVotes = this.hasContractMethod('governance', 'getYesVotesForProposal');
    const hasNoVotes = this.hasContractMethod('governance', 'getNoVotesForProposal');
    const hasAbstainVotes = this.hasContractMethod('governance', 'getAbstainVotesForProposal');
    const hasVoters = this.hasContractMethod('governance', 'getVotersForProposal');
    
    if (!hasYesVotes || !hasNoVotes || !hasAbstainVotes || !hasVoters) {
      console.error("Required proposal vote methods not available on governance contract");
      return {
        yesVotes: "0",
        noVotes: "0",
        abstainVotes: "0",
        totalVoters: 0,
        yesPercentage: 0,
        noPercentage: 0,
        abstainPercentage: 0
      };
    }

    try {
      // Check cache first
      const cacheKey = `votes-${proposalId}`;
      if (this.isCacheValid('proposals', cacheKey)) {
        return this.cache.proposals.get(cacheKey);
      }

      // If not in cache or expired, fetch from blockchain
      console.log(`Fetching vote totals for proposal ${proposalId}`);
      const yesVotes = await this.contracts.governance.getYesVotesForProposal(proposalId);
      const noVotes = await this.contracts.governance.getNoVotesForProposal(proposalId);
      const abstainVotes = await this.contracts.governance.getAbstainVotesForProposal(proposalId);
      const voterAddresses = await this.contracts.governance.getVotersForProposal(proposalId);
      
      // Calculate percentages
      const totalVotes = yesVotes.add(noVotes).add(abstainVotes);
      const yesPercentage = totalVotes.gt(0) ? yesVotes.mul(100).div(totalVotes).toNumber() : 0;
      const noPercentage = totalVotes.gt(0) ? noVotes.mul(100).div(totalVotes).toNumber() : 0;
      const abstainPercentage = totalVotes.gt(0) ? abstainVotes.mul(100).div(totalVotes).toNumber() : 0;
      
      const voteTotals = {
        yesVotes: yesVotes.toString(),
        noVotes: noVotes.toString(),
        abstainVotes: abstainVotes.toString(),
        totalVoters: voterAddresses.length,
        yesPercentage,
        noPercentage,
        abstainPercentage
      };
      
      console.log(`Vote totals for proposal ${proposalId}:`, voteTotals);
      
      // Update cache
      this.updateCache('proposals', cacheKey, voteTotals);
      
      return voteTotals;
    } catch (error) {
      console.error(`Error fetching vote totals for proposal ${proposalId}:`, error);
      return {
        yesVotes: "0",
        noVotes: "0",
        abstainVotes: "0",
        totalVoters: 0,
        yesPercentage: 0,
        noPercentage: 0,
        abstainPercentage: 0
      };
    }
  }

  /**
   * Get DAO statistics from blockchain
   */
  async getDAOStats() {
    // Check required methods
    const hasTotalSupply = this.hasContractMethod('justToken', 'totalSupply');
    const hasActiveProposalCount = this.hasContractMethod('governance', 'getActiveProposalCount');
    const hasTotalProposalCount = this.hasContractMethod('governance', 'getProposalCount');
    const hasCurrentSnapshotId = this.hasContractMethod('justToken', 'getCurrentSnapshotId');
    
    if (!hasTotalSupply || !hasActiveProposalCount || !hasTotalProposalCount || !hasCurrentSnapshotId) {
      console.error("Required DAO stats methods not available on contracts");
      return {
        totalHolders: 0,
        circulatingSupply: "0",
        activeProposals: 0,
        totalProposals: 0,
        participationRate: 0,
        delegationRate: 0,
        proposalSuccessRate: 0,
        formattedParticipationRate: "0.0%",
        formattedDelegationRate: "0.0%",
        formattedSuccessRate: "0.0%",
        isLoading: false
      };
    }

    try {
      // Check cache first
      if (this.isCacheValid('stats')) {
        return this.cache.stats;
      }

      console.log("Fetching DAO stats from blockchain");
      
      try {
        // Check if registry contract is available
        const hasRegistry = this.hasContractMethod('registry', 'getTotalHolders');
        
        // If not in cache or expired, fetch from blockchain
        const [
          totalSupply,
          holderCount,
          activeProposalCount,
          totalProposalCount,
          lastSnapshotId
        ] = await Promise.all([
          this.tokenContract.totalSupply(),
          hasRegistry ? this.contracts.registry.getTotalHolders() : Promise.resolve(ethers.BigNumber.from(0)),
          this.contracts.governance.getActiveProposalCount(),
          this.contracts.governance.getProposalCount(),
          this.tokenContract.getCurrentSnapshotId()
        ]);
  
        console.log("Basic DAO stats fetched:", {
          totalSupply: totalSupply.toString(),
          holderCount: holderCount.toString(),
          activeProposalCount: activeProposalCount.toString(),
          totalProposalCount: totalProposalCount.toString(),
          lastSnapshotId: lastSnapshotId.toString()
        });
  
        // Get snapshot metrics if available
        let participationRate = 0;
        let delegationRate = 0;
        let proposalSuccessRate = 0;
  
        if (lastSnapshotId && lastSnapshotId.gt(0)) {
          const hasSnapshotMetrics = this.hasContractMethod('justToken', 'getSnapshotMetrics');
          const hasVotingStats = this.hasContractMethod('governance', 'getVotingStatistics');
          
          if (hasSnapshotMetrics) {
            try {
              const [
                ,
                ,
                ,
                totalDelegatedTokens,
                percentageDelegated,
                ,
              ] = await this.tokenContract.getSnapshotMetrics(lastSnapshotId);
              
              delegationRate = percentageDelegated.toNumber() / 10000; // Convert from basis points
            } catch (error) {
              console.error("Error fetching snapshot metrics:", error);
            }
          }
          
          if (hasVotingStats) {
            try {
              // Get participation from governance
              const votingData = await this.contracts.governance.getVotingStatistics();
              participationRate = votingData.participationRate / 10000; // Convert from basis points
              proposalSuccessRate = votingData.proposalSuccessRate / 10000; // Convert from basis points
            } catch (error) {
              console.error("Error fetching voting statistics:", error);
            }
          }
        }
  
        const stats = {
          totalHolders: holderCount ? holderCount.toNumber() : 0,
          circulatingSupply: ethers.utils.formatEther(totalSupply),
          activeProposals: activeProposalCount ? activeProposalCount.toNumber() : 0,
          totalProposals: totalProposalCount ? totalProposalCount.toNumber() : 0,
          participationRate,
          delegationRate,
          proposalSuccessRate,
          formattedParticipationRate: `${(participationRate * 100).toFixed(1)}%`,
          formattedDelegationRate: `${(delegationRate * 100).toFixed(1)}%`,
          formattedSuccessRate: `${(proposalSuccessRate * 100).toFixed(1)}%`,
          isLoading: false
        };
        
        // Update cache
        this.updateCache('stats', null, stats);
        
        return stats;
      } catch (innerError) {
        console.error("Error in specific DAO stats fetching:", innerError);
        throw innerError; // Re-throw to be caught by outer try/catch
      }
    } catch (error) {
      console.error("Error fetching DAO stats:", error);
      return {
        totalHolders: 0,
        circulatingSupply: "0",
        activeProposals: 0,
        totalProposals: 0,
        participationRate: 0,
        delegationRate: 0,
        proposalSuccessRate: 0,
        formattedParticipationRate: "0.0%",
        formattedDelegationRate: "0.0%",
        formattedSuccessRate: "0.0%",
        isLoading: false
      };
    }
  }
}

// Create singleton instance
let instance = null;

export const getBlockchainDataService = (web3Context, contracts) => {
  if (!instance) {
    instance = new BlockchainDataService(web3Context, contracts);
  } else if (web3Context || contracts) {
    // Update the instance with new context if provided
    instance.initialize(web3Context, contracts);
  }
  return instance;
};

export default BlockchainDataService;