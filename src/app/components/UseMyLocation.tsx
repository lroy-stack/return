import { useRef, useState } from "react";
import type { MessageKey } from "../lib/dict";
import { type Fix, GeoError, type GeoErrorKind, geoPlatform, locate } from "../lib/geolocation";
import { useT } from "../lib/i18n";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

type State =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "done"; refining: boolean }
  | { status: "error"; kind: GeoErrorKind };

const ERROR_TEXT: Record<Exclude<GeoErrorKind, "denied">, MessageKey> = {
  unsupported: "geo.unsupported",
  unavailable: "geo.unavailable",
  timeout: "geo.timeout",
};

const DENIED_TEXT: Record<ReturnType<typeof geoPlatform>, MessageKey> = {
  ios: "geo.denied.ios",
  android: "geo.denied.android",
  other: "geo.denied.other",
};

/**
 * "Use my location" button with its own progress and error text. The geolocation request starts on the click (a user
 * gesture, which iOS and Chrome require for the permission prompt). `onFix` is called with the quick fix and again
 * with the refined one, so a form can fill in at once and improve. Failures say how to fix them on this platform.
 */
export function UseMyLocation({
  onFix,
  label,
  disabled,
}: {
  onFix: (fix: Fix, stage: "coarse" | "fine") => void;
  label?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<State>({ status: "idle" });
  const running = useRef(false);

  const start = async () => {
    if (running.current) return;
    running.current = true;
    setState({ status: "locating" });
    try {
      await locate((fix, stage) => {
        onFix(fix, stage);
        setState({ status: "done", refining: stage === "coarse" });
      });
      setState({ status: "done", refining: false });
    } catch (e) {
      setState({ status: "error", kind: e instanceof GeoError ? e.kind : "unavailable" });
    } finally {
      running.current = false;
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        icon="pin"
        loading={state.status === "locating"}
        disabled={disabled}
        onClick={() => void start()}
      >
        {label ?? t("geo.use")}
      </Button>
      <div aria-live="polite" className="w-full empty:hidden">
        {state.status === "locating" ? <p className="text-subhead text-muted">{t("geo.locating")}</p> : null}
        {state.status === "done" ? (
          <p className="flex items-start gap-1.5 text-subhead font-medium text-accent-text">
            <Icon name="check" className="mt-0.5 size-4 shrink-0" />
            {state.refining ? t("geo.refining") : t("geo.done")}
          </p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="flex items-start gap-1.5 text-subhead font-medium text-danger">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            {t(state.kind === "denied" ? DENIED_TEXT[geoPlatform()] : ERROR_TEXT[state.kind])}
          </p>
        ) : null}
      </div>
    </div>
  );
}
