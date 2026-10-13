import { LANGUAGES, type Language } from "../../shared/settings";
import {
  EMPTY_FORM,
  Field,
  FormErrorSummary,
  type FormState,
  fieldAria,
  LocationFields,
  SpriteIcon,
} from "./components";
import { dict, fmt, LANGUAGE_NAMES } from "./i18n";
import { Layout } from "./layout";

export function HomePage({ lang }: { lang: Language }) {
  return (
    <Layout lang={lang} title="RETURN">
      <h1>RETURN</h1>
      {LANGUAGES.map((l) => {
        const t = dict(l);
        return (
          <section key={l} lang={l} class="card">
            <h2>{LANGUAGE_NAMES[l]}</h2>
            <p>{t.home.lead}</p>
            <p>{t.home.body}</p>
            <p class="muted">{t.home.noData}</p>
          </section>
        );
      })}
    </Layout>
  );
}

export function InactivePage({ lang }: { lang: Language }) {
  const t = dict(lang);
  return (
    <Layout lang={lang} title={t.inactive.title}>
      <h1>{t.inactive.title}</h1>
      <p>{t.inactive.body}</p>
    </Layout>
  );
}

export function MessagePage({ lang, title }: { lang: Language; title: string }) {
  return (
    <Layout lang={lang} title={title}>
      <h1>{title}</h1>
    </Layout>
  );
}

export function DegradedPage({
  lang,
  email,
  typedMessage,
}: {
  lang: Language;
  email: string;
  typedMessage?: string;
}) {
  const t = dict(lang);
  return (
    <Layout lang={lang} title={t.degraded.title}>
      <h1>{t.degraded.title}</h1>
      <p>{t.degraded.body}</p>
      <p class="contact-big">
        {email ? <a href={`mailto:${email}`}>{email}</a> : <strong>{t.degraded.noContact}</strong>}
      </p>
      <p class="muted">{t.degraded.tryAgain}</p>
      {typedMessage ? (
        <>
          <p>{t.degraded.yourMessage}</p>
          <p class="typed">{typedMessage}</p>
        </>
      ) : null}
    </Layout>
  );
}

export function EmergencyPage({ email }: { email: string }) {
  return (
    <Layout lang="en" title="RETURN" switcher={false}>
      {LANGUAGES.map((l) => {
        const t = dict(l);
        return (
          <section key={l} lang={l} class="card">
            <h1>{t.emergency.title}</h1>
            <p>{t.emergency.body}</p>
            <p class="contact-big">
              {email ? <a href={`mailto:${email}`}>{email}</a> : <strong>{t.emergency.noContact}</strong>}
            </p>
          </section>
        );
      })}
    </Layout>
  );
}

export function PrivacyPage({ lang }: { lang: Language }) {
  const t = dict(lang).privacyPage;
  return (
    <Layout lang={lang} title={t.title}>
      <h1>{t.title}</h1>
      <h2>{t.storedTitle}</h2>
      <p>{t.stored}</p>
      <h2>{t.seenTitle}</h2>
      <p>{t.seen}</p>
      <h2>{t.processorsTitle}</h2>
      <p>{t.processors}</p>
      <h2>{t.recipientsTitle}</h2>
      <p>{t.recipients}</p>
      <h2>{t.retentionTitle}</h2>
      <p>{t.retention}</p>
      <h2>{t.cookiesTitle}</h2>
      <p>{t.cookies}</p>
      <h2>{t.deletionTitle}</h2>
      <p>{t.deletion}</p>
    </Layout>
  );
}

export interface ContactLink {
  label: string;
  href: string;
  text: string;
}

export interface TagView {
  token: string;
  ownerName: string | null;
  title: string;
  photoUrl: string | null;
  returnMessage: string;
  instructions: string | null;
  lost: { message: string; reward: string | null } | null;
  contacts: ContactLink[];
  notifyFinders: boolean;
  /** Link to the finder's existing open conversation for this tag. */
  continueUrl: string | null;
  siteKey: string;
  /** Printed fallback address, offered when the form cannot be used right now. */
  fallbackEmail: string;
}

