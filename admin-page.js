(function () {
  var loginPanel = document.getElementById("admin-login-panel");
  var appPanel = document.getElementById("admin-app");
  var form = document.getElementById("admin-login-form");
  var submitBtn = document.getElementById("admin-login-submit");
  var formError = document.getElementById("admin-form-error");
  var logoutBtn = document.getElementById("admin-logout-btn");
  var userLabel = document.getElementById("admin-user-label");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
        renderTable(
          "tbody-early",
          d.earlyAccess,
          "empty-early",
          function (r) {
            return (
              "<tr><td>" +
              esc(r.id) +
              "</td><td>" +
              fmtDate(r.receivedAt) +
              "</td><td>" +
              esc(r.name) +
              "</td><td>" +
              esc(r.email) +
              "</td><td>" +
              esc(r.phone) +
              "</td><td>" +
              esc(r.source) +
              "</td><td>" +
              esc(r.usage) +
              "</td></tr>"
            );
          }
        );
        renderTable(
          "tbody-profile",
          d.profileRegistration,
          "empty-profile",
          function (r) {
            return (
              "<tr><td>" +
              esc(r.id) +
              "</td><td>" +
              fmtDate(r.receivedAt) +
              "</td><td>" +
              esc(r.name) +
              "</td><td>" +
              esc(r.email) +
              "</td><td>" +
              esc(r.company) +
              "</td><td>" +
              esc(r.role) +
              "</td><td>" +
              esc(r.phone) +
              "</td></tr>"
            );
          }
        );
        renderTable(
          "tbody-acct",
          d.accountCompletions,
          "empty-acct",
          function (r) {
            return (
              "<tr><td>" +
              esc(r.id) +
              "</td><td>" +
              fmtDate(r.receivedAt) +
              "</td><td>" +
              esc(r.email) +
              "</td><td>" +
              esc(r.name) +
              "</td><td>" +
              esc(r.company) +
              "</td><td>" +
              fmtDate(r.completedAt) +
              "</td></tr>"
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
