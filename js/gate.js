// Account gate: register (email, password, profile) or log in. Authenticated users get the content key.
(function () {
  "use strict";
  var API = "https://eterna-academy-progress.matt-wolpert.workers.dev";
  window.EA_API = API;
  var gate = document.getElementById("gate");
  var picData = "";

  var st = document.createElement("style");
  st.textContent = "#gate .box{width:360px;max-height:92vh;overflow:auto}#gate input{margin-bottom:10px}#gate .alt{color:rgba(255,255,255,.7);font-size:13px;margin-top:14px}#gate .alt a{color:#f5c842;text-decoration:none}#gate .filelbl{display:block;color:rgba(255,255,255,.7);font-size:12px;text-align:left;margin:2px 0 10px}#gate .gerr{color:#ffb4ab;font-size:13px;margin-bottom:10px;display:none}#gate .pic{width:56px;height:56px;border-radius:50%;object-fit:cover;margin:0 auto 8px;display:block;border:2px solid #f5c842}";
  document.head.appendChild(st);

  function head() { return '<img src="assets/eterna-logo-white.png" alt="Eterna"><div class="acad">ACADEMY</div>'; }
  function launch(profile, contentKey) {
    localStorage.setItem("ea_profile", JSON.stringify(profile));
    sessionStorage.setItem("ea_pw", contentKey);
    fetch(API + "/content?pw=" + encodeURIComponent(contentKey)).then(function (r) { return r.json(); }).then(function (data) {
      window.EA_DATA = data; window.EA_PW = contentKey;
      gate.remove();
      document.getElementById("app").style.display = "flex";
      var s = document.createElement("script"); s.src = "js/app.js"; document.body.appendChild(s);
    }).catch(function () { showLogin("Could not load content. Try again."); });
  }
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
  function err(msg) { var e = document.getElementById("gerr"); if (e && msg) { e.style.display = "block"; e.textContent = msg; } }

  function showLogin(msg) {
    gate.innerHTML = '<form class="box" id="loginForm">' + head() +
      '<p>Sign in to your training account</p>' +
      '<div class="gerr" id="gerr"></div>' +
      '<input id="lg_email" type="email" placeholder="Email" autocomplete="username" autofocus>' +
      '<input id="lg_pw" type="password" placeholder="Password" autocomplete="current-password">' +
      '<button type="submit">Sign in</button>' +
      '<div class="alt">New agent? <a href="#" id="toReg">Create your profile</a></div></form>';
    if (msg) err(msg);
    document.getElementById("loginForm").addEventListener("submit", function (e) { e.preventDefault(); doLogin(); });
    document.getElementById("toReg").addEventListener("click", function (e) { e.preventDefault(); showRegister(); });
  }

  function showRegister(msg) {
    gate.innerHTML = '<form class="box" id="regForm">' + head() +
      '<p>Create your profile</p>' +
      '<div class="gerr" id="gerr"></div>' +
      '<div id="picprev"></div>' +
      '<input id="rg_name" placeholder="Full name" autofocus>' +
      '<input id="rg_email" type="email" placeholder="Email">' +
      '<input id="rg_number" placeholder="Phone number">' +
      '<input id="rg_pw" type="password" placeholder="Create a password">' +
      '<input id="rg_program" placeholder="Program (e.g. Spark Inbound)">' +
      '<input id="rg_upline" placeholder="Upline / who recruited you">' +
      '<label class="filelbl">Profile picture (optional)<input id="rg_pic" type="file" accept="image/*"></label>' +
      '<button type="submit">Create account</button>' +
      '<div class="alt">Already registered? <a href="#" id="toLogin">Sign in</a></div></form>';
    if (msg) err(msg);
    document.getElementById("regForm").addEventListener("submit", function (e) { e.preventDefault(); doRegister(); });
    document.getElementById("toLogin").addEventListener("click", function (e) { e.preventDefault(); showLogin(); });
    document.getElementById("rg_pic").addEventListener("change", function (ev) {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () { picData = rd.result; document.getElementById("picprev").innerHTML = '<img class="pic" src="' + picData + '">'; }; rd.readAsDataURL(f);
    });
  }

  function doLogin() {
    var email = val("lg_email").toLowerCase(), pw = document.getElementById("lg_pw").value;
    if (!email || !pw) return err("Enter your email and password.");
    fetch(API + "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email, password: pw }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) { if (x.ok && x.d.ok) launch(x.d.profile, x.d.contentKey); else err(x.d.error || "Sign-in failed."); })
      .catch(function () { err("Network error. Try again."); });
  }
  function doRegister() {
    var body = { name: val("rg_name"), email: val("rg_email").toLowerCase(), number: val("rg_number"), password: document.getElementById("rg_pw").value, program: val("rg_program"), upline: val("rg_upline"), picture: picData };
    if (!body.name || !body.email || !body.password) return err("Name, email, and password are required.");
    fetch(API + "/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (x) { if (x.ok && x.d.ok) launch(x.d.profile, x.d.contentKey); else err(x.d.error || "Could not create account."); })
      .catch(function () { err("Network error. Try again."); });
  }

  // auto-resume if a session is already active
  var savedPw = sessionStorage.getItem("ea_pw");
  var savedProfile = localStorage.getItem("ea_profile");
  if (savedPw && savedProfile) { try { launch(JSON.parse(savedProfile), savedPw); } catch (e) { showLogin(); } }
  else showLogin();
})();
