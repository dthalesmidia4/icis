import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type ThemeMode = 'light' | 'dark' | 'system';
export type PrimaryColor = 'purple' | 'blue' | 'pink' | 'red' | 'brown';

interface ThemeSettings {
  mode: ThemeMode;
  primaryColor: PrimaryColor;
  companyName: string;
  logoUrl: string | null;
}

interface ThemeContextType {
  settings: ThemeSettings;
  updateSettings: (newSettings: Partial<ThemeSettings>) => Promise<void>;
  isLoading: boolean;
}

const defaultSettings: ThemeSettings = {
  mode: 'light',
  primaryColor: 'purple',
  companyName: '',
  logoUrl: null,
};

const ThemeContext = createContext<ThemeContextType>({
  settings: defaultSettings,
  updateSettings: async () => {},
  isLoading: true,
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ThemeSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from database
  useEffect(() => {
    const loadSettings = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('settings')
          .eq('id', user.id)
          .single();

        if (profile?.settings) {
          const savedSettings = profile.settings as Record<string, unknown>;
          setSettings({
            mode: 'light',
            primaryColor: (savedSettings.primaryColor as PrimaryColor) || 'purple',
            companyName: (savedSettings.companyName as string) || '',
            logoUrl: (savedSettings.logoUrl as string) || null,
          });
        }
      } catch (error) {
        console.error('Error loading theme settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [user]);

  // Respect dev theme override from localStorage; default to light. Reactive across tabs/components.
  useEffect(() => {
    const apply = () => {
      const root = document.documentElement;
      const saved = localStorage.getItem("dev-theme-mode");
      if (saved === "dark") {
        root.classList.remove("light");
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
        root.classList.add("light");
      }
    };
    apply();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "dev-theme-mode") apply();
    };
    const onCustom = () => apply();
    window.addEventListener("storage", onStorage);
    window.addEventListener("dev-theme-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("dev-theme-change", onCustom);
    };
  }, [settings.mode]);

  // Apply primary color
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-primary-color', settings.primaryColor);
  }, [settings.primaryColor]);

  const updateSettings = async (newSettings: Partial<ThemeSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);

    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ settings: updatedSettings })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error saving theme settings:', error);
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ settings, updateSettings, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
};
