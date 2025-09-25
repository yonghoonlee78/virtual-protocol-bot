Virtual Protocol AI Agent Trading Bot PRD v2.0
실습에서 실전까지: MongoDB 기반 풀스택 구현


프로젝트 비전
이 프로젝트는 단순한 실습을 넘어서 실제로 사용 가능한 트레이딩 봇을 만드는 것을 목표로 합니다. 
마치 요리를 배울 때 레시피를 따라하는 것에서 시작해 자신만의 요리를 만들어가는 과정처럼, 이 프로젝트도 기본 구현에서 시작해 점차 고유한 기능을 추가해나갈 수 있도록 설계되었습니다.
Virtual Protocol의 AI 에이전트 생태계는 매일 새로운 에이전트가 등장하고, 각각이 독특한 특성을 가지고 있습니다. 우리의 봇은 이런 다양성을 포용하면서도, 사용자가 쉽게 이해하고 활용할 수 있는 인터페이스를 제공할 것입니다. 
MongoDB의 유연한 구조를 활용해 예측할 수 없는 미래의 변화에도 적응할 수 있는 시스템을 구축합니다.

핵심 기술 스택 (완전 무료 구성)
우리가 선택한 기술 스택은 단순히 무료라서가 아니라, 실제로 많은 성공한 프로젝트들이 채택한 검증된 조합이기 때문입니다. 각 도구가 서로를 완벽하게 보완하면서 강력한 시너지를 만들어냅니다.
백엔드 인프라는 Render.com을 중심으로 구축됩니다. Render는 단순한 호스팅 서비스가 아니라, 자동 배포와 환경 변수 관리, HTTPS 인증서 제공까지 포함된 완전한 플랫폼입니다. 무료 티어의 15분 슬립 제한은 우리가 구현할 자가 호출 메커니즘으로 쉽게 해결할 수 있습니다.
데이터 저장소로 MongoDB Atlas를 선택한 이유는 암호화폐 프로젝트의 특성상 데이터 구조가 자주 변하기 때문입니다. 새로운 AI 에이전트가 등장할 때마다 다른 메타데이터 구조를 가질 수 있는데, MongoDB는 이런 변화를 스키마 마이그레이션 없이 자연스럽게 수용합니다. 512MB 무료 용량은 수만 건의 거래 기록을 저장하기에 충분합니다.

프론트엔드는 Vercel에 배포됩니다. Vercel은 React 앱을 위한 최적의 플랫폼으로, 자동 최적화와 글로벌 CDN을 제공합니다. GitHub과 연동하면 코드를 푸시할 때마다 자동으로 배포되는 마법 같은 경험을 할 수 있습니다.
버전 관리와 협업은 GitHub를 통해 이루어집니다. 단순한 코드 저장소가 아니라, GitHub Actions를 활용한 CI/CD 파이프라인과 프로젝트 관리 도구까지 활용할 수 있습니다.

아키텍처 설계 철학
우리의 아키텍처는 "단순하지만 확장 가능한" 구조를 추구합니다. 처음에는 모놀리식으로 시작하지만, 필요할 때 언제든 마이크로서비스로 분리할 수 있도록 설계합니다.

javascript// 프로젝트 구조: 명확한 책임 분리

virtual-protocol-bot/
├── backend/                 # Render.com에 배포
│   ├── src/
│   │   ├── bot/           # 텔레그램 봇 로직
│   │   │   ├── commands/  # 명령어 핸들러들
│   │   │   ├── scenes/    # 대화형 시나리오
│   │   │   └── middleware/# 봇 미들웨어
│   │   ├── api/           # REST API 엔드포인트
│   │   │   ├── agents/    # AI 에이전트 관련 API
│   │   │   ├── trades/    # 거래 관련 API
│   │   │   └── portfolio/ # 포트폴리오 API
│   │   ├── services/      # 비즈니스 로직
│   │   │   ├── blockchain/# 블록체인 상호작용
│   │   │   ├── trading/   # 거래 실행 로직
│   │   │   └── monitoring/# 모니터링 서비스
│   │   ├── models/        # MongoDB 스키마
│   │   ├── utils/         # 유틸리티 함수
│   │   └── config/        # 설정 파일
│   └── server.js          # 진입점
│
├── frontend/               # Vercel에 배포
│   ├── src/
│   │   ├── components/    # React 컴포넌트
│   │   ├── hooks/        # 커스텀 훅
│   │   ├── contexts/     # Context API
│   │   ├── services/     # API 클라이언트
│   │   └── utils/        # 프론트엔드 유틸
│   └── index.html
│
└── shared/                # 공유 코드
    ├── types/            # TypeScript 타입 정의
    └── constants/        # 공통 상수

