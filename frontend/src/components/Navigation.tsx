// frontend/src/components/Navigation.tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navigation.css';

const Navigation: React.FC = () => {
  const location = useLocation();
  
  const menuItems = [
    { path: '/', label: 'Dashboard', icon: '📊' },
    { path: '/agents', label: 'AI Agents', icon: '🤖' },
    { path: '/portfolio', label: 'Portfolio', icon: '💼' },
    { path: '/trade', label: 'Trade', icon: '💱' },
    { path: '/settings', label: 'Settings', icon: '⚙️' }
  ];
  
  return (
    <nav className="navigation">
      <div className="nav-brand">
        <h2>🚀 Virtual Protocol Bot</h2>
      </div>
      
      <ul className="nav-menu">
        {menuItems.map((item) => (
          <li key={item.path}>
            <Link 
              to={item.path} 
              className={location.pathname === item.path ? 'active' : ''}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      
      <div className="nav-footer">
        <div className="connection-status">
          <span className="status-dot"></span>
          Connected to Base
        </div>
      </div>
    </nav>
  );
};

export default Navigation;