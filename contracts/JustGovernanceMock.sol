pragma solidity 0.8.20;

// JustGovernanceMock.sol
// SPDX-License-Identifier: MIT


contract JustGovernanceMock {
    enum ProposalState { Active, Canceled, Defeated, Succeeded, Queued, Executed, Expired }
    enum ProposalType { 
        General,
        Withdrawal,
        TokenTransfer,
        GovernanceChange,
        ExternalERC20Transfer,
        TokenMint,
        TokenBurn
    }
    
    struct ProposalData {
        // Common base data
        uint8 flags;
        ProposalType pType;
        uint48 deadline;
        uint48 createdAt;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 abstainVotes;
        address proposer;
        uint256 snapshotId;
        uint256 stakedAmount;
        bytes32 timelockTxHash;
        string description;
        
        // Type-specific fields
        address target;
        bytes callData;
        address recipient;
        uint256 amount;
        address token;
        
        // GovernanceChange specific fields
        uint256 newThreshold;
        uint256 newQuorum;
        uint256 newVotingDuration;
        uint256 newTimelockDelay;
    }
    
    mapping(uint256 => ProposalData) private _proposalData;
    mapping(uint256 => ProposalState) private _proposalStates;
    mapping(uint256 => mapping(address => uint256)) private _proposalVoterInfo;
    
    struct GovParams {
        uint256 votingDuration;
        uint256 quorum;
        uint256 timelockDelay;
        uint256 proposalCreationThreshold;
        uint256 proposalStake;
        uint256 defeatedRefundPercentage;
        uint256 canceledRefundPercentage;
        uint256 expiredRefundPercentage;
    }
    
    GovParams private _govParams;
    
    // Setter functions for testing
    function setProposalData(uint256 proposalId, ProposalData memory data) external {
        _proposalData[proposalId] = data;
    }
    
    function setProposalState(uint256 proposalId, ProposalState state) external {
        _proposalStates[proposalId] = state;
    }
    
    function setProposalVoterInfo(uint256 proposalId, address voter, uint256 weight) external {
        _proposalVoterInfo[proposalId][voter] = weight;
    }
    
    function setGovParams(
        uint256 votingDuration,
        uint256 quorum,
        uint256 timelockDelay,
        uint256 proposalCreationThreshold,
        uint256 proposalStake,
        uint256 defeatedRefundPercentage,
        uint256 canceledRefundPercentage,
        uint256 expiredRefundPercentage
    ) external {
        _govParams = GovParams({
            votingDuration: votingDuration,
            quorum: quorum,
            timelockDelay: timelockDelay,
            proposalCreationThreshold: proposalCreationThreshold,
            proposalStake: proposalStake,
            defeatedRefundPercentage: defeatedRefundPercentage,
            canceledRefundPercentage: canceledRefundPercentage,
            expiredRefundPercentage: expiredRefundPercentage
        });
    }
    
    // Interface functions
    function getProposalState(uint256 proposalId) external view returns (ProposalState) {
        require(proposalId > 0 && proposalId <= 10, "Invalid proposal ID");
        return _proposalStates[proposalId];
    }
    
    function proposalVoterInfo(uint256 proposalId, address voter) external view returns (uint256) {
        return _proposalVoterInfo[proposalId][voter];
    }
    
    function _proposals(uint256 proposalId) external view returns (ProposalData memory) {
        require(proposalId > 0 && proposalId <= 10, "Invalid proposal ID");
        return _proposalData[proposalId];
    }
    
    function govParams() external view returns (
        uint256 votingDuration,
        uint256 quorum,
        uint256 timelockDelay,
        uint256 proposalCreationThreshold,
        uint256 proposalStake,
        uint256 defeatedRefundPercentage,
        uint256 canceledRefundPercentage,
        uint256 expiredRefundPercentage
    ) {
        return (
            _govParams.votingDuration,
            _govParams.quorum,
            _govParams.timelockDelay,
            _govParams.proposalCreationThreshold,
            _govParams.proposalStake,
            _govParams.defeatedRefundPercentage,
            _govParams.canceledRefundPercentage,
            _govParams.expiredRefundPercentage
        );
    }
}