데이터 모델 설계 (MongoDB 최적화)

MongoDB의 장점을 최대한 활용하는 데이터 모델을 설계했습니다. 관계형 데이터베이스의 정규화에 얽매이지 않고, 실제 사용 패턴에 최적화된 구조를 만들었습니다.
javascript// models/Agent.js - AI 에이전트 모델
const agentSchema = new mongoose.Schema({
  // 기본 정보 - 모든 에이전트가 공통으로 가짐
  address: { 
    type: String, 
    required: true, 
    unique: true,
    index: true  // 빠른 조회를 위한 인덱스
  },
  name: String,
  symbol: String,
  createdAt: Date,
  creator: String,
  
  // 동적 메타데이터 - 에이전트마다 다를 수 있음
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
    // AIXBT는 { twitterHandle, analysisType, dataSource } 를 가질 수 있고
    // Luna는 { spotifyArtistId, tiktokHandle, genre } 를 가질 수 있음
  },
  
  // 가격 정보 - 임베디드 문서로 저장해 조회 성능 향상
  priceData: {
    current: Number,
    currency: { type: String, default: 'USD' },
    change24h: Number,
    change7d: Number,
    ath: { price: Number, date: Date },
    atl: { price: Number, date: Date },
    lastUpdated: { type: Date, default: Date.now }
  },
  
  // 소셜 지표 - 자주 함께 조회되는 데이터는 함께 저장
  socialMetrics: {
    twitterFollowers: Number,
    twitterEngagement: Number,
    telegramMembers: Number,
    discordMembers: Number,
    lastActivity: Date,
    activityScore: Number  // 우리가 계산한 종합 점수
  },
  
  // 거래 통계 - 집계 데이터는 미리 계산해서 저장
  tradingStats: {
    volume24h: Number,
    trades24h: Number,
    holders: Number,
    liquidity: Number,
    marketCap: Number
  },
  
  // 히스토리 - 시계열 데이터는 배열로 관리
  priceHistory: [{
    price: Number,
    volume: Number,
    timestamp: Date
  }],
  
  // 이벤트 로그 - 중요한 이벤트들을 타임라인으로 저장
  events: [{
    type: String,  // 'launch', 'ath', 'major_trade', 'social_milestone' 등
    description: String,
    data: mongoose.Schema.Types.Mixed,
    timestamp: Date,
    impact: String  // 'high', 'medium', 'low'
  }]
}, {
  timestamps: true,  // createdAt, updatedAt 자동 생성
  // 인덱스 최적화
  indexes: [
    { 'priceData.change24h': -1 },  // 가격 변동 순 정렬용
    { 'socialMetrics.activityScore': -1 },  // 활동 점수 순 정렬용
    { 'tradingStats.volume24h': -1 },  // 거래량 순 정렬용
    { 'events.timestamp': -1 }  // 최신 이벤트 조회용
  ]
});

// 가상 필드 - 계산이 필요한 값들
agentSchema.virtual('trending').get(function() {
  // 트렌딩 점수 계산 로직
  const priceWeight = this.priceData.change24h * 0.3;
  const volumeWeight = (this.tradingStats.volume24h / 1000000) * 0.3;
  const socialWeight = this.socialMetrics.activityScore * 0.4;
  return priceWeight + volumeWeight + socialWeight;
});

