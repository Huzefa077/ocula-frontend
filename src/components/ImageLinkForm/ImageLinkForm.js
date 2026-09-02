// This file renders the image URL/file toolbar and controls when users can start or cancel a scan.
import React, { useRef, useState } from 'react';
import './ImageLinkForm.css';
import { isValidImageUrl } from '../../utils/validation';

const ImageLinkForm = ({ 
  onInputChange, 
  onButtonSubmit, 
  onCancelDetect,
  onFileSelect,
  onClearInput,
  inputValue, 
  isDetecting
}) => {
  const fileInputRef = useRef(null);
  const [fileError, setFileError] = useState('');

  // Basic client-side checks keep bad URLs from being submitted.
  const trimmedValue = inputValue.trim();
  const hasInput = Boolean(trimmedValue);
  const canSubmit = hasInput && isValidImageUrl(trimmedValue);

  const readImageFile = (file) => {
    if (!file) return;

    // Uploaded files are read locally as data URLs, which keeps the scan browser-side.
    if (!file.type.startsWith('image/')) {
      setFileError('Please upload an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFileError('');
      onFileSelect?.(reader.result);
    };
    reader.onerror = () => setFileError('Could not read this file. Try another image.');
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event) => {
    readImageFile(event.target.files?.[0]);
    // Reset the hidden input so choosing the same file again still fires onChange.
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    // Do not accept a new file while the current scan is still running.
    if (isDetecting) return;
    readImageFile(event.dataTransfer.files?.[0]);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleUrlKeyDown = (event) => {
    // Enter should behave like the Detect Faces button only when the URL is valid.
    if (event.key !== 'Enter' || isDetecting || !canSubmit) return;

    event.preventDefault();
    onButtonSubmit?.();
  };

  return (
    <div className="image-link-form-wrapper">
      <div className="image-link-form-content">
        <div className="form image-input-toolbar" onDrop={handleDrop} onDragOver={handleDragOver}>
          <input
            className="image-url-input"
            type="text"
            value={inputValue}
            onChange={onInputChange}
            onKeyDown={handleUrlKeyDown}
            placeholder="Paste direct image URL..."
            disabled={isDetecting}
          />
          <input
            ref={fileInputRef}
            className="image-file-input"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={isDetecting}
          />
          <button
            className="button-primary image-detect-button"
            onClick={onButtonSubmit}
            disabled={isDetecting || !canSubmit}
            type="button"
          >
            {isDetecting ? 'Detecting...' : 'Detect Faces'}
          </button>
          {hasInput && !isDetecting && (
            <button
              className="button-muted image-clear-button"
              onClick={onClearInput}
              type="button"
            >
              Clear
            </button>
          )}
          <button
            className="button-muted image-upload-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDetecting}
            type="button"
          >
            Upload File
          </button>
          {isDetecting && (
            <button
              className="button-muted image-link-form-cancel"
              onClick={onCancelDetect}
              type="button"
            >
              Cancel
            </button>
          )}
        </div>
        {hasInput && !canSubmit && (
          <p className="image-link-form-error">
            Enter an http/https image URL or a small base64 image.
          </p>
        )}
        <p className="image-link-form-mobile-help">
          On mobile, open the image in a new browser tab first. Then copy the URL from the address bar and paste it here.
        </p>
        {fileError && <p className="image-link-form-error">{fileError}</p>}
      </div>
    </div>
  );
};

export default ImageLinkForm;
