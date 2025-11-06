import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TenantProvider } from "./contexts/TenantContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RequireTenant } from "./components/RequireTenant";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import CompanyRegistration from "./pages/CompanyRegistration";
import Strategy from "./pages/Strategy";
import Plan from "./pages/Plan";
import Cards from "./pages/Cards";
import AdminDashboard from "./pages/AdminDashboard";
import AgencySetup from "./pages/AgencySetup";
import ClientList from "./pages/ClientList";
import ClientDetails from "./pages/ClientDetails";
import ClientStrategies from "./pages/ClientStrategies";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <TenantProvider>
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
                <Index />
              </ProtectedRoute>
            } />
            <Route path="/registration" element={
              <ProtectedRoute>
                <RequireTenant>
                  <CompanyRegistration />
                </RequireTenant>
              </ProtectedRoute>
            } />
            <Route path="/strategy" element={
              <ProtectedRoute>
                <RequireTenant>
                  <Strategy />
                </RequireTenant>
              </ProtectedRoute>
            } />
            <Route path="/plan" element={
              <ProtectedRoute>
                <RequireTenant>
                  <Plan />
                </RequireTenant>
              </ProtectedRoute>
            } />
            <Route path="/cards" element={
              <ProtectedRoute>
                <RequireTenant>
                  <Cards />
                </RequireTenant>
              </ProtectedRoute>
            } />
            <Route path="/clientes" element={
              <ProtectedRoute>
                <RequireTenant>
                  <ClientList />
                </RequireTenant>
              </ProtectedRoute>
            } />
            <Route path="/clientes/:id" element={
              <ProtectedRoute>
                <RequireTenant>
                  <ClientDetails />
                </RequireTenant>
              </ProtectedRoute>
            } />
          <Route path="/clientes/:id/planejamentos" element={
            <ProtectedRoute>
              <RequireTenant>
                <ClientStrategies />
              </RequireTenant>
            </ProtectedRoute>
          } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TenantProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
