import { useState, useEffect } from "react";
import { Save, Plus, Trash2, Eye, EyeOff, CheckCircle2, Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import BackButton from "@/components/BackButton";

interface Client { id: string; name: string; tenant_id: string }
interface Account {
  id?: string;
  tenant_id: string;
  client_id: string;
  platform: "instagram" | "facebook";
  account_label: string;
  access_token: string;
  ig_user_id: string;
  fb_page_id: string;
  is_active: boolean;
  notes: string;
  _show?: boolean;
  _saving?: boolean;
  _isNew?: boolean;
}

const empty = (tenant_id: string, client_id: string): Account => ({
  tenant_id, client_id,
  platform: "instagram",
  account_label: "",
  access_token: "",
  ig_user_id: "",
  fb_page_id: "",
  is_active: true,
  notes: "",
  _isNew: true,
  _show: true,
});

const DevSocialTokens = () => {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { if (selectedClient) loadAccounts(selectedClient); }, [selectedClient]);

  const loadClients = async () => {
    const { data } = await supabase
      .from("tenant_companies")
      .select("id, name, tenant_id")
      .order("name");
    const list = (data as any) || [];
    setClients(list);
    const { data: accs } = await supabase
      .from("client_social_accounts" as any)
      .select("client_id");
    const map: Record<string, number> = {};
    ((accs as any) || []).forEach((r: any) => { map[r.client_id] = (map[r.client_id] || 0) + 1; });
    setCounts(map);
    setLoading(false);
  };


  const loadAccounts = async (clientId: string) => {
    const { data } = await supabase
      .from("client_social_accounts" as any)
      .select("*")
      .eq("client_id", clientId)
      .order("platform");
    setAccounts(((data as any) || []).map((a: any) => ({ ...a, _show: false })));
  };

  const tenantOf = (cid: string) => clients.find(c => c.id === cid)?.tenant_id || "";

  const addAccount = () => {
    if (!selectedClient) return;
    setAccounts(prev => [...prev, empty(tenantOf(selectedClient), selectedClient)]);
  };

  const update = (i: number, patch: Partial<Account>) => {
    setAccounts(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  };

  const save = async (i: number) => {
    const a = accounts[i];
    if (!a.access_token.trim()) return toast({ title: "Access Token obrigatório", variant: "destructive" });
    if (a.platform === "instagram" && !a.ig_user_id.trim()) return toast({ title: "Instagram Business ID obrigatório", variant: "destructive" });
    if (a.platform === "facebook" && !a.fb_page_id.trim()) return toast({ title: "Facebook Page ID obrigatório", variant: "destructive" });

    update(i, { _saving: true });
    const payload = {
      tenant_id: a.tenant_id,
      client_id: a.client_id,
      platform: a.platform,
      account_label: a.account_label || null,
      access_token: a.access_token,
      ig_user_id: a.ig_user_id || null,
      fb_page_id: a.fb_page_id || null,
      is_active: a.is_active,
      notes: a.notes || null,
    };
    const { error, data } = a.id
      ? await supabase.from("client_social_accounts" as any).update(payload).eq("id", a.id).select().single()
      : await supabase.from("client_social_accounts" as any).insert(payload).select().single();
    update(i, { _saving: false });
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    update(i, { id: (data as any).id, _isNew: false });
    toast({ title: "Conta salva" });
  };

  const remove = async (i: number) => {
    const a = accounts[i];
    if (a.id) {
      const { error } = await supabase.from("client_social_accounts" as any).delete().eq("id", a.id);
      if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
    setAccounts(prev => prev.filter((_, idx) => idx !== i));
  };

  return (
    <div className="container max-w-5xl mx-auto px-6 py-8">
      <BackButton />
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Tokens de Redes Sociais</h1>
        <p className="text-muted-foreground mt-1">Cole o Access Token, IG Business ID e Page ID de cada cliente para habilitar publicações automáticas.</p>
      </div>

      {!selectedClient && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading && <p className="text-muted-foreground col-span-full">Carregando...</p>}
          {!loading && clients.length === 0 && (
            <p className="text-muted-foreground col-span-full">Nenhum cliente cadastrado.</p>
          )}
          {clients.map(c => {
            const count = counts[c.id] || 0;
            return (
              <Card
                key={c.id}
                onClick={() => setSelectedClient(c.id)}
                className="group cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border-2 hover:border-primary/50"
              >
                <CardContent className="p-6 flex flex-col items-center text-center gap-3">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Building2 className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="font-semibold text-base line-clamp-2">{c.name}</h3>
                  <Badge variant={count > 0 ? "default" : "secondary"}>
                    {count > 0 ? `${count} conta${count > 1 ? "s" : ""}` : "Sem contas"}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedClient && (
        <>
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => { setSelectedClient(""); setAccounts([]); loadClients(); }}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para clientes
            </Button>
            <h2 className="text-xl font-semibold">{clients.find(c => c.id === selectedClient)?.name}</h2>
          </div>
        </>
      )}

      {selectedClient && (
        <div className="space-y-4">

          {accounts.map((a, i) => (
            <Card key={a.id || `new-${i}`}>
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  {a.id && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  <CardTitle className="text-lg capitalize">{a.platform}</CardTitle>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Plataforma</Label>
                  <Select value={a.platform} onValueChange={(v: any) => update(i, { platform: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Rótulo (opcional)</Label>
                  <Input value={a.account_label} onChange={e => update(i, { account_label: e.target.value })} placeholder="@perfil_principal" />
                </div>
                <div className="md:col-span-2">
                  <Label>Access Token (long-lived) *</Label>
                  <div className="flex gap-2">
                    <Input
                      type={a._show ? "text" : "password"}
                      value={a.access_token}
                      onChange={e => update(i, { access_token: e.target.value })}
                      placeholder="EAAB..."
                    />
                    <Button variant="outline" size="icon" onClick={() => update(i, { _show: !a._show })}>
                      {a._show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                {a.platform === "instagram" && (
                  <div>
                    <Label>Instagram Business ID *</Label>
                    <Input value={a.ig_user_id} onChange={e => update(i, { ig_user_id: e.target.value })} placeholder="17841..." />
                  </div>
                )}
                {a.platform === "facebook" && (
                  <div>
                    <Label>Facebook Page ID *</Label>
                    <Input value={a.fb_page_id} onChange={e => update(i, { fb_page_id: e.target.value })} placeholder="1234567890" />
                  </div>
                )}
                <div className="md:col-span-2">
                  <Label>Anotações</Label>
                  <Input value={a.notes} onChange={e => update(i, { notes: e.target.value })} placeholder="Quando expira, observações..." />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button onClick={() => save(i)} disabled={a._saving}>
                    <Save className="h-4 w-4 mr-2" /> {a._saving ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button variant="outline" onClick={addAccount} className="w-full">
            <Plus className="h-4 w-4 mr-2" /> Adicionar conta
          </Button>
        </div>
      )}
    </div>
  );
};

export default DevSocialTokens;
