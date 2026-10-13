import { useT } from "../lib/i18n";
import { ButtonLink } from "../ui/Button";
import { PageHeader } from "../ui/Page";

export function NotFoundPage() {
  const t = useT();
  return (
    <>
      <PageHeader title={t("notFound.title")} subtitle={t("notFound.body")} />
      <ButtonLink to="/" variant="primary" icon="inventory">
        {t("nav.inventory")}
      </ButtonLink>
    </>
  );
}
