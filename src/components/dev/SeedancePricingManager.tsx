import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id?: string;
  model_key: string;
  resolution: string;
  price_credits_per_second: number;
  price_brl_per_credit: number | null;
  notes: string | null;
  isNew?: boolean;
  isSaving?: boolean;
};

const MODELS = [
  { value: "v15_pro", label: "Seedance 1.5 Pro" },
  { value: "v2", label: "Dreamina 2.0" },
  { value: "v2_fast", label: "Dreamina 2.0 Fast" },
  { value: "v2_mini", label: "Dreamina 2.0 Mini" },
  { value: "pro", label: "Seedance 1.0 Pro" },
  { value: "pro_fast", label: "Seedance 1.0 Pro Fast" },
  { value: "lite", label: "Legacy (lite)" },
];
const RESOLUTIONS = ["480p", "720p", "1080p"];

export default function SeedancePricingManager() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("seedance_pricing")
      .select("*")
      .order("model_key")
      .order("resolution");
    if (!error) setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const update = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const addNew = () =>
    setRows((prev) => [
      ...prev,
      {
        model_key: "pro",
        resolution: "1080p",
        price_credits_per_second: 0,
        price_brl_per_credit: null,
        notes: null,
        isNew: true,
      },
    ]);

  const save = async (index: number) => {
    const row = rows[index];
    if (!row.model_key || !row.resolution) {
      toast({ title: "Erro", description: "Modelo e resolução obrigatórios.", variant: "destructive" });
      return;
    }
    if (!(row.price_credits_per_second > 0)) {
      toast({ title: "Erro", description: "Créditos/segundo deve ser maior que zero.", variant: "destructive" });
      return;
    }
    update(index, { isSaving: true });
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        model_key: row.model_key,
        resolution: row.resolution,
        price_credits_per_second: row.price_credits_per_second,
        price_brl_per_credit: row.price_brl_per_credit,
        notes: row.notes,
        updated_by: userData.user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("seedance_pricing")
        .upsert(payload, { onConflict: "model_key,resolution" });
      if (error) throw error;
      toast({ title: "Preço salvo", description: `${row.model_key} · ${row.resolution}` });
      await load();
    } catch (err) {
      console.error(err);
      toast({ title: "Erro ao salvar", description: "Tente novamente.", variant: "destructive" });
    } finally {
      update(index, { isSaving: false });
    }
  };

  const remove = async (index: number) => {
    const row = rows[index];
    if (row.isNew || !row.id) {
      setRows((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    const { error } = await supabase.from("seedance_pricing").delete().eq("id", row.id);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível remover.", variant: "destructive" });
      return;
    }
    toast({ title: "Preço removido" });
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Preços Seedance</CardTitle>
            <CardDescription>
              Créditos por segundo por modelo e resolução. BRL por crédito é opcional.
            </CardDescription>
          </div>
          <Button size="sm" onClick={addNew} className="gap-2">
            <Plus className="h-4 w-4" /> Novo preço
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum preço cadastrado. Adicione ao menos um para exibir o custo estimado no fluxo de vídeo.
          </p>
        )}
        {rows.map((row, index) => (
          <div
            key={row.id ?? `new-${index}`}
            className="grid grid-cols-1 md:grid-cols-[140px_120px_160px_160px_1fr_auto] gap-3 items-end border rounded-lg p-3"
          >
            <div className="space-y-1.5">
              <Label className="text-xs">Modelo</Label>
              <Select value={row.model_key} onValueChange={(v) => update(index, { model_key: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Resolução</Label>
              <Select value={row.resolution} onValueChange={(v) => update(index, { resolution: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOLUTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Créditos / segundo</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={row.price_credits_per_second}
                onChange={(e) =>
                  update(index, { price_credits_per_second: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">BRL / crédito (opcional)</Label>
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={row.price_brl_per_credit ?? ""}
                onChange={(e) =>
                  update(index, {
                    price_brl_per_credit: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Input
                placeholder="Notas internas"
                value={row.notes ?? ""}
                onChange={(e) => update(index, { notes: e.target.value || null })}
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => save(index)} disabled={row.isSaving} className="gap-2">
                <Save className="h-4 w-4" />
                {row.isSaving ? "..." : "Salvar"}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => remove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
