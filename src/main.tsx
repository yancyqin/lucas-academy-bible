import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { hydrateStorage } from './platform';

// On iOS the mirrored progress is restored into localStorage before the first
// render; on the web this resolves immediately.
void hydrateStorage().finally(() => {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
});
