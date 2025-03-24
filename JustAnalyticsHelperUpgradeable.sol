// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title JustTokenInterface
 * @notice Interface for the JustToken contract with delegation and token functions
 */
interface JustTokenInterface {
    function getDelegate(address account) external view returns (address);
    function getDelegatorsOf(address delegatee) external view returns (address[] memory);
    function balanceOf(address account) external view returns (uint256);
    function getEffectiveVotingPower(address voter, uint256 snapshotId) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function getCurrentSnapshotId() external view returns (uint256);
    function getSnapshotMetrics(uint256 snapshotId) external view returns (
        uint256 totalSupply,
        uint256 activeHolders,
        uint256 activeDelegates,
        uint256 totalDelegatedTokens,
        uint256 percentageDelegated,
        address topDelegate,
        uint256 topDelegateTokens
    );
}

/**
 * @title JustGovernanceInterface
 * @notice Interface for interacting with the JustGovernance contract
 */
interface JustGovernanceInterface {
    enum ProposalState { Active, Canceled, Defeated, Succeeded, Queued, Executed, Expired }
    enum ProposalType { 
        General,              // 0
        Withdrawal,           // 1
        TokenTransfer,        // 2
        GovernanceChange,     // 3
        ExternalERC20Transfer,// 4
        TokenMint,            // 5
        TokenBurn             // 6
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
    
    function getProposalState(uint256 proposalId) external view returns (ProposalState);
    function proposalVoterInfo(uint256 proposalId, address voter) external view returns (uint256);
    function _proposals(uint256 proposalId) external view returns (ProposalData memory);
    function govParams() external view returns (
        uint256 votingDuration,
        uint256 quorum,
        uint256 timelockDelay,
        uint256 proposalCreationThreshold,
        uint256 proposalStake,
        uint256 defeatedRefundPercentage,
        uint256 canceledRefundPercentage,
        uint256 expiredRefundPercentage
    );
}

/**
 * @title JustTimelockInterface
 * @notice Interface for interacting with the JustTimelock contract
 */
interface JustTimelockInterface {
    enum ThreatLevel { LOW, MEDIUM, HIGH, CRITICAL }
    function getTransaction(bytes32 txHash) external view returns (address, uint256, bytes memory, uint256, bool);
    function queuedTransactions(bytes32 txHash) external view returns (bool);
    function getThreatLevel(address target, bytes memory data) external view returns (ThreatLevel);
    function functionThreatLevels(bytes4 selector) external view returns (ThreatLevel);
    function addressThreatLevels(address target) external view returns (ThreatLevel);
    function lowThreatDelay() external view returns (uint256);
    function mediumThreatDelay() external view returns (uint256);
    function highThreatDelay() external view returns (uint256);
    function criticalThreatDelay() external view returns (uint256);
    function gracePeriod() external view returns (uint256);
}

/**
 * @title JustAnalyticsHelperUpgradeable
 * @notice Advanced analytics contract for comprehensive DAO governance metrics
 * @dev Focuses on proposal analytics, voter behavior, token distribution, and governance health
 */
contract JustAnalyticsHelperUpgradeable is
    Initializable,
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using AddressUpgradeable for address;

    // Custom errors for gas optimization
    error ZeroAddress();
    error NoToken();
    error NoGovernance();
    error NoTimelock();
    error InvalidProposalId();
    error NotAuthorized();
    error InvalidParameters();

    // Role-based access control
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ANALYTICS_ROLE = keccak256("ANALYTICS_ROLE");

    // Contract references
    JustTokenInterface public justToken;
    JustGovernanceInterface public justGovernance;
    JustTimelockInterface public justTimelock;

    // Constants for analytics
    uint256 private constant MAX_PROPOSALS_TO_ANALYZE = 1000;
    uint256 private constant SMALL_HOLDER_THRESHOLD = 10; // 1% of supply (in basis points)
    uint256 private constant MEDIUM_HOLDER_THRESHOLD = 50; // 5% of supply (in basis points)
    uint8 private constant MAX_DELEGATION_DEPTH = 8;
    
    // Storage for proposal analytics
    struct ProposalAnalytics {
        uint256 totalProposals;
        uint256 activeProposals;
        uint256 canceledProposals;
        uint256 defeatedProposals;
        uint256 succeededProposals;
        uint256 queuedProposals;
        uint256 executedProposals;
        uint256 expiredProposals;
        
        // By type counts
        uint256 generalProposals;
        uint256 withdrawalProposals;
        uint256 tokenTransferProposals;
        uint256 governanceChangeProposals;
        uint256 externalERC20Proposals;
        uint256 tokenMintProposals;
        uint256 tokenBurnProposals;
        
        // Success rates
        uint256 generalSuccessRate;
        uint256 withdrawalSuccessRate;
        uint256 tokenTransferSuccessRate;
        uint256 governanceChangeSuccessRate;
        uint256 externalERC20SuccessRate;
        uint256 tokenMintSuccessRate;
        uint256 tokenBurnSuccessRate;
        
        // Time metrics (in seconds)
        uint256 avgProposalLifetime;
        uint256 avgTimeToExecution;
        uint256 avgVotingTurnout; // basis points
    }
    
