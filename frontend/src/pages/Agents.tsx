// frontend/src/pages/Agents.tsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import PriceChart from '../components/PriceChart';

interface Agent {
  _id: string;
  name: string;
  symbol: string;
  address: string;
  priceData: {
    current: number;
    change24h: number;
    lastUpdated: string;
  };
  priceHistory?: Array<{
    price: number;
    timestamp: string;
    change24h: number;
  }>;
  tradingStats?: {
    volume24h: number;
    liquidity: number;
    marketCap: number;
  };
}

const Agents: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  useEffect(() => {
    fetchAgents();
    
    const socket = io('http://localhost:3000');
    
    socket.on('agents', (data: Agent[]) => {
      setAgents(data);
      setLoading(false);
    });
    
    socket.on('priceUpdate', (data: Agent[]) => {
      setAgents(data);
    });
    
    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchAgents = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/agents');
      setAgents(response.data.filter((a: Agent) => a.symbol !== 'TEST'));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  return (
    <div className="agents-page">
      <div className="page-header">
        <h1>AI Agents</h1>
      </div>

      {selectedAgent && selectedAgent.priceHistory && (
        <div className="chart-section">
          <PriceChart 
            data={selectedAgent.priceHistory} 
            symbol={selectedAgent.symbol}
          />
          <button 
            className="close-chart"
            onClick={() => setSelectedAgent(null)}
          >
            ✕ Close Chart
          </button>
        </div>
      )}
      
      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="agents-grid">
          {agents.map((agent) => (
            <div 
              key={agent._id} 
              className="agent-card"
              onClick={() => setSelectedAgent(agent)}
              style={{ cursor: 'pointer' }}
            >
              <div className="agent-header">
                <h2>{agent.name}</h2>
                <span className="symbol">{agent.symbol}</span>
              </div>
              
              <div className="price-section">
                <p className="price">
                  ${agent.priceData.current < 0.01 
                    ? agent.priceData.current?.toFixed(6) 
                    : agent.priceData.current?.toFixed(4)}
                </p>
                <p className={`change ${agent.priceData.change24h > 0 ? 'positive' : 'negative'}`}>
                  {agent.priceData.change24h > 0 ? '📈' : '📉'} 
                  {agent.priceData.change24h?.toFixed(2)}%
                </p>
              </div>
              
              {agent.tradingStats && (
                <div className="stats">
                  <div className="stat">
                    <span>Volume</span>
                    <span>${(agent.tradingStats.volume24h / 1000).toFixed(2)}K</span>
                  </div>
                  <div className="stat">
                    <span>Liquidity</span>
                    <span>${(agent.tradingStats.liquidity / 1000).toFixed(2)}K</span>
                  </div>
                </div>
              )}
              
              <div className="click-hint">Click to view chart</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Agents;