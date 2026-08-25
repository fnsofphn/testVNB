(function () {
  "use strict";

  var pathMatch = window.location.pathname.match(/\/games\/(plx-\d+(?:-[a-z0-9-]+)?)/i);
  var gameId = pathMatch ? pathMatch[1].toLowerCase() : "plx-01";
  var lastSignature = "";

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function parseNumber(text) {
    var value = Number(String(text || "0").replace(/[^\d-]/g, ""));
    return Number.isFinite(value) ? value : 0;
  }

  function activeResultScreen() {
    var screen = document.getElementById("screen-results");
    return screen && screen.classList.contains("active") ? screen : null;
  }

  function rankLabel() {
    var direct = document.getElementById("r-rank");
    if (direct && direct.textContent.trim()) return direct.textContent.trim();
    var trophy = document.getElementById("trophy-letter");
    if (trophy && trophy.textContent.trim()) return trophy.textContent.trim();
    return "-";
  }

  function readReviewAnswers() {
    var eventRows = Array.from(document.querySelectorAll("#event-review .er-row"));
    if (eventRows.length) {
      return eventRows.map(function (row, index) {
        var title = $("strong", row);
        var score = $(".er-score", row);
        var quality = row.classList.contains("good") ? "good" : row.classList.contains("bad") ? "bad" : "mid";
        return {
          tpId: "event-" + (index + 1),
          tpLabel: "Sự kiện " + (index + 1),
          tpTitle: title ? title.textContent.trim() : "Sự kiện " + (index + 1),
          choiceId: "",
          choiceText: "",
          quality: quality,
          cx: parseNumber(score && score.textContent),
          brand: 0,
          feedback: row.textContent.trim(),
          timedOut: false,
        };
      });
    }

    return Array.from(document.querySelectorAll("#elements-result .er-card")).map(function (row, index) {
      var title = $(".er-title", row);
      var meta = $(".er-meta", row);
      var quality = row.classList.contains("done") ? "good" : row.classList.contains("empty") ? "bad" : "mid";
      var points = quality === "good" ? 12 : quality === "mid" ? 6 : 0;
      return {
        tpId: "element-" + (index + 1),
        tpLabel: "Yếu tố " + (index + 1),
        tpTitle: title ? title.textContent.trim() : "Yếu tố " + (index + 1),
        choiceId: "",
        choiceText: meta ? meta.textContent.trim() : "",
        quality: quality,
        cx: points,
        brand: 0,
        feedback: row.textContent.trim(),
        timedOut: false,
      };
    });
  }

  function getResultData() {
    return {
      cxScore: parseNumber(document.getElementById("r-score") && document.getElementById("r-score").textContent),
      brandPts: 0,
      maxStreak: parseNumber(document.getElementById("r-correct") && document.getElementById("r-correct").textContent),
      rankLabel: rankLabel(),
      values: {
        heritage: parseNumber(document.getElementById("r-prestige") && document.getElementById("r-prestige").textContent),
        devoted: parseNumber(document.getElementById("r-energy") && document.getElementById("r-energy").textContent),
        pioneering: parseNumber(document.getElementById("r-speed") && document.getElementById("r-speed").textContent),
      },
      answers: readReviewAnswers(),
    };
  }

  function ensureRankingScreen() {
    var existing = document.getElementById("screen-ranking");
    if (existing) return existing;
    ensureRankingStyles();

    var screen = document.createElement("section");
    screen.className = "screen";
    screen.id = "screen-ranking";
    screen.innerHTML =
      '<div class="wrap">' +
      '<div class="results-hero"><div class="rh-inner"><h1 class="rh-title">Bảng xếp hạng realtime</h1><p class="rh-sub">Kết quả được đồng bộ từ VContent theo từng game.</p></div></div>' +
      '<div class="results-grid">' +
      '<div class="panel"><h3>Cá nhân</h3><div class="sub">Top học viên theo điểm mới nhất.</div><div class="tp-review" id="rank-personal-list"></div></div>' +
      '<div class="panel"><h3>Nhóm</h3><div class="sub">Top nhóm theo tổng điểm thành viên.</div><div class="tp-review" id="rank-group-list"></div></div>' +
      '</div>' +
      '<div class="results-grid">' +
      '<div class="panel" id="rank-class-overview"></div>' +
      '<div class="panel" id="rank-touchpoint-averages"></div>' +
      '</div>' +
      '<div class="panel" id="rank-auto-comment"></div>' +
      '</div>';
    document.querySelector(".app").appendChild(screen);
    return screen;
  }

  function ensureRankingStyles() {
    if (document.getElementById("plx-bridge-ranking-style")) return;
    var style = document.createElement("style");
    style.id = "plx-bridge-ranking-style";
    style.textContent = [
      ".tp-review{display:grid;gap:10px;margin-top:14px}",
      ".tpr{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.72)}",
      ".tpr.active{border-color:var(--plx-gold);box-shadow:0 0 0 3px rgba(240,165,0,.18)}",
      ".tpr-num{width:34px;height:34px;border-radius:999px;display:grid;place-items:center;background:var(--plx-navy);color:#fff;font-weight:800}",
      ".tpr-text{display:grid;gap:3px;min-width:0}.tpr-text strong{color:var(--plx-navy);font-size:14px}.tpr-text span,.ll-time,.sub{color:var(--muted);font-size:12px}",
      ".tpr-score{font-family:var(--serif);font-size:20px;font-weight:800;color:var(--plx-red);text-align:right}",
      ".overview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}",
      ".mini-stat{padding:14px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.76)}",
      ".ms-label{font-size:11px;font-weight:800;text-transform:uppercase;color:var(--muted);letter-spacing:.08em}.ms-value{font-family:var(--serif);font-size:30px;font-weight:800;color:var(--plx-navy);line-height:1.1}.ms-sub{font-size:12px;color:var(--muted);margin-top:4px}",
      ".touch-avg-list{display:grid;gap:10px;margin-top:14px}.touch-avg-item{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.74)}",
      ".ta-num{width:32px;height:32px;border-radius:999px;display:grid;place-items:center;background:var(--plx-gold);color:var(--ink);font-weight:800}.ta-text{display:grid;gap:3px}.ta-text strong{color:var(--plx-navy);font-size:13px}.ta-text span,.ta-sub{display:block;color:var(--muted);font-size:11px}.ta-score{text-align:right;font-weight:800;color:var(--plx-red)}",
      ".ll-empty{padding:14px;border:1px dashed var(--line-strong);border-radius:14px;color:var(--muted)}",
      ".auto-comment{display:grid;gap:10px;margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.78)}",
      ".ac-title{font-family:var(--serif);font-size:22px;font-weight:800;color:var(--plx-navy)}.ac-head,.ac-body{color:var(--ink);line-height:1.55}.ac-points{display:grid;gap:8px}.ac-point{padding:10px 12px;border-radius:12px;background:rgba(0,45,116,.06);color:var(--plx-navy);font-weight:600}",
      "@media(max-width:760px){.overview-grid{grid-template-columns:1fr}.tpr,.touch-avg-item{grid-template-columns:30px minmax(0,1fr)}.tpr-score,.ta-score{text-align:left;grid-column:2}}",
    ].join("");
    document.head.appendChild(style);
  }

  function showRanking() {
    var ranking = ensureRankingScreen();
    Array.from(document.querySelectorAll(".screen")).forEach(function (screen) {
      screen.classList.remove("active");
    });
    ranking.classList.add("active");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function getTouchpointsMeta() {
    var answers = readReviewAnswers();
    if (answers.length) {
      return answers.map(function (answer) {
        return {
          id: answer.tpId,
          label: answer.tpLabel,
          shortLabel: answer.tpLabel,
          title: answer.tpTitle,
        };
      });
    }
    return [];
  }

  function fallbackSetPlayerRank(rankData) {
    var node = document.getElementById("r-rank");
    if (!node) return;
    var rank = rankData && Number(rankData.rank) > 0 ? Number(rankData.rank) : null;
    var total = rankData && Number(rankData.total) > 0 ? Number(rankData.total) : null;
    if (rank && total) node.textContent = "#" + rank + "/" + total;
    else if (rank) node.textContent = "#" + rank;
  }

  function notifyResultIfNeeded() {
    if (!activeResultScreen()) return;
    var payload = getResultData();
    var signature = JSON.stringify({
      score: payload.cxScore,
      rank: payload.rankLabel,
      answers: payload.answers.length,
    });
    if (signature === lastSignature) return;
    lastSignature = signature;
    var message = { type: "plx-result-ready", gameId: gameId, payload: payload };
    window.parent && window.parent.postMessage(message, window.location.origin);
    if (typeof BroadcastChannel !== "undefined") {
      var channel = new BroadcastChannel(gameId + "-results");
      channel.postMessage(message);
      channel.close();
    }
  }

  var existingGameApi = window.PLXGame || {};
  window.PLXGame = {
    showRanking: showRanking,
    getTouchpointsMeta: getTouchpointsMeta,
    getResultData: existingGameApi.getResultData || getResultData,
    getLiveScoreData: existingGameApi.getLiveScoreData,
    setPlayerRank: existingGameApi.setPlayerRank || fallbackSetPlayerRank,
  };
  window.showRanking = showRanking;

  document.addEventListener("DOMContentLoaded", function () {
    if (new URLSearchParams(window.location.search).get("view") === "rank") showRanking();
    window.setInterval(notifyResultIfNeeded, 1000);
  });
})();
