import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Upload, Loader2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import BackButton from "@/components/BackButton";

const KINDS = [
  { value: "character", label: "Personagem" },
  { value: "scenery", label: "Cenário" },
  { value: "prop", label: "Elemento / Prop" },
  { value: "product", label: "Produto" },
  { value: "logo", label: "Logo" },
];

type Reference = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  kind: string;
  name: string;
  description: string | null;
  primary_image_url: string | null;
  extra_image_urls: string[];
  restrictions: string | null;
};

type FormState = {
  id?: string;
  kind: string;
  name: string;
  description: string;
  restrictions: string;
  client_id: string | null;
  primary_image_url: string | null;
  extra_image_urls: string[];
};

const emptyForm: FormState = {
  kind: "character",
  name: "",
  description: "",
  restrictions: "",
  client_id: null,
  primary_image_url: null,
  extra_image_urls: [],
};

export default function VideoReferencesLibrary() {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [refs, setRefs] = useState<Reference[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string; fantasy_name: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"primary" | "extra" | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    void loadAll();
  }, [tenantId]);

  const loadAll = async () => {
    setLoading(true);
    const [refsRes, companiesRes] = await Promise.all([
      supabase
        .from("video_references")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("kind")
        .order("name"),
      supabase
        .from("tenant_companies")
        .select("id, name, fantasy_name")
        .eq("tenant_id", tenantId!)
        .order("fantasy_name"),
    ]);
    if (refsRes.data) setRefs(refsRes.data as Reference[]);
    if (companiesRes.data) setClients(companiesRes.data as any);
    setLoading(false);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (r: Reference) => {
    setForm({
      id: r.id,
      kind: r.kind,
      name: r.name,
      description: r.description ?? "",
      restrictions: r.restrictions ?? "",
      client_id: r.client_id,
      primary_image_url: r.primary_image_url,
      extra_image_urls: r.extra_image_urls ?? [],
    });
    setDialogOpen(true);
  };

  const uploadImage = async (file: File, target: "primary" | "extra") => {
    setUploading(target);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `video-refs/${tenantId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("card-attachments")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) {
        toast.error("Falha ao enviar imagem.");
        return;
      }
      const { data } = supabase.storage.from("card-attachments").getPublicUrl(path);
      if (target === "primary") {
        setForm((f) => ({ ...f, primary_image_url: data.publicUrl }));
      } else {
        setForm((f) => ({
          ...f,
          extra_image_urls: [...f.extra_image_urls, data.publicUrl].slice(0, 6),
        }));
      }
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Nome da referência é obrigatório.");
      return;
    }
    if (!form.primary_image_url) {
      toast.error("Envie ao menos uma imagem principal.");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        tenant_id: tenantId!,
        client_id: form.client_id,
        kind: form.kind,
        name: form.name.trim(),
        description: form.description.trim() || null,
        restrictions: form.restrictions.trim() || null,
        primary_image_url: form.primary_image_url,
        extra_image_urls: form.extra_image_urls,
        created_by: userData.user?.id ?? null,
        updated_at: new Date().toISOString(),
      };
      if (form.id) {
        const { error } = await supabase
          .from("video_references")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
        toast.success("Referência atualizada.");
      } else {
        const { error } = await supabase.from("video_references").insert(payload);
        if (error) throw error;
        toast.success("Referência criada.");
      }
      setDialogOpen(false);
      await loadAll();
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar a referência.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta referência?")) return;
    const { error } = await supabase.from("video_references").delete().eq("id", id);
    if (error) {
      toast.error("Não foi possível remover.");
      return;
    }
    toast.success("Removida.");
    await loadAll();
  };

  const filtered = refs.filter((r) => {
    if (kindFilter !== "all" && r.kind !== kindFilter) return false;
    if (clientFilter === "global" && r.client_id != null) return false;
    if (clientFilter !== "all" && clientFilter !== "global" && r.client_id !== clientFilter) return false;
    return true;
  });

  const clientLabel = (id: string | null) => {
    if (!id) return "Compartilhada (todos os clientes)";
    const c = clients.find((x) => x.id === id);
    return c ? c.fantasy_name || c.name : "Cliente";
  };

  return (
    <div className="container max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <BackButton to="/home" />
            <h1 className="text-3xl font-bold">Biblioteca Visual</h1>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Nova referência
          </Button>
        </div>
        <p className="text-muted-foreground">
          Personagens, cenários, produtos, props e logos reutilizáveis em qualquer geração de vídeo.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="min-w-[180px]">
          <Label className="text-xs">Tipo</Label>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px]">
          <Label className="text-xs">Cliente</Label>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="global">Somente compartilhadas</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.fantasy_name || c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma referência {refs.length > 0 ? "com os filtros atuais" : "cadastrada"}.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((r) => (
            <Card
              key={r.id}
              className="overflow-hidden hover:ring-2 hover:ring-primary/40 transition cursor-pointer"
              onClick={() => openEdit(r)}
            >
              <div className="aspect-square bg-muted relative">
                {r.primary_image_url ? (
                  <img
                    src={r.primary_image_url}
                    alt={r.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
                <span className="absolute top-2 left-2 rounded-md bg-black/60 text-white text-[10px] uppercase tracking-wide px-1.5 py-0.5">
                  {KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}
                </span>
                <button
                  className="absolute top-2 right-2 h-7 w-7 flex items-center justify-center rounded-md bg-black/60 hover:bg-red-600 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(r.id);
                  }}
                  aria-label="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <CardContent className="p-3">
                <div className="font-semibold text-sm truncate">{r.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {clientLabel(r.client_id)}
                </div>
                {r.description && (
                  <div className="text-[11px] text-muted-foreground line-clamp-2 mt-1">
                    {r.description}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar referência" : "Nova referência"}</DialogTitle>
            <DialogDescription>
              Um item aqui pode ser reutilizado em qualquer cena de vídeo do tenant.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select
                value={form.client_id ?? "global"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, client_id: v === "global" ? null : v }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Compartilhada (todos os clientes)</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.fantasy_name || c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              placeholder="Ex: Personagem João — expressivo"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              placeholder="Detalhes visuais, roupas, características que precisam ser mantidas..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Restrições / não-fazer</Label>
            <Textarea
              placeholder="O que NÃO pode aparecer, cores proibidas, poses inadequadas..."
              value={form.restrictions}
              onChange={(e) => setForm((f) => ({ ...f, restrictions: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Imagem principal</Label>
            {form.primary_image_url ? (
              <div className="relative w-40 h-40 rounded-md overflow-hidden border">
                <img src={form.primary_image_url} alt="Principal" className="w-full h-full object-cover" />
                <button
                  onClick={() => setForm((f) => ({ ...f, primary_image_url: null }))}
                  className="absolute top-1 right-1 h-6 w-6 flex items-center justify-center rounded-md bg-black/60 hover:bg-red-600 text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-dashed px-3 py-2 text-sm hover:bg-muted/50">
                {uploading === "primary" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Enviar imagem principal
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f, "primary");
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            )}
          </div>

          <div className="space-y-2">
            <Label>Imagens extras (até 6)</Label>
            <div className="flex flex-wrap gap-2">
              {form.extra_image_urls.map((url, i) => (
                <div key={i} className="relative w-24 h-24 rounded-md overflow-hidden border">
                  <img src={url} alt={`Extra ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        extra_image_urls: f.extra_image_urls.filter((_, j) => j !== i),
                      }))
                    }
                    className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded bg-black/60 hover:bg-red-600 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {form.extra_image_urls.length < 6 && (
                <label className="w-24 h-24 flex items-center justify-center cursor-pointer rounded-md border border-dashed hover:bg-muted/50">
                  {uploading === "extra" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-5 w-5 text-muted-foreground" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadImage(f, "extra");
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar referência
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
