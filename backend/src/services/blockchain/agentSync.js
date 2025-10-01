// backend/src/services/blockchain/agentSync.js
const Agent = require('../../models/Agent');
const VirtualProtocolService = require('./virtualProtocol');

class AgentSyncService {
  constructor() {
    this.vpService = new VirtualProtocolService();
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async syncAgentsFromBlockchain() {
    console.log('🔄 Starting blockchain sync...');
    
    const tokenList = [
      { key: 'VIRTUAL', address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b' },
      { key: 'AIXBT', address: '0x4f9fd6be4a90f2620860d680c0d4d5fb53d1a825' },
      { key: 'LUNA', address: '0x55cd6469f597452b5a7536e2cd98fde4c1247ee4' },
      { key: 'VADER', address: '0x731814e491571A2e9eE3c5b1F7f3b962eE8f4870' },
      { key: 'GAME', address: '0x1c4cca7c5db003824208adda61bd749e55f463a3' }
    ];
    
    for (const token of tokenList) {
      try {
        // 각 토큰 사이에 1초 딜레이
        await this.sleep(1000);
        
        const info = await this.vpService.getTokenInfo(token.address);
        
        await Agent.findOneAndUpdate(
          { address: token.address },
          {
            address: token.address,
            name: info.name,
            symbol: info.symbol,
            metadata: {
              decimals: info.decimals,
              totalSupply: info.totalSupply,
              blockchain: 'Base',
              source: 'Virtual Protocol'
            },
            priceData: {
              lastUpdated: new Date()
            }
          },
          { upsert: true, new: true }
        );
        
        console.log(`✅ Synced ${token.key}`);
      } catch (error) {
        console.error(`Error syncing ${token.key}:`, error.message);
      }
    }
    
    console.log('✅ Blockchain sync complete');
  }
}

module.exports = AgentSyncService;