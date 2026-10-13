/*
 * Finder conversation as a chat: sends without a page load, refreshes in place and keeps the viewport
 * where the reader is. Without this file the forms post and redirect to the newest item.
 */
(() => {
  const chat = document.querySelector("[data-chat]");
  if (!chat) return;
  const thread = chat.querySelector("[data-thread]");
  const list = chat.querySelector("[data-timeline]");
  const pill = chat.querySelector("[data-new-pill]");
  const composeError = chat.querySelector("[data-compose-error]");
  const composeForm = chat.querySelector("[data-compose]");
  const textarea = composeForm ? composeForm.querySelector("textarea") : null;
  const plus = chat.querySelector("details.plus");
  const lang = document.documentElement.lang || undefined;
  let text = {};
  try {
    text = JSON.parse(chat.dataset.messages || "{}");
  } catch (_e) {
    text = {};
  }
  let cursor = chat.dataset.cursor;
  const isOpen = chat.dataset.open === "1";

  /* ------------------------------------------------------------ scroll: follow only when already at the bottom */
  const NEAR_BOTTOM = 48;
  let stick = true;
  function atBottom() {
    return thread.scrollHeight - thread.scrollTop - thread.clientHeight <= NEAR_BOTTOM;
  }
  function toBottom() {
    thread.scrollTop = thread.scrollHeight;
    stick = true;
    pill.hidden = true;
  }
  thread.addEventListener(
    "scroll",
    () => {
      stick = atBottom();
      if (stick) pill.hidden = true;
    },
    { passive: true },
  );
  pill.addEventListener("click", () => {
    toBottom();
    thread.focus({ preventScroll: true });
  });
  if (window.ResizeObserver) {
    // New content, a growing composer or the keyboard changing the height: stay put at the bottom.
    const observer = new ResizeObserver(() => {
      if (stick) thread.scrollTop = thread.scrollHeight;
    });
    observer.observe(list);
    observer.observe(thread);
  }

  /* Phones keep the layout viewport under the keyboard: follow the visual viewport instead. */
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const fit = () => {
      const covered = window.innerHeight - vv.height;
      if (vv.scale <= 1.01 && covered > 80) {
        root.style.setProperty("--app-h", `${Math.round(vv.height)}px`);
        window.scrollTo(0, 0);
      } else {
        root.style.removeProperty("--app-h");
      }
      if (stick) thread.scrollTop = thread.scrollHeight;
    };
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
  }

  /* ------------------------------------------------------------ timeline: local times, day separators */
  let timeFormat;
  let dayFormat;
  let relative;
  try {
    timeFormat = new Intl.DateTimeFormat(lang, { timeStyle: "short" });
    dayFormat = new Intl.DateTimeFormat(lang, { dateStyle: "medium" });
    relative = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  } catch (_e) {
    timeFormat = null;
  }
  function dayKey(date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }
  function dayLabel(date) {
    const today = new Date();
    const diff = Math.round(
      (new Date(today.getFullYear(), today.getMonth(), today.getDate()) -
        new Date(date.getFullYear(), date.getMonth(), date.getDate())) /
        86400000,
    );
    if (diff === 0 || diff === 1) {
      const word = relative.format(-diff, "day");
      return word.charAt(0).toLocaleUpperCase(lang) + word.slice(1);
    }
    return dayFormat.format(date);
  }
  function decorate() {
    if (!timeFormat) return;
    list.querySelectorAll("li.day").forEach((el) => {
      el.remove();
    });
    let last = "";
    list.querySelectorAll("li[data-at]").forEach((item) => {
      const date = new Date(item.dataset.at);
      if (Number.isNaN(date.getTime())) return;
      const stamp = item.querySelector("time[data-local-time]");
      if (stamp) stamp.textContent = timeFormat.format(date);
      const key = dayKey(date);
      if (key === last) return;
      last = key;
      const separator = document.createElement("li");
      separator.className = "day";
      const label = document.createElement("time");
      label.dateTime = item.dataset.at.slice(0, 10);
      label.textContent = dayLabel(date);
      separator.appendChild(label);
      list.insertBefore(separator, item);
    });
  }

  /* Adds new items and replaces changed ones (e.g. a plan that was answered). Returns the new ones. */
  function merge(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const added = [];
    template.content.querySelectorAll("li[data-id]").forEach((incoming) => {
      const existing = list.querySelector(`[data-id="${incoming.dataset.id}"]`);
      const node = document.importNode(incoming, true);
      if (!existing) {
        list.appendChild(node);
        added.push(node);
      } else if (existing.dataset.rev !== incoming.dataset.rev) {
        existing.replaceWith(node);
      }
    });
    const empty = thread.querySelector(".muted");
    if (empty && list.children.length > 0) empty.remove();
    decorate();
    return added;
  }

  /* ------------------------------------------------------------ sending */
  function showError(message) {
    if (!composeError) return;
    composeError.textContent = message || "";
    composeError.hidden = !message;
  }

  function autogrow() {
    if (!textarea || (window.CSS && CSS.supports("field-sizing", "content"))) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function setBusy(form, busy) {
    form.toggleAttribute("aria-busy", busy);
    // Text typed while the request is in flight must survive the reset that follows a success.
    if (form === composeForm) textarea.readOnly = busy;
    form.querySelectorAll("button").forEach((button) => {
      button.disabled = busy;
    });
  }

  function nativeSubmit(form, submitter) {
    form.dataset.native = "1";
    if (form.requestSubmit) form.requestSubmit(submitter || undefined);
    else form.submit();
  }

  function send(form, submitter) {
    if (form.hasAttribute("aria-busy")) return;
    const isCompose = form === composeForm;
    if (isCompose && !textarea.value.trim()) {
      textarea.focus();
      return;
    }
    let data;
    try {
      data = new FormData(form, submitter || undefined);
    } catch (_e) {
      data = new FormData(form);
      if (submitter?.name) data.set(submitter.name, submitter.value);
    }
    showError("");
    setBusy(form, true);
    fetch(form.getAttribute("action"), {
      method: "POST",
      body: new URLSearchParams(data),
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    })
      .then((res) => {
        const json = (res.headers.get("Content-Type") || "").indexOf("application/json") !== -1;
        if (res.ok && json) return res.json();
        if (res.headers.get("X-Form-State") === "1") {
          // The server re-rendered the form with its explanation (validation, daily cap): show that page.
          setBusy(form, false);
          nativeSubmit(form, submitter);
          return null;
        }
        // Anything else (rate limit, outage): never repeat the write. Keep the text, say so, and look at the
        // timeline in case the write did go through.
        throw new Error(String(res.status));
      })
      .then((result) => {
        if (!result) return;
        merge(result.html);
        cursor = result.cursor;
        toBottom();
        setBusy(form, false);
        form.reset();
        if (isCompose) {
          autogrow();
          textarea.focus();
        } else if (plus) {
          plus.open = false;
        }
      })
      .catch(() => {
        setBusy(form, false);
        showError(text.sendFailed);
        poll();
      });
  }

  chat.addEventListener("submit", (event) => {
    const form = event.target.closest ? event.target.closest("form[data-async]") : null;
    if (!form || event.defaultPrevented || form.dataset.native) return;
    event.preventDefault();
    send(form, event.submitter);
  });

  if (textarea) {
    textarea.addEventListener("input", autogrow);
    textarea.addEventListener("keydown", (event) => {
      // The keyboard's key says "send": Enter sends, Shift+Enter makes a new line.
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      composeForm.requestSubmit ? composeForm.requestSubmit() : send(composeForm);
    });
    textarea.addEventListener("focus", () => {
      if (plus) plus.open = false;
    });
    autogrow();
  }
  if (plus) {
    document.addEventListener("click", (event) => {
      if (plus.open && !plus.contains(event.target)) plus.open = false;
    });
    plus.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && plus.open) {
        plus.open = false;
        plus.querySelector("summary").focus();
      }
    });
  }

  /* ------------------------------------------------------------ live refresh */
  let delay = 10000;
  let timer = 0;
  let polling = false;

  function schedule(ms) {
    window.clearTimeout(timer);
    if (!document.hidden) timer = window.setTimeout(poll, ms);
  }

  function poll() {
    if (polling || document.hidden) return;
    polling = true;
    fetch(`${chat.dataset.timelineUrl}?after=${encodeURIComponent(cursor)}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((result) => {
        delay = 10000;
        if (result.open !== isOpen) {
          window.location.reload();
          return;
        }
        if (result.html == null) return;
        const follow = stick;
        const added = merge(result.html);
        cursor = result.cursor;
        const fromOthers = added.some((node) => !node.classList.contains("from-finder"));
        if (follow) toBottom();
        else if (fromOthers) pill.hidden = false;
      })
      .catch(() => {
        delay = Math.min(delay * 2, 60000);
      })
      .finally(() => {
        polling = false;
        schedule(delay);
      });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.clearTimeout(timer);
    else poll();
  });

  decorate();
  toBottom();
  window.addEventListener("load", () => {
    if (stick) toBottom();
  });
  schedule(delay);
})();
