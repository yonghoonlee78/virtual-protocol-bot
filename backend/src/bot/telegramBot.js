// backend/src/bot/telegramBot.js
const { Telegraf } = require('telegraf');
const { ethers } = require('ethers');
const axios = require('axios');

const User = require('../models/User');
const Agent = require('../models/Agent');
const Portfolio = require('../models/Portfolio');
const PriceAlert = require('../models/PriceAlert'); // reserved
const Trade = require('../models/Trade');

const WalletService = require('../services/walletService');
const BaseProvider = require('../services/blockchain/baseProvider');
const TradeService = require('../services/trading/tradeService');
const TOKENS = require('../config/tokens');

/*=============================*
 *   STABLE / GENERIC HELPERS  *
 *=============================*/
function getStableSymbol()   { return TOKENS?.STABLE_SYMBOL || 'USDC'; }
function getStableAddress()  { return TOKENS?.STABLE_ADDRESS; }
function getStableDecimals() { return TOKENS?.STABLE_DECIMALS ?? 6; }

function toBI(x, fallback = 0n) {
  try { return typeof x === 'bigint' ? x : BigInt(x); } catch { return fallback; }
}
async function getWalletFromEncrypted(ws, enc, provider) {
  if (typeof ws.getWallet === 'function') return ws.getWallet(enc, provider);
  const pk = await ws.getPrivateKey(enc);
  return new ethers.Wallet(pk, provider);
}
async function getEthBalanceBase(baseProvider, address) {
    const wei = await baseProvider.getBalance(address); // ★ 폴백
    return Number(ethers.formatEther(wei));
  }
/** WalletService 차이 흡수: 개인키 암호화/지갑레코드 생성 */
async function encryptOrBuild(ws, pk) {
  const secret = process.env.WALLET_SECRET || 'change-me';
  if (typeof ws.encryptPrivateKey === 'function') {
    const encryptedPrivateKey = await ws.encryptPrivateKey(pk, secret);
    const addr = new ethers.Wallet(pk).address;
    return { address: addr, encryptedPrivateKey };
  }
  if (typeof ws.encrypt === 'function') {
    const encryptedPrivateKey = await ws.encrypt(pk, secret);
    const addr = new ethers.Wallet(pk).address;
    return { address: addr, encryptedPrivateKey };
  }
  if (typeof WalletService.encrypt === 'function') {
    const encryptedPrivateKey = await WalletService.encrypt(pk, secret);
    const addr = new ethers.Wallet(pk).address;
    return { address: addr, encryptedPrivateKey };
  }
  if (typeof ws.createWalletFromPrivateKey === 'function') {
    return await ws.createWalletFromPrivateKey(pk, secret);
  }
  if (!process.env.WALLET_SECRET) throw new Error('WALLET_SECRET not configured');
  throw new Error('WalletService has no encrypt/import method');
}

/*=============================*
 *   BUY by CONTRACT HELPERS   *
 *=============================*/

const ERC20_META_ABI_STR = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)'
  ];
  const ERC20_META_ABI_B32 = [
    'function name() view returns (bytes32)',
    'function symbol() view returns (bytes32)',
    'function decimals() view returns (uint8)'
  ];

function parseAddressFromInput(text) {
  if (!text) return null;
  const t = text.trim();
  const m0 = t.match(/(0x[a-fA-F0-9]{40})/);
  if (m0) return m0[1];
  const m1 = t.match(/dexscreener\.com\/base\/(0x[a-fA-F0-9]{40})/i);
  if (m1) return m1[1];
  const m2 = t.match(/(0x[a-fA-F0-9]{40})/);
  if (m2) return m2[1];
  return null;
}
// ★ BaseProvider 폴백을 사용하도록 변경
async function getTokenMeta(provider, baseProvider, address) {
  // 주소 체크섬
  try { address = ethers.getAddress(address); } catch (_) {}
  const code = await baseProvider.getCode(address);
  if (!code || code === '0x') throw new Error('Not a contract on Base');

    // 1차: string 시그니처
    let name = null, symbol = null, decimals = null;
    try {
      const cStr = new ethers.Contract(address, ERC20_META_ABI_STR, provider);
      name = await cStr.name().catch(() => null);
      symbol = await cStr.symbol().catch(() => null);
      decimals = await cStr.decimals().catch(() => null);
    } catch (_) {}
  
    // 2차: bytes32 시그니처
    if (name == null || symbol == null || decimals == null) {
      try {
        const cB32 = new ethers.Contract(address, ERC20_META_ABI_B32, provider);
        if (name == null) {
          const b = await cB32.name().catch(() => null);
          if (b) name = ethers.decodeBytes32String(b).replace(/\0+$/, '');
        }
        if (symbol == null) {
          const b = await cB32.symbol().catch(() => null);
          if (b) symbol = ethers.decodeBytes32String(b).replace(/\0+$/, '');
        }
        if (decimals == null) {
          decimals = await cB32.decimals().catch(() => null);
        }
      } catch (_) {}
    }
  
    return {
      address,
      name: name || 'Unknown',
      symbol: symbol || 'TOKEN',
      decimals: Number(decimals ?? 18)
    };
}

// 외부 링크(미리보기 방지용)
function dsLink(addr){ return `https://dexscreener.com/base/${addr}`; }
function scanLink(addr){ return `https://basescan.org/token/${addr}`; }
function virtualsLink(addr){ return `https://app.virtuals.io/virtuals?token=${addr}`; }

/*=============================*
 *            BOT              *
 *=============================*/
class TelegramBot {
  constructor(token) {
    this.bot = new Telegraf(token);
    this.walletService = new WalletService();
    this.base = new BaseProvider();            // ★ 폴백 RPC
    this.provider = this.base.getProvider();
    this.tradeService = new TradeService();

    // pending states
    this.pendingImport = new Map();     // {active,promptId,timer}
    this.pendingCA = new Map();         // {active,promptId,timer}
    this.pendingBuyInput = new Map();   // {active,tokenAddress,promptId,timer}
    this.pendingWithdraw = new Map();   // {step,amount,tokenSym,promptId,timer}

    this.setupCommands();
    this.setupActions();
    this.setupImportFlow();
  }

  // STABLE 잔고 (인스턴스)
  async getStableBalance(address) {
    const erc = new ethers.Contract(
      getStableAddress(),
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );
    const bal = await erc.balanceOf(address);
    return Number(ethers.formatUnits(bal, getStableDecimals()));
  }

  /*---------- menu button ----------*/
  async registerBotMenu() {
    const commands = [
      { command: 'home',       description: 'Open main menu' },
      { command: 'settings',   description: 'Customize VAIBOT' },
      { command: 'portfolio',  description: 'View holdings' },
      { command: 'buy',        description: 'Buy tokens' },
      { command: 'sell',       description: 'Sell tokens' },
      { command: 'alerts',     description: 'Price alerts' },
      { command: 'limit',      description: 'Limit orders' },
      { command: 'import',     description: 'Import wallet (0x private key)' },
      { command: 'withdraw',   description: 'Withdraw funds' },
      { command: 'help',       description: 'Tips & FAQ' },
      { command: 'bots',       description: 'Backup bots / tools' },
      { command: 'chat',       description: 'Support & community' },
    ];
    try {
      await this.bot.telegram.setMyCommands(commands);
      await this.bot.telegram.setChatMenuButton({ menu_button: { type: 'commands' } });
    } catch (e) {
      console.warn('Failed to register menu commands:', e.message);
    }
  }

