import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEFAULT_SETTINGS, type Settings } from "../../shared/settings";
import { ApiRequestError, api } from "./api";
import { createFormatter, type Formatter } from "./format";
import { browserLanguage, I18nProvider, type PanelLanguage, toPanelLanguage } from "./i18n";
import { applyPatch, isEmptyPatch, settingsDiff } from "./settings-patch";

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
  /**
   * Instant apply (toggles, selects): shows the change at once, sends only what changed, and rolls it back when the
   * server refuses. Rejects with the API error after rolling back; the caller reports it.
   */
  patch: (mutate: (draft: Settings) => void) => Promise<void>;
  /** Unsaved edits live here so they survive moving between screens. */
  draft: Settings | null;
  setDraft: (next: Settings | null) => void;
}

const SettingsContext = createContext<SettingsApi | null>(null);

const LANG_KEY = "return.lang";

/** The panel language last seen on this device, so the first paint and an offline start speak it too. */
function cachedLanguage(): PanelLanguage | null {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    return v === "en" || v === "es" ? v : null;
  } catch {
    return null;
  }
}

interface Pending {
  id: number;
  doc: Record<string, unknown>;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const [draft, setDraft] = useState<Settings | null>(null);
  // Instant changes that were shown but not yet confirmed by the server, oldest first.
  const [pending, setPending] = useState<Pending[]>([]);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const nextId = useRef(1);
  const shown = useRef<Settings>(DEFAULT_SETTINGS);

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

  const patch = useCallback(async (mutate: (draft: Settings) => void) => {
    const before = shown.current;
    const after = structuredClone(before);
    mutate(after);
    const doc = settingsDiff(before, after);
    if (isEmptyPatch(doc)) return;
    const undo = settingsDiff(after, before);
    shown.current = after;
    const id = nextId.current++;
    setPending((p) => [...p, { id, doc }]);
    // Unsaved text edits live in the draft: it shows the change too, and drops it again if the server refuses.
    setDraft((d) => (d ? applyPatch(d, doc) : d));
    const run = chain.current.then(async () => {
      try {
        const saved = await api.patch<Settings>("/settings", doc);
        setState({ status: "ready", settings: saved });
        setPending((p) => p.filter((x) => x.id !== id));
      } catch (e) {
        setPending((p) => p.filter((x) => x.id !== id));
        setDraft((d) => (d ? applyPatch(d, undo) : d));
        throw e;
      }
    });
    chain.current = run.catch(() => undefined);
    return run;
  }, []);

  const value = useMemo<SettingsApi>(() => {
    const confirmed = state.status === "ready" ? state.settings : DEFAULT_SETTINGS;
    const settings = pending.reduce((acc, p) => applyPatch(acc, p.doc), confirmed);
    shown.current = settings;
    return {
      state,
      settings,
      format: createFormatter(settings.identity.locale, settings.identity.timezone),
      reload: () => {
        setState({ status: "loading" });
        setNonce((n) => n + 1);
      },
      save,
      patch,
      draft,
      setDraft,
    };
  }, [state, pending, save, patch, draft]);

  const lang =
    state.status === "ready"
      ? toPanelLanguage(value.settings.identity.panelLanguage)
      : (cachedLanguage() ?? browserLanguage());
  useEffect(() => {
    if (state.status !== "ready") return;
    try {
      window.localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Not persisted: the next offline start falls back to the browser language.
    }
  }, [state.status, lang]);
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
