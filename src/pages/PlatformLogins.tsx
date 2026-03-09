import { BackButton } from "@/components/BackButton";
import { KeyRound } from "lucide-react";

const PlatformLogins = () => {
  return (
    <div className="pb-8">
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <BackButton to="/" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Lista de Logins das Plataformas</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie os acessos e credenciais das plataformas dos seus clientes
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center min-h-[300px] text-center text-muted-foreground">
            <KeyRound className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Em breve</p>
            <p className="text-sm">O módulo de logins das plataformas está sendo desenvolvido.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlatformLogins;
