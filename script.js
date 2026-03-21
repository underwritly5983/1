(function () {
  var form = document.getElementById("early-access-form");
  var success = document.getElementById("form-success");
  var submitBtn = document.getElementById("submit-btn");
  var yearEl = document.getElementById("year");

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  function clearErrors() {
    ["name", "email", "phone", "source", "usage"].forEach(function (id) {
      var el = document.getElementById(id + "-error");
      if (el) el.textContent = "";
    });
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
    console.log("[Underwritly early access]", payload);

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }

    window.setTimeout(function () {
      form.classList.add("hidden");
      if (success) success.classList.remove("hidden");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit request";
      }
    }, 400);
  });
})();
