// Gate: authenticate the password against the content backend (dynamic content + CMS edits).
// Falls back to the encrypted static bundle if the backend is unreachable.
(function () {
  "use strict";
  var API = "https://eterna-academy-progress.matt-wolpert.workers.dev";
  window.EA_API = API;

  function b64ToBytes(b64) { var bin = atob(b64.trim()), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  async function decryptStatic(b64, password) {
    var raw = b64ToBytes(b64);
    if (String.fromCharCode.apply(null, raw.slice(0, 8)) !== "Salted__") throw new Error("bad format");
    var salt = raw.slice(8, 16), ct = raw.slice(16);
    var pk = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" }, pk, 384);
    var dk = new Uint8Array(bits);
    var key = await crypto.subtle.importKey("raw", dk.slice(0, 32), { name: "AES-CBC" }, false, ["decrypt"]);
    var pt = await crypto.subtle.decrypt({ name: "AES-CBC", iv: dk.slice(32, 48) }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  var form = document.getElementById("gateForm");
  var pw = document.getElementById("gatePw");
  var err = document.getElementById("gateErr");
  var btn = document.getElementById("gateBtn");

  var saved = sessionStorage.getItem("ea_pw");
  if (saved) tryUnlock(saved, true);
  form.addEventListener("submit", function (e) { e.preventDefault(); tryUnlock(pw.value, false); });

  function launch(data, password) {
    window.EA_DATA = data;
    window.EA_PW = password;
    sessionStorage.setItem("ea_pw", password);
    document.getElementById("gate").remove();
    document.getElementById("app").style.display = "flex";
    var s = document.createElement("script"); s.src = "js/app.js"; document.body.appendChild(s);
  }
  function fail(silent) {
    sessionStorage.removeItem("ea_pw");
    btn.textContent = "Unlock"; btn.disabled = false;
    if (!silent) { err.style.display = "block"; pw.value = ""; pw.focus(); }
  }

  async function tryUnlock(password, silent) {
    btn.textContent = "Unlocking…"; btn.disabled = true; err.style.display = "none";
    // 1) backend (dynamic, reflects manager edits)
    try {
      var res = await fetch(API + "/content?pw=" + encodeURIComponent(password));
      if (res.ok) { return launch(await res.json(), password); }
      if (res.status === 401) { return fail(silent); }
      throw new Error("backend " + res.status);
    } catch (e) {
      // 2) fallback: encrypted static bundle
      try {
        if (!window.EA_ENC) throw e;
        var data = await decryptStatic(window.EA_ENC, password);
        return launch(data, password);
      } catch (e2) { return fail(silent); }
    }
  }
})();
