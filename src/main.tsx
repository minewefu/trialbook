import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerGlobalTools } from './tools/global';
import './styles.css';

// Tools are registered once at module level, not inside React effects, so StrictMode's double
// mount cannot register them twice and the browser agent sees them as soon as the page loads.
void registerGlobalTools();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
