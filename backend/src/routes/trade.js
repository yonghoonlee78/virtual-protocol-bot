// backend/src/routes/trade.js
const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const axios = require('axios');

const TradeService = require('../services/trading/tradeService');
const { STABLE_ADDRESS, STABLE_DECIMALS } = require('../config/tokens');

/**
 * 응답 스키마(추가된 USD 포함):
 * - QUOTE:
 *   {
 *     route?: "direct"|"twohop:*"|"threehop:*",
 *     source?: "0x" | "openocean",
 *     sellToken, buyToken,
 *     sellAmount, buyAmount,
 *     price?, guaranteedPrice?, allowanceTarget?, gas?,
 *     decimals: { sell, buy },
 *     humanReadable: { sell, buy },
 *     gasEstimate: {
 *       gasPriceWei, totalGas, totalGasWei, totalGasEth, ethUsd, totalGasUsd
 *     },
 *     legs: [{ step, source, sellToken, buyToken, sellAmount, buyAmount, gas, gasEth, gasUsd }],
 *     tx: { to, data, value }
 *   }
 * - SWAP:
 *   {
 *     sellToken, buyToken,
 *     amount, decimals: { sell, buy },
 *     txHash,
 *     receipt: { status, blockNumber, gasUsed, effectiveGasPrice },
 *     executed?: { from, inAmount, outAmount },
 *     executedHuman?: { in, out },
 *     gasCost: { gasUsed, gasPriceWei, gasCostWei, gasCostEth, ethUsd, gasCostUsd }   // ← 추가
 *   }
 */

/* ---------------------- ETH/USD PRICE (cache) --------------------- */
let ETH_USD_CACHE = { ts: 0, price: 0 };
async function getEthUsd() {
  const now = Date.now();
  if (ETH_USD_CACHE.price && now - ETH_USD_CACHE.ts < 60_000) return ETH_USD_CACHE.price;
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'ethereum', vs_currencies: 'usd' },
      timeout: 3000
    });
    const p = Number(data?.ethereum?.usd || 0);
    if (p > 0) ETH_USD_CACHE = { ts: now, price: p };
  } catch (_) {} // 실패시 0 유지
  return ETH_USD_CACHE.price || 0;
}

