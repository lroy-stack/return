/* Finder pages: progressive enhancement only. Every form works without this file. */
(() => {
  /* Share where I found it: GPS is read only after a click, then previewed and confirmed. */
  function setupLocation(root) {
    var start = root.querySelector("[data-gps-start]");
    if (!start || !("geolocation" in navigator)) return;
    var preview = root.querySelector("[data-gps-preview]");
    var status = root.querySelector("[data-gps-status]");
    var coordsEl = root.querySelector("[data-gps-coords]");
    var accuracyEl = root.querySelector("[data-gps-accuracy]");
    var form = root.closest("form");
    var field = (name) => form.elements.namedItem(name);
    var pending = null;

    start.hidden = false;

    function clear() {
      pending = null;
      field("location_source").value = "manual";
      field("location_lat").value = "";
      field("location_lng").value = "";
      field("location_accuracy").value = "";
      field("location_confirmed").checked = false;
      preview.hidden = true;
      status.textContent = "";
    }

    function fail(error) {
      var key =
        error && error.code === 1 ? "msgDenied" : error && error.code === 3 ? "msgTimeout" : "msgUnavailable";
      status.textContent = root.dataset[key] || "";
      start.disabled = false;
    }

    start.addEventListener("click", () => {
      start.disabled = true;
      status.textContent = root.dataset.msgLocating || "";
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          start.disabled = false;
          pending = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          };
          coordsEl.textContent = `${pending.lat.toFixed(5)}, ${pending.lng.toFixed(5)}`;
          accuracyEl.textContent = `±${pending.accuracy}`;
          status.textContent = "";
          preview.hidden = false;
          var confirmButton = root.querySelector("[data-gps-confirm]");
          if (confirmButton) confirmButton.focus();
        },
        fail,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });

    root.querySelector("[data-gps-confirm]").addEventListener("click", () => {
      if (!pending) return;
      field("location_source").value = "gps";
      field("location_lat").value = String(pending.lat);
      field("location_lng").value = String(pending.lng);
      field("location_accuracy").value = String(pending.accuracy);
      field("location_confirmed").checked = true;
      preview.hidden = true;
      status.textContent = `${root.dataset.msgAttached || ""} (±${pending.accuracy} ${root.dataset.unit || "m"})`;
    });

    root.querySelector("[data-gps-cancel]").addEventListener("click", clear);
  }

  /* Copy the private conversation link. */
  function setupCopy() {
    var button = document.querySelector("[data-copy]");
    if (!button || !navigator.clipboard) return;
    button.hidden = false;
    var label = button.textContent;
    button.addEventListener("click", () => {
      navigator.clipboard.writeText(window.location.href).then(() => {
        button.textContent = button.dataset.copied || label;
        window.setTimeout(() => {
          button.textContent = label;
        }, 2500);
      });
    });
  }

  /* Poll for new activity every 30 s; only show a banner, never reload under the user's hands. */
  function setupPolling() {
    var host = document.querySelector("[data-poll-url]");
    var banner = document.querySelector("[data-new-banner]");
    if (!host || !banner) return;
    var url = host.dataset.pollUrl;
    var last = host.dataset.lastActivity;

    function check() {
      if (document.hidden || !banner.hidden) return;
      fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.lastActivityAt && data.lastActivityAt !== last) banner.hidden = false;
        })
        .catch(() => {});
    }

    window.setInterval(check, 30000);
    document.addEventListener("visibilitychange", check);
  }

  /* Show timestamps in the viewer's own time zone. */
  function localizeTimes() {
    var lang = document.documentElement.lang || undefined;
    var formatter;
    try {
      formatter = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
    } catch (_e) {
      return;
    }
    document.querySelectorAll("time[data-local-time]").forEach((el) => {
      var date = new Date(el.getAttribute("datetime"));
      if (!Number.isNaN(date.getTime())) el.textContent = formatter.format(date);
    });
  }

  document.querySelectorAll("[data-location]").forEach(setupLocation);
  setupCopy();
  setupPolling();
  localizeTimes();
})();
