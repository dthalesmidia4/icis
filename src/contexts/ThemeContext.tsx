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
            mode: (savedSettings.mode as ThemeMode) || 'system',
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

  // Apply theme mode
  useEffect(() => {
    const applyThemeMode = () => {
      const root = document.documentElement;
      let effectiveMode: 'light' | 'dark';

      if (settings.mode === 'system') {
        effectiveMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        effectiveMode = settings.mode;
      }

      root.classList.remove('light', 'dark');
      root.classList.add(effectiveMode);
    };

    applyThemeMode();

    // Listen for system theme changes when in system mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (settings.mode === 'system') {
        applyThemeMode();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
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
