import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
const Dashboard = lazy(() => import('./pages/Dashboard'));
import TradeLog from './pages/TradeLog';
import Configuration from './pages/Configuration';

export default function App() {
  return (
    <Suspense fallback={<div className="loading">Loading journal…</div>}><Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/trades" element={<TradeLog />} />
        <Route path="/configuration" element={<Configuration />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes></Suspense>
  );
}