import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LOGO_MPC_URL } from './brand';
import './index.css';
import { enableDemoMode } from './api/client';
import App from './App';

// /demo/supervisor  o  /demo  → supervisor demo
// /demo/promotor              → promotor demo
if (window.location.pathname.startsWith('/demo')) {
  const isPromotor = window.location.pathname === '/demo/promotor';
  enableDemoMode(isPromotor ? 'promotor' : 'supervisor');
}

function setFavicon(href: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/png';
  link.href = href;
}

setFavicon(LOGO_MPC_URL);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
