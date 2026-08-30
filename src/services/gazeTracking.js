export const GAZE_STATES = {
  UNINITIALIZED: 'UNINITIALIZED',
  FACE_LOCK: 'FACE_LOCK',
  CALIBRATING: 'CALIBRATING',
  LIVE_TRACKING: 'LIVE_TRACKING'
};

export const CALIBRATION_POINTS = Array.from({ length: 25 }, (_, index) => {
  const row = Math.floor(index / 5);
  const column = index % 5;

  return {
    x: 10 + column * 20,
    y: 10 + row * 20
  };
});

export function createInitialGazeSession() {
  return {
    state: GAZE_STATES.UNINITIALIZED,
    currentPointIndex: 0,
    samples: [],
    estimatedPoint: null
  };
}

export function addCalibrationSample(session, sample) {
  return {
    ...session,
    samples: [...session.samples, sample],
    currentPointIndex: session.currentPointIndex + 1
  };
}

let webGazerScriptPromise = null;
const WEBGAZER_SCRIPT_URL = 'https://cdn.jsdelivr.net/gh/jspsych/jsPsych@jspsych@7.0.0/examples/js/webgazer/webgazer.js';

export function loadWebGazer() {
  if (window.webgazer) {
    return Promise.resolve(window.webgazer);
  }

  if (!webGazerScriptPromise) {
    webGazerScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-webgazer="true"]');

      if (existingScript) {
        // During local hot reload, a previous failed script tag can remain in
        // the DOM. Remove it so the browser does not reuse a broken HTML response.
        existingScript.remove();
      }

      const script = document.createElement('script');
      script.src = WEBGAZER_SCRIPT_URL;
      script.type = 'text/javascript';
      script.async = true;
      script.dataset.webgazer = 'true';
      script.onload = () => {
        if (window.webgazer) {
          resolve(window.webgazer);
          return;
        }

        reject(new Error('WebGazer loaded, but did not initialize.'));
      };
      script.onerror = () => reject(new Error('Failed to load WebGazer.js'));
      document.body.appendChild(script);
    });
  }

  return webGazerScriptPromise;
}

export async function startWebGazer(gazeListener) {
  const webgazer = await loadWebGazer();

  webgazer.clearData?.();
  webgazer.removeMouseEventListeners?.();

  // Ocula trains WebGazer only from explicit blue-dot inputs. The library's
  // automatic mouse listeners can make the gaze dot follow the cursor, so we
  // disable them and call recordScreenPosition ourselves during calibration.
  webgazer
    .setRegression('ridge')
    .setGazeListener(gazeListener);

  webgazer.showVideoPreview?.(false);
  webgazer.showPredictionPoints?.(false);
  webgazer.showFaceOverlay?.(false);
  webgazer.showFaceFeedbackBox?.(false);

  await webgazer.begin();
  webgazer.removeMouseEventListeners?.();
  hideWebGazerDom();
  return webgazer;
}

export function recordCalibrationPoint(x, y) {
  const webgazer = window.webgazer;

  if (!webgazer?.recordScreenPosition) {
    return false;
  }

  // Explicitly train WebGazer on the target center. This is more stable than
  // relying only on the raw mouse click coordinate.
  webgazer.recordScreenPosition(x, y, 'click');
  return true;
}

export function stopWebGazer() {
  const webgazer = window.webgazer;
  if (!webgazer) return;

  try {
    webgazer.pause();
    webgazer.clearGazeListener();
    webgazer.end();
  } catch (error) {
    console.warn('WebGazer cleanup warning:', error);
  }

  document.querySelectorAll('video').forEach((video) => {
    if (!video.id?.toLowerCase().includes('webgazer') && !video.className?.toString().toLowerCase().includes('webgazer')) return;

    video.srcObject?.getTracks?.().forEach((track) => track.stop());
  });

  removeWebGazerDom();
}

export function hideWebGazerDom() {
  [
    'webgazerVideoFeed',
    'webgazerFaceOverlay',
    'webgazerFaceFeedbackBox',
    'webgazerVideoContainer'
  ].forEach((elementId) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.style.display = 'none';
    element.style.pointerEvents = 'none';
    element.style.opacity = '0';
  });
}

export function removeWebGazerDom() {
  [
    'webgazerVideoFeed',
    'webgazerFaceOverlay',
    'webgazerFaceFeedbackBox',
    'webgazerVideoContainer'
  ].forEach((elementId) => {
    document.getElementById(elementId)?.remove();
  });
}
