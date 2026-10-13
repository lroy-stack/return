import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, type Settings } from "../../shared/settings";
import { ApiRequestError, api } from "./api";
import { createFormatter, type Formatter } from "./format";
import { browserLanguage, I18nProvider, toPanelLanguage } from "./i18n";

type State =
  | { status: "loading" }
  | { status: "ready"; settings: Settings }
  | { status: "error"; error: ApiRequestError };

interface SettingsApi {
  state: State;
  /** Settings to render with: loaded, or defaults while loading/failed. */
  settings: Settings;
  format: Formatter;
  reload: () => void;
  save: (next: Settings) => Promise<Settings>;
  /** Unsaved edits live here so they survive moving between screens. */
  draft: Settings | null;
  setDraft: (next: Settings | null) => void;
}

const SettingsContext = createContext<SettingsApi | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const [draft, setDraft] = useState<Settings | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce re-triggers the load
  useEffect(() => {
    let cancelled = false;
    api
      .get<Settings>("/settings")
      .then((settings) => !cancelled && setState({ status: "ready", settings }))
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          error: e instanceof ApiRequestError ? e : new ApiRequestError(0, "unknown", String(e)),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const save = useCallback(async (next: Settings) => {
    const saved = await api.put<Settings>("/settings", next);
    setState({ status: "ready", settings: saved });
    setDraft(null);
    return saved;
  }, []);

  const value = useMemo<SettingsApi>(() => {
    const settings = state.status === "ready" ? state.settings : DEFAULT_SETTINGS;
    return {
      state,
      settings,
      format: createFormatter(settings.identity.locale, settings.identity.timezone),
      reload: () => {
        setState({ status: "loading" });
        setNonce((n) => n + 1);
      },
      save,
      draft,
      setDraft,
    };
  }, [state, save, draft]);

  const lang =
    state.status === "ready" ? toPanelLanguage(state.settings.identity.panelLanguage) : browserLanguage();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <SettingsContext.Provider value={value}>
      <I18nProvider lang={lang}>{children}</I18nProvider>
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}

export const useFormat = (): Formatter => useSettings().format;
