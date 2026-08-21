import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface MemberAvatarUploadProps {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  initials: string;
  /** Somente o próprio usuário pode trocar a foto (RLS de `profiles`). */
  editable: boolean;
  onChanged: (url: string | null) => void;
}

/**
 * Foto do colaborador. Armazenada no bucket público `company-logos` em
 * `avatars/<user_id>/…` e persistida em `profiles.avatar_url` — a mesma URL
 * usada pelo personagem do `/escritorio`.
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

  const persist = async (url: string | null) => {
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
    if (error) throw error;
    onChanged(url);
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `avatars/${userId}/${Date.now()}.${ext}`;
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
          <AvatarImage src={avatarUrl || undefined} alt={`Foto de ${fullName}`} />
          <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
        {editable && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label="Alterar foto do colaborador"
            title="Alterar foto do colaborador"
            className="absolute -bottom-1 -right-1 rounded-full border border-border bg-background p-1 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
          </button>
        )}
      </div>

      {editable && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          {avatarUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={handleRemove}
              disabled={busy}
              aria-label="Remover foto"
              title="Remover foto"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
