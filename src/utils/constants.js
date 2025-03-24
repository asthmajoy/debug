// Contract addresses (update these with your deployed contract addresses)
export const CONTRACT_ADDRESSES = {
    token: "0x217727A0E6A67E4eB215684D50146D0151fEa742", // JustToken address
    governance: "0x77c3914AC34E014cCc783596cb7Af539DcFC4363", // JustGovernance address
    timelock: "0x6292A0cB58b276fBf7FEa46aD2dec796bf678E77", // JustTimelock address
    analyticsHelper: "0x76D5401de7ac237C0424533e0d99cCBfaA37313F", // JustAnalyticsHelper address
    daoHelper: "0x7AcC03DB32Eb157164d2356428345c79f0D56Fb7" // JustDAOHelper address 
  };
  
  // Proposal Types
  export const PROPOSAL_TYPES = {
    GENERAL: 0,
    WITHDRAWAL: 1,
    TOKEN_TRANSFER: 2,
    GOVERNANCE_CHANGE: 3,
    EXTERNAL_ERC20_TRANSFER: 4,
    TOKEN_MINT: 5,
    TOKEN_BURN: 6
  };
  
  // Proposal States
  export const PROPOSAL_STATES = {
    ACTIVE: 0,
    CANCELED: 1,
    DEFEATED: 2,
    SUCCEEDED: 3,
    QUEUED: 4,
    EXECUTED: 5,
    EXPIRED: 6
  };
  
  // Vote Types
  export const VOTE_TYPES = {
    AGAINST: 0,
    FOR: 1,
    ABSTAIN: 2
  };
  
  // Timelock Threat Levels
  export const THREAT_LEVELS = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    CRITICAL: 3
  };
  
  // Role Definitions (keccak256 hashed strings for role definitions)
  export const ROLES = {
    DEFAULT_ADMIN_ROLE: "0x0000000000000000000000000000000000000000000000000000000000000000",
    ADMIN_ROLE: "0xa49807205ce4d355092ef5a8a18f56e8913cf4a201fbe287825b095693c21775",
    GUARDIAN_ROLE: "0x55435dd261a4b9b3364963f7738a7a662ad9c84396d64be3365284bb7f0a5041",
    ANALYTICS_ROLE: "0x1392683b4fe604b030f727da71b11fe86de118903712aeeae60f8bf8183bbf1b",
    GOVERNANCE_ROLE: "0x71840dc4906352362b0cdaf79870196c8e42acafade72d5d5a6d59291253ceb1",
    PROPOSER_ROLE: "0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1",
    EXECUTOR_ROLE: "0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63",
    MINTER_ROLE: "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6",
    CANCELLER_ROLE: "0xfd643c72710c63c0180259aba6b2d05451e3591a24e58b62239378085726f783",
    TIMELOCK_ADMIN_ROLE: "0x5f58e3a2316349923ce3780f8d587db2d72378aed66a8261c916544fa6846ca5",
  };