// This file renders the animated Ocula logo and moves the pupils based on mouse position.
import React, { useEffect } from 'react';
import Tilt from 'react-parallax-tilt';
import Brain from './brain.png';
import './Logo.css'; 

const Logo = () => {

  useEffect(() => {
    const handleMouseMove = (e) => {
      // Each eye calculates the angle from its center to the mouse pointer.
      const eyes = document.querySelectorAll('.eye');
      eyes.forEach(eye => {
        const rect = eye.getBoundingClientRect();
        const eyeX = rect.left + rect.width / 2;
        const eyeY = rect.top + rect.height / 2;

        const dx = e.clientX - eyeX;
        const dy = e.clientY - eyeY;

        const angle = Math.atan2(dy, dx);
        const radius = 0.2 * rect.width; // Keep the pupil inside the eye.

        const pupil = eye.querySelector('.pupil');
        if (pupil) {
          pupil.style.transform = `translate(${radius * Math.cos(angle)}px, ${radius * Math.sin(angle)}px)`;
        }
      });
    };

    // Listen globally so the pupils keep tracking even when the mouse is outside the logo.
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="logo-wrapper">
      <Tilt
        perspective={400}
        glareEnable={true}
        glareMaxOpacity={0.45}
        className="logo-tilt"
      >
        <div className="logo-card">
          <img
            src={Brain}
            alt='brain'
            className="logo-brain"
          />

          {/* CSS positions the eyes over the brain image; JS above moves the pupils. */}
          <div className="eye eye-left">
            <span className="pupil"></span>
          </div>
          <div className="eye eye-right">
            <span className="pupil"></span>
          </div>
        </div>
      </Tilt>
    </div>
  );
}

export default Logo;
