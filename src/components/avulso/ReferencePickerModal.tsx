import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Library } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

const KINDS = [
  { value: "all", label: "Todos" },
  { value: "character", label: "Personagem" },
  { value: "scenery", label: "Cenário" },
  { value: "prop", label: "Prop" },
  { value: "product", label: "Produto" },
  { value: "logo", label: "Logo" },
];

type Reference = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  primary_image_url: string | null;
  client_id: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  clientId: string;
  /** Restrict picker to one kind (character/scenery/etc.). "any" allows all. */
  initialKind?: string;
  onSelect: (ref: Reference) => void;
};

export default function ReferencePickerModal({
  open,
  onOpenChange,
  tenantId,
  clientId,
  initialKind = "all",
  onSelect,
}: Props) {
  const [refs, setRefs] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState(initialKind);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    setQuery("");
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKind, tenantId, clientId]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("video_references")
      .select("id, kind, name, description, primary_image_url, client_id")
      .eq("tenant_id", tenantId)
      .or(`client_id.is.null,client_id.eq.${clientId}`)
      .order("kind")
      .order("name");
    if (!error) setRefs((data ?? []) as Reference[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return refs.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [refs, kind, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" /> Biblioteca visual
          </DialogTitle>
          <DialogDescription>
            Escolha uma referência salva para reutilizar nesta cena.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou descrição"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="w-[160px]">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 mt-2 pr-1">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando referências...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma referência encontrada. Cadastre em <span className="font-medium">Biblioteca Visual</span>.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    onSelect(r);
                    onOpenChange(false);
                  }}
                  className="group text-left rounded-md overflow-hidden border hover:ring-2 hover:ring-primary transition"
                >
                  <div className="aspect-square bg-muted">
                    {r.primary_image_url && (
                      <img
                        src={r.primary_image_url}
                        alt={r.name}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition"
                      />
                    )}
                  </div>
                  <div className="p-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}
                    </div>
                    <div className="text-sm font-medium truncate">{r.name}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