    // Storage for voter behavior analytics
    struct VoterAnalytics {
        uint256 totalVoters;
        uint256 activeVoters; // Voted in last 10 proposals
        uint256 superActiveVoters; // Voted in 80%+ of proposals
        uint256 consistentVoters; // Vote same way 80%+ of the time
        uint256 yesLeaning; // Vote yes more than 66% of the time
        uint256 noLeaning; // Vote no more than 66% of the time
        uint256 balanced; // Vote approximately evenly
        uint256 delegatorCount; // Number of accounts delegating
        uint256 delegateCount; // Number of accounts receiving delegation
        uint256 avgDelegationChainLength;
        // Add the missing fields
        address[] voters;
        uint256[] voteCounts;
        uint256[] yesCounts;
        uint256[] noCounts;
        uint256[] abstainCounts;
    }
    
    // Storage for token distribution analytics
    struct TokenDistributionAnalytics {
        uint256 totalSupply;
        uint256 circulatingSupply;
        uint256 treasuryBalance;
        uint256 activeTokens; // Tokens that have voted in the last 30 days
        uint256 delegatedTokens;
        uint256 smallHolderCount; // < 1% of supply
        uint256 mediumHolderCount; // 1-5% of supply
        uint256 largeHolderCount; // > 5% of supply
        uint256 smallHolderBalance; // Total balance of small holders
        uint256 mediumHolderBalance; // Total balance of medium holders
        uint256 largeHolderBalance; // Total balance of large holders
        uint256 tokensPerActiveVoter; // Average tokens per active voter
        uint256 giniCoefficient; // Measure of distribution inequality (basis points)
        uint256 topTenHolderBalance; // Balance of top 10 holders
    }
    
    // Storage for timelock analytics
    struct TimelockAnalytics {
        uint256 totalTransactions;
        uint256 executedTransactions;
        uint256 pendingTransactions;
        uint256 canceledTransactions;
        uint256 expiredTransactions;
        
        // Threat level counts
        uint256 lowThreatCount;
        uint256 mediumThreatCount;
        uint256 highThreatCount;
        uint256 criticalThreatCount;
        
        // Averages
        uint256 avgExecutionDelay; // seconds
        uint256 avgLowThreatDelay; // seconds
        uint256 avgMediumThreatDelay; // seconds
        uint256 avgHighThreatDelay; // seconds
        uint256 avgCriticalThreatDelay; // seconds
        
        // Success rates
        uint256 lowThreatSuccessRate; // basis points
        uint256 mediumThreatSuccessRate; // basis points
        uint256 highThreatSuccessRate; // basis points
        uint256 criticalThreatSuccessRate; // basis points
    }
    
    // Top voters by participation
    struct TopVoter {
        address voter;
        uint256 proposalsVoted;
        uint256 votingPower;
        uint256 yesPercentage; // basis points
        uint256 noPercentage; // basis points
        uint256 abstainPercentage; // basis points
    }
    
    // Historical analytics
    struct GovernanceSnapshot {
        uint256 timestamp;
        uint256 blockNumber;
        uint256 totalProposals;
        uint256 activeVoters;
        uint256 voterParticipationRate; // basis points
        uint256 avgProposalVotes;
        uint256 delegationRate; // basis points
        uint256 treasuryBalance;
        uint256 topDelegateConcentration; // basis points
        uint256 governanceHealth; // 0-100 score
    }
    
    // Stored historical snapshots
    GovernanceSnapshot[] public governanceSnapshots;
    
    // Mapping to track analyzed proposals
    mapping(uint256 => bool) private analyzedProposals;
    
    // Mapping to track voter activity
    mapping(address => uint256) private lastVotedProposal;
    mapping(address => uint256) private voterProposalCount;
    mapping(address => uint256) private voterYesCount;
    mapping(address => uint256) private voterNoCount;
    mapping(address => uint256) private voterAbstainCount;
    
    // Timelock transaction tracking
    mapping(bytes32 => uint256) private txSubmissionTime;
    mapping(bytes32 => uint256) private txExecutionTime;
    mapping(bytes32 => JustTimelockInterface.ThreatLevel) private txThreatLevels;
    
    // Events
    event AnalyticsUpdated(uint256 indexed timestamp, string analyticsType);
    event SnapshotCreated(uint256 indexed snapshotId, uint256 timestamp);
    event ContractAddressUpdated(string indexed contractType, address indexed newAddress);
    event ActiveVoterRegistered(address indexed voter, uint256 proposalsVoted);
    event ProposalTracked(uint256 indexed proposalId, JustGovernanceInterface.ProposalType proposalType);
    event TimelockTransactionTracked(bytes32 indexed txHash, JustTimelockInterface.ThreatLevel threatLevel);

