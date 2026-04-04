(function () {
  var form = document.getElementById("sub-broker-form");
  var emailInput = document.getElementById("sub-broker-email");
  var codeInput = document.getElementById("sub-broker-code");
  var passwordEl = document.getElementById("sub-broker-password");
  var nameEl = document.getElementById("sub-broker-name");
  var phoneEl = document.getElementById("sub-broker-phone");
  var roleEl = document.getElementById("sub-broker-role");
  var submitBtn = document.getElementById("sub-broker-submit");
  var formError = document.getElementById("sub-broker-form-error");
  var pwErr = document.getElementById("sub-broker-password-error");
  var yearEl = document.getElementById("year");

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  try {
    var params = new URLSearchParams(window.location.search);
    var em = params.get("email");
    if (em && emailInput) emailInput.value = em.trim();
  } catch (e) {
    /* ignore */
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (formError) {
        formError.textContent = "";
        formError.classList.add("hidden");
      }
      if (pwErr) pwErr.textContent = "";

      var payload = {
        email: (emailInput && emailInput.value) || "",
        code: (codeInput && codeInput.value) || "",
        password: (passwordEl && passwordEl.value) || "",
        name: (nameEl && nameEl.value) || "",
        phone: (phoneEl && phoneEl.value) || "",
        role: (roleEl && roleEl.value) || "",
      };

      if (submitBtn) submitBtn.disabled = true;
      fetch("/api/complete-sub-broker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (result.ok && result.data && result.data.ok && result.data.redirect) {
            window.location.assign(result.data.redirect);
            return;
          }
          var msg =
            (result.data && (result.data.error || result.data.message)) ||
            "Could not complete setup.";
          if (formError) {
            formError.textContent = msg;
            formError.classList.remove("hidden");
          } else {
            alert(msg);
          }
        })
        .catch(function () {
          if (formError) {
            formError.textContent = "Network error.";
            formError.classList.remove("hidden");
          }
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }
})();
