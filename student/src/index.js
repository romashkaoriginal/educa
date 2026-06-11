import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Инициализация Telegram Web App
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand(); // Полный экран
  tg.disableVerticalSwipes(); // Блокировка свайпа вниз
  tg.enableClosingConfirmation(); // Подтверждение при закрытии
  tg.setHeaderColor('#1E40AF'); // Цвет header (синий)
  tg.setBackgroundColor('#EAF3FA'); // Фон как у контента — без белой полосы при overscroll
  
  console.log('✅ Telegram Web App инициализирован');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);