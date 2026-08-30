import React, { useState } from 'react';
import axios from 'axios';
import { API_URL, isApiConfigured } from '../../config';
import './AuthForm.css';

const ResetPassword = ({ onRouteChange }) => {
  const params = new URLSearchParams(window.location.search);
  const email = params.get('email') || '';
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleReset = async () => {
    if (!email || !token) {
      setError('Reset link is missing required data.');
      return;
    }

    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!isApiConfigured) {
      setError('App configuration is missing the backend API URL.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_URL}/reset-password`, { email, token, password: password.trim() });
      setMessage(response.data.message || 'Password reset successful.');
    } catch (err) {
      setError(err.response?.data || 'Unable to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <article className="auth-card">
      <main className="auth-main">
        <p className="auth-kicker">Ocula secure link</p>
        <h1 className="auth-title">Choose a new password</h1>

        {error && <p className="form-message form-message-error">{error}</p>}
        {message && <p className="form-message form-message-status">{message}</p>}

        <label className="auth-label">New password</label>
        <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />

        <button className="auth-primary-button" onClick={handleReset} disabled={isLoading}>
          {isLoading ? 'Resetting...' : 'Reset password'}
        </button>

        <button className="auth-link-button" onClick={() => onRouteChange('signin')} type="button">
          Back to sign in
        </button>
      </main>
    </article>
  );
};

export default ResetPassword;
