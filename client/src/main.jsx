import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
try {
  const a = JSON.parse(localStorage.getItem('chc_a11y') || '{}');
  if (a.size) document.documentElement.dataset.size = a.size;
  if (a.contrast) document.documentElement.dataset.contrast = a.contrast;
  if (a.facil) document.documentElement.dataset.facil = '1';
} catch {}
createRoot(document.getElementById('root')).render(<BrowserRouter><App /></BrowserRouter>);
