// backend/src/services/blockchain/baseProvider.js
const { ethers } = require('ethers');

function withTimeout(promise, ms = 4000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('rpc-timeout')), ms)),
  ]);
}

class BaseProvider {
  constructor() {
    const urls = (process.env.BASE_RPC_URLS || process.env.BASE_RPC_URL || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    this.urls = urls.length ? urls : [
      'https://base.llamarpc.com',
      'https://base-rpc.publicnode.com',
      'https://1rpc.io/base',
      'https://rpc.ankr.com/base',
    ];

    this.providers = this.urls.map(u => new ethers.JsonRpcProvider(u, 8453));
    this.index = 0; // round-robin pointer
  }

  _pick(offset = 0) {
    const idx = (this.index + offset) % this.providers.length;
    return this.providers[idx];
  }

  async _withFallback(fn) {
    let lastErr;
    for (let i = 0; i < this.providers.length; i++) {
      const p = this._pick(i);
      try {
        const ret = await withTimeout(fn(p));
        this.index = (this.index + i) % this.providers.length; // stick to healthy one
        return ret;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('All Base RPC endpoints failed');
  }

  getProvider() { return this._pick(0); } // for write/sendTransaction only

  async getBlockNumber() { return this._withFallback(p => p.getBlockNumber()); }

  async getCode(address) {
    try { address = ethers.getAddress(address); } catch (_) {}
    return this._withFallback(p => p.getCode(address));
  }

  async getBalance(address) {
    try { address = ethers.getAddress(address); } catch (_) {}
    return this._withFallback(p => p.getBalance(address));
  }

  async getFeeData() { return this._withFallback(p => p.getFeeData()); }
}

module.exports = BaseProvider;
