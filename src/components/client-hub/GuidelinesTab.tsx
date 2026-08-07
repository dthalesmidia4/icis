import { ShieldCheck, Save, Users, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface GuidelinesTabProps {
  requirements: string;
  onChangeRequirements: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  responsibles: string[];
  onOpenAnamnesis: () => void;
}

export default function GuidelinesTab({
  requirements,
  onChangeRequirements,
  onSave,
  saving,
  responsibles,
  onOpenAnamnesis,
}: GuidelinesTabProps) {
  const items = requirements
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*\d.\s]+/, "").trim())
    .filter(Boolean);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Cuidados fundamentais</h2>
          </div>
          {items.length ? (
            <ol className="mt-4 space-y-3">
              {items.map((item, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary tabular-nums">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhuma exigência de conteúdo registrada para este cliente.
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider">Editar exigências</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Uma exigência por linha. Essas regras são injetadas na geração de conteúdo por IA.
          </p>
          <Textarea
            value={requirements}
            onChange={(e) => onChangeRequirements(e.target.value)}
            rows={8}
            className="mt-3"
            placeholder="Ex.: Nunca prometer cura ou prazo garantido."
          />
          <Button size="sm" className="mt-3 gap-2" onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar exigências"}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border bg-primary/5 p-5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Responsáveis do período</h2>
          </div>
          {responsibles.length ? (
            <ul className="mt-3 space-y-2">
              {responsibles.map((r) => (
                <li key={r} className="rounded-lg border bg-background px-3 py-2 text-sm font-medium">
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhum responsável atribuído às demandas deste período.
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Fontes</h2>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            As diretrizes vêm das exigências de conteúdo do cadastro e da anamnese estratégica do cliente.
          </p>
          <button
            type="button"
            onClick={onOpenAnamnesis}
            className="mt-3 text-xs font-semibold text-primary hover:underline"
          >
            Abrir anamnese estratégica
          </button>
        </div>
      </div>
    </div>
  );
}
