import { useState } from "react";
import { Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{children}</h2>
);

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
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState("");

  const startEditing = () => {
    setSnapshot(requirements);
    setEditing(true);
  };

  const cancelEditing = () => {
    onChangeRequirements(snapshot);
    setEditing(false);
  };

  const handleSave = () => {
    onSave();
    setEditing(false);
  };

  const items = requirements
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*\d.\s]+/, "").trim())
    .filter(Boolean);

  return (
    <div className="grid gap-10 lg:grid-cols-[1.7fr_1fr] lg:gap-14">
      <div className="space-y-10">
        <section>
          <SectionTitle>Cuidados fundamentais</SectionTitle>
          {items.length ? (
            <ol className="mt-5 divide-y border-y">
              {items.map((item, i) => (
                <li key={i} className="flex gap-5 py-4">
                  <span className="text-2xl font-black leading-none tabular-nums text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhuma exigência de conteúdo registrada para este cliente.
            </p>
          )}
          {!editing && (
            <Button variant="ghost" size="sm" className="mt-4 gap-2 px-0 text-primary hover:bg-transparent" onClick={startEditing}>
              <Pencil className="h-3.5 w-3.5" />
              <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Editar exigências</span>
            </Button>
          )}
        </section>

        {editing && (
          <section>
            <SectionTitle>Editar exigências</SectionTitle>
            <p className="mt-2 text-xs text-muted-foreground">
              Uma exigência por linha. Essas regras são injetadas na geração de conteúdo por IA.
            </p>
            <Textarea
              value={requirements}
              onChange={(e) => onChangeRequirements(e.target.value)}
              rows={8}
              className="mt-4 rounded-lg"
              placeholder="Ex.: Nunca prometer cura ou prazo garantido."
            />
            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" className="gap-2" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar exigências"}
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
                Cancelar
              </Button>
            </div>
          </section>
        )}
      </div>


      <div className="space-y-10 lg:border-l lg:pl-10">
        <section>
          <SectionTitle>Responsáveis do período</SectionTitle>
          {responsibles.length ? (
            <ul className="mt-4 divide-y border-y">
              {responsibles.map((r) => (
                <li key={r} className="py-3 text-sm font-bold">
                  {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhum responsável atribuído às demandas deste período.
            </p>
          )}
        </section>

        <section>
          <SectionTitle>Fontes</SectionTitle>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            As diretrizes vêm das exigências de conteúdo do cadastro e da anamnese estratégica do cliente.
          </p>
          <button
            type="button"
            onClick={onOpenAnamnesis}
            className="mt-5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary hover:underline"
          >
            Abrir anamnese estratégica
          </button>
        </section>
      </div>
    </div>
  );
}
