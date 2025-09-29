// backend/src/bot/telegramBot.js
const { Telegraf } = require('telegraf');
const User = require('../models/User');
const Agent = require('../models/Agent');

class TelegramBot {
  constructor(token) {
    this.bot = new Telegraf(token);
    this.setupCommands();
  }

  setupCommands() {
    // /start 명령어
    this.bot.start(async (ctx) => {
      const telegramId = ctx.from.id.toString();
      const { first_name, username } = ctx.from;

      // 사용자 찾기 또는 생성
      let user = await User.findOne({ telegramId });
      if (!user) {
        user = await User.create({
          telegramId,
          profile: {
            firstName: first_name,
            username
          }
        });
      }

      await ctx.reply(
        '🤖 Welcome to Virtual Protocol Trading Bot!\n\n' +
        '📋 Available commands:\n' +
        '/agents - View AI agents\n' +
        '/help - Show all commands'
      );
    });

    // /agents 명령어
    this.bot.command('agents', async (ctx) => {
      try {
        const agents = await Agent.find()
          .sort({ 'priceData.change24h': -1 })
          .limit(5);
        
        if (agents.length === 0) {
          return ctx.reply('No agents found yet.');
        }

        let message = '📊 AI Agents List:\n\n';
        agents.forEach((agent, i) => {
          const change = agent.priceData.change24h || 0;
          const emoji = change > 0 ? '📈' : '📉';
          message += `${i+1}. ${agent.name} (${agent.symbol})\n`;
          message += `   Price: $${agent.priceData.current}\n`;
          message += `   24h: ${emoji} ${change}%\n\n`;
        });

        await ctx.reply(message);
      } catch (error) {
        console.error('Error:', error);
        await ctx.reply('Error fetching agents.');
      }
    });

    // /help 명령어
    this.bot.help((ctx) => {
      ctx.reply(
        '📚 Bot Commands:\n\n' +
        '/start - Start the bot\n' +
        '/agents - List AI agents\n' +
        '/help - Show this message'
      );
    });

    // 에러 처리
    this.bot.catch((err, ctx) => {
      console.error('Bot error:', err);
    });
  }

  launch() {
    this.bot.launch();
    console.log('🤖 Telegram bot started');
  }
}

module.exports = TelegramBot;