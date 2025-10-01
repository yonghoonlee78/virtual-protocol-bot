// frontend/src/components/PriceChart.tsx
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface PriceData {
  price: number;
  timestamp: string;
  change24h: number;
}

interface PriceChartProps {
  data: PriceData[];
  symbol: string;
}

const PriceChart: React.FC<PriceChartProps> = ({ data, symbol }) => {
  const formattedData = data.map(item => ({
    time: new Date(item.timestamp).toLocaleTimeString(),
    price: item.price,
    change: item.change24h
  }));

  return (
    <div className="chart-container">
      <h3>{symbol} Price History</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="time"
            tick={{ fontSize: 12 }}
          />
          <YAxis 
            yAxisId="left"
            tick={{ fontSize: 12 }}
            domain={['dataMin', 'dataMax']}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12 }}
          />
          <Tooltip />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="price"
            stroke="#8884d8"
            strokeWidth={2}
            dot={false}
            name="Price ($)"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="change"
            stroke="#82ca9d"
            strokeWidth={2}
            dot={false}
            name="24h Change (%)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PriceChart;