    /**
     * @notice Initializes the contract with required addresses
     * @param tokenAddress Address of the JustToken contract
     * @param governanceAddress Address of the JustGovernance contract
     * @param timelockAddress Address of the JustTimelock contract
     * @param admin Initial admin address
     */
    function initialize(
        address tokenAddress,
        address governanceAddress,
        address timelockAddress,
        address admin
    ) public initializer {
        if(tokenAddress == address(0) || governanceAddress == address(0) || timelockAddress == address(0)) 
            revert ZeroAddress();
        
        __AccessControlEnumerable_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        justToken = JustTokenInterface(tokenAddress);
        justGovernance = JustGovernanceInterface(governanceAddress);
        justTimelock = JustTimelockInterface(timelockAddress);
        
        // If admin is not provided, use msg.sender
        address adminAddress = admin != address(0) ? admin : msg.sender;
        
        _setupRole(DEFAULT_ADMIN_ROLE, adminAddress);
        _setupRole(ADMIN_ROLE, adminAddress);
        _setupRole(ANALYTICS_ROLE, adminAddress);
    }

    /**
     * @notice Function that authorizes an upgrade to a new implementation
     * @dev Can only be called by an account with ADMIN_ROLE
     * @param newImplementation Address of the new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(ADMIN_ROLE) {
        // Authorization is handled by the onlyRole modifier
    }
    
    /**
     * @notice Updates contract addresses for integration
     * @param tokenAddress Address of the JustToken contract
     * @param governanceAddress Address of the JustGovernance contract
     * @param timelockAddress Address of the JustTimelock contract
     */
    function updateContractAddresses(
        address tokenAddress,
        address governanceAddress,
        address timelockAddress
    ) external onlyRole(ADMIN_ROLE) {
        if (tokenAddress != address(0)) {
            justToken = JustTokenInterface(tokenAddress);
            emit ContractAddressUpdated("Token", tokenAddress);
        }
        
        if (governanceAddress != address(0)) {
            justGovernance = JustGovernanceInterface(governanceAddress);
            emit ContractAddressUpdated("Governance", governanceAddress);
        }
        
        if (timelockAddress != address(0)) {
            justTimelock = JustTimelockInterface(timelockAddress);
            emit ContractAddressUpdated("Timelock", timelockAddress);
        }
    }
    
