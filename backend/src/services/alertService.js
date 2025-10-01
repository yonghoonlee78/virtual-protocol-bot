// backend/src/services/alertService.js
const PriceAlert = require('../models/PriceAlert');
const Agent = require('../models/Agent');
const User = require('../models/User');

class AlertService {
  constructor(bot) {
    this.bot = bot;
  }
  
  async checkAlerts() {
    try {
      // 활성 알림 가져오기
      const alerts = await PriceAlert.find({ 
        isActive: true, 
        triggered: false 
      }).populate('userId');
      
      for (const alert of alerts) {
        const agent = await Agent.findOne({ address: alert.agentAddress });
        
        if (!agent) continue;
        
        const currentPrice = agent.priceData.current;
        let shouldTrigger = false;
        
        // 조건 체크
        if (alert.condition === 'above' && currentPrice >= alert.targetPrice) {
          shouldTrigger = true;
        } else if (alert.condition === 'below' && currentPrice <= alert.targetPrice) {
          shouldTrigger = true;
        }
        
        if (shouldTrigger) {
          // 알림 발송
          await this.sendAlert(alert, currentPrice);
          
          // 알림 상태 업데이트
          alert.triggered = true;
          alert.triggeredAt = new Date();
          await alert.save();
        }
      }
    } catch (error) {
      console.error('Error checking alerts:', error);
    }
  }
  
  async sendAlert(alert, currentPrice) {
    const user = alert.userId;
    if (!user || !user.telegramId) return;
    
    const message = 
      `🚨 PRICE ALERT 🚨\n\n` +
      `${alert.symbol} has gone ${alert.condition} your target!\n\n` +
      `Target: $${alert.targetPrice}\n` +
      `Current: $${currentPrice.toFixed(6)}\n\n` +
      `Alert has been triggered and removed.`;
    
    try {
      await this.bot.telegram.sendMessage(user.telegramId, message);
      console.log(`Alert sent to user ${user.telegramId}`);
    } catch (error) {
      console.error(`Failed to send alert to ${user.telegramId}:`, error);
    }
  }
}

module.exports = AlertService;