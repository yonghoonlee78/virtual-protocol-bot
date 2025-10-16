// backend/src/services/trading/tradeService.js
const { ethers } = require('ethers');
const BaseProvider = require('../blockchain/baseProvider');
const ZeroXAdapter = require('./adapters/zeroxAdapter');
const OpenOceanAdapter = require('./adapters/openoceanAdapter'); // 폴백 집계기
const { ERC20 } = require('../erc20');
const WalletService = require('../walletService');
const Agent = require('../../models/Agent');
const User = require('../../models/User');
const Trade = require('../../models/Trade');

const {
  STABLE_ADDRESS,
  STABLE_DECIMALS,
  DEFAULT_SLIPPAGE_BPS,
  STABLE_MIN_BUY,
  STABLE_SYMBOL
} = require('../../config/tokens');

class TradeService {
  constructor() {
    this.base = new BaseProvider();
    this.provider = this.base.getProvider();
    this.adapter = new ZeroXAdapter(this.provider);   // 1순위: 0x
    this.oo = new OpenOceanAdapter(this.base);    // 2순위: OpenOcean
    this.walletService = new WalletService();
  }

  /* ------------------------- utils ------------------------- */
  async resolveTokenAddress(symbolOrAddress) {
    if (!symbolOrAddress) throw new Error('Token required');
    if (symbolOrAddress.startsWith('0x') && symbolOrAddress.length === 42) return symbolOrAddress;
    const token = await Agent.findOne({ symbol: symbolOrAddress.toUpperCase() }).lean();
    if (!token) throw new Error(`Unknown token symbol: ${symbolOrAddress}`);
    return token.address;
  }

  async getDecimals(address) {
    const erc = new ERC20(address, this.provider);
    return await erc.decimals();
  }

  /* ------------------------- quotes ------------------------ */
  // BUY: spend <usdtAmount> (기축 스테이블) to buy <token>
  async quoteBuy({ token, usdtAmount, slippageBps }) {
    if (Number(usdtAmount) < (STABLE_MIN_BUY || 3)) {
      throw new Error(`Minimum buy is ${STABLE_MIN_BUY || 3} ${STABLE_SYMBOL || 'USDC'}`);
    }
    const sellAmount = ethers.parseUnits(String(usdtAmount), STABLE_DECIMALS);
    const taker = '0x0000000000000000000000000000000000000000';

    // 1순위 0x → 실패 시 OO 폴백
    try {
      return await this.adapter.quote({
        sellToken: STABLE_ADDRESS,
        buyToken: token,
        sellAmount,
        taker,
        slippageBps: slippageBps ?? DEFAULT_SLIPPAGE_BPS
      });
    } catch (e) {
      try {
        return await this.oo.quote({
          sellToken: STABLE_ADDRESS,
          buyToken: token,
          sellAmount,
          taker,
          slippageBps: slippageBps ?? DEFAULT_SLIPPAGE_BPS
        });
      } catch (ee) {
        // 두 집계기 모두 실패 → 메시지 정제
        const msg = /no route|no quote|No liquidity/i.test(ee.message || e.message)
          ? `No aggregator route for this pair/amount. Try smaller size or another DEX.`
          : (ee.message || e.message);
        throw new Error(msg);
      }
    }
  }

  // SELL: sell <tokenAmount> TOKEN to receive STABLE (0x 우선, 필요시 OO 폴백 가능)
  async quoteSell({ token, tokenAmount, slippageBps }) {
    const tokenDecimals = await this.getDecimals(token);
    const sellAmount = ethers.parseUnits(String(tokenAmount), tokenDecimals);
    const taker = '0x0000000000000000000000000000000000000000';

    try {
      return await this.adapter.quote({
        sellToken: token,
        buyToken: STABLE_ADDRESS,
        sellAmount,
        taker,
        slippageBps: slippageBps ?? DEFAULT_SLIPPAGE_BPS
      });
    } catch (e) {
      try {
        return await this.oo.quote({
          sellToken: token,
          buyToken: STABLE_ADDRESS,
          sellAmount,
          taker,
          slippageBps: slippageBps ?? DEFAULT_SLIPPAGE_BPS
        });
      } catch (ee) {
        const msg = /no route|no quote|No liquidity/i.test(ee.message || e.message)
          ? `No aggregator route for this pair/amount. Try smaller size or another DEX.`
          : (ee.message || e.message);
        throw new Error(msg);
      }
    }
  }

