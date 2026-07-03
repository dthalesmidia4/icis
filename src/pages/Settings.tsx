import { useState } from "react";
import { Settings as SettingsIcon, Workflow } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FunctionPermissionsModal } from "@/components/FunctionPermissionsModal";

export default function Settings() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="h-7 w-7 text-primary" />
        <h1 className="text-2xl md:text-3xl font-bold">Configurações</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card
          onClick={() => setOpen(true)}
          className="p-5 cursor-pointer hover:border-primary hover:shadow-md transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Workflow className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Configurar funções do fluxo</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Defina, para cada tipo de demanda, quais funções operacionais participam do processo.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <FunctionPermissionsModal open={open} onOpenChange={setOpen} />
    </div>
  );
}
