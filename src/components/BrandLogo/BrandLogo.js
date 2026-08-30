// This wordmark gives Ocula a custom identity: the first "O" behaves like an eye.
import React, { useEffect, useRef } from 'react';
import './BrandLogo.css';

const BrandLogo = ({ onClick }) => {
  const eyeRef = useRef(null);
  const pupilRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const movePupil = () => {
      const eye = eyeRef.current;
      const pupil = pupilRef.current;

      if (!eye || !pupil) return;

      const rect = eye.getBoundingClientRect();
      const eyeCenterX = rect.left + rect.width / 2;
      const eyeCenterY = rect.top + rect.height / 2;
      const dx = mousePositionRef.current.x - eyeCenterX;
      const dy = mousePositionRef.current.y - eyeCenterY;
      const angle = Math.atan2(dy, dx);
      // Logo eye update: 16% travel keeps the larger eye pupil inside the almond contour.
      const travelDistance = rect.width * 0.16;

      pupil.style.transform = `translate(${Math.cos(angle) * travelDistance}px, ${Math.sin(angle) * travelDistance}px)`;
      animationFrameRef.current = null;
    };

    const handleMouseMove = (event) => {
      mousePositionRef.current = { x: event.clientX, y: event.clientY };

      // requestAnimationFrame prevents mousemove from forcing layout work dozens
      // of times per frame on fast cursor movement.
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(movePupil);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <button className="brand-logo" onClick={onClick} type="button" aria-label="Go to Ocula home">
      <span className="brand-logo-eye-shell" ref={eyeRef} aria-hidden="true">
        <svg className="brand-logo-eye-contour" viewBox="0 0 120 72">
          <path d="M5 36 C22 7 48 1 60 1 C72 1 98 7 115 36 C98 65 72 71 60 71 C48 71 22 65 5 36 Z" />
        </svg>
        <span className="brand-logo-iris" ref={pupilRef}>
          <span className="brand-logo-pupil"></span>
        </span>
      </span>
      <span className="brand-logo-text">CULA</span>
    </button>
  );
};

export default BrandLogo;
