import { type FormEvent, useState } from "react";
import { type Item, itemPatchSchema } from "../../../shared/schemas";
import type { ContactVisibility } from "../../../shared/settings";
import { ApiRequestError, api } from "../../lib/api";
import { emptyToNull, type FieldErrors, validate } from "../../lib/forms";
import { useT } from "../../lib/i18n";
import { useSettings } from "../../lib/settings-context";
import { Button } from "../../ui/Button";
import { FormError, TextArea, TextInput, Toggle } from "../../ui/Field";
import { Sheet, SheetBody, SheetFooter } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";

const CHANNELS = ["email", "phone", "whatsapp", "trustedContacts"] as const;

export function PublicPageSheet({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: Item;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("publicPage.title")} description={t("publicPage.desc")}>
      <PublicForm item={item} onClose={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

function PublicForm({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const { settings } = useSettings();
  const defaults = settings.contact.visibility;
  const [title, setTitle] = useState(item.publicTitle ?? "");
  const [message, setMessage] = useState(item.publicMessage ?? "");
  const [reward, setReward] = useState(item.rewardText ?? "");
  const [useDefault, setUseDefault] = useState(item.contactVisibility === null);
  const [vis, setVis] = useState<ContactVisibility>(item.contactVisibility ?? defaults);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      publicTitle: emptyToNull(title),
      publicMessage: emptyToNull(message),
      rewardText: emptyToNull(reward),
      contactVisibility: useDefault ? null : vis,
    };
    const v = validate(itemPatchSchema, body);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setPending(true);
    try {
      await api.patch(`/items/${item.id}`, body);
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
          label={t("publicPage.publicTitle")}
          hint={t("publicPage.publicTitleHint")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.publicTitle}
          maxLength={120}
        />
        <TextArea
          label={t("publicPage.message")}
          hint={t("publicPage.messageHint")}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          error={errors.publicMessage}
          maxLength={600}
        />
        <TextInput
          label={t("publicPage.reward")}
          hint={t("publicPage.rewardHint")}
          value={reward}
          onChange={(e) => setReward(e.target.value)}
          error={errors.rewardText}
          maxLength={200}
        />
        <fieldset className="rounded-control bg-sunken p-3">
          <legend className="px-1 text-subhead font-semibold">{t("publicPage.contact")}</legend>
          <Toggle
            label={t("publicPage.useDefault")}
            description={t("publicPage.useDefaultHint")}
            checked={useDefault}
            onChange={setUseDefault}
          />
          {!useDefault ? (
            <div className="mt-2 flex flex-col border-t border-line pt-2">
              {CHANNELS.map((c) => (
                <Toggle
                  key={c}
                  label={t(`visibility.${c}` as const)}
                  checked={vis[c]}
                  onChange={(on) => setVis({ ...vis, [c]: on })}
                />
              ))}
            </div>
          ) : null}
        </fieldset>
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
