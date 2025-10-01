// frontend/src/pages/Dashboard.tsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import MarketOverview from '../components/MarketOverview';
import TopMovers from '../components/TopMovers';

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

const Dashboard: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  const [marketStats, setMarketStats] = useState({
    totalMarketCap: 0,
    volume24h: 0,
    activeAgents: 0,
    totalUsers: 12456,
    marketCapChange: 0,
    volumeChange: 0
  });

  useEffect(() => {
    fetchAgents();
    
    const socket = io('http://localhost:3000');
    
    socket.on('connect', () => {
      console.log('Connected to server');
    });
    
    socket.on('agents', (data: Agent[]) => {
      setAgents(data);
      setLoading(false);
    });
    
    socket.on('priceUpdate', (data: Agent[]) => {
      console.log('Price update received');
      setAgents(data);
      setLastUpdate(new Date());
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

  useEffect(() => {
    if (agents.length > 0) {
      const totalMarketCap = agents.reduce((sum, agent) => 
        sum + (agent.tradingStats?.marketCap || 0), 0
      );
      const totalVolume = agents.reduce((sum, agent) => 
        sum + (agent.tradingStats?.volume24h || 0), 0
      );
      const avgChange = agents.reduce((sum, agent) => 
        sum + (agent.priceData?.change24h || 0), 0
      ) / agents.length;

      setMarketStats({
        totalMarketCap,
        volume24h: totalVolume,
        activeAgents: agents.length,
        totalUsers: 12456,
        marketCapChange: avgChange,
        volumeChange: 8.7
      });
    }
  }, [agents]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="update-time">
          Last update: {lastUpdate.toLocaleTimeString()}
        </p>
      </div>
      
      <MarketOverview stats={marketStats} />
      <TopMovers agents={agents} />
    </div>
  );
};

export default Dashboard;