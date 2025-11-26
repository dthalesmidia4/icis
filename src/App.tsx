import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TenantProvider } from "./contexts/TenantContext";
import { SelectedClientProvider } from "./contexts/SelectedClientContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireTenant } from "./components/RequireTenant";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import ClientHub from "./pages/ClientHub";
import Auth from "./pages/Auth";
import CompanyRegistration from "./pages/CompanyRegistration";
import Plan from "./pages/Plan";
import Plans from "./pages/Plans";
import AdminDashboard from "./pages/AdminDashboard";
import AgencySetup from "./pages/AgencySetup";
import ClientList from "./pages/ClientList";
import ClientDetails from "./pages/ClientDetails";
import ClientStrategies from "./pages/ClientStrategies";
import StrategyCreation from "./pages/StrategyCreation";
import GenerateQuestions from "./pages/GenerateQuestions";
import StrategicQuestions from "./pages/StrategicQuestions";
import Questions from "./pages/Questions";
import DevHub from "./pages/DevHub";
import DevPrompts from "./pages/DevPrompts";
import DevApis from "./pages/DevApis";
import Schedule from "./pages/Schedule";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TenantProvider>
          <SelectedClientProvider>
            <Routes>
            <Route path="/auth" element={<Auth />} />
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
                  <Home />
                </RequireTenant>
              </ProtectedRoute>
            } />
            
            <Route path="/home" element={
              <ProtectedRoute>
                <RequireTenant>
                  <Home />
                </RequireTenant>
              </ProtectedRoute>
            } />

            <Route path="/client-hub" element={
              <ProtectedRoute>
                <RequireTenant>
                  <ClientHub />
                </RequireTenant>
              </ProtectedRoute>
            } />
            <Route path="/registration" element={
              <ProtectedRoute>
                <RequireTenant>
                  <Layout>
                    <CompanyRegistration />
                  </Layout>
                </RequireTenant>
              </ProtectedRoute>
            } />
            <Route path="/plan" element={
              <ProtectedRoute>
                <RequireTenant>
                  <Layout>
                    <Plan />
                  </Layout>
                </RequireTenant>
              </ProtectedRoute>
            } />
            <Route path="/plans" element={
              <ProtectedRoute>
                <RequireTenant>
                  <Layout>
                    <Plans />
                  </Layout>
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
          <Route path="/clientes/:id/planejamentos" element={
            <ProtectedRoute>
              <RequireTenant>
                <Layout>
                  <ClientStrategies />
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
          <Route path="/generate-questions" element={
            <ProtectedRoute>
              <RequireTenant>
                <Layout>
                  <GenerateQuestions />
                </Layout>
              </RequireTenant>
            </ProtectedRoute>
          } />
          <Route path="/strategic-questions" element={
            <ProtectedRoute>
              <RequireTenant>
                <Layout>
                  <StrategicQuestions />
                </Layout>
              </RequireTenant>
            </ProtectedRoute>
          } />
          <Route path="/questions" element={
            <ProtectedRoute>
              <RequireTenant>
                <Layout>
                  <Questions />
                </Layout>
              </RequireTenant>
            </ProtectedRoute>
          } />
          <Route path="/dev-hub" element={
            <ProtectedRoute>
              <RequireTenant>
                <Layout>
                  <DevHub />
                </Layout>
              </RequireTenant>
            </ProtectedRoute>
          } />
          <Route path="/dev/prompts" element={
            <ProtectedRoute>
              <RequireTenant>
                <Layout>
                  <DevPrompts />
                </Layout>
              </RequireTenant>
            </ProtectedRoute>
          } />
          <Route path="/dev/apis" element={
            <ProtectedRoute>
              <RequireTenant>
                <Layout>
                  <DevApis />
                </Layout>
              </RequireTenant>
            </ProtectedRoute>
          } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </SelectedClientProvider>
        </TenantProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