    /**
     * @notice Analyze proposal distribution and outcomes
     * @param startId Starting proposal ID to analyze
     * @param endId Ending proposal ID to analyze (inclusive)
     * @return analytics Comprehensive proposal analytics
     */
function getProposalAnalytics(uint256 startId, uint256 endId) 
    external
    view 
    onlyRole(ANALYTICS_ROLE)
    whenNotPaused
    returns (ProposalAnalytics memory analytics) 
{
    if (address(justGovernance) == address(0)) revert NoGovernance();
    if (endId < startId || endId - startId > MAX_PROPOSALS_TO_ANALYZE) revert InvalidParameters();
    
    // Initialize counters
    uint256 totalLifetime = 0;
    uint256 totalTimeToExecution = 0;
    uint256 totalTurnout = 0;
    
    uint256 generalTotal = 0;
    uint256 withdrawalTotal = 0;
    uint256 tokenTransferTotal = 0;
    uint256 governanceChangeTotal = 0;
    uint256 externalERC20Total = 0;
    uint256 tokenMintTotal = 0;
    uint256 tokenBurnTotal = 0;
    
    uint256 generalSuccess = 0;
    uint256 withdrawalSuccess = 0;
    uint256 tokenTransferSuccess = 0;
    uint256 governanceChangeSuccess = 0;
    uint256 externalERC20Success = 0;
    uint256 tokenMintSuccess = 0;
    uint256 tokenBurnSuccess = 0;
    
    analytics.totalProposals = endId - startId + 1;
    
    // Analyze each proposal
    for (uint256 id = startId; id <= endId; id++) {
        try justGovernance.getProposalState(id) returns (JustGovernanceInterface.ProposalState state) {
            // Count by state
            if (state == JustGovernanceInterface.ProposalState.Active) analytics.activeProposals++;
            else if (state == JustGovernanceInterface.ProposalState.Canceled) analytics.canceledProposals++;
            else if (state == JustGovernanceInterface.ProposalState.Defeated) analytics.defeatedProposals++;
            else if (state == JustGovernanceInterface.ProposalState.Succeeded) analytics.succeededProposals++;
            else if (state == JustGovernanceInterface.ProposalState.Queued) analytics.queuedProposals++;
            else if (state == JustGovernanceInterface.ProposalState.Executed) analytics.executedProposals++;
            else if (state == JustGovernanceInterface.ProposalState.Expired) analytics.expiredProposals++;
            
            // Get proposal data
            try justGovernance._proposals(id) returns (JustGovernanceInterface.ProposalData memory data) {
                // Track by type
                if (data.pType == JustGovernanceInterface.ProposalType.General) {
                    analytics.generalProposals++;
                    generalTotal++;
                    if (state == JustGovernanceInterface.ProposalState.Executed) generalSuccess++;
                } 
                else if (data.pType == JustGovernanceInterface.ProposalType.Withdrawal) {
                    analytics.withdrawalProposals++;
                    withdrawalTotal++;
                    if (state == JustGovernanceInterface.ProposalState.Executed) withdrawalSuccess++;
                }
                else if (data.pType == JustGovernanceInterface.ProposalType.TokenTransfer) {
                    analytics.tokenTransferProposals++;
                    tokenTransferTotal++;
                    if (state == JustGovernanceInterface.ProposalState.Executed) tokenTransferSuccess++;
                }
                else if (data.pType == JustGovernanceInterface.ProposalType.GovernanceChange) {
                    analytics.governanceChangeProposals++;
                    governanceChangeTotal++;
                    if (state == JustGovernanceInterface.ProposalState.Executed) governanceChangeSuccess++;
                }
                else if (data.pType == JustGovernanceInterface.ProposalType.ExternalERC20Transfer) {
                    analytics.externalERC20Proposals++;
                    externalERC20Total++;
                    if (state == JustGovernanceInterface.ProposalState.Executed) externalERC20Success++;
                }
                else if (data.pType == JustGovernanceInterface.ProposalType.TokenMint) {
                    analytics.tokenMintProposals++;
                    tokenMintTotal++;
                    if (state == JustGovernanceInterface.ProposalState.Executed) tokenMintSuccess++;
                }
                else if (data.pType == JustGovernanceInterface.ProposalType.TokenBurn) {
                    analytics.tokenBurnProposals++;
                    tokenBurnTotal++;
                    if (state == JustGovernanceInterface.ProposalState.Executed) tokenBurnSuccess++;
                }
                
                // Time metrics
                uint256 lifetime = block.timestamp - data.createdAt;
                totalLifetime += lifetime;
                
                // Turnout calculation
                uint256 totalVotes = data.yesVotes + data.noVotes + data.abstainVotes;
                
                // Use snapshot total supply if available
                try justToken.getSnapshotMetrics(data.snapshotId) returns (
                    uint256 totalSupply,
                    uint256,
                    uint256,
                    uint256,
                    uint256,
                    address,
                    uint256
                ) {
                    if (totalSupply > 0) {
                        totalTurnout += (totalVotes * 10000) / totalSupply;
                    }
                } catch {
                    // Fall back to current supply if needed
                    uint256 currentSupply = justToken.totalSupply();
                    if (currentSupply > 0) {
                        totalTurnout += (totalVotes * 10000) / currentSupply;
                    }
                }
            } catch {
                // Skip if we can't get proposal data
                continue;
            }
        } catch {
            // Skip invalid proposal IDs
            continue;
        }
    }
    
    // Calculate averages and rates
    if (analytics.totalProposals > 0) {
        analytics.avgProposalLifetime = totalLifetime / analytics.totalProposals;
        analytics.avgVotingTurnout = totalTurnout / analytics.totalProposals;
    }
    
    // Calculate success rates (basis points)
    analytics.generalSuccessRate = generalTotal > 0 ? (generalSuccess * 10000) / generalTotal : 0;
    analytics.withdrawalSuccessRate = withdrawalTotal > 0 ? (withdrawalSuccess * 10000) / withdrawalTotal : 0;
    analytics.tokenTransferSuccessRate = tokenTransferTotal > 0 ? (tokenTransferSuccess * 10000) / tokenTransferTotal : 0;
    analytics.governanceChangeSuccessRate = governanceChangeTotal > 0 ? (governanceChangeSuccess * 10000) / governanceChangeTotal : 0;
    analytics.externalERC20SuccessRate = externalERC20Total > 0 ? (externalERC20Success * 10000) / externalERC20Total : 0;
    analytics.tokenMintSuccessRate = tokenMintTotal > 0 ? (tokenMintSuccess * 10000) / tokenMintTotal : 0;
    analytics.tokenBurnSuccessRate = tokenBurnTotal > 0 ? (tokenBurnSuccess * 10000) / tokenBurnTotal : 0;
    
    return analytics;
}

