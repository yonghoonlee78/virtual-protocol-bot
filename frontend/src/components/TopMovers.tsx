// frontend/src/components/TopMovers.tsx
import React from 'react';
import './TopMovers.css';

interface Agent {
  _id: string;
  name: string;
  symbol: string;
  priceData: {
    current: number;
    change24h: number;
  };
  tradingStats?: {
    volume24h: number;
  };
}

interface TopMoversProps {
  agents: Agent[];
}

const TopMovers: React.FC<TopMoversProps> = ({ agents }) => {
  // Top Gainers 계산 (상승률 기준 상위 3개)
  const topGainers = [...agents]
    .sort((a, b) => (b.priceData?.change24h || 0) - (a.priceData?.change24h || 0))
    .slice(0, 3);

  // Most Active 계산 (거래량 기준 상위 3개)
  const mostActive = [...agents]
    .sort((a, b) => (b.tradingStats?.volume24h || 0) - (a.tradingStats?.volume24h || 0))
    .slice(0, 3);

  const formatPrice = (price: number) => {
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(2)}`;
  };

  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `$${(volume / 1000000).toFixed(2)}M`;
    if (volume >= 1000) return `$${(volume / 1000).toFixed(1)}K`;
    return `$${volume.toFixed(0)}`;
  };

  return (
    <div className="top-movers">
      <div className="movers-section">
        <h3>🚀 Top Gainers</h3>
        <div className="movers-list">
          {topGainers.map((agent, index) => (
            <div key={agent._id} className="mover-item">
              <div className="mover-rank">{index + 1}</div>
              <div className="mover-info">
                <div className="mover-name">{agent.name}</div>
                <div className="mover-symbol">{agent.symbol}</div>
              </div>
              <div className="mover-data">
                <div className="mover-price">{formatPrice(agent.priceData.current)}</div>
                <div className="mover-change positive">
                  +{agent.priceData.change24h?.toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="movers-section">
        <h3>🔥 Most Active</h3>
        <div className="movers-list">
          {mostActive.map((agent, index) => (
            <div key={agent._id} className="mover-item">
              <div className="mover-rank">{index + 1}</div>
              <div className="mover-info">
                <div className="mover-name">{agent.name}</div>
                <div className="mover-volume">
                  Vol: {formatVolume(agent.tradingStats?.volume24h || 0)}
                </div>
              </div>
              <div className="mover-data">
                <div className="mover-price">{formatPrice(agent.priceData.current)}</div>
                <div className={`mover-change ${agent.priceData.change24h > 0 ? 'positive' : 'negative'}`}>
                  {agent.priceData.change24h > 0 ? '+' : ''}{agent.priceData.change24h?.toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TopMovers;