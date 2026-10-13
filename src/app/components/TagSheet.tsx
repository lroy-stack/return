import { useState } from "react";
import {
  type ItemSummary,
  NFC_STATUSES,
  type NfcStatus,
  type Tag,
  type TagVerification,
} from "../../shared/schemas";
import { api } from "../lib/api";
import { copyText } from "../lib/clipboard";
import { useResource } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { Link } from "../lib/router";
import { useFormat } from "../lib/settings-context";
import { Badge } from "../ui/Badge";
import { Button, ButtonLink } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { FormError, Select, TextInput } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Sheet, SheetBody } from "../ui/Sheet";
import { errorMessage } from "../ui/States";
import { useToast } from "../ui/Toast";

export function TagStatusBadge({ tag }: { tag: Tag }) {
  const t = useT();
  return tag.status === "revoked" ? (
    <Badge tone="danger">{t("tag.revoked")}</Badge>
  ) : (
    <Badge tone="success">{t("tag.active")}</Badge>
  );
}

export function NfcBadge({ status }: { status: NfcStatus }) {
  const t = useT();
  const tone = status === "verified" ? "success" : status === "none" ? "neutral" : "info";
  return <Badge tone={tone}>{`NFC: ${t(`nfc.${status}` as const)}`}</Badge>;
}

