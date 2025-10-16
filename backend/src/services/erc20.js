// backend/src/services/erc20.js
const { ethers } = require('ethers');

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)'
];

class ERC20 {
  constructor(address, providerOrSigner) {
    this.address = address;
    this.contract = new ethers.Contract(address, ERC20_ABI, providerOrSigner);
  }
  async decimals() { return await this.contract.decimals(); }
  async symbol() { return await this.contract.symbol(); }
  async name() { return await this.contract.name(); }
  async balanceOf(owner) { return await this.contract.balanceOf(owner); }
  async allowance(owner, spender) { return await this.contract.allowance(owner, spender); }
  async approve(spender, value, signer) {
    const c = this.contract.connect(signer);
    const tx = await c.approve(spender, value);
    return await tx.wait();
  }
}

module.exports = { ERC20, ERC20_ABI };
