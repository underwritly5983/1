/**
 * POST insured upload payloads to IFTA_INGEST_WEBHOOK_URL (IFTA Summary app).
 * Also used to re-push when a broker opens IFTA for an insured (relay on launch).
 */

var insuredDb = require("./insured-db");
var iftaUrls = require("./ifta-urls");

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function parseUploadsFromRow(row) {
  var u = row && row.uploads;
  if (typeof u === "string") {
    try {
      u = JSON.parse(u);
    } catch (e) {
      u = [];
    }
  }
  if (!Array.isArray(u)) u = [];
  return u;
}

async function postIftaWebhook(payload) {
  var url = iftaUrls.resolveIftaIngestWebhookUrl();
  if (!url) {
    console.warn(
      "[ifta-ingest] no ingest URL (set IFTA_DEPLOYMENT_URL or IFTA_INGEST_WEBHOOK_URL)"
    );
    return;
  }
  try {
    var f = typeof fetch === "function" ? fetch : null;
    if (!f) {
      console.warn("[ifta-ingest] webhook skipped: fetch is not available in this runtime.");
      return;
    }
    var body = JSON.stringify(payload);
    if (body.length > 4e6) {
      body = JSON.stringify({
        event: payload.event,
        brokerEmail: payload.brokerEmail,
        companyKey: payload.companyKey,
        insuredId: payload.insuredId,
        insuredName: payload.insuredName,
        insuredEmail: payload.insuredEmail,
        files: (payload.files || []).map(function (x) {
          return { name: x.name, mime: x.mime, size: x.size };
        }),
        note: "bodyBase64 omitted due to payload size; use pull API or reduce file size.",
      });
    }
    var headers = {
      "Content-Type": "application/json",
      "User-Agent": "Underwritly-landing/insured-ingest",
    };
    var ingestSecret = (process.env.IFTA_INGEST_SECRET || "").trim();
    if (ingestSecret) {
      headers["X-Underwritly-Ingest-Secret"] = ingestSecret;
    }
    var ingestRes = await f(url, {
      method: "POST",
      headers: headers,
      body: body,
    });
    if (!ingestRes.ok) {
      var errText = "";
      try {
        errText = (await ingestRes.text()).slice(0, 800);
      } catch (readErr) {
        errText = "(could not read body)";
      }
      var hint405 =
        ingestRes.status === 405
          ? " IFTA app must implement POST — copy integrations/add-to-ifta-project/ into the IFTA repo (see README.txt)."
          : "";
      console.warn(
        "[ifta-ingest] webhook returned error",
        ingestRes.status,
        ingestRes.statusText,
        "url=" + url,
        errText ? "body=" + errText : "",
        hint405
      );
      throw new Error(
        "IFTA ingest HTTP " + ingestRes.status + (errText ? ": " + errText.slice(0, 200) : "")
      );
    }
    console.log("[ifta-ingest] webhook OK", ingestRes.status, "url=" + url);
  } catch (e) {
    console.warn("[ifta-ingest] webhook request failed", url, e && e.message);
    throw e;
  }
}

/**
 * Re-send stored files to IFTA when broker opens IFTA Summary for this insured (GET launch=ifta).
 * Fixes missed webhooks and ensures the report app receives PDFs/CSVs server-to-server (no CORS).
 */
async function relayInsuredUploadsToIftaWebhook(brokerEmail, insuredId) {
  if (!iftaUrls.resolveIftaIngestWebhookUrl()) {
    return;
  }
  if (!insuredDb.hasPostgres()) {
    return;
  }
  var n = parseInt(String(insuredId), 10);
  if (isNaN(n) || n < 1) {
    return;
  }
  try {
    var row = await insuredDb.getByBrokerAndId(brokerEmail, n);
    if (!row || row.status !== "completed") {
      return;
    }
    var uploads = parseUploadsFromRow(row);
    if (!uploads.length) {
      return;
    }
    var brokerEm = normEmail(row.broker_email);
    var insEm = normEmail(row.email);
    var insName = row.name || "";
    var payload = {
      event: "insured_ifta_upload",
      brokerEmail: brokerEm,
      companyKey: row.company_key,
      insuredId: row.id,
      insuredName: insName,
      insuredEmail: insEm,
      files: uploads.map(function (s) {
        return {
          name: s.name,
          mime: s.mime,
          size: s.size,
          bodyBase64: s.bodyBase64,
        };
      }),
    };
    await postIftaWebhook(payload);
    console.log("[ifta-ingest] relay on IFTA launch OK insuredId=" + n);
  } catch (e) {
    console.warn("[ifta-ingest] relay on launch failed", e && e.message);
    throw e;
  }
}

module.exports = {
  postIftaWebhook: postIftaWebhook,
  relayInsuredUploadsToIftaWebhook: relayInsuredUploadsToIftaWebhook,
};
