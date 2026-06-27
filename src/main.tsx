import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (!import.meta.env.DEV) {
  const noop = () => {};
  (console as unknown as { log: typeof noop; debug: typeof noop }).log = noop;
  (console as unknown as { log: typeof noop; debug: typeof noop }).debug = noop;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