/* -------------------------- QUOTE -------------------------- */
// POST /api/trade/quote
// body: { side: 'buy'|'sell', token: '0x..'|SYMBOL, amount: number, slippageBps?: number }
router.post('/quote', async (req, res) => {
  try {
    const { side, token: tok, amount, slippageBps } = req.body || {};
    if (!side || !tok || amount === undefined) {
      return res.status(400).json({ error: 'side, token, amount required' });
    }

    const svc = new TradeService();
    const token = await svc.resolveTokenAddress(tok);
    const tokenDecimals = await svc.getDecimals(token);

    // 집계기 폴백 + 멀티홉(TradeService 내부) 포함
    let q;
    if (side === 'buy') {
      q = await svc.quoteBuy({ token, usdtAmount: Number(amount), slippageBps });
    } else if (side === 'sell') {
      q = await svc.quoteSell({ token, tokenAmount: Number(amount), slippageBps });
      // quoteSell은 legs가 없을 수 있음 → 단일 leg로 변환(표준화) 할 수도 있지만, 여기서는 source/gas만 참고
    } else {
      return res.status(400).json({ error: 'side must be "buy" or "sell"' });
    }

    // decimals
    const decimals = {
      sell: side === 'buy' ? STABLE_DECIMALS : tokenDecimals,
      buy:  side === 'buy' ? tokenDecimals   : STABLE_DECIMALS
    };

    // humanReadable
    const sellAmount = q.sellAmount ?? (q.legs?.[0]?.sellAmount); // direct or first-leg
    const buyAmount  = q.buyAmount  ?? q.totalBuyAmount;          // sellQuote or plan
    const sellHuman = sellAmount ? ethers.formatUnits(sellAmount, decimals.sell) : null;
    const buyHuman  = buyAmount  ? ethers.formatUnits(buyAmount,  decimals.buy)  : null;

    // 가스 추정 (총합)
    const provider = svc.provider;
    const fee = await svc.base.getFeeData();
    const gasPrice = fee.maxFeePerGas || fee.gasPrice || 0n;

    let legs = q.legs;
    if (!Array.isArray(legs)) {
      // quoteSell 케이스 등에 대비해 단일 leg 가정
      legs = [{
        step: 1,
        source: q._source || (Array.isArray(q.sources) && q.sources[0]) || undefined,
        sellToken: side === 'buy' ? STABLE_ADDRESS : token,
        buyToken:  side === 'buy' ? token : STABLE_ADDRESS,
        sellAmount: q.sellAmount,
        buyAmount:  q.buyAmount,
        gas: q.gas || 0
      }];
    }

    const ethUsd = await getEthUsd();
    let totalGas = 0n;
    const legsOut = legs.map((l, i) => {
      const g = BigInt(l.gas || 0);
      totalGas += g;
      const gasWei = g * gasPrice;
      const gasEth = ethers.formatEther(gasWei);
      const gasUsd = ethUsd ? (Number(gasEth) * ethUsd).toFixed(6) : null;
      return {
        step: l.step || i + 1,
        source: l.source,
        sellToken: l.sellToken,
        buyToken:  l.buyToken,
        sellAmount: l.sellAmount?.toString?.(),
        buyAmount:  l.buyAmount?.toString?.(),
        gas: Number(g),     // gas limit
        gasEth,
        gasUsd
      };
    });

    const totalGasWei = totalGas * gasPrice;
    const totalGasEth = ethers.formatEther(totalGasWei);
    const totalGasUsd = ethUsd ? (Number(totalGasEth) * ethUsd).toFixed(6) : null;

    const source =
      Array.isArray(q.sources) && q.sources[0] === 'openocean'
        ? 'openocean'
        : (q._source || '0x');

    return res.json({
      route: q.route, // direct|twohop:...|threehop:...
      source,
      sellToken: side === 'buy' ? STABLE_ADDRESS : token,
      buyToken:  side === 'buy' ? token : STABLE_ADDRESS,
      sellAmount: sellAmount?.toString?.(),
      buyAmount:  buyAmount?.toString?.(),
      price: q.price,
      guaranteedPrice: q.guaranteedPrice,
      allowanceTarget: q.allowanceTarget,
      gas: q.gas, // 단일 quote 시
      decimals,
      humanReadable: { sell: sellHuman, buy: buyHuman },
      gasEstimate: {
        gasPriceWei: gasPrice.toString(),
        totalGas: totalGas.toString(),
        totalGasWei: totalGasWei.toString(),
        totalGasEth,
        ethUsd: ethUsd || null,
        totalGasUsd
      },
      legs: legsOut,
      tx: q.tx ? q.tx : (q.to ? { to: q.to, data: q.data, value: (q.value ?? 0n).toString() } : undefined)
    });
  } catch (e) {
    const msg = e?.message || String(e);
    if (/Minimum buy/i.test(msg))         return res.status(400).json({ error: msg });
    if (/Unknown token symbol/i.test(msg))return res.status(400).json({ error: msg });
    if (/No aggregator route/i.test(msg)) return res.status(409).json({ error: msg });
    return res.status(500).json({ error: msg });
  }
});

/* ---------------------- LOG PARSER UTILS ------------------- */
const TRANSFER_TOPIC0 = ethers.id('Transfer(address,address,uint256)');
function toAddr(topicData) { return ethers.getAddress('0x' + topicData.slice(26)); }

/**
 * 체결된 실제 수량 파싱
 * - BUY : inToken=STABLE, outToken=token
 * - SELL: inToken=token,  outToken=STABLE
 */
function parseExecutedAmountsFromReceipt(receipt, { side, token, stable, signer }) {
  const user = ethers.getAddress(signer);
  const inToken  = side === 'buy' ? ethers.getAddress(stable) : ethers.getAddress(token);
  const outToken = side === 'buy' ? ethers.getAddress(token)  : ethers.getAddress(stable);
  let inAmount  = 0n;
  let outAmount = 0n;

  for (const log of receipt.logs || []) {
    if (!log || log.topics?.[0] !== TRANSFER_TOPIC0) continue;
    const contract = ethers.getAddress(log.address);
    const from = toAddr(log.topics[1]);
    const to   = toAddr(log.topics[2]);
    const amount = BigInt(log.data);
    if (contract === inToken && from === user) inAmount  += amount;
    if (contract === outToken && to   === user) outAmount += amount;
  }
  return { inAmount, outAmount };
}