    /**
     * @notice Get detailed voter behavior analytics
     * @param proposalCount Number of recent proposals to analyze
     * @return analytics Comprehensive voter behavior metrics
     */
    function getVoterBehaviorAnalytics(uint256 proposalCount) 
        external
        view 
        onlyRole(ANALYTICS_ROLE)
        whenNotPaused
        returns (VoterAnalytics memory analytics)
    {
        if (address(justGovernance) == address(0)) revert NoGovernance();
        if (address(justToken) == address(0)) revert NoToken();
        if (proposalCount == 0 || proposalCount > MAX_PROPOSALS_TO_ANALYZE) revert InvalidParameters();
        
        // Get the current proposal count (estimated by checking recent proposals)
        uint256 latestProposalId = findLatestProposalId();
        
        // If no proposals found, return empty analytics
        if (latestProposalId == 0) return analytics;
        
        // Determine proposal range to analyze
        uint256 startId = latestProposalId >= proposalCount ? latestProposalId - proposalCount + 1 : 1;
        
        // Maximum voters to track
        uint256 maxVoters = 100;
        
        // Temporary storage for voter analysis
        address[] memory voters = new address[](maxVoters);
        uint256[] memory voteCounts = new uint256[](maxVoters);
        uint256[] memory yesCounts = new uint256[](maxVoters);
        uint256[] memory noCounts = new uint256[](maxVoters);
        uint256[] memory abstainCounts = new uint256[](maxVoters);
        uint256 voterCount = 0;
        
        // Get delegation metrics from the latest snapshot
        uint256 snapshotId = justToken.getCurrentSnapshotId();
        
        // Variables to store metrics
        uint256 activeHolders = 0;
        uint256 activeDelegates = 0;
        uint256 totalDelegatedTokens = 0;
        address topDelegate = address(0);
        
        // Get snapshot metrics individually to avoid destructuring issues
        try justToken.getSnapshotMetrics(snapshotId) returns (
            uint256 _totalSupply,
            uint256 _activeHolders,
            uint256 _activeDelegates,
            uint256 _totalDelegatedTokens,
            uint256 _percentageDelegated,
            address _topDelegate,
            uint256 _topDelegateTokens
        ) {
            // Store values in our variables
            activeHolders = _activeHolders;
            activeDelegates = _activeDelegates;
            totalDelegatedTokens = _totalDelegatedTokens;
            topDelegate = _topDelegate;
            
            // Set delegation stats
            analytics.delegatorCount = totalDelegatedTokens > 0 ? activeHolders - activeDelegates : 0;
            analytics.delegateCount = activeDelegates;
        } catch {
            // Default values if call fails
            analytics.delegatorCount = 0;
            analytics.delegateCount = 0;
        }
        
        // First, add the top delegate to our voter list
        if (topDelegate != address(0)) {
            voters[voterCount++] = topDelegate;
        }
        
        // Next, get delegators of the top delegate
        if (topDelegate != address(0)) {
            address[] memory topDelegators = justToken.getDelegatorsOf(topDelegate);
            for (uint256 i = 0; i < topDelegators.length && voterCount < maxVoters; i++) {
                voters[voterCount++] = topDelegators[i];
            }
        }
        
        // Now iterate through proposals to find voters
        for (uint256 id = startId; id <= latestProposalId; id++) {
            try justGovernance._proposals(id) returns (JustGovernanceInterface.ProposalData memory data) {
                // Add the proposer to our voter list if not already included
                bool proposerFound = false;
                for (uint256 i = 0; i < voterCount; i++) {
                    if (voters[i] == data.proposer) {
                        proposerFound = true;
                        break;
                    }
                }
                
                if (!proposerFound && voterCount < maxVoters) {
                    voters[voterCount++] = data.proposer;
                }
                
                // Check if known voters have voted in this proposal
                for (uint256 i = 0; i < voterCount; i++) {
                    address voter = voters[i];
                    
                    try justGovernance.proposalVoterInfo(id, voter) returns (uint256 votingPower) {
                        if (votingPower > 0) {
                            // This voter voted in this proposal
                            voteCounts[i]++;
                            
                            // Determine vote type based on proposal data
                            uint256 totalVotes = data.yesVotes + data.noVotes + data.abstainVotes;
                            
                            // Use effective voting power to estimate how they voted
                            // This is a heuristic since we can't know exactly how each person voted
                            uint256 voterPower = justToken.getEffectiveVotingPower(voter, data.snapshotId);
                            
                            if (data.yesVotes > data.noVotes && data.yesVotes > data.abstainVotes) {
                                yesCounts[i]++;
                            } else if (data.noVotes > data.yesVotes && data.noVotes > data.abstainVotes) {
                                noCounts[i]++;
                            } else {
                                abstainCounts[i]++;
                            }
                        }
                    } catch {
                        // Skip if we can't get voting info
                        continue;
                    }
                }
            } catch {
                // Skip if we can't get proposal data
                continue;
            }
        }
        
        // Set the total and active voter counts
        analytics.totalVoters = countActiveVoters(latestProposalId);
        analytics.activeVoters = voterCount; // Voters we've actually found
        
        // Super active threshold would be participating in 80% of proposals
        uint256 superActiveThreshold = (proposalCount * 80) / 100;
        if (superActiveThreshold == 0 && proposalCount > 0) superActiveThreshold = 1; // At least 1 for small counts
        
        // Analyze voter behavior
        for (uint256 i = 0; i < voterCount; i++) {
            // Super active voters participated in many proposals
            if (voteCounts[i] >= superActiveThreshold) {
                analytics.superActiveVoters++;
            }
            
            // Analyze voting patterns - only if they've voted at least once
            if (voteCounts[i] > 0) {
                // Calculate vote type percentages
                uint256 yesPercent = (yesCounts[i] * 100) / voteCounts[i];
                uint256 noPercent = (noCounts[i] * 100) / voteCounts[i];
                uint256 abstainPercent = (abstainCounts[i] * 100) / voteCounts[i];
                
                // Categorize by voting tendency
                if (yesPercent >= 66) {
                    analytics.yesLeaning++;
                } else if (noPercent >= 66) {
                    analytics.noLeaning++;
                } else {
                    analytics.balanced++;
                }
                
                // Check for consistent voters (voting the same way most of the time)
                uint256 maxVoteType = yesCounts[i];
                if (noCounts[i] > maxVoteType) maxVoteType = noCounts[i];
                if (abstainCounts[i] > maxVoteType) maxVoteType = abstainCounts[i];
                
                if (maxVoteType >= (voteCounts[i] * 80) / 100) {
                    analytics.consistentVoters++;
                }
            }
        }
        
        // Calculate average delegation chain length
        if (analytics.delegateCount > 0) {
            uint256 totalChainLength = 0;
            for (uint256 i = 0; i < voterCount; i++) {
                address delegate = justToken.getDelegate(voters[i]);
                uint8 depth = 0;
                
                // Simple approach to determine chain length
                while (delegate != address(0) && delegate != voters[i] && depth < MAX_DELEGATION_DEPTH) {
                    depth++;
                    delegate = justToken.getDelegate(delegate);
                }
                
                totalChainLength += depth;
            }
            
            analytics.avgDelegationChainLength = totalChainLength / analytics.delegateCount;
        }
        
        // Populate the arrays for detailed voter analysis
        analytics.voters = new address[](voterCount);
        analytics.voteCounts = new uint256[](voterCount);
        analytics.yesCounts = new uint256[](voterCount);
        analytics.noCounts = new uint256[](voterCount);
        analytics.abstainCounts = new uint256[](voterCount);
        
        // Copy data from temporary arrays to result arrays
        for (uint256 i = 0; i < voterCount; i++) {
            analytics.voters[i] = voters[i];
            analytics.voteCounts[i] = voteCounts[i];
            analytics.yesCounts[i] = yesCounts[i];
            analytics.noCounts[i] = noCounts[i];
            analytics.abstainCounts[i] = abstainCounts[i];
        }
        
        return analytics;
    }

