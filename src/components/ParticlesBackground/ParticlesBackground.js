import React, { useEffect, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';

const particlesOptions = {
  background: {
    color: { value: '#07111f' },
    image: 'linear-gradient(115deg, #050816 0%, #0b1630 48%, #123548 100%)'
  },
  fullScreen: { enable: true, zIndex: -1 },
  fpsLimit: 50,
  particles: {
    number: { value: 36 },
    color: { value: '#94eaff' },
    links: { enable: true, distance: 140, color: '#67e8f9', opacity: 0.22 },
    move: { enable: true, speed: 0.35 },
    opacity: { value: 0.28 },
    size: { value: { min: 1, max: 3 } }
  },
  interactivity: {
    events: {
      onHover: { enable: true, mode: 'repulse' },
      // Click-push can keep adding particles during repeated app interactions,
      // so it stays disabled to protect low-power devices from extra work.
      onClick: { enable: false }
    }
  },
  detectRetina: true
};

const ParticlesBackground = () => {
  const [shouldRender, setShouldRender] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const isSmallScreen = window.innerWidth < 768;

    if (prefersReducedMotion || isSmallScreen) {
      return undefined;
    }

    let idleHandle;
    let timeoutId;
    let isMounted = true;

    const enableParticles = () => {
      if (isMounted) {
        setShouldRender(true);
      }
    };

    if ('requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(enableParticles, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(enableParticles, 1200);
    }

    return () => {
      isMounted = false;
      if (idleHandle) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldRender) {
      return undefined;
    }

    let isMounted = true;

    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => {
      if (isMounted) {
        setIsReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [shouldRender]);

  if (!shouldRender || !isReady) {
    return null;
  }

  return <Particles id="tsparticles" options={particlesOptions} />;
};

export default ParticlesBackground;
