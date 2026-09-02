// This file loads the face models, scans the image, draws face boxes, and shows the AI face summary.
import React, { Component } from 'react';
import { API_URL, isApiConfigured } from '../../config';
import './FaceRecognition.css';

let faceApiScriptPromise = null;
let faceApiModelsPromise = null;

// Load the face-api script once and reuse it across renders.
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

class FaceRecognition extends Component {
  constructor(props) {
    super(props);
    // Refs give the detector direct access to the rendered image and overlay canvas.
    this.imageRef = React.createRef();
    this.canvasRef = React.createRef();
    this.state = {
      faceSummaries: [],
      faceBoxes: [],
      displayImageUrl: props.imageUrl || '',
      usingProxy: false
    };
    // These instance fields do not affect rendering, so keeping them out of state avoids extra renders.
    this.isProcessing = false;
    this.resizeObserver = null;
    this.modelsLoaded = false;
    this.faceapi = null;
    this.hasReportedSuccessForSession = false;
    this.latestFaceBoxes = [];
  }

  async componentDidMount() {
    await this.loadModels();
    // App owns the export button, but this component owns the canvas export logic.
    this.props.onExportReady?.(this.exportAnonymizedImage);

    if (this.imageRef.current?.complete && this.props.imageUrl) {
      this.detectFaces();
    }

    this.resizeObserver = new ResizeObserver(() => {
      // Re-run detection after layout changes because face boxes are drawn in displayed pixel coordinates.
      if (this.modelsLoaded && this.imageRef.current) {
        this.detectFaces();
      }
    });

    if (this.imageRef.current) {
      this.resizeObserver.observe(this.imageRef.current);
    }
  }

  async loadModels() {
    const publicUrl = process.env.PUBLIC_URL || '';
    const localModelUrl = `${publicUrl.replace(/\/$/, '')}/models`;

    try {
      if (!faceApiModelsPromise) {
        // Store one shared promise so multiple component mounts wait for the same model download.
        faceApiModelsPromise = loadFaceApiScript().then(async (faceapi) => {
          // Cache model loading so sign-out/sign-in does not download the same models again.
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(localModelUrl),
            faceapi.nets.faceExpressionNet.loadFromUri(localModelUrl),
            faceapi.nets.ageGenderNet.loadFromUri(localModelUrl)
          ]);

          return faceapi;
        });
      }

      this.faceapi = await faceApiModelsPromise;

