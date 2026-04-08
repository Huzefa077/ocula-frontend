// This file is the main frontend controller that manages app state, routes, backend checks, and image scanning flow.
import React, { Component } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import FaceRecognition from './components/FaceRecognition/FaceRecognition';
import Navigation from './components/Navigation/Navigation';
import SignInForm from './components/SignInForm/SignInForm';
import Register from './components/Register/Register';
import Logo from './components/Logo/Logo';
import ImageLinkForm from './components/ImageLinkForm/ImageLinkForm';
import Rank from './components/Rank/Rank';
import { API_URL, isApiConfigured } from './config';
import './App.css';

const HEALTH_CHECK_TIMEOUT_MS = 17000;
const HEALTH_RETRY_DELAY_MS = 5000;

const particlesOptions = {
  background: {
    color: { value: '#2d26ad' },
    image: 'linear-gradient(90deg, #2225ec 0%, #4bdcf0 100%)'
  },
  fullScreen: { enable: true, zIndex: -1 },
  fpsLimit: 80,
  particles: {
    number: { value: 60 },
    color: { value: '#f6f9fa' },
    links: { enable: true, distance: 140, color: '#f9f9f9', opacity: 0.5 },
    move: { enable: true, speed: 0.5 },
    opacity: { value: 0.5 },
    size: { value: { min: 1, max: 4 } }
  },
  interactivity: {
    events: {
      onHover: { enable: true, mode: 'repulse' },
      onClick: { enable: true, mode: 'push' }
    }
  },
  detectRetina: true
};

const initialUser = { id: '', name: '', email: '', entries: 0, joined: '' };

class App extends Component {
  constructor() {
    super();
    // Stores the current backend health-check request so we can cancel it if a newer check starts.
    this.activeHealthCheckController = null;
    // Stores the retry timer id so we can stop old retry loops when needed.
    this.healthRetryTimerId = null;
    
    this.state = {
      input: '',
      imageUrl: '',
      detectMessage: '',
      detectStatusMessage: '',
      isDetecting: false,
      scanSessionId: 0,

      // backendStatus tells the app what situation it is in, while backendMessage is the text shown to the user for that situation.
      backendStatus: isApiConfigured ? 'checking' : 'missing-config',
      backendMessage: isApiConfigured
        ? 'Checking backend server...'
        : 'App configuration is missing the backend API URL.',

      route: 'signin',
      isSignedIn: false,
      init: false,
      user: { ...initialUser }
    };
  }

  componentDidMount() {
    initParticlesEngine(async (engine) => await loadSlim(engine))
      .then(() => this.setState({ init: true }));

    this.checkBackendAvailability();
  }

  componentWillUnmount() {
    if (this.activeHealthCheckController) {
      // AbortController is the object. Calling .abort() is what actually cancels the pending request.
      this.activeHealthCheckController.abort();
    }

    if (this.healthRetryTimerId) {
      clearTimeout(this.healthRetryTimerId);
    }
  }

