import React from 'react';
import './FaceMeshOverlay.css';

// This SVG is hand-aligned to public/images/model.png using facial landmark
// coordinates mapped onto our decorative mesh. It is only for the landing
// preview, not the live face-api.js scan result.
const meshLines = [
  'M28.8 44.8 L30.2 64.3 L37.3 79 L48.6 86.3 L63.9 79 L70.7 64.3 L71.9 44.8 L71 38.7 L63.6 30.3 L53.1 28.6 L37.5 30.3 L29.7 38.7 Z',
  'M29.7 38.7 L43.3 42.7 L50.3 41.4 L57.3 42.7 L71 38.7',
  'M30 44.2 L43.3 42.7 L50.3 44 L57.3 42.7 L70.7 44.2',
  'M30.9 45.8 L43.3 45.4 L50.3 45.6 L57.3 45.4 L69.8 45.8',
  'M33.2 46.8 L42.7 46.4 L50.3 46.8 L58 46.4 L67.5 46.8',
  'M35.7 50 L43.9 51.9 L50.4 51.1 L56.8 51.9 L65 50',
  'M35.6 60.7 L45.8 58.9 L50.5 62.1 L55.1 58.9 L65.3 60.7',
  'M30.2 64.3 L41.2 62.1 L50.5 66.4 L59.8 62.1 L70.7 64.3',
  'M33.2 72.4 L44.2 72.2 L50.6 72.4 L56.9 72.2 L68 72.4',
  'M37.3 79 L46 76.4 L50.6 77.7 L55.2 76.4 L63.9 79',
  'M39.6 84.3 L50.6 80.3 L61.6 84.3',
  'M53.1 28.6 L48.6 86.3',
  'M28.8 44.8 L43.3 42.7 L50.3 45.6 L57.3 42.7 L71.9 44.8',
  'M30.2 64.3 L45.8 58.9 L50.3 46.8 L55.1 58.9 L70.7 64.3',
  'M37.3 79 L44.2 72.2 L50.5 66.4 L56.9 72.2 L63.9 79'
];

const meshPolygons = [
  '37.2,47 42.7,46.4 48.1,47 42.6,50.2',
  '52.6,47 58,46.4 63.5,47 58.2,50.2',
  '50.3,46.8 45.8,60 50.5,65 55.1,60',
  '43.2,72.3 47.8,70.8 50.6,72.2 53.3,70.8 58,72.3 54.4,74.6 50.6,75.7 46.8,74.6',
  '28.8,44.8 30.2,64.3 45.8,60 42.6,50.2 37.2,47',
  '71.9,44.8 70.7,64.3 55.1,60 58.2,50.2 63.5,47',
  '30.2,64.3 37.3,79 46.8,74.6 43.2,72.3',
  '70.7,64.3 63.9,79 54.4,74.6 58,72.3',
  '37.3,79 48.6,86.3 63.9,79 55.2,76.4 50.6,80.3 46,76.4'
];

const meshNodes = [
  [53.1, 28.6], [37.5, 30.3], [63.6, 30.3], [29.7, 38.7], [71, 38.7],
  [30, 44.2], [43.3, 42.7], [50.3, 44], [57.3, 42.7], [70.7, 44.2],
  [37.2, 47], [42.7, 46.4], [48.1, 47], [42.6, 50.2], [52.6, 47],
  [58, 46.4], [63.5, 47], [58.2, 50.2], [50.3, 46.8], [45.8, 60],
  [50.5, 65], [55.1, 60], [30.2, 64.3], [41.2, 62.1], [50.5, 66.4],
  [59.8, 62.1], [70.7, 64.3], [43.2, 72.3], [47.8, 70.8], [50.6, 72.2],
  [53.3, 70.8], [58, 72.3], [46.8, 74.6], [50.6, 75.7], [54.4, 74.6],
  [37.3, 79], [48.6, 86.3], [63.9, 79]
];

const FaceMeshOverlay = () => (
  <svg className="face-mesh-overlay" viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <defs>
      <filter id="cyanGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="0.45" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <g className="face-mesh-polygons" filter="url(#cyanGlow)">
      {meshPolygons.map((points) => (
        <polygon key={points} points={points} />
      ))}
    </g>

    <g className="face-mesh-lines" filter="url(#cyanGlow)">
      {meshLines.map((path) => (
        <path key={path} d={path} />
      ))}
    </g>

    <g className="face-mesh-eye-nodes" filter="url(#cyanGlow)">
      <circle cx="40.2" cy="46.7" r="1.05" />
      <circle cx="60.7" cy="46.6" r="1.05" />
    </g>

    <g className="face-mesh-nodes" filter="url(#cyanGlow)">
      {meshNodes.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.48" />
      ))}
    </g>
  </svg>
);

export default FaceMeshOverlay;