/** Everything you can do with one tag, in a sheet. The parent owns the data and reloads on `onChanged`. */
export function TagSheet({
  tag,
  onClose,
  onChanged,
}: {
  tag: Tag | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  return (
    <Sheet
      open={tag !== null}
      onClose={onClose}
      title={tag ? t("tag.sheetTitle", { label: tag.label }) : ""}
      size="lg"
    >
      {tag ? <TagDetails tag={tag} onClose={onClose} onChanged={onChanged} /> : null}
    </Sheet>
  );
}

function TagDetails({ tag, onClose, onChanged }: { tag: Tag; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const format = useFormat();
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<TagVerification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [confirm, setConfirm] = useState<"revoke" | "replace" | null>(null);
  const [note, setNote] = useState(tag.note ?? "");
  const revoked = tag.status === "revoked";
  const items = useResource<ItemSummary[]>(
    "tag-items",
    async (signal) => (await api.get<{ items: ItemSummary[] }>("/items", signal)).items,
  );

  const patch = async (body: { itemId?: string | null; note?: string | null; nfcStatus?: NfcStatus }) => {
    setError(null);
    try {
      await api.patch(`/tags/${tag.id}`, body);
      toast(t("common.saved"));
      onChanged();
    } catch (e) {
      setError(errorMessage(e, t));
    }
  };

  const verify = async () => {
    setVerifying(true);
    setError(null);
    try {
      setVerification(await api.get<TagVerification>(`/tags/${tag.id}/verify`));
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setVerifying(false);
    }
  };

  const copy = async () => {
    const ok = await copyText(tag.url);
    toast(ok ? t("tag.copied") : t("tag.copyFailed"), ok ? "success" : "error");
  };

  return (
    <>
      <SheetBody>
        <div className="flex flex-wrap items-center gap-2">
          <TagStatusBadge tag={tag} />
          <NfcBadge status={tag.nfcStatus} />
          {tag.lastSeenAt ? (
            <span className="text-sm text-muted">
              {t("tag.lastSeen", { when: format.relative(tag.lastSeenAt) })}
            </span>
          ) : (
            <span className="text-sm text-muted">{t("tag.neverSeen")}</span>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-[12rem_1fr]">
          <div className="flex flex-col items-center gap-2">
            <img
              src={`/api/tags/${tag.id}/qr.svg`}
              alt={t("tag.qrAlt", { label: tag.label })}
              width={192}
              height={192}
              className="size-48 rounded-xl border border-line bg-white p-2"
            />
            <ButtonLink
              to={`/api/tags/${tag.id}/qr.svg`}
              download={`${tag.label}.svg`}
              icon="download"
              size="sm"
            >
              {t("tag.downloadQr")}
            </ButtonLink>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium" id="tag-url-l">
                {t("tag.url")}
              </span>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={tag.url}
                  aria-labelledby="tag-url-l"
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-sunken px-3 text-sm"
                />
                <Button icon="copy" onClick={copy}>
                  {t("tag.copy")}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Select
                label={t("tag.assignedTo")}
                value={tag.itemId ?? ""}
                disabled={revoked || items.state.status !== "ready"}
                onChange={(e) => patch({ itemId: e.target.value || null })}
                hint={
                  tag.itemId ? (
                    <Link
                      to={`/items/${tag.itemId}`}
                      onClick={onClose}
                      className="font-medium text-primary-text underline"
                    >
                      {t("tag.openItem")}
                    </Link>
                  ) : (
                    t("tag.unassignedHint")
                  )
                }
              >
                <option value="">{t("tag.unassigned")}</option>
                {tag.itemId &&
                items.state.status === "ready" &&
                !items.state.data.some((i) => i.id === tag.itemId) ? (
                  <option value={tag.itemId}>{tag.itemName ?? tag.itemId}</option>
                ) : null}
                {items.state.status === "ready"
                  ? items.state.data.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))
                  : null}
              </Select>
            </div>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void patch({ note: note.trim() || null });
              }}
            >
              <TextInput
                className="flex-1"
                label={t("tag.note")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
              <Button type="submit" disabled={note.trim() === (tag.note ?? "")}>
                {t("common.save")}
              </Button>
            </form>
          </div>
        </div>

        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">NFC</legend>
          <Select
            label={t("tag.nfcStatus")}
            value={tag.nfcStatus}
            onChange={(e) => patch({ nfcStatus: e.target.value as NfcStatus })}
            disabled={revoked}
          >
            {NFC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`nfc.${s}` as const)}
              </option>
            ))}
          </Select>
          <p className="mt-2 flex gap-2 text-sm text-muted">
            <Icon name="info" className="mt-0.5 size-4" />
            {t("nfc.help")}
          </p>
        </fieldset>

        <div aria-live="polite">
          {verification ? (
            verification.ok ? (
              <p className="flex items-center gap-2 rounded-xl bg-accent-tint px-3 py-2 font-medium text-accent-text">
                <Icon name="check" /> {t("tag.verifyOk")}
              </p>
            ) : (
              <div className="rounded-xl border border-lost/40 bg-lost-tint px-3 py-2 text-lost">
                <p className="font-semibold">{t("tag.verifyProblems")}</p>
                <ul className="list-disc pl-5">
                  {verification.problems.map((p) => (
                    <li key={p}>{problemText(p, t)}</li>
                  ))}
                </ul>
              </div>
            )
          ) : null}
        </div>
        <FormError message={error} />

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button icon="check" loading={verifying} onClick={verify}>
            {t("tag.verify")}
          </Button>
          <ButtonLink to={`/tags/print?ids=${tag.id}`} icon="print">
            {t("tag.printCard")}
          </ButtonLink>
          {!revoked ? (
            <>
              <Button icon="refresh" onClick={() => setConfirm("replace")}>
                {t("tag.replace")}
              </Button>
              <Button variant="danger" icon="close" onClick={() => setConfirm("revoke")}>
                {t("tag.revoke")}
              </Button>
            </>
          ) : null}
        </div>
      </SheetBody>

      <ConfirmDialog
        open={confirm === "revoke"}
        title={t("tag.revokeTitle")}
        message={t("tag.revokeBody")}
        confirmLabel={t("tag.revoke")}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await api.post(`/tags/${tag.id}/revoke`);
          toast(t("tag.revokedToast"));
          onChanged();
        }}
      />
      <ConfirmDialog
        open={confirm === "replace"}
        title={t("tag.replaceTitle")}
        message={t("tag.replaceBody")}
        confirmLabel={t("tag.replace")}
        tone="primary"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await api.post(`/tags/${tag.id}/replace`);
          toast(t("tag.replacedToast"));
          onChanged();
        }}
      />
    </>
  );
}

function problemText(code: string, t: ReturnType<typeof useT>): string {
  switch (code) {
    case "revoked":
      return t("verify.revoked");
    case "unassigned":
      return t("verify.unassigned");
    case "item_archived":
      return t("verify.item_archived");
    case "no_contact_method":
      return t("verify.no_contact_method");
    default:
      return code;
  }
}