    function calculateGovernanceHealthScore() 
        external 
        view 
        onlyRole(ANALYTICS_ROLE)
        whenNotPaused
        returns (uint256 score, uint256[] memory breakdown) 
        {
        breakdown = new uint256[](5);

        uint256 latestProposalId = findLatestProposalId();
        uint256 totalSupply = justToken.totalSupply();
        if (latestProposalId == 0 || totalSupply == 0) return (0, breakdown);

        // 1. Participation Score - average voter turnout (0-20)
        uint256 startId = latestProposalId > 5 ? latestProposalId - 5 + 1 : 1;
        uint256 totalTurnout;
        uint256 proposalsAnalyzed;

        // 2. Parameters needed for scores 2-5
        uint256 delegationRate = 0;
        uint256 topDelegateTokens = 0;
        address topDelegate;
        uint8 typeMap;
        uint256 executedProposals;
        uint256 completedProposals;
        uint8[4] memory threatCounts;
        uint256 totalTx;

        // Get delegation metrics from the latest snapshot
        uint256 snapshotId = justToken.getCurrentSnapshotId();
        
        // Get snapshot metrics individually to avoid destructuring issues
        try justToken.getSnapshotMetrics(snapshotId) returns (
            uint256 _totalSupply,
            uint256 _activeHolders,
            uint256 _activeDelegates,
            uint256 _totalDelegatedTokens,
            uint256 _percentageDelegated,
            address _topDelegate,
            uint256 _topDelegateTokens
        ) {
            // Assign to our variables
            delegationRate = _percentageDelegated;
            topDelegate = _topDelegate;
            topDelegateTokens = _topDelegateTokens;
        } catch {
            // Default values if call fails
            delegationRate = 0;
            topDelegateTokens = 0;
        }

        // Common loop to gather all metrics at once
        for (uint256 id = startId; id <= latestProposalId; id++) {
            // Get proposal data for various metrics
            try justGovernance._proposals(id) returns (JustGovernanceInterface.ProposalData memory data) {
                proposalsAnalyzed++;
                
                // For participation score
                uint256 totalVotes = data.yesVotes + data.noVotes + data.abstainVotes;
                totalTurnout += (totalVotes * 10000) / totalSupply;
                
                // For governance activity score
                uint8 pType = uint8(data.pType);
                if (pType < 8) typeMap |= uint8(1 << pType);
                
                // For threat diversity score
                if (data.timelockTxHash != bytes32(0)) {
                    try justTimelock.getThreatLevel(data.target, data.callData) returns (JustTimelockInterface.ThreatLevel level) {
                        threatCounts[uint8(level)]++;
                        totalTx++;
                    } catch {}
                }
            } catch {}
            
            // For execution success score
            try justGovernance.getProposalState(id) returns (JustGovernanceInterface.ProposalState state) {
                if (state != JustGovernanceInterface.ProposalState.Active && 
                    state != JustGovernanceInterface.ProposalState.Queued) {
                    completedProposals++;
                    if (state == JustGovernanceInterface.ProposalState.Executed) {
                        executedProposals++;
                    }
                }
            } catch {}
        }

        // Calculate scores
        if (proposalsAnalyzed > 0) {
            breakdown[0] = (totalTurnout * 20) / (proposalsAnalyzed * 10000); // Participation
        }

        // Delegation score (0-20)
        breakdown[1] = (delegationRate / 1000) + (topDelegateTokens > 0 ? 
                    min(10, 10 - ((topDelegateTokens * 10000 / totalSupply) / 1000)) : 0);

        // Activity score (0-20) - count unique proposal types
        uint256 uniqueTypes;
        for (uint8 i = 0; i < 8; i++) {
            if ((typeMap & (1 << i)) != 0) uniqueTypes++;
        }
        breakdown[2] = min(20, uniqueTypes * 5);

        // Execution score (0-20)
        if (completedProposals > 0) {
            breakdown[3] = (executedProposals * 20) / completedProposals;
        }

        // Threat diversity score (0-20)
        if (totalTx > 0) {
            uint256 totalDeviation;
            for (uint8 i = 0; i < 4; i++) {
                uint256 pct = (threatCounts[i] * 100) / totalTx;
                totalDeviation += pct > 25 ? pct - 25 : 25 - pct;
            }
            breakdown[4] = totalDeviation >= 100 ? 0 : (100 - totalDeviation) / 5;
        }

        // Sum all scores
        score = breakdown[0] + breakdown[1] + breakdown[2] + breakdown[3] + breakdown[4];
        return (score, breakdown);
        }

