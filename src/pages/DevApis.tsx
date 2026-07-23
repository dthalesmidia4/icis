import { useState, useEffect } from "react";
import { Save, Eye, EyeOff, CheckCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import BackButton from "@/components/BackButton";
import SeedancePricingManager from "@/components/dev/SeedancePricingManager";

interface ApiKeyEntry {
  id?: string;
  key_name: string;
  key_value: string;
  isNew?: boolean;
  showKey?: boolean;
  isSaving?: boolean;
}

const DevApis = () => {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, key_name, key_value")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setKeys(
        (data || []).map((k) => ({
          id: k.id,
          key_name: k.key_name,
          key_value: "",
          showKey: false,
          isSaving: false,
        }))
      );
    } catch (error) {
      console.error("Erro ao carregar chaves:", error);
    } finally {
      setLoading(false);
    }
  };

  const addNewKey = () => {
    setKeys((prev) => [
      ...prev,
      { key_name: "", key_value: "", isNew: true, showKey: false, isSaving: false },
    ]);
  };

  const updateKeyField = (index: number, field: keyof ApiKeyEntry, value: string | boolean) => {
    setKeys((prev) => prev.map((k, i) => (i === index ? { ...k, [field]: value } : k)));
  };

  const handleSave = async (index: number) => {
    const entry = keys[index];
    if (!entry.key_name.trim()) {
      toast({ title: "Erro", description: "Informe o nome da chave.", variant: "destructive" });
      return;
    }
    if (!entry.key_value.trim()) {
      toast({ title: "Erro", description: "Informe o valor da chave.", variant: "destructive" });
      return;
    }

    updateKeyField(index, "isSaving", true);
    try {
      const { error } = await supabase.from("api_keys").upsert(
        {
          key_name: entry.key_name,
          key_value: entry.key_value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key_name" }
      );
      if (error) throw error;

      toast({ title: "✅ Chave salva!", description: `"${entry.key_name}" foi salva com sucesso.` });
      await loadKeys();
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast({ title: "Erro ao salvar", description: "Tente novamente.", variant: "destructive" });
    } finally {
      updateKeyField(index, "isSaving", false);
    }
  };

  const handleDelete = async (index: number) => {
    const entry = keys[index];
    if (entry.isNew) {
      setKeys((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    try {
      const { error } = await supabase.from("api_keys").delete().eq("id", entry.id!);
      if (error) throw error;
      toast({ title: "Chave removida", description: `"${entry.key_name}" foi removida.` });
      setKeys((prev) => prev.filter((_, i) => i !== index));
    } catch (error) {
      console.error("Erro ao remover:", error);
      toast({ title: "Erro", description: "Não foi possível remover.", variant: "destructive" });
    }
  };

  return (
    <div className="container max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <BackButton to="/dev-hub" />
            <h1 className="text-3xl font-bold">APIs do Sistema</h1>
          </div>
          <Button onClick={addNewKey} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Nova API Key
          </Button>
        </div>
        <p className="text-muted-foreground">
          Configure as chaves de API externas utilizadas pelo sistema.
        </p>
      </div>

      <div className="space-y-6">
        {loading && <p className="text-muted-foreground text-sm">Carregando...</p>}

        {!loading && keys.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhuma API Key cadastrada. Clique em "Nova API Key" para começar.
            </CardContent>
          </Card>
        )}

        {keys.map((entry, index) => (
          <Card key={entry.id || `new-${index}`}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">
                    {entry.isNew ? "Nova Chave" : entry.key_name}
                  </CardTitle>
                  {!entry.isNew && <CheckCircle className="h-4 w-4 text-green-500" />}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {!entry.isNew && (
                <CardDescription>Chave configurada. Insira um novo valor para atualizar.</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {entry.isNew && (
                <div className="space-y-2">
                  <Label>Nome da Chave</Label>
                  <Input
                    placeholder="Ex: OPENAI_API_KEY"
                    value={entry.key_name}
                    onChange={(e) => updateKeyField(index, "key_name", e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Valor da Chave</Label>
                <div className="relative">
                  <Input
                    type={entry.showKey ? "text" : "password"}
                    placeholder="Cole o valor da chave aqui..."
                    value={entry.key_value}
                    onChange={(e) => updateKeyField(index, "key_value", e.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => updateKeyField(index, "showKey", !entry.showKey)}
                  >
                    {entry.showKey ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <Button
                onClick={() => handleSave(index)}
                disabled={entry.isSaving || !entry.key_value.trim()}
                className="w-full"
              >
                <Save className="h-4 w-4 mr-2" />
                {entry.isSaving ? "Salvando..." : entry.isNew ? "Salvar" : "Atualizar"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default DevApis;
