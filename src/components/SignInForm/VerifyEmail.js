import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL, isApiConfigured } from '../../config';
import { storeAuthToken } from '../../utils/auth';
import './AuthForm.css';

const VerifyEmail = ({ loadUser, onRouteChange }) => {
  const [message, setMessage] = useState('Verifying your email...');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get('email');
    const token = params.get('token');

    async function verifyEmail() {
      if (!email || !token) {
        setError('Verification link is missing required data.');
        return;
      }

      if (!isApiConfigured) {
        setError('App configuration is missing the backend API URL.');
        return;
      }

      try {
        const response = await axios.post(`${API_URL}/verify-email`, { email, token });
        storeAuthToken(response.data.token);
        loadUser(response.data.user);
        setMessage('Email verified. Taking you to Ocula...');
        setTimeout(() => onRouteChange('home'), 700);
      } catch (err) {
        setError(err.response?.data || 'Unable to verify email.');
      }
    }

    verifyEmail();
  }, [loadUser, onRouteChange]);

  return (
    <article className="auth-card">
      <main className="auth-main">
        <p className="auth-kicker">Ocula secure link</p>
        <h1 className="auth-title">Email verification</h1>
        {error ? <p className="form-message form-message-error">{error}</p> : <p className="form-message form-message-status">{message}</p>}
        <button className="auth-link-button" onClick={() => onRouteChange('signin')} type="button">
          Back to sign in
        </button>
      </main>
    </article>
  );
};

export default VerifyEmail;
