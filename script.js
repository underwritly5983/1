(function () {
  var form = document.getElementById("early-access-form");
  var success = document.getElementById("form-success");
  var submitBtn = document.getElementById("submit-btn");
  var formError = document.getElementById("form-error");
  var yearEl = document.getElementById("year");

  var profileForm = document.getElementById("profile-registration-form");
  var profileSuccess = document.getElementById("profile-form-success");
  var profileSubmitBtn = document.getElementById("profile-submit-btn");
  var profileFormError = document.getElementById("profile-form-error");
  var profileSection = document.getElementById("profile-registration");
  var toastEl = document.getElementById("page-toast");
  var toastTimer = null;

  var PROFILE_ACCESS_STORAGE = "underwritly_profile_access_v1";
  var profileAccessTokenStored = null;

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  function showToast(message, kind) {
    if (!toastEl || !message) return;
    toastEl.textContent = message;
    toastEl.classList.remove("page-toast--success", "page-toast--error");
    toastEl.classList.add(kind === "error" ? "page-toast--error" : "page-toast--success");
    toastEl.classList.add("is-visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, 5200);
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

  function unlockProfileRegistration(token, emailFromToken) {
    profileAccessTokenStored = token;
    try {
      sessionStorage.setItem(PROFILE_ACCESS_STORAGE, token);
    } catch (ignore) {}
    document.body.classList.add("page-profile-flow");
    var inviteOnly = document.getElementById("register-invite-only");
    if (inviteOnly) inviteOnly.classList.add("hidden");
    if (profileSection) {
      profileSection.classList.remove("profile-gate--locked");
      profileSection.setAttribute("aria-hidden", "false");
    }
    var emailInput = document.getElementById("profile-email");
    if (emailInput && emailFromToken) {
      emailInput.value = emailFromToken;
      emailInput.readOnly = true;
      emailInput.setAttribute("readonly", "readonly");
    }
  }

  function readProfileAccessQueryToken() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("profile_access") || "";
    } catch (e) {
      return "";
    }
  }

  function initProfileGate() {
    if (!profileSection) return;

    var qToken = readProfileAccessQueryToken();
    var token = qToken;
    if (!token) {
      try {
        token = sessionStorage.getItem(PROFILE_ACCESS_STORAGE) || "";
      } catch (e) {
        token = "";
      }
    }
    if (!token) return;

    var verifyUrl = "/api/verify?profile_access=" + encodeURIComponent(token);
    fetch(verifyUrl, { method: "GET", cache: "no-store" })
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
        if (result.ok && result.data && result.data.ok === true && result.data.email) {
          unlockProfileRegistration(token, result.data.email);
          if (qToken) {
            try {
              var u = new URL(window.location.href);
              u.searchParams.delete("profile_access");
              window.history.replaceState({}, "", u.pathname + u.search + u.hash);
            } catch (e) {
              /* ignore */
            }
          }
          requestAnimationFrame(function () {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          });
          return;
        }
        try {
          sessionStorage.removeItem(PROFILE_ACCESS_STORAGE);
        } catch (e) {
          /* ignore */
        }
        profileAccessTokenStored = null;
        var errMsg =
          (result.data && result.data.error) || "Registration link is invalid or expired.";
        showToast(errMsg, "error");
      })
      .catch(function () {
        try {
          sessionStorage.removeItem(PROFILE_ACCESS_STORAGE);
        } catch (e) {
          /* ignore */
        }
        profileAccessTokenStored = null;
        showToast("Could not verify your registration link. Try again later.", "error");
      });
  }

  function getProfileAccessTokenForSubmit() {
    if (profileAccessTokenStored) return profileAccessTokenStored;
    try {
      return sessionStorage.getItem(PROFILE_ACCESS_STORAGE) || "";
    } catch (e) {
      return "";
    }
  }

  function clearProfileErrors() {
    ["profile-name", "profile-email", "profile-company", "profile-role", "profile-phone", "profile-confirm"].forEach(
      function (id) {
        var el = document.getElementById(id + "-error");
        if (el) el.textContent = "";
      }
    );
    if (profileFormError) {
      profileFormError.textContent = "";
      profileFormError.classList.add("hidden");
    }
  }

  function showProfileFieldError(fieldId, message) {
    var el = document.getElementById(fieldId + "-error");
    if (el) el.textContent = message;
  }

  function validateProfile() {
    clearProfileErrors();
    var ok = true;
    var name = document.getElementById("profile-name");
    var email = document.getElementById("profile-email");
    var company = document.getElementById("profile-company");
    var role = document.getElementById("profile-role");
    var phone = document.getElementById("profile-phone");
    var confirmCb = document.getElementById("profile-confirm");

    var n = (name && name.value.trim()) || "";
    if (!n) {
      showProfileFieldError("profile-name", "Name is required.");
      ok = false;
    }

    var em = (email && email.value.trim()) || "";
    if (!em) {
      showProfileFieldError("profile-email", "Work email is required.");
      ok = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      showProfileFieldError("profile-email", "Enter a valid email address.");
      ok = false;
    }

    var co = (company && company.value.trim()) || "";
    if (!co) {
      showProfileFieldError("profile-company", "Company is required.");
      ok = false;
    }

    var r = (role && role.value.trim()) || "";
    if (!r) {
      showProfileFieldError("profile-role", "Job title is required.");
      ok = false;
    }

    var ph = (phone && phone.value.trim()) || "";
    if (!ph) {
      showProfileFieldError("profile-phone", "Phone number is required.");
      ok = false;
    } else if (ph.replace(/\D/g, "").length < 10) {
      showProfileFieldError("profile-phone", "Use at least 10 digits.");
      ok = false;
    }

    if (!confirmCb || !confirmCb.checked) {
      showProfileFieldError("profile-confirm", "Please confirm your details before submitting.");
      ok = false;
    }

    return ok;
  }

  function getProfilePayload() {
    return {
      name: document.getElementById("profile-name").value.trim(),
      email: document.getElementById("profile-email").value.trim(),
      company: document.getElementById("profile-company").value.trim(),
      role: document.getElementById("profile-role").value.trim(),
      phone: document.getElementById("profile-phone").value.trim(),
      profileAccessToken: getProfileAccessTokenForSubmit(),
      submittedAt: new Date().toISOString(),
    };
  }

  var host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    fetch("/api/early-access", { method: "GET", cache: "no-store" }).then(function (r) {
      if (r.status === 404) {
        var warn = document.getElementById("api-env-warning");
        if (warn) warn.classList.remove("hidden");
      }
    });
  }

  if (form) {
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
  }

  if (profileForm) {
    profileForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!getProfileAccessTokenForSubmit()) {
        showToast("Open the private profile link from your early access confirmation email.", "error");
        return;
      }
      if (!validateProfile()) {
        showToast("Please fix the highlighted fields.", "error");
        return;
      }

      var payload = getProfilePayload();

      if (profileSubmitBtn) {
        profileSubmitBtn.disabled = true;
        profileSubmitBtn.textContent = "Submitting…";
      }

      fetch("/api/profile-registration", {
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
            profileForm.classList.add("hidden");
            if (profileSuccess) profileSuccess.classList.remove("hidden");
            showToast("Profile saved — check your email to finish setup and open your dashboard.", "success");
            return;
          }
          var msg =
            (result.data && result.data.error) ||
            "Something went wrong. Please try again or email info@underwritly.com.";
          if (profileFormError) {
            profileFormError.textContent = msg;
            profileFormError.classList.remove("hidden");
          }
          showToast(msg, "error");
        })
        .catch(function () {
          var msg =
            "We could not reach the server. Check your connection or email info@underwritly.com.";
          if (profileFormError) {
            profileFormError.textContent = msg;
            profileFormError.classList.remove("hidden");
          }
          showToast(msg, "error");
        })
        .finally(function () {
          if (profileSubmitBtn) {
            profileSubmitBtn.disabled = false;
            profileSubmitBtn.textContent = "Complete profile";
          }
        });
    });
  }

  initProfileGate();
})();
