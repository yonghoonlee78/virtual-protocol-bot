// frontend/src/pages/Trade.tsx
import React, { useState } from 'react';
import '../styles/Trade.css';

interface Token {
  symbol: string;
  balance: number;
  price: number;
  value: number;
}

const Trade: React.FC = () => {
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [fromToken, setFromToken] = useState('ETH');
  const [toToken, setToToken] = useState('VIRTUAL');
  const [amount, setAmount] = useState('');
  
  // 임시 토큰 리스트
  const tokens = ['ETH', 'VIRTUAL', 'AIXBT', 'LUNA', 'VADER', 'GAME'];

  const connectWallet = async () => {
    // 실제로는 Web3 지갑 연결
    // 지금은 시뮬레이션
    const mockAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
    setWalletAddress(mockAddress);
    setWalletConnected(true);
  };

  const handleSwap = () => {
    if (!amount) {
      alert('Please enter amount');
      return;
    }
    console.log(`Swapping ${amount} ${fromToken} to ${toToken}`);
    // 실제 스왑 로직은 나중에 구현
  };

  const switchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
  };

  return (
    <div className="trade-page">
      <div className="page-header">
        <h1>💱 Trade</h1>
        {walletConnected && (
          <div className="wallet-info">
            <span className="wallet-address">
              {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
            <button className="disconnect-btn" onClick={() => setWalletConnected(false)}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      {!walletConnected ? (
        <div className="connect-wallet-section">
          <h2>Connect Your Wallet</h2>
          <p>Connect your wallet to start trading Virtual Protocol tokens</p>
          <button className="connect-wallet-btn" onClick={connectWallet}>
            🔗 Connect Wallet
          </button>
        </div>
      ) : (
        <div className="swap-container">
          <div className="swap-card">
            <h2>Swap Tokens</h2>
            
            <div className="swap-section">
              <label>From</label>
              <div className="token-input">
                <select 
                  value={fromToken} 
                  onChange={(e) => setFromToken(e.target.value)}
                  className="token-select"
                >
                  {tokens.filter(t => t !== toToken).map(token => (
                    <option key={token} value={token}>{token}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="amount-input"
                />
              </div>
              <div className="balance">Balance: 10.5 {fromToken}</div>
            </div>

            <button className="switch-btn" onClick={switchTokens}>
              ↕️
            </button>

            <div className="swap-section">
              <label>To</label>
              <div className="token-input">
                <select 
                  value={toToken} 
                  onChange={(e) => setToToken(e.target.value)}
                  className="token-select"
                >
                  {tokens.filter(t => t !== fromToken).map(token => (
                    <option key={token} value={token}>{token}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="0.0"
                  value={amount ? (parseFloat(amount) * 950).toFixed(2) : ''}
                  readOnly
                  className="amount-input"
                />
              </div>
              <div className="balance">Balance: 0 {toToken}</div>
            </div>

            <div className="swap-info">
              <div className="info-row">
                <span>Rate</span>
                <span>1 {fromToken} = 950 {toToken}</span>
              </div>
              <div className="info-row">
                <span>Slippage</span>
                <span>0.5%</span>
              </div>
              <div className="info-row">
                <span>Network Fee</span>
                <span>~$2.50</span>
              </div>
            </div>

            <button 
              className="swap-btn" 
              onClick={handleSwap}
              disabled={!amount || parseFloat(amount) <= 0}
            >
              Swap
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Trade;