(function () {
  var yearEl = document.getElementById("year");
  var form = document.getElementById("insured-verify-form");
  var errEl = document.getElementById("insured-verify-error");
  var submitBtn = document.getElementById("insured-verify-submit");

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  var params = new URLSearchParams(window.location.search);
  var verifyToken = params.get("t") || "";

  if (!verifyToken) {
    if (errEl) {
      errEl.textContent = "Missing verification link. Use the link from your email.";
      errEl.classList.remove("hidden");
    }
    if (form) form.classList.add("hidden");
    return;
  }

  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var codeEl = document.getElementById("mfa-code");
    var code = codeEl ? String(codeEl.value || "").replace(/\D/g, "").slice(0, 6) : "";
    if (errEl) {
      errEl.classList.add("hidden");
      errEl.textContent = "";
    }
    if (submitBtn) submitBtn.disabled = true;
    fetch("/api/session", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "verify_mfa",
        verifyToken: verifyToken,
        code: code,
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
        if (result.ok && result.data && result.data.ok === true && result.data.uploadUrl) {
          window.location.href = result.data.uploadUrl;
          return;
        }
        var msg = (result.data && result.data.error) || "Verification failed.";
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
