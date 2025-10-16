// backend/src/config/tokens.js
module.exports = {
    CHAIN_ID: 8453,
  
    // 기축 스테이블
    STABLE_SYMBOL: process.env.STABLE_SYMBOL || 'USDC',
    STABLE_ADDRESS: process.env.BASE_STABLE_ADDRESS,
    STABLE_DECIMALS: parseInt(process.env.STABLE_DECIMALS || '6', 10),
  
    // 최소 매수 금액(기축 기준, USDC/USDT 등) – 기본 3
    STABLE_MIN_BUY: parseFloat(process.env.STABLE_MIN_BUY || '3'),
  
    WETH: process.env.BASE_WETH_ADDRESS || '0x4200000000000000000000000000000000000006',
    ZEROX_QUOTE_URL: process.env.ZEROX_BASE_QUOTE_URL || 'https://base.api.0x.org/swap/v1/quote',
    DEFAULT_SLIPPAGE_BPS: parseInt(process.env.DEFAULT_SLIPPAGE_BPS || '100', 10),
  
    // 레거시 호환
    USDT: process.env.BASE_USDT_ADDRESS
  };
  
  