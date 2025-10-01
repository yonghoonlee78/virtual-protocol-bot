// backend/src/services/priceService.js
const axios = require('axios');
const Agent = require('../models/Agent');

class PriceService {
  constructor(io = null) {
    this.baseUrl = 'https://api.dexscreener.com/latest/dex';
    this.io = io; // Socket.IO 인스턴스
  }

  async updateAllPrices() {
    console.log('💰 Updating prices...');
    const agents = await Agent.find();
    
    for (const agent of agents) {
      try {
        // DexScreener API 호출
        const response = await axios.get(
          `${this.baseUrl}/tokens/${agent.address}`
        );
        
        if (response.data && response.data.pairs && response.data.pairs.length > 0) {
          // Base 체인 페어 찾기
          const basePair = response.data.pairs.find(
            pair => pair.chainId === 'base'
          );
          
          if (basePair) {
            await Agent.findOneAndUpdate(
              { _id: agent._id },
              {
                'priceData.current': parseFloat(basePair.priceUsd || 0),
                'priceData.change24h': basePair.priceChange?.h24 || 0,
                'priceData.lastUpdated': new Date(),
                'tradingStats.volume24h': parseFloat(basePair.volume?.h24 || 0),
                'tradingStats.liquidity': parseFloat(basePair.liquidity?.usd || 0),
                'tradingStats.marketCap': parseFloat(basePair.fdv || 0),
                $push: {
                  priceHistory: {
                    $each: [{
                      price: parseFloat(basePair.priceUsd || 0),
                      timestamp: new Date(),
                      change24h: basePair.priceChange?.h24 || 0
                    }],
                    $slice: -100  // 최근 100개만 유지
                  }
                }
              },
              { new: true }
            );
            
            console.log(`✅ Updated ${agent.symbol}: $${basePair.priceUsd}`);
          }
        }
      } catch (error) {
        console.error(`Error updating ${agent.symbol}:`, error.message);
      }
      
      // Rate limit 방지 (1초 대기)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.io) {
      const updatedAgents = await Agent.find({ symbol: { $ne: 'TEST' } });
      this.io.emit('priceUpdate', updatedAgents);
      console.log('📡 Broadcasting price update via WebSocket');
    }
    
    console.log('✅ Price update complete');
  }
}

module.exports = PriceService;