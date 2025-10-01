// backend/src/services/blockchain/baseProvider.js
const { ethers } = require('ethers');

class BaseProvider {
  constructor() {
    // 여러 RPC URL 중 하나 선택
    const rpcUrls = [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base-mainnet.public.blastapi.io',
      'https://developer-access-mainnet.base.org'
    ];
    
    this.rpcUrl = process.env.BASE_RPC_URL || rpcUrls[0];
    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this.chainId = 8453;
  }

  async getBlockNumber() {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      console.log(`Current Base block: ${blockNumber}`);
      return blockNumber;
    } catch (error) {
      console.error('Error getting block number:', error);
      throw error;
    }
  }

  getProvider() {
    return this.provider;
  }
}

module.exports = BaseProvider;