import React, { Component } from 'react';
import './FaceRecognition.css';

let faceApiScriptPromise = null;

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
    const MODEL_URL = `${publicUrl.replace(/\/$/, '')}/models`;

    try {
      this.faceapi = await loadFaceApiScript();

      await Promise.all([
        this.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        this.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ]);

      this.modelsLoaded = true;
    } catch (err) {
      console.error('❌ Error loading face-api models:', err);
      this.props.onDetectFail?.('Failed to load detection models');
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.imageUrl !== this.props.imageUrl && this.props.imageUrl && this.modelsLoaded) {
      this.detectFaces();
    }
  }

  componentWillUnmount() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  detectFaces = async () => {
    if (this.isProcessing || !this.modelsLoaded) return;

    const img = this.imageRef.current;
    const canvas = this.canvasRef.current;
    if (!img || !canvas || !this.faceapi) return;

    this.isProcessing = true;
    this.props.onDetectStart?.();           // Start loading
    this.props.onDetectFail?.(null);
    try {
      const detections = await this.faceapi
        .detectAllFaces(img, new this.faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      const displaySize = { width: img.clientWidth, height: img.clientHeight };

      canvas.width = displaySize.width;
      canvas.height = displaySize.height;

      const resizedDetections = this.faceapi.resizeResults(detections, displaySize);

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      this.faceapi.draw.drawDetections(canvas, resizedDetections);
      this.faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

      if (detections.length === 0) {
        this.props.onDetectFail?.("No faces detected");
      } else {
        this.props.onDetectSuccess?.();
      }
      // else success is handled by onDetectSuccess only when we want
    } catch (error) {
      console.error('Face detection error:', error);
      this.props.onDetectFail?.("Could not process image. Try another URL.");
    } finally {
      this.isProcessing = false;
    }
  };

  handleImageError = () => {
    this.props.onDetectFail?.("Failed to load image. Check the URL.");
    this.props.onDetectSuccess?.();
  };

  render() {
    const { imageUrl } = this.props;

    return (
      <div className="center ma" style={{ width: '90vw', maxWidth: '1000px', marginBottom: '2rem' }}>
        {imageUrl && (
          <div style={{ position: 'relative', width: '65%' }}>
            <img
              ref={this.imageRef}
              src={imageUrl}
              alt="Input for face detection"
              crossOrigin="anonymous"
              onLoad={this.detectFaces}
              onError={this.handleImageError}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
            <canvas
              ref={this.canvasRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
            />
          </div>
        )}
      </div>
    );
  }
}

export default FaceRecognition;
