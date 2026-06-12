import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ConnectivityProvider } from './context/ConnectivityContext';
import { ConfirmProvider } from './context/ConfirmContext';
import './index.css';
import 'react-toastify/dist/ReactToastify.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConnectivityProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ConnectivityProvider>
  </StrictMode>,
);
