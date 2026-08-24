import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { TenantProvider } from "./contexts/TenantContext";
import { SelectedClientProvider } from "./contexts/SelectedClientContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireTenant } from "./components/RequireTenant";
import { RequireRole } from "./components/RequireRole";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Code splitting global de rotas: cada página pesada vira um chunk próprio e
// só é baixada quando a rota é realmente visitada. `Home`, `Auth` e `NotFound`
// seguem eager por serem o caminho de primeira entrada/login e o fallback 404.
const ClientHub = lazy(() => import("./pages/ClientHub"));
const CompanyRegistration = lazy(() => import("./pages/CompanyRegistration"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AgencySetup = lazy(() => import("./pages/AgencySetup"));
const ClientList = lazy(() => import("./pages/ClientList"));
const ClientDetails = lazy(() => import("./pages/ClientDetails"));
const StrategyCreation = lazy(() => import("./pages/StrategyCreation"));
const GenerateQuestions = lazy(() => import("./pages/GenerateQuestions"));
const DevHub = lazy(() => import("./pages/DevHub"));
const DevSocialTokens = lazy(() => import("./pages/DevSocialTokens"));
const DevPrompts = lazy(() => import("./pages/DevPrompts"));
const DevApis = lazy(() => import("./pages/DevApis"));
const DevWebhooks = lazy(() => import("./pages/DevWebhooks"));
const Financial = lazy(() => import("./pages/Financial"));
const BillsList = lazy(() => import("./pages/BillsList"));
const BillsDueByDate = lazy(() => import("./pages/BillsDueByDate"));
const ToolExpenses = lazy(() => import("./pages/ToolExpenses"));
const PlatformLogins = lazy(() => import("./pages/PlatformLogins"));
const PlanPeriod = lazy(() => import("./pages/PlanPeriod"));
const CronogramaGlobal = lazy(() => import("./pages/CronogramaGlobal"));
const ProfileSettings = lazy(() => import("./pages/ProfileSettings"));
const Kanban = lazy(() => import("./pages/Kanban"));
const MyCompany = lazy(() => import("./pages/MyCompany"));
const CompanyProfile = lazy(() => import("./pages/CompanyProfile"));
const TeamMembers = lazy(() => import("./pages/TeamMembers"));
const InviteMember = lazy(() => import("./pages/InviteMember"));
const RemoveMember = lazy(() => import("./pages/RemoveMember"));
const ClientRegistrations = lazy(() => import("./pages/ClientRegistrations"));
const GuideClientList = lazy(() => import("./pages/GuideClientList"));
const StrategyClientList = lazy(() => import("./pages/StrategyClientList"));
const PeriodClientList = lazy(() => import("./pages/PeriodClientList"));
const InstallApp = lazy(() => import("./pages/InstallApp"));
const CompletedDemands = lazy(() => import("./pages/CompletedDemands"));
const LeituraHub = lazy(() => import("./pages/LeituraHub"));
const EmployeeAnamnesis = lazy(() => import("./pages/EmployeeAnamnesis"));
const ApproveCards = lazy(() => import("./pages/ApproveCards"));
const RejectedCards = lazy(() => import("./pages/RejectedCards"));
const ContentHistory = lazy(() => import("./pages/ContentHistory"));
const CollaboratorDemands = lazy(() => import("./pages/CollaboratorDemands"));
const Settings = lazy(() => import("./pages/Settings"));
const VideoReferencesLibrary = lazy(() => import("./pages/VideoReferencesLibrary"));
const ClientEvolution = lazy(() => import("./pages/ClientEvolution"));
const CustomerSuccessSistemas = lazy(() => import("./pages/CustomerSuccessSistemas"));
const SystemsClients = lazy(() => import("./pages/SystemsClients"));
const SystemsCommercial = lazy(() => import("./pages/SystemsCommercial"));
const OverviewPage = lazy(() => import("./pages/OverviewPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Fallback único e leve para todas as rotas lazy. */
const RouteFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
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
      <Route path="/referencias-visuais" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <VideoReferencesLibrary />
            </Layout>
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
      <Route path="/dev/social-tokens" element={
        <ProtectedRoute>
          <RequireTenant>
            <RequireRole allowedRoles={['agency_admin']}>
              <Layout>
                <DevSocialTokens />
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
      <Route path="/visao-geral" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <OverviewPage />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/kanban-central" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <OverviewPage forcedMode="operacional" />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/escritorio" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <OverviewPage forcedMode="escritorio" />
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
      <Route path="/cronograma-global" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <CronogramaGlobal />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/customer-success-sistemas" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <CustomerSuccessSistemas />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/clientes-sistemas" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <SystemsClients />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />

      <Route path="/comercial-sistemas" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <SystemsCommercial />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />

      <Route path="/client-evolution" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <ClientEvolution />
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
      <Route path="/anamnese-pessoal" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <EmployeeAnamnesis />
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
      {/* Telas legadas do Financeiro foram unificadas em /financeiro */}
      <Route path="/financeiro/contas" element={<Navigate to="/financeiro" replace />} />
      <Route path="/financeiro/vencimento/:offset" element={<Navigate to="/financeiro" replace />} />
      <Route path="/financeiro/gastos-ferramentas" element={<Navigate to="/financeiro" replace />} />
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
      <Route path="/colaboradores/:userId" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <CollaboratorDemands />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/configuracoes" element={
        <ProtectedRoute>
          <RequireTenant>
            <Layout>
              <Settings />
            </Layout>
          </RequireTenant>
        </ProtectedRoute>
      } />
      <Route path="/install" element={<InstallApp />} />
      <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
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