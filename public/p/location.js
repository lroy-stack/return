/*
 * "Use my current position" for the finder forms. The tap is the consent: the fix goes straight into the
 * form (hidden fields) and is shown as a compact card. Two stages: a quick coarse fix first, then a
 * background refinement that only replaces it when it is more accurate.
 */
(() => {
  const ua = navigator.userAgent || "";
  const isIos = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const inApp = /FBAN|FBAV|Instagram|WhatsApp|Telegram|MicroMessenger|Snapchat|\bLine\/|; wv\)/i.test(ua);

  const COARSE = { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 };
  const FINE = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };

  function setupLocation(root) {
    const geo = navigator.geolocation;
    const form = root.closest("form");
    const ui = root.querySelector("[data-gps-ui]");
    if (!geo || !form || !ui) return;
    let text = {};
    try {
      text = JSON.parse(root.dataset.messages || "{}");
    } catch (_e) {
      return;
    }
    const start = root.querySelector("[data-gps-start]");
    const status = root.querySelector("[data-gps-status]");
    const errorBox = root.querySelector("[data-gps-error]");
    const errorText = root.querySelector("[data-gps-error-text]");
    const guide = root.querySelector("[data-gps-guide]");
    const card = root.querySelector("[data-gps-card]");
    const accuracyEl = root.querySelector("[data-gps-accuracy]");
    const coordsEl = root.querySelector("[data-gps-coords]");
    const webview = root.querySelector("[data-gps-webview]");
    const labelInput = root.querySelector('input[name="location_label"]');
    const field = (name) => form.elements.namedItem(name);

    let seq = 0;
    let locating = false;
    let current = null;
    let waitingSubmit = null;
    let waitTimer = 0;
    const skip = root.querySelector("[data-gps-skip]");
    const MAX_WAIT_MS = 20000;

    ui.hidden = false;
    if (inApp && webview) {
      webview.textContent = isIos ? text.webviewIos : isAndroid ? text.webviewAndroid : text.webviewOther;
      webview.hidden = false;
    }

    function apply(pos, quiet) {
      current = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.max(1, Math.round(pos.coords.accuracy)),
      };
      field("location_source").value = "gps";
      field("location_lat").value = String(current.lat);
      field("location_lng").value = String(current.lng);
      field("location_accuracy").value = String(current.accuracy);
      accuracyEl.textContent = `±${current.accuracy} m`;
      coordsEl.textContent = `${current.lat.toFixed(5)}, ${current.lng.toFixed(5)}`;
      card.hidden = false;
      start.hidden = true;
      errorBox.hidden = true;
      if (!quiet) card.scrollIntoView({ block: "nearest" });
    }

    function restore() {
      const lat = Number(field("location_lat").value);
      const lng = Number(field("location_lng").value);
      if (
        field("location_source").value !== "gps" ||
        !field("location_lat").value ||
        Number.isNaN(lat) ||
        Number.isNaN(lng)
      )
        return;
      const accuracy = Number(field("location_accuracy").value) || 0;
      apply({ coords: { latitude: lat, longitude: lng, accuracy: accuracy } }, true);
      status.textContent = "";
    }

    function finish() {
      locating = false;
      start.disabled = false;
    }

    function stopWaiting() {
      waitingSubmit = null;
      window.clearTimeout(waitTimer);
      skip.hidden = true;
    }

    /* The finder gave up waiting (or we did): drop the position and send what they wrote. */
    function sendWithout() {
      const submitter = waitingSubmit;
      if (!submitter) return;
      clear();
      status.textContent = text.skipped || "";
      if (form.requestSubmit) form.requestSubmit(submitter === true ? undefined : submitter);
      else form.submit();
    }

    function flush() {
      const submitter = waitingSubmit;
      if (!submitter) return;
      stopWaiting();
      status.textContent = "";
      if (form.requestSubmit) form.requestSubmit(submitter === true ? undefined : submitter);
      else form.submit();
    }

    function fail(error) {
      finish();
      stopWaiting();
      status.textContent = "";
      const code = error?.code;
      errorText.textContent = code === 1 ? text.denied : code === 3 ? text.timeout : text.unavailable;
      guide.textContent =
        code === 1 ? (isIos ? text.guideIos : isAndroid ? text.guideAndroid : text.guideOther) : "";
      guide.hidden = code !== 1;
      errorBox.hidden = false;
      errorBox.scrollIntoView({ block: "nearest" });
    }

    function announcement() {
      return `${text.attached} (±${current.accuracy} m)`;
    }

    function refine(id) {
      status.textContent = text.refining || "";
      geo.getCurrentPosition(
        (pos) => {
          if (id !== seq) return;
          if (!current || pos.coords.accuracy < current.accuracy - 1) apply(pos);
          status.textContent = announcement();
        },
        () => {
          if (id === seq) status.textContent = announcement();
        },
        FINE,
      );
    }

    function locate(fresh) {
      const id = ++seq;
      locating = true;
      start.disabled = true;
      errorBox.hidden = true;
      status.textContent = text.locating || "";
      const done = (pos, refineAfter) => {
        if (id !== seq) return;
        finish();
        apply(pos);
        status.textContent = announcement();
        flush();
        if (refineAfter) refine(id);
      };
      geo.getCurrentPosition(
        (pos) => done(pos, true),
        (error) => {
          if (id !== seq) return;
          if (error.code === 1) return fail(error);
          // Coarse sources failed (no Wi-Fi/cell fix): ask for GPS before giving up.
          geo.getCurrentPosition(
            (pos) => done(pos, false),
            (e) => id === seq && fail(e),
            FINE,
          );
        },
        fresh ? { enableHighAccuracy: false, maximumAge: 0, timeout: COARSE.timeout } : COARSE,
      );
    }

    function clear() {
      seq += 1;
      finish();
      current = null;
      stopWaiting();
      field("location_source").value = "manual";
      field("location_lat").value = "";
      field("location_lng").value = "";
      field("location_accuracy").value = "";
      card.hidden = true;
      errorBox.hidden = true;
      start.hidden = false;
      status.textContent = text.removed || "";
    }

    // A successful send resets the form: forget the position as well (silently).
    form.addEventListener("reset", () => {
      clear();
      status.textContent = "";
    });
    skip.addEventListener("click", sendWithout);
    start.addEventListener("click", () => locate(false));
    root.querySelector("[data-gps-retry]").addEventListener("click", () => locate(true));
    root.querySelector("[data-gps-update]").addEventListener("click", () => locate(true));
    root.querySelector("[data-gps-remove]").addEventListener("click", () => {
      clear();
      start.focus();
    });
    root.querySelector("[data-gps-describe]").addEventListener("click", () => {
      errorBox.hidden = true;
      if (labelInput) labelInput.focus();
    });

    // A fix that is still being found must not be lost: hold the submit and send it when the fix arrives.
    form.addEventListener(
      "submit",
      (event) => {
        if (!locating) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        waitingSubmit = event.submitter || true;
        status.textContent = text.waiting || "";
        // A permission prompt can stay unanswered for ever: the finder always has a way out.
        skip.hidden = false;
        window.clearTimeout(waitTimer);
        waitTimer = window.setTimeout(sendWithout, MAX_WAIT_MS);
      },
      true,
    );

    restore();
  }

  document.querySelectorAll("[data-location]").forEach(setupLocation);
})();
