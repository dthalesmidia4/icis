/**
 * `Gerenciar cadastros` — catálogo de ferramentas, pacotes e recursos incluídos.
 *
 * É deliberadamente SEPARADO do fechamento mensal: aqui aparecem ativos e
 * inativos, porque o assunto é o cadastro em si (reativar, corrigir, revisar) e
 * não “o que faz parte deste mês”.
 */
import { useState } from "react";
import { Pencil, Power } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FinanceItem, KIND_LABELS } from "@/lib/financeModel";
import { CatalogFilter, buildSubscriptionCatalog } from "@/lib/financeSubscriptionMonth";

const FILTERS: { value: CatalogFilter; label: string }[] = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "all", label: "Todos" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: FinanceItem[];
  onEdit: (item: FinanceItem) => void;
  onToggleActive: (id: string, active: boolean) => void;
}

export default function SubscriptionCatalogModal({
  open,
  onOpenChange,
  items,
  onEdit,
  onToggleActive,
}: Props) {
  const [filter, setFilter] = useState<CatalogFilter>("active");
  const [search, setSearch] = useState("");

  const entries = buildSubscriptionCatalog({ items, filter, search });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar cadastros</DialogTitle>
          <DialogDescription>
            Ferramentas, pacotes e recursos incluídos — inclusive os desativados. Isto não altera o
            fechamento do mês.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 py-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              className="min-h-10"
              variant={filter === f.value ? "default" : "outline"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
          <Input
            placeholder="Buscar cadastro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full sm:w-56"
          />
        </div>

        <div className="rounded-md border divide-y">
          {entries.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Nenhum cadastro com esse filtro.
            </p>
          )}
          {entries.map(({ item, parentName }) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-medium truncate">{item.name}</span>
                  <Badge variant="outline" className="text-sm">
                    {KIND_LABELS[item.kind]}
                  </Badge>
                  {!item.active && (
                    <Badge variant="secondary" className="text-sm">
                      Inativo
                    </Badge>
                  )}
                </span>
                {parentName && (
                  <span className="block text-sm text-muted-foreground">Dentro de {parentName}</span>
                )}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10"
                aria-label={`Editar ${item.name}`}
                onClick={() => onEdit(item)}
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10"
                aria-label={item.active ? `Desativar ${item.name}` : `Reativar ${item.name}`}
                onClick={() => onToggleActive(item.id, !item.active)}
              >
                <Power className={`w-4 h-4 ${item.active ? "text-destructive" : "text-primary"}`} />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