      this.modelsLoaded = true;
    } catch (err) {
      console.error('Error loading face-api models:', err);
      this.props.onDetectFail?.('Failed to load detection models');
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.scanSessionId !== this.props.scanSessionId) {
      // Reset any old analysis when a new scan session starts or when the user cancels.
      this.isProcessing = false;
      this.hasReportedSuccessForSession = false;
      this.latestFaceBoxes = [];
      this.setState({ faceSummaries: [], faceBoxes: [] });
      this.props.onFaceBoxesUpdate?.([]);
    }

    if (prevProps.imageUrl !== this.props.imageUrl && this.props.imageUrl) {
      // A new image should start clean, even if the previous image had boxes or used the proxy fallback.
      this.latestFaceBoxes = [];
      this.setState({
        faceSummaries: [],
        faceBoxes: [],
        displayImageUrl: this.props.imageUrl,
        usingProxy: false
      });
    } else if (prevProps.imageUrl !== this.props.imageUrl && !this.props.imageUrl) {
      this.latestFaceBoxes = [];
      this.setState({ faceSummaries: [], faceBoxes: [], displayImageUrl: '', usingProxy: false });
      this.props.onFaceBoxesUpdate?.([]);
    }

    if (prevProps.blurredFaceIds !== this.props.blurredFaceIds) {
      // Blur selection changes only require redrawing the canvas, not re-running face detection.
      this.drawFaceOverlay();
    }
  }

  componentWillUnmount() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  getTopExpression = (expressions = {}) => (
    // face-api returns confidence scores for many expressions; show the highest one in the UI.
    Object.entries(expressions).reduce(
      (best, current) => (current[1] > best[1] ? current : best),
      ['unknown', 0]
    )
  );

  createEnhancedImageCanvas = (img) => {
    const enhancedCanvas = document.createElement('canvas');
    enhancedCanvas.width = img.naturalWidth;
    enhancedCanvas.height = img.naturalHeight;

    try {
      const enhancedContext = enhancedCanvas.getContext('2d');
      // Low-light fallback: brighten and increase contrast only for detection,
      // not for display, so the user's original image stays unchanged.
      enhancedContext.filter = 'brightness(1.18) contrast(1.22)';
      enhancedContext.drawImage(img, 0, 0, enhancedCanvas.width, enhancedCanvas.height);
      return enhancedCanvas;
    } catch (error) {
      return null;
    }
  };

  getSelectedBlurIds = () => new Set(this.props.blurredFaceIds || []);

  drawNumberedBox = (ctx, face) => {
    const { x, y, width, height } = face.box;

    ctx.save();
    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0, 210, 255, 0.75)';
    ctx.shadowBlur = 10;
    ctx.strokeRect(x, y, width, height);

    const label = `#${face.id}`;
    const labelWidth = 38;
    const labelHeight = 26;
    const labelX = Math.max(x, 6);
    const labelY = Math.max(y - labelHeight - 6, 6);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffe46e';
    ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
    ctx.fillStyle = '#111827';
    ctx.font = '700 15px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, labelX + 9, labelY + labelHeight / 2);
    ctx.restore();
  };

  drawBlurPatch = (ctx, img, face) => {
    const { x, y, width, height } = face.box;
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    ctx.save();
    try {
      // The blur is drawn only inside the selected face rectangle, not over the whole image.
      ctx.filter = 'blur(14px)';
      ctx.drawImage(
        img,
        x * scaleX,
        y * scaleY,
        width * scaleX,
        height * scaleY,
        x,
        y,
        width,
        height
      );
    } catch (error) {
      // Some remote hosts block canvas access. This fallback still anonymizes the face visually.
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(2, 8, 23, 0.78)';
      ctx.fillRect(x, y, width, height);
    }
    ctx.restore();
  };

  drawFaceOverlay = () => {
    const img = this.imageRef.current;
    const canvas = this.canvasRef.current;
    if (!img || !canvas) return;

    const displaySize = { width: img.clientWidth, height: img.clientHeight };
    canvas.width = displaySize.width;
    canvas.height = displaySize.height;
    canvas.style.width = `${displaySize.width}px`;
    canvas.style.height = `${displaySize.height}px`;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const selectedBlurIds = this.getSelectedBlurIds();
    // Draw blur patches first, then draw labels/boxes on top so the face numbers remain readable.
    this.latestFaceBoxes.forEach((face) => {
      if (selectedBlurIds.has(face.id)) {
        this.drawBlurPatch(ctx, img, face);
      }
    });

    this.latestFaceBoxes.forEach((face) => this.drawNumberedBox(ctx, face));
  };

  exportAnonymizedImage = () => {
    const img = this.imageRef.current;
    if (!img || !this.latestFaceBoxes.length) return false;

    const selectedBlurIds = this.getSelectedBlurIds();
    if (!selectedBlurIds.size) return false;

    // Export uses the original image resolution so the downloaded file is not limited to preview size.
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = img.naturalWidth;
    outputCanvas.height = img.naturalHeight;

    const outputContext = outputCanvas.getContext('2d');
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    try {
      outputContext.drawImage(img, 0, 0, outputCanvas.width, outputCanvas.height);

      this.latestFaceBoxes.forEach((face) => {
        if (!selectedBlurIds.has(face.id)) return;

        const sx = face.box.x * scaleX;
        const sy = face.box.y * scaleY;
        const sw = face.box.width * scaleX;
        const sh = face.box.height * scaleY;

        outputContext.save();
        outputContext.filter = 'blur(18px)';
        outputContext.drawImage(outputCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
        outputContext.restore();
      });

      const downloadLink = document.createElement('a');
      downloadLink.href = outputCanvas.toDataURL('image/png');
      downloadLink.download = `ocula-anonymized-${Date.now()}.png`;
      downloadLink.click();
      return true;
    } catch (error) {
      console.error('Could not export anonymized image:', error);
      this.props.onDetectFail?.('This image cannot be exported because the host blocks canvas downloads. Try uploading the file instead.');
      return false;
    }
  };

  detectFaces = async () => {
    // Prevent overlapping scans when image load, resize, or state changes happen close together.
    if (this.isProcessing || !this.modelsLoaded) return;

    const img = this.imageRef.current;
    const canvas = this.canvasRef.current;
    if (!img || !canvas || !this.faceapi) return;
    if (!img.complete || img.naturalWidth === 0) return;

    const currentScanSessionId = this.props.scanSessionId;
    const detectionStartedAt = performance.now();
    this.isProcessing = true;
    this.props.onDetectStart?.();
    this.props.onDetectFail?.(null);

    try {
      if (img.decode) {
        await img.decode().catch(() => {});
      }

      const detectWithOptions = (input, inputSize, scoreThreshold) => this.faceapi
        .detectAllFaces(input, new this.faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold }))
        .withFaceExpressions()
        .withAgeAndGender();

      // Start with a faster detector size, then retry with stronger settings only if no face is found.
      let detectionInput = img;
      let detections = await detectWithOptions(detectionInput, 416, 0.32);

      if (detections.length === 0) {
        // A slightly larger detector input helps with smaller faces without
        // making every successful scan slower.
        detections = await detectWithOptions(detectionInput, 608, 0.25);
      }

      if (detections.length === 0) {
        const enhancedInput = this.createEnhancedImageCanvas(img);

        if (enhancedInput) {
          // The enhanced canvas is only a detection fallback; the displayed image stays original.
          detectionInput = enhancedInput;
          detections = await detectWithOptions(detectionInput, 608, 0.25);
        }
      }

      const displaySize = { width: img.clientWidth, height: img.clientHeight };

      canvas.width = displaySize.width;
      canvas.height = displaySize.height;

      // face-api gives results in image coordinates, so resize them for the visible canvas.
      const resizedDetections = this.faceapi.resizeResults(detections, displaySize);

      // If a newer scan started while this one was running, ignore this stale result.
      if (currentScanSessionId !== this.props.scanSessionId) {
        return;
      }

      if (detections.length === 0) {
        this.latestFaceBoxes = [];
        this.setState({ faceSummaries: [], faceBoxes: [] });
        this.drawFaceOverlay();
        this.props.onFaceBoxesUpdate?.([]);
        this.props.onAnalysisUpdate?.({ faceSummaries: [], processingTimeMs: Math.round(performance.now() - detectionStartedAt) });
        this.props.onDetectFail?.('No faces detected');
      } else {
        const faceSummaries = detections.map((detection, index) => {
          const [expression, confidence] = this.getTopExpression(detection.expressions);

          return {
            id: index + 1,
            age: Math.round(detection.age),
            gender: detection.gender || 'unknown',
            genderConfidence: Math.round((detection.genderProbability || 0) * 100),
            expression,
            expressionConfidence: Math.round(confidence * 100)
          };
        });

        const faceBoxes = resizedDetections.map((detection, index) => ({
          id: index + 1,
          box: detection.detection.box
        }));

        this.latestFaceBoxes = faceBoxes;
        this.setState({
          faceBoxes,
          faceSummaries
        }, this.drawFaceOverlay);
        this.props.onFaceBoxesUpdate?.(faceBoxes);
        this.props.onAnalysisUpdate?.({ faceSummaries, processingTimeMs: Math.round(performance.now() - detectionStartedAt) });
        if (!this.hasReportedSuccessForSession) {
          this.hasReportedSuccessForSession = true;
          this.props.onDetectSuccess?.();
        }
      }
    } catch (error) {
      if (currentScanSessionId !== this.props.scanSessionId) {
        return;
      }
      console.error('Face detection error:', error);
      this.latestFaceBoxes = [];
      this.setState({ faceSummaries: [], faceBoxes: [] });
      this.props.onFaceBoxesUpdate?.([]);
      this.props.onAnalysisUpdate?.({ faceSummaries: [], processingTimeMs: 0 });
      this.props.onDetectFail?.('Could not process image. Try another URL.');
    } finally {
      this.isProcessing = false;
    }
  };

  handleImageError = () => {
    const { imageUrl } = this.props;

    if (!this.state.usingProxy && isApiConfigured && /^https?:\/\//i.test(imageUrl)) {
      // Some hosts block direct browser image loading, so the backend proxy gets one retry chance.
      this.setState({
        displayImageUrl: `${API_URL}/image-proxy?url=${encodeURIComponent(imageUrl)}`,
        usingProxy: true
      });
      return;
    }

    this.isProcessing = false;
    this.latestFaceBoxes = [];
    this.setState({ faceSummaries: [], faceBoxes: [] });
    this.props.onFaceBoxesUpdate?.([]);
    this.props.onDetectFail?.('This image host blocked access. Try another direct image URL.');
  };

  handleImageLoad = () => {
    // Wait for the image to finish loading before starting detection.
    this.props.onDetectStart?.();
    this.detectFaces();
  };

  render() {
    const { imageUrl, isDetecting, showAnalysisPanel = true } = this.props;
    const { faceSummaries, displayImageUrl } = this.state;

    return (
      <div className="center ma face-recognition-container">
        {imageUrl && (
          <>
            <div className="face-recognition-frame">
              <div className="face-image-stage">
                <img
                  ref={this.imageRef}
                  src={displayImageUrl || imageUrl}
                  alt="Input for face detection"
                  crossOrigin="anonymous"
                  onLoad={this.handleImageLoad}
                  onError={this.handleImageError}
                  className="face-image"
                />
                <canvas
                  ref={this.canvasRef}
                  className="face-overlay"
                />
              </div>
              {isDetecting && (
                <div className="face-loader-overlay">
                  <div className="face-loader"></div>
                </div>
              )}
            </div>

            {showAnalysisPanel && faceSummaries.length > 0 && (
              <section className="face-analysis-panel">
                <h3 className="face-analysis-title">AI face summary</h3>
                <p className="face-analysis-note">The numbers on the image match the cards below.</p>
                <div className="face-analysis-grid">
                  {faceSummaries.map((face) => (
                    <article key={face.id} className="face-analysis-card">
                      <p className="face-analysis-card-title">Face {face.id}</p>
                      <p>Age estimate: {face.age}</p>
                      <p>Gender: {face.gender} ({face.genderConfidence}%)</p>
                      <p>Expression: {face.expression} ({face.expressionConfidence}%)</p>
                    </article>
                  ))}
                </div>
                <p className="face-analysis-disclaimer">
                  AI results are only estimates. Similar facial features can lead to mixed or incorrect predictions.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    );
  }
}

export default FaceRecognition;
