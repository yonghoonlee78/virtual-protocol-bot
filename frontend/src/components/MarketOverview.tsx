// frontend/src/components/MarketOverview.tsx
import React from 'react';
import './MarketOverview.css';

interface MarketStats {
  totalMarketCap: number;
  volume24h: number;
  activeAgents: number;
  totalUsers: number;
  marketCapChange: number;
  volumeChange: number;
}

interface MarketOverviewProps {
  stats: MarketStats;
}

const MarketOverview: React.FC<MarketOverviewProps> = ({ stats }) => {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toFixed(0)}`;
  };

  return (
    <div className="market-overview">
      <h2>Market Overview</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Total Market Cap</div>
          <div className="stat-value">{formatNumber(stats.totalMarketCap)}</div>
          <div className={`stat-change ${stats.marketCapChange >= 0 ? 'positive' : 'negative'}`}>
            {stats.marketCapChange >= 0 ? '+' : ''}{stats.marketCapChange.toFixed(2)}%
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">24h Volume</div>
          <div className="stat-value">{formatNumber(stats.volume24h)}</div>
          <div className={`stat-change ${stats.volumeChange >= 0 ? 'positive' : 'negative'}`}>
            {stats.volumeChange >= 0 ? '+' : ''}{stats.volumeChange.toFixed(2)}%
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Active Agents</div>
          <div className="stat-value">{stats.activeAgents}</div>
          <div className="stat-change positive">+5</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">Total Users</div>
          <div className="stat-value">{stats.totalUsers.toLocaleString()}</div>
          <div className="stat-change positive">+234</div>
        </div>
      </div>
    </div>
  );
};

export default MarketOverview;