import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startAnalysisInsightController } from './analysisInsightController';
import './styles.css';
import './analysis-slideshow.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

startAnalysisInsightController();
