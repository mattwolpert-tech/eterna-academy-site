// Client-side gate: decrypts the bundled content in-browser after the password.
// Matches openssl `enc -aes-256-cbc -pbkdf2 -iter 100000 -md sha256 -salt`.
(function () {
  "use strict";
  function b64ToBytes(b64) {
    var bin = atob(b64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  async function decrypt(b64, password) {
    var raw = b64ToBytes(b64);
    // OpenSSL salted format: "Salted__"(8) + salt(8) + ciphertext
    if (String.fromCharCode.apply(null, raw.slice(0, 8)) !== "Salted__") throw new Error("bad format");
    var salt = raw.slice(8, 16);
    var ct = raw.slice(16);
    var pwKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" }, pwKey, 384);
    var dk = new Uint8Array(bits);
    var key = await crypto.subtle.importKey("raw", dk.slice(0, 32), { name: "AES-CBC" }, false, ["decrypt"]);
    var iv = dk.slice(32, 48);
    var ptBuf = await crypto.subtle.decrypt({ name: "AES-CBC", iv: iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(ptBuf));
  }

  var form = document.getElementById("gateForm");
  var pw = document.getElementById("gatePw");
  var err = document.getElementById("gateErr");
  var btn = document.getElementById("gateBtn");

  // Auto-unlock if the session already held the password
  var saved = sessionStorage.getItem("ea_pw");
  if (saved) tryUnlock(saved, true);

  form.addEventListener("submit", function (e) { e.preventDefault(); tryUnlock(pw.value, false); });

  async function tryUnlock(password, silent) {
    btn.textContent = "Unlocking…"; btn.disabled = true; err.style.display = "none";
    try {
      var data = await decrypt(window.EA_ENC, password);
      window.EA_DATA = data;
      sessionStorage.setItem("ea_pw", password);
      document.getElementById("gate").remove();
      document.getElementById("app").style.display = "flex";
      var s = document.createElement("script"); s.src = "js/app.js"; document.body.appendChild(s);
    } catch (ex) {
      sessionStorage.removeItem("ea_pw");
      btn.textContent = "Unlock"; btn.disabled = false;
      if (!silent) { err.style.display = "block"; pw.value = ""; pw.focus(); }
    }
  }
})();
