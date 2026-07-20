import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";

type Values = Record<string, string>;

interface Ctx {
  values: Values;
  setValue: (key: string, value: string | null | undefined) => void;
}

const BreadcrumbOverrideContext = createContext<Ctx>({
  values: {},
  setValue: () => {},
});

export const BreadcrumbOverrideProvider = ({ children }: { children: ReactNode }) => {
  const [values, setValues] = useState<Values>({});

  const setValue = useCallback((key: string, value: string | null | undefined) => {
    setValues((prev) => {
      if (!value) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  }, []);

  const ctx = useMemo(() => ({ values, setValue }), [values, setValue]);

  return (
    <BreadcrumbOverrideContext.Provider value={ctx}>
      {children}
    </BreadcrumbOverrideContext.Provider>
  );
};

export const useBreadcrumbOverrideValues = () => useContext(BreadcrumbOverrideContext).values;

/** Register a token replacement for the current page. Cleans up on unmount. */
export const useBreadcrumbOverride = (key: string, value: string | null | undefined) => {
  const { setValue } = useContext(BreadcrumbOverrideContext);
  useEffect(() => {
    setValue(key, value);
    return () => setValue(key, null);
  }, [key, value, setValue]);
};
