const TOKEN_KEY = 'ocula_auth_token';
const USER_KEY = 'ocula_auth_user';
const GUEST_MODE_KEY = 'ocula_guest_mode';

export const getStoredAuthToken = () => localStorage.getItem(TOKEN_KEY) || '';

export const storeAuthToken = (token) => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
};

export const getStoredAuthUser = () => {
  try {
    const rawUser = localStorage.getItem(USER_KEY);
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
};

export const storeAuthUser = (user) => {
  if (user?.id) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
};

export const clearAuthToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export const clearStoredAuthUser = () => {
  localStorage.removeItem(USER_KEY);
};

export const clearAuthSession = () => {
  clearAuthToken();
  clearStoredAuthUser();
};

export const enableGuestMode = () => {
  sessionStorage.setItem(GUEST_MODE_KEY, 'true');
};

export const clearGuestMode = () => {
  sessionStorage.removeItem(GUEST_MODE_KEY);
};

export const isGuestModeEnabled = () => sessionStorage.getItem(GUEST_MODE_KEY) === 'true';

export const buildAuthHeaders = () => {
  const token = getStoredAuthToken();

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`
  };
};
