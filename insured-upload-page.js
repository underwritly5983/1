(function () {
  var yearEl = document.getElementById("year");
  var form = document.getElementById("insured-upload-form");
  var flowEl = document.getElementById("insured-upload-flow");
  var completeEl = document.getElementById("insured-upload-complete");
  var completeBodyEl = document.getElementById("insured-upload-complete-body");
  var errEl = document.getElementById("insured-upload-error");
  var submitBtn = document.getElementById("insured-upload-submit");

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  var params = new URLSearchParams(window.location.search);
  var uploadToken = params.get("upload_token") || "";

  var MAX_BYTES = Math.floor(1.5 * 1024 * 1024);
  var MAX_FILES = 8;
  var MAX_TOTAL_BYTES = 4 * 1024 * 1024;

  if (!uploadToken) {
    if (errEl) {
      errEl.textContent = "Missing upload session. Complete email verification first.";
      errEl.classList.remove("hidden");
    }
    if (form) form.classList.add("hidden");
    return;
  }

  if (!form) return;

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var dataUrl = String(r.result || "");
        var i = dataUrl.indexOf("base64,");
        if (i < 0) {
          reject(new Error("Could not read file."));
          return;
        }
        resolve(dataUrl.slice(i + 7));
      };
      r.onerror = function () {
        reject(new Error("Could not read file."));
      };
      r.readAsDataURL(file);
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var input = document.getElementById("ifta-files");
    var files = input && input.files ? input.files : null;
    if (errEl) {
      errEl.classList.add("hidden");
      errEl.textContent = "";
    }
    if (!files || !files.length) {
      if (errEl) {
        errEl.textContent = "Choose at least one file.";
        errEl.classList.remove("hidden");
      }
      return;
    }
    if (files.length > MAX_FILES) {
      if (errEl) {
        errEl.textContent = "Too many files (max " + MAX_FILES + ").";
        errEl.classList.remove("hidden");
      }
      return;
    }
    var totalSize = 0;
    for (var i = 0; i < files.length; i++) {
      if (files[i].size > MAX_BYTES) {
        if (errEl) {
          errEl.textContent = "Each file must be at most 1.5 MB.";
          errEl.classList.remove("hidden");
        }
        return;
      }
      totalSize += files[i].size;
    }
    if (totalSize > MAX_TOTAL_BYTES) {
      if (errEl) {
        errEl.textContent =
          "Combined size of all files must be at most 4 MB. Try smaller or compressed PDFs.";
        errEl.classList.remove("hidden");
      }
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    var tasks = [];
    for (var j = 0; j < files.length; j++) {
      (function (file) {
        tasks.push(
          readFileAsBase64(file).then(function (b64) {
            return {
              name: file.name,
              mime: file.type || "application/octet-stream",
              bodyBase64: b64,
            };
          })
        );
      })(files[j]);
    }

    Promise.all(tasks)
      .then(function (filePayloads) {
        return fetch("/api/session", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "upload",
            uploadToken: uploadToken,
            files: filePayloads,
          }),
        });
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
          var msg =
            (result.data && result.data.message) ||
            "Thank you for uploading. Your broker has been sent your IFTA reports.";
          if (completeBodyEl) {
            completeBodyEl.textContent = msg;
          }
          if (flowEl) flowEl.classList.add("hidden");
          if (completeEl) completeEl.classList.remove("hidden");
          if (form) form.reset();
          window.scrollTo(0, 0);
          return;
        }
        var msg = (result.data && result.data.error) || "Upload failed.";
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
