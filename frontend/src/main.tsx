// Stylesheet imported first so its theme variables apply before any app module evaluates, otherwise a
// module reading a CSS color at import time would race the stylesheet and resolve wrong.
import '@/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
