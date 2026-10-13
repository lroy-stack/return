import { useId, useRef, useState } from "react";
import type { GeocodeResult, GeocodeSearchResponse } from "../../shared/schemas";
import { ApiRequestError, api, qs } from "../lib/api";
import { useT } from "../lib/i18n";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Icon } from "../ui/Icon";
import { List, ListRow } from "../ui/List";
import { OsmAttribution } from "../ui/Place";
import { errorMessage } from "../ui/States";

type State =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "done"; results: GeocodeResult[] }
  | { status: "error"; message: string };

const MIN_CHARS = 3;

/**
 * Looks a place up by name and lets the owner pick one. Search runs only when the owner presses "Search" or
 * Enter: never while typing (Nominatim usage policy forbids autocomplete). Not a <form>, because it lives
 * inside other forms. Results carry the OpenStreetMap attribution.
 */
export function PlaceSearch({ onPick }: { onPick: (result: GeocodeResult) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const inputId = useId();
  const hintId = useId();
  const abort = useRef<AbortController | null>(null);
  const tooShort = q.trim().length < MIN_CHARS;

  const search = async () => {
    const query = q.trim();
    if (query.length < MIN_CHARS) {
      setState({ status: "error", message: t("place.minChars") });
      return;
    }
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setState({ status: "searching" });
    try {
      const res = await api.get<GeocodeSearchResponse>(`/geocode/search${qs({ q: query })}`, ctrl.signal);
      // OpenStreetMap down or over budget is not "no places": say so and let the owner type the place instead.
      if (res.unavailable) setState({ status: "error", message: t("place.unavailable") });
      else setState({ status: "done", results: res.results });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setState({
        status: "error",
        message:
          e instanceof ApiRequestError && e.status === 429 ? t("place.rateLimited") : errorMessage(e, t),
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-subhead font-medium">
        {t("place.search")}
      </label>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
          />
          <input
            id={inputId}
            type="search"
            value={q}
            maxLength={200}
            aria-describedby={hintId}
            placeholder={t("place.searchPlaceholder")}
            enterKeyHint="search"
            autoComplete="off"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            className="block min-h-11 w-full rounded-control border border-line-strong bg-raised pr-3 pl-11 text-body text-fg placeholder:text-muted hover:border-fg/60 [&::-webkit-search-cancel-button]:appearance-none"
          />
        </div>
        <Button
          icon="search"
          loading={state.status === "searching"}
          disabled={tooShort && state.status !== "error"}
          onClick={() => void search()}
        >
          {t("place.searchButton")}
        </Button>
      </div>
      <p id={hintId} className="text-footnote text-muted">
        {t("place.searchHint")}
      </p>

      <div
        aria-live="polite"
        className={cx(state.status === "idle" || state.status === "searching" ? "sr-only" : "")}
      >
        {state.status === "searching" ? t("place.searching") : null}
        {state.status === "error" ? (
          <p className="flex items-start gap-1.5 text-footnote font-medium text-danger">
            <Icon name="alert" className="mt-px size-4" />
            {state.message}
          </p>
        ) : null}
        {state.status === "done" && state.results.length === 0 ? (
          <p className="rounded-control bg-sunken px-3.5 py-2.5 text-subhead text-muted">{t("place.none")}</p>
        ) : null}
        {state.status === "done" && state.results.length > 0 ? (
          <span className="sr-only">{t("place.found", { n: state.results.length })}</span>
        ) : null}
      </div>

      {state.status === "done" && state.results.length > 0 ? (
        <>
          <List label={t("place.results")}>
            {state.results.map((r) => (
              <ListRow
                key={`${r.lat},${r.lng},${r.name}`}
                onClick={() => onPick(r)}
                chevron={false}
                leading={<Icon name="pin" className="size-5 text-primary-text" />}
                title={r.name}
                subtitle={r.detail ?? r.address}
                trailing={<span className="font-semibold text-primary-text">{t("place.use")}</span>}
              />
            ))}
          </List>
          <p className="text-caption text-muted">
            <OsmAttribution />
          </p>
        </>
      ) : null}
    </div>
  );
}
