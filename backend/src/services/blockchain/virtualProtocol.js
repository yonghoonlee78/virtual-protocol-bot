// backend/src/services/blockchain/virtualProtocol.js
const { ethers } = require('ethers');
const BaseProvider = require('./baseProvider');

// Virtual Protocol 토큰 주소들 (Base 체인)
const ADDRESSES = {
  VIRTUAL: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
  AIXBT: '0x4f9fd6be4a90f2620860d680c0d4d5fb53d1a825',
  LUNA: '0x55cd6469f597452b5a7536e2cd98fde4c1247ee4',
  VADER: '0x731814e491571A2e9eE3c5b1F7f3b962eE8f4870',
  GAME: '0x1c4cca7c5db003824208adda61bd749e55f463a3'
};

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];

class VirtualProtocolService {
  constructor() {
    const baseProvider = new BaseProvider();
    this.provider = baseProvider.getProvider();
  }

  async getTokenInfo(tokenAddress) {
    try {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
        contract.totalSupply()
      ]);

      return {
        address: tokenAddress,
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: ethers.formatUnits(totalSupply, decimals)
      };
    } catch (error) {
      console.error('Error fetching token info:', error);
      throw error;
    }
  }

  async getAllAgentTokens() {
    const tokens = [];
    for (const [key, address] of Object.entries(ADDRESSES)) {
      try {
        const info = await this.getTokenInfo(address);
        tokens.push({
          ...info,
          key
        });
      } catch (error) {
        console.error(`Error fetching ${key}:`, error.message);
      }
    }
    return tokens;
  }

  async getTokenBalance(tokenAddress, walletAddress) {
    try {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      const balance = await contract.balanceOf(walletAddress);
      const decimals = await contract.decimals();
      
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error fetching token balance:', error);
      throw error;
    }
  }
}

module.exports = VirtualProtocolService;