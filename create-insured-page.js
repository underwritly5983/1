(function () {
  var yearEl = document.getElementById("year");
  var form = document.getElementById("create-insured-form");
  var errEl = document.getElementById("create-insured-error");
  var submitBtn = document.getElementById("create-insured-submit");

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  if (!form) return;

  fetch("/api/session", { method: "GET", credentials: "same-origin", cache: "no-store" })
    .then(function (res) {
      return res.json().catch(function () {
        return {};
      });
    })
    .then(function (data) {
      if (!data || data.ok !== true || !data.user) {
        window.location.href = "/login.html";
      }
    })
    .catch(function () {
      window.location.href = "/login.html";
    });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (errEl) {
      errEl.classList.add("hidden");
      errEl.textContent = "";
    }
    var name = document.getElementById("insured-name");
    var email = document.getElementById("insured-email");
    var phone = document.getElementById("insured-phone");
    var nameV = name ? String(name.value || "").trim() : "";
    var emailV = email ? String(email.value || "").trim() : "";
    var phoneV = phone ? String(phone.value || "").trim() : "";
    if (!nameV || nameV.length > 200) {
      if (errEl) {
        errEl.textContent = "Enter a valid insured name.";
        errEl.classList.remove("hidden");
      }
      return;
    }
    if (emailV && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailV)) {
      if (errEl) {
        errEl.textContent = "Enter a valid email address.";
        errEl.classList.remove("hidden");
      }
      return;
    }
    if (emailV && (!phoneV || phoneV.length < 7)) {
      if (errEl) {
        errEl.textContent = "Enter a phone number (at least 7 digits) when an email is provided.";
        errEl.classList.remove("hidden");
      }
      return;
    }
    if (submitBtn) submitBtn.disabled = true;
    fetch("/api/session", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        name: nameV,
        email: emailV,
        phone: phoneV,
      }),
    })
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
        if (result.ok && result.data && result.data.ok === true) {
          window.location.href = "/dashboard.html?insured_created=1";
          return;
        }
        var msg = (result.data && result.data.error) || "Could not create insured.";
        if (errEl) {
          errEl.textContent = msg;
          errEl.classList.remove("hidden");
        }
      })
      .catch(function () {
        if (errEl) {
          errEl.textContent = "Network error.";
          errEl.classList.remove("hidden");
        }
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
})();
