// This file renders the registration form and handles the frontend side of creating a new account.
import React, { useState } from 'react';
import { API_URL, isApiConfigured } from '../../config';
import { isValidEmail } from '../../utils/validation';
import '../SignInForm/AuthForm.css';

const Register = ({ onRouteChange, loadUser }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);   // ← NEW

  // Handles the full register flow for the form.
  const handleRegister = async () => {
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
    setIsLoading(true);                         // ← start loading
    // Render can be slow on first request, so show a gentle status message.
    const slowServerTimer = setTimeout(() => {
      setStatusMessage('Server is taking longer than usual. It may be waking up, please wait...');
    }, 4000);

    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'post',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
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
        setError('Registration failed. Try again.');
      }
    } catch (err) {
      console.error('Register error:', err);
      setError('Backend server is unavailable. Try again later.');
    } finally {
      clearTimeout(slowServerTimer);
      setIsLoading(false);                      // ← stop loading
    }
  };

  return (
    <article className="br3 ba dark-gray b--black-10 mv4 w-100 w-50-m w-25-l mw6 shadow-5 center">
      <main className="pa4 black-80">
        <div className="measure">
          <fieldset id="sign_up" className="ba b--transparent ph0 mh0">
            <legend className="f1 fw6 ph0 mh0">Register</legend>

            {error && <p className="form-message form-message-error">{error}</p>}
            {!error && statusMessage && <p className="form-message form-message-status">{statusMessage}</p>}

            <div className="mt3">
              <label className="db fw6 lh-copy f6">Name</label>
              <input className="pa2 input-reset ba bg-transparent w-100" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="mt3">
              <label className="db fw6 lh-copy f6">Email</label>
              <input className="pa2 input-reset ba bg-transparent w-100" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="mv3">
              <label className="db fw6 lh-copy f6">Password</label>
              <input className="b pa2 input-reset ba bg-transparent w-100" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </fieldset>

          <div>
            <input
              className="b ph3 pv2 input-reset ba b--black bg-transparent grow pointer f6"
              type="submit"
              value={isLoading ? "Registering..." : "Register"}   // ← changes text
              onClick={handleRegister}
              disabled={isLoading}                               // ← prevents multiple clicks
            />
          </div>
        </div>
      </main>
    </article>
  );
};

export default Register;
