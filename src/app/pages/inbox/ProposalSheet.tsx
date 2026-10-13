import { type FormEvent, useState } from "react";
import {
  type GeocodeResult,
  PROPOSAL_KINDS,
  type ProposalKind,
  proposalInputSchema,
} from "../../../shared/schemas";
import { PlaceSearch } from "../../components/PlaceSearch";
import { ApiRequestError, api } from "../../lib/api";
import { emptyToNull, type FieldErrors, validate } from "../../lib/forms";
import { useT } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { FormError, Select, TextArea, TextInput } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { PlaceLabel } from "../../ui/Place";
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
  const [picked, setPicked] = useState<GeocodeResult | null>(null);
  const [meetAt, setMeetAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const pick = (r: GeocodeResult) => {
    setPicked(r);
    setPlace(r.name);
    setLat(String(r.lat));
    setLng(String(r.lng));
    setErrors({});
  };
  const dropCoords = () => {
    setPicked(null);
    setLat("");
    setLng("");
  };

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
        <PlaceSearch onPick={pick} />
        <TextInput
          label={t("proposal.place")}
          required
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          error={errors.place ? t("proposal.placeRequired") : undefined}
          maxLength={300}
        />
        {picked ? (
          <div className="flex flex-col items-start gap-2 rounded-control bg-primary-tint/60 p-3">
            <p className="sr-only" role="status">
              {t("place.picked", { name: picked.name })}
            </p>
            <PlaceLabel place={picked} label={place} lat={picked.lat} lng={picked.lng} />
            <Button size="sm" variant="ghost" icon="close" onClick={dropCoords}>
              {t("place.removeCoords")}
            </Button>
          </div>
        ) : null}
        <details
          className="rounded-control bg-sunken px-3"
          open={errors.lat || errors.lng ? true : undefined}
        >
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-subhead font-medium">
            <Icon name="pin" className="size-4" />
            {t("place.manualCoords")}
          </summary>
          <div className="grid grid-cols-2 gap-3 pt-1 pb-3">
            <TextInput
              label={t("proposal.lat")}
              inputMode="decimal"
              value={lat}
              onChange={(e) => {
                setLat(e.target.value);
                setPicked(null);
              }}
              error={errors.lat}
              hint={t("proposal.coordsHint")}
            />
            <TextInput
              label={t("proposal.lng")}
              inputMode="decimal"
              value={lng}
              onChange={(e) => {
                setLng(e.target.value);
                setPicked(null);
              }}
              error={errors.lng}
            />
          </div>
        </details>
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
