import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';

import { initSentry } from '@/config/sentry';
import { store } from '@/store/store';
import { App } from '@/App';
import '@/styles/global.css';

// Must be called before createRoot so Sentry instruments the full render lifecycle
initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
);