/* --------------------------- SWAP -------------------------- */
// POST /api/trade/swap
// body: { side:'buy'|'sell', userId, token:'0x..'|SYMBOL, amount:number, slippageBps?, gasBoostBps? }
router.post('/swap', async (req, res) => {
  try {
    const { side, userId, token: tok, amount, slippageBps, gasBoostBps } = req.body || {};
    if (!side || !userId || !tok || amount === undefined) {
      return res.status(400).json({ error: 'side, userId, token, amount required' });
    }

    const svc = new TradeService();
    const token = await svc.resolveTokenAddress(tok);
    const tokenDecimals = await svc.getDecimals(token);

    // 체결
    let receipt;
    if (side === 'buy') {
      receipt = await svc.executeBuy({
        userId, token, usdtAmount: Number(amount),
        slippageBps, gasBoostBps
      });
    } else if (side === 'sell') {
      receipt = await svc.executeSell({
        userId, token, tokenAmount: Number(amount),
        slippageBps, gasBoostBps
      });
    } else {
      return res.status(400).json({ error: 'side must be "buy" or "sell"' });
    }

    const txHash = receipt.transactionHash || receipt.hash;
    const status = typeof receipt.status === 'number'
      ? (receipt.status === 1 ? 'success' : 'failed')
      : 'unknown';

    // 실제 가스 비용(Chain receipt 기준)
    const gasUsed = receipt.gasUsed ? BigInt(receipt.gasUsed) : 0n;
    const gasPrice = receipt.effectiveGasPrice ? BigInt(receipt.effectiveGasPrice) : 0n;
    const gasCostWei = gasUsed * gasPrice;
    const gasCostEth = ethers.formatEther(gasCostWei);
    const ethUsd = await getEthUsd();
    const gasCostUsd = ethUsd ? (Number(gasCostEth) * ethUsd).toFixed(6) : null;

    // 실제 체결 수량 파싱
    const signer = receipt.from || req.body.from;
    let executed = null;
    let executedHuman = null;
    if (signer) {
      try {
        const { inAmount, outAmount } = parseExecutedAmountsFromReceipt(receipt, {
          side, token, stable: STABLE_ADDRESS, signer
        });
        executed = {
          from: ethers.getAddress(signer),
          inAmount: inAmount.toString(),
          outAmount: outAmount.toString()
        };
        const inDecimals  = side === 'buy' ? STABLE_DECIMALS : tokenDecimals;
        const outDecimals = side === 'buy' ? tokenDecimals   : STABLE_DECIMALS;
        executedHuman = {
          in:  ethers.formatUnits(inAmount,  inDecimals),
          out: ethers.formatUnits(outAmount, outDecimals)
        };
      } catch (_) {}
    }

    const decimals = {
      sell: side === 'buy' ? STABLE_DECIMALS : tokenDecimals,
      buy:  side === 'buy' ? tokenDecimals   : STABLE_DECIMALS
    };

    return res.json({
      sellToken: side === 'buy' ? STABLE_ADDRESS : token,
      buyToken:  side === 'buy' ? token : STABLE_ADDRESS,
      amount: Number(amount),
      decimals,
      txHash,
      receipt: {
        status,
        blockNumber: receipt.blockNumber,
        gasUsed: gasUsed.toString(),
        effectiveGasPrice: gasPrice.toString()
      },
      executed,
      executedHuman,
      gasCost: {
        gasUsed: gasUsed.toString(),
        gasPriceWei: gasPrice.toString(),
        gasCostWei: gasCostWei.toString(),
        gasCostEth,
        ethUsd: ethUsd || null,
        gasCostUsd
      },
      // legs TX 해시들(멀티-홉일 때)
      txHashes: Array.isArray(receipt.legs) ? receipt.legs : undefined
    });
  } catch (e) {
    const msg = e?.message || String(e);
    if (/Minimum buy/i.test(msg))         return res.status(400).json({ error: msg });
    if (/Unknown token symbol/i.test(msg))return res.status(400).json({ error: msg });
    if (/No aggregator route/i.test(msg)) return res.status(409).json({ error: msg });
    if (/insufficient funds/i.test(msg))  return res.status(402).json({ error: 'Insufficient funds for gas or transfer.' });
    return res.status(500).json({ error: msg });
  }
});

module.exports = router;
