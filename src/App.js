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
      isDetecting: false,
      route: 'signin',
      isSignedIn: false,
      init: false,
      user: { ...initialUser }
    };
  }

  componentDidMount() {
    initParticlesEngine(async (engine) => await loadSlim(engine))
      .then(() => this.setState({ init: true }));
  }

  loadUser = (data) => this.setState({ user: { ...data } });

  onInputChange = (event) => this.setState({ input: event.target.value });
  onButtonSubmit = () => {
    if (!this.state.input.trim()) return;

    const newImageUrl = this.state.input.trim();

    this.setState({
      imageUrl: '',           // Force image to re-load
      detectMessage: '',
      isDetecting: true
    }, () => {
      setTimeout(() => {
        this.setState({ imageUrl: newImageUrl });
      }, 150);   // increased a bit for reliability
    });
  };

  handleDetectStart = () => {
    this.setState({ isDetecting: true, detectMessage: '' });
  };

  handleDetectSuccess = () => {
    this.setState({ isDetecting: false });

    const API_URL = process.env.REACT_APP_API_URL || 'https://ocula-server.onrender.com'; // fallback

    // Only call backend if user has a valid ID
    if (!this.state.user.id) return;

    fetch(`${API_URL}/image`, {
      method: 'put',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.state.user.id })
    })
      .then(async res => {
        // Check if response is OK
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
        // Update user entries in state
        this.setState({
          user: {
            ...this.state.user,
            entries: count
          }
        });
      })
      .catch(err => {
        console.error('Error updating entries:', err);
      });
  };

  handleDetectFail = (msg) => {
    this.setState({
      detectMessage: msg ? msg : '',
      isDetecting: false
    });
  };

  onRouteChange = (route) => {
    if (route === 'signout') {
      this.setState({
        input: '', imageUrl: '', detectMessage: '', isDetecting: false,
        route: 'signin', isSignedIn: false, user: { ...initialUser }
      });
    } else if (route === 'home') {
      this.setState({ isSignedIn: true, route: 'home' });
    } else {
      this.setState({ route });
    }
  };

  render() {
    const { isSignedIn, imageUrl, route, init, user, detectMessage, input, isDetecting } = this.state;

    return (
      <div className="App">
        {init && <Particles id="tsparticles" options={particlesOptions} />}

        <Navigation isSignedIn={isSignedIn} onRouteChange={this.onRouteChange} />

        {route === 'home' ? (
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
                <p>🔍 Detecting faces... Please wait</p>
              </div>
            )}

            <FaceRecognition
              imageUrl={imageUrl}
              onDetectStart={this.handleDetectStart}
              onDetectSuccess={this.handleDetectSuccess}
              onDetectFail={this.handleDetectFail}
            />

            {detectMessage && !isDetecting && (
              <p className="detect-message" style={{
                color: detectMessage.includes("No faces") || detectMessage.includes("no face")
                  ? 'orange'
                  : 'red',
                textAlign: 'center',
                margin: '15px 0',
                fontSize: '1.1rem'
              }}>
                {detectMessage}
              </p>
            )}
          </div>
        ) : route === 'signin' ? (
          <SignInForm loadUser={this.loadUser} onRouteChange={this.onRouteChange} />
        ) : (
          <Register loadUser={this.loadUser} onRouteChange={this.onRouteChange} />
        )}
      </div>
    );
  }
}

export default App;