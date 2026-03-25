(function () {
  var form = document.getElementById("reset-form");
  var submitBtn = document.getElementById("reset-submit-btn");
  var formError = document.getElementById("reset-form-error");
  var yearEl = document.getElementById("year");

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  function getToken() {
    try {
      var p = new URLSearchParams(window.location.search);
      return p.get("reset_token") || "";
    } catch (e) {
      return "";
    }
  }

  function clearErrors() {
    ["reset-password", "reset-password-confirm"].forEach(function (id) {
      var el = document.getElementById(id + "-error");
      if (el) el.textContent = "";
    });
    if (formError) {
      formError.textContent = "";
      formError.classList.add("hidden");
    }
  }

  if (!getToken() && formError) {
    formError.textContent = "Missing reset token. Request a new reset link from the sign-in page.";
    formError.classList.remove("hidden");
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors();
      var token = getToken();
      if (!token) return;
      var passEl = document.getElementById("reset-password");
      var cEl = document.getElementById("reset-password-confirm");
      var pw = (passEl && passEl.value) || "";
      var cpw = (cEl && cEl.value) || "";
      var ok = true;
      if (!pw) {
        var e1 = document.getElementById("reset-password-error");
        if (e1) e1.textContent = "Password is required.";
        ok = false;
      } else if (pw.length < 10 || !/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) {
        var e2 = document.getElementById("reset-password-error");
        if (e2) e2.textContent = "Use at least 10 characters, including a letter and a number.";
        ok = false;
      }
      if (pw !== cpw) {
        var e3 = document.getElementById("reset-password-confirm-error");
        if (e3) e3.textContent = "Passwords do not match.";
        ok = false;
      }
      if (!ok) return;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Updating…";
      }
      fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "reset_password", resetToken: token, password: pw }),
      })
        .then(function (res) {
          return res.text().then(function (text) {
            var data = {};
            if (text) {
              try {
                data = JSON.parse(text);
              } catch (ignore) {}
            }
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (result.ok && result.data && result.data.ok) {
            window.location.href = "/login.html?reset=ok";
            return;
          }
          var msg = (result.data && result.data.error) || "Could not reset password.";
          if (formError) {
            formError.textContent = msg;
            formError.classList.remove("hidden");
          }
        })
        .catch(function () {
          if (formError) {
            formError.textContent = "Network error. Please try again.";
            formError.classList.remove("hidden");
          }
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Update password";
          }
        });
    });
  }
})();