// 메서드 - 자주 사용되는 작업들
agentSchema.methods.updatePrice = async function(newPrice) {
  const oldPrice = this.priceData.current;
  this.priceData.current = newPrice;
  this.priceData.change24h = ((newPrice - oldPrice) / oldPrice) * 100;
  
  // ATH/ATL 업데이트
  if (newPrice > this.priceData.ath.price) {
    this.priceData.ath = { price: newPrice, date: new Date() };
    this.events.push({
      type: 'ath',
      description: `New ATH: $${newPrice}`,
      timestamp: new Date(),
      impact: 'high'
    });
  }
  
  // 히스토리에 추가 (최대 1000개 유지)
  this.priceHistory.push({ price: newPrice, timestamp: new Date() });
  if (this.priceHistory.length > 1000) {
    this.priceHistory.shift();
  }
  
  await this.save();
};
사용자 모델도 유연성을 고려해 설계합니다:
javascript// models/User.js - 사용자 모델
const userSchema = new mongoose.Schema({
  // 플랫폼별 식별자 - 텔레그램과 웹 모두 지원
  telegramId: { type: String, sparse: true, unique: true },
  walletAddress: { type: String, sparse: true, unique: true },
  
  profile: {
    username: String,
    firstName: String,
    lastName: String,
    photoUrl: String,
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'UTC' }
  },
  
  // 설정 - 사용자별 맞춤 설정
  settings: {
    notifications: {
      priceAlerts: { type: Boolean, default: true },
      newAgents: { type: Boolean, default: true },
      tradeExecuted: { type: Boolean, default: true },
      threshold: { type: Number, default: 10 }  // 10% 변동시 알림
    },
    trading: {
      defaultSlippage: { type: Number, default: 3 },
      maxGasPrice: Number,
      autoApprove: { type: Boolean, default: false }
    },
    display: {
      currency: { type: String, default: 'USD' },
      theme: { type: String, default: 'light' },
      chartInterval: { type: String, default: '1h' }
    }
  },
  
  // 포트폴리오 - 임베디드로 저장해 빠른 조회
  portfolio: [{
    agentAddress: String,
    agentName: String,
    balance: Number,
    averageBuyPrice: Number,
    invested: Number,
    currentValue: Number,
    pnl: Number,
    pnlPercentage: Number,
    lastUpdated: Date
  }],
  
  // 워치리스트
  watchlist: [{
    agentAddress: String,
    addedAt: Date,
    priceAlert: Number,
    notes: String
  }],
  
  // 거래 히스토리 참조 (별도 컬렉션)
  // 거래가 많을 수 있으므로 임베디드 대신 참조 사용
  tradeCount: { type: Number, default: 0 },
  totalVolume: { type: Number, default: 0 },
  
  // 통계 - 미리 계산된 집계 데이터
  stats: {
    totalTrades: Number,
    successfulTrades: Number,
    totalProfit: Number,
    winRate: Number,
    bestTrade: {
      agentName: String,
      profit: Number,
      date: Date
    },
    worstTrade: {
      agentName: String,
      loss: Number,
      date: Date
    }
  },
  
  // 활동 기록
  lastActive: { type: Date, default: Date.now },
  joinedAt: { type: Date, default: Date.now }
});

