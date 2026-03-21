(function () {
  var form = document.getElementById("early-access-form");
  var success = document.getElementById("form-success");
  var submitBtn = document.getElementById("submit-btn");
  var formError = document.getElementById("form-error");
  var yearEl = document.getElementById("year");

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  function clearErrors() {
    ["name", "email", "phone", "source", "usage"].forEach(function (id) {
      var el = document.getElementById(id + "-error");
      if (el) el.textContent = "";
    });
    if (formError) {
      formError.textContent = "";
      formError.classList.add("hidden");
    }
  }

  function showError(fieldId, message) {
    var el = document.getElementById(fieldId + "-error");
    if (el) el.textContent = message;
  }

  function validate() {
    clearErrors();
    var ok = true;
    var name = document.getElementById("name");
    var email = document.getElementById("email");
    var phone = document.getElementById("phone");
    var source = document.getElementById("source");
    var usage = document.getElementById("usage");

    var n = (name && name.value.trim()) || "";
    if (!n) {
      showError("name", "Name is required.");
      ok = false;
    }

    var em = (email && email.value.trim()) || "";
    if (!em) {
      showError("email", "Work email is required.");
      ok = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      showError("email", "Enter a valid email address.");
      ok = false;
    }

    var ph = (phone && phone.value.trim()) || "";
    if (!ph) {
      showError("phone", "Phone number is required.");
      ok = false;
    } else if (ph.replace(/\D/g, "").length < 10) {
      showError("phone", "Use at least 10 digits.");
      ok = false;
    }

    if (!source || !source.value) {
      showError("source", "Select a referral source.");
      ok = false;
    }

    if (!usage || !usage.value) {
      showError("usage", "Select an estimated monthly usage range.");
      ok = false;
    }

    return ok;
  }

  function getPayload() {
    return {
      name: document.getElementById("name").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      source: document.getElementById("source").value,
      usage: document.getElementById("usage").value,
      submittedAt: new Date().toISOString(),
    };
  }

  if (!form) return;

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!validate()) return;

    var payload = getPayload();

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }

    fetch("/api/early-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.text().then(function (text) {
          var data = {};
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (ignore) {
              /* non-JSON error page */
            }
          }
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          form.classList.add("hidden");
          if (success) success.classList.remove("hidden");
          return;
        }
        var msg =
          (result.data && result.data.error) ||
          "Something went wrong. Please try again or email info@underwritly.com.";
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
          submitBtn.textContent = "Submit request";
        }
      });
  });
})();
