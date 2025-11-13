import { useState, useEffect } from 'react';

interface PlanGenerationState {
  companyId: string;
  strategyId: string;
  tenantId: string;
  timestamp: number;
  inProgress: boolean;
}

const STORAGE_KEY = 'plan_generation_state';
const STATE_EXPIRY = 24 * 60 * 60 * 1000; // 24 horas

export function useLocalPlanState() {
  const [savedState, setSavedState] = useState<PlanGenerationState | null>(null);

  useEffect(() => {
    // Carregar estado salvo ao montar
    loadSavedState();
  }, []);

  const loadSavedState = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;

      const state: PlanGenerationState = JSON.parse(saved);
      
      // Verificar se o estado expirou
      if (Date.now() - state.timestamp > STATE_EXPIRY) {
        clearState();
        return null;
      }

      setSavedState(state);
      return state;
    } catch (error) {
      console.error('Erro ao carregar estado salvo:', error);
      return null;
    }
  };

  const saveState = (companyId: string, strategyId: string, tenantId: string) => {
    try {
      const state: PlanGenerationState = {
        companyId,
        strategyId,
        tenantId,
        timestamp: Date.now(),
        inProgress: true
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSavedState(state);
    } catch (error) {
      console.error('Erro ao salvar estado:', error);
    }
  };

  const clearState = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setSavedState(null);
    } catch (error) {
      console.error('Erro ao limpar estado:', error);
    }
  };

  const updateProgress = (inProgress: boolean) => {
    if (savedState) {
      const updatedState = { ...savedState, inProgress };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedState));
      setSavedState(updatedState);
    }
  };

  return {
    savedState,
    saveState,
    clearState,
    updateProgress,
    hasState: !!savedState
  };
}
