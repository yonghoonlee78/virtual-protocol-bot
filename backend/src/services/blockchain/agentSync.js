// backend/src/services/blockchain/agentSync.js
const Agent = require('../../models/Agent');
const VirtualProtocolService = require('./virtualProtocol');

class AgentSyncService {
  constructor() {
    this.vp = new VirtualProtocolService();
  }

  /**
   * DB에 이미 존재하는 Agent들을 대상으로 체인에서 메타데이터(name/symbol/decimals/totalSupply)를 보강합니다.
   * - 주소가 없거나 잘못된 경우 스킵
   * - 읽기 실패/비 ERC-20이면 스킵하고 다음으로 진행
   */
  async syncAgentsFromBlockchain() {
    console.log('🔄 Starting blockchain sync...');
    const agents = await Agent.find({}).lean();

    if (!agents || agents.length === 0) {
      console.log('ℹ️ No agents found in DB. (Seed or import first)');
      return;
    }

    for (const a of agents) {
      const symbol = a.symbol || 'UNKNOWN';
      const address = a.address;
      if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        console.warn(`Skipping ${symbol}: invalid or empty address`);
        continue;
      }

      try {
        const info = await this.vp.getTokenInfo(address);

        // 비 ERC-20 처리: getTokenInfo()에서 throw → catch되어 스킵
        if (!info) {
          console.warn(`Skipping ${symbol}: no info`);
          continue;
        }

        // decimals/이름/심볼 정규화
        const update = {
          name: info.name,
          symbol: a.symbol || info.symbol || 'UNK',
          address: info.address,
          decimals: info.decimals,
          totalSupply: info.totalSupply || a.totalSupply || null,
          // priceData/tradingStats 등은 별도 PriceService가 관리하므로 여기서는 손대지 않음
          updatedAt: new Date()
        };

        await Agent.updateOne({ _id: a._id }, { $set: update });
        console.log(`✅ Synced ${symbol}`);
      } catch (e) {
        console.warn(`Error syncing ${symbol}: ${e.message}`);
        // 계속 진행
      }
    }

    console.log('✅ Blockchain sync complete');
  }
}

module.exports = AgentSyncService;
