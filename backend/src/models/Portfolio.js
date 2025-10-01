// backend/src/models/Portfolio.js
const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  holdings: [{
    agentAddress: String,
    symbol: String,
    amount: Number,
    averagePrice: Number,  // 평균 매수가
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  totalValue: {
    type: Number,
    default: 0
  },
  totalCost: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// 포트폴리오 가치 계산
portfolioSchema.methods.calculateValue = async function() {
  const Agent = mongoose.model('Agent');
  let totalValue = 0;
  let totalCost = 0;
  
  for (const holding of this.holdings) {
    const agent = await Agent.findOne({ address: holding.agentAddress });
    if (agent && agent.priceData.current) {
      totalValue += holding.amount * agent.priceData.current;
      totalCost += holding.amount * holding.averagePrice;
    }
  }
  
  this.totalValue = totalValue;
  this.totalCost = totalCost;
  this.lastUpdated = new Date();
  
  return {
    totalValue,
    totalCost,
    profit: totalValue - totalCost,
    profitPercent: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0
  };
};

module.exports = mongoose.model('Portfolio', portfolioSchema);