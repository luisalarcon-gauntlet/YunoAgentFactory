import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import AuthGuard from "./components/AuthGuard";
import LoginPage from "./pages/LoginPage";
import AgentsPage from "./pages/AgentsPage";
import WorkflowBuilderPage from "./pages/WorkflowBuilderPage";
import ExecutionsPage from "./pages/ExecutionsPage";
import MonitorPage from "./pages/MonitorPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import ArtifactsPage from "./pages/ArtifactsPage";
import TemplatesPage from "./pages/TemplatesPage";

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
          <Route path="/workflows/:id?" element={<WorkflowBuilderPage />} />
          <Route path="/runs" element={<ExecutionsPage />} />
          <Route path="/monitor" element={<MonitorPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/artifacts" element={<ArtifactsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
