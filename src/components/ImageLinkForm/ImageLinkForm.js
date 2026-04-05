import React from 'react';
import './ImageLinkForm.css';
import { isValidImageUrl } from '../../utils/validation';

const ImageLinkForm = ({ 
  onInputChange, 
  onButtonSubmit, 
  onCancelDetect,
  name, 
  inputValue, 
  isDetecting
}) => {
  // Basic client-side checks keep bad URLs from being submitted.
  const trimmedValue = inputValue.trim();
  const hasInput = Boolean(trimmedValue);
  const canSubmit = hasInput && isValidImageUrl(trimmedValue);

  return (
    <div className="image-link-form-wrapper">
      <div className="glow-text yellow">
        <p className="f3 mt4">
          Hello {name}!<br />
          Paste an image URL to detect faces.<br />
        </p>
      </div>

      <div className="image-link-form-content">
        <div className="form center pa4 br3 shadow-3">
          <input
            className="f4 pa3 w-70 center"
            type="text"
            value={inputValue}
            onChange={onInputChange}
            placeholder="Enter image URL"
            disabled={isDetecting}
          />
          <button
            className="w-25 grow f4 link dib white bg-light-purple"
            onClick={onButtonSubmit}
            disabled={isDetecting || !canSubmit}
          >
            {isDetecting ? 'Detecting...' : 'Detect'}
          </button>
          {isDetecting && (
            <button
              className="image-link-form-cancel"
              onClick={onCancelDetect}
              type="button"
            >
              Cancel
            </button>
          )}
        </div>
        {hasInput && !canSubmit && (
          <p className="image-link-form-error">
            Enter a valid image URL starting with http:// or https://
          </p>
        )}
      </div>
    </div>
  );
};

export default ImageLinkForm;
