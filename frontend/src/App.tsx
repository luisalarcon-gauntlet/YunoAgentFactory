import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import AuthGuard from "./components/AuthGuard";

// Eager: login + default landing (small, always needed)
import LoginPage from "./pages/LoginPage";
import AgentsPage from "./pages/AgentsPage";

// Lazy: heavy pages loaded on demand
const WorkflowBuilderPage = lazy(() => import("./pages/WorkflowBuilderPage"));
const ExecutionsPage = lazy(() => import("./pages/ExecutionsPage"));
const MonitorPage = lazy(() => import("./pages/MonitorPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const ArtifactsPage = lazy(() => import("./pages/ArtifactsPage"));
const TemplatesPage = lazy(() => import("./pages/TemplatesPage"));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <AuthGuard>
              <AppShell />
            </AuthGuard>
          }
        >
          <Route path="/" element={<Navigate to="/agents" replace />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/workflows/:id?" element={<Suspense fallback={<RouteFallback />}><WorkflowBuilderPage /></Suspense>} />
          <Route path="/runs" element={<Suspense fallback={<RouteFallback />}><ExecutionsPage /></Suspense>} />
          <Route path="/monitor" element={<Suspense fallback={<RouteFallback />}><MonitorPage /></Suspense>} />
          <Route path="/analytics" element={<Suspense fallback={<RouteFallback />}><AnalyticsPage /></Suspense>} />
          <Route path="/artifacts" element={<Suspense fallback={<RouteFallback />}><ArtifactsPage /></Suspense>} />
          <Route path="/templates" element={<Suspense fallback={<RouteFallback />}><TemplatesPage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
