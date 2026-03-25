(function () {
  var loginPanel = document.getElementById("admin-login-panel");
  var appPanel = document.getElementById("admin-app");
  var form = document.getElementById("admin-login-form");
  var submitBtn = document.getElementById("admin-login-submit");
  var formError = document.getElementById("admin-form-error");
  var logoutBtn = document.getElementById("admin-logout-btn");
  var userLabel = document.getElementById("admin-user-label");

  var submissionLogCache = [];
  var currentInboxRows = [];
  var inboxFilter = "all";

  var ENTRY_FIELD_ORDER = [
    "id",
    "receivedAt",
    "submittedAt",
    "name",
    "email",
    "phone",
    "company",
    "role",
    "source",
    "usage",
    "completedAt",
  ];

  var ENTRY_LABELS = {
    id: "Entry ID",
    receivedAt: "Received",
    submittedAt: "Submitted",
    name: "Name",
    email: "Email",
    phone: "Phone",
    company: "Company",
    role: "Job title",
    source: "Source",
    usage: "Usage",
    completedAt: "Completed",
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return esc(iso);
      return esc(d.toLocaleString());
    } catch (e) {
      return esc(iso);
    }
  }

  function labelForKey(k) {
    return ENTRY_LABELS[k] || k.replace(/_/g, " ");
  }

  function formatValue(v) {
    if (v == null || v === "") return "—";
    if (typeof v === "object") return JSON.stringify(v, null, 2);
    return String(v);
  }

  function showApp(email) {
    if (loginPanel) loginPanel.classList.add("hidden");
    if (appPanel) appPanel.classList.remove("hidden");
    if (userLabel) {
      userLabel.textContent = email || "";
      userLabel.classList.remove("hidden");
    }
    if (logoutBtn) logoutBtn.classList.remove("hidden");
    loadSubmissions();
  }

  function showLogin() {
    if (loginPanel) loginPanel.classList.remove("hidden");
    if (appPanel) appPanel.classList.add("hidden");
    if (userLabel) {
      userLabel.textContent = "";
      userLabel.classList.add("hidden");
    }
    if (logoutBtn) logoutBtn.classList.add("hidden");
    closeEntryModal();
  }

  function renderTable(tbodyId, rows, emptyId, renderRow) {
    var tbody = document.getElementById(tbodyId);
    var emptyEl = document.getElementById(emptyId);
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!rows || !rows.length) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      return;
    }
    if (emptyEl) emptyEl.classList.add("hidden");
    rows.forEach(function (row) {
      tbody.insertAdjacentHTML("beforeend", renderRow(row));
    });
  }

  function renderEarlyAccessQueue(rows) {
    var tbody = document.getElementById("tbody-ea-queue");
    var emptyEl = document.getElementById("empty-ea-queue");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!rows || !rows.length) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      return;
    }
    if (emptyEl) emptyEl.classList.add("hidden");
    rows.forEach(function (r) {
      var em = (r && r.email) || "";
      tbody.insertAdjacentHTML(
        "beforeend",
        '<tr data-email="' +
          escAttr(em) +
          '"><td>' +
          fmtDate(r.profileSubmittedAt) +
          "</td><td>" +
          esc(em) +
          "</td><td>" +
          esc(r.name) +
          "</td><td>" +
          esc(r.company) +
          '</td><td><div class="admin-approve-wrap"><button type="button" class="btn btn-primary btn-sm admin-approve-early">Approve early access</button>' +
          '<span class="admin-role-status" role="status"></span></div></td></tr>'
      );
    });
  }

  function renderStats(stats) {
    var el = document.getElementById("admin-submission-stats");
    if (!el || !stats) return;
    el.textContent =
      stats.total +
      " entr" +
      (stats.total === 1 ? "y" : "ies") +
      " — Early access: " +
      stats.early_access +
      ", Profile: " +
      stats.profile_registration +
      ", Account: " +
      stats.account_completion;
  }

  function renderInbox() {
    var log = submissionLogCache || [];
    var filtered =
      inboxFilter === "all"
        ? log.slice()
        : log.filter(function (r) {
            return r.formType === inboxFilter;
          });
    currentInboxRows = filtered;
    var tbody = document.getElementById("tbody-inbox");
    var emptyEl = document.getElementById("empty-inbox");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!filtered.length) {
      if (emptyEl) emptyEl.classList.remove("hidden");
      return;
    }
    if (emptyEl) emptyEl.classList.add("hidden");
    filtered.forEach(function (row, idx) {
      var tr =
        "<tr>" +
        "<td>" +
        fmtDate(row.receivedAt) +
        "</td><td><span class=\"admin-form-badge admin-form-badge--" +
        escAttr(row.formType) +
        "\">" +
        esc(row.formLabel || row.formType) +
        "</span></td><td class=\"admin-inbox-email\">" +
        esc(row.email) +
        "</td><td>" +
        esc(row.name) +
        '</td><td><button type="button" class="btn btn-ghost btn-sm admin-view-entry" data-inbox-index="' +
        idx +
        '">View</button></td></tr>';
      tbody.insertAdjacentHTML("beforeend", tr);
    });
  }

  function buildModalBody(row) {
    var entry = row.entry || {};
    var keys = Object.keys(entry);
    var ordered = [];
    ENTRY_FIELD_ORDER.forEach(function (k) {
      if (keys.indexOf(k) >= 0) ordered.push(k);
    });
    keys.forEach(function (k) {
      if (ordered.indexOf(k) < 0) ordered.push(k);
    });
    var html = '<dl class="admin-entry-dl">';
    ordered.forEach(function (k) {
      var val = formatValue(entry[k]);
      var display = val.indexOf("\n") >= 0 ? "<pre>" + esc(val) + "</pre>" : esc(val);
      html += "<dt>" + esc(labelForKey(k)) + "</dt><dd>" + display + "</dd>";
    });
    html += "</dl>";
    return html;
  }

  function openEntryModal(row) {
    var modal = document.getElementById("admin-entry-modal");
    var title = document.getElementById("admin-modal-title");
    var body = document.getElementById("admin-modal-body");
    if (!modal || !body) return;
    if (title) {
      title.textContent = (row.formLabel || "Entry") + " · #" + String(row.id != null ? row.id : "");
    }
    body.innerHTML = buildModalBody(row);
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-modal-open");
  }

  function closeEntryModal() {
    var modal = document.getElementById("admin-entry-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("admin-modal-open");
    var body = document.getElementById("admin-modal-body");
    if (body) body.innerHTML = "";
  }

  function loadSubmissions() {
    fetch("/api/admin-submissions", { credentials: "same-origin", cache: "no-store" })
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
        if (!result.ok || !result.data || !result.data.ok || !result.data.data) {
          showLogin();
          return;
        }
        var d = result.data.data;
        submissionLogCache = d.submissionLog || [];
        renderEarlyAccessQueue(d.earlyAccessPending || []);
        renderStats(d.submissionStats || { total: 0, early_access: 0, profile_registration: 0, account_completion: 0 });
        renderInbox();
        var users = d.users || [];
        renderTable(
          "tbody-users",
          users,
          "empty-users",
          function (r) {
            var em = (r && r.email) || "";
            var at = r && r.accountType === "sub" ? "sub" : "primary";
            var pe = r && typeof r.primaryEmail === "string" ? r.primaryEmail : "";
            var permObj = r && r.permissions && typeof r.permissions === "object" ? r.permissions : {};
            var permStr = "{}";
            try {
              permStr = JSON.stringify(permObj);
            } catch (e) {
              permStr = "{}";
            }
            return (
              '<tr data-email="' +
              escAttr(em) +
              '"><td>' +
              esc(em) +
              "</td><td>" +
              esc(r.name) +
              "</td><td>" +
              esc(r.company) +
              "</td><td>" +
              esc(r.role) +
              '</td><td class="admin-role-cell"><select class="admin-account-type" aria-label="Account type for ' +
              escAttr(em) +
              '"><option value="primary"' +
              (at === "primary" ? " selected" : "") +
              '>Primary</option><option value="sub"' +
              (at === "sub" ? " selected" : "") +
              '>Sub-user</option></select></td><td class="admin-role-cell"><input type="email" class="admin-primary-email" placeholder="If sub-user" value="' +
              escAttr(pe) +
              '" /></td><td class="admin-role-cell"><textarea class="admin-permissions-json" rows="2" aria-label="Permissions JSON for ' +
              escAttr(em) +
              '">' +
              esc(permStr) +
              '</textarea></td><td class="admin-role-cell"><div class="admin-role-controls">' +
              '<input type="text" class="admin-role-input" maxlength="64" aria-label="App role for ' +
              escAttr(em) +
              '" value="' +
              escAttr(typeof r.appRole === "string" ? r.appRole : "") +
              '" />' +
              '<button type="button" class="btn btn-ghost btn-sm admin-save-role">Save</button>' +
              '<span class="admin-role-status" role="status"></span></div></td><td class="admin-role-cell"><div class="admin-role-controls">' +
              '<label class="admin-checkbox-inline"><input type="checkbox" class="admin-ifta-access" ' +
              (r.iftaAccess ? "checked" : "") +
              "> Allow</label></div></td><td>" +
              fmtDate(r.completedAt) +
              '</td><td class="admin-role-cell"><button type="button" class="btn btn-ghost btn-sm admin-delete-user" data-email="' +
              escAttr(em) +
              '">Delete</button></td></tr>'
            );
          }
        );
      })
      .catch(function () {
        showLogin();
      });
  }

  function checkSession() {
    fetch("/api/admin-session", { credentials: "same-origin", cache: "no-store" })
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
          showApp(result.data.email);
          return;
        }
        showLogin();
      })
      .catch(function () {
        showLogin();
      });
  }

  var filtersEl = document.querySelector(".admin-filters");
  if (filtersEl) {
    filtersEl.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest(".admin-filter");
      if (!btn) return;
      var f = btn.getAttribute("data-filter") || "all";
      inboxFilter = f;
      filtersEl.querySelectorAll(".admin-filter").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      renderInbox();
    });
  }

  if (appPanel) {
    appPanel.addEventListener("click", function (e) {
      var approveBtn = e.target && e.target.closest && e.target.closest(".admin-approve-early");
      if (approveBtn) {
        var arow = approveBtn.closest("tr");
        if (!arow) return;
        var aemail = arow.getAttribute("data-email") || "";
        var astatus = arow.querySelector(".admin-role-status");
        approveBtn.disabled = true;
        if (astatus) {
          astatus.textContent = "";
          astatus.style.color = "";
        }
        fetch("/api/admin-submissions", {
          method: "PATCH",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approveEarlyAccess", email: aemail }),
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
              if (astatus) {
                astatus.textContent = "Approved — email sent";
                astatus.style.color = "";
              }
              loadSubmissions();
              return;
            }
            var msg =
              (result.data && result.data.error) || "Could not approve. Check server logs or DATABASE_URL.";
            if (astatus) {
              astatus.textContent = msg;
              astatus.style.color = "#b91c1c";
            }
          })
          .catch(function () {
            if (astatus) {
              astatus.textContent = "Network error.";
              astatus.style.color = "#b91c1c";
            }
          })
          .finally(function () {
            approveBtn.disabled = false;
          });
        return;
      }
      var deleteUserBtn = e.target && e.target.closest && e.target.closest(".admin-delete-user");
      if (deleteUserBtn) {
        var delEmail = deleteUserBtn.getAttribute("data-email") || "";
        if (!delEmail) return;
        if (
          !window.confirm(
            "Permanently delete this user and their insured records?\n\n" +
              delEmail +
              "\n\nThis cannot be undone."
          )
        ) {
          return;
        }
        deleteUserBtn.disabled = true;
        fetch("/api/admin-submissions", {
          method: "PATCH",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "deleteUser", email: delEmail }),
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
              loadSubmissions();
              return;
            }
            alert((result.data && result.data.error) || "Could not delete user.");
          })
          .catch(function () {
            alert("Network error.");
          })
          .finally(function () {
            deleteUserBtn.disabled = false;
          });
        return;
      }
      var viewBtn = e.target && e.target.closest && e.target.closest(".admin-view-entry");
      if (viewBtn) {
        var idx = parseInt(viewBtn.getAttribute("data-inbox-index"), 10);
        if (!isNaN(idx) && currentInboxRows[idx]) {
          openEntryModal(currentInboxRows[idx]);
        }
        return;
      }
      var roleBtn = e.target && e.target.closest && e.target.closest(".admin-save-role");
      if (!roleBtn) return;
      var row = roleBtn.closest("tr");
      if (!row) return;
      var email = row.getAttribute("data-email") || "";
      var input = row.querySelector(".admin-role-input");
      var iftaInput = row.querySelector(".admin-ifta-access");
      var accSel = row.querySelector(".admin-account-type");
      var peIn = row.querySelector(".admin-primary-email");
      var permTa = row.querySelector(".admin-permissions-json");
      var statusEl = row.querySelector(".admin-role-status");
      var appRole = input ? String(input.value || "").trim() : "";
      var iftaAccess = !!(iftaInput && iftaInput.checked);
      var accountType = accSel && accSel.value === "sub" ? "sub" : "primary";
      var primaryEmail = peIn ? String(peIn.value || "").trim() : "";
      var permissions = {};
      var permRaw = permTa ? String(permTa.value || "").trim() : "";
      if (permRaw) {
        try {
          permissions = JSON.parse(permRaw);
        } catch (e) {
          roleBtn.disabled = false;
          if (statusEl) {
            statusEl.textContent = "Permissions must be valid JSON.";
            statusEl.style.color = "#b91c1c";
          }
          return;
        }
      }
      if (
        permissions !== null &&
        typeof permissions === "object" &&
        !Array.isArray(permissions)
      ) {
        /* ok */
      } else {
        roleBtn.disabled = false;
        if (statusEl) {
          statusEl.textContent = "Permissions must be a JSON object.";
          statusEl.style.color = "#b91c1c";
        }
        return;
      }
      roleBtn.disabled = true;
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.style.color = "";
      }
      fetch("/api/admin-submissions", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          appRole: appRole,
          iftaAccess: iftaAccess,
          accountType: accountType,
          primaryEmail: primaryEmail,
          permissions: permissions,
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
          if (result.ok && result.data && result.data.ok) {
            if (statusEl) {
              statusEl.textContent = "Saved";
              statusEl.style.color = "";
            }
            return;
          }
          var msg =
            (result.data && result.data.error) || "Could not save role. Try again or check server logs.";
          if (statusEl) {
            statusEl.textContent = msg;
            statusEl.style.color = "#b91c1c";
          }
        })
        .catch(function () {
          if (statusEl) {
            statusEl.textContent = "Network error.";
            statusEl.style.color = "#b91c1c";
          }
        })
        .finally(function () {
          roleBtn.disabled = false;
        });
    });
  }

  var modalBackdrop = document.getElementById("admin-modal-backdrop");
  var modalClose = document.getElementById("admin-modal-close");
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", closeEntryModal);
  }
  if (modalClose) {
    modalClose.addEventListener("click", closeEntryModal);
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeEntryModal();
  });

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var emailEl = document.getElementById("admin-email");
      var passEl = document.getElementById("admin-password");
      var em = (emailEl && emailEl.value.trim()) || "";
      var pw = (passEl && passEl.value) || "";

      ["admin-email", "admin-password"].forEach(function (id) {
        var el = document.getElementById(id + "-error");
        if (el) el.textContent = "";
      });
      if (formError) {
        formError.textContent = "";
        formError.classList.add("hidden");
      }

      if (!em || !pw) {
        if (formError) {
          formError.textContent = "Enter email and password.";
          formError.classList.remove("hidden");
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Signing in…";
      }

      fetch("/api/admin-login", {
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
            showApp(em);
            return;
          }
          var msg =
            (result.data && result.data.error) ||
            "Could not sign in. Check .env and server logs.";
          if (formError) {
            formError.textContent = msg;
            formError.classList.remove("hidden");
          }
        })
        .catch(function () {
          if (formError) {
            formError.textContent = "Could not reach the server. Run npm start from this folder.";
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

  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      logoutBtn.disabled = true;
      fetch("/api/admin-logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).finally(function () {
        logoutBtn.disabled = false;
        showLogin();
      });
    });
  }

  checkSession();
})();
