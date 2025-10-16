// backend/src/services/trading/adapters/zeroxAdapter.js
const axios = require('axios');
const { ethers } = require('ethers');
const { ERC20 } = require('../../erc20');
const { ZEROX_QUOTE_URL, CHAIN_ID } = require('../../../config/tokens');

/**
 * 0x Swap API adapter (Base chain).
 * Docs (pattern): <ZEROX_QUOTE_URL>?sellToken=...&buyToken=...&sellAmount=...&takerAddress=...
 * 
 * NOTE: The exact API base can evolve. Keep ZEROX_QUOTE_URL in env/config override-able.
 */
class ZeroXAdapter {
  constructor(provider) {
    this.provider = provider;
    this.baseUrl = ZEROX_QUOTE_URL;
  }

  async quote({ sellToken, buyToken, sellAmount, taker, slippageBps }) {
    const params = {
      sellToken,
      buyToken,
      sellAmount: sellAmount.toString(),
      takerAddress: taker,
      slippagePercentage: Math.max(slippageBps, 10) / 10000 // convert bps -> decimal, min 0.001
    };

    let data;
      try {
       ({ data } = await axios.get(this.baseUrl, { params }));
        } catch (e) {
       const status = e?.response?.status;
       const body   = e?.response?.data;
       if (status === 404) {
         throw new Error('No liquidity quote available on 0x for this pair/amount.');
          }
         if (status === 400) {
          // 0x가 파라미터 문제/허용량 부족 등으로 400을 줄 수 있음
         const msg = body?.validationErrors?.[0]?.reason || body?.reason || e.message;
         throw new Error(`Quote error: ${msg}`);
           }
         throw e;
           }

    return {
      to: data.to,
      data: data.data,
      value: data.value ? ethers.toBigInt(data.value) : 0n,
      gas: data.gas,
      allowanceTarget: data.allowanceTarget,
      sellAmount: ethers.toBigInt(data.sellAmount),
      buyAmount: ethers.toBigInt(data.buyAmount),
      price: data.price,
      guaranteedPrice: data.guaranteedPrice,
      sources: data.sources
    };
  }

  async sendSwapTx(quote, signer) {
    const tx = {
      to: quote.to,
      data: quote.data,
      value: quote.value
    };
    const resp = await signer.sendTransaction(tx);
    return await resp.wait();
  }

  async ensureAllowanceIfNeeded({ tokenAddress, owner, spender, amount, signer }) {
    const erc20 = new ERC20(tokenAddress, this.provider);
    const current = await erc20.allowance(owner, spender);
    if (current >= amount) return null;
    // set max allowance to reduce future approvals
    const MAX = (1n << 255n) - 1n;
    return await erc20.approve(spender, MAX, signer);
  }
}

module.exports = ZeroXAdapter;
