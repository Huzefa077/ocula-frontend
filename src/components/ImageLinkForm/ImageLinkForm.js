import React from 'react';
import './ImageLinkForm.css';

const ImageLinkForm = ({ 
  onInputChange, 
  onButtonSubmit, 
  name, 
  inputValue, 
  isDetecting   // ← New prop
}) => {
  return (
    <div style={{ transform: 'scale(0.9)', marginTop: '1rem' }}>
      <div className="glow-text yellow">
        <p className="f3 mt4">
          Hello {name}!<br />
          Paste an image URL to detect faces.<br />
        </p>
      </div>

      <div className="center">
        <div className="form center pa4 br3 shadow-3">
          <input
            className="f4 pa3 w-70 center"
            type="text"
            value={inputValue}
            onChange={onInputChange}
            placeholder="Enter image URL"
            disabled={isDetecting}                    // Disable input while detecting
          />
          <button
            className="w-25 grow f4 link dib white bg-light-purple"
            onClick={onButtonSubmit}
            disabled={isDetecting || !inputValue.trim()}   // Disable button when detecting or empty
          >
            {isDetecting ? 'Detecting...' : 'Detect'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageLinkForm;