// backend/src/services/snipeService.js
const Agent = require('../models/Agent');
const User = require('../models/User');
const Portfolio = require('../models/Portfolio');
const Trade = require('../models/Trade');

class SnipeService {
  constructor() {
    this.activeSnipes = new Map();
  }

  async startSnipe(userId, strategy) {
    const user = await User.findById(userId);
    if (!user.walletAddress) {
      throw new Error('Wallet not connected');
    }

    // 스나이핑 모니터링 시작
    const interval = setInterval(async () => {
      await this.checkSnipeConditions(userId, strategy);
    }, 5000); // 5초마다 체크

    this.activeSnipes.set(userId, interval);
    
    // 사용자 설정 업데이트
    user.snipeSettings.enabled = true;
    await user.save();

    return true;
  }

  async stopSnipe(userId) {
    const interval = this.activeSnipes.get(userId);
    if (interval) {
      clearInterval(interval);
      this.activeSnipes.delete(userId);
    }

    const user = await User.findById(userId);
    user.snipeSettings.enabled = false;
    await user.save();

    return true;
  }

  async checkSnipeConditions(userId, strategy) {
    const user = await User.findById(userId);
    
    switch (strategy) {
      case 'new':
        await this.checkNewTokens(user);
        break;
      case 'pump':
        await this.checkPumps(user);
        break;
      case 'volume':
        await this.checkVolumeSurge(user);
        break;
      case 'gem':
        await this.checkGems(user);
        break;
    }
  }

  async checkNewTokens(user) {
    // 새로 리스팅된 토큰 체크 로직
    const recentAgents = await Agent.find({
      createdAt: { $gte: new Date(Date.now() - 60000) } // 1분 이내
    });

    for (const agent of recentAgents) {
      if (agent.tradingStats.liquidity > 10000) { // 최소 유동성
        await this.executeSnipeBuy(user, agent);
      }
    }
  }

  async checkPumps(user) {
    // 가격 급등 토큰 체크
    const agents = await Agent.find({
      'priceData.change24h': { $gt: 20 } // 20% 이상 상승
    });

    for (const agent of agents) {
      if (agent.tradingStats.volume24h > 50000) { // 볼륨 조건
        await this.executeSnipeBuy(user, agent);
      }
    }
  }

  async executeSnipeBuy(user, agent) {
    const amount = user.snipeSettings.maxBuy;
    const price = agent.priceData.current;
    
    // 포트폴리오에 추가
    let portfolio = await Portfolio.findOne({ userId: user._id });
    if (!portfolio) {
      portfolio = new Portfolio({ userId: user._id, holdings: [] });
    }

    const existingIndex = portfolio.holdings.findIndex(
      h => h.symbol === agent.symbol
    );

    if (existingIndex < 0) { // 이미 보유중이 아닌 경우만
      portfolio.holdings.push({
        agentAddress: agent.address,
        symbol: agent.symbol,
        amount: amount / price, // ETH를 토큰 개수로 변환
        averagePrice: price
      });

      await portfolio.save();

      // 거래 기록
      await Trade.create({
        userId: user._id,
        type: 'buy',
        symbol: agent.symbol,
        amount: amount / price,
        price: price,
        totalValue: amount,
        status: 'completed'
      });

      // 텔레그램 알림 (필요시)
      if (global.bot && user.notifications.enabled) {
        global.bot.telegram.sendMessage(
          user.telegramId,
          `🎯 SNIPE EXECUTED!\n\n` +
          `Bought ${agent.symbol}\n` +
          `Amount: ${(amount/price).toFixed(2)} tokens\n` +
          `Price: $${price.toFixed(6)}\n` +
          `Total: ${amount} ETH`
        );
      }
    }
  }
}

module.exports = SnipeService;