// 포트폴리오 가치 계산
userSchema.methods.calculatePortfolioValue = async function() {
  let totalValue = 0;
  let totalPnL = 0;
  
  for (let holding of this.portfolio) {
    const agent = await mongoose.model('Agent').findOne({ 
      address: holding.agentAddress 
    });
    if (agent) {
      holding.currentValue = holding.balance * agent.priceData.current;
      holding.pnl = holding.currentValue - holding.invested;
      holding.pnlPercentage = (holding.pnl / holding.invested) * 100;
      holding.lastUpdated = new Date();
      
      totalValue += holding.currentValue;
      totalPnL += holding.pnl;
    }
  }
  
  await this.save();
  return { totalValue, totalPnL };
};
핵심 기능 구현 계획
이제 각 기능을 어떻게 구현할지 구체적으로 계획해봅시다. 각 기능은 독립적으로 개발할 수 있도록 모듈화되어 있지만, 서로 유기적으로 연결되어 통합된 경험을 제공합니다.
1. AI 에이전트 모니터링 시스템
Virtual Protocol의 에이전트들을 실시간으로 추적하는 것은 이 봇의 핵심입니다. 우리는 세 가지 레벨의 모니터링을 구현합니다:
온체인 모니터링은 블록체인에서 직접 이벤트를 감지합니다. 새로운 에이전트 생성, 대규모 거래, 유동성 변화 등을 실시간으로 포착합니다.
javascript// services/blockchain/agentMonitor.js
class AgentMonitor {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    this.virtualRegistry = new ethers.Contract(
      VIRTUAL_REGISTRY_ADDRESS,
      REGISTRY_ABI,
      this.provider
    );
  }
  
  async startMonitoring() {
    // 새 에이전트 생성 이벤트 감지
    this.virtualRegistry.on('AgentCreated', async (address, name, creator, event) => {
      console.log(`새 AI 에이전트 발견: ${name}`);
      
      // MongoDB에 저장
      const newAgent = await Agent.create({
        address,
        name,
        creator,
        createdAt: new Date(),
        metadata: await this.fetchAgentMetadata(address),
        priceData: await this.fetchInitialPrice(address)
      });
      
      // 실시간으로 사용자들에게 알림
      await this.notifyUsers(newAgent);
      
      // 자동 분석 시작
      this.analyzeNewAgent(newAgent);
    });
    
    // 기존 에이전트들의 가격 모니터링
    setInterval(async () => {
      const agents = await Agent.find({ active: true });
      for (const agent of agents) {
        await this.updateAgentPrice(agent);
      }
    }, 60000); // 1분마다
  }
  
  async analyzeNewAgent(agent) {
    // AI 에이전트의 잠재력 평가
    const analysis = {
      liquidityScore: await this.checkLiquidity(agent.address),
      creatorReputation: await this.analyzeCreator(agent.creator),
      socialBuzz: await this.checkSocialMentions(agent.name),
      technicalIndicators: await this.runTechnicalAnalysis(agent)
    };
    
    // 점수 계산
    agent.metadata.analysisScore = this.calculateScore(analysis);
    await agent.save();
    
    // 높은 점수의 에이전트는 사용자들에게 특별 알림
    if (agent.metadata.analysisScore > 80) {
      await this.sendHighPotentialAlert(agent);
    }
  }
}
소셜 미디어 모니터링은 AI 에이전트들의 활동과 커뮤니티 반응을 추적합니다. Twitter API나 웹 스크래핑을 통해 언급 횟수, 감정 분석, 인플루언서 관심도 등을 측정합니다.
시장 데이터 집계는 여러 DEX의 가격과 거래량을 종합합니다. Uniswap, Aerodrome 등 여러 소스의 데이터를 결합해 가장 정확한 시장 상황을 파악합니다.
2. 스마트 트레이딩 엔진
거래 실행은 단순히 토큰을 교환하는 것이 아니라, 최적의 경로를 찾고, 슬리피지를 최소화하며, MEV 공격을 방어하는 복잡한 과정입니다.
javascript// services/trading/tradingEngine.js
class TradingEngine {
  constructor() {
    this.router = new ethers.Contract(UNISWAP_ROUTER, ROUTER_ABI);
    this.quoter = new ethers.Contract(QUOTER_ADDRESS, QUOTER_ABI);
  }
  
  async executeTrade(userId, tradeParams) {
    // 1. 사전 검증
    const validation = await this.validateTrade(userId, tradeParams);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }
    
    // 2. 최적 경로 탐색
    const routes = await this.findBestRoutes(
      tradeParams.tokenIn,
      tradeParams.tokenOut,
      tradeParams.amount
    );
    
    // 3. 시뮬레이션 실행
    const simulation = await this.simulateTrade(routes[0]);
    if (simulation.slippage > tradeParams.maxSlippage) {
      // 슬리피지가 너무 높으면 여러 작은 거래로 분할
      return await this.executeSplitTrade(tradeParams);
    }
    
