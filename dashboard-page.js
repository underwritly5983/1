(function () {
  var yearEl = document.getElementById("year");
  var loadingEl = document.getElementById("dashboard-loading");
  var guestEl = document.getElementById("dashboard-guest");
  var contentEl = document.getElementById("dashboard-content");
  var logoutBtn = document.getElementById("dashboard-logout");
  var insuredsLoadingEl = document.getElementById("insureds-loading");
  var insuredsErrorEl = document.getElementById("insureds-error");
  var insuredsTableWrap = document.getElementById("insureds-table-wrap");
  var insuredsTbody = document.getElementById("insureds-tbody");
  var insuredsEmptyEl = document.getElementById("insureds-empty");
  var nameEl = document.getElementById("dashboard-name");
  var emailEl = document.getElementById("dashboard-email");
  var companyEl = document.getElementById("dashboard-company");
  var roleEl = document.getElementById("dashboard-role");
  var phoneEl = document.getElementById("dashboard-phone");
  var logoWrap = document.getElementById("dashboard-logo-wrap");
  var logoImg = document.getElementById("dashboard-logo");
  var iftaLockedEl = document.getElementById("dashboard-ifta-locked");
  var iftaAllowedEl = document.getElementById("dashboard-ifta-allowed");
  var iftaOpenBtn = document.getElementById("dashboard-ifta-open");
  var iftaLaunchErrEl = document.getElementById("dashboard-ifta-launch-err");

  var currentUser = null;

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

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function canOpenIfta(user) {
    return !!user;
  }

  function showGuest() {
    if (loadingEl) loadingEl.classList.add("hidden");
    if (guestEl) guestEl.classList.remove("hidden");
    if (contentEl) contentEl.classList.add("hidden");
    if (logoutBtn) logoutBtn.classList.add("hidden");
  }

  function renderInsuredRows(user, rows) {
    if (!insuredsTbody) return;
    if (insuredsLoadingEl) insuredsLoadingEl.classList.add("hidden");
    insuredsTbody.innerHTML = "";
    if (insuredsTableWrap) insuredsTableWrap.classList.add("hidden");
    if (insuredsEmptyEl) insuredsEmptyEl.classList.add("hidden");
    var list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      if (insuredsEmptyEl) insuredsEmptyEl.classList.remove("hidden");
      return;
    }
    if (insuredsTableWrap) insuredsTableWrap.classList.remove("hidden");
    var iftaOk = canOpenIfta(user);
    list.forEach(function (r) {
      var id = r.id;
      var st = r.status || "";
      var iftaCell = "—";
      if (iftaOk) {
        iftaCell =
          '<button type="button" class="btn btn-ghost btn-sm dashboard-insured-ifta" data-insured-id="' +
          esc(String(id)) +
          '" title="Open IFTA Summary with this insured">' +
          '<span class="dashboard-insured-ifta-icon" aria-hidden="true">⛽</span> IFTA</button>';
      }
      var canResend =
        st === "pending_mfa" || st === "awaiting_upload" || st === "completed";
      var resendTitle = !canResend
        ? "Resend not available for this status"
        : st === "pending_mfa"
          ? "Resend verification code email"
          : st === "awaiting_upload"
            ? "Resend upload link email"
            : "Send a friendly reminder with a fresh upload link";
      var resendBtn =
        '<button type="button" class="btn btn-ghost btn-sm dashboard-insured-resend" data-insured-id="' +
        esc(String(id)) +
        '"' +
        (canResend ? "" : " disabled") +
        ' title="' +
        esc(resendTitle) +
        '">Resend email</button>';
      var deleteBtn =
        '<button type="button" class="btn btn-ghost btn-sm dashboard-insured-delete" data-insured-id="' +
        esc(String(id)) +
        '" title="Remove this insured from your list">Delete</button>';
      var actionsCell =
        '<div class="dashboard-insured-actions">' + resendBtn + deleteBtn + "</div>";
      var fileCount =
        typeof r.uploadCount === "number" && r.uploadCount > 0
          ? String(r.uploadCount)
          : "—";
      var tr =
        "<tr><td>" +
        esc(r.name) +
        "</td><td>" +
        esc(r.email) +
        "</td><td>" +
        esc(r.statusLabel || r.status) +
        "</td><td>" +
        esc(fileCount) +
        "</td><td>" +
        iftaCell +
        "</td><td>" +
        actionsCell +
        "</td></tr>";
      insuredsTbody.insertAdjacentHTML("beforeend", tr);
    });
  }

  function refreshInsureds() {
    if (!currentUser) return Promise.resolve();
    if (insuredsErrorEl) {
      insuredsErrorEl.classList.add("hidden");
      insuredsErrorEl.textContent = "";
      insuredsErrorEl.classList.add("field-error");
      insuredsErrorEl.style.color = "";
    }
    return fetch("/api/session?include=insureds", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
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
        if (result.ok && result.data && result.data.ok === true && result.data.insureds) {
          renderInsuredRows(currentUser, result.data.insureds);
        }
      })
      .catch(function () {
        /* ignore */
      });
  }

  function showContent(user, insureds) {
    currentUser = user || null;
    if (loadingEl) loadingEl.classList.add("hidden");
    if (guestEl) guestEl.classList.add("hidden");
    if (contentEl) contentEl.classList.remove("hidden");
    if (logoutBtn) logoutBtn.classList.remove("hidden");
    if (insuredsLoadingEl) insuredsLoadingEl.classList.add("hidden");

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

    var iftaAllowed = !!user;
    if (iftaAllowed) {
      if (iftaAllowedEl) iftaAllowedEl.classList.remove("hidden");
      if (iftaLockedEl) iftaLockedEl.classList.add("hidden");
      if (iftaLaunchErrEl) {
        iftaLaunchErrEl.classList.add("hidden");
        iftaLaunchErrEl.textContent = "";
      }
    } else {
      if (iftaAllowedEl) iftaAllowedEl.classList.add("hidden");
      if (iftaLockedEl) iftaLockedEl.classList.remove("hidden");
    }

    renderInsuredRows(user, insureds);
  }

  fetch("/api/session?include=insureds", { method: "GET", cache: "no-store", credentials: "same-origin" })
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
        showContent(result.data.user, result.data.insureds);
        return;
      }
      showGuest();
    })
    .catch(function () {
      showGuest();
    });

  if (iftaOpenBtn) {
    iftaOpenBtn.addEventListener("click", function () {
      if (iftaLaunchErrEl) {
        iftaLaunchErrEl.classList.add("hidden");
        iftaLaunchErrEl.textContent = "";
      }
      iftaOpenBtn.disabled = true;
      fetch("/api/session?launch=ifta", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
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
          if (
            result.ok &&
            result.data &&
            result.data.ok === true &&
            result.data.iftaLaunchUrl
          ) {
            window.location.assign(result.data.iftaLaunchUrl);
            return;
          }
          var msg =
            (result.data && result.data.error) ||
            "Could not open IFTA. Try again or contact support.";
          if (iftaLaunchErrEl) {
            iftaLaunchErrEl.textContent = msg;
            iftaLaunchErrEl.classList.remove("hidden");
          }
        })
        .catch(function () {
          if (iftaLaunchErrEl) {
            iftaLaunchErrEl.textContent = "Network error.";
            iftaLaunchErrEl.classList.remove("hidden");
          }
        })
        .finally(function () {
          iftaOpenBtn.disabled = false;
        });
    });
  }

  if (contentEl) {
    contentEl.addEventListener("click", function (e) {
      var resendBtn = e.target && e.target.closest && e.target.closest(".dashboard-insured-resend");
      if (resendBtn) {
        if (resendBtn.disabled) return;
        var rid = resendBtn.getAttribute("data-insured-id");
        if (!rid) return;
        resendBtn.disabled = true;
        fetch("/api/session", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resend_insured_email", insuredId: parseInt(rid, 10) }),
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
              var okMsg =
                (result.data && result.data.message) || "Email sent.";
              return refreshInsureds().then(function () {
                if (insuredsErrorEl) {
                  insuredsErrorEl.textContent = okMsg;
                  insuredsErrorEl.classList.remove("hidden", "field-error");
                  insuredsErrorEl.style.color = "#15803d";
                  setTimeout(function () {
                    insuredsErrorEl.classList.add("hidden", "field-error");
                    insuredsErrorEl.style.color = "";
                  }, 6000);
                }
              });
            }
            var msg =
              (result.data && result.data.error) || "Could not resend email.";
            if (insuredsErrorEl) {
              insuredsErrorEl.textContent = msg;
              insuredsErrorEl.classList.remove("hidden");
              insuredsErrorEl.classList.add("field-error");
            } else {
              alert(msg);
            }
          })
          .catch(function () {
            if (insuredsErrorEl) {
              insuredsErrorEl.textContent = "Network error.";
              insuredsErrorEl.classList.remove("hidden");
            } else {
              alert("Network error.");
            }
          })
          .finally(function () {
            resendBtn.disabled = false;
          });
        return;
      }

      var delBtn = e.target && e.target.closest && e.target.closest(".dashboard-insured-delete");
      if (delBtn) {
        var did = delBtn.getAttribute("data-insured-id");
        if (!did) return;
        if (
          !confirm(
            "Delete this insured from your list? This cannot be undone."
          )
        ) {
          return;
        }
        delBtn.disabled = true;
        fetch("/api/session", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete_insured", insuredId: parseInt(did, 10) }),
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
              refreshInsureds();
              return;
            }
            var msg =
              (result.data && result.data.error) || "Could not delete insured.";
            if (insuredsErrorEl) {
              insuredsErrorEl.textContent = msg;
              insuredsErrorEl.classList.remove("hidden");
            } else {
              alert(msg);
            }
          })
          .catch(function () {
            if (insuredsErrorEl) {
              insuredsErrorEl.textContent = "Network error.";
              insuredsErrorEl.classList.remove("hidden");
            } else {
              alert("Network error.");
            }
          })
          .finally(function () {
            delBtn.disabled = false;
          });
        return;
      }

      var btn = e.target && e.target.closest && e.target.closest(".dashboard-insured-ifta");
      if (!btn) return;
      var sid = btn.getAttribute("data-insured-id");
      if (!sid) return;
      btn.disabled = true;
      fetch("/api/session?launch=ifta&insuredId=" + encodeURIComponent(sid), {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
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
          if (result.ok && result.data && result.data.ok === true && result.data.iftaLaunchUrl) {
            window.location.assign(result.data.iftaLaunchUrl);
            return;
          }
          alert((result.data && result.data.error) || "Could not open IFTA Summary.");
        })
        .catch(function () {
          alert("Network error.");
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  }

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
