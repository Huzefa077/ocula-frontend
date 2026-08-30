let faceApiScriptPromise = null;
let faceApiModelsPromise = null;

function loadFaceApiScript() {
  if (window.faceapi) {
    return Promise.resolve(window.faceapi);
  }

  if (!faceApiScriptPromise) {
    faceApiScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-face-api="true"]');

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.faceapi), { once: true });
        existingScript.addEventListener('error', () => reject(new Error('Failed to load face-api.js script')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
      script.async = true;
      script.dataset.faceApi = 'true';
      script.onload = () => resolve(window.faceapi);
      script.onerror = () => reject(new Error('Failed to load face-api.js script'));
      document.body.appendChild(script);
    });
  }

  return faceApiScriptPromise;
}

export async function loadFaceAnalysisModels() {
  const publicUrl = process.env.PUBLIC_URL || '';
  const localModelUrl = `${publicUrl.replace(/\/$/, '')}/models`;

  if (!faceApiModelsPromise) {
    faceApiModelsPromise = loadFaceApiScript().then(async (faceapi) => {
      // Ocula currently ships detector, age/gender, and expression models.
      // Landmark models can be added later without changing callers.
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(localModelUrl),
        faceapi.nets.faceExpressionNet.loadFromUri(localModelUrl),
        faceapi.nets.ageGenderNet.loadFromUri(localModelUrl)
      ]);

      return faceapi;
    });
  }

  return faceApiModelsPromise;
}

export function getTopExpression(expressions = {}) {
  return Object.entries(expressions).reduce(
    (best, current) => (current[1] > best[1] ? current : best),
    ['unknown', 0]
  );
}
