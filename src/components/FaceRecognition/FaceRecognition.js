// This file loads the face models, scans the image, draws face boxes, and shows the AI face summary.
import React, { Component } from 'react';
import './FaceRecognition.css';

let faceApiScriptPromise = null;

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
    this.imageRef = React.createRef();
    this.canvasRef = React.createRef();
    this.state = {
      faceSummaries: [],
      faceBoxes: []
    };
    this.isProcessing = false;
    this.resizeObserver = null;
    this.modelsLoaded = false;
    this.faceapi = null;
  }

  async componentDidMount() {
    await this.loadModels();

    this.resizeObserver = new ResizeObserver(() => {
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
      // Load all face-api models from the local public folder so deployment stays reliable.
      this.faceapi = await loadFaceApiScript();

      await Promise.all([
        this.faceapi.nets.tinyFaceDetector.loadFromUri(localModelUrl),
        this.faceapi.nets.faceExpressionNet.loadFromUri(localModelUrl),
        this.faceapi.nets.ageGenderNet.loadFromUri(localModelUrl)
      ]);

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
      this.setState({ faceSummaries: [], faceBoxes: [] });
    }

    if (prevProps.imageUrl !== this.props.imageUrl && this.props.imageUrl && this.modelsLoaded) {
      this.setState({ faceSummaries: [], faceBoxes: [] });
    } else if (prevProps.imageUrl !== this.props.imageUrl && !this.props.imageUrl) {
      this.setState({ faceSummaries: [], faceBoxes: [] });
    }
  }

  componentWillUnmount() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  getTopExpression = (expressions = {}) => (
    Object.entries(expressions).reduce(
      (best, current) => (current[1] > best[1] ? current : best),
      ['unknown', 0]
    )
  );

  detectFaces = async () => {
    if (this.isProcessing || !this.modelsLoaded) return;

    const img = this.imageRef.current;
    const canvas = this.canvasRef.current;
    if (!img || !canvas || !this.faceapi) return;

    const currentScanSessionId = this.props.scanSessionId;
    this.isProcessing = true;
    this.props.onDetectStart?.();
    this.props.onDetectFail?.(null);

    try {
      const detections = await this.faceapi
        .detectAllFaces(img, new this.faceapi.TinyFaceDetectorOptions())
        .withFaceExpressions()
        .withAgeAndGender();

      const displaySize = { width: img.clientWidth, height: img.clientHeight };

      canvas.width = displaySize.width;
      canvas.height = displaySize.height;

      // face-api gives results in image coordinates, so resize them for the visible canvas.
      const resizedDetections = this.faceapi.resizeResults(detections, displaySize);

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      this.faceapi.draw.drawDetections(canvas, resizedDetections);

      // If a newer scan started while this one was running, ignore this stale result.
      if (currentScanSessionId !== this.props.scanSessionId) {
        return;
      }

      if (detections.length === 0) {
        this.setState({ faceSummaries: [], faceBoxes: [] });
        this.props.onDetectFail?.('No faces detected');
      } else {
        this.setState({
          faceBoxes: resizedDetections.map((detection, index) => ({
            id: index + 1,
            box: detection.detection.box
          })),
          faceSummaries: detections.map((detection, index) => {
            const [expression, confidence] = this.getTopExpression(detection.expressions);

            return {
              id: index + 1,
              age: Math.round(detection.age),
              gender: detection.gender || 'unknown',
              genderConfidence: Math.round((detection.genderProbability || 0) * 100),
              expression,
              expressionConfidence: Math.round(confidence * 100)
            };
          })
        });
        this.props.onDetectSuccess?.();
      }
    } catch (error) {
      if (currentScanSessionId !== this.props.scanSessionId) {
        return;
      }
      console.error('Face detection error:', error);
      this.setState({ faceSummaries: [], faceBoxes: [] });
      this.props.onDetectFail?.('Could not process image. Try another URL.');
    } finally {
      this.isProcessing = false;
    }
  };

  handleImageError = () => {
    this.isProcessing = false;
    this.setState({ faceSummaries: [], faceBoxes: [] });
    this.props.onDetectFail?.('This image host blocked access. Try another direct image URL.');
  };

  handleImageLoad = () => {
    // Wait for the image to finish loading before starting detection.
    this.props.onDetectStart?.();
    this.detectFaces();
  };

  render() {
    const { imageUrl, isDetecting } = this.props;
    const { faceSummaries, faceBoxes } = this.state;

    return (
      <div className="center ma face-recognition-container">
        {imageUrl && (
          <>
            <div className="face-recognition-frame">
              <img
                ref={this.imageRef}
                src={imageUrl}
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
              {faceBoxes.map((face) => (
                <div
                  key={face.id}
                  className="face-number-badge"
                  style={{
                    left: `${Math.max(face.box.x + face.box.width - 28, 0)}px`,
                    top: `${Math.max(face.box.y - 14, 0)}px`
                  }}
                >
                  {face.id}
                </div>
              ))}
              {isDetecting && (
                <div className="face-loader-overlay">
                  <div className="face-loader"></div>
                </div>
              )}
            </div>

            {faceSummaries.length > 0 && (
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
