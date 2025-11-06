import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileCode, Wifi } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const DevHub = () => {
  const navigate = useNavigate();

  const devCards = [
    {
      title: "Prompts do Sistema",
      icon: FileCode,
      color: "from-cyan-500 to-cyan-600",
      route: "/dev/prompts",
    },
    {
      title: "APIs do Sistema",
      icon: Wifi,
      color: "from-indigo-500 to-indigo-600",
      route: "/dev/apis",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      {/* Navbar */}
      <nav className="w-full bg-card border-b border-border sticky top-0 z-50">
        <div className="container max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <h2 className="text-lg font-semibold">Dev Hub</h2>
            <div className="w-20"></div> {/* Spacer para centralizar */}
          </div>
        </div>
      </nav>

      {/* Área Principal */}
      <main className="p-6 lg:p-12">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-16 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
              Hub de Desenvolvedor
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Gerencie prompts e APIs do sistema
            </p>
          </div>

          {/* Cards de Desenvolvimento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {devCards.map((card, index) => {
              const Icon = card.icon;
              return (
                <Card
                  key={index}
                  className="group cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 hover:border-primary/50"
                  onClick={() => navigate(card.route)}
                >
                  <CardContent className="p-6 flex flex-col items-center text-center px-[24px] py-[24px] my-[24px] mx-[24px]">
                    {/* Ícone com Gradiente */}
                    <div
                      className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                    >
                      <Icon className="h-10 w-10 text-white" />
                    </div>

                    {/* Título */}
                    <h3 className="text-xl font-semibold mb-3">{card.title}</h3>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
};

export default DevHub;
