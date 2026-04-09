// This file renders the sign-in form and handles the frontend side of logging a user in.
import React, { useState } from 'react';
import axios from 'axios';
import { API_URL, isApiConfigured } from '../../config';
import { isValidEmail } from '../../utils/validation';
import './AuthForm.css';

const SignInForm = ({ onRouteChange, loadUser }) => {
  // Track the email value typed by the user.
  const [email, setEmail] = useState('');
  // Track the password value typed by the user.
  const [password, setPassword] = useState('');
  // Hold validation or server errors that should be shown above the form.
  const [error, setError] = useState('');
  // Hold a temporary status message while the backend is still responding.
  const [statusMessage, setStatusMessage] = useState('');
  // Lock the form while a sign-in request is in progress.
  const [isLoading, setIsLoading] = useState(false);

  // Handles the full sign-in flow for the form.
  const handleSignIn = async () => {
    // Require both fields before continuing.
    if (!email.trim() || !password.trim()) {
      setError('* All fields are required');
      return;
    }

    // Validate the email format on the frontend first.
    if (!isValidEmail(email.trim())) {
      setError('Enter a valid email address');
      return;
    }

    // Stop here if the app does not know where the backend lives.
    if (!isApiConfigured) {
      setError('App configuration is missing the backend API URL.');
      return;
    }

    // Reset any previous messages and show the loading state.
    setError('');
    setStatusMessage('');
    setIsLoading(true);

    // Render can be slow on first request, so show a gentle status message.
    const slowServerTimer = setTimeout(() => {
      setStatusMessage('Server is taking longer than usual. It may be waking up, please wait...');
    }, 3000);

    try {
      // Old fetch version for comparison:
      // const response = await fetch(`${API_URL}/signin`, {
        //   method: 'post',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({
      //     email: email.trim(),
      //     password: password.trim()
      //   })
      // });
      // const data = await response.json();
      
      
      // Axios gives the parsed backend JSON directly in response.data.
      const response = await axios.post(`${API_URL}/signin`, {
        email: email.trim(),
        password: password.trim()
      });

      const data = response.data;

      // Surface a backend error message when sign-in fails.
      if (data.error) {
        setError(data.error);
      // A returned id means the user was authenticated successfully.
      } else if (data.id) {
        loadUser(data);
        onRouteChange('home');
      // Handle unexpected response shapes safely.
      } else {
        setError('Sign in failed. Try again.');
      }
    } catch (err) {
      // Network or backend availability problems are handled here.
      console.error('Sign in error:', err);
      setError(err.response?.data || 'Backend server is unavailable. Try again later.');
    } finally {
      // Always stop the timer and restore the form controls.
      clearTimeout(slowServerTimer);
      setIsLoading(false);
    }
  };

  return (
    // Center the sign-in card on the page.
    <article className="br3 ba dark-gray b--black-10 mv4 w-100 w-50-m w-25-l mw6 shadow-5 center">
      {/* Form content wrapper. */}
      <main className="pa4 black-80">
        {/* Keep the form at a readable width. */}
        <div className="measure">
          {/* Group the sign-in inputs together semantically. */}
          <fieldset id="sign_in" className="ba b--transparent ph0 mh0">
            <legend className="f1 fw6 ph0 mh0">Sign In</legend>

            {/* Show blocking errors first. */}
            {error && <p className="form-message form-message-error">{error}</p>}
            {/* Show a soft waiting message only when there is no error. */}
            {!error && statusMessage && <p className="form-message form-message-status">{statusMessage}</p>}

            {/* Email input block. */}
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

            {/* Password input block. */}
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

          {/* Submit button for the sign-in request. */}
          <div>
            <input
              className="b ph3 pv2 input-reset ba b--black bg-transparent grow pointer f6"
              type="submit"
              value={isLoading ? 'Signing in...' : 'Sign in'}
              onClick={handleSignIn}
              disabled={isLoading}
            />
          </div>

          {/* Link-like action for moving to the registration screen. */}
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
