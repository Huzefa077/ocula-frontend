import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { recordCalibrationPoint, startWebGazer, stopWebGazer } from '../../services/gazeTracking';
import './VisionTracker.css';

const BASELINE_TRAINING_POINTS = 36;
const EXTRA_REFINEMENT_POINTS = 15;
const TOTAL_TRAINING_POINTS = BASELINE_TRAINING_POINTS + EXTRA_REFINEMENT_POINTS;
const LIVE_TRACKING_START_CLICK = BASELINE_TRAINING_POINTS;
const GAZE_NOISE_DEAD_ZONE = 7;
// how long the dot dims and holds after being clicked, before moving to the next point
const CALIBRATION_INPUT_COOLDOWN_MS = 500;
const CALIBRATION_SAMPLE_INTERVAL_MS = 100;
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

  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      points.push({
        x: 8 + column * 16.8,
        y: 8 + row * 16.8
      });
    }
  }

  const centerPointIndex = getNearestCenterPointIndex(points);
  const centerPoint = points[centerPointIndex];
  const randomizedBaselinePoints = shufflePoints(points.filter((_, index) => index !== centerPointIndex));

  return [
    centerPoint,
    ...randomizedBaselinePoints,
    ...createRefinementPoints(EXTRA_REFINEMENT_POINTS)
  ];
}

