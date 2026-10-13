import { useState } from "react";
import { useMediaQuery } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { dismissInstallHint, installHintDismissed, promptInstall, useInstallMode } from "../lib/install";
import { useLocation } from "../lib/router";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet, SheetBody, SheetFooter } from "../ui/Sheet";
import { useToast } from "../ui/Toast";

const IOS_STEPS = [
  "install.ios.step1",
  "install.ios.step2",
  "install.ios.step3",
  "install.ios.step4",
] as const;

/** Add to Home Screen, step by step (iOS and iPadOS have no install prompt). */
export function IosInstallSteps() {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-subhead text-muted">{t("install.ios.intro")}</p>
      <ol className="flex list-none flex-col gap-2.5">
        {IOS_STEPS.map((key, i) => (
          <li key={key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-tint text-footnote font-bold text-primary-text"
            >
              {i + 1}
            </span>
            <span className="text-body">{t(key)}</span>
          </li>
        ))}
      </ol>
      <p className="text-subhead text-muted">{t("install.ios.done")}</p>
    </div>
  );
}

export function IosInstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("install.ios.title")} placement="compact">
      <SheetBody>
        <IosInstallSteps />
      </SheetBody>
      <SheetFooter>
        <Button variant="primary" onClick={onClose}>
          {t("install.ios.gotIt")}
        </Button>
      </SheetFooter>
    </Sheet>
  );
}

/** Runs the browser's install dialog from a click and reports the result. */
function useInstallPrompt() {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "accepted") toast(t("install.accepted"));
    } catch {
      toast(t("install.failed"), "error");
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Settings > Install app. Nothing to do inside the installed app, so it only says so. */
export function InstallPanel() {
  const t = useT();
  const mode = useInstallMode();
  const { busy, run } = useInstallPrompt();

  if (mode === "installed")
    return (
      <p className="flex items-start gap-2 rounded-control bg-accent-tint px-3 py-2 font-medium text-accent-text">
        <Icon name="check" className="mt-0.5 shrink-0" />
        {t("install.installed")}
      </p>
    );
  if (mode === "prompt")
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-subhead text-muted">{t("install.promptBody")}</p>
        <Button variant="primary" icon="download" loading={busy} onClick={() => void run()}>
          {t("install.button")}
        </Button>
      </div>
    );
  if (mode === "ios") return <IosInstallSteps />;
  return <p className="text-subhead text-muted">{t("install.manual")}</p>;
}

/**
 * One-time, dismissible hint on touch devices that are not running the installed app. It is a banner in the
 * content flow (not floating chrome) so it never covers the tab bar or the composer.
 */
export function InstallHint() {
  const t = useT();
  const mode = useInstallMode();
  const touch = useMediaQuery("(pointer: coarse)");
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(installHintDismissed);
  const [guide, setGuide] = useState(false);
  const { busy, run } = useInstallPrompt();

  const close = () => {
    dismissInstallHint();
    setDismissed(true);
  };
  const offered = mode === "prompt" || mode === "ios";
  const visible = touch && offered && !dismissed && pathname !== "/settings/install";
  if (!visible && !guide) return null;

  return (
    <>
      {visible ? (
        <section
          aria-label={t("install.hintTitle")}
          className="mb-5 flex items-start gap-3 rounded-card bg-primary-tint px-4 py-3 text-fg ring-1 ring-primary/20"
        >
          <Icon name="phone" className="mt-0.5 size-5 shrink-0 text-primary-text" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("install.hintTitle")}</p>
            <p className="text-subhead">{t("install.hintBody")}</p>
            <div className="mt-2">
              {mode === "prompt" ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon="download"
                  loading={busy}
                  onClick={() => {
                    close();
                    void run();
                  }}
                >
                  {t("install.button")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    close();
                    setGuide(true);
                  }}
                >
                  {t("install.howTo")}
                </Button>
              )}
            </div>
          </div>
          <IconButton icon="close" size="sm" label={t("install.hintDismiss")} onClick={close} />
        </section>
      ) : null}
      <IosInstallSheet open={guide} onClose={() => setGuide(false)} />
    </>
  );
}
