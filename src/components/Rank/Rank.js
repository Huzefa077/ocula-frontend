import React from 'react';
import './Rank.css';

const Rank = ({ entries = 0 }) => {  // default 0
  return (
    <div>
      <div className='white f3 pa3'>
        {`URLs processed: ${entries}`}
      </div>
    </div>
  );
}

export default Rank;