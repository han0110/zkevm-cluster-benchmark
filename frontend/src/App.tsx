/*
 * Route table for the dashboard. Clean path routing under the vite base, so the router basename tracks
 * import.meta.env.BASE_URL and a static host must fall back to index.html for unknown paths. Every view
 * lives under the Layout shell, which loads the benchmark named by the ?id query and shares it through
 * the outlet context. A proof and a metric detail carry their run index in the path because one proof or
 * node recurs across the benchmark's runs.
 */

import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { ProofsPage } from '@/features/proofs/ProofsPage';
import { MetricsPage } from '@/features/metrics/MetricsPage';

// Redirects to a path while carrying the current query string, so the active benchmark survives the hop.
function RedirectTo({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<RedirectTo to="/overview" />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="proofs" element={<ProofsPage />} />
          <Route path="proofs/:runIdx/:proofId" element={<ProofsPage />} />
          <Route path="metrics" element={<MetricsPage />} />
          <Route path="metrics/:runIdx/:nodeId" element={<MetricsPage />} />
          <Route path="*" element={<RedirectTo to="/overview" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
