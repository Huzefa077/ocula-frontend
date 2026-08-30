// This file keeps the frontend API URL setup in one place so the app uses one consistent backend address.
const rawApiUrl = process.env.REACT_APP_API_URL;

// Clean the URL once here so the rest of the app can reuse it safely.
export const API_URL = rawApiUrl ? rawApiUrl.replace(/\/$/, '') : '';

export const isApiConfigured = Boolean(API_URL);
export const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';
export const isGoogleSignInConfigured = Boolean(GOOGLE_CLIENT_ID);

const rawMaintenanceMode = (process.env.REACT_APP_MAINTENANCE_MODE || 'off').trim().toLowerCase();
const allowedMaintenanceModes = ['off', 'notice', 'block'];

export const MAINTENANCE_MODE = allowedMaintenanceModes.includes(rawMaintenanceMode)
  ? rawMaintenanceMode
  : 'off';

export const maintenanceConfig = {
  mode: MAINTENANCE_MODE,
  title: process.env.REACT_APP_MAINTENANCE_TITLE || 'Ocula is being updated',
  message: process.env.REACT_APP_MAINTENANCE_MESSAGE || 'Some parts of the app may change while maintenance is in progress.',
  instruction: process.env.REACT_APP_MAINTENANCE_INSTRUCTION || '',
  retryAfter: process.env.REACT_APP_MAINTENANCE_RETRY_AFTER || ''
};

export const isMaintenanceNotice = MAINTENANCE_MODE === 'notice';
export const isMaintenanceBlocking = MAINTENANCE_MODE === 'block';
