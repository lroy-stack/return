import { type FormEvent, useState } from "react";
import { type TrustedContact, trustedContactInputSchema } from "../../../shared/schemas";
import { ApiRequestError, api } from "../../lib/api";
import { emptyToNull, type FieldErrors, validate } from "../../lib/forms";
import { useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { unwrapList } from "../../lib/lists";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { FormError, TextInput, Toggle } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { Sheet, SheetBody, SheetFooter } from "../../ui/Sheet";
import { ErrorState, LoadingBlock } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { SectionCard, type SectionProps } from "./shared";

const CHANNELS = ["email", "phone", "whatsapp", "trustedContacts"] as const;

export function ContactSection({ draft, update, errors }: SectionProps) {
  const t = useT();
  const c = draft.contact;
  return (
    <div className="flex flex-col gap-5">
      <SectionCard title={t("settings.contact")} description={t("settings.contactDesc")}>
        <TextInput
          label={t("contact.email")}
          type="email"
          value={c.email ?? ""}
          onChange={(e) =>
            update((d) => {
              d.contact.email = e.target.value.trim() || null;
            })
          }
          error={errors["contact.email"]}
          autoComplete="email"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label={t("contact.phone")}
            type="tel"
            value={c.phone ?? ""}
            onChange={(e) =>
              update((d) => {
                d.contact.phone = e.target.value.trim() || null;
              })
            }
            error={errors["contact.phone"]}
            autoComplete="tel"
          />
          <TextInput
            label={t("contact.whatsapp")}
            type="tel"
            value={c.whatsapp ?? ""}
            onChange={(e) =>
              update((d) => {
                d.contact.whatsapp = e.target.value.trim() || null;
              })
            }
            error={errors["contact.whatsapp"]}
          />
        </div>
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{t("contact.visibility")}</legend>
          <p className="mb-2 text-sm text-muted">{t("contact.visibilityHint")}</p>
          {CHANNELS.map((ch) => (
            <Toggle
              key={ch}
              label={t(`visibility.${ch}` as const)}
              checked={c.visibility[ch]}
              onChange={(on) =>
                update((d) => {
                  d.contact.visibility[ch] = on;
                })
              }
            />
          ))}
        </fieldset>
      </SectionCard>
      <TrustedContacts />
    </div>
  );
}

function TrustedContacts() {
  const t = useT();
  const res = useResource<TrustedContact[]>("contacts", async (signal) =>
    unwrapList<TrustedContact>(
      await api.get<TrustedContact[] | { contacts: TrustedContact[] }>("/contacts", signal),
      "contacts",
    ),
  );
  const [editing, setEditing] = useState<TrustedContact | "new" | null>(null);
  const [removing, setRemoving] = useState<TrustedContact | null>(null);

  return (
    <SectionCard title={t("contacts.title")} description={t("contacts.desc")}>
      {res.state.status === "loading" ? <LoadingBlock rows={2} /> : null}
      {res.state.status === "error" ? (
        <ErrorState error={res.state.error} onRetry={() => res.reload()} />
      ) : null}
      {res.state.status === "ready" ? (
        res.state.data.length === 0 ? (
          <p className="text-muted">{t("contacts.empty")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {res.state.data.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
                <Icon name="user" className="mt-1 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {c.name}
                    {c.relationship ? (
                      <span className="font-normal text-muted"> · {c.relationship}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {[c.email, c.phone].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {c.notify ? <Badge tone="info">{t("contacts.notify")}</Badge> : null}
                    {c.showPublic ? <Badge tone="success">{t("contacts.showPublic")}</Badge> : null}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon="edit"
                  aria-label={t("contacts.edit", { name: c.name })}
                  onClick={() => setEditing(c)}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  icon="trash"
                  aria-label={t("contacts.remove", { name: c.name })}
                  onClick={() => setRemoving(c)}
                />
              </li>
            ))}
          </ul>
        )
      ) : null}
      <div>
        <Button icon="plus" onClick={() => setEditing("new")}>
          {t("contacts.add")}
        </Button>
      </div>
      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? t("contacts.add") : t("contacts.editTitle")}
        description={t("contacts.explain")}
      >
        {editing ? (
          <ContactForm
            contact={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
            onSaved={() => res.reload(true)}
          />
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={removing !== null}
        title={t("contacts.removeTitle")}
        message={t("contacts.removeBody", { name: removing?.name ?? "" })}
        confirmLabel={t("common.delete")}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await api.delete(`/contacts/${removing.id}`);
          res.reload(true);
        }}
      />
    </SectionCard>
  );
}

function ContactForm({
  contact,
  onClose,
  onSaved,
}: {
  contact: TrustedContact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [name, setName] = useState(contact?.name ?? "");
  const [relationship, setRelationship] = useState(contact?.relationship ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [notify, setNotify] = useState(contact?.notify ?? false);
  const [showPublic, setShowPublic] = useState(contact?.showPublic ?? false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name,
      relationship: emptyToNull(relationship),
      email: emptyToNull(email),
      phone: emptyToNull(phone),
      notify,
      showPublic,
    };
    const v = validate(trustedContactInputSchema, body);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setPending(true);
    try {
      if (contact) await api.patch(`/contacts/${contact.id}`, body);
      else await api.post("/contacts", body);
      toast(t("common.saved"));
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      } else setFormError(t("error.generic"));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <TextInput
          label={t("contacts.name")}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name ? t("contacts.nameRequired") : undefined}
          maxLength={80}
          autoFocus
        />
        <TextInput
          label={t("contacts.relationship")}
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          error={errors.relationship}
          maxLength={80}
        />
        <TextInput
          label={t("contact.email")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <TextInput
          label={t("contact.phone")}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
        />
        <Toggle
          label={t("contacts.notifyLabel")}
          description={t("contacts.notifyHint")}
          checked={notify}
          onChange={setNotify}
        />
        {errors.notify ? (
          <p className="text-sm font-medium text-danger">{t("contacts.notifyNeedsEmail")}</p>
        ) : null}
        <Toggle
          label={t("contacts.showPublicLabel")}
          description={t("contacts.showPublicHint")}
          checked={showPublic}
          onChange={setShowPublic}
        />
        <FormError message={formError} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={pending}>
          {t("common.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}
