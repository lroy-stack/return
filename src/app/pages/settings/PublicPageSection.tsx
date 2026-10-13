import { useState } from "react";
import type { Tag } from "../../../shared/schemas";
import { LANGUAGES } from "../../../shared/settings";
import { api, qs } from "../../lib/api";
import { useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { Button, ButtonLink } from "../../ui/Button";
import { TextInput, Toggle } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { Combobox } from "../../ui/Select";
import { FieldGroup, LANGUAGE_NAMES, SectionCard, type SectionProps } from "./shared";

export function PublicPageSection({ draft, update, instant, errors }: SectionProps) {
  const t = useT();
  const pp = draft.publicPage;
  const tags = useResource<Tag[]>(
    "preview-tags",
    async (signal) => (await api.get<{ tags: Tag[] }>(`/tags${qs({ status: "active" })}`, signal)).tags,
  );
  const [tagId, setTagId] = useState("");
  const list = tags.state.status === "ready" ? tags.state.data : [];
  const chosen = list.find((x) => x.id === (tagId || list[0]?.id));

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title={t("settings.public")} description={t("settings.publicDesc")}>
        <Toggle
          label={t("public.showOwner")}
          description={t("public.showOwnerHint")}
          checked={pp.showOwnerName}
          onChange={(on) =>
            instant((d) => {
              d.publicPage.showOwnerName = on;
            })
          }
        />
        <Toggle
          label={t("public.showPhoto")}
          description={t("public.showPhotoHint")}
          checked={pp.showItemPhoto}
          onChange={(on) =>
            instant((d) => {
              d.publicPage.showItemPhoto = on;
            })
          }
        />
        <FieldGroup legend={t("public.defaultReward")}>
          <div className="flex flex-col gap-3">
            {LANGUAGES.map((l) => (
              <TextInput
                key={l}
                label={LANGUAGE_NAMES[l]}
                maxLength={200}
                value={pp.defaultRewardText[l]}
                onChange={(e) =>
                  update((d) => {
                    d.publicPage.defaultRewardText[l] = e.target.value;
                  })
                }
                error={errors[`publicPage.defaultRewardText.${l}`]}
              />
            ))}
          </div>
        </FieldGroup>
      </SectionCard>

      <SectionCard title={t("public.previewTitle")} description={t("public.previewDesc")}>
        {tags.state.status === "ready" && list.length === 0 ? (
          <p className="text-muted">{t("public.noTags")}</p>
        ) : (
          <>
            <Combobox
              label={t("public.previewTag")}
              options={list.map((x) => ({
                value: x.id,
                label: `${x.label} · ${x.itemName ?? t("tag.unassigned")}`,
              }))}
              value={chosen?.id ?? null}
              onChange={setTagId}
              disabled={list.length === 0}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                icon="phone"
                disabled={!chosen}
                onClick={() => {
                  if (chosen)
                    window.open(
                      chosen.url,
                      "return-preview",
                      "popup,width=390,height=800,noopener,noreferrer",
                    );
                }}
              >
                {t("public.previewMobile")}
              </Button>
              {chosen ? (
                <ButtonLink to={chosen.url} external icon="external">
                  {t("public.previewTab")}
                </ButtonLink>
              ) : null}
            </div>
            <p className="flex gap-2 text-subhead text-muted">
              <Icon name="info" className="mt-0.5 size-4" />
              {t("public.previewNote")}
            </p>
          </>
        )}
      </SectionCard>
    </div>
  );
}
