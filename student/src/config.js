const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || 'https://kubik-ct.online').replace(/\/$/, '');

export const API_URL = `${BACKEND_URL}/api`;
export const SOCKET_URL = BACKEND_URL;
