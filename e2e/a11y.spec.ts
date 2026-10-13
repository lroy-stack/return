import { createRequire } from "node:module";
import { expect, test } from "./fixtures";

/**
 * Scenario 9. Accessibility smoke test on the page a stranger sees first.
 * axe-core is a dev dependency; E2E_AXE_PATH (a path to axe.min.js) can override it.
 */

function findAxe(): string | null {
  if (process.env.E2E_AXE_PATH) return process.env.E2E_AXE_PATH;
  try {
    return createRequire(import.meta.url).resolve("axe-core/axe.min.js");
  } catch {
    return null;
  }
}

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown }[];
}

const axePath = findAxe();

// The finder pages ship a strict CSP (no inline scripts); axe has to be injected inline, so only this file opts out.
test.use({ bypassCSP: true });

test("9. the finder tag page has no critical or serious accessibility violations", async ({
  page,
  tagged,
}) => {
  test.skip(
    axePath === null,
    "axe-core could not be resolved; run pnpm install or set E2E_AXE_PATH to an axe.min.js.",
  );

  await page.goto(tagged.tag.url);
  await expect(page.getByRole("heading", { name: "Write to the owner" })).toBeVisible();
  await page.addScriptTag({ path: axePath ?? "" });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run: (ctx: Document, opts: object) => Promise<{ violations: AxeViolation[] }> };
      }
    ).axe;
    // The Turnstile iframe belongs to Cloudflare, not to us.
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      exclude: [[".cf-turnstile"]],
    } as object);
    return result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  });

  expect(
    violations.map(
      (v) => `${v.id} (${v.impact}): ${v.help} @ ${JSON.stringify(v.nodes.map((n) => n.target))}`,
    ),
  ).toEqual([]);
});