    // 4. 트랜잭션 구성
    const tx = await this.buildTransaction(routes[0], tradeParams);
    
    // 5. MEV 보호 적용 (선택적)
    if (tradeParams.mevProtection) {
      tx.data = await this.applyMEVProtection(tx.data);
    }
    
    // 6. 거래 기록 생성
    const trade = await Trade.create({
      userId,
      status: 'pending',
      tokenIn: tradeParams.tokenIn,
      tokenOut: tradeParams.tokenOut,
      amountIn: tradeParams.amount,
      expectedAmountOut: simulation.amountOut,
      route: routes[0],
      timestamp: new Date()
    });
    
    // 7. 실행 준비 완료
    return {
      tradeId: trade._id,
      transaction: tx,
      simulation: simulation,
      estimatedGas: await this.estimateGas(tx)
    };
  }
  
  async executeSplitTrade(params) {
    // 큰 거래를 여러 작은 거래로 분할해 슬리피지 최소화
    const chunks = this.calculateOptimalChunks(params.amount);
    const trades = [];
    
    for (const chunk of chunks) {
      const chunkParams = { ...params, amount: chunk };
      const trade = await this.executeTrade(params.userId, chunkParams);
      trades.push(trade);
      
      // 각 거래 사이에 약간의 지연
      await this.delay(1000);
    }
    
    return trades;
  }
}
3. 실시간 데이터 스트리밍
WebSocket을 통한 실시간 데이터 전송은 사용자 경험의 핵심입니다. 가격 변동, 새로운 거래, 알림 등이 즉시 전달되어야 합니다.
javascript// services/realtime/websocketManager.js
class WebSocketManager {
  constructor(io) {
    this.io = io;
    this.subscriptions = new Map();
    this.priceFeeds = new Map();
  }
  
  initialize() {
    this.io.on('connection', (socket) => {
      console.log(`클라이언트 연결: ${socket.id}`);
      
      // 에이전트별 구독 관리
      socket.on('subscribe:agent', async (agentAddress) => {
        socket.join(`agent:${agentAddress}`);
        
        // 즉시 현재 데이터 전송
        const agent = await Agent.findOne({ address: agentAddress });
        socket.emit('agent:snapshot', agent);
        
        // 실시간 피드 시작
        if (!this.priceFeeds.has(agentAddress)) {
          this.startPriceFeed(agentAddress);
        }
      });
      
      // 포트폴리오 업데이트 구독
      socket.on('subscribe:portfolio', async (userId) => {
        socket.join(`portfolio:${userId}`);
        
        // 포트폴리오 변경 감지
        this.watchPortfolio(userId, socket);
      });
      
      // 전체 시장 데이터 스트리밍
      socket.on('subscribe:market', () => {
        socket.join('market:overview');
        this.streamMarketData(socket);
      });
    });
  }
  
  async startPriceFeed(agentAddress) {
    // DEX에서 실시간 가격 모니터링
    const priceFeed = setInterval(async () => {
      const price = await this.fetchCurrentPrice(agentAddress);
      const agent = await Agent.findOne({ address: agentAddress });
      
      if (agent && Math.abs(price - agent.priceData.current) / agent.priceData.current > 0.001) {
        // 0.1% 이상 변동시에만 업데이트
        await agent.updatePrice(price);
        
        // 구독자들에게 브로드캐스트
        this.io.to(`agent:${agentAddress}`).emit('price:update', {
          address: agentAddress,
          price: price,
          change: ((price - agent.priceData.current) / agent.priceData.current) * 100,
          timestamp: new Date()
        });
        
        // 가격 알림 체크
        await this.checkPriceAlerts(agentAddress, price);
      }
    }, 5000); // 5초마다
    
    this.priceFeeds.set(agentAddress, priceFeed);
  }
  
  async streamMarketData(socket) {
    // 시장 전체 데이터 스트리밍
    const marketInterval = setInterval(async () => {
      const marketData = await this.aggregateMarketData();
      socket.emit('market:update', marketData);
    }, 10000); // 10초마다
    
    socket.on('disconnect', () => {
      clearInterval(marketInterval);
    });
  }
  
