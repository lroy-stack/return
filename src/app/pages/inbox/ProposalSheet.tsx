import { type FormEvent, useState } from "react";
import { PROPOSAL_KINDS, type ProposalKind, proposalInputSchema } from "../../../shared/schemas";
import { ApiRequestError, api } from "../../lib/api";
import { emptyToNull, type FieldErrors, validate } from "../../lib/forms";
import { useT } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { FormError, Select, TextArea, TextInput } from "../../ui/Field";
import { Sheet, SheetBody, SheetFooter } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";

export function ProposalSheet({
  open,
  conversationId,
  onClose,
  onSaved,
}: {
  open: boolean;
  conversationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("proposal.new")} description={t("proposal.desc")}>
      <ProposalForm conversationId={conversationId} onClose={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

function ProposalForm({
  conversationId,
  onClose,
  onSaved,
}: {
  conversationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [kind, setKind] = useState<ProposalKind>("meeting_point");
  const [place, setPlace] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [meetAt, setMeetAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const latN = lat.trim() === "" ? null : Number(lat.replace(",", "."));
    const lngN = lng.trim() === "" ? null : Number(lng.replace(",", "."));
    if ((latN !== null && Number.isNaN(latN)) || (lngN !== null && Number.isNaN(lngN))) {
      setErrors({ lat: t("proposal.coordsInvalid") });
      return;
    }
    const body = {
      kind,
      place,
      lat: latN,
      lng: lngN,
      meetAt: meetAt || null,
      instructions: emptyToNull(instructions),
    };
    const v = validate(proposalInputSchema, body);
    if (!v.ok) {
      setErrors(v.errors);
      if (v.errors[""]) setFormError(t("proposal.coordsPair"));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api.post(`/conversations/${conversationId}/proposals`, body);
      toast(t("proposal.sent"));
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
        <Select
          label={t("proposal.kind")}
          value={kind}
          onChange={(e) => setKind(e.target.value as ProposalKind)}
        >
          {PROPOSAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`proposal.kind.${k}` as const)}
            </option>
          ))}
        </Select>
        <TextInput
          label={t("proposal.place")}
          required
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          error={errors.place ? t("proposal.placeRequired") : undefined}
          maxLength={300}
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label={t("proposal.lat")}
            inputMode="decimal"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            error={errors.lat}
            hint={t("proposal.coordsHint")}
          />
          <TextInput
            label={t("proposal.lng")}
            inputMode="decimal"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            error={errors.lng}
          />
        </div>
        <TextInput
          label={t("proposal.meetAt")}
          type="datetime-local"
          value={meetAt}
          onChange={(e) => setMeetAt(e.target.value)}
          error={errors.meetAt}
          hint={t("proposal.meetAtHint")}
        />
        <TextArea
          label={t("proposal.instructions")}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          error={errors.instructions}
          maxLength={1000}
        />
        <FormError message={formError} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" icon="send" loading={pending}>
          {t("proposal.send")}
        </Button>
      </SheetFooter>
    </form>
  );
}
