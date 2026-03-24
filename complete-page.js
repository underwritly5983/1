(function () {
  var COMPLETION_STORAGE = "underwritly_completion_v1";
  var section = document.getElementById("complete-registration");
  var form = document.getElementById("complete-registration-form");
  var lead = document.getElementById("complete-lead-copy");
  var emailInput = document.getElementById("complete-email");
  var passwordEl = document.getElementById("complete-password");
  var password2El = document.getElementById("complete-password2");
  var logoInput = document.getElementById("complete-logo");
  var logoPreview = document.getElementById("complete-logo-preview");
  var logoPreviewImg = document.getElementById("complete-logo-preview-img");
  var submitBtn = document.getElementById("complete-submit-btn");
  var formError = document.getElementById("complete-form-error");
  var tokenError = document.getElementById("complete-token-error");
  var tokenErrorMsg = document.getElementById("complete-token-error-msg");
  var yearEl = document.getElementById("year");
  var toastEl = document.getElementById("page-toast");
  var toastTimer = null;

  var storedToken = null;

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

  function readQueryToken() {
    try {
      var params = new URLSearchParams(window.location.search);
      return params.get("complete_token") || "";
    } catch (e) {
      return "";
    }
  }

  function persistToken(t) {
    storedToken = t;
    try {
      sessionStorage.setItem(COMPLETION_STORAGE, t);
    } catch (ignore) {}
  }

  function getToken() {
    if (storedToken) return storedToken;
    try {
      return sessionStorage.getItem(COMPLETION_STORAGE) || "";
    } catch (e) {
      return "";
    }
  }

  function unlockUI(email) {
    if (section) {
      section.classList.remove("profile-gate--locked");
      section.setAttribute("aria-hidden", "false");
    }
    if (lead) {
      lead.textContent =
        "Choose a password to secure your account. You can add your company logo now or skip it.";
    }
    if (emailInput) emailInput.value = email;
    if (form) form.classList.remove("hidden");
    try {
      var u = new URL(window.location.href);
      u.searchParams.delete("complete_token");
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    } catch (e) {
      /* ignore */
    }
  }

  function showFatal(msg) {
    if (section) {
      section.classList.remove("profile-gate--locked");
      section.setAttribute("aria-hidden", "false");
    }
    if (lead) lead.textContent = "";
    if (form) form.classList.add("hidden");
    if (tokenErrorMsg) tokenErrorMsg.textContent = msg || "This link is invalid or has expired.";
    if (tokenError) tokenError.classList.remove("hidden");
    try {
      sessionStorage.removeItem(COMPLETION_STORAGE);
    } catch (e) {
      /* ignore */
    }
    storedToken = null;
  }

  function clearFieldErrors() {
    ["complete-password", "complete-password2", "complete-logo"].forEach(function (id) {
      var el = document.getElementById(id + "-error");
      if (el) el.textContent = "";
    });
    if (formError) {
      formError.textContent = "";
      formError.classList.add("hidden");
    }
  }

  function validateClient() {
    clearFieldErrors();
    var ok = true;
    var p1 = (passwordEl && passwordEl.value) || "";
    var p2 = (password2El && password2El.value) || "";

    if (p1.length < 10) {
      var el = document.getElementById("complete-password-error");
      if (el) el.textContent = "Password must be at least 10 characters.";
      ok = false;
    } else if (!/[a-zA-Z]/.test(p1)) {
      var el2 = document.getElementById("complete-password-error");
      if (el2) el2.textContent = "Password must include a letter.";
      ok = false;
    } else if (!/[0-9]/.test(p1)) {
      var el3 = document.getElementById("complete-password-error");
      if (el3) el3.textContent = "Password must include a number.";
      ok = false;
    }

    if (p1 !== p2) {
      var el4 = document.getElementById("complete-password2-error");
      if (el4) el4.textContent = "Passwords do not match.";
      ok = false;
    }

    return ok;
  }

  function readLogoPayload(cb) {
    var file = logoInput && logoInput.files && logoInput.files[0];
    if (!file) return cb(null, null);

    if (file.size > 280000) {
      var el = document.getElementById("complete-logo-error");
      if (el) el.textContent = "Logo must be 256 KB or smaller.";
      return cb("size", null);
    }

    var mime = file.type || "";
    if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") {
      var el2 = document.getElementById("complete-logo-error");
      if (el2) el2.textContent = "Use PNG, JPEG, or WebP.";
      return cb("mime", null);
    }

    var reader = new FileReader();
    reader.onload = function () {
      var s = reader.result;
      if (typeof s !== "string" || s.indexOf("base64,") < 0) {
        return cb("read", null);
      }
      var parts = s.split("base64,");
      var b64 = parts[1] || "";
      cb(null, { logoMime: mime, logoBase64: b64 });
    };
    reader.onerror = function () {
      cb("read", null);
    };
    reader.readAsDataURL(file);
  }

  var host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    fetch("/api/complete-registration", { method: "GET", cache: "no-store" }).then(function (r) {
      if (r.status === 404) {
        var warn = document.getElementById("api-env-warning");
        if (warn) warn.classList.remove("hidden");
      }
    });
  }

  if (logoInput && logoPreview && logoPreviewImg) {
    logoInput.addEventListener("change", function () {
      var file = logoInput.files && logoInput.files[0];
      if (!file) {
        logoPreview.classList.add("hidden");
        logoPreview.setAttribute("aria-hidden", "true");
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        logoPreviewImg.src = reader.result;
        logoPreview.classList.remove("hidden");
        logoPreview.setAttribute("aria-hidden", "false");
      };
      reader.readAsDataURL(file);
    });
  }

  var qTok = readQueryToken();
  var token = qTok;
  if (!token) {
    token = getToken();
  } else {
    persistToken(qTok);
  }

  if (!token) {
    showFatal("Open the completion link from your email, or sign in if you already finished setup.");
  } else {
    var verifyUrl =
      "/api/verify-completion-token?complete_token=" + encodeURIComponent(token);
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
          unlockUI(result.data.email);
          return;
        }
        var errMsg =
          (result.data && result.data.error) || "This link is invalid or has expired.";
        showFatal(errMsg);
      })
      .catch(function () {
        showFatal("We could not verify your link. Try again later.");
      });
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var t = getToken();
      if (!t) {
        showToast("Your session link is missing. Open the link from your email again.", "error");
        return;
      }
      if (!validateClient()) {
        showToast("Please fix the highlighted fields.", "error");
        return;
      }

      readLogoPayload(function (err, logoPayload) {
        if (err === "size" || err === "mime") {
          showToast("Fix the logo field or remove the file.", "error");
          return;
        }
        if (err === "read") {
          showToast("Could not read the logo file. Try another image.", "error");
          return;
        }

        var body = {
          completionToken: t,
          password: passwordEl.value,
        };
        if (logoPayload && logoPayload.logoBase64) {
          body.logoMime = logoPayload.logoMime;
          body.logoBase64 = logoPayload.logoBase64;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Saving…";
        }
        if (formError) {
          formError.textContent = "";
          formError.classList.add("hidden");
        }

        fetch("/api/complete-registration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
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
              return { ok: res.ok, status: res.status, data: data };
            });
          })
          .then(function (result) {
            if (result.ok && result.data && result.data.ok) {
              try {
                sessionStorage.removeItem(COMPLETION_STORAGE);
              } catch (ignore) {}
              var dest =
                (result.data.redirect && String(result.data.redirect)) || "/dashboard.html";
              window.location.href = dest;
              return;
            }
            var msg =
              (result.data && result.data.error) ||
              "Something went wrong. Try again or email info@underwritly.com.";
            if (formError) {
              formError.textContent = msg;
              formError.classList.remove("hidden");
            }
            showToast(msg, "error");
          })
          .catch(function () {
            var msg =
              "We could not reach the server. Check your connection or email info@underwritly.com.";
            if (formError) {
              formError.textContent = msg;
              formError.classList.remove("hidden");
            }
            showToast(msg, "error");
          })
          .finally(function () {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = "Save and open dashboard";
            }
          });
      });
    });
  }
})();
