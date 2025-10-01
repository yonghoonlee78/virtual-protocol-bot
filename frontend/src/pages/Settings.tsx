// frontend/src/pages/Settings.tsx
import React, { useState, useEffect } from 'react';
import '../styles/Settings.css';

const Settings: React.FC = () => {
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState({
    priceAlerts: true,
    tradeConfirmations: true,
    newsUpdates: false
  });
  const [slippage, setSlippage] = useState('0.5');
  const [language, setLanguage] = useState('en');
  const [currency, setCurrency] = useState('USD');

  useEffect(() => {
    // 로컬 스토리지에서 설정 불러오기
    const savedSettings = localStorage.getItem('botSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setDarkMode(settings.darkMode ?? true);
      setNotifications(settings.notifications ?? notifications);
      setSlippage(settings.slippage ?? '0.5');
      setLanguage(settings.language ?? 'en');
      setCurrency(settings.currency ?? 'USD');
    }
  }, []);

  const saveSettings = () => {
    const settings = {
      darkMode,
      notifications,
      slippage,
      language,
      currency
    };
    localStorage.setItem('botSettings', JSON.stringify(settings));
    alert('Settings saved successfully!');
  };

  const resetSettings = () => {
    if (window.confirm('Are you sure you want to reset all settings to default?')) {
      localStorage.removeItem('botSettings');
      setDarkMode(true);
      setNotifications({
        priceAlerts: true,
        tradeConfirmations: true,
        newsUpdates: false
      });
      setSlippage('0.5');
      setLanguage('en');
      setCurrency('USD');
    }
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>⚙️ Settings</h1>
      </div>

      <div className="settings-container">
        {/* Appearance */}
        <div className="settings-section">
          <h2>🎨 Appearance</h2>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Dark Mode</span>
              <span className="setting-description">Toggle dark/light theme</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={darkMode}
                onChange={(e) => setDarkMode(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        {/* Notifications */}
        <div className="settings-section">
          <h2>🔔 Notifications</h2>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Price Alerts</span>
              <span className="setting-description">Get notified when price targets are hit</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={notifications.priceAlerts}
                onChange={(e) => setNotifications({...notifications, priceAlerts: e.target.checked})}
              />
              <span className="slider"></span>
            </label>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Trade Confirmations</span>
              <span className="setting-description">Confirm before executing trades</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={notifications.tradeConfirmations}
                onChange={(e) => setNotifications({...notifications, tradeConfirmations: e.target.checked})}
              />
              <span className="slider"></span>
            </label>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">News Updates</span>
              <span className="setting-description">Receive Virtual Protocol news</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={notifications.newsUpdates}
                onChange={(e) => setNotifications({...notifications, newsUpdates: e.target.checked})}
              />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        {/* Trading */}
        <div className="settings-section">
          <h2>💱 Trading</h2>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Slippage Tolerance</span>
              <span className="setting-description">Maximum price slippage for trades</span>
            </div>
            <select 
              className="setting-select"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            >
              <option value="0.1">0.1%</option>
              <option value="0.5">0.5%</option>
              <option value="1">1%</option>
              <option value="3">3%</option>
            </select>
          </div>
        </div>

        {/* Localization */}
        <div className="settings-section">
          <h2>🌍 Localization</h2>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Language</span>
              <span className="setting-description">Display language</span>
            </div>
            <select 
              className="setting-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="ko">한국어</option>
              <option value="zh">中文</option>
              <option value="ja">日本語</option>
            </select>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Currency</span>
              <span className="setting-description">Display currency</span>
            </div>
            <select 
              className="setting-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="KRW">KRW (₩)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="settings-actions">
          <button className="save-btn" onClick={saveSettings}>
            Save Settings
          </button>
          <button className="reset-btn" onClick={resetSettings}>
            Reset to Default
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;