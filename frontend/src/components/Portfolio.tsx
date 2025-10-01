// frontend/src/components/Portfolio.tsx
import React from 'react';
import './Portfolio.css';

interface Holding {
  symbol: string;
  amount: number;
  averagePrice: number;
  currentPrice: number;
  value: number;
  profit: number;
  profitPercent: number;
}

interface PortfolioProps {
  holdings: Holding[];
  totalValue: number;
  totalCost: number;
  totalProfit: number;
  totalProfitPercent: number;
}

const Portfolio: React.FC<PortfolioProps> = ({ 
  holdings, 
  totalValue, 
  totalCost, 
  totalProfit, 
  totalProfitPercent 
}) => {
  return (
    <div className="portfolio-section">
      <h2>💼 My Portfolio</h2>
      
      <div className="portfolio-summary">
        <div className="summary-card">
          <span className="label">Total Value</span>
          <span className="value">${totalValue.toFixed(2)}</span>
        </div>
        <div className="summary-card">
          <span className="label">Total Cost</span>
          <span className="value">${totalCost.toFixed(2)}</span>
        </div>
        <div className="summary-card">
          <span className="label">Total P/L</span>
          <span className={`value ${totalProfit >= 0 ? 'positive' : 'negative'}`}>
            ${totalProfit.toFixed(2)} ({totalProfitPercent.toFixed(2)}%)
          </span>
        </div>
      </div>
      
      <div className="holdings-table">
        <div className="table-header">
          <span>Token</span>
          <span>Amount</span>
          <span>Avg Price</span>
          <span>Current</span>
          <span>Value</span>
          <span>P/L</span>
        </div>
        {holdings.map((holding) => (
          <div key={holding.symbol} className="table-row">
            <span className="symbol">{holding.symbol}</span>
            <span>{holding.amount}</span>
            <span>${holding.averagePrice.toFixed(4)}</span>
            <span>${holding.currentPrice.toFixed(4)}</span>
            <span>${holding.value.toFixed(2)}</span>
            <span className={holding.profit >= 0 ? 'positive' : 'negative'}>
              {holding.profit >= 0 ? '+' : ''}{holding.profitPercent.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Portfolio;