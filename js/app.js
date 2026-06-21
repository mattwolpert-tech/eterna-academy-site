(function () {
  "use strict";
  var D = window.EA_DATA;
  var TRACKS = D.tracks, DOCS = D.docs || {}, VIDEOS = D.videos || [], QZ = D.quizzes || [], RP = D.roleplay || [];
  var LEVELS = D.levels || ["Recruit", "Setter", "Advisor", "Senior Advisor", "Elite"];
  var THRESH = [0, 400, 900, 1600, 2600, 4000];
  var RP_XP = 50;

  var trackById = {}, lessonById = {}, lessonModule = {}, lessonTrack = {};
  TRACKS.forEach(function (t) {
    trackById[t.id] = t;
    t.modules.forEach(function (m) {
      m.lessons.forEach(function (l) { lessonById[l.id] = l; lessonModule[l.id] = m; lessonTrack[l.id] = t; });
    });
  });
  var qById = {}; QZ.forEach(function (q) { qById[q.id] = q; });
  var rpById = {}; RP.forEach(function (s) { rpById[s.id] = s; });

  var KEY = "eterna_academy_v2";
  var state = load();
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s) return s; } catch (e) {}
    return { track: null, identity: null, orientation: {}, completed: {}, quiz: {}, rp: {}, badges: {}, seenTracks: {}, streak: 1, lastActive: today() };
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); scheduleSync(); }
  var syncT;
  function emailKey() { return state.identity && state.identity.email; }
  function scheduleSync() { if (!emailKey()) return; clearTimeout(syncT); syncT = setTimeout(syncUp, 1200); }
  function syncUp() {
    if (!emailKey() || !window.EA_API) return;
    var li = levelInfo();
    var payload = {
      pw: sessionStorage.getItem("ea_pw"), email: state.identity.email, name: state.identity.name,
      track: state.track, xp: li.xp, level: li.idx, lessons: Object.keys(state.completed).length,
      badges: Object.keys(state.badges).length,
      certs: TRACKS.filter(trackComplete).map(function (t) { return t.id; }),
      orientation: state.orientation || {},
      data: { completed: state.completed, quiz: state.quiz, rp: state.rp, badges: state.badges, orientation: state.orientation }
    };
    fetch(window.EA_API + "/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(function () {});
  }
  async function syncDown() {
    if (!emailKey() || !window.EA_API) return;
    try {
      var r = await fetch(window.EA_API + "/me?email=" + encodeURIComponent(state.identity.email));
      var d = await r.json();
      if (d && d.data) {
        ["completed", "quiz", "rp", "badges"].forEach(function (k) { if (d.data[k]) Object.keys(d.data[k]).forEach(function (id) { if (state[k][id] === undefined) state[k][id] = d.data[k][id]; }); });
        if (d.data.orientation && Object.keys(d.data.orientation).length) state.orientation = Object.assign(state.orientation || {}, d.data.orientation);
        localStorage.setItem(KEY, JSON.stringify(state));
      }
    } catch (e) {}
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  (function () {
    var t = today();
    if (state.lastActive !== t) {
      var d = new Date(state.lastActive); d.setDate(d.getDate() + 1);
      state.streak = (d.toISOString().slice(0, 10) === t) ? (state.streak || 0) + 1 : 1;
      state.lastActive = t; save();
    }
  })();

  function b64ToBytes(b64) { var bin = atob(b64.trim()), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  async function decryptBytes(b64, password) {
    var raw = b64ToBytes(b64);
    var salt = raw.slice(8, 16), ct = raw.slice(16);
    var pk = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" }, pk, 384);
    var dk = new Uint8Array(bits);
    var key = await crypto.subtle.importKey("raw", dk.slice(0, 32), { name: "AES-CBC" }, false, ["decrypt"]);
    var pt = await crypto.subtle.decrypt({ name: "AES-CBC", iv: dk.slice(32, 48) }, key, ct);
    return new TextDecoder().decode(pt);
  }
  var docCache = {};
  async function loadDoc(id) {
    if (docCache[id]) return docCache[id];
    var pw = sessionStorage.getItem("ea_pw");
    // backend first (reflects manager edits)
    try {
      if (window.EA_API) {
        var r = await fetch(window.EA_API + "/body?id=" + encodeURIComponent(id) + "&pw=" + encodeURIComponent(pw));
        if (r.ok) { var t = await r.text(); if (t) { docCache[id] = t; return t; } }
      }
    } catch (e) {}
    // fallback: encrypted static file
    var res = await fetch("docs/" + id + ".enc");
    if (!res.ok) throw new Error("not found");
    var txt = await decryptBytes(await res.text(), pw);
    docCache[id] = txt; return txt;
  }

  function xp() {
    var x = 0;
    Object.keys(state.completed).forEach(function (id) { if (lessonById[id]) x += lessonById[id].xp || 0; });
    Object.keys(state.quiz).forEach(function (id) { if (state.quiz[id] && qById[id]) x += qById[id].xp || 0; });
    Object.keys(state.rp).forEach(function (id) { if (state.rp[id]) x += RP_XP; });
    return x;
  }
  function levelInfo() {
    var x = xp(), i = 0;
    for (var k = 0; k < THRESH.length; k++) if (x >= THRESH[k]) i = k;
    var floor = THRESH[i], ceil = THRESH[i + 1] || (floor + 1400);
    return { idx: i, name: LEVELS[i], xp: x, floor: floor, ceil: ceil, pct: Math.round(((x - floor) / (ceil - floor)) * 100) };
  }
  function lessonComplete(l) {
    if (state.completed[l.id]) return true;
    if (l.type === "quiz") return (l.quizzes || []).every(function (q) { return q in state.quiz; });
    if (l.type === "roleplay") return (l.roleplay || []).every(function (s) { return s in state.rp; });
    return false;
  }
  function moduleComplete(m) { return m.lessons.every(lessonComplete); }
  function moduleProgress(m) { return Math.round(m.lessons.filter(lessonComplete).length / m.lessons.length * 100); }
  function trackComplete(t) { return t.modules.every(moduleComplete); }
  function completeLesson(l) { if (!state.completed[l.id]) { state.completed[l.id] = true; save(); toast("+" + (l.xp || 0) + " XP · " + lessonTitle(l)); checkBadges(); header(); } }
  function lessonTitle(l) { return l.title || (l.type === "doc" && DOCS[l.doc] ? DOCS[l.doc].t : l.id); }

  var BADGES = [
    { id: "first", t: "First steps", i: "ti-shoe", on: function () { return Object.keys(state.completed).length > 0; } },
    { id: "newgrad", t: "New-agent graduate", i: "ti-rocket", on: function () { return trackById.new && trackComplete(trackById.new); } },
    { id: "pro", t: "Seasoned pro", i: "ti-trending-up", on: function () { return trackById.existing && trackComplete(trackById.existing); } },
    { id: "leader", t: "Team leader", i: "ti-users-group", on: function () { return trackById.leader && trackComplete(trackById.leader); } },
    { id: "nepq", t: "NEPQ student", i: "ti-brain", on: function () { return ["q_nepq_1", "q_nepq_2", "q_nepq_3"].some(function (q) { return state.quiz[q]; }); } },
    { id: "slayer", t: "Objection slayer", i: "ti-shield-check", on: function () { return RP.filter(function (s) { return s.id.indexOf("rp_obj") === 0; }).every(function (s) { return state.rp[s.id]; }); } },
    { id: "iul", t: "IUL expert", i: "ti-chart-line", on: function () { return state.quiz["q_iul_1"] && state.quiz["q_iul_2"]; } },
    { id: "uw", t: "Underwriter", i: "ti-clipboard-heart", on: function () { return ["q_uw_meds_1", "q_uw_carrier_1"].every(function (q) { return state.quiz[q]; }); } },
    { id: "streak7", t: "On fire (7-day)", i: "ti-flame", on: function () { return (state.streak || 0) >= 7; } },
    { id: "quizmaster", t: "Quiz master", i: "ti-checks", on: function () { return Object.keys(state.quiz).filter(function (q) { return state.quiz[q]; }).length >= 15; } }
  ];
  function checkBadges() { BADGES.forEach(function (b) { if (!state.badges[b.id] && b.on()) { state.badges[b.id] = true; save(); toast("Badge unlocked · " + b.t, true); } }); }

  function escp(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function inline(s) { return escp(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>"); }
  function md(src) {
    var lines = (src || "").split("\n"), out = [], i = 0;
    while (i < lines.length) {
      var ln = lines[i];
      if (/^### /.test(ln)) { out.push("<h3>" + inline(ln.slice(4)) + "</h3>"); i++; continue; }
      if (/^## /.test(ln)) { out.push("<h2>" + inline(ln.slice(3)) + "</h2>"); i++; continue; }
      if (/^# /.test(ln)) { out.push("<h2>" + inline(ln.slice(2)) + "</h2>"); i++; continue; }
      if (/^\s*\|.*\|/.test(ln)) {
        var rows = []; while (i < lines.length && /^\s*\|.*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        var cells = rows.map(function (r) { return r.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); }); });
        var sep = cells[1] && cells[1].every(function (c) { return /^:?-+:?$/.test(c); });
        var body = cells.slice(sep ? 2 : 1);
        var t = "<table><thead><tr>" + cells[0].map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead><tbody>";
        body.forEach(function (r) { t += "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; });
        out.push(t + "</tbody></table>"); continue;
      }
      if (/^\s*[-*] /.test(ln)) { var it = []; while (i < lines.length && /^\s*[-*] /.test(lines[i])) { it.push("<li>" + inline(lines[i].replace(/^\s*[-*] /, "")) + "</li>"); i++; } out.push("<ul>" + it.join("") + "</ul>"); continue; }
      if (/^\s*\d+\. /.test(ln)) { var oi = []; while (i < lines.length && /^\s*\d+\. /.test(lines[i])) { oi.push("<li>" + inline(lines[i].replace(/^\s*\d+\. /, "")) + "</li>"); i++; } out.push("<ol>" + oi.join("") + "</ol>"); continue; }
      if (ln.trim() === "") { i++; continue; }
      out.push("<p>" + inline(ln) + "</p>"); i++;
    }
    return out.join("");
  }
  function renderDocText(text) {
    return text.replace(/\r/g, "").split(/\n{2,}/).map(function (b) { b = b.trim(); return b ? "<p>" + escp(b).replace(/\n/g, "<br>") + "</p>" : ""; }).join("");
  }

  var view = document.getElementById("view");
  var toastEl = document.getElementById("toast"), toastT;
  function toast(msg, gold) { toastEl.textContent = msg; toastEl.style.background = gold ? "#f5b53d" : "var(--lime)"; toastEl.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 1900); }
  function curTrack() { return state.track && trackById[state.track] ? trackById[state.track] : null; }
  function header() {
    var li = levelInfo();
    document.getElementById("levelpill").textContent = "Level " + (li.idx + 1) + " · " + li.name;
    document.getElementById("xpbar").style.width = Math.max(0, Math.min(100, li.pct)) + "%";
    document.getElementById("coins").textContent = li.xp.toLocaleString();
    document.getElementById("streak").textContent = state.streak || 1;
    document.getElementById("avatar").textContent = (state.identity && state.identity.name ? state.identity.name.replace(/[^A-Za-z ]/g, "").split(" ").map(function (x) { return x[0]; }).join("").slice(0, 2).toUpperCase() : "A");
    var foot = document.getElementById("foot");
    if (foot) foot.textContent = Object.keys(state.completed).length + " lessons · " + Object.keys(state.badges).length + " badges";
  }
  function setNav() {
    var has = !!curTrack();
    document.querySelectorAll(".nav[data-go]").forEach(function (n) {
      n.classList.toggle("on", n.dataset.go === route.name);
      n.style.display = (!has && n.dataset.go !== "reset") ? "none" : "";
    });
    var sw = document.getElementById("switchTrack");
    if (sw) sw.style.display = has ? "" : "none";
  }

  var route = { name: "dashboard" };
  function go(name, param) { route = { name: name, param: param }; render(); window.scrollTo(0, 0); }
  window.eaGo = go;
  document.querySelectorAll(".nav[data-go]").forEach(function (n) {
    n.addEventListener("click", function () {
      var t = n.dataset.go;
      if (t === "switch") { state.track = null; save(); go("dashboard"); return; }
      if (t === "reset") { if (confirm("Reset all progress?")) { localStorage.removeItem(KEY); state = load(); go("dashboard"); } return; }
      go(t);
    });
  });

  function identityScreen() {
    var inp = 'width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--panel2);color:var(--txt);font:inherit;margin-bottom:12px';
    view.innerHTML = '<div style="max-width:440px"><h1>Welcome to Eterna Academy</h1>'
      + '<p class="sub">Tell us who you are so your progress saves across devices and your certifications reach your manager.</p>'
      + '<div class="card"><label style="display:block;font-size:13px;color:var(--txt2);margin-bottom:4px">Full name</label>'
      + '<input id="id_name" style="' + inp + '">'
      + '<label style="display:block;font-size:13px;color:var(--txt2);margin-bottom:4px">Work email</label>'
      + '<input id="id_email" type="email" style="' + inp + 'margin-bottom:14px">'
      + '<button class="btn" onclick="eaIdentity()">Continue</button>'
      + '<div id="id_err" class="fb bad" style="display:none;margin-top:10px"></div></div></div>';
  }
  window.eaIdentity = function () {
    var n = (document.getElementById("id_name").value || "").trim();
    var e = (document.getElementById("id_email").value || "").trim().toLowerCase();
    if (!n || e.indexOf("@") < 1) { var er = document.getElementById("id_err"); er.style.display = "block"; er.textContent = "Enter your name and a valid work email."; return; }
    state.identity = { name: n, email: e }; save();
    syncDown().then(function () { render(); });
  };

  function uploadItems(l) { var a = []; (l.carriers || []).forEach(function (c) { a.push({ name: c, kind: "carrier" }); }); (l.proof || []).forEach(function (x) { a.push({ name: x, kind: "proof" }); }); return a; }
  function orientStatus(name) { return (state.orientation.items && state.orientation.items[name]) || null; }
  function lesson_upload(l) {
    var items = uploadItems(l);
    var done = items.every(function (it) { var s = orientStatus(it.name); return s && (s.status === "uploaded" || s.status === "dont_have"); });
    if (done && !state.completed[l.id]) completeLesson(l);
    var rows = items.map(function (it) {
      var s = orientStatus(it.name);
      var badge = s ? (s.status === "uploaded" ? '<span class="badge b-good"><i class="ti ti-check" style="vertical-align:-2px"></i> Uploaded</span>' : '<span class="badge" style="background:rgba(192,57,43,.12);color:var(--bad)">Don\'t have</span>') : '<span class="badge" style="background:var(--panel2);color:var(--txt2)">Pending</span>';
      var slug = it.kind + "_" + it.name.replace(/[^a-zA-Z0-9]/g, "");
      return '<div class="card" style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div style="flex:1"><b style="font-weight:600">' + escp(it.name) + '</b> ' + badge + '</div>'
        + '<label class="btn ghost" style="cursor:pointer;margin:0">Upload<input type="file" accept="image/*" style="display:none" onchange="eaUpload(\'' + l.id + '\',\'' + escp(it.name) + '\',\'' + slug + '\',this)"></label>'
        + '<button class="btn ghost" onclick="eaDontHave(\'' + l.id + '\',\'' + escp(it.name) + '\')">Don\'t have</button></div>';
    }).join("");
    document.getElementById("lextra").innerHTML = '<div style="margin-top:8px">' + rows + '</div>' + (done ? '<div class="fb good" style="display:block;margin-top:6px"><b>All set.</b> ' + nextBtn(l) + '</div>' : '');
  }
  window.eaUpload = function (lid, name, slug, input) {
    var f = input.files && input.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      fetch(window.EA_API + "/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pw: sessionStorage.getItem("ea_pw"), email: state.identity.email, slug: slug, dataURL: reader.result }) }).catch(function () {});
      state.orientation.items = state.orientation.items || {}; state.orientation.items[name] = { status: "uploaded", slug: slug };
      save(); toast("Uploaded · " + name); lesson_upload(lessonById[lid]); checkBadges(); header();
    };
    reader.readAsDataURL(f);
  };
  window.eaDontHave = function (lid, name) {
    state.orientation.items = state.orientation.items || {}; state.orientation.items[name] = { status: "dont_have" };
    save(); toast("Flagged for your manager · " + name); lesson_upload(lessonById[lid]); checkBadges(); header();
  };

  function lesson_exam(l) {
    var qs = (l.quizzes || []).map(function (q) { return qById[q]; }).filter(Boolean);
    var pass = l.pass || 80;
    document.getElementById("lextra").innerHTML = '<div class="card"><div style="font-weight:600;margin-bottom:2px">Exam · ' + qs.length + ' questions · pass ' + pass + '%</div><div class="sub" style="margin:0 0 12px">Answer all, then submit.</div><div id="examqs"></div><button class="btn" id="examsubmit" onclick="eaExamSubmit(\'' + l.id + '\')">Submit exam</button><div id="examres"></div></div>';
    document.getElementById("examqs").innerHTML = qs.map(function (q, i) {
      return '<div class="card" data-eq="' + q.id + '" style="margin-bottom:10px"><div style="font-weight:500;margin-bottom:8px">' + (i + 1) + '. ' + escp(q.q) + '</div>' + q.options.map(function (o, j) { return '<button class="opt" onclick="eaExamPick(\'' + q.id + '\',' + j + ',this)">' + escp(o) + '</button>'; }).join("") + '</div>';
    }).join("");
    window._exam = { ans: {} };
  }
  window.eaExamPick = function (qid, j, btn) { window._exam.ans[qid] = j; var card = btn.closest("[data-eq]"); card.querySelectorAll(".opt").forEach(function (b) { b.style.borderColor = ""; }); btn.style.borderColor = "var(--green2)"; };
  window.eaExamSubmit = function (lid) {
    var l = lessonById[lid], qs = (l.quizzes || []).map(function (q) { return qById[q]; }).filter(Boolean), pass = l.pass || 80;
    var correct = 0; qs.forEach(function (q) { if (window._exam.ans[q.id] === q.answer) correct++; });
    var score = Math.round(correct / qs.length * 100), passed = score >= pass;
    state.orientation.exam = { score: score, passed: passed };
    var res = document.getElementById("examres");
    if (passed) {
      if (!state.completed[l.id]) completeLesson(l); save(); checkBadges(); header();
      res.innerHTML = '<div class="fb good" style="display:block;margin-top:12px"><b>Passed — ' + score + '%!</b><br>You\'re certified. <b>Orientation with Jessica is unlocked</b> and you\'re cleared to start taking live inbound calls. Your manager has been notified.</div>';
      document.getElementById("examsubmit").disabled = true;
    } else {
      save();
      res.innerHTML = '<div class="fb bad" style="display:block;margin-top:12px"><b>Scored ' + score + '% — need ' + pass + '%.</b> Review the orientation and try again.<br><button class="btn ghost" style="margin-top:8px" onclick="eaGo(\'lesson\',\'' + l.id + '\')">Retake exam</button></div>';
    }
  };

  function render() {
    header(); setNav();
    if (!state.identity) return identityScreen();
    if (!curTrack()) return rolePicker();
    var r = route.name;
    if (r === "curriculum") return curriculum();
    if (r === "lesson") return lesson(route.param);
    if (r === "arena") return arena();
    if (r === "quiz") return quizbank();
    if (r === "videolib") return videolib(null);
    if (r === "leaderboard") return leaderboard();
    if (r === "badges") return badges();
    dashboard();
  }

  function rolePicker() {
    view.innerHTML = '<div style="max-width:760px"><h1>Choose your track</h1><p class="sub">Three paths, each built from the real Eterna library. Pick where you are — you can switch anytime.</p><div class="grid" style="grid-template-columns:1fr;gap:14px">' +
      TRACKS.map(function (t) {
        var n = t.modules.reduce(function (a, m) { return a + m.lessons.length; }, 0);
        return '<div class="card" style="cursor:pointer;display:flex;gap:16px;align-items:flex-start" onclick="eaPick(\'' + t.id + '\')"><div class="ic" style="width:46px;height:46px;font-size:24px;background:var(--accent-soft);color:var(--lime)"><i class="ti ' + t.icon + '"></i></div><div style="flex:1"><div style="font-weight:600;font-size:17px">' + escp(t.title) + '</div><div class="sub" style="margin:4px 0 8px">' + escp(t.blurb) + '</div><div style="font-size:12px;color:var(--txt2)">' + t.modules.length + ' modules · ' + n + ' lessons</div></div><i class="ti ti-arrow-right" style="color:var(--lime);font-size:22px"></i></div>';
      }).join("") + '</div></div>';
  }
  window.eaPick = function (id) { state.track = id; state.seenTracks[id] = true; save(); go("dashboard"); };

  function dashboard() {
    var t = curTrack(), li = levelInfo();
    var lessons = []; t.modules.forEach(function (m) { m.lessons.forEach(function (l) { lessons.push(l); }); });
    var done = lessons.filter(lessonComplete).length;
    var modsDone = t.modules.filter(moduleComplete).length;
    var next = null; for (var i = 0; i < lessons.length && !next; i++) if (!lessonComplete(lessons[i])) next = lessons[i];
    view.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:2px"><div class="ic" style="background:var(--accent-soft);color:var(--lime)"><i class="ti ' + t.icon + '"></i></div><h1 style="margin:0">' + escp(t.title) + ' track</h1></div>' +
      '<p class="sub">' + (li.ceil - li.xp) + ' XP to Level ' + (li.idx + 2) + '. ' + (state.streak || 1) + '-day streak.</p>' +
      '<div class="grid cards4" style="margin-bottom:14px">' +
        sc("Level", (li.idx + 1), li.name) + sc("Total XP", li.xp.toLocaleString(), "of " + li.ceil.toLocaleString()) +
        sc("Modules", modsDone + " / " + t.modules.length, Math.round(done / lessons.length * 100) + "% lessons") +
        sc("Badges", Object.keys(state.badges).length, "of " + BADGES.length) + '</div>' +
      (next ? '<div class="card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center"><div><div style="color:var(--txt2);font-size:12px">Continue</div><div style="font-weight:600">' + escp(lessonModule[next.id].title) + ' · ' + escp(lessonTitle(next)) + '</div></div><button class="btn" onclick="eaGo(\'lesson\',\'' + next.id + '\')">Resume</button></div></div>'
        : '<div class="card" style="margin-bottom:14px;color:var(--lime)"><i class="ti ti-confetti"></i> Track complete. Outstanding.</div>') +
      '<div class="grid" style="grid-template-columns:1fr 1fr">' +
        '<div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="ti ti-target-arrow" style="color:var(--warn)"></i> <b style="font-weight:600">Daily challenge</b></div><p class="sub" style="margin:0 0 12px">Clear the objection arena.</p><button class="btn" onclick="eaGo(\'arena\')">Start</button></div>' +
        '<div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><i class="ti ti-award" style="color:var(--info)"></i> <b style="font-weight:600">Badges</b></div><div style="display:flex;gap:8px;flex-wrap:wrap">' + recentBadges() + '</div></div></div>';
  }
  function sc(k, v, s) { return '<div class="card stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>'; }
  function recentBadges() { var e = BADGES.filter(function (b) { return state.badges[b.id]; }); return e.length ? e.slice(-4).map(function (b) { return '<span class="badge b-good">' + b.t + '</span>'; }).join("") : '<span class="sub" style="margin:0">None yet.</span>'; }

  function curriculum() {
    var t = curTrack();
    view.innerHTML = '<h1>' + escp(t.title) + ' curriculum</h1><p class="sub">' + t.modules.length + ' modules. Click a module to expand.</p><div id="curr"></div>';
    document.getElementById("curr").innerHTML = t.modules.map(function (m, i) {
      var done = moduleComplete(m), prog = moduleProgress(m), c = done ? "var(--lime)" : (prog > 0 ? "var(--info)" : "var(--txt2)");
      var les = m.lessons.map(function (l) {
        var lc = lessonComplete(l);
        var icon = lc ? "ti-circle-check" : (l.type === "video" ? "ti-player-play" : l.type === "quiz" ? "ti-help-circle" : l.type === "roleplay" ? "ti-microphone-2" : l.type === "doc" ? "ti-file-text" : l.type === "library" ? "ti-player-play" : "ti-book");
        return '<div class="les' + (lc ? ' done' : '') + '" onclick="eaGo(\'lesson\',\'' + l.id + '\')"><span class="ticon"><i class="ti ' + icon + '"></i></span><span class="lt">' + escp(lessonTitle(l)) + '</span><span class="typetag">' + l.type + '</span><span class="lx">+' + (l.xp || 0) + '</span></div>';
      }).join("");
      return '<div class="mod' + ((prog > 0 && !done) ? ' open' : '') + '" id="mod' + i + '"><div class="mod-h" onclick="document.getElementById(\'mod' + i + '\').classList.toggle(\'open\')"><div class="ic" style="background:var(--chip);color:' + c + '"><i class="ti ' + m.icon + '"></i></div><div style="flex:1"><div style="font-weight:600">' + (i + 1) + '. ' + escp(m.title) + '</div><div style="font-size:12px;color:var(--txt2)">' + escp(m.summary || "") + '</div></div><div style="text-align:right;min-width:70px"><div style="font-size:12px;color:' + c + '">' + (done ? "Done" : prog + "%") + '</div><div class="prog" style="width:60px;margin-top:5px"><i style="width:' + prog + '%"></i></div></div></div><div class="mod-les">' + les + '</div></div>';
    }).join("");
  }

  function lesson(id) {
    var l = lessonById[id]; if (!l) return go("curriculum");
    var m = lessonModule[id];
    var h = '<button class="back" onclick="eaGo(\'curriculum\')"><i class="ti ti-arrow-left"></i> ' + escp(m.title) + '</button><h1>' + escp(lessonTitle(l)) + '</h1><p class="sub"><span class="typetag">' + l.type + '</span> &nbsp;+' + (l.xp || 0) + ' XP</p>';
    if (l.type === "library") { view.innerHTML = h + '<div id="lib"></div>'; videolib(curTrack().id, "lib"); return; }
    if (l.type === "video" && l.video) h += '<div class="vidwrap"><iframe src="https://drive.google.com/file/d/' + l.video + '/preview" allow="autoplay" allowfullscreen></iframe></div><p class="sub" style="font-size:12px"><i class="ti ti-info-circle" style="vertical-align:-2px"></i> Streaming from your Drive.</p>';
    if (l.body) h += '<div class="content">' + md(l.body) + '</div>';
    if (l.type === "doc") h += '<div class="content" id="docbody"><p class="sub"><i class="ti ti-loader"></i> Decrypting document…</p></div>';
    h += '<div id="lextra"></div>';
    view.innerHTML = h;
    if (l.type === "doc") loadDoc(l.doc).then(function (txt) { document.getElementById("docbody").innerHTML = renderDocText(txt); }).catch(function () { document.getElementById("docbody").innerHTML = '<p class="fb bad" style="display:block">Could not load this document. Try re-entering your password.</p>'; });
    if (l.type === "exam") { lesson_exam(l); return; }
    if (l.type === "upload") { lesson_upload(l); return; }
    if (l.type === "roleplay") { renderRoleplay(l); return; }
    var quizzes = (l.quizzes || []).map(function (q) { return qById[q]; }).filter(Boolean);
    if (quizzes.length) { renderQuizSet(l, quizzes); return; }
    document.getElementById("lextra").innerHTML = '<div style="margin-top:18px">' + (state.completed[l.id] ? '<span class="badge b-good"><i class="ti ti-check" style="vertical-align:-2px"></i> Completed</span> ' : '<button class="btn" onclick="eaMark(\'' + l.id + '\')">Mark complete · +' + (l.xp || 0) + ' XP</button>') + nextBtn(l) + '</div>';
  }
  window.eaMark = function (id) { completeLesson(lessonById[id]); render(); };
  function nextBtn(l) {
    var flat = []; curTrack().modules.forEach(function (m) { m.lessons.forEach(function (x) { flat.push(x); }); });
    var idx = flat.findIndex(function (x) { return x.id === l.id; });
    if (idx >= 0 && idx < flat.length - 1) return ' <button class="btn ghost" onclick="eaGo(\'lesson\',\'' + flat[idx + 1].id + '\')">Next <i class="ti ti-arrow-right" style="vertical-align:-2px"></i></button>';
    return "";
  }

  function renderQuizSet(l, quizzes) {
    document.getElementById("lextra").innerHTML = '<h2>Knowledge check</h2>' + quizzes.map(function (q) {
      return '<div class="card" style="margin-bottom:12px" data-q="' + q.id + '"><div style="font-weight:500;margin-bottom:10px">' + escp(q.q) + '</div><div class="qopts">' + q.options.map(function (o, j) { return '<button class="opt" onclick="eaAns(\'' + q.id + '\',' + j + ',this)">' + escp(o) + '</button>'; }).join("") + '</div><div class="qfb fb" style="display:none"></div></div>';
    }).join("") + '<div id="qdone"></div>';
    maybeQuizDone(l);
  }
  window.eaAns = function (qid, j, btn) {
    var q = qById[qid], card = btn.closest("[data-q]");
    card.querySelectorAll(".opt").forEach(function (b) { b.disabled = true; });
    var fb = card.querySelector(".qfb"); fb.style.display = "block";
    if (j === q.answer) { btn.classList.add("right"); var first = !state.quiz[qid]; state.quiz[qid] = true; save(); fb.className = "qfb fb good"; fb.innerHTML = "<b>Correct! +" + (first ? q.xp : 0) + " XP.</b> " + escp(q.explain); if (first) { toast("+" + q.xp + " XP"); checkBadges(); header(); } }
    else { btn.classList.add("wrong"); card.querySelectorAll(".opt")[q.answer].classList.add("right"); fb.className = "qfb fb bad"; fb.innerHTML = "<b>Not quite.</b> " + escp(q.explain); if (!(qid in state.quiz)) { state.quiz[qid] = false; save(); } }
    if (route.name === "lesson") { var l = lessonById[route.param]; if (l) maybeQuizDone(l); }
  };
  function maybeQuizDone(l) {
    if (!l || !l.quizzes) return;
    if (l.quizzes.every(function (q) { return document.querySelector('[data-q="' + q + '"] .opt[disabled]'); }) && !state.completed[l.id]) completeLesson(l);
    if (l.quizzes.every(function (q) { return q in state.quiz; })) { var d = document.getElementById("qdone"); if (d) d.innerHTML = '<span class="badge b-good"><i class="ti ti-check" style="vertical-align:-2px"></i> Complete</span> ' + nextBtn(l); }
  }

  function renderRoleplay(l) {
    document.getElementById("lextra").innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;color:var(--txt2);font-size:12px;margin-bottom:12px"><span id="rpstep"></span><span id="rpscore"></span></div><div class="lead"><div class="ic" style="background:var(--panel2)"><i class="ti ti-user"></i></div><div class="bubble" id="rpline"></div></div><div id="rpopts"></div><div id="rpfb" class="fb" style="display:none"></div></div>';
    window._rp = { l: l, ids: l.roleplay || [], i: 0, score: 0 }; drawRP();
  }
  function drawRP() {
    var st = window._rp, s = rpById[st.ids[st.i]];
    document.getElementById("rpstep").textContent = "Objection " + (st.i + 1) + " of " + st.ids.length + (s.category ? " · " + s.category : "");
    document.getElementById("rpscore").textContent = "Score: " + st.score + " XP";
    document.getElementById("rpline").innerHTML = "Client: <em>" + escp(s.client) + "</em>";
    document.getElementById("rpfb").style.display = "none";
    document.getElementById("rpopts").innerHTML = s.options.map(function (o, j) { return '<button class="opt" onclick="eaRP(' + j + ')">' + escp(o.text) + '</button>'; }).join("");
  }
  window.eaRP = function (j) {
    var st = window._rp, s = rpById[st.ids[st.i]], o = s.options[j];
    document.querySelectorAll("#rpopts .opt").forEach(function (b) { b.disabled = true; });
    var fb = document.getElementById("rpfb"); fb.style.display = "block";
    if (o.score >= 100) {
      st.score += o.score; if (!state.rp[s.id]) { state.rp[s.id] = true; save(); header(); }
      fb.className = "fb good"; fb.innerHTML = "<b>+" + o.score + " XP.</b> " + escp(o.feedback);
      document.getElementById("rpscore").textContent = "Score: " + st.score + " XP";
      setTimeout(function () { st.i++; if (st.i < st.ids.length) drawRP(); else { completeLesson(st.l); checkBadges(); document.getElementById("rpopts").innerHTML = ""; fb.innerHTML = "<b>Set complete · " + st.score + " XP.</b> " + nextBtn(st.l); } }, 1150);
    } else { fb.className = "fb bad"; fb.innerHTML = "<b>+0 XP.</b> " + escp(o.feedback) + " Try again."; setTimeout(function () { document.querySelectorAll("#rpopts .opt").forEach(function (b) { b.disabled = false; }); fb.style.display = "none"; }, 1500); }
  };

  function arena() {
    view.innerHTML = '<h1>Roleplay arena</h1><p class="sub">Real objections from your playbooks. Scored on agree → acknowledge → ask.</p><div class="grid" style="grid-template-columns:1fr 1fr">' +
      groupBy(RP, "category").map(function (g) {
        var dn = g.items.filter(function (s) { return state.rp[s.id]; }).length;
        return '<div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="ti ti-microphone-2" style="color:var(--info)"></i> <b style="font-weight:600">' + escp(g.key) + '</b></div><p class="sub" style="margin:0 0 10px">' + dn + ' / ' + g.items.length + ' mastered</p><button class="btn" onclick="eaArena(\'' + escp(g.key) + '\')">Practice</button></div>';
      }).join("") + '</div>';
  }
  window.eaArena = function (cat) {
    var ids = RP.filter(function (s) { return s.category === cat; }).map(function (s) { return s.id; });
    var l = { id: "arena_" + cat, title: cat, type: "roleplay", roleplay: ids, xp: 0 };
    lessonById[l.id] = l; lessonModule[l.id] = { title: "Roleplay arena" }; lessonTrack[l.id] = curTrack();
    view.innerHTML = '<button class="back" onclick="eaGo(\'arena\')"><i class="ti ti-arrow-left"></i> Roleplay arena</button><h1>' + escp(cat) + '</h1><p class="sub"><span class="typetag">roleplay</span></p><div id="lextra"></div>';
    renderRoleplay(l);
  };
  function quizbank() {
    view.innerHTML = '<h1>Quiz bank</h1><p class="sub">' + Object.keys(state.quiz).filter(function (q) { return state.quiz[q]; }).length + ' / ' + QZ.length + ' correct.</p>' +
      groupBy(QZ, "topic").map(function (g) {
        return '<h2>' + escp(g.key) + '</h2>' + g.items.map(function (q) {
          var a = state.quiz[q.id];
          return '<div class="card" style="margin-bottom:12px" data-q="' + q.id + '"><div style="font-weight:500;margin-bottom:10px">' + escp(q.q) + (a ? ' <i class="ti ti-circle-check" style="color:var(--lime);vertical-align:-2px"></i>' : '') + '</div><div class="qopts">' + q.options.map(function (o, j) { return '<button class="opt' + (a && j === q.answer ? ' right' : '') + '" ' + (a ? 'disabled' : '') + ' onclick="eaAns(\'' + q.id + '\',' + j + ',this)">' + escp(o) + '</button>'; }).join("") + '</div><div class="qfb fb" ' + (a ? '' : 'style="display:none"') + '>' + (a ? "<b>Correct!</b> " + escp(q.explain) : "") + '</div></div>';
        }).join("");
      }).join("");
  }
  function videolib(trackId, mount) {
    var tid = trackId || curTrack().id;
    var vids = VIDEOS.filter(function (v) { return v.track === tid; });
    var html = (mount ? "" : '<h1>Video library</h1><p class="sub">' + vids.length + ' training videos for the ' + escp(curTrack().title) + ' track, streaming from your Drive.</p>') +
      '<div class="grid" style="grid-template-columns:1fr 1fr">' + vids.map(function (v) {
        return '<div class="card" style="padding:0;overflow:hidden"><div class="vidwrap" style="margin:0;border-radius:0;border:0;border-bottom:1px solid var(--line)"><iframe src="https://drive.google.com/file/d/' + v.id + '/preview" allowfullscreen></iframe></div><div style="padding:10px 12px;font-size:13px;font-weight:500">' + escp(v.t) + '</div></div>';
      }).join("") + '</div>';
    if (mount) document.getElementById(mount).innerHTML = html; else view.innerHTML = html;
  }
  function leaderboard() {
    var li = levelInfo();
    var peers = [["Aaliyah R.", 6, 4120], ["Diego M.", 5, 3980], ["Priya S.", 5, 3470], ["Jordan K.", 4, 2310], ["Sam T.", 3, 1890], ["Mia L.", 3, 1540]];
    peers.push(["You", li.idx + 1, li.xp, true]); peers.sort(function (a, b) { return b[2] - a[2]; });
    view.innerHTML = '<h1>Team leaderboard</h1><p class="sub">This week · XP earned in training.</p>' + peers.map(function (r, i) {
      var me = r[3];
      return '<div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 14px;margin-bottom:7px;' + (me ? 'border-color:var(--lime)' : '') + '"><span style="width:20px;font-weight:600;color:' + (me ? 'var(--lime)' : 'var(--txt2)') + '">' + (i + 1) + '</span><div class="av" style="width:30px;height:30px">' + r[0][0] + '</div><span style="flex:1;' + (me ? 'color:var(--lime-t);font-weight:600' : '') + '">' + escp(r[0]) + '</span><span style="font-size:12px;color:var(--txt2)">Lv ' + r[1] + '</span><span style="font-weight:600;min-width:54px;text-align:right">' + r[2].toLocaleString() + '</span></div>';
    }).join("");
  }
  function badges() {
    view.innerHTML = '<h1>Badges</h1><p class="sub">' + Object.keys(state.badges).length + ' of ' + BADGES.length + ' earned.</p><div class="grid" style="grid-template-columns:repeat(4,1fr)">' + BADGES.map(function (b) {
      var on = state.badges[b.id];
      return '<div class="card" style="text-align:center;' + (on ? '' : 'opacity:.45') + '"><div class="ic" style="margin:0 auto 8px;width:46px;height:46px;font-size:24px;background:var(--info-soft);color:' + (on ? 'var(--info)' : 'var(--txt2)') + '"><i class="ti ' + b.i + '"></i></div><div style="font-weight:600;font-size:13.5px">' + escp(b.t) + '</div><div style="font-size:11px;color:var(--txt2)">' + (on ? 'Earned' : 'Locked') + '</div></div>';
    }).join("") + '</div>';
  }
  function groupBy(arr, key) { var m = {}, o = []; arr.forEach(function (x) { var k = x[key] || "Other"; if (!m[k]) { m[k] = []; o.push(k); } m[k].push(x); }); return o.map(function (k) { return { key: k, items: m[k] }; }); }

  checkBadges(); render();
})();
