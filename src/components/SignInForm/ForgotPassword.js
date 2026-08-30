import React, { useState } from 'react';
import axios from 'axios';
import { API_URL, isApiConfigured } from '../../config';
import { isValidEmail } from '../../utils/validation';
import './AuthForm.css';

const ForgotPassword = ({ onRouteChange }) => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!isValidEmail(email.trim())) {
      setError('Enter a valid email address');
      return;
    }

    if (!isApiConfigured) {
      setError('App configuration is missing the backend API URL.');
      return;
    }

    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_URL}/forgot-password`, { email: email.trim() });
      setMessage(response.data.message || 'If that email exists, a reset link has been sent.');
    } catch (err) {
      setError(err.response?.data || 'Unable to start password reset.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <article className="auth-card">
      <main className="auth-main">
        <p className="auth-kicker">Ocula account help</p>
        <h1 className="auth-title">Reset password</h1>
        <p className="auth-subtitle">Enter your email and we will send a reset link if the account exists.</p>

        {error && <p className="form-message form-message-error">{error}</p>}
        {message && <p className="form-message form-message-status">{message}</p>}

        <label className="auth-label">Email</label>
        <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />

        <button className="auth-primary-button" onClick={handleSubmit} disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Send reset link'}
        </button>

        <button className="auth-link-button" onClick={() => onRouteChange('signin')} type="button">
          Back to sign in
        </button>
      </main>
    </article>
  );
};

export default ForgotPassword;
