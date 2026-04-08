// This file renders the sign-in form and handles the frontend side of logging a user in.
import React, { useState } from 'react';
import { API_URL, isApiConfigured } from '../../config';
import { isValidEmail } from '../../utils/validation';
import './AuthForm.css';

const SignInForm = ({ onRouteChange, loadUser }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);   // ← Loading state

  // Handles the full sign-in flow for the form.
  const handleSignIn = async () => {
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
    setIsLoading(true);
    // Render can be slow on first request, so show a gentle status message.
    const slowServerTimer = setTimeout(() => {
      setStatusMessage('Server is taking longer than usual. It may be waking up, please wait...');
    }, 4000);

    try {
      const response = await fetch(`${API_URL}/signin`, {
        method: 'post',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim()
        })
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else if (data.id) {
        loadUser(data);
        onRouteChange('home');
      } else {
        setError('Sign in failed. Try again.');
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setError('Backend server is unavailable. Try again later.');
    } finally {
      clearTimeout(slowServerTimer);
      setIsLoading(false);
    }
  };

  return (
    <article className="br3 ba dark-gray b--black-10 mv4 w-100 w-50-m w-25-l mw6 shadow-5 center">
      <main className="pa4 black-80">
        <div className="measure">
          <fieldset id="sign_in" className="ba b--transparent ph0 mh0">
            <legend className="f1 fw6 ph0 mh0">Sign In</legend>

            {error && <p className="form-message form-message-error">{error}</p>}
            {!error && statusMessage && <p className="form-message form-message-status">{statusMessage}</p>}

            <div className="mt3">
              <label className="db fw6 lh-copy f6">Email</label>
              <input
                className="pa2 input-reset ba bg-transparent w-100"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="mv3">
              <label className="db fw6 lh-copy f6">Password</label>
              <input
                className="b pa2 input-reset ba bg-transparent w-100"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </fieldset>

          <div>
            <input
              className="b ph3 pv2 input-reset ba b--black bg-transparent grow pointer f6"
              type="submit"
              value={isLoading ? "Signing in..." : "Sign in"}
              onClick={handleSignIn}
              disabled={isLoading}
            />
          </div>

          <div className="lh-copy mt3">
            <p onClick={() => onRouteChange('register')} className="f6 link dim black db pointer">
              Register
            </p>
          </div>
        </div>
      </main>
    </article>
  );
};

export default SignInForm;
