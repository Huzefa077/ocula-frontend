const rawApiUrl = process.env.REACT_APP_API_URL;

// Clean the URL once here so the rest of the app can reuse it safely.
export const API_URL = rawApiUrl ? rawApiUrl.replace(/\/$/, '') : '';

export const isApiConfigured = Boolean(API_URL);
