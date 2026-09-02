// This file renders the registration form and starts email verification.
import React, { useState } from 'react';
import axios from 'axios';
import { API_URL, isApiConfigured } from '../../config';
import { storeAuthToken } from '../../utils/auth';
import { isValidEmail } from '../../utils/validation';
import GoogleSignInButton from '../SignInForm/GoogleSignInButton';
import '../SignInForm/AuthForm.css';

const Register = ({ onRouteChange, loadUser }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const completeGoogleRegister = (data) => {
    // Google auth can create or return an account, so it finishes like a normal sign in.
    storeAuthToken(data.token);
    loadUser(data.user);
    onRouteChange('home');
  };

  const handleRegister = async () => {
    // Keep the most common validation errors on the client before creating an account.
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('* All fields are required');
      return;
    }

    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    if (!isValidEmail(email.trim())) {
      setError('Enter a valid email address');
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
    setStatusMessage('');
    setIsLoading(true);

    // Show a friendly delay message if the hosted backend is waking up.
    const slowServerTimer = setTimeout(() => {
      setStatusMessage('Server is taking longer than usual. It may be waking up, please wait...');
    }, 4000);

    try {
      const response = await axios.post(`${API_URL}/register`, {
        name: name.trim(),
        email: email.trim(),
        password: password.trim()
      });

      setStatusMessage(response.data.message || 'Account created. Please verify your email.');
    } catch (err) {
      setError(err.response?.data || 'Backend server is unavailable. Try again later.');
    } finally {
      clearTimeout(slowServerTimer);
      setIsLoading(false);
    }
  };

  const handleGoogleCredential = async (credential) => {
    // The same Google endpoint supports registration and sign-in on the backend.
    if (!isApiConfigured) {
      setError('App configuration is missing the backend API URL.');
      return;
    }

    setError('');
    setStatusMessage('Creating account with Google...');
    setIsLoading(true);

    try {
      // The backend verifies Google's ID token, then creates or finds the user.
      const response = await axios.post(`${API_URL}/auth/google`, { credential });
      completeGoogleRegister(response.data);
    } catch (err) {
      setError(err.response?.data || 'Google registration failed.');
    } finally {
      setStatusMessage('');
      setIsLoading(false);
    }
  };

  return (
    <article className="surface-card auth-card">
      <main className="auth-main">
        <p className="auth-kicker">Create your Ocula account</p>
        <h1 className="auth-title">Register</h1>
        <p className="auth-subtitle">After registering, verify your email before signing in.</p>

        <div className="measure auth-form-stack">
          <fieldset id="sign_up" className="ba b--transparent ph0 mh0">
            <legend className="clip">Register</legend>

            {error && <p className="form-message form-message-error">{error}</p>}
            {!error && statusMessage && <p className="form-message form-message-status">{statusMessage}</p>}

            <div className="mt3">
              <label className="db fw6 lh-copy f6">Name</label>
              <input className="auth-input" type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={isLoading} />
            </div>

            <div className="mt3">
              <label className="db fw6 lh-copy f6">Email</label>
              <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
            </div>

            <div className="mv3">
              <label className="db fw6 lh-copy f6">Password</label>
              <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
            </div>
          </fieldset>

          <button className="button-primary auth-primary-button" type="button" onClick={handleRegister} disabled={isLoading} aria-busy={isLoading}>
            {isLoading && <span className="auth-button-spinner" aria-hidden="true"></span>}
            {isLoading ? 'Registering...' : 'Register'}
          </button>

          <div className="auth-divider">or</div>

          <GoogleSignInButton onCredential={handleGoogleCredential} disabled={isLoading} />

          <button className="auth-link-button" onClick={() => onRouteChange('signin')} type="button">
            Back to sign in
          </button>
        </div>
      </main>
    </article>
  );
};

export default Register;
