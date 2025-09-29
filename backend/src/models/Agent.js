// backend/src/models/Agent.js
const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  // 기본 정보
  address: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  name: String,
  symbol: String,
  createdAt: Date,
  creator: String,
  
  // 동적 메타데이터
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // 가격 정보
  priceData: {
    current: Number,
    currency: { type: String, default: 'USD' },
    change24h: Number,
    change7d: Number,
    lastUpdated: { type: Date, default: Date.now }
  },
  
  // 거래 통계
  tradingStats: {
    volume24h: Number,
    trades24h: Number,
    holders: Number,
    liquidity: Number,
    marketCap: Number
  }
}, {
  timestamps: true
});

// 가상 필드 - 트렌딩 점수
agentSchema.virtual('trending').get(function() {
  const priceWeight = (this.priceData.change24h || 0) * 0.3;
  const volumeWeight = ((this.tradingStats.volume24h || 0) / 1000000) * 0.3;
  return priceWeight + volumeWeight;
});

module.exports = mongoose.model('Agent', agentSchema);