        // Helper function
        function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
        }

/**
 * @notice Analyze timelock transaction patterns and threat level effectiveness
 * @param maxTransactions Maximum number of transactions to analyze
 * @return analytics Timelock transaction and threat level metrics
 */

function getTimelockAnalytics(uint256 maxTransactions) 
    external
    view
    onlyRole(ANALYTICS_ROLE)
    whenNotPaused
    returns (TimelockAnalytics memory analytics) 
{
    if (address(justTimelock) == address(0)) revert NoTimelock();
    if (maxTransactions == 0 || maxTransactions > MAX_PROPOSALS_TO_ANALYZE) revert InvalidParameters();
    
    // Get threat level delays
    uint256 lowDelay = justTimelock.lowThreatDelay();
    uint256 mediumDelay = justTimelock.mediumThreatDelay();
    uint256 highDelay = justTimelock.highThreatDelay();
    uint256 criticalDelay = justTimelock.criticalThreatDelay();
    uint256 gracePeriod = justTimelock.gracePeriod();
    
    // Track totals for each threat level
    uint256 lowThreatTotal;
    uint256 mediumThreatTotal;
    uint256 highThreatTotal;
    uint256 criticalThreatTotal;
    uint256 lowThreatSuccess;
    uint256 mediumThreatSuccess;
    uint256 highThreatSuccess;
    uint256 criticalThreatSuccess;
    uint256 totalLowDelay;
    uint256 totalMediumDelay;
    uint256 totalHighDelay;
    uint256 totalCriticalDelay;
    
    // Find recent proposals with timelock transactions
    uint256 latestProposalId = 1000; // Upper limit
    
    for (uint256 id = latestProposalId; id > 0 && analytics.totalTransactions < maxTransactions; id--) {
        bytes32 timelockTxHash;
        
        try justGovernance._proposals(id) returns (JustGovernanceInterface.ProposalData memory data) {
            timelockTxHash = data.timelockTxHash;
            if (timelockTxHash == bytes32(0)) continue;
            
            // Check if queued
            bool isQueued = justTimelock.queuedTransactions(timelockTxHash);
            
            try justTimelock.getTransaction(timelockTxHash) returns (
                address target,
                uint256,
                bytes memory callData,
                uint256 eta,
                bool executed
            ) {
                analytics.totalTransactions++;
                
                if (executed) {
                    analytics.executedTransactions++;
                } else if (isQueued) {
                    analytics.pendingTransactions++;
                } else if (block.timestamp > eta + gracePeriod) {
                    analytics.expiredTransactions++;
                } else {
                    analytics.canceledTransactions++;
                }
                
                // Determine threat level
                JustTimelockInterface.ThreatLevel threatLevel = justTimelock.getThreatLevel(target, callData);
                
                if (threatLevel == JustTimelockInterface.ThreatLevel.LOW) {
                    analytics.lowThreatCount++;
                    lowThreatTotal++;
                    if (executed) lowThreatSuccess++;
                    totalLowDelay += lowDelay;
                } 
                else if (threatLevel == JustTimelockInterface.ThreatLevel.MEDIUM) {
                    analytics.mediumThreatCount++;
                    mediumThreatTotal++;
                    if (executed) mediumThreatSuccess++;
                    totalMediumDelay += mediumDelay;
                }
                else if (threatLevel == JustTimelockInterface.ThreatLevel.HIGH) {
                    analytics.highThreatCount++;
                    highThreatTotal++;
                    if (executed) highThreatSuccess++;
                    totalHighDelay += highDelay;
                }
                else if (threatLevel == JustTimelockInterface.ThreatLevel.CRITICAL) {
                    analytics.criticalThreatCount++;
                    criticalThreatTotal++;
                    if (executed) criticalThreatSuccess++;
                    totalCriticalDelay += criticalDelay;
                }
            } catch {
                // Skip if transaction doesn't exist
                continue;
            }
        } catch {
            // Skip if proposal doesn't exist
            continue;
        }
    }
    
    // Calculate average delays (only if count > 0)
    if (analytics.lowThreatCount > 0) analytics.avgLowThreatDelay = totalLowDelay / analytics.lowThreatCount;
    if (analytics.mediumThreatCount > 0) analytics.avgMediumThreatDelay = totalMediumDelay / analytics.mediumThreatCount;
    if (analytics.highThreatCount > 0) analytics.avgHighThreatDelay = totalHighDelay / analytics.highThreatCount;
    if (analytics.criticalThreatCount > 0) analytics.avgCriticalThreatDelay = totalCriticalDelay / analytics.criticalThreatCount;
    
    // Calculate overall average execution delay
    if (analytics.totalTransactions > 0) {
        analytics.avgExecutionDelay = (totalLowDelay + totalMediumDelay + totalHighDelay + totalCriticalDelay) / 
                                    analytics.totalTransactions;
    }
    
    // Calculate success rates (basis points)
    if (lowThreatTotal > 0) analytics.lowThreatSuccessRate = (lowThreatSuccess * 10000) / lowThreatTotal;
    if (mediumThreatTotal > 0) analytics.mediumThreatSuccessRate = (mediumThreatSuccess * 10000) / mediumThreatTotal;
    if (highThreatTotal > 0) analytics.highThreatSuccessRate = (highThreatSuccess * 10000) / highThreatTotal;
    if (criticalThreatTotal > 0) analytics.criticalThreatSuccessRate = (criticalThreatSuccess * 10000) / criticalThreatTotal;
    
    return analytics;
}
    /**
 * @notice Helper function to find the latest proposal ID
 * @return The ID of the most recent proposal
 */