  // This function checks whether the backend server can be reached before the user starts using the app.
  // `silent` means "retry quietly" without showing the full checking message again on screen.
  checkBackendAvailability = async ({ silent = false } = {}) => {
    // If the API URL is missing, there is nothing to check yet.
    if (!isApiConfigured) return;

    // Cancel any older health check so only the newest request stays active.
    if (this.activeHealthCheckController) {
      this.activeHealthCheckController.abort();
    }

    // Stop any old retry timer so we do not stack multiple retries.
    if (this.healthRetryTimerId) {
      clearTimeout(this.healthRetryTimerId);
      this.healthRetryTimerId = null;
    }

    // Create a fresh controller and timeout for this specific health check request.
    const requestAbortController = new AbortController();
    const healthCheckTimeoutId = setTimeout(() => requestAbortController.abort(), HEALTH_CHECK_TIMEOUT_MS);
    this.activeHealthCheckController = requestAbortController;

    // Only show the checking message when this is a visible check, not a silent background retry.
    if (!silent) {
      this.setState({
        backendStatus: 'checking',
        backendMessage: 'Checking backend server...'
      });
    }

    try {
      // Ask the backend health route for a quick response.
      const response = await fetch(`${API_URL}/`, {
        signal: requestAbortController.signal
      });

      // A non-200 response means the backend replied, but not in a healthy way.
      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }

      // If the request worked, unlock the app and clear the status message.
      this.setState({
        backendStatus: 'available',
        backendMessage: ''
      });
    } catch (error) {
      console.error('Backend health check failed:', error);

      // Show a user-friendly message and mark the backend as unavailable.
      this.setState({
        backendStatus: 'unavailable',
        backendMessage: error.name === 'AbortError'
          ? `Server is temporarily unavailable.`
          : 'Unable to reach backend.'
      });

      // Keep retrying quietly in case the backend wakes up a few seconds later.
      this.healthRetryTimerId = setTimeout(() => {
        this.checkBackendAvailability({ silent: true });
      }, HEALTH_RETRY_DELAY_MS);
    } finally {
      // Always clear the timeout once this health check finishes.
      clearTimeout(healthCheckTimeoutId);

      // Only remove the controller if it still belongs to this same request.
      if (this.activeHealthCheckController === requestAbortController) {
        this.activeHealthCheckController = null;
      }
    }
  };

  // Save the signed-in user so other parts of the app can use it.
  setSignedInUser = (userProfile) => this.setState({ user: { ...userProfile } });

  handleImageInputChange = (event) => this.setState({ input: event.target.value });

  // Clear the old result first so the same URL can be submitted again cleanly.
  handleImageSubmit = () => {
    if (!this.state.input.trim()) return;

    const newImageUrl = this.state.input.trim();

    this.setState({
      imageUrl: '',           // Force image to re-load
      detectMessage: '',
      detectStatusMessage: 'Loading image preview...',
      isDetecting: true,
      // Every new scan gets a new session id so old async results can be ignored safely.
      scanSessionId: this.state.scanSessionId + 1
    }, () => {
      setTimeout(() => {
        this.setState({ imageUrl: newImageUrl });
      }, 150);   // increased a bit for reliability
    });
  };

  // Let the user stop the current scan and fully reset the image area.
  handleDetectCancel = () => {
    this.setState((prevState) => ({
      imageUrl: '',
      detectMessage: 'Image scan was cancelled.',
      detectStatusMessage: '',
      isDetecting: false,
      scanSessionId: prevState.scanSessionId + 1
    }));
  };

  handleDetectStart = () => {
    this.setState({
      isDetecting: true,
      detectMessage: '',
      detectStatusMessage: 'Image loaded. Detecting faces now...'
    });
  };

  handleDetectSuccess = () => {
    this.setState({ isDetecting: false, detectStatusMessage: '' });

    // Guest users can still test detection, but only signed-in users update entries.
    if (!this.state.user.id) return;
    if (!isApiConfigured) {
      this.setState({
        detectMessage: 'App configuration is missing the backend API URL.',
        detectStatusMessage: ''
      });
      return;
    }

    fetch(`${API_URL}/image`, {
      method: 'put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.state.user.id })
    })
      .then(async res => {
        // Read the response text on failure so debugging is easier.
        if (!res.ok) {
          const text = await res.text(); // fallback to see HTML errors
          throw new Error(`Server error: ${text}`);
        }
        return res.json();
      })
      .then(count => {
        if (typeof count !== 'number') {
          console.warn('Unexpected response from /image:', count);
          return;
        }
        // Keep the local user count in sync with the backend.
        this.setState({
          user: {
            ...this.state.user,
            entries: count
          }
        });
      })
      .catch(err => {
        console.error('Error updating entries:', err);
        this.setState({
          detectMessage: 'Face detected, but the backend server is unavailable right now.',
          detectStatusMessage: ''
        });
      });
  };

  handleDetectFail = (msg) => {
    this.setState({
      detectMessage: msg ? msg : '',
      detectStatusMessage: '',
      isDetecting: false
    });
  };

  handleRouteChange = (route) => {
    if (route === 'signout') {
      // Reset app state on sign out so the next session starts clean.
      this.setState({
        input: '', imageUrl: '', detectMessage: '', detectStatusMessage: '', isDetecting: false,
        route: 'signin', isSignedIn: false, user: { ...initialUser }
      });
    } else if (route === 'home') {
      this.setState({ isSignedIn: true, route: 'home' });
    } else {
      this.setState({ route });
    }
  };

  render() {
    const {
      isSignedIn,
      imageUrl,
      route,
      init,
      user,
      detectMessage,
      detectStatusMessage,
      input,
      isDetecting,
      scanSessionId,
      backendStatus,
      backendMessage
    } = this.state;

    const showBackendStatusScreen = backendStatus !== 'available';

    return (
      <div className="App">
        {init && <Particles id="tsparticles" options={particlesOptions} />}

        {showBackendStatusScreen ? (
          <main className="status-screen">
            <section className="status-card">
              <h1 className="status-title">
                {backendStatus === 'checking' ? 'Starting Ocula' : 'Server unavailable'}
              </h1>
              <p className="status-message">{backendMessage}</p>
              {backendStatus === 'checking' && <div className="status-loader"></div>}
              {backendStatus === 'unavailable' && (
                <button className="status-button" onClick={this.checkBackendAvailability}>
                  Retry connection
                </button>
              )}
            </section>
          </main>
        ) : route === 'home' ? (
          <>
            <Navigation isSignedIn={isSignedIn} onRouteChange={this.handleRouteChange} />
          <div className="home-container">
            <Logo />

            <ImageLinkForm
              onInputChange={this.handleImageInputChange}
              onButtonSubmit={this.handleImageSubmit}
              onCancelDetect={this.handleDetectCancel}
              name={user.name}
              inputValue={input}
              isDetecting={isDetecting}
            />

            <Rank entries={user.entries} />

            {isDetecting && (
              <div className="detect-loading">
                <p>{detectStatusMessage || 'Please wait...'}</p>
              </div>
            )}

            <FaceRecognition
              imageUrl={imageUrl}
              isDetecting={isDetecting}
              scanSessionId={scanSessionId}
              onDetectStart={this.handleDetectStart}
              onDetectSuccess={this.handleDetectSuccess}
              onDetectFail={this.handleDetectFail}
            />

            {detectMessage && !isDetecting && (
              <p
                className={`detect-message ${
                  detectMessage.includes('No faces') || detectMessage.includes('no face')
                    ? 'detect-message-warning'
                    : 'detect-message-error'
                }`}
              >
                {detectMessage}
              </p>
            )}
          </div>
          </>
        ) : route === 'signin' ? (
          <>
            <Navigation isSignedIn={isSignedIn} onRouteChange={this.handleRouteChange} />
            <SignInForm loadUser={this.setSignedInUser} onRouteChange={this.handleRouteChange} />
          </>
        ) : (
          <>
            <Navigation isSignedIn={isSignedIn} onRouteChange={this.handleRouteChange} />
            <Register loadUser={this.setSignedInUser} onRouteChange={this.handleRouteChange} />
          </>
        )}
      </div>
    );
  }
}

export default App;
