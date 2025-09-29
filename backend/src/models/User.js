// backend/src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // 플랫폼별 식별자
  telegramId: { type: String, sparse: true, unique: true },
  walletAddress: { type: String, sparse: true },
  
  profile: {
    username: String,
    firstName: String,
    lastName: String,
    language: { type: String, default: 'en' }
  },
  
  // 설정
  settings: {
    notifications: {
      priceAlerts: { type: Boolean, default: true },
      newAgents: { type: Boolean, default: true },
      threshold: { type: Number, default: 10 }
    }
  },
  
  // 워치리스트
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