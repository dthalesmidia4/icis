import { useState, useEffect, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Se é sessão temporária (não marcou "manter conectado"), limpar ao fechar aba
    const handleBeforeUnload = () => {
      if (sessionStorage.getItem('tempSession') === 'true') {
        // Limpar dados de auth do localStorage para que ao reabrir não tenha sessão
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] State change:', event);
        
        if (event === 'TOKEN_REFRESHED') {
          console.log('[Auth] Token refreshed successfully');
        }
        
        if (event === 'SIGNED_OUT') {
          console.log('[Auth] User signed out, clearing local state');
          localStorage.removeItem('taskcard-collapsed-sections');
          sessionStorage.removeItem('tempSession');
        }

        if (event === 'SIGNED_IN') {
          console.log('[Auth] User signed in');
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[Auth] Initial session check:', session ? 'Session found' : 'No session');
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName
        }
      }
    });
    
    return { error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    try {
      // Limpar localStorage e sessionStorage primeiro
      localStorage.clear();
      sessionStorage.clear();
      
      // Tentar signOut no servidor (pode falhar se sessão já expirou)
      await supabase.auth.signOut();
    } catch (error) {
      console.log('[Auth] SignOut error (session may have expired):', error);
    }
    
    // Forçar limpeza do estado local independente do resultado
    setUser(null);
    setSession(null);
    
    // Forçar reload para garantir estado limpo
    window.location.href = '/auth';
    
    return { error: null };
  }, []);

  // Return a stable object reference using useMemo
  return useMemo(() => ({
    user,
    session,
    isLoading,
    signUp,
    signIn,
    signOut
  }), [user, session, isLoading, signUp, signIn, signOut]);
};
