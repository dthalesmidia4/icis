import { Megaphone, Printer, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AD_PLAN_PLATFORMS,
  canEditAdPlan,
  normalizeAdPlan,
  parseAdBudget,
  setAdPlanEnabled,
  type AdPlanShape,
  type AdPlanTextKey,
} from "@/lib/adPlan";

import { cn } from "@/lib/utils";


export type ClassificationKey = "anuncio" | "grafica";

export const CLASSIFICATION_OPTIONS: { key: ClassificationKey; label: string; icon: typeof Megaphone }[] = [
  { key: "anuncio", label: "Anúncio", icon: Megaphone },
  { key: "grafica", label: "Gráfica", icon: Printer },
];

export const CLASSIFICATION_LABEL: Record<string, string> = {
  anuncio: "Anúncio",
  grafica: "Gráfica",
};

export const hasClassification = (list: string[] | null | undefined, key: ClassificationKey) =>
  Array.isArray(list) && list.includes(key);

export const GRAFICA_WARNING =
  "MATERIAL DE GRÁFICA — validar dimensões, sangria, margem de segurança, resolução/perfil de cor e prova final conforme fornecedor antes de concluir.";

interface SelectorProps {
  value: string[] | null | undefined;
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/** Controle discreto de classificações operacionais (Anúncio / Gráfica). */
export function ClassificationSelector({ value, onChange, disabled }: SelectorProps) {
  const list = Array.isArray(value) ? value : [];

  const toggle = (key: ClassificationKey) => {
    const next = list.includes(key) ? list.filter((v) => v !== key) : [...list, key];
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title="Classificações operacionais"
          aria-label="Classificações"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-sm text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground",
            disabled && "opacity-60"
          )}
        >
          <Tags className="h-3.5 w-3.5 shrink-0" />
          {list.length ? (
            <span className="flex items-center gap-1">
              {list.map((key) => (
                <Badge key={key} variant="secondary" className="h-5 px-1.5 text-[10px] font-bold uppercase">
                  {CLASSIFICATION_LABEL[key] || key}
                </Badge>
              ))}
            </span>
          ) : (
            <span>Classificações</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          Classificações
        </p>
        <div className="space-y-1">
          {CLASSIFICATION_OPTIONS.map(({ key, label, icon: Icon }) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={list.includes(key)}
                disabled={disabled}
                onCheckedChange={() => toggle(key)}
              />
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type AdPlan = AdPlanShape;

const AD_FIELDS: { key: AdPlanTextKey; label: string; long?: boolean; placeholder?: string }[] = [
  { key: "objective", label: "Objetivo" },
  { key: "budget", label: "Verba" },
  { key: "period", label: "Período/janela" },
  { key: "territory", label: "Território", placeholder: "Ex.: Ribeirão Preto + 30 km" },
  { key: "audience", label: "Público", long: true },
  { key: "notes", label: "Observações/validação", long: true },
];

interface AdPlanSectionProps {
  value: AdPlan | null | undefined;
  onChange: (next: AdPlan) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  /** ad_plan é operacional apenas em demandas de Mídia. */
  workArea?: string | null;
  /** Campanhas da empresa para vínculo opcional. */
  campaignOptions?: { id: string; name: string }[];
}

/** Seção "Informações do anúncio" — preserva chaves não reconhecidas do JSON. */
export function AdPlanSection({
  value,
  onChange,
  onBlur,
  readOnly,
  workArea,
  campaignOptions,
}: AdPlanSectionProps) {
  const plan = normalizeAdPlan(value);
  const editable = !readOnly && canEditAdPlan(workArea);
  const boosted = !!plan.boost;

  const set = (key: string, v: string) => onChange({ ...plan, [key]: v });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          Informações do anúncio
        </p>
        <div className="flex items-center gap-2">
          <Switch
            id="ad-plan-boost"
            checked={boosted}
            disabled={!editable}
            onCheckedChange={(checked) => {
              onChange(setAdPlanBoost(plan, checked));
              onBlur?.();
            }}
          />
          <Label htmlFor="ad-plan-boost" className="text-xs font-bold uppercase tracking-wide">
            Impulsionar
          </Label>
          {boosted && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-bold uppercase">
              Mídia paga
            </Badge>
          )}
        </div>
      </div>

      {!canEditAdPlan(workArea) && (
        <p className="text-xs text-muted-foreground">
          Plano de anúncio é operacional apenas em demandas de Mídia.
        </p>
      )}

      {!!campaignOptions?.length && (
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Campanha
          </Label>
          {editable ? (
            <Select
              value={plan.campaign_id || "none"}
              onValueChange={(v) => {
                onChange(setAdPlanCampaign(plan, v === "none" ? null : v));
                onBlur?.();
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem campanha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem campanha</SelectItem>
                {campaignOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              {campaignOptions.find((c) => c.id === plan.campaign_id)?.name || "—"}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {AD_FIELDS.map(({ key, label, long, placeholder }) => {
          const current = typeof plan[key] === "string" ? (plan[key] as string) : "";
          return (
            <div key={key} className={cn("space-y-1.5", long && "md:col-span-2")}>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {label}
              </Label>
              {!editable ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{current || "—"}</p>
              ) : long ? (
                <Textarea
                  value={current}
                  onChange={(e) => set(key, e.target.value)}
                  onBlur={onBlur}
                  placeholder={placeholder}
                  className="min-h-[80px] resize-y"
                />
              ) : (
                <Input
                  value={current}
                  onChange={(e) => set(key, e.target.value)}
                  onBlur={onBlur}
                  placeholder={placeholder}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

