// backend/src/bot/commands/trade.js
const { ethers } = require('ethers');
const TradeService = require('../../services/trading/tradeService');
const User = require('../../models/User');
const Agent = require('../../models/Agent');

const svc = new TradeService();

function parseArgs(text) {
  // e.g. "/buy 100 VIRTUAL" or "/sell 50 VIRTUAL"
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0];
  const amount = parts[1];
  const token = parts[2];
  return { cmd, amount, token };
}

async function ensureUser(ctx) {
  const tgId = String(ctx.from.id);
  let user = await User.findOne({ telegramId: tgId });
  if (!user) {
    user = await User.create({ telegramId: tgId, settings: { slippageBps: 100 } });
  }
  return user;
}

function registerTradeCommands(bot) {
  bot.command('balance', async (ctx) => {
    try {
      const user = await ensureUser(ctx);
      if (!user.wallet || !user.wallet.address) return ctx.reply('❗️지갑이 없습니다. /start 로 생성해주세요.');
      // A simple pointer: balances can be added with ERC20 helper later.
      return ctx.reply(`지갑 주소: ${user.wallet.address}\nUSDT를 기축으로 사용합니다. /buy /sell 명령을 사용해 보세요.`);
    } catch (e) {
      ctx.reply('오류: ' + e.message);
    }
  });

  bot.command('buy', async (ctx) => {
    try {
      const { amount, token } = parseArgs(ctx.message.text);
      if (!amount || !token) return ctx.reply('형식: /buy <USDT금액> <토큰심볼|주소>');

      const user = await ensureUser(ctx);
      const address = await svc.resolveTokenAddress(token);
      const q = await svc.quoteBuy({ token: address, usdtAmount: amount, slippageBps: user.settings?.slippageBps });

      await ctx.reply([
        `🟢 매수 견적`,
        `USDT -> ${token}`,
        `가격(참고): ${q.price}`,
        `보장가격: ${q.guaranteedPrice}`,
        `구매량: ${ethers.formatUnits(q.buyAmount, 18)} (표기용)`,
        `수행하려면: /confirm_buy ${amount} ${token}`
      ].join('\n'));
    } catch (e) {
      ctx.reply('⛔️ 견적 실패: ' + e.message);
    }
  });

  bot.command('confirm_buy', async (ctx) => {
    try {
      const { amount, token } = parseArgs(ctx.message.text);
      if (!amount || !token) return ctx.reply('형식: /confirm_buy <USDT금액> <토큰심볼|주소>');
      const user = await ensureUser(ctx);
      const address = await svc.resolveTokenAddress(token);
      const receipt = await svc.executeBuy({ userId: user._id, token: address, usdtAmount: amount, slippageBps: user.settings?.slippageBps });
      await ctx.reply(`✅ 매수 체결됨\nTx: ${receipt.transactionHash || receipt.hash}`);
    } catch (e) {
      ctx.reply('⛔️ 매수 실패: ' + e.message);
    }
  });

  bot.command('sell', async (ctx) => {
    try {
      const { amount, token } = parseArgs(ctx.message.text);
      if (!amount || !token) return ctx.reply('형식: /sell <토큰수량> <토큰심볼|주소>');
      const user = await ensureUser(ctx);
      const address = await svc.resolveTokenAddress(token);
      const q = await svc.quoteSell({ token: address, tokenAmount: amount, slippageBps: user.settings?.slippageBps });
      await ctx.reply([
        `🔴 매도 견적`,
        `${token} -> USDT`,
        `가격(참고): ${q.price}`,
        `보장가격: ${q.guaranteedPrice}`,
        `수행하려면: /confirm_sell ${amount} ${token}`
      ].join('\n'));
    } catch (e) {
      ctx.reply('⛔️ 견적 실패: ' + e.message);
    }
  });

  bot.command('confirm_sell', async (ctx) => {
    try {
      const { amount, token } = parseArgs(ctx.message.text);
      if (!amount || !token) return ctx.reply('형식: /confirm_sell <토큰수량> <토큰심볼|주소>');
      const user = await ensureUser(ctx);
      const address = await svc.resolveTokenAddress(token);
      const receipt = await svc.executeSell({ userId: user._id, token: address, tokenAmount: amount, slippageBps: user.settings?.slippageBps });
      await ctx.reply(`✅ 매도 체결됨\nTx: ${receipt.transactionHash || receipt.hash}`);
    } catch (e) {
      ctx.reply('⛔️ 매도 실패: ' + e.message);
    }
  });

  bot.command('set_slippage', async (ctx) => {
    try {
      const [, bpsStr] = ctx.message.text.trim().split(/\s+/);
      const bps = Number(bpsStr);
      if (!Number.isFinite(bps) || bps < 1 || bps > 2000) return ctx.reply('형식: /set_slippage <1~2000bps>');
      const user = await ensureUser(ctx);
      user.settings = user.settings || {};
      user.settings.slippageBps = bps;
      await user.save();
      ctx.reply(`✔️ 슬리피지가 ${bps}bps로 설정되었습니다.`);
    } catch (e) {
      ctx.reply('오류: ' + e.message);
    }
  });
}

module.exports = { registerTradeCommands };
