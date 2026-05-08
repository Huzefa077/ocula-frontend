// This file displays the signed-in user's current face detection entry count.
import React from 'react';
import './Rank.css';

const Rank = ({ entries = 0 }) => {  // default 0
  return (
    <div className="rank-card">
      <div className='white f3 pa3'>
        {`URLs processed: ${entries}`}
      </div>
    </div>
  );
}

export default Rank;
