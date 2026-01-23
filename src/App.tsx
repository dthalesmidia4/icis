import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TenantProvider } from "./contexts/TenantContext";
import { SelectedClientProvider } from "./contexts/SelectedClientContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireTenant } from "./components/RequireTenant";
import { RequireRole } from "./components/RequireRole";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import ClientHub from "./pages/ClientHub";
import Auth from "./pages/Auth";
import CompanyRegistration from "./pages/CompanyRegistration";
import AdminDashboard from "./pages/AdminDashboard";
import AgencySetup from "./pages/AgencySetup";
import ClientList from "./pages/ClientList";
import ClientDetails from "./pages/ClientDetails";
import StrategyCreation from "./pages/StrategyCreation";
import GenerateQuestions from "./pages/GenerateQuestions";
import DevHub from "./pages/DevHub";
import DevPrompts from "./pages/DevPrompts";
import DevApis from "./pages/DevApis";
import DevWebhooks from "./pages/DevWebhooks";
import Schedule from "./pages/Schedule";
import PlanPeriod from "./pages/PlanPeriod";
import ProfileSettings from "./pages/ProfileSettings";
import Kanban from "./pages/Kanban";
import KanbanCentralPage from "./pages/KanbanCentralPage";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/profile-settings" element={
        <ProtectedRoute>
          <Layout>
            <ProfileSettings />
          </Layout>
        </ProtectedRoute>
      } />
      <Route path="/agency-setup" element={
        <ProtectedRoute>
          <AgencySetup />
        </ProtectedRoute>
      } />
      <Route path="/admin" element={
        <ProtectedRoute>
          <AdminDashboard />
        </ProtectedRoute>
      } />
      <Route path="/" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <Home />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      
      <Route path="/home" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <Home />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />

      <Route path="/client-hub" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <ClientHub />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      {/* === ROTAS ADMINISTRATIVAS (apenas agency_admin) === */}
      <Route path="/registration" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <CompanyRegistration />
              </Layout>
            </RequireRole>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/plan-period" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <PlanPeriod />
              </Layout>
            </RequireRole>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/schedule" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <Schedule />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/clientes" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <ClientList />
              </Layout>
            </RequireRole>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/clientes/:id" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <ClientDetails />
              </Layout>
            </RequireRole>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/strategies" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <StrategyCreation />
              </Layout>
            </RequireRole>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/client-guide" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <GenerateQuestions />
              </Layout>
            </RequireRole>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/generate-questions" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <GenerateQuestions />
              </Layout>
            </RequireRole>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/dev-hub" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <DevHub />
              </Layout>
            </RequireRole>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/dev/prompts" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <DevPrompts />
              </Layout>
            </RequireRole>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/dev/apis" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <DevApis />
              </Layout>
            </RequireRole>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/dev/webhooks" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <DevWebhooks />
              </Layout>
            </RequireRole>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/content-schedule" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <Kanban />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/kanban-central" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <KanbanCentralPage />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <TenantProvider>
        <ThemeProvider>
          <SelectedClientProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <AppRoutes />
            </TooltipProvider>
          </SelectedClientProvider>
        </ThemeProvider>
      </TenantProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;