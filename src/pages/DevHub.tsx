import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FileCode, Wifi, Link2, Share2, Sun, Moon, Library } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useEffect, useState } from "react";

const THEME_KEY = "dev-theme-mode";

const DevHub = () => {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark") {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    const next = !isDark;
    if (next) {
      root.classList.remove("light");
      root.classList.add("dark");
      localStorage.setItem(THEME_KEY, "dark");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
      localStorage.setItem(THEME_KEY, "light");
    }
    window.dispatchEvent(new Event("dev-theme-change"));
    setIsDark(next);
  };

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
    {
      title: "Webhooks",
      icon: Link2,
      color: "from-emerald-500 to-emerald-600",
      route: "/dev/webhooks",
    },
    {
      title: "Tokens de Redes Sociais",
      icon: Share2,
      color: "from-pink-500 to-rose-600",
      route: "/dev/social-tokens",
    },
    {
      title: "Biblioteca Visual",
      icon: Library,
      color: "from-amber-500 to-orange-600",
      route: "/referencias-visuais",
    },
  ];


  return (
    <div className="container max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
          Hub de Desenvolvedor
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Gerencie prompts e APIs do sistema
        </p>
        <div className="mt-6 flex justify-center">
          <Button variant="outline" onClick={toggleTheme} className="gap-2">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? "Modo claro" : "Modo escuro"}
          </Button>
        </div>
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
  );
};

export default DevHub;
