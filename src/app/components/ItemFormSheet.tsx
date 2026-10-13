import { type FormEvent, useState } from "react";
import { ITEM_CATEGORIES, type Item, type ItemCategory, itemInputSchema } from "../../shared/schemas";
import { ApiRequestError, api } from "../lib/api";
import { centsToInput, parseMoneyToCents } from "../lib/format";
import { emptyToNull, type FieldErrors, validate } from "../lib/forms";
import { useT } from "../lib/i18n";
import { Button } from "../ui/Button";
import { FormError, Select, TextArea, TextInput } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { Sheet, SheetBody, SheetFooter } from "../ui/Sheet";

/** Create (no `item`) or edit an item, including its private details. */
export function ItemFormSheet({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item?: Item;
  onClose: () => void;
  onSaved: (item: Item) => void;
}) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={item ? t("itemForm.editTitle") : t("itemForm.createTitle")}>
      <ItemForm item={item} onClose={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

function ItemForm({
  item,
  onClose,
  onSaved,
}: {
  item?: Item;
  onClose: () => void;
  onSaved: (item: Item) => void;
}) {
  const t = useT();
  const [name, setName] = useState(item?.name ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [model, setModel] = useState(item?.model ?? "");
  const [category, setCategory] = useState<ItemCategory>(item?.category ?? "backpack");
  const [description, setDescription] = useState(item?.description ?? "");
  const [serial, setSerial] = useState(item?.serialNumber ?? "");
  const [value, setValue] = useState(centsToInput(item?.estimatedValueCents));
  const [currency, setCurrency] = useState(item?.currency ?? "EUR");
  const [acquiredOn, setAcquiredOn] = useState(item?.acquiredOn ?? "");
  const [privateNotes, setPrivateNotes] = useState(item?.privateNotes ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cents = parseMoneyToCents(value);
    if (cents === null) {
      setErrors({ estimatedValueCents: t("itemForm.valueInvalid") });
      return;
    }
    const input = {
      name,
      brand: emptyToNull(brand),
      model: emptyToNull(model),
      category,
      description: emptyToNull(description),
      serialNumber: emptyToNull(serial),
      estimatedValueCents: cents ?? null,
      currency: cents === undefined ? null : currency.trim().toUpperCase() || null,
      acquiredOn: acquiredOn || null,
      privateNotes: emptyToNull(privateNotes),
    };
    const result = validate(itemInputSchema, input);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const saved = item
        ? await api.patch<Item>(`/items/${item.id}`, input)
        : await api.post<Item>("/items", input);
      onSaved(saved);
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
          label={t("itemForm.name")}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name ? t("itemForm.nameRequired") : undefined}
          autoFocus
          maxLength={120}
        />
        <Select
          label={t("itemForm.category")}
          value={category}
          onChange={(e) => setCategory(e.target.value as ItemCategory)}
        >
          {ITEM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}` as const)}
            </option>
          ))}
        </Select>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label={t("itemForm.brand")}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            error={errors.brand}
            maxLength={80}
          />
          <TextInput
            label={t("itemForm.model")}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            error={errors.model}
            maxLength={80}
          />
        </div>
        <TextArea
          label={t("itemForm.description")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          maxLength={2000}
        />

        <details
          className="rounded-control border border-line bg-sunken/50 px-3 py-1"
          open={!!(item?.serialNumber || item?.estimatedValueCents || item?.privateNotes)}
        >
          <summary className="flex min-h-11 items-center gap-2 font-medium">
            <Icon name="lock" className="size-4" />
            {t("itemForm.privateDetails")}
          </summary>
          <div className="flex flex-col gap-4 pt-2 pb-3">
            <p className="text-subhead text-muted">{t("private.neverShown")}</p>
            <TextInput
              label={t("itemForm.serial")}
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              error={errors.serialNumber}
              maxLength={120}
              autoComplete="off"
            />
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <TextInput
                label={t("itemForm.value")}
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                error={errors.estimatedValueCents}
              />
              <TextInput
                label={t("itemForm.currency")}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                error={errors.currency ? t("itemForm.currencyInvalid") : undefined}
              />
            </div>
            <TextInput
              label={t("itemForm.acquiredOn")}
              type="date"
              value={acquiredOn}
              onChange={(e) => setAcquiredOn(e.target.value)}
              error={errors.acquiredOn}
            />
            <TextArea
              label={t("itemForm.privateNotes")}
              value={privateNotes}
              onChange={(e) => setPrivateNotes(e.target.value)}
              error={errors.privateNotes}
              maxLength={5000}
            />
          </div>
        </details>
        <FormError message={formError} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={pending}>
          {item ? t("common.save") : t("itemForm.create")}
        </Button>
      </SheetFooter>
    </form>
  );
}
