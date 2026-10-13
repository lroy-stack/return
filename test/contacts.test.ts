import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { TrustedContact } from "../src/shared/schemas";
import { api, apiJson } from "./helpers/api";
import { seedForeignOwner } from "./helpers/files";

describe("trusted contacts", () => {
  it("creates, lists, replaces, patches and deletes with real booleans", async () => {
    const created = await apiJson<TrustedContact>("POST", "/contacts", {
      name: "Ana",
      relationship: "Sister",
      email: "ana@example.test",
      notify: true,
      showPublic: false,
    });
    expect(created).toMatchObject({ name: "Ana", notify: true, showPublic: false });

    const stored = await env.DB.prepare("SELECT notify, show_public FROM trusted_contacts WHERE id = ?")
      .bind(created.id)
      .first<{ notify: number; show_public: number }>();
    expect(stored).toEqual({ notify: 1, show_public: 0 });

    const replaced = await apiJson<TrustedContact>("PUT", `/contacts/${created.id}`, {
      name: "Ana M.",
      email: "ana@example.test",
      phone: "+34 600 000 000",
      notify: false,
      showPublic: true,
    });
    expect(replaced).toMatchObject({ name: "Ana M.", relationship: null, notify: false, showPublic: true });

    const patched = await apiJson<TrustedContact>("PATCH", `/contacts/${created.id}`, { phone: "" });
    expect(patched).toMatchObject({ name: "Ana M.", phone: null, showPublic: true });

    const { contacts } = await apiJson<{ contacts: TrustedContact[] }>("GET", "/contacts");
    expect(contacts.map((c) => c.id)).toEqual([created.id]);

    expect((await api("DELETE", `/contacts/${created.id}`)).status).toBe(204);
    expect((await api("GET", "/contacts")).status).toBe(200);
    expect((await api("DELETE", `/contacts/${created.id}`)).status).toBe(404);
  });

  it("validates input: name, email format, notify requires an email", async () => {
    expect((await api("POST", "/contacts", { name: "" })).status).toBe(422);
    expect((await api("POST", "/contacts", { name: "Bob", email: "not-an-email" })).status).toBe(422);
    expect((await api("POST", "/contacts", { name: "Bob", notify: true })).status).toBe(422);
    const bob = await apiJson<TrustedContact>("POST", "/contacts", { name: "Bob" });
    expect((await api("PATCH", `/contacts/${bob.id}`, { notify: true })).status).toBe(422);
  });

  it("is invisible to other owners (IDOR)", async () => {
    await seedForeignOwner();
    const { contacts } = await apiJson<{ contacts: TrustedContact[] }>("GET", "/contacts");
    expect(contacts.map((c) => c.id)).not.toContain("foreign-contact");
    expect((await api("PUT", "/contacts/foreign-contact", { name: "x" })).status).toBe(404);
    expect((await api("PATCH", "/contacts/foreign-contact", { name: "x" })).status).toBe(404);
    expect((await api("DELETE", "/contacts/foreign-contact")).status).toBe(404);
  });
});
