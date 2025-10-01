// frontend/src/pages/Portfolio.tsx
import React, { useState, useEffect } from 'react';
import PortfolioComponent from '../components/Portfolio';
import axios from 'axios';

const PortfolioPage: React.FC = () => {
  // 임시 데이터 (나중에 백엔드에서 가져올 것)
  const [portfolioData] = useState({
    holdings: [
      {
        symbol: 'VIRTUAL',
        amount: 100,
        averagePrice: 1.05,
        currentPrice: 1.041,
        value: 104.1,
        profit: -0.9,
        profitPercent: -0.86
      },
      {
        symbol: 'AIXBT',
        amount: 500,
        averagePrice: 0.09,
        currentPrice: 0.0896,
        value: 44.8,
        profit: -0.2,
        profitPercent: -0.44
      }
    ],
    totalValue: 148.9,
    totalCost: 150,
    totalProfit: -1.1,
    totalProfitPercent: -0.73
  });

  return (
    <div className="portfolio-page">
      <div className="page-header">
        <h1>Portfolio Management</h1>
      </div>
      <PortfolioComponent
        holdings={portfolioData.holdings}
        totalValue={portfolioData.totalValue}
        totalCost={portfolioData.totalCost}
        totalProfit={portfolioData.totalProfit}
        totalProfitPercent={portfolioData.totalProfitPercent}
      />
    </div>
  );
};

export default PortfolioPage;