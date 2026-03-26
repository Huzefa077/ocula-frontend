import React, { useState } from 'react';

const Register = ({ onRouteChange, loadUser }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);   // ← NEW

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const API_URL = process.env.REACT_APP_API_URL || 'https://ocula-server.onrender.com';
  const handleRegister = async () => {          // ← made async
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('* All fields are required');
      return;
    }
    if (!validateEmail(email.trim())) {
      setError('Enter a valid email');
      return;
    }

    setError('');
    setIsLoading(true);                         // ← start loading

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
      setError('Server error. Try again later.');
    } finally {
      setIsLoading(false);                      // ← stop loading
    }
  };

  return (
    <article className="br3 ba dark-gray b--black-10 mv4 w-100 w-50-m w-25-l mw6 shadow-5 center">
      <main className="pa4 black-80">
        <div className="measure">
          <fieldset id="sign_up" className="ba b--transparent ph0 mh0">
            <legend className="f1 fw6 ph0 mh0">Register</legend>

            {error && <p style={{color:'red'}}>{error}</p>}

            {/* Name, Email, Password fields stay the same */}

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