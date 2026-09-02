import React, { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, isGoogleSignInConfigured } from '../../config';

let googleScriptPromise = null;

// Load Google's Identity Services script only once, even if sign-in/register both render this button.
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

    // cancelled prevents Google script callbacks from rendering into an unmounted component.
    let cancelled = false;

    loadGoogleScript()
      .then((google) => {
        if (cancelled || !buttonRef.current) return;

        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          // Pass only the Google ID token upward; parent forms decide whether this is sign-in or register.
          callback: (response) => onCredential(response.credential)
        });

        google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          width: 260
        });
      })
      .catch(() => setLoadError('Google sign-in is unavailable right now.'));

    return () => {
      cancelled = true;
    };
    // onCredential is included so React re-initializes the Google callback if the parent handler changes.
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
