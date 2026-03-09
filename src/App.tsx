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
import Financial from "./pages/Financial";
import BillsList from "./pages/BillsList";
import ToolExpenses from "./pages/ToolExpenses";
import PlatformLogins from "./pages/PlatformLogins";

import PlanPeriod from "./pages/PlanPeriod";
import ProfileSettings from "./pages/ProfileSettings";
import Kanban from "./pages/Kanban";
import KanbanCentralPage from "./pages/KanbanCentralPage";
import MyCompany from "./pages/MyCompany";
import CompanyProfile from "./pages/CompanyProfile";
import TeamMembers from "./pages/TeamMembers";
import InviteMember from "./pages/InviteMember";
import RemoveMember from "./pages/RemoveMember";
import ClientRegistrations from "./pages/ClientRegistrations";
import GuideClientList from "./pages/GuideClientList";
import StrategyClientList from "./pages/StrategyClientList";
import PeriodClientList from "./pages/PeriodClientList";

import InstallApp from "./pages/InstallApp";
import NotFound from "./pages/NotFound";
import CompletedDemands from "./pages/CompletedDemands";
import LeituraHub from "./pages/LeituraHub";
import ApproveCards from "./pages/ApproveCards";
import RejectedCards from "./pages/RejectedCards";
import ContentHistory from "./pages/ContentHistory";

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

      <Route path="/content-history" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <ContentHistory />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      {/* === ROTAS ADMINISTRATIVAS (apenas agency_admin) === */}
      <Route path="/registration" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <CompanyRegistration />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/plan-period" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <PlanPeriod />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/approve-cards" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <ApproveCards />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/rejected-cards" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <RejectedCards />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      
      <Route path="/cadastros-clientes" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <ClientRegistrations />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/guide" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <GuideClientList />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/clientes" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <ClientList />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/clientes/:id" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <ClientDetails />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/schedules" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <PeriodClientList />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/strategy-clients" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <StrategyClientList />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/strategies" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <StrategyCreation />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/client-guide" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <GenerateQuestions />
            </Layout>
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
      <Route path="/scheduled" element={
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
      <Route path="/demandas-completas" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <CompletedDemands />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/leitura" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <LeituraHub />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/minha-empresa" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <MyCompany />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/financeiro" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <Financial />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/financeiro/contas" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <BillsList />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/financeiro/gastos-ferramentas" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <ToolExpenses />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/logins-plataformas" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <PlatformLogins />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/minha-empresa/cadastro" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <CompanyProfile />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/minha-empresa/colaboradores" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <TeamMembers />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/minha-empresa/convidar" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <InviteMember />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/minha-empresa/remover" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <RemoveMember />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/install" element={<InstallApp />} />
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