require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const Agent = require('./src/models/Agent');
const User = require('./src/models/User');
const TelegramBot = require('./src/bot/telegramBot');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API 라우트
app.get('/api', (req, res) => {
  res.json({ 
    message: 'Virtual Protocol Trading Bot API',
    version: '1.0.0'
  });
});

app.post('/api/agents', async (req, res) => {
  try {
    const agent = new Agent({
      address: `0x${Math.random().toString(16).substr(2, 40)}`,
      name: 'Test Agent',
      symbol: 'TEST',
      createdAt: new Date(),
      priceData: {
        current: 1.0,
        change24h: 5.2
      }
    });
    
    await agent.save();
    res.json({ success: true, agent });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all agents
app.get('/api/agents', async (req, res) => {
  try {
    const agents = await Agent.find();
    res.json(agents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// MongoDB 연결 및 봇 시작 (한 번만!)
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('✅ MongoDB connected');
      
      // 텔레그램 봇 시작
      if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== 'your_telegram_bot_token') {
        const bot = new TelegramBot(process.env.BOT_TOKEN);
        bot.launch();
      } else {
        console.log('⚠️ Telegram bot token not configured');
      }
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));
} else {
  console.log('⚠️ MongoDB URI not configured');
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
});

// Graceful shutdown
process.once('SIGINT', () => process.exit(0));
process.once('SIGTERM', () => process.exit(0));