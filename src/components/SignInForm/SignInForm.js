// This file renders sign in, Google sign in, guest mode, and account recovery actions.
import React, { useState } from 'react';
import axios from 'axios';
import { API_URL, isApiConfigured } from '../../config';
import { storeAuthToken } from '../../utils/auth';
import { isValidEmail } from '../../utils/validation';
import GoogleSignInButton from './GoogleSignInButton';
import './AuthForm.css';

const SignInForm = ({ onRouteChange, loadUser, onGuestMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [canResendVerification, setCanResendVerification] = useState(false);

  const completeSignIn = (data) => {
    // Store the JWT first, then App can load protected user/history data.
    storeAuthToken(data.token);
    loadUser(data.user);
    onRouteChange('home');
  };

  const handleSignIn = async () => {
    // Validate before calling the backend so users get instant feedback for simple mistakes.
    if (!email.trim() || !password.trim()) {
      setError('* All fields are required');
      return;
    }

    if (!isValidEmail(email.trim())) {
      setError('Enter a valid email address');
      return;
    }

    if (!isApiConfigured) {
      setError('App configuration is missing the backend API URL.');
      return;
    }

    setError('');
    setStatusMessage('');
    setCanResendVerification(false);
    setIsLoading(true);

    // Free backend hosting can be asleep; this message explains a slow first request.
    const slowServerTimer = setTimeout(() => {
      setStatusMessage('Server waking up, please wait...');
    }, 3000);

    try {
      const response = await axios.post(`${API_URL}/signin`, {
        email: email.trim(),
        password: password.trim()
      });

      completeSignIn(response.data);
    } catch (err) {
      const message = err.response?.data || 'Backend server is unavailable. Try again later.';
      setError(message);
      setCanResendVerification(String(message).toLowerCase().includes('verify'));
    } finally {
      clearTimeout(slowServerTimer);
      setIsLoading(false);
    }
  };

  const handleGoogleCredential = async (credential) => {
    // Google gives the browser a credential; the backend verifies it before trusting the user.
    if (!isApiConfigured) {
      setError('App configuration is missing the backend API URL.');
      return;
    }

    setError('');
    setStatusMessage('Signing in with Google...');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/google`, { credential });
      completeSignIn(response.data);
    } catch (err) {
      setError(err.response?.data || 'Google sign-in failed.');
    } finally {
      setStatusMessage('');
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    // Resending needs a valid email because the user may not be signed in yet.
    if (!isValidEmail(email.trim())) {
      setError('Enter your email first, then resend verification.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_URL}/resend-verification`, { email: email.trim() });
      setStatusMessage(response.data.message || 'Verification email sent.');
      setCanResendVerification(false);
    } catch (err) {
      setError(err.response?.data || 'Unable to resend verification email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <article className="surface-card auth-card">
      <main className="auth-main">
        <p className="auth-kicker">Ocula face analysis</p>
        <h1 className="auth-title">Sign in</h1>

        <div className="measure auth-form-stack">
          <fieldset id="sign_in" className="ba b--transparent ph0 mh0">
            <legend className="clip">Sign In</legend>

            {error && <p className="form-message form-message-error">{error}</p>}
            {!error && statusMessage && <p className="form-message form-message-status">{statusMessage}</p>}
            {canResendVerification && (
              <button className="auth-link-button" onClick={handleResendVerification} type="button" disabled={isLoading}>
                Resend verification email
              </button>
            )}

            <div className="mt3">
              <label className="db fw6 lh-copy f6">Email</label>
              <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
            </div>

            <div className="mv3">
              <label className="db fw6 lh-copy f6">Password</label>
              <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
            </div>
          </fieldset>

          <button className="button-primary auth-primary-button" type="button" onClick={handleSignIn} disabled={isLoading} aria-busy={isLoading}>
            {isLoading && <span className="auth-button-spinner" aria-hidden="true"></span>}
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="auth-divider">or</div>

          <GoogleSignInButton onCredential={handleGoogleCredential} disabled={isLoading} />

          <button className="button-muted auth-secondary-button" type="button" onClick={() => onGuestMode()} disabled={isLoading}>
            Continue as guest
          </button>

          <div className="auth-links">
            <p onClick={() => onRouteChange('register')} className="auth-link">Register</p>
            <p onClick={() => onRouteChange('forgot-password')} className="auth-link">Forgot password?</p>
          </div>
        </div>
      </main>
    </article>
  );
};

export default SignInForm;
