import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../contexts/Web3Context';
import { PROPOSAL_STATES, PROPOSAL_TYPES } from '../utils/constants';

export function useProposals() {
  const { contracts, account, isConnected, contractsReady, refreshCounter } = useWeb3();
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tokenHolders, setTokenHolders] = useState([]);
  const [govParamsFetched, setGovParamsFetched] = useState(false);
  const [createProposalStatus, setCreateProposalStatus] = useState({
    isSubmitting: false,
    error: null,
    success: false
  });

  // Helper function to check vote details
  const getVoteDetails = useCallback(async (proposalId, voter) => {
    try {
      // Check if the user has voting power allocated to this proposal
      const votingPower = await contracts.governance.proposalVoterInfo(proposalId, voter);
      
      if (votingPower.isZero()) {
        return { hasVoted: false, voteType: null, votingPower: "0" };
      }
      
      // Try to determine how they voted using events or direct query if available
      let voteType = null;
      
      try {
        // Try querying VoteCast events for this proposal and voter
        const filter = contracts.governance.filters.VoteCast(proposalId, voter);
        const events = await contracts.governance.queryFilter(filter);
        
        if (events.length > 0) {
          // Use the most recent vote event
          const latestEvent = events[events.length - 1];
          voteType = latestEvent.args.support;
        }
      } catch (err) {
        console.warn("Couldn't determine vote type from events:", err);
      }
      
      return {
        hasVoted: true,
        voteType: voteType !== null ? Number(voteType) : null,
        votingPower: ethers.utils.formatEther(votingPower)
      };
    } catch (err) {
      console.error("Error getting vote details:", err);
      return { hasVoted: false, voteType: null, votingPower: "0" };
    }
  }, [contracts]);

  // Helper function to extract title and description
  const extractTitleAndDescription = useCallback((rawDescription) => {
    if (!rawDescription) return { title: "Untitled Proposal", description: "No description available" };
    
    // Split by newline to get title and description
    const parts = rawDescription.split('\n');
    let title = parts[0].trim();
    
    // If title is too long, use the first part of it
    if (title.length > 80) {
      title = title.substring(0, 77) + "...";
    }
    
    // Get the full description
    const description = rawDescription.trim();
    
    return { title, description };
  }, []);

  // Helper function to get human-readable proposal state label
  const getProposalStateLabel = useCallback((state) => {
    const stateLabels = {
      [PROPOSAL_STATES.ACTIVE]: "Active",
      [PROPOSAL_STATES.CANCELED]: "Canceled",
      [PROPOSAL_STATES.DEFEATED]: "Defeated",
      [PROPOSAL_STATES.SUCCEEDED]: "Succeeded",
      [PROPOSAL_STATES.QUEUED]: "Queued",
      [PROPOSAL_STATES.EXECUTED]: "Executed",
      [PROPOSAL_STATES.EXPIRED]: "Expired"
    };
    
    return stateLabels[state] || "Unknown";
  }, []);

  // Helper function to get human-readable proposal type label
  const getProposalTypeLabel = useCallback((type) => {
    const typeLabels = {
      [PROPOSAL_TYPES.GENERAL]: "General",
      [PROPOSAL_TYPES.WITHDRAWAL]: "Withdrawal",
      [PROPOSAL_TYPES.TOKEN_TRANSFER]: "Token Transfer",
      [PROPOSAL_TYPES.GOVERNANCE_CHANGE]: "Governance Change",
      [PROPOSAL_TYPES.EXTERNAL_ERC20_TRANSFER]: "External ERC20 Transfer",
      [PROPOSAL_TYPES.TOKEN_MINT]: "Token Mint",
      [PROPOSAL_TYPES.TOKEN_BURN]: "Token Burn"
    };
    
    return typeLabels[type] || "Unknown";
  }, []);

  // Enhanced function to get proposal details including transaction data
  const getProposalDetailsFromEvents = useCallback(async (proposalId) => {
    try {
      // First check if the proposal exists by getting its state
      const proposalState = await contracts.governance.getProposalState(proposalId);
      
      // Look for the transaction that created this proposal
      // This will give us access to the input data which contains all proposal details
      const provider = contracts.governance.provider;
      
      // Create a filter for ProposalEvent events related to this proposal
      const filter = contracts.governance.filters.ProposalEvent(proposalId, 0); // Type 0 is creation event
      const events = await contracts.governance.queryFilter(filter);
      
      if (events.length === 0) {
        // If no events found, create a minimal proposal object
        return {
          id: proposalId,
          title: `Proposal #${proposalId}`,
          description: "No description available",
          state: proposalState,
          stateLabel: getProposalStateLabel(proposalState),
          type: PROPOSAL_TYPES.GENERAL,
          typeLabel: getProposalTypeLabel(PROPOSAL_TYPES.GENERAL),
          yesVotes: "0",
          noVotes: "0",
          abstainVotes: "0",
          hasVoted: false,
          snapshotId: 0,
          target: ethers.constants.AddressZero,
          callData: "0x",
          proposer: ethers.constants.AddressZero,
          createdAt: new Date(),
          deadline: new Date(Date.now() + 3*24*60*60*1000) // Default 3 day deadline
        };
      }
      
      // Get the creation event
      const creationEvent = events[0];
      
      // Get the transaction that created the proposal
      const txHash = creationEvent.transactionHash;
      const tx = await provider.getTransaction(txHash);
      const txReceipt = await provider.getTransactionReceipt(txHash);
      
      // Get timestamp for the block
      const block = await provider.getBlock(txReceipt.blockNumber);
      const createdAt = new Date(block.timestamp * 1000);
      
      // Parse the input data to get proposal details
      // The createProposal function signature looks like:
      // createProposal(string calldata description, ProposalType proposalType, address target, bytes calldata callData, 
      //                uint256 amount, address payable recipient, address externalToken, uint256 newThreshold, 
      //                uint256 newQuorum, uint256 newVotingDuration, uint256 newTimelockDelay)
      
      let proposalDescription = "No description available";
      let proposalType = PROPOSAL_TYPES.GENERAL;
      let target = ethers.constants.AddressZero;
      let callData = "0x";
      let amount = "0";
      let recipient = ethers.constants.AddressZero;
      let externalToken = ethers.constants.AddressZero;
      
      try {
        // Create the interface for decoding
        const iface = new ethers.utils.Interface([
          "function createProposal(string description, uint8 proposalType, address target, bytes callData, uint256 amount, address recipient, address externalToken, uint256 newThreshold, uint256 newQuorum, uint256 newVotingDuration, uint256 newTimelockDelay) returns (uint256)"
        ]);
        
        // Decode the input data
        const decodedData = iface.parseTransaction({ data: tx.data });
        
        if (decodedData && decodedData.args) {
          proposalDescription = decodedData.args[0] || proposalDescription;
          proposalType = decodedData.args[1] !== undefined ? Number(decodedData.args[1]) : proposalType;
          target = decodedData.args[2] || target;
          callData = decodedData.args[3] || callData;
          amount = decodedData.args[4] ? ethers.utils.formatEther(decodedData.args[4]) : amount;
          recipient = decodedData.args[5] || recipient;
          externalToken = decodedData.args[6] || externalToken;
        }
      } catch (decodeErr) {
        console.warn("Couldn't decode transaction data:", decodeErr);
      }
      
      // Get more data from the creation event
      const proposer = creationEvent.args.actor;
      let snapshotId = 0;
      
      // Try to decode the data field which contains type and snapshotId
      try {
        const data = creationEvent.args.data;
        const decoded = ethers.utils.defaultAbiCoder.decode(['uint8', 'uint256'], data);
        proposalType = Number(decoded[0]);
        snapshotId = decoded[1].toNumber();
      } catch (err) {
        console.warn("Couldn't decode event data:", err);
      }
      
      // Try to get vote counts (this is challenging without direct access)
      let yesVotes = "0";
      let noVotes = "0";
      let abstainVotes = "0";
      
      // Look for vote events (event type 6)
      const voteFilter = contracts.governance.filters.ProposalEvent(proposalId, 6); // Type 6 is vote event
      const voteEvents = await contracts.governance.queryFilter(voteFilter);
      
      // Aggregate votes from events
      for (const event of voteEvents) {
        try {
          const data = event.args.data;
          const decoded = ethers.utils.defaultAbiCoder.decode(['uint8', 'uint256'], data);
          const voteType = decoded[0].toNumber();
          const votePower = ethers.utils.formatEther(decoded[1]);
          
          if (voteType === 1) { // FOR
            yesVotes = (parseFloat(yesVotes) + parseFloat(votePower)).toString();
          } else if (voteType === 0) { // AGAINST
            noVotes = (parseFloat(noVotes) + parseFloat(votePower)).toString();
          } else if (voteType === 2) { // ABSTAIN
            abstainVotes = (parseFloat(abstainVotes) + parseFloat(votePower)).toString();
          }
        } catch (err) {
          console.warn("Couldn't decode vote event:", err);
        }
      }
      
      // Calculate deadline based on voting duration (from governance parameters)
      let deadline = new Date(createdAt);
      try {
        const govParams = await contracts.governance.govParams();
        deadline = new Date(createdAt.getTime() + (govParams.votingDuration.toNumber() * 1000));
      } catch (err) {
        console.warn("Couldn't get voting duration:", err);
        // Default to 3 days if we can't get the actual duration
        deadline = new Date(createdAt.getTime() + (3 * 24 * 60 * 60 * 1000));
      }
      
      // Check if the user has voted on this proposal
      let hasVoted = false;
      let votedYes = false;
      let votedNo = false;
      let votedAbstain = false;
      
      if (account) {
        try {
          const voteDetails = await getVoteDetails(proposalId, account);
          hasVoted = voteDetails.hasVoted;
          votedYes = voteDetails.voteType === 1;  // FOR
          votedNo = voteDetails.voteType === 0;   // AGAINST
          votedAbstain = voteDetails.voteType === 2; // ABSTAIN
        } catch (err) {
          console.warn(`Error checking vote status for proposal ${proposalId}:`, err);
        }
      }
      
      // Extract title and description
      const { title, description } = extractTitleAndDescription(proposalDescription);
      
      // Check for timelock transaction hash in queued event
      let timelockTxHash = ethers.constants.HashZero;
      const queuedFilter = contracts.governance.filters.ProposalEvent(proposalId, 2); // Type 2 is queued event
      const queuedEvents = await contracts.governance.queryFilter(queuedFilter);
      
      if (queuedEvents.length > 0) {
        try {
          const data = queuedEvents[0].args.data;
          const decoded = ethers.utils.defaultAbiCoder.decode(['bytes32'], data);
          timelockTxHash = decoded[0];
        } catch (err) {
          console.warn("Couldn't decode queued event:", err);
        }
      }
      
      return {
        id: proposalId,
        title: title || `Proposal #${proposalId}`,
        description: description || "No description available",
        proposer,
        deadline,
        createdAt,
        state: proposalState,
        stateLabel: getProposalStateLabel(proposalState),
        type: proposalType,
        typeLabel: getProposalTypeLabel(proposalType),
        yesVotes,
        noVotes,
        abstainVotes,
        timelockTxHash,
        hasVoted,
        votedYes,
        votedNo,
        votedAbstain,
        snapshotId,
        target,
        callData,
        recipient,
        amount,
        token: externalToken
      };
    } catch (err) {
      console.warn(`Error loading proposal ${proposalId}:`, err);
      return null;
    }
  }, [contracts, account, getProposalStateLabel, getProposalTypeLabel, getVoteDetails, extractTitleAndDescription]);

  // Fetch governance parameters first
  const fetchGovParams = useCallback(async () => {
    if (!isConnected || !contractsReady || !contracts.governance) {
      return;
    }
    
    try {
      console.log("Fetching governance parameters...");
      const params = await contracts.governance.govParams();
      
      // Log the governance parameters for debugging
      console.log("Governance parameters:", {
        votingDuration: params.votingDuration.toString(),
        quorum: ethers.utils.formatEther(params.quorum),
        timelockDelay: params.timelockDelay.toString(),
        proposalCreationThreshold: ethers.utils.formatEther(params.proposalCreationThreshold),
        proposalStake: ethers.utils.formatEther(params.proposalStake),
        defeatedRefundPercentage: params.defeatedRefundPercentage.toString(),
        canceledRefundPercentage: params.canceledRefundPercentage.toString(),
        expiredRefundPercentage: params.expiredRefundPercentage.toString()
      });
      
      setGovParamsFetched(true);
    } catch (error) {
      console.error("Error fetching governance parameters:", error);
    }
  }, [contracts, isConnected, contractsReady]);

  // Fetch proposals using enhanced approach
  const fetchProposals = useCallback(async () => {
    if (!isConnected || !contractsReady || !contracts.governance) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Ensure we've fetched governance parameters first
      if (!govParamsFetched) {
        await fetchGovParams();
      }
      
      console.log("Fetching proposals from governance contract...");
      
      // Find the upper limit of proposal IDs more efficiently
      let maxId = -1;
      try {
        // Try a binary search approach to find the highest valid proposal ID
        let low = 0;
        let high = 100; // Start with a reasonable upper bound
        
        // First, find an upper bound that's definitely too high
        let foundTooHigh = false;
        while (!foundTooHigh) {
          try {
            await contracts.governance.getProposalState(high);
            // If this succeeds, our high is still valid, double it
            low = high;
            high = high * 2;
            if (high > 10000) {
              // Set a reasonable maximum to prevent infinite loops
              foundTooHigh = true;
            }
          } catch (err) {
            // Found a proposal ID that doesn't exist
            foundTooHigh = true;
          }
        }
        
        // Now do binary search between known low and high
        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          
          try {
            await contracts.governance.getProposalState(mid);
            // If we can get the state, this ID exists
            low = mid + 1;
          } catch (err) {
            // If we can't get the state, this ID doesn't exist
            high = mid - 1;
          }
        }
        
        maxId = high; // The highest valid proposal ID
        console.log("Highest valid proposal ID:", maxId);
      } catch (err) {
        console.error("Error finding max proposal ID:", err);
        maxId = -1; // Reset if something went wrong
      }
      
      // If we didn't find any proposals, try a linear search for a small range
      if (maxId === -1) {
        for (let i = 0; i < 20; i++) {
          try {
            await contracts.governance.getProposalState(i);
            maxId = i;
          } catch (err) {
            // Skip if proposal doesn't exist
          }
        }
      }
      
      if (maxId === -1) {
        console.log("No proposals found");
        setProposals([]);
        setLoading(false);
        return;
      }
      
      // Fetch all proposals up to maxId with detailed information
      const proposalData = [];
      const uniqueProposers = new Set();
      
      // Load proposals in batches to avoid overloading the provider
      const batchSize = 5;
      for (let batch = 0; batch <= Math.ceil(maxId / batchSize); batch++) {
        const batchPromises = [];
        const startIdx = batch * batchSize;
        const endIdx = Math.min(startIdx + batchSize, maxId + 1);
        
        for (let i = startIdx; i < endIdx; i++) {
          batchPromises.push(getProposalDetailsFromEvents(i));
        }
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            proposalData.push(result.value);
            if (result.value.proposer !== ethers.constants.AddressZero) {
              uniqueProposers.add(result.value.proposer);
            }
          }
        });
        
        // Short delay between batches to avoid rate limiting
        if (batch < Math.ceil(maxId / batchSize)) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log("Found", proposalData.length, "proposals");
      setProposals(proposalData.sort((a, b) => b.id - a.id)); // Sort by most recent first
      
      // Update token holders count
      setTokenHolders(uniqueProposers.size);
      
    } catch (err) {
      console.error("Error fetching proposals:", err);
      setError("Failed to fetch proposals: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [contracts, isConnected, contractsReady, getProposalDetailsFromEvents, govParamsFetched, fetchGovParams]);

  // Ensure governance parameters are properly formatted before validating
  const createProposal = async (
    description, 
    type, 
    target, 
    callData, 
    amount, 
    recipient, 
    token, 
    newThreshold, 
    newQuorum, 
    newVotingDuration, 
    newTimelockDelay
  ) => {
    if (!isConnected || !contractsReady) throw new Error("Not connected");
    if (!contracts.governance) throw new Error("Governance contract not initialized");
    
    console.log("Creating proposal with params:", {
      description,
      type,
      target,
      callData: callData ? `${callData.substring(0, 10)}...` : "0x", // Log only part of callData for readability
      amount: amount.toString(),
      recipient,
      token,
      newThreshold: newThreshold.toString(),
      newQuorum: newQuorum.toString(),
      newVotingDuration,
      newTimelockDelay
    });
    
    try {
      setLoading(true);
      setError(null);
      setCreateProposalStatus({
        isSubmitting: true,
        error: null,
        success: false
      });
      
      // Additional validation - ensure all string values have proper length
      if (!description || description.trim().length < 3) {
        throw new Error("Description must be at least 3 characters long");
      }
      
      // Type-specific validation
      switch (parseInt(type)) {
        case PROPOSAL_TYPES.GENERAL:
          if (!target || !ethers.utils.isAddress(target)) 
            throw new Error("Invalid target address");
          if (!callData || callData === "0x" || callData.length < 10) 
            throw new Error("Invalid call data - must be a valid function call");
          break;
          
        case PROPOSAL_TYPES.WITHDRAWAL:
        case PROPOSAL_TYPES.TOKEN_TRANSFER:
        case PROPOSAL_TYPES.TOKEN_MINT:
        case PROPOSAL_TYPES.TOKEN_BURN:
          if (!recipient || !ethers.utils.isAddress(recipient)) 
            throw new Error("Invalid recipient address");
          if (!amount || amount.isZero()) 
            throw new Error("Amount must be greater than 0");
          break;
          
        case PROPOSAL_TYPES.EXTERNAL_ERC20_TRANSFER:
          if (!recipient || !ethers.utils.isAddress(recipient)) 
            throw new Error("Invalid recipient address");
          if (!token || !ethers.utils.isAddress(token)) 
            throw new Error("Invalid token address");
          if (!amount || amount.isZero()) 
            throw new Error("Amount must be greater than 0");
          break;
          
        case PROPOSAL_TYPES.GOVERNANCE_CHANGE:
          let hasChange = false;
          if (newThreshold && !newThreshold.isZero()) hasChange = true;
          if (newQuorum && !newQuorum.isZero()) hasChange = true;
          if (newVotingDuration && newVotingDuration > 0) hasChange = true;
          if (newTimelockDelay && newTimelockDelay > 0) hasChange = true;
          
          if (!hasChange) throw new Error("At least one governance parameter must be changed");
          break;
          
        default:
          throw new Error("Invalid proposal type");
      }
      
      // Get user's token balance
      const userBalance = await contracts.token.balanceOf(account);
      
      // Use the verified threshold directly
      const correctThreshold = ethers.utils.parseEther("0.1");  // 0.1 JUST tokens
      
      console.log("User balance check:", {
        userBalance: ethers.utils.formatEther(userBalance),
        threshold: "0.1" // Corrected value
      });
      
      // Check balance
      if (userBalance.lt(correctThreshold)) {
        throw new Error(`Insufficient balance to create proposal. You need at least 0.1 JUST tokens.`);
      }
      
      // Check if proposal stake allowance is needed
      // The contract may require the tokens to be approved before they can be staked
      try {
        // Check if the governance contract has allowance to spend tokens
        const allowance = await contracts.token.allowance(account, contracts.governance.address);
        const stakeAmount = ethers.utils.parseEther("0.01"); // 0.01 JUST tokens for stake
        
        console.log("Token allowance check:", {
          currentAllowance: ethers.utils.formatEther(allowance),
          requiredStake: "0.01"
        });
        
        // If allowance is too low, request approval
        if (allowance.lt(stakeAmount)) {
          console.log("Requesting token approval...");
          
          // Request a reasonable approval amount (more than just the stake to avoid frequent approvals)
          const approvalAmount = ethers.utils.parseEther("1.0"); // 1 JUST token (covers multiple proposals)
          
          const approveTx = await contracts.token.approve(contracts.governance.address, approvalAmount);
          await approveTx.wait();
          
          console.log("Token approval confirmed");
        }
      } catch (approvalError) {
        console.error("Error during token approval check:", approvalError);
        // Continue anyway - the contract might not require approval
      }
      
      // Clean parameters to ensure proper encoding
      const cleanParams = {
        description: description.trim(),
        type: parseInt(type),
        target: target || ethers.constants.AddressZero,
        callData: callData || "0x",
        amount: amount || ethers.constants.Zero,
        recipient: recipient || ethers.constants.AddressZero,
        token: token || ethers.constants.AddressZero,
        newThreshold: newThreshold || ethers.constants.Zero,
        newQuorum: newQuorum || ethers.constants.Zero,
        newVotingDuration: newVotingDuration || 0,
        newTimelockDelay: newTimelockDelay || 0
      };
      
      console.log("Sending transaction with clean parameters:", cleanParams);
      
      // Try to estimate gas with a safety margin
      let gasEstimate;
      try {
        console.log("Estimating gas for proposal creation...");
        gasEstimate = await contracts.governance.estimateGas.createProposal(
          cleanParams.description,
          cleanParams.type,
          cleanParams.target,
          cleanParams.callData,
          cleanParams.amount,
          cleanParams.recipient,
          cleanParams.token,
          cleanParams.newThreshold,
          cleanParams.newQuorum,
          cleanParams.newVotingDuration,
          cleanParams.newTimelockDelay
        );
        
        // Add a 50% safety margin to account for blockchain conditions
        gasEstimate = gasEstimate.mul(150).div(100);
        console.log("Estimated gas with safety margin:", gasEstimate.toString());
      } catch (gasError) {
        console.error("Gas estimation failed:", gasError);
        
        // Try to extract error message from revert reason
        const revertReason = extractRevertReason(gasError);
        if (revertReason) {
          throw new Error(`Contract revert reason: ${revertReason}`);
        }
        
        // If gas estimation fails, use a high default value
        gasEstimate = ethers.BigNumber.from(3000000); // 3 million gas should be sufficient for most proposals
        console.log("Using default gas limit:", gasEstimate.toString());
      }
      
      // Set a maximum gas limit to prevent excessive costs
      const maxGasLimit = ethers.BigNumber.from(5000000); // 5 million gas
      const finalGasLimit = gasEstimate.gt(maxGasLimit) ? maxGasLimit : gasEstimate;
      
      console.log("Final gas limit for transaction:", finalGasLimit.toString());
      
      // Create the proposal with the estimated gas limit
      const tx = await contracts.governance.createProposal(
        cleanParams.description,
        cleanParams.type,
        cleanParams.target,
        cleanParams.callData,
        cleanParams.amount,
        cleanParams.recipient,
        cleanParams.token,
        cleanParams.newThreshold,
        cleanParams.newQuorum,
        cleanParams.newVotingDuration,
        cleanParams.newTimelockDelay,
        {
          gasLimit: finalGasLimit
        }
      );
      
      console.log("Proposal creation transaction sent:", tx.hash);
      
      const receipt = await tx.wait();
      console.log("Proposal creation confirmed:", receipt);
      
      setCreateProposalStatus({
        isSubmitting: false,
        error: null,
        success: true
      });
      
      // Refresh proposals list
      await fetchProposals();
      
      return true;
    } catch (err) {
      console.error("Error creating proposal:", err);
      
      // Try to extract revert reason from error
      const revertReason = extractRevertReason(err);
      
      // Provide better error messages for common issues
      let errorMessage = "Failed to create proposal";
      
      if (revertReason) {
        errorMessage = `Contract error: ${revertReason}`;
      } else if (err.code === 'UNPREDICTABLE_GAS_LIMIT') {
        errorMessage = "Gas estimation failed. Your proposal may be too complex or there may be an issue with the contract.";
      } else if (err.code === 'INSUFFICIENT_FUNDS') {
        errorMessage = "You don't have enough ETH to pay for this transaction. Please add funds to your wallet.";
      } else if (err.message.includes("gas required exceeds allowance")) {
        errorMessage = "Transaction requires too much gas. Try simplifying your proposal or increasing your gas limit.";
      } else if (err.message.includes("user rejected transaction")) {
        errorMessage = "Transaction rejected by user.";
      } else {
        errorMessage = `Failed to create proposal: ${err.message}`;
      }
      
      setError(errorMessage);
      setCreateProposalStatus({
        isSubmitting: false,
        error: errorMessage,
        success: false
      });
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to try to extract revert reason from errors
  function extractRevertReason(error) {
    if (!error) return null;
    
    if (error.reason) {
      return error.reason;
    }
    
    // Try to extract from data or message
    const errorString = error.toString();
    
    // Try to find common error patterns
    if (errorString.includes("InsufficientBalance")) {
      return "Insufficient token balance";
    }
    if (errorString.includes("NotAuthorized")) {
      return "Not authorized to perform this action";
    }
    if (errorString.includes("InvalidAmount")) {
      return "Invalid amount specified";
    }
    if (errorString.includes("ZeroAddress")) {
      return "Zero address not allowed";
    }
    if (errorString.includes("NoValidChange")) {
      return "No valid governance change specified";
    }
    
    // Look for error data in the error object
    if (error.data) {
      return `Contract error: ${error.data}`;
    }
    
    // Try to find a reason string in the error message
    const reasonMatch = errorString.match(/reason="([^"]+)"/);
    if (reasonMatch && reasonMatch[1]) {
      return reasonMatch[1];
    }
    
    return null;
  }

  const cancelProposal = async (proposalId) => {
    if (!isConnected || !contractsReady) throw new Error("Not connected");
    if (!contracts.governance) throw new Error("Governance contract not initialized");
    
    try {
      setLoading(true);
      setError(null);
      
      // Verify the proposal exists
      try {
        await contracts.governance.getProposalState(proposalId);
      } catch (err) {
        throw new Error(`Proposal ${proposalId} not found`);
      }
      
      const tx = await contracts.governance.cancelProposal(proposalId, {
        gasLimit: 300000 // Higher gas limit for safety
      });
      
      await tx.wait();
      console.log(`Proposal ${proposalId} cancelled successfully`);
      
      // Refresh proposals list
      await fetchProposals();
      
      return true;
    } catch (err) {
      console.error("Error canceling proposal:", err);
      setError("Failed to cancel proposal: " + err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const queueProposal = async (proposalId) => {
    if (!isConnected || !contractsReady) throw new Error("Not connected");
    if (!contracts.governance) throw new Error("Governance contract not initialized");
    
    try {
      setLoading(true);
      setError(null);
      
      // Verify proposal state before queueing
      const state = await contracts.governance.getProposalState(proposalId);
      if (state !== PROPOSAL_STATES.SUCCEEDED) {
        throw new Error("Only succeeded proposals can be queued");
      }
      
      const tx = await contracts.governance.queueProposal(proposalId, {
        gasLimit: 500000 // Higher gas limit for queueing due to complexity
      });
      
      await tx.wait();
      console.log(`Proposal ${proposalId} queued successfully`);
      
      // Refresh proposals list
      await fetchProposals();
      
      return true;
    } catch (err) {
      console.error("Error queuing proposal:", err);
      setError("Failed to queue proposal: " + err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const executeProposal = async (proposalId) => {
    if (!isConnected || !contractsReady) throw new Error("Not connected");
    if (!contracts.governance) throw new Error("Governance contract not initialized");
    
    try {
      setLoading(true);
      setError(null);
      
      // Verify proposal state before executing
      const state = await contracts.governance.getProposalState(proposalId);
      if (state !== PROPOSAL_STATES.QUEUED) {
        throw new Error("Only queued proposals can be executed");
      }
      
      const tx = await contracts.governance.executeProposal(proposalId, {
        gasLimit: 1000000 // Higher gas limit for execution due to complexity
      });
      
      await tx.wait();
      console.log(`Proposal ${proposalId} executed successfully`);
      
      // Refresh proposals list
      await fetchProposals();
      
      return true;
    } catch (err) {
      console.error("Error executing proposal:", err);
      
      // Provide better error messages
      let errorMessage = "Failed to execute proposal";
      
      if (err.message.includes("NotInTimelock")) {
        errorMessage = "The transaction is no longer in the timelock queue. It may have been executed or cancelled.";
      } else if (err.message.includes("NotQueued")) {
        errorMessage = "The proposal is not properly queued for execution.";
      } else {
        errorMessage = `Failed to execute proposal: ${err.message}`;
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const claimRefund = async (proposalId) => {
    if (!isConnected || !contractsReady) throw new Error("Not connected");
    if (!contracts.governance) throw new Error("Governance contract not initialized");
    
    try {
      setLoading(true);
      setError(null);
      
      // Verify the proposal exists
      try {
        await contracts.governance.getProposalState(proposalId);
      } catch (err) {
        throw new Error(`Proposal ${proposalId} not found`);
      }
      
      const tx = await contracts.governance.claimPartialStakeRefund(proposalId, {
        gasLimit: 300000 // Higher gas limit for safety
      });
      
      await tx.wait();
      console.log(`Successfully claimed refund for proposal ${proposalId}`);
      
      // Refresh proposals list
      await fetchProposals();
      
      return true;
    } catch (err) {
      console.error("Error claiming refund:", err);
      
      let errorMessage = "Failed to claim refund";
      
      if (err.message.includes("Already")) {
        errorMessage = "This proposal's stake has already been refunded.";
      } else if (err.message.includes("NotProposer")) {
        errorMessage = "Only the proposer can claim a refund.";
      } else {
        errorMessage = `Failed to claim refund: ${err.message}`;
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Load governance parameters first, then proposals
  useEffect(() => {
    if (isConnected && contractsReady) {
      // First fetch the governance parameters
      fetchGovParams().then(() => {
        // Then fetch the proposals
        fetchProposals();
      });
    } else {
      setProposals([]);
      setLoading(false);
    }
  }, [fetchGovParams, fetchProposals, isConnected, contractsReady, refreshCounter, account]);

  return {
    proposals,
    loading,
    error,
    tokenHolders,
    createProposalStatus,
    fetchProposals,
    createProposal,
    cancelProposal,
    queueProposal,
    executeProposal,
    claimRefund
  };
}