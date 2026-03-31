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
    this.state = {
      input: '',
      imageUrl: '',
      detectMessage: '',
      detectStatusMessage: '',
      isDetecting: false,
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

    this.checkBackendHealth();
  }

  // Check the backend early so users do not interact with forms when the server is down.
  checkBackendHealth = async () => {
    if (!isApiConfigured) return;

    try {
      const response = await fetch(`${API_URL}/`);

      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }

      this.setState({
        backendStatus: 'available',
        backendMessage: ''
      });
    } catch (error) {
      console.error('Backend health check failed:', error);
      this.setState({
        backendStatus: 'unavailable',
        backendMessage: "We can't reach the backend right now. Please try again later."
      });
    }
  };

  // Save the signed-in user so other parts of the app can use it.
  loadUser = (data) => this.setState({ user: { ...data } });

  onInputChange = (event) => this.setState({ input: event.target.value });

  // Clear the old result first so the same URL can be submitted again cleanly.
  onButtonSubmit = () => {
    if (!this.state.input.trim()) return;

    const newImageUrl = this.state.input.trim();

    this.setState({
      imageUrl: '',           // Force image to re-load
      detectMessage: '',
      detectStatusMessage: 'Loading image preview...',
      isDetecting: true
    }, () => {
      setTimeout(() => {
        this.setState({ imageUrl: newImageUrl });
      }, 150);   // increased a bit for reliability
    });
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

  onRouteChange = (route) => {
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
                {backendStatus === 'checking' ? 'Starting Ocula...' : 'Server is currently unavailable'}
              </h1>
              <p className="status-message">{backendMessage}</p>
              {backendStatus === 'checking' && <div className="status-loader"></div>}
            </section>
          </main>
        ) : route === 'home' ? (
          <>
            <Navigation isSignedIn={isSignedIn} onRouteChange={this.onRouteChange} />
          <div className="home-container">
            <Logo />

            <ImageLinkForm
              onInputChange={this.onInputChange}
              onButtonSubmit={this.onButtonSubmit}
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
            <Navigation isSignedIn={isSignedIn} onRouteChange={this.onRouteChange} />
            <SignInForm loadUser={this.loadUser} onRouteChange={this.onRouteChange} />
          </>
        ) : (
          <>
            <Navigation isSignedIn={isSignedIn} onRouteChange={this.onRouteChange} />
            <Register loadUser={this.loadUser} onRouteChange={this.onRouteChange} />
          </>
        )}
      </div>
    );
  }
}

export default App;
