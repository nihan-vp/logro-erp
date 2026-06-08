import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ConnectivityProvider } from './context/ConnectivityContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConnectivityProvider>
      <App />
    </ConnectivityProvider>
  </StrictMode>,
);