  async aggregateMarketData() {
    // MongoDB 집계 파이프라인으로 시장 데이터 생성
    const data = await Agent.aggregate([
      {
        $facet: {
          topGainers: [
            { $sort: { 'priceData.change24h': -1 } },
            { $limit: 5 },
            { $project: { name: 1, symbol: 1, 'priceData.change24h': 1 } }
          ],
          topLosers: [
            { $sort: { 'priceData.change24h': 1 } },
            { $limit: 5 },
            { $project: { name: 1, symbol: 1, 'priceData.change24h': 1 } }
          ],
          mostActive: [
            { $sort: { 'tradingStats.volume24h': -1 } },
            { $limit: 5 },
            { $project: { name: 1, symbol: 1, 'tradingStats.volume24h': 1 } }
          ],
          totalMarketCap: [
            { $group: { _id: null, total: { $sum: '$tradingStats.marketCap' } } }
          ],
          totalVolume24h: [
            { $group: { _id: null, total: { $sum: '$tradingStats.volume24h' } } }
          ]
        }
      }
    ]);
    
    return data[0];
  }
}
4. 텔레그램 봇 인터페이스
텔레그램 봇은 단순한 명령어 처리기가 아니라, 대화형 인터페이스를 제공하는 완전한 애플리케이션입니다.
javascript// bot/telegramBot.js
class VirtualProtocolBot {
  constructor() {
    this.bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
    this.setupCommands();
    this.setupCallbacks();
    this.setupScenes();
  }
  
  setupCommands() {
    // /start - 환영 메시지와 함께 사용자 등록
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      
      // 사용자 확인 또는 생성
      let user = await User.findOne({ telegramId: userId });
      if (!user) {
        user = await User.create({
          telegramId: userId,
          profile: {
            username: msg.from.username,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name
          }
        });
        
        // 환영 메시지
        await this.sendWelcomeMessage(chatId, user);
      } else {
        // 기존 사용자 메인 메뉴
        await this.sendMainMenu(chatId, user);
      }
    });
    
    // /agents - AI 에이전트 목록
    this.bot.onText(/\/agents/, async (msg) => {
      const chatId = msg.chat.id;
      const agents = await Agent.find()
        .sort({ 'priceData.change24h': -1 })
        .limit(10);
      
      const agentList = this.formatAgentList(agents);
      await this.bot.sendMessage(chatId, agentList, {
        parse_mode: 'HTML',
        reply_markup: this.createAgentKeyboard(agents)
      });
    });
    
    // /trade - 거래 시작
    this.bot.onText(/\/trade/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      
      // 거래 대화 시작
      await this.startTradeConversation(chatId, userId);
    });
  }
  
  async startTradeConversation(chatId, userId) {
    // 단계별 거래 프로세스
    const conversation = {
      step: 1,
      userId: userId,
      tradeData: {}
    };
    
    this.conversations.set(chatId, conversation);
    
    await this.bot.sendMessage(chatId, 
      '거래를 시작합니다! 먼저 구매할 AI 에이전트를 선택해주세요:',
      {
        reply_markup: {
          inline_keyboard: await this.createAgentSelectionKeyboard()
        }
      }
    );
  }
  
  formatAgentList(agents) {
    let message = '🤖 <b>Top AI Agents by Virtual Protocol</b>\n\n';
    
    agents.forEach((agent, index) => {
      const emoji = agent.priceData.change24h > 0 ? '📈' : '📉';
      const change = agent.priceData.change24h.toFixed(2);
      
      message += `${index + 1}. <b>${agent.name}</b> (${agent.symbol})\n`;
      message += `   가격: $${agent.priceData.current.toFixed(4)}\n`;
      message += `   24h: ${emoji} ${change}%\n`;
      message += `   거래량: $${(agent.tradingStats.volume24h / 1000).toFixed(1)}k\n\n`;
    });
    
    message += '자세한 정보를 보려면 아래 버튼을 선택하세요.';
    return message;
  }
  
  async sendPriceAlert(user, agent, oldPrice, newPrice) {
    const changePercent = ((newPrice - oldPrice) / oldPrice * 100).toFixed(2);
    const emoji = newPrice > oldPrice ? '🚀' : '💔';
    
    const message = `
${emoji} <b>가격 알림!</b>

<b>${agent.name}</b> (${agent.symbol})
이전 가격: $${oldPrice.toFixed(4)}
현재 가격: $${newPrice.toFixed(4)}
변동률: ${changePercent}%

${Math.abs(changePercent) > 20 ? '⚠️ 큰 변동입니다! 주의하세요!' : ''}
    `;
    
    await this.bot.sendMessage(user.telegramId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '📊 차트 보기', callback_data: `chart_${agent.address}` },
          { text: '💱 거래하기', callback_data: `trade_${agent.address}` }
        ]]
      }
    });
  }
}
5. React 웹 대시보드
웹 인터페이스는 텔레그램 봇보다 풍부한 시각화와 복잡한 인터랙션을 제공합니다.
javascript// frontend/src/App.jsx
import React, { useState, useEffect, useContext } from 'react';
import { Web3Provider } from './contexts/Web3Context';
import { SocketProvider } from './contexts/SocketContext';
import { DataProvider } from './contexts/DataContext';

