import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface MemberAvatarUploadProps {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  initials: string;
  /**
   * Pode editar a foto: o próprio usuário OU um administrador da agência
   * (`agency_admin`/`super_admin`). A regra é revalidada no servidor pela RPC
   * `set_team_member_avatar`.
   */
  editable: boolean;
  onChanged: (url: string | null) => void;
}

/**
 * Foto do colaborador. Armazenada no bucket `company-logos` em
 * `avatars/<uploader_id>/…` (path validado por `storage_path_access_allowed`)
 * e persistida em `profiles.avatar_url` — a mesma URL usada pelo personagem
 * do `/escritorio`.
 */
export default function MemberAvatarUpload({
  userId,
  fullName,
  avatarUrl,
  initials,
  editable,
  onChanged,
}: MemberAvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();

  const persist = async (url: string | null) => {
    const { error } = await supabase.rpc("set_team_member_avatar", {
      _target_user_id: userId,
      _avatar_url: url,
    });
    if (error) throw error;
    onChanged(url);
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem (JPG, PNG ou WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5 MB.");
      return;
    }
    const uploaderId = user?.id;
    if (!uploaderId) {
      toast.error("Sessão expirada. Entre novamente para enviar a foto.");
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      // O path carrega o uuid de QUEM envia — é o que a policy de storage valida.
      const path = `avatars/${uploaderId}/${userId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("company-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
      await persist(data.publicUrl);
      toast.success("Foto atualizada.");
    } catch (e: any) {
      console.error("[MemberAvatarUpload]", e);
      toast.error(e?.message || "Não foi possível salvar a foto.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await persist(null);
      toast.success("Foto removida.");
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível remover a foto.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src={avatarUrl || undefined} alt={`Foto de ${fullName}`} className="object-cover" />
          <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
        {editable && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label={avatarUrl ? "Alterar foto do colaborador" : "Adicionar foto do colaborador"}
            title={avatarUrl ? "Alterar foto" : "Adicionar foto"}
            className="absolute -bottom-1 -right-1 rounded-full border border-border bg-background p-1 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
          </button>
        )}
      </div>

      {editable && (
        <div className="flex flex-col items-start gap-0.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <ImagePlus className="mr-1 h-3 w-3" />
            )}
            {avatarUrl ? "Alterar foto" : "Adicionar foto"}
          </Button>
          {avatarUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" /> Remover
            </button>
          )}
        </div>
      )}
    </div>
  );
}
