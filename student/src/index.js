import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Инициализация Telegram Web App
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  Promise.resolve(tg.disableVerticalSwipes?.()).catch(() => {});
  Promise.resolve(tg.enableClosingConfirmation?.()).catch(() => {});
  tg.setHeaderColor('#1E40AF');
  tg.setBackgroundColor('#EAF3FA');

  console.log('✅ Telegram Web App инициализирован');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);