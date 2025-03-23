import React, { useState, useEffect } from 'react';
import { BarChart, PieChart, LineChart, AreaChart } from 'lucide-react';
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';
import Loader from './Loader';
import { formatBigNumber, formatPercentage } from '../utils/formatters';

// Register Chart.js components
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

const AnalyticsTab = ({ contract }) => {
  const [selectedMetric, setSelectedMetric] = useState('proposal');
  const [analyticsData, setAnalyticsData] = useState({
    proposals: null,
    voters: null,
    tokens: null,
    timelock: null,
    health: null
  });
  const [loading, setLoading] = useState(false);
  const [charts, setCharts] = useState({});

  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      try {
        switch (selectedMetric) {
          case 'proposal':
            // Directly call contract methods instead of using the API
            const proposalAnalytics = await contract.getProposalAnalytics(1, 100); // Adjust parameters as needed
            setAnalyticsData(prevData => ({...prevData, proposals: proposalAnalytics}));
            break;
          case 'voter':
            // Directly call contract methods instead of using the API
            const voterAnalytics = await contract.getVoterBehaviorAnalytics(20); // Adjust parameters as needed
            setAnalyticsData(prevData => ({...prevData, voters: voterAnalytics}));
            break;
          case 'token':
            // This could be fetched from the token contract if needed
            const tokenSupply = await contract.justToken().totalSupply();
            // You'll need to structure the token data object based on your needs
            const tokenData = { totalSupply: tokenSupply };
            setAnalyticsData(prevData => ({...prevData, tokens: tokenData}));
            break;
          case 'health':
            // Directly call contract methods instead of using the API
            const [healthScore, breakdown] = await contract.calculateGovernanceHealthScore();
            setAnalyticsData(prevData => ({...prevData, health: { score: healthScore, breakdown }}));
            break;
          case 'timelock':
            // Directly call contract methods instead of using the API
            const timelockAnalytics = await contract.getTimelockAnalytics(50); // Adjust parameters as needed
            setAnalyticsData(prevData => ({...prevData, timelock: timelockAnalytics}));
            break;
          default:
            console.log('Unknown metric selected:', selectedMetric);
            break;
        }
      } catch (error) {
        console.error(`Error loading ${selectedMetric} analytics:`, error);
      } finally {
        setLoading(false);
      }
    };

    if (contract) {
      loadAnalytics();
    }
  }, [selectedMetric, contract]);

  const renderMetricButtons = () => (
    <div className="flex flex-wrap gap-2 mb-6">
      <button
        className={`flex items-center px-4 py-2 rounded-lg ${selectedMetric === 'proposal' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
        onClick={() => setSelectedMetric('proposal')}
      >
        <BarChart className="w-4 h-4 mr-2" />
        Proposals
      </button>
      <button
        className={`flex items-center px-4 py-2 rounded-lg ${selectedMetric === 'voter' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
        onClick={() => setSelectedMetric('voter')}
      >
        <PieChart className="w-4 h-4 mr-2" />
        Voters
      </button>
      <button
        className={`flex items-center px-4 py-2 rounded-lg ${selectedMetric === 'token' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
        onClick={() => setSelectedMetric('token')}
      >
        <LineChart className="w-4 h-4 mr-2" />
        Tokens
      </button>
      <button
        className={`flex items-center px-4 py-2 rounded-lg ${selectedMetric === 'timelock' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
        onClick={() => setSelectedMetric('timelock')}
      >
        <AreaChart className="w-4 h-4 mr-2" />
        Timelock
      </button>
      <button
        className={`flex items-center px-4 py-2 rounded-lg ${selectedMetric === 'health' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
        onClick={() => setSelectedMetric('health')}
      >
        <BarChart className="w-4 h-4 mr-2" />
        Health Score
      </button>
    </div>
  );

  const renderContent = () => {
    if (loading) {
      return <Loader text={`Loading ${selectedMetric} analytics...`} />;
    }

    switch (selectedMetric) {
      case 'proposal':
        return renderProposalAnalytics();
      case 'voter':
        return renderVoterAnalytics();
      case 'token':
        return renderTokenAnalytics();
      case 'timelock':
        return renderTimelockAnalytics();
      case 'health':
        return renderHealthScore();
      default:
        return <div>Select a metric to view analytics</div>;
    }
  };

  const renderProposalAnalytics = () => {
    const data = analyticsData.proposals;
    if (!data) return <div>No proposal data available</div>;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Proposal Overview</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Total Proposals:</div>
            <div className="font-bold text-right">{data.totalProposals}</div>
            <div>Active:</div>
            <div className="font-bold text-right">{data.activeProposals}</div>
            <div>Succeeded:</div>
            <div className="font-bold text-right">{data.succeededProposals}</div>
            <div>Executed:</div>
            <div className="font-bold text-right">{data.executedProposals}</div>
            <div>Defeated:</div>
            <div className="font-bold text-right">{data.defeatedProposals}</div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Proposal Types</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>General:</div>
            <div className="font-bold text-right">{data.generalProposals}</div>
            <div>Governance:</div>
            <div className="font-bold text-right">{data.governanceChangeProposals}</div>
            <div>Treasury:</div>
            <div className="font-bold text-right">{data.withdrawalProposals}</div>
            <div>Token:</div>
            <div className="font-bold text-right">{data.tokenTransferProposals + data.tokenMintProposals + data.tokenBurnProposals}</div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Success Rates</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>General:</div>
            <div className="font-bold text-right">{formatPercentage(data.generalSuccessRate / 100)}</div>
            <div>Governance:</div>
            <div className="font-bold text-right">{formatPercentage(data.governanceChangeSuccessRate / 100)}</div>
            <div>Treasury:</div>
            <div className="font-bold text-right">{formatPercentage(data.withdrawalSuccessRate / 100)}</div>
            <div>Token:</div>
            <div className="font-bold text-right">{formatPercentage((data.tokenTransferSuccessRate + data.tokenMintSuccessRate) / 200)}</div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow col-span-1 md:col-span-2 lg:col-span-3">
          <h3 className="text-lg font-medium mb-2">Key Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-sm text-gray-500">Avg. Voting Turnout</div>
              <div className="text-2xl font-bold">{formatPercentage(data.avgVotingTurnout / 100)}</div>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-sm text-gray-500">Avg. Proposal Lifetime</div>
              <div className="text-2xl font-bold">{Math.floor(data.avgProposalLifetime / 86400)} days</div>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-sm text-gray-500">Execution Rate</div>
              <div className="text-2xl font-bold">
                {data.totalProposals > 0 
                  ? formatPercentage((data.executedProposals / data.totalProposals) * 100) 
                  : '0%'}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderVoterAnalytics = () => {
    const data = analyticsData.voters;
    if (!data) return <div>No voter data available</div>;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Voter Participation</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Total Voters:</div>
            <div className="font-bold text-right">{data.totalVoters}</div>
            <div>Active Voters:</div>
            <div className="font-bold text-right">{data.activeVoters}</div>
            <div>Super Active Voters:</div>
            <div className="font-bold text-right">{data.superActiveVoters}</div>
            <div>Participation Rate:</div>
            <div className="font-bold text-right">
              {data.totalVoters > 0 
                ? formatPercentage((data.activeVoters / data.totalVoters) * 100) 
                : '0%'}
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Voting Patterns</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Yes-leaning Voters:</div>
            <div className="font-bold text-right">{data.yesLeaning}</div>
            <div>No-leaning Voters:</div>
            <div className="font-bold text-right">{data.noLeaning}</div>
            <div>Balanced Voters:</div>
            <div className="font-bold text-right">{data.balanced}</div>
            <div>Consistent Voters:</div>
            <div className="font-bold text-right">{data.consistentVoters}</div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Delegation</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Delegators:</div>
            <div className="font-bold text-right">{data.delegatorCount}</div>
            <div>Delegates:</div>
            <div className="font-bold text-right">{data.delegateCount}</div>
            <div>Avg. Chain Length:</div>
            <div className="font-bold text-right">{data.avgDelegationChainLength}</div>
            <div>Delegation Rate:</div>
            <div className="font-bold text-right">
              {data.totalVoters > 0 
                ? formatPercentage((data.delegatorCount / data.totalVoters) * 100) 
                : '0%'}
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Top Voters</h3>
          {data.voters && data.voters.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500">
                    <th className="p-2">Address</th>
                    <th className="p-2">Votes</th>
                    <th className="p-2">Yes %</th>
                    <th className="p-2">No %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.voters.slice(0, 5).map((voter, index) => {
                    const totalVotes = data.voteCounts[index] || 0;
                    const yesPercent = totalVotes > 0 ? (data.yesCounts[index] / totalVotes) * 100 : 0;
                    const noPercent = totalVotes > 0 ? (data.noCounts[index] / totalVotes) * 100 : 0;
                    
                    return (
                      <tr key={voter} className="border-t">
                        <td className="p-2 font-mono text-xs">
                          {voter.substring(0, 6)}...{voter.substring(voter.length - 4)}
                        </td>
                        <td className="p-2">{data.voteCounts[index] || 0}</td>
                        <td className="p-2">{formatPercentage(yesPercent)}</td>
                        <td className="p-2">{formatPercentage(noPercent)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No voter data available</p>
          )}
        </div>
      </div>
    );
  };

  const renderTokenAnalytics = () => {
    const data = analyticsData.tokens;
    if (!data) return <div>No token data available</div>;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Token Supply</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Total Supply:</div>
            <div className="font-bold text-right">{formatBigNumber(data.totalSupply)}</div>
            <div>Circulating Supply:</div>
            <div className="font-bold text-right">{formatBigNumber(data.circulatingSupply || data.totalSupply)}</div>
            <div>Treasury Balance:</div>
            <div className="font-bold text-right">{formatBigNumber(data.treasuryBalance || 0)}</div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Distribution</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Small Holders:</div>
            <div className="font-bold text-right">{data.smallHolderCount || 0}</div>
            <div>Medium Holders:</div>
            <div className="font-bold text-right">{data.mediumHolderCount || 0}</div>
            <div>Large Holders:</div>
            <div className="font-bold text-right">{data.largeHolderCount || 0}</div>
            <div>Top 10 Concentration:</div>
            <div className="font-bold text-right">
              {data.totalSupply && data.topTenHolderBalance
                ? formatPercentage((data.topTenHolderBalance / data.totalSupply) * 100)
                : 'N/A'}
            </div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Token Activity</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Active Tokens:</div>
            <div className="font-bold text-right">{formatBigNumber(data.activeTokens || 0)}</div>
            <div>Delegated Tokens:</div>
            <div className="font-bold text-right">{formatBigNumber(data.delegatedTokens || 0)}</div>
            <div>Active Rate:</div>
            <div className="font-bold text-right">
              {data.totalSupply && data.activeTokens
                ? formatPercentage((data.activeTokens / data.totalSupply) * 100)
                : '0%'}
            </div>
            <div>Delegation Rate:</div>
            <div className="font-bold text-right">
              {data.totalSupply && data.delegatedTokens
                ? formatPercentage((data.delegatedTokens / data.totalSupply) * 100)
                : '0%'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTimelockAnalytics = () => {
    const data = analyticsData.timelock;
    if (!data) return <div>No timelock data available</div>;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Transaction Status</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Total Transactions:</div>
            <div className="font-bold text-right">{data.totalTransactions}</div>
            <div>Executed:</div>
            <div className="font-bold text-right">{data.executedTransactions}</div>
            <div>Pending:</div>
            <div className="font-bold text-right">{data.pendingTransactions}</div>
            <div>Canceled:</div>
            <div className="font-bold text-right">{data.canceledTransactions}</div>
            <div>Expired:</div>
            <div className="font-bold text-right">{data.expiredTransactions}</div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Threat Levels</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Low Threat:</div>
            <div className="font-bold text-right">{data.lowThreatCount}</div>
            <div>Medium Threat:</div>
            <div className="font-bold text-right">{data.mediumThreatCount}</div>
            <div>High Threat:</div>
            <div className="font-bold text-right">{data.highThreatCount}</div>
            <div>Critical Threat:</div>
            <div className="font-bold text-right">{data.criticalThreatCount}</div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Average Delays</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Low Threat:</div>
            <div className="font-bold text-right">{Math.floor(data.avgLowThreatDelay / 3600)} hours</div>
            <div>Medium Threat:</div>
            <div className="font-bold text-right">{Math.floor(data.avgMediumThreatDelay / 3600)} hours</div>
            <div>High Threat:</div>
            <div className="font-bold text-right">{Math.floor(data.avgHighThreatDelay / 86400)} days</div>
            <div>Critical Threat:</div>
            <div className="font-bold text-right">{Math.floor(data.avgCriticalThreatDelay / 86400)} days</div>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Success Rates</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>Low Threat:</div>
            <div className="font-bold text-right">{formatPercentage(data.lowThreatSuccessRate / 100)}</div>
            <div>Medium Threat:</div>
            <div className="font-bold text-right">{formatPercentage(data.mediumThreatSuccessRate / 100)}</div>
            <div>High Threat:</div>
            <div className="font-bold text-right">{formatPercentage(data.highThreatSuccessRate / 100)}</div>
            <div>Critical Threat:</div>
            <div className="font-bold text-right">{formatPercentage(data.criticalThreatSuccessRate / 100)}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderHealthScore = () => {
    const data = analyticsData.health;
    if (!data) return <div>No health score data available</div>;

    const scoreCategoryClass = (score) => {
      if (score >= 80) return 'text-green-600';
      if (score >= 60) return 'text-yellow-600';
      if (score >= 40) return 'text-orange-600';
      return 'text-red-600';
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-lg shadow col-span-1 md:col-span-2">
          <h3 className="text-lg font-medium mb-4">Governance Health Score</h3>
          <div className="flex items-center justify-center mb-6">
            <div className="text-center">
              <div className={`text-6xl font-bold ${scoreCategoryClass(data.score)}`}>
                {data.score}
              </div>
              <div className="text-gray-500 mt-2">out of 100</div>
            </div>
          </div>
          
          {data.breakdown && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-gray-50 p-3 rounded text-center">
                <div className="text-sm text-gray-500">Participation</div>
                <div className={`text-xl font-bold ${scoreCategoryClass(data.breakdown[0] * 5)}`}>
                  {data.breakdown[0]}/20
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded text-center">
                <div className="text-sm text-gray-500">Delegation</div>
                <div className={`text-xl font-bold ${scoreCategoryClass(data.breakdown[1] * 5)}`}>
                  {data.breakdown[1]}/20
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded text-center">
                <div className="text-sm text-gray-500">Activity</div>
                <div className={`text-xl font-bold ${scoreCategoryClass(data.breakdown[2] * 5)}`}>
                  {data.breakdown[2]}/20
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded text-center">
                <div className="text-sm text-gray-500">Execution</div>
                <div className={`text-xl font-bold ${scoreCategoryClass(data.breakdown[3] * 5)}`}>
                  {data.breakdown[3]}/20
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded text-center">
                <div className="text-sm text-gray-500">Risk Balance</div>
                <div className={`text-xl font-bold ${scoreCategoryClass(data.breakdown[4] * 5)}`}>
                  {data.breakdown[4]}/20
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Interpretation</h3>
          <p className="text-gray-700 mb-4">
            {data.score >= 80 && "Your DAO governance is in excellent health with strong participation and balanced decision-making."}
            {data.score >= 60 && data.score < 80 && "Your DAO governance is functioning well, though there's room for improvement in some areas."}
            {data.score >= 40 && data.score < 60 && "Your DAO governance needs attention in several key areas to improve effectiveness."}
            {data.score < 40 && "Your DAO governance is struggling and requires significant improvements across multiple dimensions."}
          </p>
          
          <h4 className="font-medium mt-4">Recommendations</h4>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-700">
            {data.breakdown && data.breakdown[0] < 10 && (
              <li>Increase voter participation by improving proposal visibility or incentives</li>
            )}
            {data.breakdown && data.breakdown[1] < 10 && (
              <li>Consider delegation education to encourage more balanced token delegation</li>
            )}
            {data.breakdown && data.breakdown[2] < 10 && (
              <li>Diversify proposal types to address more aspects of governance</li>
            )}
            {data.breakdown && data.breakdown[3] < 10 && (
              <li>Review execution processes to improve successful implementation of proposals</li>
            )}
            {data.breakdown && data.breakdown[4] < 10 && (
              <li>Balance risk levels in timelock transactions for better security management</li>
            )}
          </ul>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-medium mb-2">Score Breakdown</h3>
          <p className="text-gray-700 mb-4">
            The governance health score is calculated based on five key dimensions:
          </p>
          
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Participation (20%):</span> Measures voter turnout and engagement
            </div>
            <div>
              <span className="font-medium">Delegation (20%):</span> Evaluates delegation patterns and concentration
            </div>
            <div>
              <span className="font-medium">Activity (20%):</span> Assesses proposal variety and frequency
            </div>
            <div>
              <span className="font-medium">Execution (20%):</span> Tracks successful implementation of proposals
            </div>
            <div>
              <span className="font-medium">Risk Balance (20%):</span> Examines distribution of transaction risk levels
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-6">DAO Governance Analytics</h2>
      {renderMetricButtons()}
      {renderContent()}
    </div>
  );
};

export default AnalyticsTab;