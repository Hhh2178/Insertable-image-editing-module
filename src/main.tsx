import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './react/editor.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing app root element.');

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
