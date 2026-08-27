import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  inlineCurrencyText,
  inlineDateText,
  inlineNumberText,
  isUnchanged,
  parseInlineCurrency,
  parseInlineDate,
  parseInlineNumber,
  parseInlineSelect,
  parseInlineText,
  toInputValue,
  validateInlineRange,
  TO_DEFINE,
} from "@/lib/inlineEdit";

/**
 * CÉLULAS DE EDIÇÃO INLINE (planilha operacional).
 *
 * Comportamento único para todas: clique abre o input, Enter salva, Esc
 * cancela, Tab salva e segue, blur salva. Enquanto grava mostra spinner; ao
 * confirmar mostra um check curto; se o banco recusa, o valor volta ao anterior
 * e o motivo aparece em toast. Vazio grava `null` — nunca zero.
 */

export type InlineCommit = (value: any) => Promise<{ success: boolean; message?: string }>;

type Status = "idle" | "saving" | "saved" | "error";

const shell =
  "w-full rounded-sm border border-transparent px-1.5 py-1 text-left text-sm hover:border-border hover:bg-muted/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary";

const inputCls =
  "w-full rounded-sm border border-primary bg-background px-1.5 py-1 text-sm outline-none tabular-nums";

function useInlineState(onCommit: InlineCommit) {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const commit = async (value: any): Promise<boolean> => {
    setStatus("saving");
    const res = await onCommit(value);
    if (!res.success) {
      setStatus("error");
      toast.error(res.message || "Não foi possível salvar.");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setStatus("idle"), 2200);
      return false;
    }
    setStatus("saved");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus("idle"), 1200);
    return true;
  };

  return { status, commit };
}

const StatusMark = ({ status }: { status: Status }) => {
  if (status === "saving") return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
  if (status === "saved") return <Check className="h-3 w-3 text-primary" />;
  return null;
};

interface BaseProps {
  onCommit: InlineCommit;
  /** Bloqueia a edição sem esconder o valor. */
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel: string;
}

interface SingleProps extends BaseProps {
  value: string | number | null | undefined;
  display?: string;
}

/** Base genérica: cuida do ciclo editar → validar → gravar → feedback. */
function InlineField({
  value,
  display,
  onCommit,
  readOnly,
  className,
  placeholder,
  ariaLabel,
  parse,
  inputType = "text",
}: SingleProps & {
  parse: (raw: string) => { ok: boolean; value: any; message?: string };
  inputType?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const { status, commit } = useInlineState(onCommit);
  const cancelled = useRef(false);

  const open = () => {
    if (readOnly) return;
    setDraft(toInputValue(value));
    cancelled.current = false;
    setEditing(true);
  };

  const save = async () => {
    if (cancelled.current) return;
    const parsed = parse(draft);
    if (!parsed.ok) {
      toast.error(parsed.message);
      setEditing(false);
      return;
    }
    setEditing(false);
    if (isUnchanged(value ?? null, parsed.value)) return;
    await commit(parsed.value);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          aria-label={ariaLabel}
          type={inputType}
          value={draft}
          placeholder={placeholder}
          className={cn(inputCls, className)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelled.current = true;
              setEditing(false);
            } else if (e.key === "Tab") {
              void save();
            }
          }}
        />
      </div>
    );
  }

  const text = display ?? (value === null || value === undefined || value === "" ? TO_DEFINE : String(value));

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={open}
        className={cn(
          shell,
          readOnly && "cursor-default hover:border-transparent hover:bg-transparent",
          (value === null || value === undefined || value === "") && "text-muted-foreground",
          status === "error" && "border-destructive/60",
          className,
        )}
      >
        {text}
      </button>
      <StatusMark status={status} />
    </div>
  );
}

export function InlineTextCell(props: SingleProps) {
  return <InlineField {...props} parse={(raw) => parseInlineText(raw)} />;
}

export function InlineNumberCell(props: SingleProps & { suffix?: string; label?: string }) {
  const { suffix, label, ...rest } = props;
  return (
    <InlineField
      {...rest}
      display={props.display ?? inlineNumberText(props.value as number | null, suffix || "")}
      parse={(raw) => parseInlineNumber(raw, { label })}
    />
  );
}

export function InlineCurrencyCell(props: SingleProps) {
  return (
    <InlineField
      {...props}
      display={props.display ?? inlineCurrencyText(props.value as number | null)}
      parse={(raw) => parseInlineCurrency(raw)}
    />
  );
}

