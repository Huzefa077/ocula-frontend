const TOKEN_KEY = 'ocula_auth_token';

export const getStoredAuthToken = () => localStorage.getItem(TOKEN_KEY) || '';

export const storeAuthToken = (token) => {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
};

export const clearAuthToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export const buildAuthHeaders = () => {
  const token = getStoredAuthToken();

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`
  };
};
