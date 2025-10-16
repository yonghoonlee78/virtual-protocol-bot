// backend/src/services/trading/adapters/openoceanAdapter.js
const axios = require('axios');
const { ethers } = require('ethers');

class OpenOceanAdapter {
  constructor(baseProvider) {
    this.base = baseProvider; // ★ BaseProvider
    this.baseUrl = process.env.OPENOCEAN_BASE_URL || 'https://open-api.openocean.finance/v4';
    this.chain = 'base';
  }

  async quote({ sellToken, buyToken, sellAmount, taker, slippageBps }) {
    const fee = await this.base.getFeeData(); // ★ 폴백
    const slippagePct = Math.max(slippageBps ?? 100, 10) / 100;

    const params = {
      chain: this.chain,
      inTokenAddress: sellToken,
      outTokenAddress: buyToken,
      amount: sellAmount.toString(),
      slippage: slippagePct,
      gasPrice: (fee.gasPrice || 0n).toString(),
      account: taker
    };

    let data;
    try {
      const { data: res } = await axios.get(`${this.baseUrl}/${this.chain}/swap_quote`, { params });
      data = res?.data;
      if (!data?.to || !data?.data) throw new Error('OpenOcean: invalid swap_quote response');
    } catch (e) {
      const s = e?.response?.status;
      if (s === 404 || s === 400) throw new Error('OpenOcean: no route for this pair/amount.');
      throw new Error(e?.response?.data?.message || e.message);
    }

    return {
      to: data.to,
      data: data.data,
      value: data.value ? ethers.toBigInt(data.value) : 0n,
      gas: data.estimatedGas ?? undefined,
      allowanceTarget: data.approveSpender || data.to,
      sellAmount: ethers.toBigInt(params.amount),
      buyAmount: data.outAmount ? ethers.toBigInt(data.outAmount) : 0n,
      price: data.price,
      guaranteedPrice: data.minOutAmount
        ? (Number(data.minOutAmount) / (10 ** (data.outToken?.decimals ?? 18))).toString()
        : undefined,
      sources: ['openocean']
    };
  }

  async sendSwapTx(quote, signer, overrides = {}) {
    const tx = { to: quote.to, data: quote.data, value: quote.value, ...overrides };
    const resp = await signer.sendTransaction(tx);
    return await resp.wait();
  }

  async ensureAllowanceIfNeeded({ tokenAddress, owner, spender, amount, signer }) {
    const { ERC20 } = require('../../erc20');
    const erc20 = new ERC20(tokenAddress, this.base.getProvider());
    const current = await erc20.allowance(owner, spender);
    if (current >= amount) return null;
    const MAX = (1n << 255n) - 1n;
    return await erc20.approve(spender, MAX, signer);
  }
}

module.exports = OpenOceanAdapter;
