(function () {
  var form = document.getElementById("login-form");
  var submitBtn = document.getElementById("login-submit-btn");
  var formError = document.getElementById("login-form-error");
  var yearEl = document.getElementById("year");

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  var host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    fetch("/api/login", { method: "GET", cache: "no-store" }).then(function (r) {
      if (r.status === 404) {
        var warn = document.getElementById("api-env-warning");
        if (warn) warn.classList.remove("hidden");
      }
    });
  }

  function clearErrors() {
    ["login-email", "login-password"].forEach(function (id) {
      var el = document.getElementById(id + "-error");
      if (el) el.textContent = "";
    });
    if (formError) {
      formError.textContent = "";
      formError.classList.add("hidden");
    }
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors();

      var emailEl = document.getElementById("login-email");
      var passEl = document.getElementById("login-password");
      var em = (emailEl && emailEl.value.trim()) || "";
      var pw = (passEl && passEl.value) || "";

      var ok = true;
      if (!em) {
        var e1 = document.getElementById("login-email-error");
        if (e1) e1.textContent = "Email is required.";
        ok = false;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
        var e2 = document.getElementById("login-email-error");
        if (e2) e2.textContent = "Enter a valid email address.";
        ok = false;
      }
      if (!pw) {
        var e3 = document.getElementById("login-password-error");
        if (e3) e3.textContent = "Password is required.";
        ok = false;
      }
      if (!ok) return;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Signing in…";
      }

      fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: em, password: pw }),
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
          if (result.ok && result.data && result.data.ok) {
            var dest =
              (result.data.redirect && String(result.data.redirect)) || "/dashboard.html";
            window.location.href = dest;
            return;
          }
          var msg =
            (result.data && result.data.error) ||
            "Could not sign in. Try again or email info@underwritly.com.";
          if (formError) {
            formError.textContent = msg;
            formError.classList.remove("hidden");
          }
        })
        .catch(function () {
          if (formError) {
            formError.textContent =
              "We could not reach the server. Check your connection or email info@underwritly.com.";
            formError.classList.remove("hidden");
          }
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Sign in";
          }
        });
    });
  }
})();
