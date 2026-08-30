import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { installGlobalErrorReporting, reportClientError } from './utils/errorReporter';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('KUBIK render failed:', error, errorInfo);
    reportClientError({
      message: error?.message || 'Ошибка отрисовки приложения',
      stack: error?.stack,
      code: 'REACT_RENDER_ERROR',
      area: 'application',
      action: 'render',
      context: { componentStack: errorInfo?.componentStack }
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="boot-error" role="alert">
          <div className="boot-error__panel">
            <h1>Не удалось открыть KUBIK</h1>
            <p>Обновите приложение. Ваши ответы в домашнем задании сохраняются на этом устройстве.</p>
            <button type="button" onClick={() => window.location.reload()}>Обновить</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

async function ensureFreshTelegramBundle() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(`/version.json?nocache=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
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
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function safeTelegramCall(callback) {
  try {
    const result = callback();
    Promise.resolve(result).catch(() => {});
  } catch (_) {
    /* Telegram bridge methods differ between client versions. */
  }
}

function boot() {
  installGlobalErrorReporting();
  // Проверка версии не должна оставлять Mini App пустым при плохой сети.
  // Если найден новый bundle, ensureFreshTelegramBundle сам перезагрузит страницу.
  ensureFreshTelegramBundle();

  const tg = window.Telegram?.WebApp;
  if (tg) {
    safeTelegramCall(() => tg.expand());
    safeTelegramCall(() => tg.disableVerticalSwipes?.());
    safeTelegramCall(() => tg.enableClosingConfirmation?.());
    safeTelegramCall(() => tg.setHeaderColor('#1E40AF'));
    safeTelegramCall(() => tg.setBackgroundColor('#EAF3FA'));
  }

  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>
  );
}

boot();
