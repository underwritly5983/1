(function () {
  var yearEl = document.getElementById("year");
  var loadingEl = document.getElementById("dashboard-loading");
  var guestEl = document.getElementById("dashboard-guest");
  var contentEl = document.getElementById("dashboard-content");
  var logoutBtn = document.getElementById("dashboard-logout");
  var nameEl = document.getElementById("dashboard-name");
  var emailEl = document.getElementById("dashboard-email");
  var companyEl = document.getElementById("dashboard-company");
  var roleEl = document.getElementById("dashboard-role");
  var phoneEl = document.getElementById("dashboard-phone");
  var logoWrap = document.getElementById("dashboard-logo-wrap");
  var logoImg = document.getElementById("dashboard-logo");

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  var host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    fetch("/api/session", { method: "GET", cache: "no-store" }).then(function (r) {
      if (r.status === 404) {
        var warn = document.getElementById("api-env-warning");
        if (warn) warn.classList.remove("hidden");
      }
    });
  }

  function showGuest() {
    if (loadingEl) loadingEl.classList.add("hidden");
    if (guestEl) guestEl.classList.remove("hidden");
    if (contentEl) contentEl.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
  }

  function showContent(user) {
    if (loadingEl) loadingEl.classList.add("hidden");
    if (guestEl) guestEl.classList.add("hidden");
    if (contentEl) contentEl.classList.remove("hidden");
    if (logoutBtn) logoutBtn.classList.remove("hidden");

    var displayName = (user && user.name && String(user.name).trim()) || "there";
    if (nameEl) nameEl.textContent = "Hi, " + displayName.split(/\s+/)[0];
    if (emailEl) emailEl.textContent = (user && user.email) || "";
    if (companyEl) companyEl.textContent = (user && user.company) || "—";
    if (roleEl) roleEl.textContent = (user && user.role) || "—";
    if (phoneEl) phoneEl.textContent = (user && user.phone) || "—";

    var logo = user && user.logoDataUrl;
    if (logo && logoImg && logoWrap) {
      logoImg.src = logo;
      logoImg.alt = (user.company || "Company") + " logo";
      logoWrap.classList.remove("hidden");
    } else if (logoWrap) {
      logoWrap.classList.add("hidden");
    }
  }

  fetch("/api/session", { method: "GET", cache: "no-store", credentials: "same-origin" })
    .then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (ignore) {
            /* non-JSON */
          }
        }
        return { ok: res.ok, data: data };
      });
    })
    .then(function (result) {
      if (result.ok && result.data && result.data.ok === true && result.data.user) {
        showContent(result.data.user);
        return;
      }
      showGuest();
    })
    .catch(function () {
      showGuest();
    });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      logoutBtn.disabled = true;
      fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
        .finally(function () {
          window.location.href = "/login.html";
        });
    });
  }
})();
