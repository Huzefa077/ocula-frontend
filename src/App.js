// This file is the main frontend controller that manages app state, routes, backend checks, and image scanning flow.
import React, { Component, Suspense, lazy } from 'react';
import axios from 'axios';
import FaceRecognition from './components/FaceRecognition/FaceRecognition';
import Navigation from './components/Navigation/Navigation';
import SignInForm from './components/SignInForm/SignInForm';
import ForgotPassword from './components/SignInForm/ForgotPassword';
import ResetPassword from './components/SignInForm/ResetPassword';
import VerifyEmail from './components/SignInForm/VerifyEmail';
import Register from './components/Register/Register';
import ImageLinkForm from './components/ImageLinkForm/ImageLinkForm';
import FaceMeshOverlay from './components/FaceMeshOverlay/FaceMeshOverlay';
import VisionTracker from './components/VisionTracker/VisionTracker';
import Rank from './components/Rank/Rank';
import AdminPanel from './components/AdminPanel/AdminPanel';
import { API_URL, isApiConfigured, isMaintenanceBlocking, isMaintenanceNotice, maintenanceConfig } from './config';
import {
  buildAuthHeaders,
  clearAuthSession,
  clearGuestMode,
  enableGuestMode,
  getStoredAuthToken,
  getStoredAuthUser,
  isGuestModeEnabled,
  storeAuthUser
} from './utils/auth';
import './App.css';

const HEALTH_CHECK_TIMEOUT_MS = 70000;
const HEALTH_RETRY_DELAY_MS = 4000;
const ParticlesBackground = lazy(() => import('./components/ParticlesBackground/ParticlesBackground'));

const initialUser = { id: '', name: '', email: '', entries: 0, joined: '', role: 'user', permissions: [] };
const guestUser = { ...initialUser, name: 'Guest', role: 'guest' };

function formatLabel(value) {
  if (!value) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isRemoteImageUrl(value = '') {
  return /^https?:\/\//i.test(value);
}

function createHistoryTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toLocaleString() : date.toLocaleString();
}

function mapPersistedScanHistoryItem(scan) {
  return {
    id: scan.id,
    scanSessionId: `persisted-${scan.id}`,
    imageUrl: scan.imageUrl || '',
    sourceType: scan.sourceType || 'url',
    timestamp: createHistoryTimestamp(scan.createdAt),
    createdAt: scan.createdAt,
    faceCount: scan.faceCount || 0,
    processingTimeMs: scan.processingTimeMs || 0,
    faceSummaries: Array.isArray(scan.faceSummaries) ? scan.faceSummaries : [],
    isPersisted: true
  };
}

function isAuthExpiredError(error) {
  const status = error?.response?.status;
  const message = String(error?.response?.data || '').toLowerCase();

  return status === 401 || message.includes('invalid or expired token');
}

function getInitialRouteFromUrl() {
  if (window.location.pathname === '/verify-email') return 'verify-email';
  if (window.location.pathname === '/reset-password') return 'reset-password';
  return 'landing';
}

class App extends Component {
  constructor() {
    super();
    const initialRoute = getInitialRouteFromUrl();
    const storedAuthToken = getStoredAuthToken();
    const storedAuthUser = getStoredAuthUser();
    const shouldRestoreSignedInUser = initialRoute === 'landing' && Boolean(storedAuthToken && storedAuthUser?.id);
    const shouldRestoreGuest = initialRoute === 'landing' && !shouldRestoreSignedInUser && isGuestModeEnabled();
    // Stores the current backend health-check request so we can cancel it if a newer check starts.
    this.activeHealthCheckController = null;
    // Stores the retry timer id so we can stop old retry loops when needed.
    this.healthRetryTimerId = null;
    // Stores the countdown interval so the retry message can update once per second.
    this.healthRetryCountdownTimerId = null;
    // Stores the short success timer so the connected banner can fade out gracefully.
    this.backendConnectedTimerId = null;

    this.state = {
      input: '',
      imageUrl: '',
      detectMessage: '',
      detectStatusMessage: '',
      isDetecting: false,
      scanSessionId: 0,
      activeDashboardTab: 'photo',
      photoFaceSummaries: [],
      photoFaceBoxes: [],
      photoProcessingTimeMs: 0,
      blurredFaceIds: [],
      scanHistory: [],
      isHistoryOpen: false,
      exportAnonymizedImage: null,

      // backendStatus tells the app what situation it is in, while backendMessage is the text shown to the user for that situation.
      backendStatus: isApiConfigured ? 'checking' : 'missing-config',
      backendMessage: isApiConfigured
        ? 'Connecting...'
        : 'App configuration is missing the backend API URL.',
      retrySecondsLeft: 0,
      healthFailureCount: 0,

      route: shouldRestoreSignedInUser || shouldRestoreGuest ? 'home' : initialRoute,
      previousRoute: 'landing',
      isSignedIn: shouldRestoreSignedInUser,
      isGuest: shouldRestoreGuest,
      init: false,
      user: shouldRestoreSignedInUser ? { ...initialUser, ...storedAuthUser } : shouldRestoreGuest ? { ...guestUser } : { ...initialUser }
    };
  }

