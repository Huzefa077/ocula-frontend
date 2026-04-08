// This file starts the React app and mounts it into the main HTML page.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import 'tachyons';

const root = createRoot(document.getElementById('root'));

root.render(<App />)
