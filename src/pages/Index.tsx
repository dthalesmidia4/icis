import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles, TrendingUp, Calendar, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/TenantContext";

const Index = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { tenantName, tenantType } = useTenant();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-background">
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="flex justify-end mb-4">
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/50 border border-accent-foreground/20">
            <Sparkles className="h-4 w-4 text-secondary" />
            <span className="text-sm font-medium">Marketing Inteligente e Automatizado</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold leading-tight">
            Gestão de Marketing
            <span className="block mt-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Simples e Eficiente
            </span>
          </h1>

          {tenantName && (
            <p className="text-lg text-muted-foreground">
              {tenantName} • {tenantType}
            </p>
          )}

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Crie planos de marketing inteligentes com IA, organize suas tarefas em quadros Kanban
            e acompanhe o crescimento do seu negócio em um só lugar.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
            <Button
              size="lg"
              onClick={() => navigate("/registration")}
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity text-lg px-8"
            >
              Começar Agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>

          {user && (
            <p className="text-sm text-muted-foreground mt-4">
              Logado como: {user.email}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16">
            <div className="p-6 rounded-2xl bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">IA Inteligente</h3>
              <p className="text-muted-foreground">
                Gere planos de marketing personalizados baseados na estratégia da sua empresa
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4">
                <Calendar className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Organização Visual</h3>
              <p className="text-muted-foreground">
                Gerencie suas tarefas com quadros Kanban intuitivos e produtivos
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-card shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow">
              <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Acompanhamento</h3>
              <p className="text-muted-foreground">
                Monitore o progresso das suas campanhas e ajuste a estratégia em tempo real
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;