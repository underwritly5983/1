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
  var logoWrap = document.getElementById("dashboard-logo-wrap");
  var logoImg = document.getElementById("dashboard-logo");
  var iftaLockedEl = document.getElementById("dashboard-ifta-locked");
  var iftaAllowedEl = document.getElementById("dashboard-ifta-allowed");
  var iftaOpenBtn = document.getElementById("dashboard-ifta-open");
  var iftaLaunchErrEl = document.getElementById("dashboard-ifta-launch-err");
  var teamSectionEl = document.getElementById("dashboard-team-section");
  var teamStatsEl = document.getElementById("dashboard-team-stats");
  var teamListEl = document.getElementById("dashboard-team-list");
  var teamInvitesEl = document.getElementById("dashboard-team-invites");
  var teamInviteForm = document.getElementById("dashboard-team-invite-form");
  var teamInviteEmailsEl = document.getElementById("dashboard-team-invite-emails");
  var teamInviteMsg = document.getElementById("dashboard-team-invite-msg");
  var deleteInsuredDialog = document.getElementById("dashboard-delete-insured-dialog");
  var deleteInsuredCancelBtn = document.getElementById("dashboard-delete-insured-cancel");
  var deleteInsuredConfirmBtn = document.getElementById("dashboard-delete-insured-confirm");
  var pendingDeleteInsuredId = null;
  var editEmailDialog = document.getElementById("dashboard-edit-email-dialog");
  var editEmailInput = document.getElementById("dashboard-edit-email-input");
  var editEmailCancelBtn = document.getElementById("dashboard-edit-email-cancel");
  var editEmailSaveBtn = document.getElementById("dashboard-edit-email-save");
  var pendingEditInsuredId = null;

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

  function escAttr(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
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
          '<button type="button" class="btn btn-ghost dashboard-insured-btn dashboard-insured-ifta" data-insured-id="' +
          esc(String(id)) +
          '" title="Open IFTA Summary with this insured">' +
          '<span class="dashboard-insured-ifta-icon" aria-hidden="true">⛽</span> IFTA</button>';
      }
      var canResend =
        st === "pending_mfa" ||
        st === "awaiting_upload" ||
        st === "completed" ||
        st === "broker_managed";
      var resendTitle = !canResend
        ? "Resend not available for this status"
        : st === "pending_mfa"
          ? "Resend verification code email"
          : st === "awaiting_upload"
            ? "Resend upload link email"
            : "Send a friendly reminder with a fresh upload link";
      var resendBtn =
        '<button type="button" class="btn btn-ghost dashboard-insured-btn dashboard-insured-resend" data-insured-id="' +
        esc(String(id)) +
        '"' +
        (canResend ? "" : " disabled") +
        ' title="' +
        esc(resendTitle) +
        '">Resend email</button>';
      var canDel = !user || user.canDeleteInsured !== false;
      var deleteBtn = canDel
        ? '<button type="button" class="btn btn-ghost dashboard-insured-btn dashboard-insured-delete" data-insured-id="' +
          esc(String(id)) +
          '" title="Remove this insured from your list">Delete</button>'
        : "";
      var actionsCell =
        '<div class="dashboard-insured-actions">' +
        resendBtn +
        (deleteBtn ? deleteBtn : "") +
        "</div>";
      var addedBy =
        r.createdByEmail && String(r.createdByEmail).trim()
          ? esc(r.createdByEmail)
          : "—";
      var fileCount =
        typeof r.uploadCount === "number" && r.uploadCount > 0
          ? String(r.uploadCount)
          : "—";
      var rawEmail = r.email && String(r.email).trim() ? String(r.email).trim() : "";
      var emailDisplay = rawEmail ? esc(rawEmail) : "—";
      var editEmailBtn =
        '<button type="button" class="btn btn-ghost btn-sm dashboard-insured-btn dashboard-insured-edit-email" ' +
        'data-insured-id="' +
        esc(String(id)) +
        '" data-email="' +
        escAttr(rawEmail) +
        '" title="Edit email address">Edit</button>';
      var emailCell =
        '<div class="dashboard-insured-email-cell">' +
        '<span class="dashboard-insured-email-text">' +
        emailDisplay +
        "</span>" +
        editEmailBtn +
        "</div>";
      var statusLine = esc(r.statusLabel || r.status);
      if (r.lastReportSource === "broker_ifta") {
        statusLine += " · Last reports: broker (IFTA app)";
      } else if (r.lastReportSource === "insured_portal") {
        statusLine += " · Last reports: insured (portal)";
      }
      var tr =
        "<tr><td>" +
        esc(r.name) +
        "</td><td>" +
        emailCell +
        "</td><td>" +
        statusLine +
        "</td><td>" +
        addedBy +
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
    if (nameEl) {
      nameEl.textContent = "";
      nameEl.appendChild(
        document.createTextNode("Hi, " + (displayName.split(/\s+/)[0] || "there"))
      );
      if (user && user.isSubAccount) {
        nameEl.appendChild(document.createTextNode(" "));
        var subBadge = document.createElement("span");
        subBadge.className = "dashboard-sub-badge";
        subBadge.setAttribute("title", "Team member account");
        subBadge.textContent = "Team";
        nameEl.appendChild(subBadge);
      }
    }
    if (emailEl) emailEl.textContent = (user && user.email) || "";

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

    if (teamSectionEl) {
      if (user && user.canManageTeam) {
        teamSectionEl.classList.remove("hidden");
        loadTeam();
      } else {
        teamSectionEl.classList.add("hidden");
      }
    }

    renderInsuredRows(user, insureds);
  }

  function renderTeamData(data) {
    if (!teamStatsEl || !teamListEl || !teamInvitesEl) return;
    var stats = (data && data.stats) || {};
    var insuredCount = typeof stats.insuredCount === "number" ? stats.insuredCount : 0;
    var totalFiles = typeof stats.totalReportFiles === "number" ? stats.totalReportFiles : 0;
    var html =
      '<div class="dashboard-stat-card"><span class="dashboard-stat-value">' +
      insuredCount +
      '</span><span class="dashboard-stat-label">Insured contacts</span></div>' +
      '<div class="dashboard-stat-card"><span class="dashboard-stat-value">' +
      totalFiles +
      '</span><span class="dashboard-stat-label">Report files received (IFTA uploads)</span></div>';
    var byCreator = Array.isArray(stats.byCreator) ? stats.byCreator : [];
    if (byCreator.length) {
      html +=
        '<div class="dashboard-stat-card dashboard-stat-card--wide"><span class="dashboard-stat-label">Insured contacts added by</span><ul class="dashboard-stat-by">';
      byCreator.forEach(function (b) {
        html +=
          "<li>" +
          esc(b.label || b.email || "—") +
          ": <strong>" +
          (b.insuredsCreated || 0) +
          "</strong></li>";
      });
      html += "</ul></div>";
    }
    teamStatsEl.innerHTML = html;

    var subs = Array.isArray(data.subUsers) ? data.subUsers : [];
    teamListEl.innerHTML = "";
    if (!subs.length) {
      teamListEl.innerHTML =
        '<li class="dashboard-team-empty">No team members yet. Invite someone by email above.</li>';
    } else {
      subs.forEach(function (s) {
        var em = s.email || "";
        var nm = esc(s.name || "");
        var emAttr = escAttr(em);
        teamListEl.insertAdjacentHTML(
          "beforeend",
          '<li class="dashboard-team-item"><div><strong>' +
            nm +
            '</strong><br /><span class="dashboard-team-email">' +
            esc(em) +
            '</span></div><div class="dashboard-team-item-actions">' +
            '<button type="button" class="btn btn-ghost btn-sm dashboard-team-reset-pw" data-team-email="' +
            emAttr +
            '">Reset password</button> ' +
            '<button type="button" class="btn btn-ghost btn-sm dashboard-team-remove" data-team-email="' +
            emAttr +
            '">Remove</button></div></li>'
        );
      });
    }

    var invites = Array.isArray(data.pendingInvites) ? data.pendingInvites : [];
    teamInvitesEl.innerHTML = "";
    if (!invites.length) {
      teamInvitesEl.innerHTML = '<li class="dashboard-team-empty">None pending</li>';
    } else {
      invites.forEach(function (inv) {
        var em = inv.subEmail || "";
        var emAttr = escAttr(em);
        teamInvitesEl.insertAdjacentHTML(
          "beforeend",
          '<li class="dashboard-team-item"><span class="dashboard-team-email">' +
            esc(em) +
            '</span> <button type="button" class="btn btn-ghost btn-sm dashboard-team-resend-invite" data-team-email="' +
            emAttr +
            '">Resend code</button></li>'
        );
      });
    }
  }

  function loadTeam() {
    if (!teamSectionEl || !currentUser || !currentUser.canManageTeam) return;
    fetch("/api/team", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, data: d };
        });
      })
      .then(function (result) {
        if (result.ok && result.data && result.data.ok) {
          renderTeamData(result.data);
        }
      })
      .catch(function () {
        /* ignore */
      });
  }

  function showTeamMsg(text, isError) {
    if (!teamInviteMsg) return;
    teamInviteMsg.textContent = text || "";
    teamInviteMsg.classList.remove("hidden");
    teamInviteMsg.style.color = isError ? "#b91c1c" : "#15803d";
    if (text) {
      setTimeout(function () {
        teamInviteMsg.classList.add("hidden");
      }, 8000);
    }
  }

  function parseInviteEmails(raw) {
    var parts = String(raw || "").split(/[\s,;]+/);
    var valid = [];
    var invalid = [];
    var seen = {};
    var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (var i = 0; i < parts.length; i++) {
      var token = parts[i].trim();
      if (!token) continue;
      var em = token.toLowerCase();
      if (seen[em]) continue;
      seen[em] = true;
      if (!re.test(em)) {
        invalid.push(token);
        continue;
      }
      valid.push(em);
    }
    return { valid: valid, invalid: invalid };
  }

  function runDeleteInsured(did) {
    if (!did) return;
    if (deleteInsuredConfirmBtn) deleteInsuredConfirmBtn.disabled = true;
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
        var msg = (result.data && result.data.error) || "Could not delete insured.";
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
        if (deleteInsuredConfirmBtn) deleteInsuredConfirmBtn.disabled = false;
        if (deleteInsuredDialog) deleteInsuredDialog.close();
        pendingDeleteInsuredId = null;
      });
  }

  function runSaveInsuredEmail() {
    var did = pendingEditInsuredId;
    if (!did || !editEmailInput) return;
    if (editEmailSaveBtn) editEmailSaveBtn.disabled = true;
    if (insuredsErrorEl) {
      insuredsErrorEl.classList.add("hidden");
      insuredsErrorEl.textContent = "";
    }
    var val = editEmailInput.value.trim();
    fetch("/api/session", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_insured_email",
        insuredId: parseInt(did, 10),
        email: val,
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
        if (result.ok && result.data && result.data.ok === true) {
          if (editEmailDialog) editEmailDialog.close();
          pendingEditInsuredId = null;
          return refreshInsureds().then(function () {
            if (insuredsErrorEl) {
              insuredsErrorEl.textContent = "Email updated.";
              insuredsErrorEl.classList.remove("hidden", "field-error");
              insuredsErrorEl.style.color = "#15803d";
              setTimeout(function () {
                insuredsErrorEl.classList.add("hidden", "field-error");
                insuredsErrorEl.style.color = "";
              }, 5000);
            }
          });
        }
        var msg = (result.data && result.data.error) || "Could not update email.";
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
        if (editEmailSaveBtn) editEmailSaveBtn.disabled = false;
      });
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

      var editMailBtn =
        e.target && e.target.closest && e.target.closest(".dashboard-insured-edit-email");
      if (editMailBtn) {
        var eid = editMailBtn.getAttribute("data-insured-id");
        if (!eid) return;
        pendingEditInsuredId = eid;
        var prevEm = editMailBtn.getAttribute("data-email");
        if (editEmailInput) {
          editEmailInput.value = prevEm != null ? prevEm : "";
        }
        if (editEmailDialog && typeof editEmailDialog.showModal === "function") {
          editEmailDialog.showModal();
          setTimeout(function () {
            if (editEmailInput) {
              editEmailInput.focus();
              editEmailInput.select();
            }
          }, 0);
        }
        return;
      }

      var delBtn = e.target && e.target.closest && e.target.closest(".dashboard-insured-delete");
      if (delBtn) {
        var did = delBtn.getAttribute("data-insured-id");
        if (!did) return;
        pendingDeleteInsuredId = did;
        if (deleteInsuredDialog && typeof deleteInsuredDialog.showModal === "function") {
          deleteInsuredDialog.showModal();
        } else if (!confirm("Delete this insured from your list? This cannot be undone.")) {
          pendingDeleteInsuredId = null;
        } else {
          runDeleteInsured(did);
        }
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

  if (deleteInsuredCancelBtn && deleteInsuredDialog) {
    deleteInsuredCancelBtn.addEventListener("click", function () {
      pendingDeleteInsuredId = null;
      deleteInsuredDialog.close();
    });
  }

  if (deleteInsuredDialog) {
    deleteInsuredDialog.addEventListener("cancel", function () {
      pendingDeleteInsuredId = null;
    });
  }

  if (deleteInsuredConfirmBtn) {
    deleteInsuredConfirmBtn.addEventListener("click", function () {
      var did = pendingDeleteInsuredId;
      if (!did) return;
      runDeleteInsured(did);
    });
  }

  if (editEmailCancelBtn && editEmailDialog) {
    editEmailCancelBtn.addEventListener("click", function () {
      pendingEditInsuredId = null;
      editEmailDialog.close();
    });
  }

  if (editEmailDialog) {
    editEmailDialog.addEventListener("cancel", function () {
      pendingEditInsuredId = null;
    });
  }

  if (editEmailSaveBtn) {
    editEmailSaveBtn.addEventListener("click", function () {
      runSaveInsuredEmail();
    });
  }

  if (editEmailInput) {
    editEmailInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        runSaveInsuredEmail();
      }
    });
  }

  if (teamInviteForm && teamInviteEmailsEl) {
    teamInviteForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var parsed = parseInviteEmails(teamInviteEmailsEl.value);
      var emails = parsed.valid;
      var btn = teamInviteForm.querySelector(".dashboard-team-invite-submit");
      if (!emails.length) {
        if (parsed.invalid.length) {
          showTeamMsg("No valid addresses. Skipped: " + parsed.invalid.join(", "), true);
        } else {
          showTeamMsg("Enter at least one valid email address.", true);
        }
        return;
      }
      if (btn) btn.disabled = true;

      function inviteAt(index, sent, failed) {
        if (index >= emails.length) {
          var parts = [];
          if (parsed.invalid.length) {
            parts.push("Skipped invalid: " + parsed.invalid.join(", "));
          }
          if (sent.length) parts.push("Invited: " + sent.join(", "));
          if (failed.length) {
            failed.forEach(function (f) {
              parts.push(f.email + ": " + f.err);
            });
          }
          showTeamMsg(parts.join(" — ") || "Done.", failed.length > 0);
          teamInviteEmailsEl.value = "";
          loadTeam();
          if (btn) btn.disabled = false;
          return;
        }
        var em = emails[index];
        fetch("/api/team", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "invite_sub", subEmail: em }),
        })
          .then(function (res) {
            return res.json().then(function (d) {
              return { ok: res.ok, data: d };
            });
          })
          .then(function (result) {
            if (result.ok && result.data && result.data.ok) {
              sent.push(em);
            } else {
              failed.push({
                email: em,
                err: (result.data && result.data.error) || "Failed",
              });
            }
            inviteAt(index + 1, sent, failed);
          })
          .catch(function () {
            failed.push({ email: em, err: "Network error" });
            inviteAt(index + 1, sent, failed);
          });
      }

      inviteAt(0, [], []);
    });
  }

  if (teamSectionEl) {
    teamSectionEl.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var resend = t.closest(".dashboard-team-resend-invite");
      var remove = t.closest(".dashboard-team-remove");
      var resetPw = t.closest(".dashboard-team-reset-pw");
      var subEm = null;
      if (resend) subEm = resend.getAttribute("data-team-email");
      else if (remove) subEm = remove.getAttribute("data-team-email");
      else if (resetPw) subEm = resetPw.getAttribute("data-team-email");
      if (!subEm) return;
      if (remove) {
        if (!confirm("Remove this team member? They will lose access immediately.")) return;
      }
      var action = resend ? "resend_invite" : remove ? "remove_sub" : "send_password_reset";
      var rowBtn = resend || remove || resetPw;
      if (rowBtn) rowBtn.disabled = true;
      fetch("/api/team", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action, subEmail: subEm }),
      })
        .then(function (res) {
          return res.json().then(function (d) {
            return { ok: res.ok, data: d };
          });
        })
        .then(function (result) {
          if (result.ok && result.data && result.data.ok) {
            showTeamMsg(result.data.message || "Done.", false);
            loadTeam();
            return;
          }
          showTeamMsg((result.data && result.data.error) || "Request failed.", true);
        })
        .catch(function () {
          showTeamMsg("Network error.", true);
        })
        .finally(function () {
          if (rowBtn) rowBtn.disabled = false;
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
