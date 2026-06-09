const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || 'https://ct-kubik.by').replace(/\/$/, '');

export const API_URL = `${BACKEND_URL}/api`;
export const SOCKET_URL = BACKEND_URL;
