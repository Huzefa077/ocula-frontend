import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { recordCalibrationPoint, startWebGazer, stopWebGazer } from '../../services/gazeTracking';
import './VisionTracker.css';

const BASELINE_TRAINING_POINTS = 25;
const EXTRA_REFINEMENT_POINTS = 15;
const LIVE_TRACKING_START_CLICK = BASELINE_TRAINING_POINTS;
const BASELINE_GRID_SIZE = 5;
const BASELINE_GRID_START = 8;
const BASELINE_GRID_STEP = 84 / (BASELINE_GRID_SIZE - 1);
const GAZE_NOISE_DEAD_ZONE = 7;
// how long the dot dims and holds after being clicked, before moving to the next point
const CALIBRATION_INPUT_COOLDOWN_MS = 500;
const CALIBRATION_SAMPLE_INTERVAL_MS = 100;
const AUTO_SELECT_DELAY_MS = 1500;
const AUTO_SELECT_TICK_MS = 80;
const FIRST_DOT_DELAY_MS = 3000;
const TRACKER_PHASES = {
  CONSENT: 'CONSENT',
  FACE_LOCK: 'FACE_LOCK',
  CALIBRATION: 'CALIBRATION'
};

function createRefinementPoints(count) {
  return Array.from({ length: count }, () => ({
    x: 10 + Math.random() * 80,
    y: 10 + Math.random() * 80
  }));
}

function shufflePoints(points) {
  const shuffledPoints = [...points];

  for (let index = shuffledPoints.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledPoints[index], shuffledPoints[randomIndex]] = [shuffledPoints[randomIndex], shuffledPoints[index]];
  }

  return shuffledPoints;
}

function getNearestCenterPointIndex(points) {
  return points.reduce((nearestIndex, point, index) => {
    const currentDistance = Math.hypot(point.x - 50, point.y - 50);
    const nearestDistance = Math.hypot(points[nearestIndex].x - 50, points[nearestIndex].y - 50);

    return currentDistance < nearestDistance ? index : nearestIndex;
  }, 0);
}

function createTrainingPoints() {
  const points = [];

  for (let row = 0; row < BASELINE_GRID_SIZE; row += 1) {
    for (let column = 0; column < BASELINE_GRID_SIZE; column += 1) {
      points.push({
        x: BASELINE_GRID_START + column * BASELINE_GRID_STEP,
        y: BASELINE_GRID_START + row * BASELINE_GRID_STEP
      });
    }
  }

  const centerPointIndex = getNearestCenterPointIndex(points);
  const centerPoint = points[centerPointIndex];
  const randomizedBaselinePoints = shufflePoints(points.filter((_, index) => index !== centerPointIndex));

  return [
    centerPoint,
    ...randomizedBaselinePoints
  ];
}

