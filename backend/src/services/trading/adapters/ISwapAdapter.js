// backend/src/services/trading/adapters/ISwapAdapter.js
class ISwapAdapter {
    async quote({ sellToken, buyToken, sellAmountWei, slippageBps, taker }) { throw new Error('not implemented'); }
    async buildTx(quote, wallet) { throw new Error('not implemented'); }
    async sendTx(builtTx, wallet) { throw new Error('not implemented'); }
  }
  module.exports = ISwapAdapter;
  