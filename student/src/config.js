const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || 'http://93.125.82.173:5000').replace(/\/$/, '');

export const API_URL = `${BACKEND_URL}/api`;
export const SOCKET_URL = BACKEND_URL;
