// backend/src/services/blockchain/virtualProtocol.js
// Base 체인용 Virtual Protocol 보조 유틸 (안전 호출 포함)
const { ethers } = require('ethers');
const BaseProvider = require('./baseProvider');

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)'
];

async function safeCall(promise, fallback = null) {
  try {
    return await promise;
  } catch (_) {
    return fallback;
  }
}

class VirtualProtocolService {
  constructor() {
    this.base = new BaseProvider();
    this.provider = this.base.getProvider();
  }

  getProvider() {
    return this.provider;
  }

  getErc20(address) {
    return new ethers.Contract(address, ERC20_ABI, this.provider);
  }

  async isContract(address) {
    try {
      const code = await this.provider.getCode(address);
      return !!code && code !== '0x';
    } catch {
      return false;
    }
  }

  /** 비 ERC-20 또는 리턴 실패여도 기본값으로 반환, 상위에서 스킵 가능 */
  async getTokenInfo(address) {
    const isC = await this.isContract(address);
    if (!isC) {
      throw new Error(`No contract at ${address}`);
    }
    const erc = this.getErc20(address);

    const [name, symbol, decimals, totalSupply] = await Promise.all([
      safeCall(erc.name(), 'Unknown'),
      safeCall(erc.symbol(), 'UNK'),
      safeCall(erc.decimals(), 18),
      safeCall(erc.totalSupply(), null)
    ]);

    // 일부 컨트랙트는 name/symbol을 bytes32로 반환 → 문자열화 실패시 기본값
    return {
      address,
      name: (typeof name === 'string' && name) ? name : 'Unknown',
      symbol: (typeof symbol === 'string' && symbol) ? symbol : 'UNK',
      decimals: Number(decimals || 18),
      totalSupply: totalSupply // null일 수 있음
    };
  }

  async getTokenDecimals(address) {
    const erc = this.getErc20(address);
    const d = await safeCall(erc.decimals(), 18);
    return Number(d || 18);
  }

  async getTokenSymbol(address) {
    const erc = this.getErc20(address);
    const s = await safeCall(erc.symbol(), 'UNK');
    return s || 'UNK';
  }

  async getTokenName(address) {
    const erc = this.getErc20(address);
    const n = await safeCall(erc.name(), 'Unknown');
    return n || 'Unknown';
  }

  async getTokenBalance(tokenAddress, walletAddress) {
    const [isC, decimals] = await Promise.all([
      this.isContract(tokenAddress),
      this.getTokenDecimals(tokenAddress).catch(() => 18)
    ]);
    if (!isC) return 0;

    const erc = this.getErc20(tokenAddress);
    const bal = await safeCall(erc.balanceOf(walletAddress), 0n);
    try {
      return Number(ethers.formatUnits(bal, decimals));
    } catch {
      // decimals가 말이 안 되거나 bal이 0n이 아닌데 포맷 실패 → 0 처리
      return 0;
    }
  }
}

module.exports = VirtualProtocolService;
