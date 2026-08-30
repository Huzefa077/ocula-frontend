import React, { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, isGoogleSignInConfigured } from '../../config';

let googleScriptPromise = null;

function loadGoogleScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google);
      script.onerror = () => reject(new Error('Failed to load Google sign-in'));
      document.body.appendChild(script);
    });
  }

  return googleScriptPromise;
}

const GoogleSignInButton = ({ onCredential, disabled }) => {
  const buttonRef = useRef(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isGoogleSignInConfigured || disabled) return;

    let cancelled = false;

    loadGoogleScript()
      .then((google) => {
        if (cancelled || !buttonRef.current) return;

        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => onCredential(response.credential)
        });

        google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 260
        });
      })
      .catch(() => setLoadError('Google sign-in is unavailable right now.'));

    return () => {
      cancelled = true;
    };
  }, [disabled, onCredential]);

  if (!isGoogleSignInConfigured) {
    return <p className="auth-muted">Google sign-in is not configured yet.</p>;
  }

  return (
    <div className="google-signin-area">
      <div ref={buttonRef} />
      {loadError && <p className="form-message form-message-error">{loadError}</p>}
    </div>
  );
};

export default GoogleSignInButton;
