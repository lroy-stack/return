/* Finder pages: progressive enhancement only. Every form works without these files. */
(() => {
  function messages() {
    const host = document.querySelector("[data-messages]");
    try {
      return host ? JSON.parse(host.dataset.messages) : {};
    } catch (_e) {
      return {};
    }
  }

  /* Copy and share the private conversation link (native share sheet where the browser has one). */
  function setupCopyAndShare() {
    const copy = document.querySelector("[data-copy]");
    const share = document.querySelector("[data-share]");
    const text = messages();
    if (copy && navigator.clipboard) {
      copy.hidden = false;
      const label = copy.textContent;
      copy.addEventListener("click", () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          copy.textContent = copy.dataset.copied || label;
          window.setTimeout(() => {
            copy.textContent = label;
          }, 2500);
        });
      });
    }
    if (share && navigator.share) {
      share.hidden = false;
      share.addEventListener("click", () => {
        // Called straight from the click: iOS drops the user activation after an await.
        navigator
          .share({ title: text.shareTitle || document.title, url: window.location.href })
          .catch(() => {});
      });
    }
  }

  let formatter;
  function localizeTimes(root) {
    if (!formatter) {
      try {
        formatter = new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        });
      } catch (_e) {
        return;
      }
    }
    (root || document).querySelectorAll("time[data-local-time]").forEach((el) => {
      const date = new Date(el.getAttribute("datetime"));
      if (!Number.isNaN(date.getTime())) el.textContent = formatter.format(date);
    });
  }

  /* Meeting times are sent with the zone they were typed in. */
  function setupTimeZone() {
    let zone;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (_e) {
      return;
    }
    if (!zone) return;
    document.querySelectorAll("[data-browser-tz]").forEach((el) => {
      el.value = zone;
    });
  }

  /* After a failed submit the page reloads with an error summary: move focus there. */
  function focusErrorSummary() {
    const summary = document.querySelector("[data-error-summary]");
    if (!summary) return;
    const details = summary.closest("details");
    if (details) details.open = true;
    summary.focus();
  }

  window.returnPublic = { localizeTimes: localizeTimes, setupTimeZone: setupTimeZone };
  setupTimeZone();
  focusErrorSummary();
  setupCopyAndShare();
  localizeTimes();
})();
