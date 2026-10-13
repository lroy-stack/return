import {
  expect,
  newFinderContext,
  ORIGIN,
  randomSecretToken,
  randomTagToken,
  requireTurnstileNetwork,
  test,
  unique,
} from "./fixtures";

/**
 * Scenario 5. Capability URLs are the only way in: unknown, malformed and revoked links all look the
 * same, and one finder can never reach another finder's conversation.
 */

const NOT_FOUND_TAG = "This tag is not active";
const NOT_FOUND_CONVERSATION = "We could not find this page.";

test("5a. a second finder cannot open the first conversation without its link", async ({
  browser,
  request,
  tagged,
  startConversation,
}) => {
  await requireTurnstileNetwork();
  const firstMessage = unique("First finder, private message");
  const first = await startConversation(tagged, firstMessage);
  const second = await startConversation(tagged, unique("Second finder"));
  expect(second.secret).not.toBe(first.secret);

  const stranger = await newFinderContext(browser);
  const page = await stranger.newPage();

  // Control: the capability link itself opens the conversation.
  const withLink = await page.goto(first.path);
  expect(withLink?.status()).toBe(200);
  await expect(page.getByText(firstMessage)).toBeVisible();

  // Everything a stranger could guess or know is refused with the same generic page.
  const guesses = [
    `/c/${tagged.token}`,
    `/c/${first.id}`,
    `/c/${first.secret.slice(0, -1)}${first.secret.endsWith("A") ? "B" : "A"}`,
    `/c/${first.secret.toLowerCase() === first.secret ? first.secret.toUpperCase() : first.secret.toLowerCase()}`,
    `/c/${randomSecretToken()}`,
  ];
  for (const path of guesses) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(404);
    const html = await res.text();
    expect(html, path).toContain(NOT_FOUND_CONVERSATION);
    expect(html, path).not.toContain(firstMessage);
  }

  // The second finder's own page shows only their own thread.
  await page.goto(second.path);
  await expect(page.getByText(firstMessage)).toHaveCount(0);

  // A guessed id cannot write into the first conversation either.
  const write = await request.post(`/c/${first.id}/messages`, {
    form: { message: unique("Injected") },
    headers: { Origin: ORIGIN },
    maxRedirects: 0,
  });
  expect(write.status()).toBe(404);
  await stranger.close();
});

test("5b. unknown, malformed and random links all return the same generic not-found page", async ({
  request,
}) => {
  const tagLinks = [
    `/t/${randomTagToken()}`,
    `/t/${randomTagToken()}`,
    "/t/not-a-token",
    "/t/0",
    `/T/${randomTagToken()}`,
  ];
  const tagBodies: string[] = [];
  for (const path of tagLinks) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(404);
    expect(res.headers()["x-robots-tag"], path).toContain("noindex");
    expect(res.headers()["cache-control"], path).toContain("no-store");
    tagBodies.push(await res.text());
  }
  expect(tagBodies[0]).toContain(NOT_FOUND_TAG);
  expect(new Set(tagBodies).size, "unknown and malformed tag links are indistinguishable").toBe(1);

  const conversationBodies: string[] = [];
  for (const path of [`/c/${randomSecretToken()}`, `/c/${randomSecretToken()}`, "/c/short", "/c/%20"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(404);
    conversationBodies.push(await res.text());
  }
  expect(conversationBodies[0]).toContain(NOT_FOUND_CONVERSATION);
  expect(
    new Set(conversationBodies).size,
    "unknown and malformed conversation links are indistinguishable",
  ).toBe(1);

  const state = await request.get(`/c/${randomSecretToken()}/state.json`, { maxRedirects: 0 });
  expect(state.status()).toBe(404);
});

test("5c. a revoked tag is indistinguishable from an unknown one and accepts no messages", async ({
  request,
  owner,
  tagged,
}) => {
  const before = await request.get(tagged.tag.url);
  expect(before.status()).toBe(200);
  expect(await before.text()).toContain(tagged.publicTitle);

  await owner.revokeTag(tagged.tag.id);

  const revoked = await request.get(tagged.tag.url);
  const unknown = await request.get(`/t/${randomTagToken()}`);
  expect(revoked.status()).toBe(404);
  expect(unknown.status()).toBe(404);
  const revokedHtml = await revoked.text();
  expect(revokedHtml).toBe(await unknown.text());
  expect(revokedHtml).toContain(NOT_FOUND_TAG);
  for (const leaked of [tagged.publicTitle, "Write to the owner", tagged.token]) {
    expect(revokedHtml, `revoked page must not mention ${leaked}`).not.toContain(leaked);
  }
  expect(await (await request.get(`${tagged.tag.url}/photo`)).text()).toBe("Not found");

  const message = unique("Message to a revoked tag");
  const post = await request.post(`/t/${tagged.token}/contact`, {
    form: { message, lang: "en", "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" },
    headers: { Origin: ORIGIN },
    maxRedirects: 0,
  });
  const postUnknown = await request.post(`/t/${randomTagToken()}/contact`, {
    form: { message, lang: "en", "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" },
    headers: { Origin: ORIGIN },
    maxRedirects: 0,
  });
  expect(post.status()).toBe(404);
  expect(await post.text()).toBe(await postUnknown.text());
  expect((await owner.listConversations()).filter((c) => c.lastMessagePreview === message)).toHaveLength(0);
});
