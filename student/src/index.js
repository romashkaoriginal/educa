import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

async function ensureFreshTelegramBundle() {
  try {
    const res = await fetch(`/version.json?nocache=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!res.ok) return;

    const { v } = await res.json();
    if (!v) return;

    const storageKey = 'educa_app_v';
    const stored = localStorage.getItem(storageKey);
    const urlV = new URLSearchParams(window.location.search).get('v');

    if (stored && stored !== v && urlV !== String(v)) {
      localStorage.setItem(storageKey, String(v));
      const next = new URL(window.location.href);
      next.searchParams.set('v', String(v));
      window.location.replace(next.toString());
      return new Promise(() => {});
    }

    localStorage.setItem(storageKey, String(v));
  } catch (_) {
    /* offline / dev */
  }
}

async function boot() {
  await ensureFreshTelegramBundle();

  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.expand();
    Promise.resolve(tg.disableVerticalSwipes?.()).catch(() => {});
    Promise.resolve(tg.enableClosingConfirmation?.()).catch(() => {});
    tg.setHeaderColor('#1E40AF');
    tg.setBackgroundColor('#EAF3FA');
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

boot();
