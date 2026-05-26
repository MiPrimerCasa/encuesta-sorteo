import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LOGO_MPC_URL } from './brand';
import './index.css';
import App from './App';

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