  /* ------------------------- execute ----------------------- */
  // BUY 실행
  async executeBuy({ userId, token, usdtAmount, slippageBps, gasBoostBps }) {
    if (Number(usdtAmount) < (STABLE_MIN_BUY || 3)) {
      throw new Error(`Minimum buy is ${STABLE_MIN_BUY || 3} ${STABLE_SYMBOL || 'USDC'}`);
    }
    const user = await User.findById(userId);
    if (!user?.wallet?.encryptedPrivateKey) throw new Error('Wallet not set');

    const privateKey = await this.walletService.getPrivateKey(user.wallet.encryptedPrivateKey);
    const signer = new ethers.Wallet(privateKey, this.provider);

    const sellAmount = ethers.parseUnits(String(usdtAmount), STABLE_DECIMALS);

    let quote;
    let adapterUsed = '0x';
    try {
      quote = await this.adapter.quote({
        sellToken: STABLE_ADDRESS,
        buyToken: token,
        sellAmount,
        taker: signer.address,
        slippageBps: slippageBps ?? (user.settings?.slippageBps ?? DEFAULT_SLIPPAGE_BPS)
      });
    } catch (e) {
      // 0x 실패 → OO 폴백
      try {
        quote = await this.oo.quote({
          sellToken: STABLE_ADDRESS,
          buyToken: token,
          sellAmount,
          taker: signer.address,
          slippageBps: slippageBps ?? (user.settings?.slippageBps ?? DEFAULT_SLIPPAGE_BPS)
        });
        adapterUsed = 'OO';
      } catch (ee) {
        const msg = /no route|no quote|No liquidity/i.test(ee.message || e.message)
          ? '유동성이 부족해 집계기에서 견적을 받지 못했습니다. 금액을 줄이거나 다른 DEX를 사용해 보세요.'
          : (ee.message || e.message);
        throw new Error(msg);
      }
    }

    // 승인 필요 시 처리 (집계기별 spender 사용)
    const spender = quote.allowanceTarget;
    const approveAdapter = adapterUsed === '0x' ? this.adapter : this.oo;
    await approveAdapter.ensureAllowanceIfNeeded({
      tokenAddress: STABLE_ADDRESS,
      owner: signer.address,
      spender,
      amount: sellAmount,
      signer
    });

    // 가스 부스트 (옵션)
    let overrides = {};
    if (gasBoostBps || user.settings?.gasBoostBps) {
      const boostBps = BigInt(10000 + (gasBoostBps ?? user.settings?.gasBoostBps ?? 0));
      const fee = await this.base.getFeeData();
      const mf = fee.maxFeePerGas || fee.gasPrice || 0n;
      const mp = fee.maxPriorityFeePerGas || 0n;
      const scale = (x) => (x ? (x * boostBps) / 10000n : undefined);
      overrides = { maxFeePerGas: scale(mf), maxPriorityFeePerGas: scale(mp) };
    }

    // 스왑 전송
    const sendAdapter = adapterUsed === '0x' ? this.adapter : this.oo;
    const receipt = await sendAdapter.sendSwapTx(quote, signer, overrides);

    // 기록
    await Trade.create({
      userId: user._id,
      agentAddress: token,
      symbol: undefined,
      type: 'buy',
      amount: Number(usdtAmount),
      price: null,
      txHash: receipt.transactionHash || receipt.hash,
      status: 'completed',
      timestamp: new Date()
    });

    return receipt;
  }

  // SELL 실행
  async executeSell({ userId, token, tokenAmount, slippageBps, gasBoostBps }) {
    const user = await User.findById(userId);
    if (!user?.wallet?.encryptedPrivateKey) throw new Error('Wallet not set');

    const privateKey = await this.walletService.getPrivateKey(user.wallet.encryptedPrivateKey);
    const signer = new ethers.Wallet(privateKey, this.provider);

    const tokenDecimals = await this.getDecimals(token);
    const sellAmount = ethers.parseUnits(String(tokenAmount), tokenDecimals);

    let quote;
    let adapterUsed = '0x';
    try {
      quote = await this.adapter.quote({
        sellToken: token,
        buyToken: STABLE_ADDRESS,
        sellAmount,
        taker: signer.address,
        slippageBps: slippageBps ?? (user.settings?.slippageBps ?? DEFAULT_SLIPPAGE_BPS)
      });
    } catch (e) {
      try {
        quote = await this.oo.quote({
          sellToken: token,
          buyToken: STABLE_ADDRESS,
          sellAmount,
          taker: signer.address,
          slippageBps: slippageBps ?? (user.settings?.slippageBps ?? DEFAULT_SLIPPAGE_BPS)
        });
        adapterUsed = 'OO';
      } catch (ee) {
        const msg = /no route|no quote|No liquidity/i.test(ee.message || e.message)
          ? '유동성이 부족해 집계기에서 견적을 받지 못했습니다. 금액을 줄이거나 다른 DEX를 사용해 보세요.'
          : (ee.message || e.message);
        throw new Error(msg);
      }
    }

    // 승인 필요 시 처리
    const spender = quote.allowanceTarget;
    const approveAdapter = adapterUsed === '0x' ? this.adapter : this.oo;
    await approveAdapter.ensureAllowanceIfNeeded({
      tokenAddress: token,
      owner: signer.address,
      spender,
      amount: sellAmount,
      signer
    });

    // 가스 부스트
    let overrides = {};
    if (gasBoostBps || user.settings?.gasBoostBps) {
      const boostBps = BigInt(10000 + (gasBoostBps ?? user.settings?.gasBoostBps ?? 0));
      const fee = await this.provider.getFeeData();
      const mf = fee.maxFeePerGas || fee.gasPrice || 0n;
      const mp = fee.maxPriorityFeePerGas || 0n;
      const scale = (x) => (x ? (x * boostBps) / 10000n : undefined);
      overrides = { maxFeePerGas: scale(mf), maxPriorityFeePerGas: scale(mp) };
    }

    const sendAdapter = adapterUsed === '0x' ? this.adapter : this.oo;
    const receipt = await sendAdapter.sendSwapTx(quote, signer, overrides);

    await Trade.create({
      userId: user._id,
      agentAddress: token,
      symbol: undefined,
      type: 'sell',
      amount: Number(tokenAmount),
      price: null,
      txHash: receipt.transactionHash || receipt.hash,
      status: 'completed',
      timestamp: new Date()
    });

    return receipt;
  }
}

module.exports = TradeService;
