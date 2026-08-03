import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminMaintenanceEntryPoint from './components/AdminMaintenanceEntryPoint';
import RuntimeMaintenanceGate from './components/RuntimeMaintenanceGate';
import { startAnalysisInsightController } from './analysisInsightController';
import './styles.css';
import './analysis-slideshow.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeMaintenanceGate>
      <AdminMaintenanceEntryPoint>
        <App />
      </AdminMaintenanceEntryPoint>
    </RuntimeMaintenanceGate>
  </StrictMode>,
);

startAnalysisInsightController();
