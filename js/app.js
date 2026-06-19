(function () {
  "use strict";
  var D = window.EA_DATA;
  var CUR = D.curriculum, RP = D.roleplay.scenarios, QZ = D.quizzes.questions, VID = D.videos;
  var LEVELS = CUR.levels;
  var THRESH = [0, 300, 700, 1200, 1900, 2800];
  var RP_XP = 50;

  var qById = {}; QZ.forEach(function (q) { qById[q.id] = q; });
  var rpById = {}; RP.forEach(function (s) { rpById[s.id] = s; });
  var lessonById = {}, lessonModule = {};
  CUR.modules.forEach(function (m) { m.lessons.forEach(function (l) { lessonById[l.id] = l; lessonModule[l.id] = m; }); });

  // ---------- state ----------
  var KEY = "eterna_academy_v1";
  var state = load();
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY)); if (s) return s; } catch (e) {}
    return { name: "Agent", completed: {}, quiz: {}, rp: {}, badges: {}, streak: 1, lastActive: today() };
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function today() { return new Date().toISOString().slice(0, 10); }

  // streak
  (function () {
    var t = today();
    if (state.lastActive !== t) {
      var d = new Date(state.lastActive); d.setDate(d.getDate() + 1);
      state.streak = (d.toISOString().slice(0, 10) === t) ? (state.streak || 0) + 1 : 1;
      state.lastActive = t; save();
    }
  })();

  // ---------- xp / level ----------
  function xp() {
    var x = 0;
    Object.keys(state.completed).forEach(function (id) { if (lessonById[id]) x += lessonById[id].xp || 0; });
    Object.keys(state.quiz).forEach(function (id) { if (state.quiz[id] && qById[id]) x += qById[id].xp || 0; });
    Object.keys(state.rp).forEach(function (id) { if (state.rp[id]) x += RP_XP; });
    return x;
  }
  function levelIdx(x) { var i = 0; for (var k = 0; k < THRESH.length; k++) if (x >= THRESH[k]) i = k; return i; }
  function levelInfo() {
    var x = xp(), i = levelIdx(x);
    var floor = THRESH[i], ceil = THRESH[i + 1] || (floor + 1000);
    return { idx: i, name: LEVELS[i], xp: x, floor: floor, ceil: ceil, pct: Math.round(((x - floor) / (ceil - floor)) * 100) };
  }

  // ---------- completion ----------
  function lessonComplete(l) {
    if (state.completed[l.id]) return true;
    if (l.type === "quiz") return (l.quizzes || []).every(function (q) { return q in state.quiz; });
    if (l.type === "roleplay") return (l.roleplay || []).every(function (s) { return s in state.rp; });
    return false;
  }
  function moduleComplete(m) { return m.lessons.every(lessonComplete); }
  function moduleProgress(m) { var d = m.lessons.filter(lessonComplete).length; return Math.round((d / m.lessons.length) * 100); }
  function completeLesson(l) { if (!state.completed[l.id]) { state.completed[l.id] = true; save(); toast("+" + (l.xp || 0) + " XP · " + l.title); checkBadges(); } }

  // ---------- badges ----------
  var BADGES = [
    { id: "first", t: "First steps", i: "ti-shoe", on: function () { return Object.keys(state.completed).length > 0; } },
    { id: "setter", t: "Setter graduate", i: "ti-headset", on: function () { return moduleComplete(CUR.modules[2]); } },
    { id: "nepq", t: "NEPQ rookie", i: "ti-brain", on: function () { return ["q_nepq_1", "q_nepq_2", "q_nepq_3"].some(function (q) { return state.quiz[q]; }); } },
    { id: "slayer", t: "Objection slayer", i: "ti-shield-check", on: function () { return RP.filter(function (s) { return s.id.indexOf("rp_obj") === 0; }).every(function (s) { return state.rp[s.id]; }); } },
    { id: "iul", t: "IUL expert", i: "ti-chart-line", on: function () { return state.quiz["q_iul_1"] && state.quiz["q_iul_2"]; } },
    { id: "carrier", t: "Carrier pro", i: "ti-building-bank", on: function () { return moduleComplete(CUR.modules[6]); } },
    { id: "uw", t: "Underwriter", i: "ti-clipboard-heart", on: function () { return moduleComplete(CUR.modules[7]); } },
    { id: "streak7", t: "On fire (7-day)", i: "ti-flame", on: function () { return (state.streak || 0) >= 7; } },
    { id: "quizmaster", t: "Quiz master", i: "ti-checks", on: function () { return Object.keys(state.quiz).filter(function (q) { return state.quiz[q]; }).length >= 15; } },
    { id: "grad", t: "Academy graduate", i: "ti-school", on: function () { return CUR.modules.every(moduleComplete); } }
  ];
  function checkBadges() {
    BADGES.forEach(function (b) {
      if (!state.badges[b.id] && b.on()) { state.badges[b.id] = true; save(); toast("Badge unlocked · " + b.t, true); }
    });
  }

  // ---------- markdown-lite ----------
  function inline(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }
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
        var head = cells[0], body = cells.slice(cells[1] && /^-+$/.test(cells[1][0].replace(/[ :-]/g, "-").replace(/-+/, "-")) ? 2 : 1);
        var sep = cells[1] && cells[1].every(function (c) { return /^:?-+:?$/.test(c); });
        body = cells.slice(sep ? 2 : 1);
        var t = "<table><thead><tr>" + head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead><tbody>";
        body.forEach(function (r) { t += "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; });
        out.push(t + "</tbody></table>"); continue;
      }
      if (/^\s*[-*] /.test(ln)) {
        var items = []; while (i < lines.length && /^\s*[-*] /.test(lines[i])) { items.push("<li>" + inline(lines[i].replace(/^\s*[-*] /, "")) + "</li>"); i++; }
        out.push("<ul>" + items.join("") + "</ul>"); continue;
      }
      if (/^\s*\d+\. /.test(ln)) {
        var oi = []; while (i < lines.length && /^\s*\d+\. /.test(lines[i])) { oi.push("<li>" + inline(lines[i].replace(/^\s*\d+\. /, "")) + "</li>"); i++; }
        out.push("<ol>" + oi.join("") + "</ol>"); continue;
      }
      if (ln.trim() === "") { i++; continue; }
      out.push("<p>" + inline(ln) + "</p>"); i++;
    }
    return out.join("");
  }

  // ---------- ui helpers ----------
  var view = document.getElementById("view");
  function esc(s){return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  var toastEl = document.getElementById("toast"), toastT;
  function toast(msg, gold) {
    toastEl.textContent = msg; toastEl.style.background = gold ? "#f5b53d" : "var(--lime)";
    toastEl.classList.add("show"); clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 1900);
  }
  function header() {
    var li = levelInfo();
    document.getElementById("levelpill").textContent = "Level " + (li.idx + 1) + " · " + li.name;
    document.getElementById("xpbar").style.width = Math.max(0, Math.min(100, li.pct)) + "%";
    document.getElementById("coins").textContent = li.xp.toLocaleString();
    document.getElementById("streak").textContent = state.streak || 1;
    document.getElementById("avatar").textContent = (state.name || "A").slice(0, 2).toUpperCase();
    var done = Object.keys(state.completed).length;
    document.getElementById("foot").textContent = done + " lessons · " + Object.keys(state.badges).length + " badges";
  }

  // ---------- router ----------
  var route = { name: "dashboard" };
  function go(name, param) { route = { name: name, param: param }; render(); window.scrollTo(0, 0); }
  window.eaGo = go;
  document.querySelectorAll(".nav[data-go]").forEach(function (n) {
    n.addEventListener("click", function () {
      var t = n.dataset.go;
      if (t === "reset") { if (confirm("Reset all progress?")) { localStorage.removeItem(KEY); state = load(); go("dashboard"); } return; }
      go(t);
    });
  });
  function setNav() { document.querySelectorAll(".nav[data-go]").forEach(function (n) { n.classList.toggle("on", n.dataset.go === route.name); }); }

  // ---------- screens ----------
  function render() {
    header(); setNav();
    var r = route.name;
    if (r === "dashboard") return dashboard();
    if (r === "curriculum") return curriculum();
    if (r === "lesson") return lesson(route.param);
    if (r === "arena") return arena();
    if (r === "quiz") return quizbank();
    if (r === "leaderboard") return leaderboard();
    if (r === "badges") return badges();
    dashboard();
  }

  function dashboard() {
    var li = levelInfo();
    var nextLevel = LEVELS[li.idx + 1] || "max level";
    var totalLessons = 0, doneLessons = 0;
    CUR.modules.forEach(function (m) { m.lessons.forEach(function (l) { totalLessons++; if (lessonComplete(l)) doneLessons++; }); });
    var modsDone = CUR.modules.filter(moduleComplete).length;
    // continue lesson
    var next = null;
    for (var i = 0; i < CUR.modules.length && !next; i++) for (var j = 0; j < CUR.modules[i].lessons.length; j++) { if (!lessonComplete(CUR.modules[i].lessons[j])) { next = CUR.modules[i].lessons[j]; break; } }
    var ringC = 2 * Math.PI * 34, off = ringC * (1 - Math.max(0, li.pct) / 100);
    view.innerHTML =
      '<h1>Welcome back, ' + esc(state.name) + '</h1>' +
      '<p class="sub">' + (li.ceil - li.xp) + ' XP to <span style="color:var(--lime)">Level ' + (li.idx + 2) + ' — ' + esc(nextLevel) + '</span>. ' + (state.streak || 1) + '-day streak.</p>' +
      '<div class="grid cards4" style="margin-bottom:14px">' +
        statCard("Level", (li.idx + 1), li.name) +
        statCard("Total XP", li.xp.toLocaleString(), "of " + li.ceil.toLocaleString()) +
        statCard("Modules", modsDone + " / " + CUR.modules.length, Math.round(doneLessons / totalLessons * 100) + "% lessons") +
        statCard("Badges", Object.keys(state.badges).length, "of " + BADGES.length) +
      '</div>' +
      (next ?
        '<div class="card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div><div style="color:var(--txt2);font-size:12px">Continue learning</div><div style="font-weight:600">' + esc(lessonModule[next.id].title) + ' · ' + esc(next.title) + '</div></div>' +
          '<button class="btn" onclick="eaGo(\'lesson\',\'' + next.id + '\')">Resume</button></div></div>'
        : '<div class="card" style="margin-bottom:14px;color:var(--lime)"><i class="ti ti-confetti"></i> You\'ve completed every lesson. Legend.</div>') +
      '<div class="grid" style="grid-template-columns:1fr 1fr">' +
        '<div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="ti ti-target-arrow" style="color:var(--warn)"></i> <b style="font-weight:600">Daily challenge</b></div><p class="sub" style="margin:0 0 12px">Clear 3 live objections in the arena.</p><button class="btn" onclick="eaGo(\'arena\')">Start · +150 XP</button></div>' +
        '<div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><i class="ti ti-award" style="color:var(--info)"></i> <b style="font-weight:600">Recent badges</b></div><div style="display:flex;gap:8px;flex-wrap:wrap">' + recentBadges() + '</div></div>' +
      '</div>';
  }
  function statCard(k, v, s) { return '<div class="card stat"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>'; }
  function recentBadges() {
    var earned = BADGES.filter(function (b) { return state.badges[b.id]; });
    if (!earned.length) return '<span class="sub" style="margin:0">None yet — finish a lesson to start earning.</span>';
    return earned.slice(-4).map(function (b) { return '<span class="badge b-good">' + b.t + '</span>'; }).join("");
  }

  function curriculum() {
    view.innerHTML = '<h1>Curriculum</h1><p class="sub">' + CUR.modules.length + ' modules from your Drive library, scripts, and Coassemble courses. Built from real Eterna content.</p><div id="curr"></div>';
    var html = CUR.modules.map(function (m, i) {
      var done = moduleComplete(m), prog = moduleProgress(m);
      var c = done ? "var(--lime)" : (prog > 0 ? "var(--info)" : "var(--txt2)");
      var locked = i > 0 && !moduleComplete(CUR.modules[i - 1]) && prog === 0;
      var les = m.lessons.map(function (l) {
        var lc = lessonComplete(l);
        var icon = lc ? "ti-circle-check" : (l.type === "video" ? "ti-player-play" : l.type === "quiz" ? "ti-help-circle" : l.type === "roleplay" ? "ti-microphone-2" : "ti-circle");
        return '<div class="les' + (lc ? ' done' : '') + '" onclick="eaGo(\'lesson\',\'' + l.id + '\')">' +
          '<span class="ticon"><i class="ti ' + icon + '"></i></span>' +
          '<span class="lt">' + esc(l.title) + '</span>' +
          '<span class="typetag">' + l.type + '</span>' +
          '<span class="lx">+' + (l.xp || 0) + ' XP</span></div>';
      }).join("");
      return '<div class="mod' + ((prog > 0 && !done) ? ' open' : '') + '" id="mod' + i + '">' +
        '<div class="mod-h" onclick="document.getElementById(\'mod' + i + '\').classList.toggle(\'open\')">' +
          '<div class="ic" style="background:rgba(255,255,255,.05);color:' + c + '"><i class="ti ' + m.icon + '"></i></div>' +
          '<div style="flex:1"><div style="font-weight:600">' + (i + 1) + '. ' + esc(m.title) + (locked ? ' <i class="ti ti-lock" style="font-size:13px;color:var(--txt2)"></i>' : '') + '</div><div style="font-size:12px;color:var(--txt2)">' + esc(m.summary) + '</div></div>' +
          '<div style="text-align:right;min-width:74px"><div style="font-size:12px;color:' + c + '">' + (done ? "Completed" : prog + "%") + '</div><div class="prog" style="width:64px;margin-top:5px"><i style="width:' + prog + '%"></i></div></div>' +
        '</div><div class="mod-les">' + les + '</div></div>';
    }).join("");
    document.getElementById("curr").innerHTML = html;
  }

  function lesson(id) {
    var l = lessonById[id]; if (!l) return go("curriculum");
    var m = lessonModule[id];
    var h = '<button class="back" onclick="eaGo(\'curriculum\')"><i class="ti ti-arrow-left"></i> ' + esc(m.title) + '</button>' +
      '<h1>' + esc(l.title) + '</h1><p class="sub"><span class="typetag">' + l.type + '</span> &nbsp;+' + (l.xp || 0) + ' XP</p>';
    if (l.type === "video" && l.video) {
      h += '<div class="vidwrap"><iframe src="https://drive.google.com/file/d/' + l.video + '/preview" allow="autoplay" allowfullscreen></iframe></div>' +
        '<p class="sub" style="font-size:12px"><i class="ti ti-info-circle" style="vertical-align:-2px"></i> Streaming from your Drive — nothing re-hosted.</p>';
    }
    if (l.body) h += '<div class="content">' + md(l.body) + '</div>';
    h += '<div id="lextra"></div>';
    var quizzes = (l.quizzes || []).map(function (q) { return qById[q]; }).filter(Boolean);
    if (l.type === "roleplay") { view.innerHTML = h; renderRoleplay(l); return; }
    if (quizzes.length) { view.innerHTML = h; renderQuizSet(l, quizzes); return; }
    // reading / video: complete button
    h += '<div style="margin-top:18px">' + (state.completed[l.id]
      ? '<span class="badge b-good"><i class="ti ti-check" style="vertical-align:-2px"></i> Completed</span> '
      : '<button class="btn" onclick="eaMark(\'' + l.id + '\')">Mark complete · +' + (l.xp || 0) + ' XP</button>') +
      nextBtn(l) + '</div>';
    view.innerHTML = h;
  }
  window.eaMark = function (id) { completeLesson(lessonById[id]); render(); };

  function nextBtn(l) {
    var flat = []; CUR.modules.forEach(function (m) { m.lessons.forEach(function (x) { flat.push(x); }); });
    var idx = flat.findIndex(function (x) { return x.id === l.id; });
    if (idx >= 0 && idx < flat.length - 1) return ' <button class="btn ghost" onclick="eaGo(\'lesson\',\'' + flat[idx + 1].id + '\')">Next lesson <i class="ti ti-arrow-right" style="vertical-align:-2px"></i></button>';
    return "";
  }

  function renderQuizSet(l, quizzes) {
    var box = document.getElementById("lextra");
    box.innerHTML = '<h2>Knowledge check</h2>' + quizzes.map(function (q) {
      var ans = state.quiz[q.id];
      return '<div class="card" style="margin-bottom:12px" data-q="' + q.id + '"><div style="font-weight:500;margin-bottom:10px">' + esc(q.q) + '</div>' +
        '<div class="qopts">' + q.options.map(function (o, j) {
          return '<button class="opt" onclick="eaAns(\'' + q.id + '\',' + j + ',this)">' + esc(o) + '</button>';
        }).join("") + '</div><div class="qfb fb" style="display:none"></div></div>';
    }).join("") + '<div id="qdone" style="margin-top:6px"></div>';
    maybeQuizDone(l);
  }
  window.eaAns = function (qid, j, btn) {
    var q = qById[qid], card = btn.closest("[data-q]");
    card.querySelectorAll(".opt").forEach(function (b) { b.disabled = true; });
    var fb = card.querySelector(".qfb"); fb.style.display = "block";
    if (j === q.answer) {
      btn.classList.add("right");
      var first = !state.quiz[qid]; state.quiz[qid] = true; save();
      fb.className = "qfb fb good"; fb.innerHTML = "<b>Correct! +" + (first ? q.xp : 0) + " XP.</b> " + esc(q.explain);
      if (first) { toast("+" + q.xp + " XP"); checkBadges(); header(); }
    } else {
      btn.classList.add("wrong");
      card.querySelectorAll(".opt")[q.answer].classList.add("right");
      fb.className = "qfb fb bad"; fb.innerHTML = "<b>Not quite.</b> " + esc(q.explain);
      state.quiz[qid] = state.quiz[qid] || false; save();
    }
    var l = lessonById[route.param]; if (l) maybeQuizDone(l);
  };
  function maybeQuizDone(l) {
    if (!l.quizzes) return;
    var allAns = l.quizzes.every(function (q) { return document.querySelector('[data-q="' + q + '"] .opt[disabled]'); });
    if (allAns && !state.completed[l.id]) { completeLesson(l); header(); }
    if (l.quizzes.every(function (q) { return q in state.quiz; })) {
      var d = document.getElementById("qdone"); if (d) d.innerHTML = '<span class="badge b-good"><i class="ti ti-check" style="vertical-align:-2px"></i> Lesson complete</span> ' + nextBtn(l);
    }
  }

  // ---------- roleplay ----------
  function renderRoleplay(l) {
    var ids = l.roleplay || [];
    var box = document.getElementById("lextra");
    box.innerHTML = '<div class="card"><div style="display:flex;justify-content:space-between;color:var(--txt2);font-size:12px;margin-bottom:12px"><span id="rpstep"></span><span id="rpscore"></span></div>' +
      '<div class="lead"><div class="ic" style="background:var(--panel2)"><i class="ti ti-user"></i></div><div class="bubble" id="rpline"></div></div>' +
      '<div id="rpopts"></div><div id="rpfb" class="fb" style="display:none"></div></div>';
    var st = { l: l, ids: ids, i: 0, score: 0 };
    window._rp = st; drawRP();
  }
  function drawRP() {
    var st = window._rp, s = rpById[st.ids[st.i]];
    document.getElementById("rpstep").textContent = "Objection " + (st.i + 1) + " of " + st.ids.length + (s.category ? " · " + s.category : "");
    document.getElementById("rpscore").textContent = "Score: " + st.score + " XP";
    document.getElementById("rpline").innerHTML = "Client: <em>" + esc(s.client) + "</em>";
    document.getElementById("rpfb").style.display = "none";
    document.getElementById("rpopts").innerHTML = s.options.map(function (o, j) { return '<button class="opt" onclick="eaRP(' + j + ')">' + esc(o.text) + '</button>'; }).join("");
  }
  window.eaRP = function (j) {
    var st = window._rp, s = rpById[st.ids[st.i]], o = s.options[j];
    document.querySelectorAll("#rpopts .opt").forEach(function (b) { b.disabled = true; });
    var fb = document.getElementById("rpfb"); fb.style.display = "block";
    if (o.score >= 100) {
      st.score += o.score;
      if (!state.rp[s.id]) { state.rp[s.id] = true; save(); header(); }
      fb.className = "fb good"; fb.innerHTML = "<b>+" + o.score + " XP.</b> " + esc(o.feedback);
      document.getElementById("rpscore").textContent = "Score: " + st.score + " XP";
      setTimeout(function () {
        st.i++;
        if (st.i < st.ids.length) drawRP();
        else { completeLesson(st.l); checkBadges(); document.getElementById("rpopts").innerHTML = ""; fb.innerHTML = "<b>Set complete · " + st.score + " XP.</b> " + nextBtn(st.l); }
      }, 1200);
    } else {
      fb.className = "fb bad"; fb.innerHTML = "<b>+0 XP.</b> " + esc(o.feedback) + " Try again.";
      setTimeout(function () { document.querySelectorAll("#rpopts .opt").forEach(function (b) { b.disabled = false; }); fb.style.display = "none"; }, 1500);
    }
  };

  function arena() {
    view.innerHTML = '<h1>Roleplay arena</h1><p class="sub">Real objections from your ETERNA playbook + setter script. Scored on agree → acknowledge → ask.</p>' +
      '<div class="grid" style="grid-template-columns:1fr 1fr">' +
      groupBy(RP, "category").map(function (g) {
        var doneN = g.items.filter(function (s) { return state.rp[s.id]; }).length;
        return '<div class="card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><i class="ti ti-microphone-2" style="color:var(--info)"></i> <b style="font-weight:600">' + esc(g.key) + '</b></div>' +
          '<p class="sub" style="margin:0 0 10px">' + doneN + ' / ' + g.items.length + ' mastered</p>' +
          '<button class="btn" onclick="eaArenaStart(\'' + esc(g.key) + '\')">Practice</button></div>';
      }).join("") + '</div>';
  }
  window.eaArenaStart = function (cat) {
    var ids = RP.filter(function (s) { return s.category === cat; }).map(function (s) { return s.id; });
    var l = { id: "arena_" + cat, title: cat, type: "roleplay", roleplay: ids, xp: 0 };
    lessonById[l.id] = l; lessonModule[l.id] = { title: "Roleplay arena" };
    view.innerHTML = '<button class="back" onclick="eaGo(\'arena\')"><i class="ti ti-arrow-left"></i> Roleplay arena</button><h1>' + esc(cat) + '</h1><p class="sub"><span class="typetag">roleplay</span></p><div id="lextra"></div>';
    renderRoleplay(l);
  };

  function quizbank() {
    var topics = groupBy(QZ, "topic");
    view.innerHTML = '<h1>Quiz bank</h1><p class="sub">Generated from your underwriting guide, grid sheets, and product material. ' +
      Object.keys(state.quiz).filter(function (q) { return state.quiz[q]; }).length + ' / ' + QZ.length + ' correct.</p>' +
      topics.map(function (g) {
        return '<h2>' + esc(g.key) + '</h2>' + g.items.map(function (q) {
          var ans = state.quiz[q.id];
          return '<div class="card" style="margin-bottom:12px" data-q="' + q.id + '"><div style="font-weight:500;margin-bottom:10px">' + esc(q.q) + (ans ? ' <i class="ti ti-circle-check" style="color:var(--lime);vertical-align:-2px"></i>' : '') + '</div>' +
            '<div class="qopts">' + q.options.map(function (o, j) { return '<button class="opt' + (ans && j === q.answer ? ' right' : '') + '" ' + (ans ? 'disabled' : '') + ' onclick="eaAns(\'' + q.id + '\',' + j + ',this)">' + esc(o) + '</button>'; }).join("") +
            '</div><div class="qfb fb" ' + (ans ? '' : 'style="display:none"') + '>' + (ans ? "<b>Correct!</b> " + esc(q.explain) : "") + '</div></div>';
        }).join("");
      }).join("");
  }

  function leaderboard() {
    var li = levelInfo();
    var peers = [["Aaliyah R.", 6, 4120], ["Diego M.", 5, 3980], ["Priya S.", 5, 3470], ["Jordan K.", 4, 2310], ["Sam T.", 3, 1890], ["Mia L.", 3, 1540]];
    peers.push([state.name + " (you)", li.idx + 1, li.xp, true]);
    peers.sort(function (a, b) { return b[2] - a[2]; });
    view.innerHTML = '<h1>Team leaderboard</h1><p class="sub">This week · XP earned in training. Ties into your contest culture.</p>' +
      peers.map(function (r, i) {
        var me = r[3];
        return '<div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 14px;margin-bottom:7px;' + (me ? 'border-color:var(--lime)' : '') + '">' +
          '<span style="width:20px;font-weight:600;color:' + (me ? 'var(--lime)' : 'var(--txt2)') + '">' + (i + 1) + '</span>' +
          '<div class="av" style="width:30px;height:30px">' + r[0].replace(" (you)", "").split(" ").map(function (x) { return x[0]; }).join("") + '</div>' +
          '<span style="flex:1;' + (me ? 'color:var(--lime-t);font-weight:600' : '') + '">' + esc(r[0]) + '</span>' +
          '<span style="font-size:12px;color:var(--txt2)">Lv ' + r[1] + '</span>' +
          '<span style="font-weight:600;min-width:54px;text-align:right">' + r[2].toLocaleString() + '</span></div>';
      }).join("");
  }

  function badges() {
    view.innerHTML = '<h1>Badges & achievements</h1><p class="sub">' + Object.keys(state.badges).length + ' of ' + BADGES.length + ' earned. Win them through modules, streaks, and roleplay.</p>' +
      '<div class="grid" style="grid-template-columns:repeat(4,1fr)">' + BADGES.map(function (b) {
        var on = state.badges[b.id];
        return '<div class="card" style="text-align:center;' + (on ? '' : 'opacity:.45') + '"><div class="ic" style="margin:0 auto 8px;width:46px;height:46px;font-size:24px;background:rgba(91,155,224,.14);color:' + (on ? 'var(--info)' : 'var(--txt2)') + '"><i class="ti ' + b.i + '"></i></div><div style="font-weight:600;font-size:13.5px">' + esc(b.t) + '</div><div style="font-size:11px;color:var(--txt2)">' + (on ? 'Earned' : 'Locked') + '</div></div>';
      }).join("") + '</div>';
  }

  function groupBy(arr, key) {
    var map = {}, order = [];
    arr.forEach(function (x) { var k = x[key]; if (!map[k]) { map[k] = []; order.push(k); } map[k].push(x); });
    return order.map(function (k) { return { key: k, items: map[k] }; });
  }

  checkBadges();
  render();
})();