  componentDidMount() {
    this.setState({ init: true });
    if (isMaintenanceBlocking) return;

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

    if (this.healthRetryCountdownTimerId) {
      clearInterval(this.healthRetryCountdownTimerId);
    }

    if (this.backendConnectedTimerId) {
      clearTimeout(this.backendConnectedTimerId);
    }
  }

  startRetryCountdown = (failureCount) => {
    let secondsLeft = Math.ceil(HEALTH_RETRY_DELAY_MS / 1000);

    if (this.healthRetryCountdownTimerId) {
      clearInterval(this.healthRetryCountdownTimerId);
    }

    this.setState({
      backendStatus: 'retrying',
      healthFailureCount: failureCount,
      retrySecondsLeft: secondsLeft,
      backendMessage: `Retry in ${secondsLeft}s`
    });

    this.healthRetryCountdownTimerId = setInterval(() => {
      secondsLeft -= 1;

      if (secondsLeft <= 0) {
        clearInterval(this.healthRetryCountdownTimerId);
        this.healthRetryCountdownTimerId = null;
        this.setState({
          retrySecondsLeft: 0,
          backendMessage: 'Retrying...'
        });
        return;
      }

      this.setState({
        retrySecondsLeft: secondsLeft,
        backendMessage: `Retry in ${secondsLeft}s`
      });
    }, 1000);
  };

