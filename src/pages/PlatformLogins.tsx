import { useState, useEffect } from "react";
import BackButton from "@/components/BackButton";
import { KeyRound, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

interface PlatformLogin {
  id: string;
  name: string;
  access_info: string;
  observations: string | null;
}

const PlatformLogins = () => {
  const { tenantId: currentTenantId } = useTenant();
  const [logins, setLogins] = useState<PlatformLogin[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [accessInfo, setAccessInfo] = useState("");
  const [observations, setObservations] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchLogins = async () => {
    if (!currentTenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("platform_logins" as any)
      .select("id, name, access_info, observations")
      .eq("tenant_id", currentTenantId)
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar logins");
    } else {
      setLogins((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogins();
  }, [currentTenantId]);

  const openNew = () => {
    setEditing(false);
    setEditId(null);
    setName("");
    setAccessInfo("");
    setObservations("");
    setModalOpen(true);
  };

  const openEdit = (login: PlatformLogin) => {
    setEditing(true);
    setEditId(login.id);
    setName(login.name);
    setAccessInfo(login.access_info);
    setObservations(login.observations || "");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !accessInfo.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    if (!currentTenantId) return;
    setSaving(true);

    if (editing && editId) {
      const { error } = await supabase
        .from("platform_logins" as any)
        .update({ name: name.trim(), access_info: accessInfo.trim(), observations: observations.trim() || null, updated_at: new Date().toISOString() } as any)
        .eq("id", editId);
      if (error) {
        toast.error("Erro ao atualizar");
      } else {
        toast.success("Login atualizado");
      }
    } else {
      const { error } = await supabase
        .from("platform_logins" as any)
        .insert({ tenant_id: currentTenantId, name: name.trim(), access_info: accessInfo.trim(), observations: observations.trim() || null } as any);
      if (error) {
        toast.error("Erro ao salvar");
      } else {
        toast.success("Login cadastrado");
      }
    }

    setSaving(false);
    setModalOpen(false);
    fetchLogins();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error } = await supabase.from("platform_logins" as any).delete().eq("id", deleteId);
    if (error) {
      toast.error("Erro ao excluir");
    } else {
      toast.success("Login excluído");
    }
    setDeleting(false);
    setDeleteId(null);
    fetchLogins();
  };

  return (
    <div className="pb-8">
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <BackButton to="/" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Lista de Logins das Plataformas</h1>
              <p className="text-sm text-muted-foreground">
                Gerencie os acessos e credenciais das plataformas dos seus clientes
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={openNew} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Novo Login
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logins.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-center text-muted-foreground">
              <KeyRound className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">Nenhum login cadastrado</p>
              <p className="text-sm">Clique em "Novo Login" para começar.</p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Acesso</TableHead>
                    <TableHead className="w-[100px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logins.map((login) => (
                    <TableRow key={login.id}>
                      <TableCell className="font-medium">{login.name}</TableCell>
                      <TableCell>{login.access_info}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(login)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(login.id)} className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Login" : "Novo Login"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Instagram do Cliente X" />
            </div>
            <div className="space-y-2">
              <Label>Acesso</Label>
              <Input value={accessInfo} onChange={(e) => setAccessInfo(e.target.value)} placeholder="Ex: usuario@email.com / senha123" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir Login"
        description="Tem certeza que deseja excluir este login? Esta ação não pode ser desfeita."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
};

export default PlatformLogins;