function findLatestProposalId() internal view returns (uint256) {
    uint256 latestProposalId = 0;
    for (uint256 i = 1000; i > 0; i--) {
        try justGovernance.getProposalState(i) returns (JustGovernanceInterface.ProposalState) {
            latestProposalId = i;
            break;
        } catch {
            continue;
        }
    }
    return latestProposalId;
}

    /**
 * @notice Count the unique active voters from recent proposals
 * @param latestProposalId The ID of the most recent proposal
 * @return The count of unique active voters
 */
function countActiveVoters(uint256 latestProposalId) private view returns (uint256) {
    if (latestProposalId == 0) return 0;
    
    // Use a mapping to track unique voters
    address[] memory voters = new address[](100);
    uint256 voterCount = 0;
    
    uint256 startId = latestProposalId > 5 ? latestProposalId - 5 + 1 : 1;
    
    // Get the current snapshot ID
    uint256 snapshotId = justToken.getCurrentSnapshotId();
    
    // Variables to store metrics
    uint256 activeHolders = 0;
    uint256 activeDelegates = 0;
    address topDelegate = address(0);
    
    // Get snapshot metrics individually
    try justToken.getSnapshotMetrics(snapshotId) returns (
        uint256 _totalSupply,
        uint256 _activeHolders,
        uint256 _activeDelegates,
        uint256 _totalDelegatedTokens,
        uint256 _percentageDelegated,
        address _topDelegate,
        uint256 _topDelegateTokens
    ) {
        activeHolders = _activeHolders;
        activeDelegates = _activeDelegates;
        topDelegate = _topDelegate;
    } catch {
        // Default values if call fails
        activeHolders = 0;
        activeDelegates = 0;
    }
    
    // First check proposers for recent proposals
    for (uint256 id = startId; id <= latestProposalId; id++) {
        try justGovernance._proposals(id) returns (JustGovernanceInterface.ProposalData memory data) {
            // Add proposer as a voter if not already counted
            bool found = false;
            for (uint256 k = 0; k < voterCount; k++) {
                if (voters[k] == data.proposer) {
                    found = true;
                    break;
                }
            }
            
            if (!found && voterCount < voters.length) {
                voters[voterCount++] = data.proposer;
            }
            
            // Look for additional voters by checking addresses with high voting power
            if (topDelegate != address(0)) {
                found = false;
                for (uint256 k = 0; k < voterCount; k++) {
                    if (voters[k] == topDelegate) {
                        found = true;
                        break;
                    }
                }
                
                if (!found && voterCount < voters.length) {
                    voters[voterCount++] = topDelegate;
                }
                
                // Check if the top delegate voted in this proposal
                try justGovernance.proposalVoterInfo(id, topDelegate) returns (uint256 weight) {
                    if (weight > 0) {
                        // Top delegate voted, now check some delegators
                        address[] memory delegators = justToken.getDelegatorsOf(topDelegate);
                        for (uint256 j = 0; j < delegators.length && j < 10 && voterCount < voters.length; j++) {
                            found = false;
                            for (uint256 k = 0; k < voterCount; k++) {
                                if (voters[k] == delegators[j]) {
                                    found = true;
                                    break;
                                }
                            }
                            
                            if (!found) {
                                voters[voterCount++] = delegators[j];
                            }
                        }
                    }
                } catch {
                    // Skip if voter info can't be retrieved
                }
            }
        } catch {
            // Skip if proposal data can't be retrieved
        }
    }
    
    return voterCount > 0 ? voterCount : activeDelegates;
}

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}