  // This function checks whether the backend server can be reached before the user starts using the app.
  checkBackendAvailability = async () => {
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

    if (this.healthRetryCountdownTimerId) {
      clearInterval(this.healthRetryCountdownTimerId);
      this.healthRetryCountdownTimerId = null;
    }

    if (this.backendConnectedTimerId) {
      clearTimeout(this.backendConnectedTimerId);
      this.backendConnectedTimerId = null;
    }

    // Render Free services can need close to a minute to wake up, so this timeout
    // is intentionally longer than a normal warm API timeout.
    const requestAbortController = new AbortController();
    const healthCheckTimeoutId = setTimeout(() => requestAbortController.abort(), HEALTH_CHECK_TIMEOUT_MS);
    this.activeHealthCheckController = requestAbortController;

    this.setState({
      backendStatus: 'checking',
      backendMessage: 'Connecting...',
      retrySecondsLeft: 0
    });

    try {
      // Old fetch version for comparison:
      // const response = await fetch(`${API_URL}/`, {
      //   signal: requestAbortController.signal
      // });
      // if (!response.ok) {
      //   throw new Error(`Health check failed with status ${response.status}`);
      // }

      // Axios throws automatically for bad HTTP responses and keeps the abort signal support.
      await axios.get(`${API_URL}/`, {
        signal: requestAbortController.signal
      });

      // Show a short success state before removing the banner completely.
      this.setState({
        backendStatus: 'connected',
        backendMessage: 'Ready',
        retrySecondsLeft: 0,
        healthFailureCount: 0
      });
      this.loadScanHistory();

      this.backendConnectedTimerId = setTimeout(() => {
        this.setState({
          backendStatus: 'available',
          backendMessage: '',
          retrySecondsLeft: 0,
          healthFailureCount: 0
        });
        this.backendConnectedTimerId = null;
      }, 1200);
    } catch (error) {
      console.error('Backend health check failed:', error);

      const nextFailureCount = this.state.healthFailureCount + 1;
      this.startRetryCountdown(nextFailureCount);

      // Keep retrying automatically, but now the user can actually see that it is happening.
      this.healthRetryTimerId = setTimeout(() => {
        this.checkBackendAvailability();
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

  // Real auth must replace guest mode immediately so Google/password sign-in cannot inherit guest state.
  setSignedInUser = (userProfile) => {
    clearGuestMode();
    storeAuthUser(userProfile);
    this.setState({
      user: { ...initialUser, ...userProfile },
      isSignedIn: true,
      isGuest: false
    }, () => {
      this.loadScanHistory();
    });
  };

  handleAuthExpired = () => {
    clearAuthSession();
    clearGuestMode();
    this.setState({
      isSignedIn: false,
      isGuest: false,
      user: { ...initialUser },
      scanHistory: [],
      isHistoryOpen: false,
      detectMessage: '',
      detectStatusMessage: 'Your sign-in session expired. The scan still worked, but sign in again to save history.'
    });
  };

  loadScanHistory = () => {
    if (!isApiConfigured || !this.state.user.id || this.state.isGuest) return;

    axios.get(`${API_URL}/scan-history`, {
      headers: buildAuthHeaders()
    })
      .then((response) => {
        if (!Array.isArray(response.data)) return;

        this.setState({
          scanHistory: response.data.map(mapPersistedScanHistoryItem)
        });
      })
      .catch((error) => {
        if (isAuthExpiredError(error)) {
          this.handleAuthExpired();
          return;
        }

        console.error('Error loading scan history:', error);
      });
  };

  saveScanHistoryItem = (historyItem) => {
    if (!isApiConfigured || !this.state.user.id || this.state.isGuest) return;

    axios.post(`${API_URL}/scan-history`, {
      imageUrl: isRemoteImageUrl(historyItem.imageUrl) ? historyItem.imageUrl : '',
      sourceType: historyItem.sourceType,
      faceCount: historyItem.faceCount,
      processingTimeMs: historyItem.processingTimeMs,
      faceSummaries: historyItem.faceSummaries
    }, {
      headers: buildAuthHeaders()
    })
      .then((response) => {
        const persistedHistoryItem = mapPersistedScanHistoryItem(response.data);

        this.setState((prevState) => ({
          scanHistory: prevState.scanHistory.map((scan) => (
            scan.id === historyItem.id
              ? {
                ...persistedHistoryItem,
                imageUrl: historyItem.sourceType === 'upload' ? historyItem.imageUrl : persistedHistoryItem.imageUrl
              }
              : scan
          ))
        }));
      })
      .catch((error) => {
        if (isAuthExpiredError(error)) {
          this.handleAuthExpired();
          return;
        }

        console.error('Error saving scan history:', error);
      });
  };

  openScanHistory = () => {
    this.setState({ isHistoryOpen: true, route: 'home' }, () => {
      this.loadScanHistory();
    });
  };

  handleImageInputChange = (event) => this.setState({ input: event.target.value });

  handleFileInput = (dataUrl) => {
    this.setState({
      input: dataUrl,
      detectMessage: '',
      detectStatusMessage: 'Local image ready. Press Detect Faces.'
    });
  };

  // Clear the old result first so the same URL can be submitted again cleanly.
  handleImageSubmit = () => {
    if (!this.state.input.trim()) return;

    const newImageUrl = this.state.input.trim();

    this.setState({
      imageUrl: '',           // Force image to re-load
      detectMessage: '',
      detectStatusMessage: 'Loading image preview...',
      isDetecting: true,
      photoFaceSummaries: [],
      photoFaceBoxes: [],
      photoProcessingTimeMs: 0,
      blurredFaceIds: [],
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
      photoFaceSummaries: [],
      photoFaceBoxes: [],
      photoProcessingTimeMs: 0,
      blurredFaceIds: [],
      exportAnonymizedImage: null,
      scanSessionId: prevState.scanSessionId + 1
    }));
  };

  handleImageClear = () => {
    this.setState((prevState) => ({
      input: '',
      imageUrl: '',
      detectMessage: '',
      detectStatusMessage: '',
      isDetecting: false,
      photoFaceSummaries: [],
      photoFaceBoxes: [],
      photoProcessingTimeMs: 0,
      blurredFaceIds: [],
      exportAnonymizedImage: null,
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
    if (!this.state.user.id || this.state.isGuest) return;
    if (!isApiConfigured) {
      this.setState({
        detectMessage: 'App configuration is missing the backend API URL.',
        detectStatusMessage: ''
      });
      return;
    }

    // Old fetch version for comparison:
    // fetch(`${API_URL}/image`, {
    //   method: 'put',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ id: this.state.user.id })
    // })
    //   .then(async res => {
    //     if (!res.ok) {
    //       const text = await res.text();
    //       throw new Error(`Server error: ${text}`);
    //     }
    //     return res.json();
    //   })
    //   .then(count => {
    axios.put(`${API_URL}/image`, { id: this.state.user.id }, {
      headers: buildAuthHeaders()
    })
      .then((response) => {
        const count = response.data;
        if (typeof count !== 'number') {
          console.warn('Unexpected response from /image:', count);
          return;
        }
        const updatedUser = {
          ...this.state.user,
          entries: count
        };

        storeAuthUser(updatedUser);
        // Keep the local user count in sync with the backend.
        this.setState({
          user: updatedUser
        });
      })
      .catch(err => {
        if (isAuthExpiredError(err)) {
          this.handleAuthExpired();
          return;
        }

        console.error('Error updating entries:', err);
        this.setState({
          detectMessage: err.response?.data || 'Face detected, but the backend server is unavailable right now.',
          detectStatusMessage: ''
        });
      });
  };

  handleDetectFail = (msg) => {
    this.setState({
      detectMessage: msg ? msg : '',
      detectStatusMessage: '',
      isDetecting: false,
      photoFaceSummaries: [],
      photoFaceBoxes: [],
      blurredFaceIds: []
    });
  };

  handlePhotoAnalysisUpdate = ({ faceSummaries, processingTimeMs }) => {
    let historyItemToSave = null;

    this.setState((prevState) => {
      const shouldAddHistory = faceSummaries.length > 0 && prevState.imageUrl;
      const alreadySaved = prevState.scanHistory[0]?.scanSessionId === prevState.scanSessionId;
      const sourceType = isRemoteImageUrl(prevState.imageUrl) ? 'url' : 'upload';
      const newHistoryItem = {
        id: `${Date.now()}-${prevState.scanSessionId}`,
        scanSessionId: prevState.scanSessionId,
        imageUrl: prevState.imageUrl,
        sourceType,
        timestamp: new Date().toLocaleString(),
        faceCount: faceSummaries.length,
        processingTimeMs,
        faceSummaries,
        isPersisted: false
      };
      historyItemToSave = shouldAddHistory && !alreadySaved ? newHistoryItem : null;

      return {
        photoFaceSummaries: faceSummaries,
        photoProcessingTimeMs: processingTimeMs,
        scanHistory: shouldAddHistory && !alreadySaved
          ? [
            newHistoryItem,
            ...prevState.scanHistory
          ].slice(0, 10)
          : prevState.scanHistory
      };
    }, () => {
      if (historyItemToSave) {
        this.saveScanHistoryItem(historyItemToSave);
      }
    });
  };

  handleFaceBoxesUpdate = (photoFaceBoxes) => {
    this.setState({ photoFaceBoxes });
  };

  handleDeleteHistoryItem = (scanId) => {
    this.setState((prevState) => ({
      scanHistory: prevState.scanHistory.filter((scan) => scan.id !== scanId)
    }));

    if (!isApiConfigured || !this.state.user.id || this.state.isGuest || String(scanId).includes('-')) return;

    axios.delete(`${API_URL}/scan-history/${scanId}`, {
      headers: buildAuthHeaders()
    }).catch((error) => {
      if (isAuthExpiredError(error)) {
        this.handleAuthExpired();
        return;
      }

      console.error('Error deleting scan history item:', error);
    });
  };

  handleClearHistory = () => {
    this.setState({ scanHistory: [] });

    if (!isApiConfigured || !this.state.user.id || this.state.isGuest) return;

    axios.delete(`${API_URL}/scan-history`, {
      headers: buildAuthHeaders()
    }).catch((error) => {
      if (isAuthExpiredError(error)) {
        this.handleAuthExpired();
        return;
      }

      console.error('Error clearing scan history:', error);
    });
  };

  handleExportReady = (exportAnonymizedImage) => {
    this.setState({ exportAnonymizedImage });
  };

  toggleFaceBlur = (faceId) => {
    this.setState((prevState) => {
      const blurredFaceIds = prevState.blurredFaceIds.includes(faceId)
        ? prevState.blurredFaceIds.filter((id) => id !== faceId)
        : [...prevState.blurredFaceIds, faceId];

      return { blurredFaceIds };
    });
  };

  toggleBlurAllFaces = () => {
    this.setState((prevState) => {
      const allFaceIds = prevState.photoFaceSummaries.map((face) => face.id);
      const allSelected = allFaceIds.length > 0 && allFaceIds.every((id) => prevState.blurredFaceIds.includes(id));

      return {
        blurredFaceIds: allSelected ? [] : allFaceIds
      };
    });
  };

  handleAnonymizedExport = () => {
    const didExport = this.state.exportAnonymizedImage?.();
    if (!didExport) {
      this.setState({
        detectMessage: 'Select at least one detected face before exporting.',
        detectStatusMessage: ''
      });
    }
  };

  handleRouteChange = (route) => {
    if (route === 'signout') {
      const nextRoute = this.state.isGuest ? 'landing' : 'signin';
      clearAuthSession();
      clearGuestMode();
      // Reset app state on sign out so the next session starts clean.
      this.setState({
        input: '', imageUrl: '', detectMessage: '', detectStatusMessage: '', isDetecting: false,
        photoFaceSummaries: [], photoFaceBoxes: [], blurredFaceIds: [], scanHistory: [], isHistoryOpen: false,
        route: nextRoute, previousRoute: this.state.route, isSignedIn: false, isGuest: false, user: { ...initialUser }
      });
    } else if (route === 'home') {
      this.setState((prevState) => ({
        route: prevState.isSignedIn || prevState.isGuest ? 'home' : 'signin',
        previousRoute: prevState.route,
        activeDashboardTab: 'photo',
        isSignedIn: prevState.isSignedIn,
        isGuest: prevState.isGuest
      }));
    } else if (route === 'landing') {
      this.setState({
        input: '',
        imageUrl: '',
        detectMessage: '',
        detectStatusMessage: '',
        isDetecting: false,
        route: 'landing',
        previousRoute: this.state.route
      });
    } else {
      this.setState((prevState) => ({ route, previousRoute: prevState.route }));
    }
  };

  handleBackNavigation = () => {
    this.setState((prevState) => {
      const fallbackRoute = prevState.isSignedIn || prevState.isGuest ? 'home' : 'landing';
      const nextRoute = prevState.previousRoute && prevState.previousRoute !== prevState.route
        ? prevState.previousRoute
        : fallbackRoute;

      return {
        route: nextRoute,
        previousRoute: prevState.route
      };
    });
  };

  handleGuestMode = (activeDashboardTab = 'photo') => {
    clearAuthSession();
    enableGuestMode();
    this.setState({
      input: '',
      imageUrl: '',
      detectMessage: '',
      detectStatusMessage: '',
      isDetecting: false,
      photoFaceSummaries: [],
      photoFaceBoxes: [],
      blurredFaceIds: [],
      scanHistory: [],
      isHistoryOpen: false,
      activeDashboardTab,
      route: 'home',
      previousRoute: this.state.route,
      isSignedIn: false,
      isGuest: true,
      user: { ...guestUser }
    });
  };

  handleDashboardTabChange = (activeDashboardTab) => {
    this.setState((prevState) => ({
      activeDashboardTab,
      route: prevState.isSignedIn || prevState.isGuest ? 'home' : 'signin',
      previousRoute: prevState.route
    }));
  };

  openDashboardTool = (activeDashboardTab) => {
    if (this.state.isSignedIn || this.state.isGuest) {
      this.setState((prevState) => ({
        activeDashboardTab,
        route: 'home',
        previousRoute: prevState.route
      }));
      return;
    }

    this.handleGuestMode(activeDashboardTab);
  };

  renderHeroPreview = (extraClassName = '') => (
    <button
      className={`hero-preview-card hero-preview-card-button ${extraClassName}`.trim()}
      onClick={() => this.openDashboardTool('photo')}
      type="button"
      aria-label="Open Photo Scan and Blur"
    >
      <div className="hero-preview-toolbar">
        <span className="hero-preview-dot"></span>
        <span className="hero-preview-dot"></span>
        <span className="hero-preview-dot"></span>
      </div>
      <div className="hero-preview-image-frame">
        <img
          className="hero-preview-image"
          src={`${process.env.PUBLIC_URL}/images/model.png`}
          alt="AI face analysis preview"
        />
        <div className="mesh-reveal-layer">
          <FaceMeshOverlay />
        </div>
        <div className="hero-preview-scan-line scanner-bar" aria-hidden="true"></div>
      </div>
      <span className="hero-crosshair hero-crosshair-one"></span>
      <span className="hero-crosshair hero-crosshair-two"></span>
      <div className="hero-floating-tag hero-floating-tag-one">Age: ~27 | Neutral 96%</div>
      <div className="hero-floating-tag hero-floating-tag-two">Privacy Blur: Ready</div>
      <div className="hero-preview-footer">
        <span>Face detected: 0.42s</span>
      </div>
    </button>
  );

  render() {
    const {
      isSignedIn,
      imageUrl,
      route,
      init,
      user,
      isGuest,
      detectMessage,
      detectStatusMessage,
      input,
      isDetecting,
      scanSessionId,
      backendStatus,
      backendMessage,
      retrySecondsLeft,
      healthFailureCount,
      photoFaceSummaries,
      photoFaceBoxes,
      blurredFaceIds,
      scanHistory,
      isHistoryOpen,
      photoProcessingTimeMs
    } = this.state;
    const { activeDashboardTab } = this.state;
    const allFacesBlurred = photoFaceSummaries.length > 0 && photoFaceSummaries.every((face) => blurredFaceIds.includes(face.id));
    const detectedFaceCount = photoFaceBoxes.length || photoFaceSummaries.length;
    const firstName = (user.name || 'there').split(' ')[0];

    const userPermissions = user.permissions || [];
    const canViewUsers = userPermissions.includes('view_users') || user.role === 'admin';
    const showBackendStatusBanner = backendStatus === 'missing-config' || (backendStatus === 'retrying' && healthFailureCount >= 2);
    const showStatusLoader = backendStatus === 'checking' || backendStatus === 'retrying';
    const statusTitle = backendStatus === 'connected'
      ? 'Backend connected'
      : backendStatus === 'retrying'
        ? 'Waking server'
        : backendStatus === 'missing-config'
          ? 'Setup needed'
          : 'Starting Ocula';
    const maintenanceInstruction = maintenanceConfig.instruction.trim();
    const maintenanceRetryAfter = maintenanceConfig.retryAfter.trim();
    const appFooter = (
      <footer className="landing-footer">
        <span>Copyright ©{new Date().getFullYear()} Ocula. All rights reserved.</span>
        <span>
          Developed by{' '}
          <a href="https://huzaifasheikh.dev" target="_blank" rel="noreferrer">
            Huzaifa Sheikh
          </a>
        </span>
      </footer>
    );

    if (isMaintenanceBlocking) {
      return (
        <div className="App">
          {init && (
            <Suspense fallback={null}>
              <ParticlesBackground />
            </Suspense>
          )}

          <main className="maintenance-page">
            <section className="maintenance-card maintenance-card-blocking">
              <p className="maintenance-kicker">Maintenance mode</p>
              <h1>{maintenanceConfig.title}</h1>
              <p>{maintenanceConfig.message}</p>
              {maintenanceInstruction && <strong>{maintenanceInstruction}</strong>}
              {maintenanceRetryAfter && <span>Try again {maintenanceRetryAfter}.</span>}
            </section>
          </main>

          {appFooter}
        </div>
      );
    }

    return (
      <div className="App">
        {init && (
          <Suspense fallback={null}>
            <ParticlesBackground />
          </Suspense>
        )}

        <Navigation
          isSignedIn={isSignedIn || isGuest}
          isAdmin={canViewUsers}
          isGuest={isGuest}
          route={route}
          userName={user.name || 'Guest'}
          activeDashboardTab={activeDashboardTab}
          onDashboardTabChange={this.handleDashboardTabChange}
          onOpenHistory={this.openScanHistory}
          onGuestMode={this.handleGuestMode}
          onBackNavigation={this.handleBackNavigation}
          onRouteChange={this.handleRouteChange}
        />

        {isMaintenanceNotice && (
          <section className="maintenance-banner" role="status" aria-live="polite">
            <div className="maintenance-banner-content">
              <div>
                <p className="maintenance-kicker">Maintenance notice</p>
                <strong>{maintenanceConfig.title}</strong>
                <span>{maintenanceConfig.message}</span>
              </div>
              {maintenanceInstruction && <p>{maintenanceInstruction}</p>}
            </div>
          </section>
        )}

        {showBackendStatusBanner && (
          <section className="status-banner">
            <div className="status-banner-content">
              <div className="status-banner-top">
                <div className="status-banner-copy">
                  <p className="status-banner-title">{statusTitle}</p>
                  <p className="status-banner-message">{backendMessage}</p>
                </div>
                {showStatusLoader && <div className="status-loader" />}
                {backendStatus === 'connected' && <div className="status-connected-indicator">Connected</div>}
              </div>
              {backendStatus === 'retrying' && retrySecondsLeft > 0 && (
                <p className="status-banner-hint">Retrying automatically</p>
              )}
              {(backendStatus === 'retrying' || backendStatus === 'unavailable') && (
                <button className="status-button" onClick={this.checkBackendAvailability}>
                  Retry now
                </button>
              )}
            </div>
          </section>
        )}

        {route === 'landing' ? (
          <main className="landing-page">
            <section className="landing-hero">
              <div className="landing-copy">
                <p className="landing-kicker">Face analysis and gaze tracking</p>
                <h1 className="landing-title">Face Detection, Privacy Blur & Gaze Tracking</h1>
                {this.renderHeroPreview('hero-preview-card-mobile')}
                <p className="landing-subtitle">
                  Analyze faces in uploaded photos, blur selected identities, and test an experimental webcam gaze tracker that runs in the browser.
                </p>
                {(isSignedIn || isGuest) && (
                  <div className="landing-return-message">
                    <span>Hello,</span>
                    <strong>{isGuest ? 'Guest' : firstName}</strong>
                  </div>
                )}
                <div className="landing-actions">
                  {(isSignedIn || isGuest) ? (
                    <button className="landing-primary-button" onClick={() => this.handleRouteChange('home')} type="button">
                      View Dashboard
                    </button>
                  ) : (
                    <>
                      <button className="landing-primary-button" onClick={this.handleGuestMode} type="button">
                        Try Guest Demo
                      </button>
                      <button className="landing-secondary-button" onClick={() => this.handleRouteChange('signin')} type="button">
                        Sign In
                      </button>
                      <button className="landing-link-button" onClick={() => this.handleRouteChange('register')} type="button">
                        Register
                      </button>
                    </>
                  )}
                </div>
                <div className="landing-stats">
                  <span>Multi-Face Photo Scan</span>
                  <span>Selective Blur Export</span>
                  <span>Client-Side Vision Tools</span>
                </div>
              </div>
              {this.renderHeroPreview('hero-preview-card-desktop')}
            </section>

            <section id="features" className="landing-section">
              <p className="landing-section-kicker">Features</p>
              <h2>Built for explainable visual AI demos</h2>
              <div className="landing-bento-grid">
                <article className="landing-bento-card">
                  <span>01</span>
                  <h3>Multi-Face Detection & Analysis</h3>
                  <p>Upload a photo or paste an image link. Ocula finds every face in it and shows you each person's estimated age, gender, and emotion.</p>
                  <button className="landing-card-link" onClick={() => this.openDashboardTool('photo')} type="button">
                    Open Photo Scan
                  </button>
                </article>
                <article className="landing-bento-card">
                  <span>02</span>
                  <h3>Blur Faces for Privacy</h3>
                  <p>Choose which faces to blur — one, a few, or everyone — then download a safe copy of the photo to share.</p>
                  <button className="landing-card-link" onClick={() => this.openDashboardTool('photo')} type="button">
                    Open Blur Tool
                  </button>
                </article>
                <article className="landing-bento-card">
                  <span>03</span>
                  <h3>Experimental Gaze Tracker</h3>
                  <p>Use your webcam to see where you're looking on screen. Click through a series of dots to calibrate it, then watch a live dot follow your gaze in real time.</p>
                  <button className="landing-card-link" onClick={() => this.openDashboardTool('tracker')} type="button">
                    Open Gaze Tracker
                  </button>
                </article>
              </div>
            </section>

            <section id="privacy" className="landing-section landing-privacy-showcase">
              <article className="landing-architecture-card landing-privacy-copy-card">
                <p className="landing-section-kicker">Privacy Engine</p>
                <h2>Blur only the faces you choose</h2>
                <p>Instead of blurring a whole photo, Ocula lets you pick exactly which faces to hide. That's useful for group photos, event pictures, or any image where only some people need their identity protected.</p>
              </article>
              <div className="privacy-preview-grid">
                <div className="privacy-preview-card privacy-preview-before">Original scan</div>
                <div className="privacy-preview-card privacy-preview-after">Selective blur ready</div>
              </div>
            </section>

            <section id="gaze-tech" className="landing-section landing-architecture-card">
              <p className="landing-section-kicker">Gaze Tracker</p>
              <h2>Browser-based gaze calibration</h2>
              <p>The tracker only starts after you allow fullscreen and camera access. You'll line up your face, then click through a series of dots so it can learn where your eyes are looking. After that, a small dot on screen follows your gaze in real time.</p>
            </section>

            <section id="faq" className="landing-section">
              <p className="landing-section-kicker">Architecture & FAQ</p>
              <h2>How Ocula works</h2>
              <div className="faq-grid">
                <article className="faq-card">
                  <h3>Where does face processing happen?</h3>
                  <p>All face detection and blurring happens right in your browser — your photo is never sent to a server for that part. The backend only handles things like logging in, your account, and loading images from other websites.</p>
                </article>
                <article className="faq-card">
                  <h3>Why do some image URLs fail?</h3>
                  <p>Some websites block browsers from reading their images directly. If a pasted link doesn't work, try copying the direct image address instead, or just upload the photo from your device — that always works.</p>
                </article>
                <article className="faq-card">
                  <h3>Is the Gaze Tracker exact?</h3>
                  <p>No — it's an estimate, not an exact measurement. Accuracy depends on your face position, lighting, camera quality, glasses, and how precisely you click each calibration dot.</p>
                </article>
              </div>
            </section>
          </main>
        ) : route === 'home' ? (
          <>
            <div className="dashboard-shell">
              {activeDashboardTab === 'photo' && (
                <section className="dashboard-toolbar">
                  <ImageLinkForm
                    onInputChange={this.handleImageInputChange}
                    onButtonSubmit={this.handleImageSubmit}
                    onCancelDetect={this.handleDetectCancel}
                    onFileSelect={this.handleFileInput}
                    onClearInput={this.handleImageClear}
                    name={user.name}
                    role={user.role}
                    inputValue={input}
                    isDetecting={isDetecting}
                  />
                </section>
              )}

              <div className="dashboard-rank-strip">
                <button className="dashboard-history-inline-button" onClick={this.openScanHistory} type="button">
                  View History
                </button>
                <button className="dashboard-history-inline-button" onClick={() => this.handleRouteChange('guidelines')} type="button">
                  User Guide
                </button>
                {isGuest ? (
                  <div className="rank-card">
                    <span className="rank-label">Session</span>
                    <strong className="rank-value rank-value-small">Guest Demo</strong>
                  </div>
                ) : (
                  <Rank entries={user.entries} />
                )}
              </div>

              {activeDashboardTab === 'photo' ? (
                <>
                  <section className="dashboard-grid">
                    <div className="dashboard-panel dashboard-preview-panel">
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
                        onAnalysisUpdate={this.handlePhotoAnalysisUpdate}
                        onFaceBoxesUpdate={this.handleFaceBoxesUpdate}
                        onExportReady={this.handleExportReady}
                        blurredFaceIds={blurredFaceIds}
                        showAnalysisPanel={false}
                      />

                      {detectMessage && !isDetecting && (
                        <p
                          className={`detect-message ${detectMessage.includes('No faces') || detectMessage.includes('no face')
                            ? 'detect-message-warning'
                            : 'detect-message-error'
                            }`}
                        >
                          {detectMessage}
                        </p>
                      )}
                    </div>

                    <aside className="dashboard-panel dashboard-telemetry-panel custom-scrollbar">
                      <div className="preview-floating-badges">
                        <span>Faces Detected: {detectedFaceCount}</span>
                        <span>Processing Time: {photoProcessingTimeMs ? `${photoProcessingTimeMs}ms` : 'Waiting'}</span>
                      </div>

                      <div className="face-card-grid">
                        {photoFaceSummaries.length === 0 ? (
                          <article className="telemetry-card">
                            <span>Analysis</span>
                            <strong>Waiting</strong>
                            <p>Upload or paste an image, then run detection to see per-face cards here.</p>
                          </article>
                        ) : (
                          photoFaceSummaries.map((face) => (
                            <article key={face.id} className="telemetry-card">
                              <div className="face-card-heading">
                                <span>Face #{face.id}</span>
                                <b>{blurredFaceIds.includes(face.id) ? 'Blurred' : 'Visible'}</b>
                              </div>
                              <strong>{face.age} yrs</strong>
                              <p>Emotion: {formatLabel(face.expression)} ({face.expressionConfidence}%)</p>
                              <div className="telemetry-progress telemetry-progress-emotion" aria-label="Emotion confidence">
                                <b style={{ width: `${face.expressionConfidence || 0}%` }}></b>
                              </div>
                              <small className="telemetry-progress-caption">Emotion confidence</small>
                              <p>Gender: {formatLabel(face.gender)}</p>
                            </article>
                          ))
                        )}
                      </div>

                      <p className="analysis-disclaimer">
                        AI results are estimates and can be wrong. Age, gender, and emotion predictions depend on image quality, lighting, face angle, and model limitations.
                      </p>

                      <section className="privacy-blur-card">
                        <div>
                          <span className="telemetry-label">Selective Privacy Blur</span>
                          <p>Choose exactly which detected faces should be anonymized.</p>
                        </div>
                        <div className="blur-controls">
                          <button
                            className={allFacesBlurred ? 'blur-pill blur-pill-active' : 'blur-pill'}
                            onClick={this.toggleBlurAllFaces}
                            disabled={!photoFaceSummaries.length}
                            type="button"
                          >
                            Blur All
                          </button>
                          {photoFaceSummaries.map((face) => (
                            <button
                              key={face.id}
                              className={blurredFaceIds.includes(face.id) ? 'blur-pill blur-pill-active' : 'blur-pill'}
                              onClick={() => this.toggleFaceBlur(face.id)}
                              type="button"
                            >
                              Blur Face #{face.id}
                            </button>
                          ))}
                        </div>
                        <button
                          className="export-blur-button"
                          onClick={this.handleAnonymizedExport}
                          disabled={!photoFaceSummaries.length || !blurredFaceIds.length}
                          type="button"
                        >
                          Export Anonymized Image
                        </button>
                      </section>
                    </aside>
                  </section>
                </>
              ) : (
                <VisionTracker />
              )}

              {canViewUsers && <AdminPanel />}
              {isHistoryOpen && (
                <div className="history-overlay" role="presentation" onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    this.setState({ isHistoryOpen: false });
                  }
                }}>
                  <section className="history-drawer" aria-label="Scan history">
                    <div className="history-drawer-header">
                      <div>
                        <p className="dashboard-placeholder-label">Recent Scans</p>
                        <h2>Scan History</h2>
                      </div>
                      <div className="history-actions">
                        <button className="history-clear-button" onClick={this.handleClearHistory} disabled={scanHistory.length === 0} type="button">
                          Clear All
                        </button>
                        <button className="history-close-button" onClick={() => this.setState({ isHistoryOpen: false })} type="button">
                          Close
                        </button>
                      </div>
                    </div>
                    {scanHistory.length === 0 ? (
                      <p className="history-empty">No scans yet. Run a photo scan and it will appear here.</p>
                    ) : (
                      <div className="history-list">
                        {scanHistory.map((scan) => (
                          <article key={scan.id} className="history-item">
                            {scan.imageUrl ? (
                              <img src={scan.imageUrl} alt="Previous scan thumbnail" />
                            ) : (
                              <div className="history-thumbnail-placeholder" aria-hidden="true">
                                Upload
                              </div>
                            )}
                            <div>
                              <strong>{scan.faceCount} face{scan.faceCount === 1 ? '' : 's'} detected</strong>
                              <p>{scan.timestamp}</p>
                              {scan.processingTimeMs ? <p>{scan.processingTimeMs}ms processing time</p> : null}
                            </div>
                            <button className="history-delete-button" onClick={() => this.handleDeleteHistoryItem(scan.id)} type="button">
                              Delete
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </>
        ) : route === 'guidelines' ? (
          <main className="guidelines-page">
            <button className="guidelines-sticky-back" onClick={this.handleBackNavigation} type="button">
              &lt; Back
            </button>
            <section className="guidelines-hero">
              <p className="landing-section-kicker">Ocula help</p>
              <h1>User Guide</h1>
              <p>
                A practical guide for getting reliable photo scans, exporting privacy-safe images,
                and calibrating the experimental Gaze Tracker without fighting the browser.
              </p>
            </section>
            <section className="guide-manual">
              <article className="guide-manual-section">
                <span>01</span>
                <div>
                  <h2>Photo Scan & Blur</h2>
                  <ul>
                    <li>Use local upload for the most reliable result; it avoids CORS problems and keeps export working cleanly.</li>
                    <li>For URLs, use Copy Image Address and prefer direct .jpg, .png, or .webp links instead of webpage or search-result links.</li>
                    <li>Use sharp, well-lit photos with visible faces. Cropped faces, masks, hands, shadows, and extreme side angles reduce accuracy.</li>
                    <li>After detection, choose face numbers individually or use Blur All, then export the anonymized image.</li>
                  </ul>
                </div>
              </article>
              <article className="guide-manual-section">
                <span>02</span>
                <div>
                  <h2>Gaze Tracker</h2>
                  <ul>
                    <li>Enter fullscreen only when you are ready; the tracker asks for webcam access and runs locally in the browser.</li>
                    <li>Move close enough to fill the face oval without cutting off your forehead or chin.</li>
                    <li>Keep your head still during calibration. On desktop, mouse clicks give better accuracy than the B key.</li>
                    <li>Remove glasses if reflections block your pupils; webcam quality, lighting, and natural eye alignment affect accuracy.</li>
                  </ul>
                </div>
              </article>
              <article className="guide-manual-section">
                <span>03</span>
                <div>
                  <h2>Privacy & Limitations</h2>
                  <ul>
                    <li>Ocula is a browser vision demo, not a medical, security, or identity-verification system.</li>
                    <li>Age, emotion, gender, and gaze predictions are estimates and can be wrong.</li>
                    <li>Photo analysis and blur rendering happen client-side; the backend is mainly for accounts, JWT sessions, entries, and admin support.</li>
                    <li>If an external URL fails, the website probably blocked browser image access. Upload the file instead.</li>
                  </ul>
                </div>
              </article>
            </section>
          </main>
        ) : route === 'signin' ? (
          <main className="route-page route-page-centered">
            <SignInForm loadUser={this.setSignedInUser} onRouteChange={this.handleRouteChange} onGuestMode={this.handleGuestMode} />
          </main>
        ) : route === 'register' ? (
          <main className="route-page route-page-centered">
            <Register loadUser={this.setSignedInUser} onRouteChange={this.handleRouteChange} />
          </main>
        ) : route === 'forgot-password' ? (
          <main className="route-page route-page-centered">
            <ForgotPassword onRouteChange={this.handleRouteChange} />
          </main>
        ) : route === 'reset-password' ? (
          <main className="route-page route-page-centered">
            <ResetPassword onRouteChange={this.handleRouteChange} />
          </main>
        ) : (
          <main className="route-page route-page-centered">
            <VerifyEmail loadUser={this.setSignedInUser} onRouteChange={this.handleRouteChange} />
          </main>
        )}
        {appFooter}
      </div>
    );
  }
}

export default App;