const VisionTracker = () => {
  const [trainingPoints, setTrainingPoints] = useState(createTrainingPoints);
  const [trainingGoal, setTrainingGoal] = useState(TOTAL_TRAINING_POINTS);
  const [clickCount, setClickCount] = useState(0);
  const [trackerPhase, setTrackerPhase] = useState(TRACKER_PHASES.CONSENT);
  const [isTrackerReady, setIsTrackerReady] = useState(false);
  const [isStartingTracker, setIsStartingTracker] = useState(false);
  const [isDarkeningCalibration, setIsDarkeningCalibration] = useState(false);
  const [showCalibrationInputHint, setShowCalibrationInputHint] = useState(false);
  const [showFaceLockTips, setShowFaceLockTips] = useState(true);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  const [error, setError] = useState('');
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState('unknown');
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

  useEffect(() => {
    trackerPhaseRef.current = trackerPhase;
  }, [trackerPhase]);

  useEffect(() => {
    trainingPointsRef.current = trainingPoints;
    trainingGoalRef.current = trainingGoal;
    clickCountRef.current = clickCount;
    isTrackerReadyRef.current = isTrackerReady;
  }, [trainingPoints, trainingGoal, clickCount, isTrackerReady]);

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

  const startCalibrationInputHint = () => {
    clearCalibrationInputHint();
    setShowCalibrationInputHint(true);

    calibrationInputHintTimerRef.current = setTimeout(() => {
      setShowCalibrationInputHint(false);
      calibrationInputHintTimerRef.current = null;
    }, 3000);
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
    stopLocalStream();
    stopWebGazer();

    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => { });
    }
  };

  const resetCalibration = () => {
    isTrackerActiveRef.current = true;
    clearInputCooldown();
    startCalibrationInputHint();
    window.webgazer?.clearData?.();
    setTrainingPoints(createTrainingPoints());
    setTrainingGoal(TOTAL_TRAINING_POINTS);
    setClickCount(0);
    setTrackerPhase(TRACKER_PHASES.CALIBRATION);
    setIsDarkeningCalibration(false);
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
        if (clickCountRef.current >= trainingGoalRef.current) {
          setTrainingPoints((points) => [...points, ...createRefinementPoints(EXTRA_REFINEMENT_POINTS)]);
          setTrainingGoal((goal) => goal + EXTRA_REFINEMENT_POINTS);
          setTrackerPhase(TRACKER_PHASES.CALIBRATION);
          return;
        }

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

  const handleExit = () => {
    cleanup();
    setTrackerPhase(TRACKER_PHASES.CONSENT);
    setIsTrackerReady(false);
    setIsStartingTracker(false);
    setIsDarkeningCalibration(false);
    setShowFaceLockTips(true);
    setTrainingPoints(createTrainingPoints());
    setTrainingGoal(TOTAL_TRAINING_POINTS);
    setClickCount(0);
    setCooldownRemainingMs(0);
  };

  const startCalibrationPhase = () => {
    if (!isTrackerReady) return;
    isTrackerActiveRef.current = true;
    clearInputCooldown();
    startCalibrationInputHint();
    window.webgazer?.clearData?.();
    setClickCount(0);
    setTrainingGoal(TOTAL_TRAINING_POINTS);
    setTrainingPoints(createTrainingPoints());
    setTrackerPhase(TRACKER_PHASES.CALIBRATION);
    setIsDarkeningCalibration(true);
    setShowFaceLockTips(false);
  };

  const activePoint = trainingPoints[Math.min(clickCount, trainingGoal - 1)];
  const shouldShowTrainingDot = isTrackerReady && trackerPhase === TRACKER_PHASES.CALIBRATION && clickCount < trainingGoal;
  const shouldShowGazeDot = isTrackerReady && trackerPhase === TRACKER_PHASES.CALIBRATION && clickCount >= LIVE_TRACKING_START_CLICK;
  const isFaceLockPhase = trackerPhase === TRACKER_PHASES.FACE_LOCK;
  const isConsentPhase = trackerPhase === TRACKER_PHASES.CONSENT;
  const baselineProgress = Math.min(clickCount, BASELINE_TRAINING_POINTS);
  const refinementProgress = Math.max(0, clickCount - BASELINE_TRAINING_POINTS);
  const refinementGoal = trainingGoal - BASELINE_TRAINING_POINTS;
  const calibrationCounter = clickCount < BASELINE_TRAINING_POINTS
    ? `Calibration ${baselineProgress}/${BASELINE_TRAINING_POINTS}`
    : `Refinement ${refinementProgress}/${refinementGoal}`;
  const isTrainingComplete = clickCount >= trainingGoal;
  const isInputCoolingDown = cooldownRemainingMs > 0;
  const shouldShowCalibrationInputHint = showCalibrationInputHint && trackerPhase === TRACKER_PHASES.CALIBRATION && !isTrainingComplete;
  const screenClassName = [
    isFaceLockPhase ? 'visage-calibration-screen visage-face-lock-screen' : 'visage-calibration-screen',
    isDarkeningCalibration ? 'visage-dark-calibration' : ''
  ].filter(Boolean).join(' ');

  if (isConsentPhase) {
    return (
      <section className="vision-tracker-inline">
        <div className="visage-consent-panel">
          <p className="visage-consent-eyebrow">Privacy check</p>
          <h1>Start Gaze Tracker?</h1>
          <ul className="visage-consent-points">
            <li>Opens in fullscreen mode for accurate screen calibration.</li>
            <li>Asks for camera access so Ocula can estimate your gaze.</li>
            <li>Runs on your own device. Your camera feed is not uploaded or stored.</li>
          </ul>
          <small className="visage-permission-note">
            Camera permission: {cameraPermissionStatus}
            {cameraPermissionStatus === 'granted' ? ' — your browser already allowed this, so you may not see a popup.' : ''}
          </small>
          {error && <strong className="visage-error">{error}</strong>}
          <button
            className="visage-start-calibration-button visage-consent-button"
            onClick={startTrackerWithConsent}
            disabled={isStartingTracker}
            type="button"
          >
            {isStartingTracker ? 'Requesting permission...' : 'Enter Fullscreen & Start Camera'}
          </button>
        </div>
      </section>
    );
  }

  return createPortal(
    <section className={screenClassName}>
      <video ref={videoRef} className={isFaceLockPhase ? 'visage-background-video visage-face-lock-video' : 'visage-background-video'} autoPlay muted playsInline />
      <div className={isFaceLockPhase ? 'visage-head-guide visage-head-guide-face-lock' : 'visage-head-guide'} aria-hidden="true"></div>

      <button className="visage-exit-button" onClick={handleExit} type="button">
        Exit
      </button>

      {isFaceLockPhase && (
        <div className={showFaceLockTips ? 'visage-face-lock-actions' : 'visage-face-lock-actions visage-face-lock-actions-centered'}>
          <button
            className="visage-start-calibration-button"
            onClick={startCalibrationPhase}
            disabled={!isTrackerReady}
            type="button"
          >
            {isTrackerReady ? 'Start Calibration' : 'Starting camera...'}
          </button>
        </div>
      )}

      <div className={isFaceLockPhase ? 'visage-copy visage-face-lock-copy' : 'visage-copy'}>
        {isFaceLockPhase ? (
          showFaceLockTips ? (
            <aside className="visage-face-lock-panel">
              <div className="visage-face-lock-header">
                <p className="visage-face-lock-message">Tips:</p>
                <button className="visage-tips-close-button" onClick={() => setShowFaceLockTips(false)} type="button">
                  Close
                </button>
              </div>
              <ul className="visage-calibration-rules">
                <li>Fill the face oval without cropping your forehead or chin.</li>
                <li>Keep your head still during calibration. Even small head movements reduce accuracy.</li>
                <li className="vision-desktop-tip">For best accuracy, look at each blue dot and click it with the mouse. Press <span>B</span> only if needed; it is less accurate.</li>
                <li className="vision-mobile-tip">Look at each blue dot, then tap it once.</li>
                <li className="vision-mobile-tip">Use a tripod or phone stand if possible so your face stays steady inside the silhouette.</li>
                <li>After each input, keep looking at the dimmed dot until the next one appears.</li>
                <li>Use steady lighting; remove glasses if reflections block your eyes.</li>
                <li>Accuracy also depends on webcam quality and eye/pupil visibility.</li>
              </ul>
            </aside>
          ) : null
        ) : isTrainingComplete ? (
          <>
            {isTrainingComplete && (
              <strong className="visage-more-inputs-hint vision-desktop-tip">
                Press SPACE for 15 more inputs to increase accuracy.
              </strong>
            )}
          </>
        ) : (
          <>
            <strong className="visage-calibration-counter visage-corner-counter">{calibrationCounter}</strong>
            {shouldShowCalibrationInputHint && (
              <span className="visage-input-choice-hint">
                <span className="vision-desktop-tip">Click the blue dot</span>
                <em className="vision-desktop-tip">or</em>
                <span className="vision-desktop-tip">Look at it, then press <b>B</b></span>
                <span className="vision-mobile-tip">Tap the blue dot</span>
                <em className="vision-mobile-tip">then keep looking at it until it moves</em>
                <small>Keep your head still.</small>
              </span>
            )}
          </>
        )}
        {error && <strong className="visage-error">{error}</strong>}
        {!error && isStartingTracker && <strong className="visage-loading">Starting camera...</strong>}
      </div>

      {shouldShowTrainingDot && (
        <button
          className={isInputCoolingDown ? 'visage-training-dot visage-training-dot-cooling' : 'visage-training-dot'}
          onClick={handleTargetClick}
          disabled={isInputCoolingDown}
          style={{ left: `${activePoint.x}%`, top: `${activePoint.y}%` }}
          type="button"
          aria-label="Calibration point"
        ></button>
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