const VisionTracker = () => {
  const [trainingPoints, setTrainingPoints] = useState(createTrainingPoints);
  const [trainingGoal, setTrainingGoal] = useState(BASELINE_TRAINING_POINTS);
  const [clickCount, setClickCount] = useState(0);
  const [trackerPhase, setTrackerPhase] = useState(TRACKER_PHASES.CONSENT);
  const [isTrackerReady, setIsTrackerReady] = useState(false);
  const [isStartingTracker, setIsStartingTracker] = useState(false);
  const [isDarkeningCalibration, setIsDarkeningCalibration] = useState(false);
  const [showCalibrationInputHint, setShowCalibrationInputHint] = useState(false);
  const [showFaceLockTips, setShowFaceLockTips] = useState(true);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  const [isAutoSelectEnabled, setIsAutoSelectEnabled] = useState(false);
  const [autoSelectRemainingMs, setAutoSelectRemainingMs] = useState(0);
  const [showRefinementPrompt, setShowRefinementPrompt] = useState(false);
  const [refinementDecision, setRefinementDecision] = useState('pending');
  const [isFirstDotDelayActive, setIsFirstDotDelayActive] = useState(false);
  const [isTrackerMenuOpen, setIsTrackerMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [, setCameraPermissionStatus] = useState('unknown');
  const [gazePoint, setGazePoint] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const trackerPhaseRef = useRef(TRACKER_PHASES.CONSENT);
  const isTrackerReadyRef = useRef(false);
  const trainingPointsRef = useRef(trainingPoints);
  const trainingGoalRef = useRef(trainingGoal);
  const clickCountRef = useRef(clickCount);
  const smoothedPointRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const inputCooldownTimerRef = useRef(null);
  const inputCooldownIntervalRef = useRef(null);
  const calibrationSampleIntervalRef = useRef(null);
  const isTrackerActiveRef = useRef(true);
  const isInputCoolingDownRef = useRef(false);
  const calibrationInputHintTimerRef = useRef(null);
  const autoSelectTimerRef = useRef(null);
  const autoSelectIntervalRef = useRef(null);
  const showRefinementPromptRef = useRef(false);
  const firstDotDelayTimerRef = useRef(null);
  const isFirstDotDelayActiveRef = useRef(false);

  useEffect(() => {
    trackerPhaseRef.current = trackerPhase;
  }, [trackerPhase]);

  useEffect(() => {
    trainingPointsRef.current = trainingPoints;
    trainingGoalRef.current = trainingGoal;
    clickCountRef.current = clickCount;
    isTrackerReadyRef.current = isTrackerReady;
    showRefinementPromptRef.current = showRefinementPrompt;
    isFirstDotDelayActiveRef.current = isFirstDotDelayActive;
  }, [trainingPoints, trainingGoal, clickCount, isTrackerReady, showRefinementPrompt, isFirstDotDelayActive]);

  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [trackerPhase]);

  useEffect(() => {
    const readCameraPermission = async () => {
      if (!navigator.permissions?.query) return;

      try {
        const permission = await navigator.permissions.query({ name: 'camera' });
        setCameraPermissionStatus(permission.state);
        permission.onchange = () => setCameraPermissionStatus(permission.state);
      } catch (err) {
        setCameraPermissionStatus('browser controlled');
      }
    };

    readCameraPermission();
  }, []);

  const stopLocalStream = () => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const clearInputCooldown = () => {
    isInputCoolingDownRef.current = false;
    setCooldownRemainingMs(0);

    if (inputCooldownTimerRef.current) {
      clearTimeout(inputCooldownTimerRef.current);
      inputCooldownTimerRef.current = null;
    }

    if (inputCooldownIntervalRef.current) {
      clearInterval(inputCooldownIntervalRef.current);
      inputCooldownIntervalRef.current = null;
    }

    if (calibrationSampleIntervalRef.current) {
      clearInterval(calibrationSampleIntervalRef.current);
      calibrationSampleIntervalRef.current = null;
    }
  };

  const clearCalibrationInputHint = () => {
    if (calibrationInputHintTimerRef.current) {
      clearTimeout(calibrationInputHintTimerRef.current);
      calibrationInputHintTimerRef.current = null;
    }

    setShowCalibrationInputHint(false);
  };

  const clearAutoSelectTimer = () => {
    setAutoSelectRemainingMs(0);

    if (autoSelectTimerRef.current) {
      clearTimeout(autoSelectTimerRef.current);
      autoSelectTimerRef.current = null;
    }

    if (autoSelectIntervalRef.current) {
      clearInterval(autoSelectIntervalRef.current);
      autoSelectIntervalRef.current = null;
    }
  };

  const clearFirstDotDelay = () => {
    if (firstDotDelayTimerRef.current) {
      clearTimeout(firstDotDelayTimerRef.current);
      firstDotDelayTimerRef.current = null;
    }

    isFirstDotDelayActiveRef.current = false;
    setIsFirstDotDelayActive(false);
  };

  const startFirstDotDelay = () => {
    clearFirstDotDelay();

    isFirstDotDelayActiveRef.current = true;
    setIsFirstDotDelayActive(true);

    firstDotDelayTimerRef.current = setTimeout(() => {
      firstDotDelayTimerRef.current = null;
      isFirstDotDelayActiveRef.current = false;
      setIsFirstDotDelayActive(false);
    }, FIRST_DOT_DELAY_MS);
  };

  const startCalibrationInputHint = () => {
    clearCalibrationInputHint();
    setShowCalibrationInputHint(true);

    calibrationInputHintTimerRef.current = setTimeout(() => {
      setShowCalibrationInputHint(false);
      calibrationInputHintTimerRef.current = null;
    }, 6000);
  };

  const hasUsableWebGazerDetection = () => {
    const webgazer = window.webgazer;
    if (!webgazer) return false;

    const tracker = webgazer.getTracker?.();

    try {
      if (tracker && typeof tracker.getCurrentPosition === 'function') {
        const currentPosition = tracker.getCurrentPosition();
        return Array.isArray(currentPosition) && currentPosition.length > 0;
      }

      if (tracker && typeof tracker.getCurrentPrediction === 'function') {
        const trackerPrediction = tracker.getCurrentPrediction();
        return Array.isArray(trackerPrediction) && trackerPrediction.length > 0;
      }
    } catch (err) {
      return false;
    }

    // This WebGazer build does not always expose a face-validity API. In that
    // case, do not block calibration samples on an unavailable signal.
    return true;
  };

  const startInputCooldown = (onHoldComplete, onHoldSample) => {
    clearInputCooldown();

    const cooldownStartedAt = Date.now();
    isInputCoolingDownRef.current = true;
    setCooldownRemainingMs(CALIBRATION_INPUT_COOLDOWN_MS);

    onHoldSample?.();
    calibrationSampleIntervalRef.current = setInterval(() => {
      if (Date.now() - cooldownStartedAt >= CALIBRATION_INPUT_COOLDOWN_MS) return;

      onHoldSample?.();
    }, CALIBRATION_SAMPLE_INTERVAL_MS);

    inputCooldownIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, CALIBRATION_INPUT_COOLDOWN_MS - (Date.now() - cooldownStartedAt));
      setCooldownRemainingMs(remaining);
    }, 80);

    inputCooldownTimerRef.current = setTimeout(() => {
      if (!isTrackerActiveRef.current) return;

      clearInputCooldown();
      onHoldComplete?.();
    }, CALIBRATION_INPUT_COOLDOWN_MS);
  };

  const cleanup = () => {
    isTrackerActiveRef.current = false;
    clearCalibrationInputHint();
    clearInputCooldown();
    clearAutoSelectTimer();
    clearFirstDotDelay();
    stopLocalStream();
    stopWebGazer();

    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => { });
    }
  };

  const resetCalibration = () => {
    isTrackerActiveRef.current = true;
    clearInputCooldown();
    clearAutoSelectTimer();
    clearFirstDotDelay();
    startCalibrationInputHint();
    window.webgazer?.clearData?.();
    setTrainingPoints(createTrainingPoints());
    setTrainingGoal(BASELINE_TRAINING_POINTS);
    setClickCount(0);
    setShowRefinementPrompt(false);
    setRefinementDecision('pending');
    setIsTrackerMenuOpen(false);
    setTrackerPhase(TRACKER_PHASES.CALIBRATION);
    setIsDarkeningCalibration(false);
    startFirstDotDelay();
    smoothedPointRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    setGazePoint(smoothedPointRef.current);
  };

  const handleGazeUpdate = (data) => {
    if (!data || trackerPhaseRef.current !== TRACKER_PHASES.CALIBRATION) return;

    const previous = smoothedPointRef.current;
    const deltaX = data.x - previous.x;
    const deltaY = data.y - previous.y;
    const movementDistance = Math.hypot(deltaX, deltaY);

    if (movementDistance < GAZE_NOISE_DEAD_ZONE) return;

    const smoothingFactor = movementDistance > 160 ? 0.88 : 0.48;
    const nextPoint = {
      x: previous.x + deltaX * smoothingFactor,
      y: previous.y + deltaY * smoothingFactor
    };

    smoothedPointRef.current = nextPoint;
    setGazePoint(nextPoint);
  };

  const startTrackerWithConsent = async () => {
    isTrackerActiveRef.current = true;
    setIsStartingTracker(true);
    setError('');

    try {
      await document.documentElement.requestFullscreen?.().catch(() => { });
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setCameraPermissionStatus('granted');

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      await startWebGazer(handleGazeUpdate);

      setShowFaceLockTips(true);
      setIsTrackerReady(true);
      setTrackerPhase(TRACKER_PHASES.FACE_LOCK);
    } catch (err) {
      setCameraPermissionStatus('denied');
      setError('Fullscreen and camera permission are required for Gaze Tracker.');
      cleanup();
    } finally {
      setIsStartingTracker(false);
    }
  };

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;

    const handleKeyDown = (event) => {
      if (event.code === 'Space' && trackerPhaseRef.current !== TRACKER_PHASES.CONSENT) {
        event.preventDefault();
        if (showRefinementPromptRef.current) return;
        resetCalibration();
      }

      if (event.key.toLowerCase() === 'b') {
        event.preventDefault();
        recordCurrentTrainingPoint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (trackerPhase === TRACKER_PHASES.CONSENT) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [trackerPhase]);

  const recordCurrentTrainingPoint = (targetElement) => {
    if (!isTrackerReadyRef.current || trackerPhaseRef.current !== TRACKER_PHASES.CALIBRATION) return;
    if (clickCountRef.current >= trainingGoalRef.current) return;
    if (isInputCoolingDownRef.current) return;
    if (isFirstDotDelayActiveRef.current) return;
    clearAutoSelectTimer();

    const pointIndex = Math.min(clickCountRef.current, trainingPointsRef.current.length - 1);
    const point = trainingPointsRef.current[pointIndex];
    if (!point) return;

    const targetBounds = targetElement?.getBoundingClientRect?.();
    const targetCenterX = targetBounds ? targetBounds.left + targetBounds.width / 2 : window.innerWidth * (point.x / 100);
    const targetCenterY = targetBounds ? targetBounds.top + targetBounds.height / 2 : window.innerHeight * (point.y / 100);

    const nextCount = Math.min(clickCountRef.current + 1, trainingGoalRef.current);

    if (nextCount >= trainingGoalRef.current) {
      recordCalibrationPoint(targetCenterX, targetCenterY);
      setClickCount(nextCount);
      return;
    }

    const sampleCurrentPoint = () => {
      if (!isTrackerActiveRef.current) return;
      if (!isTrackerReadyRef.current || trackerPhaseRef.current !== TRACKER_PHASES.CALIBRATION) return;
      if (!hasUsableWebGazerDetection()) return;

      recordCalibrationPoint(targetCenterX, targetCenterY);
    };

    startInputCooldown(() => {
      setClickCount((count) => Math.min(count + 1, trainingGoalRef.current));
    }, sampleCurrentPoint);
  };

  const handleTargetClick = (event) => {
    event.preventDefault();
    recordCurrentTrainingPoint(event.currentTarget);
  };

  const toggleAutoSelect = () => {
    setIsAutoSelectEnabled((enabled) => {
      if (enabled) {
        clearAutoSelectTimer();
      }

      return !enabled;
    });
  };

  const handleExit = () => {
    cleanup();
    setTrackerPhase(TRACKER_PHASES.CONSENT);
    setIsTrackerReady(false);
    setIsStartingTracker(false);
    setIsDarkeningCalibration(false);
    setShowFaceLockTips(true);
    setTrainingPoints(createTrainingPoints());
    setTrainingGoal(BASELINE_TRAINING_POINTS);
    setClickCount(0);
    setCooldownRemainingMs(0);
    setShowRefinementPrompt(false);
    setRefinementDecision('pending');
    clearFirstDotDelay();
    setIsTrackerMenuOpen(false);
  };

  const startCalibrationPhase = () => {
    if (!isTrackerReady) return;
    isTrackerActiveRef.current = true;
    clearInputCooldown();
    clearAutoSelectTimer();
    clearFirstDotDelay();
    startCalibrationInputHint();
    window.webgazer?.clearData?.();
    setClickCount(0);
    setTrainingGoal(BASELINE_TRAINING_POINTS);
    setTrainingPoints(createTrainingPoints());
    setTrackerPhase(TRACKER_PHASES.CALIBRATION);
    setIsDarkeningCalibration(true);
    setShowFaceLockTips(false);
    setShowRefinementPrompt(false);
    setRefinementDecision('pending');
    setIsTrackerMenuOpen(false);
    startFirstDotDelay();
  };

  const startRefinementRound = () => {
    if (trainingGoalRef.current > BASELINE_TRAINING_POINTS || refinementDecision === 'accepted') {
      setShowRefinementPrompt(false);
      return;
    }

    clearAutoSelectTimer();
    clearFirstDotDelay();
    setTrainingPoints((points) => [...points, ...createRefinementPoints(EXTRA_REFINEMENT_POINTS)]);
    setTrainingGoal(BASELINE_TRAINING_POINTS + EXTRA_REFINEMENT_POINTS);
    setShowRefinementPrompt(false);
    setRefinementDecision('accepted');
    setIsTrackerMenuOpen(false);
    setTrackerPhase(TRACKER_PHASES.CALIBRATION);
    startCalibrationInputHint();
  };

  const skipRefinementRound = () => {
    clearAutoSelectTimer();
    setShowRefinementPrompt(false);
    setIsTrackerMenuOpen(false);
  };

  const openTipsFromMenu = () => {
    setShowFaceLockTips(true);
    setIsTrackerMenuOpen(false);
  };

  const openRefinementPromptFromMenu = () => {
    setShowRefinementPrompt(true);
    setIsTrackerMenuOpen(false);
  };

  const activePoint = trainingPoints[Math.min(clickCount, trainingGoal - 1)];
  const shouldShowTrainingDot =
    isTrackerReady &&
    trackerPhase === TRACKER_PHASES.CALIBRATION &&
    clickCount < trainingGoal &&
    !showRefinementPrompt &&
    !showFaceLockTips &&
    !isFirstDotDelayActive;
  const shouldShowGazeDot = isTrackerReady && trackerPhase === TRACKER_PHASES.CALIBRATION && clickCount >= LIVE_TRACKING_START_CLICK;
  const isFaceLockPhase = trackerPhase === TRACKER_PHASES.FACE_LOCK;
  const isConsentPhase = trackerPhase === TRACKER_PHASES.CONSENT;
  const calibrationProgressCurrent = clickCount < BASELINE_TRAINING_POINTS
    ? Math.min(clickCount, BASELINE_TRAINING_POINTS)
    : Math.min(Math.max(0, clickCount - BASELINE_TRAINING_POINTS), EXTRA_REFINEMENT_POINTS);
  const calibrationProgressGoal = clickCount < BASELINE_TRAINING_POINTS ? BASELINE_TRAINING_POINTS : EXTRA_REFINEMENT_POINTS;
  const isTrainingComplete = clickCount >= trainingGoal;
  const isInputCoolingDown = cooldownRemainingMs > 0;
  const shouldShowRefinementOption =
    trackerPhase === TRACKER_PHASES.CALIBRATION &&
    clickCount >= BASELINE_TRAINING_POINTS;
  const shouldShowCalibrationInputHint = showCalibrationInputHint && trackerPhase === TRACKER_PHASES.CALIBRATION && !isTrainingComplete;
  const screenClassName = [
    isFaceLockPhase ? 'visage-calibration-screen visage-face-lock-screen' : 'visage-calibration-screen',
    isDarkeningCalibration ? 'visage-dark-calibration' : ''
  ].filter(Boolean).join(' ');

  useEffect(() => {
    clearAutoSelectTimer();

    if (!isAutoSelectEnabled || !shouldShowTrainingDot || isInputCoolingDown || !activePoint) {
      return undefined;
    }

    const autoSelectStartedAt = Date.now();
    setAutoSelectRemainingMs(AUTO_SELECT_DELAY_MS);

    autoSelectIntervalRef.current = setInterval(() => {
      const remaining = Math.max(0, AUTO_SELECT_DELAY_MS - (Date.now() - autoSelectStartedAt));
      setAutoSelectRemainingMs(remaining);
    }, AUTO_SELECT_TICK_MS);

    autoSelectTimerRef.current = setTimeout(() => {
      clearAutoSelectTimer();
      recordCurrentTrainingPoint();
    }, AUTO_SELECT_DELAY_MS);

    return clearAutoSelectTimer;
  }, [isAutoSelectEnabled, shouldShowTrainingDot, isInputCoolingDown, clickCount, activePoint]);

  useEffect(() => {
    const shouldAskForRefinement =
      trackerPhase === TRACKER_PHASES.CALIBRATION &&
      clickCount >= BASELINE_TRAINING_POINTS &&
      trainingGoal === BASELINE_TRAINING_POINTS &&
      refinementDecision === 'pending';

    if (!shouldAskForRefinement) {
      return;
    }

    clearAutoSelectTimer();
  }, [trackerPhase, clickCount, trainingGoal, refinementDecision]);

  if (isConsentPhase) {
    return (
      <section className="vision-tracker-inline">
        <div className="visage-consent-panel">
          <h1>Gaze Tracker</h1>
          <ul className="visage-consent-points">
            <li><strong>Step 1:</strong> Start calibration</li>
            <li><strong>Step 2:</strong> Complete 25 blue-dot inputs</li>
            <li><strong>Step 3:</strong> Live gaze tracking starts</li>
          </ul>
          <p className="visage-consent-note">Optional: after calibration, you can add 15 extra inputs to refine accuracy.</p>
          {error && <strong className="visage-error">{error}</strong>}
          <button
            className="visage-start-calibration-button visage-consent-button"
            onClick={startTrackerWithConsent}
            disabled={isStartingTracker}
            type="button"
          >
            {isStartingTracker ? 'Requesting permission...' : 'Enter Fullscreen & Start'}
          </button>
        </div>
      </section>
    );
  }

  return createPortal(
    <section className={screenClassName}>
      <video ref={videoRef} className={isFaceLockPhase ? 'visage-background-video visage-face-lock-video' : 'visage-background-video'} autoPlay muted playsInline />
      <div className={isFaceLockPhase ? 'visage-head-guide visage-head-guide-face-lock' : 'visage-head-guide'} aria-hidden="true"></div>

      {!isConsentPhase && (
        <>
          <button
            className={isTrackerMenuOpen ? 'visage-menu-toggle visage-menu-toggle-open' : 'visage-menu-toggle'}
            onClick={() => setIsTrackerMenuOpen((isOpen) => !isOpen)}
            type="button"
            aria-label={isTrackerMenuOpen ? 'Close tracker menu' : 'Open tracker menu'}
            aria-expanded={isTrackerMenuOpen}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div className={isTrackerMenuOpen ? 'visage-menu-backdrop visage-menu-backdrop-open' : 'visage-menu-backdrop'} onClick={() => setIsTrackerMenuOpen(false)} aria-hidden="true"></div>
            <nav className={isTrackerMenuOpen ? 'visage-side-menu visage-side-menu-open' : 'visage-side-menu'} aria-label="Gaze tracker menu">
            <div className="visage-side-menu-header">
              <strong>Gaze Tracker</strong>
            </div>
            <button
              className={showFaceLockTips ? 'visage-menu-action visage-menu-action-active' : 'visage-menu-action'}
              onClick={openTipsFromMenu}
              type="button"
            >
              Tips
            </button>
            <button
              className={isAutoSelectEnabled ? 'visage-menu-action visage-menu-action-blue' : 'visage-menu-action'}
              onClick={toggleAutoSelect}
              type="button"
              aria-pressed={isAutoSelectEnabled}
            >
              Auto select {isAutoSelectEnabled ? 'On' : 'Off'}
            </button>
            {shouldShowRefinementOption && (
              <button
                className={showRefinementPrompt ? 'visage-menu-action visage-menu-action-active' : 'visage-menu-action'}
                onClick={openRefinementPromptFromMenu}
                type="button"
              >
                Refine Accuracy
              </button>
            )}
            <button className="visage-menu-action visage-menu-action-exit" onClick={handleExit} type="button">
              Exit
            </button>
          </nav>
        </>
      )}

      {isFaceLockPhase && !showFaceLockTips && (
        <div className="visage-face-lock-actions visage-face-lock-actions-centered">
          <button
            className="visage-start-calibration-button"
            onClick={startCalibrationPhase}
            disabled={!isTrackerReady}
            type="button"
          >
            {isTrackerReady ? 'Start Calibration' : 'Starting camera...'}
          </button>
          <button
            className={isAutoSelectEnabled ? 'visage-auto-select-button visage-auto-select-button-active visage-face-lock-auto-select' : 'visage-auto-select-button visage-face-lock-auto-select'}
            onClick={toggleAutoSelect}
            type="button"
            aria-pressed={isAutoSelectEnabled}
          >
            Auto select {isAutoSelectEnabled ? 'On' : 'Off'}
          </button>
        </div>
      )}

      <div className={isFaceLockPhase ? 'visage-copy visage-face-lock-copy' : 'visage-copy'}>
        {showFaceLockTips ? (
          <aside className="visage-face-lock-panel">
            <div className="visage-face-lock-header">
              <p className="visage-face-lock-message">Calibration Tips</p>
              <button className="visage-tips-close-button" onClick={() => setShowFaceLockTips(false)} type="button">
                Close
              </button>
            </div>
            <ul className="visage-calibration-rules">
              <li>Align your face inside the green guide oval.</li>
              <li>Keep your head still; move only your eyes.</li>
              <li className="vision-desktop-tip">Press <span>B</span> for each blue dot, or turn on Auto select to select dots automatically after a short pause.</li>
              <li className="vision-mobile-tip">Use Auto select to select each blue dot automatically after a short pause.</li>
              <li>Ensure steady front lighting; avoid glare on glasses or the webcam lens for best accuracy.</li>
              <li>Tracking starts after 25 dots. Extra points are optional.</li>
            </ul>
          </aside>
        ) : isFaceLockPhase || isTrainingComplete ? null : (
          <>
            <div className="visage-calibration-status visage-corner-counter">
              <strong className="visage-calibration-counter">Focus on the blue dot</strong>
              <small className="visage-calibration-progress">{calibrationProgressCurrent}/{calibrationProgressGoal}</small>
            </div>
            {shouldShowCalibrationInputHint && (
              <span className="visage-input-choice-hint">
                <span className="vision-desktop-tip">Click blue dot (or press <b>B</b>)</span>
                <span className="vision-mobile-tip">Tap the blue dot</span>
                <span>Keep looking as it fades.</span>
                <small>Keep your head still.</small>
              </span>
            )}
          </>
        )}
        {error && <strong className="visage-error">{error}</strong>}
        {!error && isStartingTracker && <strong className="visage-loading">Starting camera...</strong>}
      </div>

      {showRefinementPrompt && (
        <aside className="visage-refinement-prompt" aria-live="polite">
          <p className="visage-refinement-label">Optional</p>
          <h2>{refinementDecision === 'accepted' ? 'Refinement active' : 'Need more accuracy?'}</h2>
          <p>
            {refinementDecision === 'accepted'
              ? 'Complete the extra dots to finish the optional refinement round.'
              : 'Add 15 extra inputs to refine accuracy, or continue with current tracking.'}
          </p>
          <div className="visage-refinement-actions">
            <button className="visage-refinement-button" onClick={skipRefinementRound} type="button">
              {refinementDecision === 'accepted' ? 'Close' : 'No'}
            </button>
            <button
              className="visage-refinement-button visage-refinement-button-primary"
              onClick={startRefinementRound}
              disabled={refinementDecision === 'accepted'}
              type="button"
            >
              Yes
            </button>
          </div>
        </aside>
      )}

      {shouldShowTrainingDot && (
        <>
          <button
            className={isInputCoolingDown ? 'visage-training-dot visage-training-dot-cooling' : 'visage-training-dot'}
            onClick={handleTargetClick}
            disabled={isInputCoolingDown}
            style={{ left: `${activePoint.x}%`, top: `${activePoint.y}%` }}
            type="button"
            aria-label="Calibration point"
          ></button>
          {isAutoSelectEnabled && !isInputCoolingDown && autoSelectRemainingMs > 0 && (
            <span
              className="visage-auto-select-timer"
              style={{ left: `${activePoint.x}%`, top: `${activePoint.y}%` }}
              aria-hidden="true"
            >
              {(autoSelectRemainingMs / 1000).toFixed(1)}s
            </span>
          )}
        </>
      )}

      {shouldShowGazeDot && (
        <span
          className="visage-gaze-dot"
          style={{ transform: `translate(${gazePoint.x}px, ${gazePoint.y}px)` }}
          aria-hidden="true"
        ></span>
      )}
    </section>,
    document.body
  );
};

export default VisionTracker;
