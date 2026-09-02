// This file displays the signed-in user's current face detection entry count.
import React from 'react';
import './Rank.css';

const Rank = ({ entries = 0 }) => {  // default 0
  return (
    <div className="surface-card rank-card">
      <span className="rank-label">Images scanned</span>
      <strong className="rank-value">{entries}</strong>
    </div>
  );
}

export default Rank;
