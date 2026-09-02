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
import LandingPage from './components/LandingPage/LandingPage';
import HistoryDrawer from './components/HistoryDrawer/HistoryDrawer';
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
import './styles/landing.css';
import './styles/status.css';
import './styles/dashboard.css';
import './styles/history.css';
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

// Convert the backend scan-history shape into the same shape the dashboard uses locally.
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

  // The backend can signal an expired session either with HTTP 401 or with this text.
  return status === 401 || message.includes('invalid or expired token');
}

// Email reset and verification links open special routes directly from the URL.
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
    // Only restore a saved session on the normal landing route. Auth callback routes must keep their own screen.
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
      hasRequestedImagePreview: false,
      detectMessage: '',
      detectStatusMessage: '',
      isDetecting: false,
      scanSessionId: 0,
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
    // Blocking maintenance mode intentionally skips backend checks because users cannot use the app anyway.
    if (isMaintenanceBlocking) return;

    this.checkBackendAvailability();
  }

  componentWillUnmount() {
    // Clear every app-level timer/request so async callbacks do not update state after React removes the app.
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

    // Restarting the countdown avoids two intervals fighting over the same banner text.
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
    // The scan may have succeeded locally, but a bad token means history cannot be trusted or saved.
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
    // Guests use temporary local state only; signed-in users load persistent history from the backend.
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
    // Uploaded images are data URLs, so we do not send the full image into history storage.
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
    // Refresh from the backend when the drawer opens so a page reload shows saved scans.
    this.setState({ isHistoryOpen: true, route: 'home' }, () => {
      this.loadScanHistory();
    });
  };

  handleImageInputChange = (event) => this.setState({
    input: event.target.value,
    hasRequestedImagePreview: false
  });

  handleFileInput = (dataUrl) => {
    // File uploads arrive as data URLs, which avoids CORS problems from external image hosts.
    this.setState({
      input: dataUrl,
      hasRequestedImagePreview: false,
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
      hasRequestedImagePreview: true,
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
      hasRequestedImagePreview: false,
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
      hasRequestedImagePreview: false,
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
    // FaceRecognition calls this after the image has loaded and model detection is about to begin.
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
    // A failed scan clears old face results so stale boxes/cards do not remain on screen.
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
      // The scanSessionId guard prevents duplicate history entries for the same rendered image.
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
    // Optimistically remove the row from the UI first; persisted scans are then deleted from the server.
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
    // Clearing history is immediate in the UI, then synced to the backend for signed-in users.
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
    // FaceRecognition owns canvas export details; App only stores the callback for the export button.
    this.setState({ exportAnonymizedImage });
  };

  toggleFaceBlur = (faceId) => {
    // Each face card toggles whether that one detected face should be blurred in the export.
    this.setState((prevState) => {
      const blurredFaceIds = prevState.blurredFaceIds.includes(faceId)
        ? prevState.blurredFaceIds.filter((id) => id !== faceId)
        : [...prevState.blurredFaceIds, faceId];

      return { blurredFaceIds };
    });
  };

  toggleBlurAllFaces = () => {
    // The bulk toggle selects every detected face, or clears the selection if all are already selected.
    this.setState((prevState) => {
      const allFaceIds = prevState.photoFaceSummaries.map((face) => face.id);
      const allSelected = allFaceIds.length > 0 && allFaceIds.every((id) => prevState.blurredFaceIds.includes(id));

      return {
        blurredFaceIds: allSelected ? [] : allFaceIds
      };
    });
  };

  handleAnonymizedExport = () => {
    // The export function returns false when there are no selected faces or no drawable result yet.
    const didExport = this.state.exportAnonymizedImage?.();
    if (!didExport) {
      this.setState({
        detectMessage: 'Select at least one detected face before exporting.',
        detectStatusMessage: ''
      });
    }
  };

  scrollPageToTop = () => {
    // Mobile users often switch dashboard tabs while scrolled down, so reset to the new tool's top.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  handleRouteChange = (route) => {
    // This app uses simple state-based routing instead of React Router.
    if (route === 'signout') {
      const nextRoute = this.state.isGuest ? 'landing' : 'signin';
      clearAuthSession();
      clearGuestMode();
      // Reset app state on sign out so the next session starts clean.
      this.setState({
        input: '', imageUrl: '', hasRequestedImagePreview: false, detectMessage: '', detectStatusMessage: '', isDetecting: false,
        photoFaceSummaries: [], photoFaceBoxes: [], blurredFaceIds: [], scanHistory: [], isHistoryOpen: false,
        route: nextRoute, previousRoute: this.state.route, isSignedIn: false, isGuest: false, user: { ...initialUser }
      });
    } else if (route === 'home') {
      // Entering the dashboard should always land on the main photo tool first.
      this.setState((prevState) => ({
        route: prevState.isSignedIn || prevState.isGuest ? 'home' : 'signin',
        previousRoute: prevState.route,
        isSignedIn: prevState.isSignedIn,
        isGuest: prevState.isGuest
      }));
    } else if (route === 'landing') {
      // Returning to the public homepage clears any in-progress scan preview.
      this.setState({
        input: '',
        imageUrl: '',
        hasRequestedImagePreview: false,
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
    // The back button prefers the previous in-app screen, with a safe fallback for refreshed sessions.
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

  handleGuestMode = () => {
    // Guest mode deliberately avoids persisted auth/history while still allowing local feature demos.
    clearAuthSession();
    enableGuestMode();
    this.setState({
      input: '',
      imageUrl: '',
      hasRequestedImagePreview: false,
      detectMessage: '',
      detectStatusMessage: '',
      isDetecting: false,
      photoFaceSummaries: [],
      photoFaceBoxes: [],
      blurredFaceIds: [],
      scanHistory: [],
      isHistoryOpen: false,
      route: 'home',
      previousRoute: this.state.route,
      isSignedIn: false,
      isGuest: true,
      user: { ...guestUser }
    });
  };

  handleDashboardTabChange = () => {
    // The dashboard now has one tool, but the navbar still calls this to return to the dashboard safely.
    this.setState((prevState) => ({
      route: prevState.isSignedIn || prevState.isGuest ? 'home' : 'signin',
      previousRoute: prevState.route
    }), this.scrollPageToTop);
  };

  openDashboardTool = () => {
    // Public homepage tool buttons open the dashboard for signed-in users or start a guest demo.
    if (this.state.isSignedIn || this.state.isGuest) {
      this.setState((prevState) => ({
        route: 'home',
        previousRoute: prevState.route
      }), this.scrollPageToTop);
      return;
    }

    this.handleGuestMode();
  };

  render() {
    const {
      isSignedIn,
      imageUrl,
      hasRequestedImagePreview,
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
    const allFacesBlurred = photoFaceSummaries.length > 0 && photoFaceSummaries.every((face) => blurredFaceIds.includes(face.id));
    const detectedFaceCount = photoFaceBoxes.length || photoFaceSummaries.length;
    const firstName = (user.name || 'there').split(' ')[0];

    const userPermissions = user.permissions || [];
    const canViewUsers = userPermissions.includes('view_users') || user.role === 'admin';
    const showBackendStatusBanner = backendStatus === 'missing-config' || (backendStatus === 'retrying' && healthFailureCount >= 2);
    const showStatusLoader = backendStatus === 'checking' || backendStatus === 'retrying';
    const dashboardUtilityStrip = (
      <div className="dashboard-rank-strip dashboard-rank-strip-compact">
        <button className="button-muted dashboard-history-inline-button" onClick={this.openScanHistory} type="button">
          View History
        </button>
        {isGuest ? (
          <div className="surface-card rank-card">
            <span className="rank-label">Session</span>
            <strong className="rank-value rank-value-small">Guest Demo</strong>
          </div>
        ) : (
          <Rank entries={user.entries} />
        )}
      </div>
    );
    const statusTitle = backendStatus === 'connected'
      ? 'Backend connected'
      : backendStatus === 'retrying'
        ? 'Waking server'
        : backendStatus === 'missing-config'
          ? 'Setup needed'
          : 'Starting Ocula';
    const maintenanceInstruction = maintenanceConfig.instruction.trim();
    const maintenanceRetryAfter = maintenanceConfig.retryAfter.trim();
    // The footer is rendered after page content, so it appears naturally when users scroll down.
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
            <section className="surface-card maintenance-card maintenance-card-blocking">
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
          onGuestMode={this.handleGuestMode}
          onBackNavigation={this.handleBackNavigation}
          onRouteChange={this.handleRouteChange}
        />

        {isMaintenanceNotice && (
          // Notice maintenance lets users continue while showing temporary instructions from config.
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
          // The backend can sleep on free hosting, so this banner explains automatic retry behavior.
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
          <LandingPage
            isSignedIn={isSignedIn}
            isGuest={isGuest}
            firstName={firstName}
            onGuestMode={this.handleGuestMode}
            onOpenDashboardTool={this.openDashboardTool}
            onRouteChange={this.handleRouteChange}
          />
        ) : route === 'home' ? (
          <>
            <div className="dashboard-shell">
              {/* Dashboard now has one tool: photo face analysis and privacy blur. */}
              <section className="dashboard-page-title" aria-labelledby="photo-scan-title">
                <h1 id="photo-scan-title">Face Analysis &amp; Blur</h1>
              </section>

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

              <section className="dashboard-grid">
                    <div className={`surface-card dashboard-panel dashboard-preview-panel ${!hasRequestedImagePreview ? 'dashboard-preview-panel-mobile-hidden' : ''}`}>
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

                    <aside className="surface-card dashboard-panel dashboard-telemetry-panel custom-scrollbar">
                      <div className="preview-floating-badges">
                        <span>Faces Detected: {detectedFaceCount}</span>
                        <span>Processing Time: {photoProcessingTimeMs ? `${photoProcessingTimeMs}ms` : 'Waiting'}</span>
                      </div>

                      <div className="face-card-grid">
                        {photoFaceSummaries.length === 0 ? (
                          <article className="surface-card telemetry-card">
                            <span>Analysis</span>
                            <strong>Waiting</strong>
                            <p>Upload or paste an image, then run detection to see per-face cards here.</p>
                          </article>
                        ) : (
                          photoFaceSummaries.map((face) => (
                            <article key={face.id} className="surface-card telemetry-card">
                              <div className="face-card-heading">
                                <span>Face #{face.id}</span>
                                <b>{blurredFaceIds.includes(face.id) ? 'Blurred' : 'Visible'}</b>
                              </div>
                              <strong>{face.age} yrs</strong>
                              <p>Emotion: {formatLabel(face.expression)}</p>
                              <div className="telemetry-progress telemetry-progress-emotion" aria-label="Emotion confidence">
                                <b style={{ width: `${face.expressionConfidence || 0}%` }}></b>
                              </div>
                              <small className="telemetry-progress-caption">
                                Emotion confidence: {face.expressionConfidence}%
                              </small>
                              <p>Gender: {formatLabel(face.gender)}</p>
                            </article>
                          ))
                        )}
                      </div>

                      <section className="surface-card privacy-blur-card">
                        <div>
                          <span className="telemetry-label">Selective Privacy Blur</span>
                          <p>Choose exactly which detected faces should be anonymized.</p>
                        </div>
                        <div className="blur-primary-actions">
                          <div className="blur-controls">
                            <button
                              className={allFacesBlurred ? 'button-pill button-muted blur-pill blur-pill-active' : 'button-pill button-muted blur-pill'}
                              onClick={this.toggleBlurAllFaces}
                              disabled={!photoFaceSummaries.length}
                              type="button"
                            >
                              Blur All
                            </button>
                          </div>
                          <button
                            className="button-primary export-blur-button"
                            onClick={this.handleAnonymizedExport}
                            disabled={!photoFaceSummaries.length || !blurredFaceIds.length}
                            type="button"
                          >
                            Export Anonymized Image
                          </button>
                        </div>
                        <div className="blur-controls">
                          {photoFaceSummaries.map((face) => (
                            <button
                              key={face.id}
                              className={blurredFaceIds.includes(face.id) ? 'button-pill button-muted blur-pill blur-pill-active' : 'button-pill button-muted blur-pill'}
                              onClick={() => this.toggleFaceBlur(face.id)}
                              type="button"
                            >
                              Blur Face #{face.id}
                            </button>
                          ))}
                        </div>
                      </section>
                      {dashboardUtilityStrip}
                    </aside>
              </section>

              {canViewUsers && <AdminPanel />}
              <p className="analysis-disclaimer">
                AI results are estimates and can be wrong. Age, gender, and emotion predictions depend on image quality, lighting, face angle, and model limitations.
              </p>
              {isHistoryOpen && (
                <HistoryDrawer
                  scanHistory={scanHistory}
                  onClearHistory={this.handleClearHistory}
                  onClose={() => this.setState({ isHistoryOpen: false })}
                  onDeleteHistoryItem={this.handleDeleteHistoryItem}
                />
              )}
            </div>
          </>
        ) : route === 'guidelines' ? (
          <main className="guidelines-page">
            <button className="guidelines-sticky-back" onClick={this.handleBackNavigation} type="button">
              &lt; Back
            </button>
            <section className="surface-card guidelines-hero">
              <p className="landing-section-kicker">Ocula help</p>
              <h1>User Guide</h1>
              <p>
                A practical guide for getting reliable photo scans and exporting privacy-safe images.
              </p>
            </section>
            <section className="guide-manual">
              <article className="surface-card guide-manual-section">
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
              <article className="surface-card guide-manual-section">
                <span>02</span>
                <div>
                  <h2>Privacy & Limitations</h2>
                  <ul>
                    <li>Ocula is a browser vision demo, not a medical, security, or identity-verification system.</li>
                    <li>Age, emotion, and gender predictions are estimates and can be wrong.</li>
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
