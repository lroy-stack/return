import { expect, test } from "./fixtures";

/**
 * Scenario 14. The tags list: a status filter (Active / Revoked / All) and a "Select <label>" checkbox on
 * active tags only, which is what bulk printing starts from.
 */

test("14. the tags page filters by status and offers selection on active tags only", async ({
  page,
  owner,
  tagged,
}) => {
  const revoked = await owner.createTag(tagged.item.id);
  await owner.revokeTag(revoked.id);

  await page.goto("/tags");
  await expect(page.getByRole("heading", { level: 1, name: "Tags" })).toBeVisible();
  const rows = page.getByRole("list", { name: "Tags" }).getByRole("listitem").filter({
    hasText: tagged.secrets.name,
  });
  const select = (label: string) => page.getByRole("checkbox", { name: `Select ${label}` });
  // Match the row title exactly: a label like "170" is also a substring of item names such as "T-a041700b".
  const rowLabelled = (label: string) => rows.filter({ has: page.getByText(label, { exact: true }) });
  const activeRow = rowLabelled(tagged.tag.label);
  const revokedRow = rowLabelled(revoked.label);

  // Active is the default: the active tag is listed and selectable, the revoked one is not listed.
  await expect(page.getByRole("radio", { name: "Active" })).toBeChecked();
  await expect(activeRow).toHaveCount(1);
  await expect(select(tagged.tag.label)).toBeVisible();
  await expect(revokedRow).toHaveCount(0);

  // Revoked: only the revoked tag, with nothing to select.
  await page.getByText("Revoked", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Revoked" })).toBeChecked();
  await expect(revokedRow).toHaveCount(1);
  await expect(activeRow).toHaveCount(0);
  await expect(select(revoked.label)).toHaveCount(0);

  // All: both; selecting the active one shows the bulk bar with the print action.
  await page.getByText("All", { exact: true }).click();
  await expect(activeRow).toHaveCount(1);
  await expect(revokedRow).toHaveCount(1);
  await select(tagged.tag.label).check();
  const bar = page.getByRole("toolbar");
  await expect(bar.getByRole("status")).toContainText("1");
  await expect(bar.getByRole("button", { name: "Print cards" })).toBeVisible();
});
