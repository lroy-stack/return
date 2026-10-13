import { type FormEvent, useRef, useState } from "react";
import { isApproximate, locationInputSchema, type ResolvedPlace } from "../../../shared/schemas";
import { UseMyLocation } from "../../components/UseMyLocation";
import { ApiRequestError, api } from "../../lib/api";
import { emptyToNull } from "../../lib/forms";
import type { Fix } from "../../lib/geolocation";
import { useT } from "../../lib/i18n";
import { reverseLookup } from "../../lib/places";
import { Button } from "../../ui/Button";
import { FormError, TextInput } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { PlaceLabel } from "../../ui/Place";
import { Sheet, SheetBody, SheetFooter, useSheetGuard } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";

/**
 * "Share my location" in a conversation. The position is read on a tap, shown back as a preview, and sent only when
 * the owner presses Share: that press is the consent. The finder is not told about anything else.
 */
export function ShareLocationSheet({
  open,
  conversationId,
  onClose,
  onShared,
}: {
  open: boolean;
  conversationId: string;
  onClose: () => void;
  onShared: () => void;
}) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("share.title")} description={t("share.desc")}>
      <ShareForm conversationId={conversationId} onClose={onClose} onShared={onShared} />
    </Sheet>
  );
}

function ShareForm({
  conversationId,
  onClose,
  onShared,
}: {
  conversationId: string;
  onClose: () => void;
  onShared: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [fix, setFix] = useState<Fix | null>(null);
  const [place, setPlace] = useState<ResolvedPlace | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lookup = useRef(0);
  const cancel = useSheetGuard(note !== "");

  const onFix = (found: Fix) => {
    const run = ++lookup.current;
    setFix(found);
    setPlace(null);
    void reverseLookup(found).then((p) => {
      if (run === lookup.current) setPlace(p);
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fix) return;
    const body = {
      source: "gps" as const,
      lat: fix.lat,
      lng: fix.lng,
      accuracyM: fix.accuracyM,
      label: emptyToNull(note),
    };
    const parsed = locationInputSchema.safeParse(body);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? t("error.generic"));
    setError(null);
    setPending(true);
    try {
      await api.post(`/conversations/${conversationId}/locations`, parsed.data);
      toast(t("share.sent"));
      onShared();
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "conversation_closed") setError(t("share.closed"));
      else if (err instanceof ApiRequestError && err.code === "conversation_cap") setError(t("share.cap"));
      else setError(err instanceof ApiRequestError ? err.message : t("error.generic"));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <UseMyLocation onFix={onFix} label={fix ? t("geo.again") : t("geo.use")} />
        {fix ? (
          <div className="flex flex-col gap-3 rounded-control bg-primary-tint/60 p-3">
            <p className="text-footnote font-semibold text-muted">{t("share.preview")}</p>
            <PlaceLabel place={place} lat={fix.lat} lng={fix.lng} accuracyM={fix.accuracyM} />
            {isApproximate(fix.accuracyM) ? (
              <p className="flex items-start gap-1.5 text-subhead text-warning">
                <Icon name="info" className="mt-0.5 size-4 shrink-0" />
                {t("share.approximate")}
              </p>
            ) : null}
          </div>
        ) : null}
        {fix ? (
          <>
            <TextInput
              label={t("share.note")}
              hint={t("share.noteHint")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
            />
            <p className="text-subhead text-muted">{t("share.consent")}</p>
          </>
        ) : null}
        <FormError message={error} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={cancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" icon="pin" loading={pending} disabled={!fix}>
          {t("share.send")}
        </Button>
      </SheetFooter>
    </form>
  );
}
