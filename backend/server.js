require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');

// Models
const Agent = require('./src/models/Agent');
const User = require('./src/models/User');

// Services
const BaseProvider = require('./src/services/blockchain/baseProvider');
const AgentSyncService = require('./src/services/blockchain/agentSync');
const PriceService = require('./src/services/priceService');
const AlertService = require('./src/services/alertService');


// Optional routers (존재하면 마운트, 없으면 건너뜀)
function tryRequire(path) {
  try { return require(path); } catch (_) { return null; }
}
const agentsRouter = tryRequire('./src/routes/agents');
const blockchainRouter = tryRequire('./src/routes/blockchain');
const tradeRouter = tryRequire('./src/routes/trade');

// WebSocket 일원화 (services/websocket.js)
const setupWebSocket = tryRequire('./src/services/websocket');

const app = express();
const server = http.createServer(app);

// Socket.IO 초기화
const io = setupWebSocket ? setupWebSocket(server) : (() => {
  // services/websocket.js가 없다면 임시 기본 설정
  const socketIO = require('socket.io');
  return socketIO(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });
})();

// 전역 참조 (서비스/핸들러에서 emit 활용)
global.io = io;

// Global variables
let botInstance = null;
let priceUpdateInterval = null;
let alertCheckInterval = null;

// Middleware
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3001';
app.use(helmet());
app.use(cors({
origin: (origin, cb) => {
if (!origin) return cb(null, true);
const allowed = (process.env.FRONTEND_ORIGIN || 'http://localhost:3001')
.split(',').map(s => s.trim());
cb(null, allowed.includes(origin));
  },
methods: ['GET','POST','PUT','DELETE','OPTIONS'],
credentials: true,
allowedHeaders: ['Content-Type', 'Authorization']
  }));

app.use(express.json({ limit: process.env.JSON_LIMIT || '100kb' }));
app.use(morgan('dev'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({ message: 'Virtual Protocol Trading Bot API', version: '1.0.0' });
});

/**
 * ===== 라우트 마운트 =====
 * 각 파일이 express.Router()를 내보낼 때만 마운트합니다.
 * (빈 파일/미구현이어도 서버가 죽지 않도록 안전장치)
 */
function isRouter(x) { return typeof x === 'function'; }

// /api/agents
if (isRouter(agentsRouter)) {
  app.use('/api/agents', agentsRouter);
} else {
  // 폴백: 기존 인라인 구현
  app.get('/api/agents', async (req, res) => {
    try {
      const agents = await Agent.find({ symbol: { $ne: 'TEST' } })
        .sort({ 'priceData.current': -1 });
      res.json(agents);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// /api/blockchain (status는 여기서 계속 제공)
if (isRouter(blockchainRouter)) app.use('/api/blockchain', blockchainRouter);

app.get('/api/blockchain/status', async (req, res) => {
  try {
    const provider = new BaseProvider();
    const blockNumber = await provider.getBlockNumber();
    res.json({ chain: 'Base', chainId: 8453, blockNumber });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// /api/trade (USDT 기축 매수/매도)
if (isRouter(tradeRouter)) {
  app.use('/api/trade', tradeRouter);
} else {
  console.warn('⚠️  /api/trade 라우터가 없습니다. (패치를 적용해 주세요)');
}

// WebSocket — 최초 연결 시 에이전트 목록 1회 전송
io.on('connection', (socket) => {
  console.log('👤 Client connected');

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  Agent.find({ symbol: { $ne: 'TEST' } })
    .then(agents => socket.emit('agents', agents))
    .catch(err => console.error('Error fetching agents:', err));

  socket.on('disconnect', () => {
    console.log('👤 Client disconnected');
  });
});

// MongoDB & Services initialization
async function initializeServices() {
  if (!process.env.MONGODB_URI) {
    console.log('⚠️ MongoDB URI not configured');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');

     // Blockchain sync (옵션)
    if (process.env.DISABLE_AGENT_SYNC === 'true') {
     console.log('⏭️  Agent sync disabled via env');
      } else {
       try {
        const syncService = new AgentSyncService();
          await syncService.syncAgentsFromBlockchain();
           console.log('✅ Blockchain sync complete');
            } catch (error) {
           console.error('❌ Blockchain sync error:', error.message);
            }
          }

    // Price service (주기적 가격 업데이트 → 소켓 브로드캐스트)
    try {
      const priceService = new PriceService(io);
      await priceService.updateAllPrices();
      priceUpdateInterval = setInterval(() => {
        priceService.updateAllPrices();
      }, 30 * 60 * 1000); // 30 minutes
      console.log('✅ Price service started');
    } catch (error) {
      console.error('❌ Price service error:', error.message);
    }

    // Telegram bot (USDT 기축 커맨드 포함)
    if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== 'your_telegram_bot_token') {
      try {
        const TelegramBot = require('./src/bot/telegramBot');
        botInstance = new TelegramBot(process.env.BOT_TOKEN);
        botInstance.launch();
        global.bot = botInstance.bot;
        console.log('✅ Telegram bot started');

        // Alert service (가격 알림 등)
        setTimeout(() => {
          if (botInstance && botInstance.bot) {
            const alertService = new AlertService(botInstance.bot);
            alertCheckInterval = setInterval(() => {
              alertService.checkAlerts();
            }, 60 * 1000); // 1 minute
            console.log('📢 Alert service started');
          }
        }, 2000);
      } catch (error) {
        console.error('❌ Bot error:', error.stack || error);
      }
    } else {
      console.log('⚠️ Telegram bot token not configured');
    }

  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  await initializeServices();
});

let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n${signal} received. Shutting down...`);

  try {
    // 1) 주기 작업 정리
    if (priceUpdateInterval) clearInterval(priceUpdateInterval);
    if (alertCheckInterval) clearInterval(alertCheckInterval);

    // 2) 텔레그램 봇 정지(있으면)
    try { botInstance?.stop?.(); } catch (_) {}

    // 3) 소켓 닫기
    try { io?.close?.(); } catch (_) {}

    // 4) HTTP 서버 닫기 (콜백 → Promise 래핑)
    await new Promise((resolve) => server.close(resolve));

    // 5) Mongo 연결 종료 (콜백 없이 await)
    await mongoose.connection.close(false); // 또는: await mongoose.disconnect();

    console.log('✅ Shutdown complete');
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
  } finally {
    process.exit(0);
  }
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGUSR2', async () => { await gracefulShutdown('SIGUSR2'); process.kill(process.pid, 'SIGUSR2'); });
process.on('unhandledRejection', (r) => console.error('unhandledRejection:', r));
process.on('uncaughtException', (e) => { console.error('uncaughtException:', e); });

module.exports = { app, server, io };
