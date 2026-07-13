import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { VoiceFieldDef } from "@/lib/voiceFieldSchemas";

export interface MappedField {
  value: unknown;
  sourceText?: string;
  confidence?: "alta" | "media" | "baixa";
}

export type MergeStrategy = "replace" | "append" | "ignore";

export interface AppliedField {
  key: string;
  value: unknown;
  strategy: MergeStrategy;
}

interface Props {
  transcript: string;
  mappedFields: Record<string, MappedField>;
  unmappedText: string[];
  fields: VoiceFieldDef[];
  currentValues: Record<string, unknown>;
  onApply: (applied: AppliedField[]) => void;
  onDiscard: () => void;
}

function stringify(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function isFilled(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

export function VoiceReviewPanel({
  transcript,
  mappedFields,
  unmappedText,
  fields,
  currentValues,
  onApply,
  onDiscard,
}: Props) {
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const entries = useMemo(
    () =>
      Object.entries(mappedFields).filter(([key]) => fieldMap.has(key)),
    [mappedFields, fieldMap]
  );

  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(entries.map(([k]) => [k, true]))
  );
  const [strategies, setStrategies] = useState<Record<string, MergeStrategy>>(() =>
    Object.fromEntries(
      entries.map(([k]) => [k, isFilled(currentValues[k]) ? "append" : "replace"])
    )
  );

  const apply = () => {
    const applied: AppliedField[] = [];
    for (const [key, mapped] of entries) {
      if (!selected[key]) continue;
      const strat = strategies[key] ?? "replace";
      if (strat === "ignore") continue;
      applied.push({ key, value: mapped.value, strategy: strat });
    }
    onApply(applied);
  };

  return (
    <Card className="p-4 space-y-4 border-primary/40">
      <div>
        <div className="text-sm font-semibold mb-1">Transcrição</div>
        <Textarea value={transcript} readOnly rows={3} className="text-sm" />
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">
          Campos identificados ({entries.length})
        </div>
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum campo pôde ser mapeado com segurança. Tente falar com mais detalhes.
          </p>
        )}
        <div className="space-y-3">
          {entries.map(([key, mapped]) => {
            const def = fieldMap.get(key)!;
            const filled = isFilled(currentValues[key]);
            return (
              <div key={key} className="border rounded-md p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selected[key] ?? true}
                    onCheckedChange={(v) =>
                      setSelected((s) => ({ ...s, [key]: !!v }))
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{def.label}</span>
                      {mapped.confidence && (
                        <Badge variant="outline" className="text-xs">
                          {mapped.confidence}
                        </Badge>
                      )}
                      {filled && (
                        <Badge variant="secondary" className="text-xs">
                          já preenchido
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm mt-1 whitespace-pre-wrap">
                      {stringify(mapped.value)}
                    </div>
                    {mapped.sourceText && (
                      <div className="text-xs text-muted-foreground mt-1 italic">
                        "{mapped.sourceText}"
                      </div>
                    )}
                    {filled && selected[key] && (
                      <div className="mt-2">
                        <Label className="text-xs">
                          Como aplicar (valor atual já preenchido):
                        </Label>
                        <RadioGroup
                          value={strategies[key] ?? "append"}
                          onValueChange={(v) =>
                            setStrategies((s) => ({ ...s, [key]: v as MergeStrategy }))
                          }
                          className="flex gap-3 mt-1 flex-wrap"
                        >
                          <label className="flex items-center gap-1 text-xs cursor-pointer">
                            <RadioGroupItem value="replace" /> Substituir
                          </label>
                          <label className="flex items-center gap-1 text-xs cursor-pointer">
                            <RadioGroupItem value="append" /> Adicionar ao final
                          </label>
                          <label className="flex items-center gap-1 text-xs cursor-pointer">
                            <RadioGroupItem value="ignore" /> Ignorar
                          </label>
                        </RadioGroup>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {unmappedText.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-1">
            Trechos não classificados
          </div>
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
            {unmappedText.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 justify-end pt-2 border-t">
        <Button variant="ghost" onClick={onDiscard}>
          Descartar
        </Button>
        <Button onClick={apply} disabled={entries.length === 0}>
          Aplicar nos campos
        </Button>
      </div>
    </Card>
  );
}
