const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'https://kubik-ct.online').replace(/\/$/, '');

export const API_URL = `${BACKEND_URL}/api`;
export const SOCKET_URL = BACKEND_URL;
