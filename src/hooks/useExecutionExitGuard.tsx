/**
 * GUARD ÚNICO DE SAÍDA DE PASSAGEM (Execução).
 *
 * Todo caminho que ABANDONA uma passagem (prosseguir, voltar, salto manual,
 * entregar minha parte, transferir/reatribuir, drag-and-drop, lote, troca de
 * tipo+etapa, finalizar) usa este hook. Assim o aviso é o mesmo em todo lugar e
 * a ordem transacional é sempre: mutação → sucesso confirmado → fechar run.
 *
 * O guard de "Alterações" (retrabalho) vem SEMPRE antes deste: quem chama já
 * passou por ele, portanto aqui nunca há dois diálogos ao mesmo tempo.
 */
import { useCallback, useRef, useState } from "react";
import ExecutionExitDialog, {
  type ExecutionExitDialogEntry,
} from "@/components/demands/ExecutionExitDialog";
import {
  executionExitDeps,
  loadActiveExecutionRuns,
  loadExecutionRuns,
} from "@/lib/demandExecution";
import type { ExecutionRunWithItems } from "@/lib/demandExecutionRules";
import {
  buildExecutionExitPreflight,
  finalizeBulkExecutionExit,
  performExecutionExit,
  type ExecutionExitChoice,
  type ExecutionExitResult,
  type ExitOutcome,
} from "@/lib/executionExit";

export interface RequestExitParams {
  demandId: string;
  /** Motivo registrado no run fechado. */
  reason: string;
  /** Rótulo da ação no botão de confirmação. */
  actionLabel?: string;
  cardLabel?: string;
  /** Run já carregado (evita reconsulta). */
  run?: ExecutionRunWithItems | null;
  /** A mutação. Deve devolver algo interpretável como sucesso/stale/falha. */
  perform: () => Promise<unknown> | unknown;
  /** "Ver execução" — abrir a aba Execução, quando existir para onde ir. */
  onViewExecution?: () => void;
}

export interface RequestBulkExitParams {
  cards: Array<{ id: string; label?: string }>;
  reason: string;
  actionLabel?: string;
  /** Executa o lote e devolve os ids que REALMENTE se moveram. */
  perform: () => Promise<{ appliedIds: string[] } | null>;
}

type Pending =
  | {
      kind: "single";
      entries: ExecutionExitDialogEntry[];
      run: ExecutionRunWithItems;
      params: RequestExitParams;
      resolve: (r: ExecutionExitResult) => void;
    }
  | {
      kind: "bulk";
      entries: ExecutionExitDialogEntry[];
      runsByCard: Record<string, ExecutionRunWithItems>;
      params: RequestBulkExitParams;
      resolve: (r: { appliedIds: string[]; cancelled?: boolean }) => void;
    };

const CANCELLED: ExecutionExitResult = { outcome: "failure", closed: null, markedAll: false };

export function useExecutionExitGuard() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const runSingle = useCallback(
    async (
      params: RequestExitParams,
      run: ExecutionRunWithItems | null,
      choice: ExecutionExitChoice,
    ): Promise<ExecutionExitResult> =>
      performExecutionExit({
        preflight: buildExecutionExitPreflight(run),
        runId: run?.status === "active" ? run.id : null,
        choice,
        reason: params.reason,
        perform: params.perform,
        deps: executionExitDeps,
      }),
    [],
  );

  /** Uma ação sobre UM card. Devolve o resultado da mutação. */
  const requestExit = useCallback(
    async (params: RequestExitParams): Promise<ExecutionExitResult> => {
      let run = params.run ?? null;
      if (run === null && params.run === undefined) {
        run = (await loadExecutionRuns(params.demandId)).active;
      }
      const preflight = buildExecutionExitPreflight(run);
      if (!preflight || !run) return runSingle(params, run, "keep_pending");

      return new Promise<ExecutionExitResult>((resolve) => {
        setPending({
          kind: "single",
          run,
          params,
          resolve,
          entries: [
            {
              cardId: params.demandId,
              cardLabel: params.cardLabel,
              pending: preflight.pending,
              total: preflight.total,
              pendingTexts: preflight.pendingTexts,
            },
          ],
        });
      });
    },
    [runSingle],
  );

  /** Uma ação sobre VÁRIOS cards: uma confirmação só, fechamento por card aplicado. */
  const requestBulkExit = useCallback(
    async (params: RequestBulkExitParams): Promise<{ appliedIds: string[]; cancelled?: boolean }> => {
      const runsByCard = await loadActiveExecutionRuns(params.cards.map((c) => c.id));
      const entries: ExecutionExitDialogEntry[] = [];
      for (const card of params.cards) {
        const preflight = buildExecutionExitPreflight(runsByCard[card.id] ?? null);
        if (!preflight) continue;
        entries.push({
          cardId: card.id,
          cardLabel: card.label,
          pending: preflight.pending,
          total: preflight.total,
          pendingTexts: preflight.pendingTexts,
        });
      }

      const finish = async (choice: ExecutionExitChoice) => {
        const res = await params.perform();
        const appliedIds = res?.appliedIds ?? [];
        if (appliedIds.length > 0) {
          await finalizeBulkExecutionExit({
            runsByCard,
            appliedCardIds: appliedIds,
            choice,
            reason: params.reason,
            deps: executionExitDeps,
          });
        }
        return { appliedIds };
      };

      if (entries.length === 0) return finish("keep_pending");

      return new Promise((resolve) => {
        setPending({ kind: "bulk", entries, runsByCard, params, resolve });
      });
    },
    [],
  );

  const settle = useCallback(
    async (choice: ExecutionExitChoice) => {
      const current = pending;
      if (!current || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        if (current.kind === "single") {
          const result = await runSingle(current.params, current.run, choice);
          current.resolve(result);
        } else {
          const res = await current.params.perform();
          const appliedIds = res?.appliedIds ?? [];
          if (appliedIds.length > 0) {
            await finalizeBulkExecutionExit({
              runsByCard: current.runsByCard,
              appliedCardIds: appliedIds,
              choice,
              reason: current.params.reason,
              deps: executionExitDeps,
            });
          }
          current.resolve({ appliedIds });
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
        setPending(null);
      }
    },
    [pending, runSingle],
  );

  const cancel = useCallback(() => {
    if (busyRef.current) return;
    const current = pending;
    setPending(null);
    if (!current) return;
    if (current.kind === "single") current.resolve(CANCELLED);
    else current.resolve({ appliedIds: [], cancelled: true });
  }, [pending]);

  const dialog = (
    <ExecutionExitDialog
      open={!!pending}
      busy={busy}
      entries={pending?.entries ?? []}
      actionLabel={pending?.params && "actionLabel" in pending.params ? pending.params.actionLabel : undefined}
      onCancel={cancel}
      onViewExecution={
        pending?.kind === "single" && pending.params.onViewExecution
          ? () => {
              const view = pending.params.onViewExecution;
              cancel();
              view?.();
            }
          : undefined
      }
      onCompleteAll={() => void settle("complete_all")}
      onKeepPending={() => void settle("keep_pending")}
    />
  );

  return { requestExit, requestBulkExit, dialog, exitGuardBusy: busy };
}

export type ExecutionExitGuard = ReturnType<typeof useExecutionExitGuard>;
export type { ExitOutcome };
