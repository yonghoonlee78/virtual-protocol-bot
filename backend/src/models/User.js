// backend/src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // 플랫폼별 식별자 (기존 유지)
  telegramId: { type: String, sparse: true, unique: true },
  walletAddress: { type: String, sparse: true },  // 기존 유지
  
  profile: {
    username: String,
    firstName: String,
    lastName: String,
    language: { type: String, default: 'en' }
  },
  

    // Vaibot 지갑 (자동 생성)
    wallet: {
      address: String,
      encryptedPrivateKey: String,  // 암호화된 프라이빗 키
      createdAt: Date,
      balance: {
        eth:   { type: Number, default: 0 },
        usdt:  { type: Number, default: 0 },
        virtual:{ type: Number, default: 0 }
      }
    },
    
  // 설정 (확장)
  settings: {
    notifications: {
      enabled: { type: Boolean, default: true },  // 추가
      priceAlerts: { type: Boolean, default: true },
      newAgents: { type: Boolean, default: true },
      tradeConfirmations: { type: Boolean, default: true },  // 추가
      threshold: { type: Number, default: 10 }
    }
  },
  
  // 스나이핑 설정 (새로 추가)
  snipeSettings: {
    enabled: { type: Boolean, default: false },
    maxBuy: { type: Number, default: 0.1 },
    slippage: { type: Number, default: 15 },
    autoSellPercent: { type: Number, default: 50 },
    strategies: [{
      type: String,
      enum: ['new', 'pump', 'volume', 'gem']
    }]
  },
  
  // 거래 설정 (새로 추가)
  tradeSettings: {
    defaultBuyAmount: { type: Number, default: 0.05 },
    confirmRequired: { type: Boolean, default: true },
    gasPreset: { 
      type: String, 
      enum: ['slow', 'normal', 'fast'], 
      default: 'normal' 
    }
  },
  
  // 워치리스트 (기존 유지)
  watchlist: [{
    agentAddress: String,
    addedAt: Date,
    priceAlert: Number
  }],
  
  lastActive: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);