export function TagPage({
  lang,
  view,
  form = EMPTY_FORM,
}: {
  lang: Language;
  view: TagView;
  form?: FormState;
}) {
  const t = dict(lang);
  const v = form.values;
  return (
    <Layout lang={lang} title={view.title} turnstile scripts={["/p/location.js"]}>
      {view.continueUrl ? (
        <a class="btn btn-primary btn-block" href={view.continueUrl}>
          {t.tag.continueConversation}
        </a>
      ) : null}
      <section class="hero">
        <p class="eyebrow">{t.tag.foundIt}</p>
        <h1>{view.title}</h1>
        {view.lost ? (
          <div class="banner-lost" role="status">
            <strong>
              <SpriteIcon name="lost" size={16} />
              {t.tag.lostBadge}
            </strong>
            <p>{view.lost.message}</p>
            {view.lost.reward ? (
              <p>
                <strong>{t.tag.reward}:</strong> {view.lost.reward}
              </p>
            ) : null}
          </div>
        ) : null}
        {view.ownerName ? <p class="owner">{fmt(t.tag.belongsTo, { name: view.ownerName })}</p> : null}
        {view.photoUrl ? (
          <img class="photo" src={view.photoUrl} alt={view.title} width={640} height={480} />
        ) : null}
        <p class="lead">{view.returnMessage}</p>
      </section>
      {view.instructions ? (
        <div class="notice">
          <strong>{t.tag.ownerNote}</strong>
          <p>{view.instructions}</p>
        </div>
      ) : null}

      <section class="card" aria-labelledby="write">
        <h2 id="write">{t.tag.writeHeading}</h2>
        <p>{t.tag.writeIntro}</p>
        <FormErrorSummary state={form} t={t} />
        {form.errors.form && view.fallbackEmail ? (
          <p class="notice">
            {t.errors.fallbackEmail} <a href={`mailto:${view.fallbackEmail}`}>{view.fallbackEmail}</a>
          </p>
        ) : null}
        <form method="post" action={`/t/${view.token}/contact`} class="stack">
          <input type="hidden" name="lang" value={lang} />
          <Field id="message" label={t.form.message} hint={t.form.messageHint} error={form.errors.message}>
            <textarea
              id="message"
              name="message"
              rows={5}
              maxlength={4000}
              required
              {...fieldAria("message", { hint: true, error: form.errors.message })}
            >
              {v.message ?? ""}
            </textarea>
          </Field>
          <Field id="name" label={t.form.name} optionalLabel={t.form.optional} error={form.errors.name}>
            <input
              id="name"
              name="name"
              type="text"
              maxlength={80}
              autocomplete="name"
              value={v.name ?? ""}
              {...fieldAria("name", { error: form.errors.name })}
            />
          </Field>
          {view.notifyFinders ? (
            <Field
              id="email"
              label={t.form.email}
              hint={t.form.emailHint}
              optionalLabel={t.form.optional}
              error={form.errors.email}
            >
              <input
                id="email"
                name="email"
                type="email"
                maxlength={254}
                autocomplete="email"
                inputmode="email"
                value={v.email ?? ""}
                {...fieldAria("email", { hint: true, error: form.errors.email })}
              />
            </Field>
          ) : null}
          <LocationFields lang={lang} state={form} idPrefix="loc" />
          <div class="turnstile">
            <p class="hint">{t.form.verify}</p>
            <div class="cf-turnstile" data-sitekey={view.siteKey} data-language={lang} data-size="flexible" />
          </div>
          <button type="submit" class="btn btn-primary btn-block">
            {t.form.send}
          </button>
        </form>
      </section>

      {view.contacts.length > 0 ? (
        <section class="card" aria-labelledby="other">
          <h2 id="other">{t.tag.otherWays}</h2>
          <ul class="contacts">
            {view.contacts.map((c) => (
              <li key={`${c.href}-${c.label}`}>
                <span class="contact-label">{c.label}</span>
                <a class="btn btn-secondary" href={c.href} rel="noreferrer">
                  {c.text}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Layout>
  );
}
