import React, { useEffect } from 'react';
import Tilt from 'react-parallax-tilt';
import Brain from './brain.png';
import './Logo.css'; 

const Logo = () => {

  useEffect(() => {
    const handleMouseMove = (e) => {
      const eyes = document.querySelectorAll('.eye');
      eyes.forEach(eye => {
        const rect = eye.getBoundingClientRect();
        const eyeX = rect.left + rect.width / 2;
        const eyeY = rect.top + rect.height / 2;

        const dx = e.clientX - eyeX;
        const dy = e.clientY - eyeY;

        const angle = Math.atan2(dy, dx);
        const radius = 0.2 * rect.width; // max pupil movement

        const pupil = eye.querySelector('.pupil');
        if (pupil) {
          pupil.style.transform = `translate(${radius * Math.cos(angle)}px, ${radius * Math.sin(angle)}px)`;
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div style={{
      position: 'absolute',
      top: '2rem',
      left: '2rem',
      zIndex: 10
    }}>
      <Tilt
        perspective={400}
        glareEnable={true}
        glareMaxOpacity={0.45}
        style={{ width: '8rem' }}
      >
        <div style={{
          height: '8rem',
          width: '8rem',
          background: 'linear-gradient(105deg, #aaaaed 0%, #4a3c79 100%)',
          borderRadius: '15px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          boxShadow: '0px 10px 20px rgba(234, 233, 244, 0.36)'
        }}>
          <img
            src={Brain}
            alt='brain'
            style={{ width: '5rem', height: '5rem' }}
          />

          {/* Eyes */}
          <div className="eye" style={{ left: '32%', top: '28%' }}>
            <span className="pupil"></span>
          </div>
          <div className="eye" style={{ right: '28%', top: '28%' }}>
            <span className="pupil"></span>
          </div>
        </div>
      </Tilt>
    </div>
  );
}

export default Logo;