export function InlineDateCell(props: SingleProps) {
  return (
    <InlineField
      {...props}
      inputType="date"
      display={props.display ?? inlineDateText(props.value as string | null)}
      parse={(raw) => parseInlineDate(raw)}
    />
  );
}

export function InlineDateTimeCell(props: SingleProps) {
  return (
    <InlineField
      {...props}
      inputType="datetime-local"
      parse={(raw) => {
        const text = (raw || "").trim();
        if (!text) return { ok: true, value: null };
        const date = new Date(text);
        if (Number.isNaN(date.getTime())) {
          return { ok: false, value: null, message: "Informe uma data/hora válida." };
        }
        return { ok: true, value: date.toISOString() };
      }}
    />
  );
}

/** Janela com início e fim: valida a ordem antes de gravar os dois campos. */
export function InlineDateRangeCell({
  start,
  end,
  onCommit,
  label = "período",
  readOnly,
  ariaLabel,
}: {
  start: string | null;
  end: string | null;
  onCommit: (value: { start: string | null; end: string | null }) => Promise<{
    success: boolean;
    message?: string;
  }>;
  label?: string;
  readOnly?: boolean;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const { status, commit } = useInlineState(onCommit as InlineCommit);
  const cancelled = useRef(false);

  const open = () => {
    if (readOnly) return;
    setDraftStart(start || "");
    setDraftEnd(end || "");
    cancelled.current = false;
    setEditing(true);
  };

  const save = async () => {
    if (cancelled.current) return;
    const s = parseInlineDate(draftStart);
    const e = parseInlineDate(draftEnd);
    if (!s.ok) {
      toast.error(s.message);
      setEditing(false);
      return;
    }
    if (!e.ok) {
      toast.error(e.message);
      setEditing(false);
      return;
    }
    const invalid = validateInlineRange(s.value, e.value, label);
    if (invalid) {
      toast.error(invalid);
      setEditing(false);
      return;
    }
    setEditing(false);
    if (s.value === (start || null) && e.value === (end || null)) return;
    await commit({ start: s.value, end: e.value });
  };

  if (editing) {
    return (
      <div
        className="flex items-center gap-1"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) void save();
        }}
      >
        <input
          autoFocus
          aria-label={`${ariaLabel} — início`}
          type="date"
          value={draftStart}
          className={inputCls}
          onChange={(e) => setDraftStart(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
            if (e.key === "Escape") {
              cancelled.current = true;
              setEditing(false);
            }
          }}
        />
        <span className="text-xs text-muted-foreground">→</span>
        <input
          aria-label={`${ariaLabel} — fim`}
          type="date"
          value={draftEnd}
          className={inputCls}
          onChange={(e) => setDraftEnd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
            if (e.key === "Escape") {
              cancelled.current = true;
              setEditing(false);
            }
          }}
        />
      </div>
    );
  }

  const text =
    start || end ? `${inlineDateText(start)} → ${inlineDateText(end)}` : TO_DEFINE;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={open}
        className={cn(
          shell,
          "tabular-nums",
          readOnly && "cursor-default hover:border-transparent hover:bg-transparent",
          !start && !end && "text-muted-foreground",
        )}
      >
        {text}
      </button>
      <StatusMark status={status} />
    </div>
  );
}

export function InlineSelectCell({
  value,
  options,
  onCommit,
  readOnly,
  ariaLabel,
  emptyLabel = TO_DEFINE,
  className,
}: {
  value: string | null | undefined;
  options: { value: string; label: string }[];
  onCommit: InlineCommit;
  readOnly?: boolean;
  ariaLabel: string;
  emptyLabel?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const { status, commit } = useInlineState(onCommit);
  const allowed = options.map((o) => o.value);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <select
          autoFocus
          aria-label={ariaLabel}
          defaultValue={value || ""}
          className={cn(inputCls, className)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => setEditing(false)}
          onChange={async (e) => {
            const parsed = parseInlineSelect(e.target.value, allowed);
            setEditing(false);
            if (!parsed.ok) {
              toast.error(parsed.message);
              return;
            }
            if (isUnchanged(value ?? null, parsed.value)) return;
            await commit(parsed.value);
          }}
        >
          <option value="">{emptyLabel}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const label = options.find((o) => o.value === value)?.label;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => !readOnly && setEditing(true)}
        className={cn(
          shell,
          readOnly && "cursor-default hover:border-transparent hover:bg-transparent",
          !label && "text-muted-foreground",
          className,
        )}
      >
        {label || emptyLabel}
      </button>
      <StatusMark status={status} />
    </div>
  );
}