  /*---------- utils ----------*/
  shorten(addr) { return addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : ''; }
  fmt(n, d = 2) { return (n === undefined || n === null || Number.isNaN(n)) ? '-' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d }); }

  async getOrCreateUser(ctx) {
    const telegramId = String(ctx.from.id);
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        profile: { firstName: ctx.from.first_name, username: ctx.from.username },
        settings: { slippageBps: TOKENS?.DEFAULT_SLIPPAGE_BPS ?? 100, gasBoostBps: 0 }
      });
    }
    if (!user.wallet || !user.wallet.address) {
      const w = await this.walletService.createWallet(user._id);
      user.wallet = {
        address: w.address,
        encryptedPrivateKey: w.encryptedPrivateKey,
        createdAt: new Date(),
        balance: { eth: 0, usdt: 0, virtual: 0 } // 내부키 usdt=stable
      };
      await user.save();
    }
    return user;
  }
  async getUser(ctx) {
    const telegramId = String(ctx.from.id);
    let user = await User.findOne({ telegramId });
    if (!user) user = await this.getOrCreateUser(ctx);
    if (!user.wallet || !user.wallet.address) {
      const w = await this.walletService.createWallet(user._id);
      user.wallet = {
        address: w.address,
        encryptedPrivateKey: w.encryptedPrivateKey,
        createdAt: new Date(),
        balance: { eth: 0, usdt: 0, virtual: 0 }
      };
      await user.save();
    }
    return user;
  }

  async resolveTokenAddress(symbolOrAddress) {
    if (!symbolOrAddress) throw new Error('Token required');
    if (symbolOrAddress.startsWith('0x') && symbolOrAddress.length === 42) return symbolOrAddress;
    const token = await Agent.findOne({ symbol: symbolOrAddress.toUpperCase() }).lean();
    if (!token) throw new Error(`Unknown token symbol: ${symbolOrAddress}`);
    return token.address;
  }

  // (호환용) 내부 usdt키 사용하지만 실제 동작은 STABLE
  getUsdtAddress()         { return TOKENS?.STABLE_ADDRESS || TOKENS?.USDT || process.env.BASE_USDT_ADDRESS; }
  async getUsdtBalance(a)  { return this.getStableBalance(a); }

  async getTokenBalance(tokenAddress, owner) {
    const erc = new ethers.Contract(tokenAddress, [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)'
    ], this.provider);
    const [bal, dec, sym] = await Promise.all([erc.balanceOf(owner), erc.decimals(), erc.symbol().catch(()=> '')]);
    return { amount: Number(ethers.formatUnits(bal, dec)), decimals: Number(dec), symbol: sym };
  }

  async ensureGasForQuote(quote, address, gasBoostBps = 0) {
    const feeData = await this.base.getFeeData();  
    const base = feeData.maxFeePerGas || feeData.gasPrice || 0n;
    const estGas = toBI(quote.gas, 250000n);
    const estCostWei = estGas * (base || 1n);
    const ethBalWei = await this.base.getBalance(address);
    return { hasEnough: ethBalWei >= estCostWei, needWei: estCostWei, haveWei: ethBalWei };
  }

  async showMainMenu(ctx, isEdit = false) {
    const user = await this.getUser(ctx);
    const ethBal    = user.wallet.balance?.eth  ?? 0;
    const stableBal = user.wallet.balance?.usdt ?? 0; // 내부키 usdt
    const stable    = getStableSymbol();

    const message =
      `<b>VAIBOT — Virtual Protocol Bot (Base)</b>\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `Wallet: <code>${this.shorten(user.wallet.address)}</code>\n` +
      `Balance: ${this.fmt(stableBal, 2)} ${stable}\n` +
      `Gas(ETH): ${this.fmt(ethBal, 6)}\n` +
      `Slippage: ${(user.settings?.slippageBps ?? 100) / 100}% | Gas boost: ${(user.settings?.gasBoostBps ?? 0) / 100}%\n` +
      `━━━━━━━━━━━━━━━━━\n\n` +
      `${stable} 기축으로 Virtual Protocol 및 Base 토큰을 빠르게 매매하세요.`;

    const keyboard = {
      reply_markup: { inline_keyboard: [
        [{ text: 'Buy', callback_data: 'menu_buy' }, { text: 'Sell & Manage', callback_data: 'menu_sell' }],
        [{ text: 'Limit Orders', callback_data: 'limit_orders' }, { text: 'Alerts', callback_data: 'alerts' }],
        [{ text: 'Wallet', callback_data: 'wallet' }, { text: 'Refresh', callback_data: 'refresh' }],
        [{ text: 'Withdraw', callback_data: 'withdraw' }, { text: 'Help', callback_data: 'help' }],
        [{ text: 'Settings', callback_data: 'settings' }],
        [{ text: '🔑 Import wallet', callback_data: 'import_wallet' }]
      ]}
    };
    if (isEdit) return ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
    return ctx.replyWithHTML(message, keyboard);
  }

  /*=============================*
   *          COMMANDS           *
   *=============================*/
  setupCommands() {
    this.bot.start(async (ctx) => {
      this.pendingImport.delete(String(ctx.from.id));
      const user = await this.getOrCreateUser(ctx);
      const stable = getStableSymbol();
      const msg =
        `<b>Welcome to VAIBOT</b>\n` +
        `Trade Virtual Protocol tokens on Base with <b>${stable}</b>.\n` +
        `소량의 <b>ETH(가스)</b>도 지갑에 보유하세요.\n\n` +
        `입금 주소:\n<code>${user.wallet.address}</code>`;
      await ctx.replyWithHTML(msg);
      return this.showMainMenu(ctx);
    });

    this.bot.command('home',      async (ctx) => this.showMainMenu(ctx));
    this.bot.command('settings',  async (ctx) => this.openSettings(ctx));
    this.bot.command('portfolio', async (ctx) => this.openPortfolio(ctx));
    this.bot.command('buy',       async (ctx) => this.openBuyMenu(ctx));
    this.bot.command('sell',      async (ctx) => this.openSellMenu(ctx));
    this.bot.command('alerts',    async (ctx) => ctx.reply('📢 Alerts: 가격 알림은 곧 추가됩니다.'));
    this.bot.command('limit',     async (ctx) => ctx.reply('⏱ LIMIT: /limit buy &lt;토큰|주소&gt; &lt;가격USD&gt; &lt;USDT금액&gt;\n/limit sell &lt;토큰|주소&gt; &lt;가격USD&gt; &lt;토큰수량&gt;'));
    this.bot.command('bots',      async (ctx) => ctx.reply('🔧 Backup/도구 메뉴는 준비 중입니다.'));
    this.bot.command('chat',      async (ctx) => ctx.reply('💬 Support/Community는 준비 중입니다.'));

    this.bot.help(async (ctx) => {
      await ctx.replyWithHTML(
        `<b>VAIBOT Help</b>\n\n` +
        `• ${getStableSymbol()} 기축 / Base 체인\n` +
        `• /settings 에서 슬리피지·가스 부스트 설정\n` +
        `• /set_slippage &lt;bps&gt; (기본 100 = 1%)\n` +
        `• /set_gasboost &lt;bps&gt; (예: 200 = +2%)\n` +
        `• /withdraw &lt;금액&gt; &lt;TOKEN|ETH&gt; &lt;수신주소&gt;\n` +
        `• /import &lt;privateKey&gt; (0x로 시작하는 64자리 EVM 프라이빗키만)\n` +
        `• /cancel 로 진행 중 작업(예: Import) 취소`
      );
    });

    this.bot.command('cancel', async (ctx) => {
      const uid = String(ctx.from.id);
      const a = this.pendingImport.get(uid);   if (a?.timer) clearTimeout(a.timer);   this.pendingImport.delete(uid);
      const b = this.pendingCA.get(uid);       if (b?.timer) clearTimeout(b.timer);   this.pendingCA.delete(uid);
      const c = this.pendingBuyInput.get(uid); if (c?.timer) clearTimeout(c.timer);   this.pendingBuyInput.delete(uid);
      const d = this.pendingWithdraw.get(uid); if (d?.timer) clearTimeout(d.timer);   this.pendingWithdraw.delete(uid);
      await ctx.reply('취소했습니다.');
      return this.showMainMenu(ctx);
    });

    this.bot.command('set_slippage', async (ctx) => {
      const [, bpsStr] = (ctx.message.text || '').trim().split(/\s+/);
      const bps = Number(bpsStr);
      if (!Number.isFinite(bps) || bps < 1 || bps > 5000) return ctx.reply('형식: /set_slippage &lt;1~5000bps&gt; (예: 100 = 1%)');
      const user = await this.getUser(ctx);
      user.settings = user.settings || {};
      user.settings.slippageBps = bps;
      await user.save();
      return ctx.reply(`✔️ 슬리피지: ${(bps/100).toFixed(2)}%`);
    });

    this.bot.command('set_gasboost', async (ctx) => {
      const [, bpsStr] = (ctx.message.text || '').trim().split(/\s+/);
      const bps = Number(bpsStr);
      if (!Number.isFinite(bps) || bps < 0 || bps > 5000) return ctx.reply('형식: /set_gasboost &lt;0~5000bps&gt; (예: 200 = +2%)');
      const user = await this.getUser(ctx);
      user.settings = user.settings || {};
      user.settings.gasBoostBps = bps;
      await user.save();
      return ctx.reply(`✔️ 가스 부스트: ${(bps/100).toFixed(2)}%`);
    });

    this.bot.command('import', async (ctx) => {
      try {
        const [, pk] = (ctx.message.text || '').trim().split(/\s+/);
        if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
          return ctx.reply(
            '형식: /import &lt;0x로 시작하는 64자 privateKey&gt;\n' +
            '0x로 시작하는 64자리 EVM 프라이빗키(EOA)를 넣어주세요.\n' +
            '지원: MetaMask, Rabby, Trust Wallet, TokenPocket, Coinbase Wallet, Rainbow, imToken, OKX Web3 등'
          );
        }
        const user = await this.getUser(ctx);
        const rec = await encryptOrBuild(this.walletService, pk);
        user.wallet = {
          address: rec.address,
          encryptedPrivateKey: rec.encryptedPrivateKey,
          createdAt: new Date(),
          balance: {
            eth:     user.wallet?.balance?.eth ?? 0,
            usdt:    user.wallet?.balance?.usdt ?? 0,
            virtual: user.wallet?.balance?.virtual ?? 0
          }
        };
         const [eth, stableBal] = await Promise.all([
             getEthBalanceBase(this.base, rec.address),   // ★ 폴백 RPC 헬퍼 사용
             this.getStableBalance(rec.address).catch(()=>0)
           ]);
        user.wallet.balance.eth  = eth;
        user.wallet.balance.usdt = stableBal;
        await user.save();

        let deleted = true;
        try { await ctx.deleteMessage(ctx.message.message_id); }
        catch (_) { deleted = false; }
        if (!deleted) {
          await ctx.reply('🔒 보안: 방금 보낸 개인키 메시지는 사용자가 직접 삭제해 주세요.');
        }
        return ctx.reply(`✅ 지갑이 교체되었습니다: ${this.shorten(rec.address)}`);
      } catch (e) {
        return ctx.reply(`⛔️ 오류: ${e.message}`);
      }
    });

    // 텍스트 커맨드 출금
    this.bot.command('withdraw', async (ctx) => {
      try {
        const parts = (ctx.message.text || '').trim().split(/\s+/);
        if (parts.length !== 4) return ctx.reply('형식: /withdraw &lt;금액&gt; &lt;TOKEN|ETH&gt; &lt;수신주소&gt;');
        const [, amountStr, tokenSym, to] = parts;
        if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return ctx.reply('수신 주소가 올바르지 않습니다.');
        const amount = Number(amountStr);
        if (!Number.isFinite(amount) || amount <= 0) return ctx.reply('금액이 올바르지 않습니다.');
        const user = await this.getUser(ctx);
        return this.performWithdraw(user, amount, tokenSym, to, ctx);
      } catch (e) {
        return ctx.reply(`⛔️ 출금 실패: ${e.message}`);
      }
    });
  }

  /*=============================*
   *           ACTIONS           *
   *=============================*/
  setupActions() {
    this.bot.action('back_main', async (ctx) => { await ctx.answerCbQuery(); return this.showMainMenu(ctx, true); });

    this.bot.action('settings', async (ctx) => this.openSettings(ctx, true));
    this.bot.action(/set_slip_(\d+)/, async (ctx) => {
      const bps = Number(ctx.match[1]);
      const user = await this.getUser(ctx);
      user.settings = user.settings || {};
      user.settings.slippageBps = bps;
      await user.save();
      await ctx.answerCbQuery(`Slippage set to ${(bps/100).toFixed(2)}%`);
      return this.openSettings(ctx, true);
    });
    this.bot.action(/set_gas_(\d+)/, async (ctx) => {
      const bps = Number(ctx.match[1]);
      const user = await this.getUser(ctx);
      user.settings = user.settings || {};
      user.settings.gasBoostBps = bps;
      await user.save();
      await ctx.answerCbQuery(`Gas boost set to ${(bps/100).toFixed(2)}%`);
      return this.openSettings(ctx, true);
    });

    this.bot.action('help', async (ctx) => {
      await ctx.answerCbQuery();
      return ctx.editMessageText(
        `❓ <b>VAIBOT HELP</b>\n\n` +
        `• ${getStableSymbol()} 기축 / Base 체인\n` +
        `• /settings 에서 슬리피지·가스 부스트 설정\n` +
        `• /limit buy|sell &lt;토큰&gt; &lt;가격USD&gt; &lt;수량&gt;\n` +
        `• /withdraw &lt;금액&gt; &lt;TOKEN|ETH&gt; &lt;수신주소&gt;\n` +
        `• Import wallet: 0x로 시작하는 64자리 EVM 프라이빗키(EOA)만 지원\n` +
        `  (MetaMask, Rabby, Trust, TokenPocket, Coinbase, Rainbow, imToken, OKX Web3 등)\n`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '« Back', callback_data: 'back_main' }]] } }
      );
    });

    // Wallet
    this.bot.action('wallet', async (ctx) => {
      await ctx.answerCbQuery();
      const user = await this.getUser(ctx);
      const connected = Boolean(user.wallet?.encryptedPrivateKey);
      const status = connected ? '🔓 Connected' : '🔒 Disconnected (import to trade)';
      const ethBal  = user.wallet.balance?.eth  ?? 0;
      const stableBal = user.wallet.balance?.usdt ?? 0;
      const stable = getStableSymbol();

      return ctx.editMessageText(
        `<b>YOUR VAIBOT WALLET</b>\n\n` +
        `Status: ${status}\n` +
        `Address: <code>${user.wallet.address}</code>\n` +
        `Chain: Base\n` +
        `${stable}: ${this.fmt(stableBal, 2)}\n` +
        `ETH (gas): ${this.fmt(ethBal, 6)}\n\n` +
        `⚠️ <b>절대 시드 문구는 공유하지 마세요.</b>\n` +
        `개인키 표시는 30초 후 자동 삭제됩니다.`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Export Private Key', callback_data: 'export_pk' },
                { text: 'Switch Wallet', callback_data: 'switch_wallet' }
              ],
              [
                { text: 'Disconnect', callback_data: 'disconnect_wallet' },
                { text: 'Security Tips', callback_data: 'security_tips' }
              ],
              [{ text: '« Back', callback_data: 'back_main' }]
            ]
          }
        }
      );
    });

    this.bot.action('export_pk', async (ctx) => {
      await ctx.answerCbQuery();
      const user = await this.getUser(ctx);
      if (!user.wallet?.encryptedPrivateKey) return ctx.reply('🔒 연결된 지갑이 없습니다. Import/Switch로 개인키를 연결하세요.');
      const pk = await this.walletService.getPrivateKey(user.wallet.encryptedPrivateKey);
      const msg = await ctx.replyWithHTML(`🔐 <b>PRIVATE KEY</b>\n\n<code>${pk}</code>\n\n이 메시지는 30초 후 자동 삭제됩니다.`);
      setTimeout(() => { try { ctx.deleteMessage(msg.message_id); } catch (_) {} }, 30000);
    });

    this.bot.action('switch_wallet', async (ctx) => { await ctx.answerCbQuery(); return this.startImportPrompt(ctx); });

    this.bot.action('disconnect_wallet', async (ctx) => {
      await ctx.answerCbQuery();
      return ctx.editMessageText(
        `⚠️ <b>Disconnect wallet</b>\n\n` +
        `이 작업은 현재 지갑의 <b>암호화된 개인키만 제거</b>합니다.\n` +
        `주소는 유지되며, 추후 <b>Import</b>로 다시 연결할 수 있습니다.\n\n` +
        `진행하시겠습니까?`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Yes, disconnect', callback_data: 'disconnect_wallet_confirm' },
               { text: '« Cancel', callback_data: 'wallet' }]
            ]
          }
        }
      );
    });

    this.bot.action('disconnect_wallet_confirm', async (ctx) => {
      await ctx.answerCbQuery('Disconnected');
      const user = await this.getUser(ctx);
      if (user.wallet) { user.wallet.encryptedPrivateKey = null; await user.save(); }
      await ctx.editMessageText(
        `🔒 Wallet disconnected.\n거래를 하려면 Import/Switch로 개인키를 다시 연결하세요.`,
        { reply_markup: { inline_keyboard: [[{ text: 'Import wallet', callback_data: 'import_wallet' }],[{ text: '« Main', callback_data: 'back_main' }]] } }
      );
    });

    this.bot.action('security_tips', async (ctx) => {
      await ctx.answerCbQuery();
      return ctx.editMessageText(
        `🛡 <b>Security Tips</b>\n\n` +
        `• 시드 문구(12/24 단어)는 절대 공유하지 말 것\n` +
        `• 개인키(0x… 64자)는 개인 채팅에서만 사용하고 즉시 삭제\n` +
        `• 큰 자산이 있는 키는 임포트하지 말고, 새 키로 소액 테스트 권장\n` +
        `• Export Private Key는 30초 자동삭제 안내 유지\n` +
        `• .env(WALLET_SECRET), DB, 서버 접근권한 관리에 유의`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '« Back', callback_data: 'wallet' }]] } }
      );
    });

    // Refresh (editMessageText 동일콘텐츠 400 방어)
    this.bot.action('refresh', async (ctx) => {
      await ctx.answerCbQuery('Refreshing balance...');
      const user = await this.getUser(ctx);
      try {
         const [stableBal, eth] = await Promise.all([
            this.getStableBalance(user.wallet.address),
            getEthBalanceBase(this.base, user.wallet.address) // ★
          ]);
        user.wallet.balance = user.wallet.balance || {};
        user.wallet.balance.usdt = stableBal; // 내부키
        user.wallet.balance.eth  = eth;
        await user.save();

        try {
          await this.showMainMenu(ctx, true);
          await ctx.answerCbQuery('Updated ✅');
        } catch (e) {
          const desc = e?.response?.description || '';
          if (e?.response?.error_code === 400 && /message is not modified/i.test(desc)) {
            await ctx.answerCbQuery('Up to date ✅');
            return;
          }
          throw e;
        }
      } catch {
        return ctx.reply('Error checking balance. Please try again.');
      }
    });

    // BUY 메뉴
    this.bot.action('menu_buy', async (ctx) => {
      await ctx.answerCbQuery();
      const text =
        `<b>BUY TOKENS</b>\n\n` +
        `Base 기반 토큰을 컨트랙트 주소로 입력해 매수할 수 있습니다.`;
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Enter Contract Address', callback_data: 'buy_enter_ca' }],
            [{ text: '« Back to Main', callback_data: 'back_main' }]
          ]
        }
      });
    });

    // Enter Contract Address
    this.bot.action('buy_enter_ca', async (ctx) => {
      await ctx.answerCbQuery();
      const uid = String(ctx.from.id);
      const guide =
        `🔎 <b>Base 기반의 토큰 컨트랙트만 조회가 가능합니다.</b>\n` +
        `0x로 시작하는 42자리 주소(또는 Dexscreener/Virtuals URL)를 붙여넣어 주세요.`;
      await ctx.replyWithHTML(guide, {
        reply_markup: { inline_keyboard: [[{ text: '« Cancel', callback_data: 'import_cancel' }, { text: '« Main', callback_data: 'back_main' }]] }
      });
      const prompt = await ctx.reply('여기에 답장으로 컨트랙트 주소를 입력해 주세요.', { reply_markup: { force_reply: true } });
      const timer = setTimeout(() => {
        const s = this.pendingCA.get(uid);
        if (s?.promptId === prompt.message_id) this.pendingCA.delete(uid);
      }, 2 * 60 * 1000);
      this.pendingCA.set(uid, { active: true, promptId: prompt.message_id, timer });
    });

    // X STABLE 버튼 → 금액 입력
    this.bot.action(/buy_x_usdt_(0x[a-fA-F0-9]{40})/, async (ctx) => {
      await ctx.answerCbQuery();
      const uid = String(ctx.from.id);
      const tokenAddress = ctx.match[1];
      const stable = getStableSymbol();
      const min = TOKENS.STABLE_MIN_BUY || 3;
      const prompt = await ctx.reply(`원하시는 ${stable} 수량을 입력하세요 (최소수량 ${min} ${stable} 이상).`, { reply_markup: { force_reply: true } });
      const timer = setTimeout(() => {
        const s = this.pendingBuyInput.get(uid);
        if (s?.promptId === prompt.message_id) this.pendingBuyInput.delete(uid);
      }, 2 * 60 * 1000);
      this.pendingBuyInput.set(uid, { active: true, tokenAddress, promptId: prompt.message_id, timer });
    });

    // Withdraw 버튼 → 대화형 시작
    this.bot.action('withdraw', async (ctx) => {
      await ctx.answerCbQuery();
      const uid = String(ctx.from.id);
      await ctx.editMessageText(
        `💸 <b>WITHDRAW</b>\n\n대화형으로 출금을 진행합니다.\n` +
        `1) 금액 → 2) 토큰(ETH 또는 심볼/주소) → 3) 수신주소 순으로 입력해 주세요.`,
        { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '« Cancel', callback_data: 'withdraw_cancel' }]] } }
      );
      const prompt = await ctx.reply('① 출금 금액을 입력하세요. (예: 25 또는 0.01)', { reply_markup: { force_reply: true } });
      const timer = setTimeout(() => {
        const s = this.pendingWithdraw.get(uid);
        if (s?.promptId === prompt.message_id) this.pendingWithdraw.delete(uid);
      }, 2 * 60 * 1000);
      this.pendingWithdraw.set(uid, { step: 'amount', promptId: prompt.message_id, timer });
    });

    this.bot.action('withdraw_cancel', async (ctx) => {
      await ctx.answerCbQuery('취소했습니다');
      const uid = String(ctx.from.id);
      const s = this.pendingWithdraw.get(uid);
      if (s?.timer) clearTimeout(s.timer);
      this.pendingWithdraw.delete(uid);
      return this.showMainMenu(ctx, true);
    });
  }

  /*=============================*
   *        IMPORT / BUY / WD    *
   *=============================*/
  setupImportFlow() {
    // 공통 Import 프롬프트
    this.startImportPrompt = async (ctx) => {
      const uid = String(ctx.from.id);
      await ctx.replyWithHTML(
        `🔑 <b>Import / Switch wallet</b>\n\n` +
        `이 메시지에 <b>답장</b>으로 <b>개인키</b>를 붙여넣어 주세요.\n` +
        `<b>형식:</b> <code>0x</code>로 시작하는 64자 프라이빗키 (EVM EOA)\n\n` +
        `✅ 지원 지갑: MetaMask, Rabby, Trust, TokenPocket, Coinbase, Rainbow, imToken, OKX Web3 등\n\n` +
        `⚠️ <b>시드 문구(12/24단어)는 절대 보내지 마세요.</b>`,
        { reply_markup: { inline_keyboard: [[{ text: '« Cancel', callback_data: 'import_cancel' }, { text: '« Main', callback_data: 'back_main' }]] } }
      );
      const prompt = await ctx.replyWithHTML(`🔐 <b>여기에 답장으로 개인키(0x… 64자)를 붙여넣어 주세요.</b>`, { reply_markup: { force_reply: true } });
      const timer = setTimeout(() => {
        const s = this.pendingImport.get(uid);
        if (s?.promptId === prompt.message_id) this.pendingImport.delete(uid);
      }, 2 * 60 * 1000);
      this.pendingImport.set(uid, { active: true, promptId: prompt.message_id, timer });
    };

    this.bot.action('import_wallet', async (ctx) => { await ctx.answerCbQuery(); return this.startImportPrompt(ctx); });

    // 공용 취소
    this.bot.action('import_cancel', async (ctx) => {
      await ctx.answerCbQuery('취소했습니다');
      const uid = String(ctx.from.id);
      const a = this.pendingImport.get(uid);   if (a?.timer) clearTimeout(a.timer); this.pendingImport.delete(uid);
      const b = this.pendingCA.get(uid);       if (b?.timer) clearTimeout(b.timer); this.pendingCA.delete(uid);
      const c = this.pendingBuyInput.get(uid); if (c?.timer) clearTimeout(c.timer); this.pendingBuyInput.delete(uid);
      const d = this.pendingWithdraw.get(uid); if (d?.timer) clearTimeout(d.timer); this.pendingWithdraw.delete(uid);
      return this.showMainMenu(ctx, true);
    });

    /*----- Import 개인키 입력 -----*/
    this.bot.on('text', async (ctx, next) => {
      const text = (ctx.message?.text || '').trim();
      if (!text || text.startsWith('/')) return next();

      const uid = String(ctx.from.id);
      const s = this.pendingImport.get(uid);
      if (!s?.active) return next();

      if (s?.timer) clearTimeout(s.timer);
      this.pendingImport.delete(uid);

      // 시드문구/형식 검증
      const words = text.split(/\s+/);
      if (words.length === 12 || words.length === 24) {
        try { await ctx.deleteMessage(ctx.message.message_id); } catch (_) {}
        return ctx.reply('⛔️ 시드 문구는 받지 않습니다. 0x로 시작하는 64자 개인키를 사용하세요.\n필요 시 « Cancel 또는 /cancel');
      }
      if (!/^0x[0-9a-fA-F]{64}$/.test(text)) {
        try { await ctx.deleteMessage(ctx.message.message_id); } catch (_) {}
        return ctx.reply(
          '⛔️ 형식 오류: 0x로 시작하는 64자리 EVM 프라이빗키(EOA)가 필요합니다.\n' +
          '지원: MetaMask, Rabby, Trust, TokenPocket, Coinbase, Rainbow, imToken, OKX Web3 등\n' +
          '필요 시 « Cancel 또는 /cancel'
        );
      }

      try {
        const user = await this.getUser(ctx);
        const rec = await encryptOrBuild(this.walletService, text);

        user.wallet = {
          address: rec.address,
          encryptedPrivateKey: rec.encryptedPrivateKey,
          createdAt: new Date(),
          balance: {
            eth:     user.wallet?.balance?.eth ?? 0,
            usdt:    user.wallet?.balance?.usdt ?? 0,
            virtual: user.wallet?.balance?.virtual ?? 0
          }
        };
         const [eth, stableBal] = await Promise.all([
             getEthBalanceBase(this.base, rec.address),  // ★ 폴백 RPC 헬퍼 사용
             this.getStableBalance(rec.address).catch(()=>0)
           ]);
        user.wallet.balance.eth  = eth;
        user.wallet.balance.usdt = stableBal;
        await user.save();

        let deleted = true;
        try { await ctx.deleteMessage(ctx.message.message_id); }
        catch (_) { deleted = false; }
        if (!deleted) { await ctx.reply('🔒 보안: 방금 보낸 개인키 메시지는 사용자가 직접 삭제해 주세요.'); }

        await ctx.replyWithHTML(`✅ <b>지갑 가져오기 완료</b>\nAddress: <code>${rec.address}</code>`);
        await this.showMainMenu(ctx);
      } catch (e) {
        await ctx.reply(`⛔️ Import 실패: ${e.message}`);
      }
    });

    /*----- 컨트랙트 주소 입력 → 리치 토큰 카드 -----*/
    this.bot.on('text', async (ctx, next) => {
      const text = (ctx.message?.text || '').trim();
      if (!text || text.startsWith('/')) return next();

      const uid = String(ctx.from.id);
      const state = this.pendingCA.get(uid);
      if (!state?.active) return next();

      if (state?.timer) clearTimeout(state.timer);
      this.pendingCA.delete(uid);

      try {
        const addr = parseAddressFromInput(text);
        if (!addr) return ctx.reply('⛔️ 형식 오류: 0x로 시작하는 42자리 주소(또는 지원 URL)가 필요합니다.');

        // ★ 폴백 RPC로 컨트랙트 코드 조회
        const code = await this.base.getCode(addr);
        if (!code || code === '0x') return ctx.reply('⛔️ Base 네트워크의 유효한 컨트랙트가 아닙니다.');

        // ★ 메타 조회도 폴백 getCode를 쓰는 헬퍼 사용
        const meta = await getTokenMeta(this.provider, this.base, addr);
        const agent = await Agent.findOne({ address: new RegExp(`^${addr}$`, 'i') }).lean();

        let price = agent?.priceData?.current;
        let ch5m  = agent?.priceData?.change5m;
        let ch1h  = agent?.priceData?.change1h;
        let ch6h  = agent?.priceData?.change6h;
        let ch24  = agent?.priceData?.change24h;
        let mcap  = agent?.tradingStats?.marketCap;
        let liqUsd = agent?.tradingStats?.liquidityUSD;
        let fdv    = agent?.tradingStats?.fdv;

        if (price == null || ch24 == null || mcap == null || liqUsd == null || fdv == null) {
          // 1순위: GeckoTerminal, 2순위: Dexscreener
          const gt = await this.fetchGeckoTerminalToken(addr);
          if (gt) {
            price = price ?? gt.priceUsd;
            ch1h  = ch1h  ?? gt.change1h;
            ch6h  = ch6h  ?? gt.change6h;
            ch24  = ch24  ?? gt.change24h;
            liqUsd = liqUsd ?? gt.liquidityUsd;
            mcap   = mcap   ?? gt.mcap;
            fdv    = fdv    ?? gt.fdv;
          }
          if ((price == null || ch24 == null || mcap == null || liqUsd == null || fdv == null)) {
            const ds = await this.fetchDexscreenerToken(addr);
            if (ds) {
              price = price ?? ds.priceUsd;
              ch5m  = ch5m  ?? ds.change5m;
              ch1h  = ch1h  ?? ds.change1h;
              ch6h  = ch6h  ?? ds.change6h;
              ch24  = ch24  ?? ds.change24h;
              liqUsd = liqUsd ?? ds.liquidityUsd;
              mcap   = mcap   ?? ds.mcap;
              fdv    = fdv    ?? ds.fdv;
            }
          }
        }

        const user = await this.getUser(ctx);
        const [stableBal, tokBalObj] = await Promise.all([
          this.getStableBalance(user.wallet.address).catch(()=>0),
          this.getTokenBalance(addr, user.wallet.address).catch(()=>({amount:0}))
        ]);
        const tokBal = tokBalObj.amount;
        const stable = getStableSymbol();

        // 가격 임팩트(100 stable) 추정 (실패 시 생략)
        let impactLine = '';
        try {
          const testAmt = 100;
          const q = await this.tradeService.quoteBuy({ token: addr, usdtAmount: testAmt, slippageBps: user.settings?.slippageBps });
          const dec = await this.tradeService.getDecimals(addr).catch(()=>18);
          const estToken = Number(ethers.formatUnits(toBI(q.totalBuyAmount || q.buyAmount), dec));
          if (price && estToken > 0) {
            const estPx = testAmt / estToken;
            const imp   = ((estPx - Number(price)) / Number(price)) * 100;
            const s = (imp >= 0 ? `+${imp.toFixed(2)}` : imp.toFixed(2)) + '%';
            impactLine  = `\n가격 임팩트 (100 ${stable}): ${s}`;
          }
        } catch (_) {}

        const title = `${meta.name || 'Unknown'} (${meta.symbol || 'TOKEN'})`;
        const links =
          `<a href="${dsLink(addr)}">Dexscreener</a> | ` +
          `<a href="${scanLink(addr)}">BaseScan</a> | ` +
          `<a href="${virtualsLink(addr)}">Virtuals</a>`;

        const HR = '──────────────';
        const pct = (v)=> (v === undefined || v === null || Number.isNaN(v) ? '—' : ((v>=0?'+':'') + Number(v).toFixed(2) + '%'));
        const card =
          `<b>${title}</b>\n` +
          `<a href="${scanLink(addr)}">${addr}</a>\n` +
          `${links}\n\n` +
          `가격: ${price ? `$${this.fmt(price, 6)}` : '—'}\n` +
          `5분: ${pct(ch5m)}, 1시간: ${pct(ch1h)}, 6시간: ${pct(ch6h)}, 24시간: ${pct(ch24)}\n` +
          `시가총액: ${mcap ? `$${this.fmt(mcap/1_000_000, 2)}M` : '—'}` +
          ` | 유동성: ${liqUsd ? `$${this.fmt(liqUsd/1_000_000, 2)}M` : '—'}` +
          ` | FDV: ${fdv ? `$${this.fmt(fdv/1_000_000, 2)}M` : '—'}` +
          `${impactLine}\n` +
          `${HR}\n` +
          `<b>내 지갑</b>\n` +
          `${stable}: ${this.fmt(stableBal, 2)}\n` +
          `${meta.symbol || 'TOKEN'}: ${this.fmt(tokBal, 6)}`;

        await ctx.replyWithHTML(card, {
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                { text: `Buy 3 ${stable}`,  callback_data: `buy_confirm_addr_${addr}_3` },
                { text: `Buy 5 ${stable}`,  callback_data: `buy_confirm_addr_${addr}_5` },
                { text: `Buy 8 ${stable}`,  callback_data: `buy_confirm_addr_${addr}_8` },
              ],
              [{ text: `X ${stable}`, callback_data: `buy_x_usdt_${addr}` }],
              [{ text: '« Cancel', callback_data: 'import_cancel' }, { text: '« Back', callback_data: 'menu_buy' }]
            ]
          }
        });
      } catch (e) {
        const msg = /rpc-timeout|All Base RPC/.test(e.message)
          ? '⛔️ 네트워크 응답이 지연되었습니다. 잠시 후 다시 시도해 주세요.'
          : `⛔️ 조회 실패: ${e.message}`;
        return ctx.reply(msg);
      }
    });

    /*----- STABLE 금액 입력 → 견적/확인 -----*/
    this.bot.on('text', async (ctx, next) => {
      const text = (ctx.message?.text || '').trim();
      if (!text || text.startsWith('/')) return next();

      const uid = String(ctx.from.id);
      const s = this.pendingBuyInput.get(uid);
      if (!s?.active) return next();

      if (s?.timer) clearTimeout(s.timer);
      this.pendingBuyInput.delete(uid);

      const amt = Number(text.replace(/[, ]/g, ''));
      const stable = getStableSymbol();
      const min = TOKENS.STABLE_MIN_BUY || 3;
      if (!Number.isFinite(amt)) return ctx.reply('⛔️ 숫자를 입력해 주세요.');
      if (amt < min) return ctx.reply(`⛔️ 최소 수량은 ${min} ${stable}입니다.`);

      try {
        const user = await this.getUser(ctx);
        const stableBal = await this.getStableBalance(user.wallet.address).catch(()=>0);
        if (stableBal < amt) return ctx.reply(`🔴 Insufficient ${stable}.\nHave: ${this.fmt(stableBal)} | Need: ${this.fmt(amt)}`);

        const plan = await this.tradeService.quoteBuy({
          token: s.tokenAddress,
          usdtAmount: amt,
          slippageBps: user.settings?.slippageBps
        });

        const gasCheck = await this.ensureGasForQuote(plan, user.wallet.address, user.settings?.gasBoostBps);
        if (!gasCheck.hasEnough) {
          const needEth = Number(ethers.formatEther(gasCheck.needWei));
          const haveEth = Number(ethers.formatEther(gasCheck.haveWei));
          return ctx.reply(`⚠️ Not enough ETH for gas on Base.\nNeed ≈ ${needEth.toFixed(6)} | Have ≈ ${haveEth.toFixed(6)}`);
        }

        const dec = await this.tradeService.getDecimals(s.tokenAddress).catch(()=>18);
        const estRecv = Number(ethers.formatUnits(toBI(plan.totalBuyAmount || plan.buyAmount), dec));

        // 간단 가스 추정(legs.gas 합 + 현재 gasPrice)
        let estEth = '—';
        try {
          const fee = await this.base.getFeeData();
          const gp = fee.maxFeePerGas || fee.gasPrice || 0n;
          const totalGas = (plan.legs || []).reduce((acc, l) => acc + BigInt(l.gas || 0), 0n);
          estEth = ethers.formatEther(totalGas * gp);
        } catch (_) {}

        const msg =
          `<b>Confirm BUY</b>\n\n` +
          `Token: <code>${s.tokenAddress}</code>\n` +
          `Spend: ${this.fmt(amt)} ${stable}\n` +
          `Route: ${plan.route || 'direct'}\n` +
          `Receive(est): ${this.fmt(estRecv, 6)}\n` +
          `Est. network fee: ${estEth} ETH\n\n` +
          `Proceed?`;

        await ctx.replyWithHTML(msg, {
          reply_markup: { inline_keyboard: [[{ text: `✅ Confirm Buy ${this.fmt(amt)} ${stable}`, callback_data: `buy_confirm_addr_${s.tokenAddress}_${amt}` }],[{ text: '« Back', callback_data: 'menu_buy' }]] }
        });
      } catch (e) {
        return ctx.reply(`⛔️ 견적 실패: ${e.message}`);
      }
    });

    // 빠른 구매 / 확정 체결
    this.bot.action(/buy_confirm_addr_(0x[a-fA-F0-9]{40})_(\d+)/, async (ctx) => {
      await ctx.answerCbQuery();
      const tokenAddress = ctx.match[1];
      const amt = Number(ctx.match[2]);
      const user = await this.getUser(ctx);

      if (!user.wallet?.encryptedPrivateKey) {
        return ctx.editMessageText(
          `🔒 No connected wallet.\nImport/Switch로 개인키를 연결한 뒤 거래해 주세요.`,
          { reply_markup: { inline_keyboard: [[{ text: 'Import wallet', callback_data: 'import_wallet' }],[{ text: '« Back', callback_data: 'back_main' }]] } }
        );
      }

      try {
        const receipt = await this.tradeService.executeBuy({
          userId: user._id, token: tokenAddress, usdtAmount: amt,
          slippageBps: user.settings?.slippageBps, gasBoostBps: user.settings?.gasBoostBps
        });

        await ctx.editMessageText(
          `<b>BUY EXECUTED</b>\nToken: <code>${tokenAddress}</code>\n${getStableSymbol()}: ${this.fmt(amt)}\nTx: <code>${receipt.transactionHash || receipt.hash}</code>`,
          { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'View Portfolio', callback_data: 'menu_portfolio' }],[{ text: 'Buy More', callback_data: 'menu_buy' }],[{ text: '« Main', callback_data: 'back_main' }]] } }
        );
      } catch (e) {
        const uni = `https://app.uniswap.org/#/swap?chain=base&inputCurrency=${encodeURIComponent(getStableAddress())}&outputCurrency=${tokenAddress}`;
        const msg = /유동성이 부족|No liquidity/i.test(e.message)
          ? `⛔️ 매수 실패: 유동성이 부족합니다.\n금액을 줄이거나 아래 링크로 직접 스왑을 시도해 보세요.\nUniswap: ${uni}`
          : `⛔️ 매수 실패: ${e.message}`;
          const opts = {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [[{ text: 'Uniswap 열기', url: uni }],[{ text: '« Back', callback_data: 'menu_buy' }]] }
             };
            try {
            await ctx.editMessageText(msg, opts);
            } catch (err) {
            if (err?.response?.error_code === 400 &&
             /message is not modified/i.test(err?.response?.description || '')) {
            // 이미 같은 내용이면 새 메시지로 안내
            await ctx.replyWithHTML(msg, opts);
            } else {
            throw err;
            }
            }
            
      }
    });

    /*----- 대화형 출금 입력 처리 -----*/
    this.bot.on('text', async (ctx, next) => {
      const text = (ctx.message?.text || '').trim();
      if (!text || text.startsWith('/')) return next();

      const uid = String(ctx.from.id);
      const s = this.pendingWithdraw.get(uid);
      if (!s) return next();
      if (s.timer) clearTimeout(s.timer);

      try {
        if (s.step === 'amount') {
          const amount = Number(text.replace(/[, ]/g, ''));
          if (!Number.isFinite(amount) || amount <= 0) {
            const p = await ctx.reply('❌ 금액이 올바르지 않습니다. 다시 입력해 주세요. (예: 25 또는 0.01)', { reply_markup: { force_reply: true } });
            const t = setTimeout(() => { const st = this.pendingWithdraw.get(uid); if (st?.promptId === p.message_id) this.pendingWithdraw.delete(uid); }, 2 * 60 * 1000);
            this.pendingWithdraw.set(uid, { step: 'amount', promptId: p.message_id, timer: t });
            return;
          }
          const p = await ctx.reply('② 토큰을 입력하세요. (ETH 또는 심볼/컨트랙트 주소)', { reply_markup: { force_reply: true } });
          const t = setTimeout(() => { const st = this.pendingWithdraw.get(uid); if (st?.promptId === p.message_id) this.pendingWithdraw.delete(uid); }, 2 * 60 * 1000);
          this.pendingWithdraw.set(uid, { step: 'token', amount, promptId: p.message_id, timer: t });
          return;
        }

        if (s.step === 'token') {
          const tokenSym = text.trim();
          if (!tokenSym) {
            const p = await ctx.reply('❌ 토큰이 올바르지 않습니다. (예: ETH, USDC, 0x... )', { reply_markup: { force_reply: true } });
            const t = setTimeout(() => { const st = this.pendingWithdraw.get(uid); if (st?.promptId === p.message_id) this.pendingWithdraw.delete(uid); }, 2 * 60 * 1000);
            this.pendingWithdraw.set(uid, { step: 'token', amount: s.amount, promptId: p.message_id, timer: t });
            return;
          }
          const p = await ctx.reply('③ 수신 주소를 입력하세요. (0x로 시작하는 42자리)', { reply_markup: { force_reply: true } });
          const t = setTimeout(() => { const st = this.pendingWithdraw.get(uid); if (st?.promptId === p.message_id) this.pendingWithdraw.delete(uid); }, 2 * 60 * 1000);
          this.pendingWithdraw.set(uid, { step: 'address', amount: s.amount, tokenSym, promptId: p.message_id, timer: t });
          return;
        }

        if (s.step === 'address') {
          const to = text.trim();
          if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
            const p = await ctx.reply('❌ 주소 형식이 올바르지 않습니다. 0x로 시작하는 42자리 주소를 입력하세요.', { reply_markup: { force_reply: true } });
            const t = setTimeout(() => { const st = this.pendingWithdraw.get(uid); if (st?.promptId === p.message_id) this.pendingWithdraw.delete(uid); }, 2 * 60 * 1000);
            this.pendingWithdraw.set(uid, { step: 'address', amount: s.amount, tokenSym: s.tokenSym, promptId: p.message_id, timer: t });
            return;
          }

          const user = await this.getUser(ctx);
          await this.performWithdraw(user, s.amount, s.tokenSym, to, ctx);
          this.pendingWithdraw.delete(uid);
          return;
        }
      } catch (e) {
        this.pendingWithdraw.delete(uid);
        return ctx.reply(`⛔️ 출금 실패: ${e.message}`);
      }
    });
  }

  /*=============================*
   *            VIEWS            *
   *=============================*/
  async openSettings(ctx, isEdit = false) {
    const user = await this.getUser(ctx);
    const slip = user.settings?.slippageBps ?? 100;
    const gas  = user.settings?.gasBoostBps ?? 0;
    const text =
      `<b>Settings</b>\n` +
      `Slippage: ${(slip/100).toFixed(2)}% | Gas boost: ${(gas/100).toFixed(2)}%\n\n` +
      `빠른 설정을 선택하세요.`;
    const kb = { inline_keyboard: [
      [{ text: 'Slippage 1%', callback_data: 'set_slip_100' }, { text: '3%', callback_data: 'set_slip_300' }, { text: '5%', callback_data: 'set_slip_500' }, { text: '10%', callback_data: 'set_slip_1000' }],
      [{ text: 'Gas 0%', callback_data: 'set_gas_0' }, { text: '1%', callback_data: 'set_gas_100' }, { text: '2%', callback_data: 'set_gas_200' }, { text: '5%', callback_data: 'set_gas_500' }],
      [{ text: '« Back', callback_data: 'back_main' }]
    ]};
    if (isEdit) return ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    return ctx.replyWithHTML(text, { reply_markup: kb });
  }

  async openPortfolio(ctx, isEdit = false) {
    const user = await this.getUser(ctx);
    const portfolio = await Portfolio.findOne({ userId: user._id });
    if (!portfolio || portfolio.holdings.length === 0) {
      const msg = `<b>PORTFOLIO</b>\n\n보유 자산이 없습니다.`;
      const kb = { inline_keyboard: [[{ text: 'Buy', callback_data: 'menu_buy' }],[{ text: '« Main', callback_data: 'back_main' }]] };
      return isEdit ? ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: kb }) : ctx.replyWithHTML(msg, { reply_markup: kb });
    }
    let msg = `<b>PORTFOLIO</b>\n━━━━━━━━━━━━━━━━━\n`;
    for (const h of portfolio.holdings) {
      const agent = await Agent.findOne({ symbol: h.symbol });
      if (!agent) continue;
      const value = (h.amount || 0) * (agent.priceData?.current || 0);
      const pl = h.averagePrice ? ((agent.priceData?.current || 0) - h.averagePrice) / h.averagePrice * 100 : 0;
      msg += `\n<b>${h.symbol}</b>\nAmount: ${this.fmt(h.amount, 6)}\nValue: $${this.fmt(value, 2)}\nP/L: ${pl >= 0 ? '+' : ''}${this.fmt(pl, 2)}%\n`;
    }
    const kb = { inline_keyboard: [[{ text: '💸 Sell Tokens', callback_data: 'menu_sell' }],[{ text: '« Back', callback_data: 'back_main' }]] };
    return isEdit ? ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: kb }) : ctx.replyWithHTML(msg, { reply_markup: kb });
  }

  /*------------------ 외부 가격 보완 메서드 -------------------*/
  async fetchDexscreenerToken(addr) {
    try {
      const { data } = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
      const pair = data?.pairs?.[0];
      if (!pair) return null;
      return {
        priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
        change5m:  pair.priceChange?.m5  ?? null,
        change1h:  pair.priceChange?.h1  ?? null,
        change6h:  pair.priceChange?.h6  ?? null,
        change24h: pair.priceChange?.h24 ?? null,
        liquidityUsd: pair.liquidity?.usd ?? null,
        fdv: pair.fdv ?? null,
        mcap: pair.marketCap ?? null
      };
    } catch { return null; }
  }

  async fetchGeckoTerminalToken(addr) {
    try {
      const tok = await axios.get(`https://api.geckoterminal.com/api/v2/networks/base/tokens/${addr}`);
      const t = tok?.data?.data?.attributes || {};
      let liquidityUsd = null;
      try {
        const pools = await axios.get(`https://api.geckoterminal.com/api/v2/networks/base/tokens/${addr}/pools?include=base_token,quote_token&per_page=1`);
        liquidityUsd = pools?.data?.data?.[0]?.attributes?.reserve_in_usd ?? null;
      } catch {}
      return {
        priceUsd:  t?.price_usd ? Number(t.price_usd) : null,
        change5m:  null,
        change1h:  t?.price_change_percentage_1h ?? null,
        change6h:  t?.price_change_percentage_6h ?? null,
        change24h: t?.price_change_percentage_24h ?? null,
        liquidityUsd,
        fdv: t?.fdv_usd ?? null,
        mcap: t?.market_cap_usd ?? null
      };
    } catch { return null; }
  }

  /*---------- Withdraw helper ----------*/
  async performWithdraw(user, amount, tokenSym, to, ctx) {
    if (!user.wallet?.encryptedPrivateKey) return ctx.reply('🔒 연결된 지갑이 없습니다. Import/Switch로 개인키를 연결하세요.');
    const signer = await getWalletFromEncrypted(this.walletService, user.wallet.encryptedPrivateKey, this.provider);


    if (tokenSym.toUpperCase() === 'ETH') {
      const tx = await signer.sendTransaction({ to, value: ethers.parseEther(String(amount)) });
      const rcpt = await tx.wait();
      return ctx.reply(`✅ ETH 출금 완료\nTx: ${rcpt.hash}`);
    }
    const stableUp = getStableSymbol().toUpperCase();
    const symUp = tokenSym.toUpperCase();
    const tokenAddr = (symUp === stableUp) ? getStableAddress() : await this.resolveTokenAddress(tokenSym);

    const erc = new ethers.Contract(tokenAddr, [
      'function decimals() view returns (uint8)',
      'function transfer(address,uint256) returns (bool)'
       ], this.provider); // ★ ethers Provider
    const dec = await erc.decimals();
    const tx = await erc.connect(signer).transfer(to, ethers.parseUnits(String(amount), dec));
    const rcpt = await tx.wait();
    return ctx.reply(`✅ ${symUp} 출금 완료\nTx: ${rcpt.hash}`);
  }

  /*---------- lifecycle ----------*/
  async launch() {
    await this.registerBotMenu();
    this.bot.launch();
    console.log('VAIBOT started - Virtual Protocol Trading Bot');
  }
  stop() { this.bot.stop(); }
}

module.exports = TelegramBot;