function App() {
  return (
    <Web3Provider>
      <SocketProvider>
        <DataProvider>
          <Router>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/agents" element={<AgentExplorer />} />
                <Route path="/agent/:address" element={<AgentDetail />} />
                <Route path="/portfolio" element={<Portfolio />} />
                <Route path="/trade" element={<TradingInterface />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Layout>
          </Router>
        </DataProvider>
      </SocketProvider>
    </Web3Provider>
  );
}

// 대시보드 컴포넌트
function Dashboard() {
  const { agents, portfolio, marketData } = useData();
  const { socket } = useSocket();
  const [realTimeData, setRealTimeData] = useState({});
  
  useEffect(() => {
    // 실시간 데이터 구독
    socket.emit('subscribe:market');
    
    socket.on('market:update', (data) => {
      setRealTimeData(data);
    });
    
    return () => {
      socket.off('market:update');
    };
  }, [socket]);
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
      {/* 포트폴리오 요약 */}
      <Card className="col-span-full">
        <CardHeader>
          <h2 className="text-2xl font-bold">포트폴리오 가치</h2>
        </CardHeader>
        <CardContent>
          <PortfolioSummary portfolio={portfolio} />
        </CardContent>
      </Card>
      
      {/* 시장 개요 */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">시장 현황</h3>
        </CardHeader>
        <CardContent>
          <MarketOverview data={realTimeData} />
        </CardContent>
      </Card>
      
      {/* 상승 TOP 5 */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">🚀 상승 TOP 5</h3>
        </CardHeader>
        <CardContent>
          <TopMovers agents={realTimeData.topGainers} direction="up" />
        </CardContent>
      </Card>
      
      {/* 거래량 TOP 5 */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">🔥 거래량 TOP 5</h3>
        </CardHeader>
        <CardContent>
          <MostActive agents={realTimeData.mostActive} />
        </CardContent>
      </Card>
      
      {/* 실시간 차트 */}
      <Card className="col-span-full">
        <CardHeader>
          <h3 className="text-lg font-semibold">실시간 가격 차트</h3>
        </CardHeader>
        <CardContent>
          <RealTimeChart />
        </CardContent>
      </Card>
      
      {/* 최근 거래 */}
      <Card className="col-span-full">
        <CardHeader>
          <h3 className="text-lg font-semibold">최근 거래 내역</h3>
        </CardHeader>
        <CardContent>
          <RecentTrades />
        </CardContent>
      </Card>
    </div>
  );
}

// 실시간 차트 컴포넌트
function RealTimeChart() {
  const { selectedAgent } = useContext(DataContext);
  const { socket } = useSocket();
  const [chartData, setChartData] = useState([]);
  
  useEffect(() => {
    if (selectedAgent) {
      socket.emit('subscribe:agent', selectedAgent.address);
      
      socket.on('price:update', (update) => {
        setChartData(prev => {
          const newData = [...prev, {
            time: update.timestamp,
            price: update.price
          }];
          
          // 최대 100개 데이터 포인트 유지
          if (newData.length > 100) {
            newData.shift();
          }
          
          return newData;
        });
      });
    }
    
    return () => {
      socket.off('price:update');
    };
  }, [selectedAgent, socket]);
  
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="time" 
          tickFormatter={(time) => new Date(time).toLocaleTimeString()}
        />
        <YAxis />
        <Tooltip />
        <Line 
          type="monotone" 
          dataKey="price" 
          stroke="#8b5cf6" 
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
개발 타임라인 (14일 스프린트)
개발은 2주 스프린트로 진행됩니다. 매일 구체적인 목표를 설정하고, 작동하는 기능을 하나씩 완성해나갑니다.
Week 1: 기반 구축
Day 1-2에는 프로젝트 구조를 설정하고 기본 환경을 구성합니다. GitHub 레포지토리를 만들고, Render, MongoDB Atlas, Vercel 계정을 설정합니다.
Day 3-4에는 MongoDB 스키마를 구현하고 기본 CRUD 작업을 테스트합니다. Agent와 User 모델을 만들고, 샘플 데이터로 쿼리를 테스트합니다.
Day 5-6에는 텔레그램 봇의 기본 명령어를 구현하고, Express API 서버를 구축합니다. /start, /help, /agents 같은 기본 명령어가 작동하도록 합니다.
Day 7에는 React 앱의 기본 구조를 만들고, 라우팅과 레이아웃을 설정합니다.
Week 2: 핵심 기능 구현
Day 8-9에는 블록체인 연동을 구현합니다. Base 체인에 연결하고, Virtual Protocol 컨트랙트에서 데이터를 읽어옵니다.
Day 10-11에는 WebSocket 서버를 구축하고 실시간 데이터 스트리밍을 구현합니다. 가격 업데이트가 실시간으로 프론트엔드에 반영되도록 합니다.
Day 12에는 거래 실행 로직을 구현합니다. 트랜잭션을 준비하고 MetaMask와 연동하는 기능을 만듭니다.
Day 13에는 전체 시스템을 통합 테스트하고, 버그를 수정합니다.
Day 14에는 문서화를 완성하고, 프로덕션에 배포합니다.
성공 지표와 다음 단계
이 프로젝트의 성공은 단순히 기능이 작동하는 것을 넘어, 실제로 유용한 도구가 되는 것입니다.
기술적 성공 지표로는 99% 이상의 가동률, 1초 미만의 API 응답 시간, 그리고 실시간 데이터 지연 5초 미만을 목표로 합니다.
사용자 경험 지표로는 직관적인 인터페이스로 학습 곡선 최소화, 명확한 에러 메시지와 복구 가이드, 그리고 모바일과 데스크톱 모두에서 일관된 경험을 제공합니다.
MVP 완성 후에는 자동 거래 전략 구현, AI 기반 가격 예측, 소셜 센티먼트 분석, 포트폴리오 최적화 제안 등의 고급 기능을 추가할 수 있습니다.
마무리
이 PRD는 단순한 문서가 아니라, 실제로 구현 가능한 로드맵입니다. MongoDB의 유연성, Render의 간편함, 그리고 React의 표현력을 결합해 강력한 트레이딩 봇을 만들 수 있습니다.
가장 중요한 것은 시작하는 것입니다. 완벽한 계획을 기다리지 말고, 첫 번째 커밋을 푸시하세요. 코드를 작성하면서 배우고, 사용자 피드백을 받으면서 개선해나가는 것이 진짜 개발입니다.
이 프로젝트를 통해 단순히 트레이딩 봇을 만드는 것이 아니라, 현대적인 풀스택 개발의 전체 사이클을 경험하게 될 것입니다. 블록체인과의 상호작용, 실시간 데이터 처리, 사용자 인터페이스 설계, 그리고 프로덕션 배포까지 모든 과정을 거치면서 진정한 개발자로 성장할 수 있습니다.