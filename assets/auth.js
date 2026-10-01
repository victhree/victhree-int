/* VicThree SSB Interview Trainer — course login wall.
   ------------------------------------------------------------------
   This site is for VicThree Defence course students only. There is no
   free tier and no guest access.

   - A signed bearer token from the course portal is stored as
     `vt_portal_token`. The same token works across all VicThree sites.
   - Because each site is a separate origin, localStorage is NOT shared.
     The portal dashboard hands the token over via `#vt=<token>` in the
     URL; we also let a student sign in here directly with their course
     email and a 6-digit code.
   - Only tier "course" is allowed. A free-SSB token (tier "free", or a
     `vt_ssb_free` key) is ignored.
   - The client wall is only the front door: the interview Worker also
     validates the token server-to-server, so the gate cannot be bypassed
     by editing the page.

   Loaded in <head>, before any page/content script, so the gate is up
   before anything is revealed and the bearer token is attached to every
   interview-Worker call.
   ------------------------------------------------------------------ */
(function () {
  "use strict";
  var CFG = window.VICTHREE_CONFIG || {};
  var PORTAL = (CFG.portalEndpoint || "").replace(/\/$/, "");
  var COURSE_URL = CFG.courseUrl || "https://victhreedefence.com";
  var AI = CFG.aiEndpoint || "";
  var KEY = "vt_portal_token";
  var _fetch = window.fetch.bind(window);

  function getTok() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setTok(t) { try { localStorage.setItem(KEY, t); } catch (e) {} }
  function clrTok() { try { localStorage.removeItem(KEY); } catch (e) {} }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---- 1) token handoff from the portal dashboard: #vt=<token> ---- */
  try {
    var m = (location.hash || "").match(/[#&]vt=([^&]+)/);
    if (m) { setTok(decodeURIComponent(m[1])); history.replaceState(null, "", location.pathname + location.search); }
  } catch (e) {}

  /* ---- 2) attach the bearer token to every call to the interview Worker ---- */
  window.fetch = function (url, opts) {
    try {
      var u = (typeof url === "string") ? url : (url && url.url) || "";
      if (AI && u.indexOf(AI) === 0) {
        opts = opts || {};
        var h = new Headers(opts.headers || {});
        var t = getTok();
        if (t) h.set("Authorization", "Bearer " + t);
        opts.headers = h;
      }
    } catch (e) {}
    return _fetch(url, opts);
  };

  /* ---- 3) gate styling + overlay (hide content until authorised) ---- */
  function findSelf() { var s = document.getElementsByTagName("script"); for (var i = 0; i < s.length; i++) { if (s[i].src && s[i].src.indexOf("assets/auth.js") >= 0) return s[i].src; } return ""; }
  var scriptURL = (document.currentScript && document.currentScript.src) || findSelf();
  var BANNER = scriptURL ? scriptURL.replace(/auth\.js(\?.*)?$/, "banner.png") : "";

  var css = [
    "html.vt-gating{overflow:hidden}",
    "html.vt-gating body > *:not(#vt-gate){visibility:hidden !important}",
    "#vt-gate{position:fixed;inset:0;z-index:2147483646;background:var(--paper,#fbfaf6);color:var(--ink,#1c2331);font-family:var(--serif,Georgia,serif);display:flex;flex-direction:column;overflow:auto}",
    "#vt-gate .vtg-bar{background:var(--navy,#0f2340);border-bottom:3px solid var(--gold,#b8912f);text-align:center;padding:6px 0 0}",
    "#vt-gate .vtg-bar img{display:block;width:100%;max-width:860px;height:auto;margin:0 auto}",
    "#vt-gate .vtg-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:24px 16px}",
    "#vt-gate .vtg-card{background:#fff;border:1px solid var(--line,#e2ddcd);border-radius:14px;max-width:460px;width:100%;padding:28px 26px;box-shadow:0 10px 30px rgba(15,35,64,.10)}",
    "#vt-gate .vtg-eyebrow{font-family:var(--sans,Inter,Arial,sans-serif);text-transform:uppercase;letter-spacing:.16em;font-size:.7rem;font-weight:800;color:var(--gold,#b8912f);margin:0 0 .4em}",
    "#vt-gate h1{font-family:var(--serif,Georgia,serif);color:var(--navy,#0f2340);font-size:1.6rem;margin:0 0 .3em;line-height:1.2}",
    "#vt-gate p.vtg-lede{color:var(--ink-soft,#4a5265);font-size:1rem;margin:0 0 1.2em;line-height:1.55}",
    "#vt-gate label{display:block;font-family:var(--sans,Inter,Arial,sans-serif);font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft,#4a5265);margin:0 0 6px}",
    "#vt-gate input{width:100%;box-sizing:border-box;font-family:var(--sans,Inter,Arial,sans-serif);font-size:1.05rem;padding:13px 15px;border:1px solid var(--line-2,#d3cdb8);border-radius:10px;background:#fff;color:var(--ink,#1c2331);margin:0 0 14px}",
    "#vt-gate input:focus{outline:none;border-color:var(--gold,#b8912f)}",
    "#vt-gate .vtg-btn{width:100%;font-family:var(--sans,Inter,Arial,sans-serif);font-weight:700;border:1px solid transparent;border-radius:10px;padding:14px 18px;font-size:1rem;cursor:pointer;background:var(--gold,#b8912f);color:var(--navy,#0f2340)}",
    "#vt-gate .vtg-btn:hover{background:#cfa53c}",
    "#vt-gate .vtg-btn[disabled]{opacity:.6;cursor:default}",
    "#vt-gate .vtg-msg{font-family:var(--sans,Inter,Arial,sans-serif);font-size:.9rem;margin:10px 0 0;min-height:1.2em}",
    "#vt-gate .vtg-msg.err{color:var(--danger,#a23b2e)}",
    "#vt-gate .vtg-foot{font-family:var(--sans,Inter,Arial,sans-serif);font-size:.85rem;margin:18px 0 0;color:var(--ink-soft,#4a5265)}",
    "#vt-gate .vtg-foot a{color:var(--navy,#0f2340);font-weight:700}",
    "#vt-gate .vtg-link{background:none;border:none;color:var(--navy,#0f2340);text-decoration:underline;text-underline-offset:3px;font-family:var(--sans,Inter,Arial,sans-serif);font-size:.85rem;cursor:pointer;padding:0;margin-top:12px;display:inline-block}",
    "#vt-gate .vtg-spin{width:22px;height:22px;border:3px solid var(--line-2,#d3cdb8);border-top-color:var(--navy,#0f2340);border-radius:50%;animation:vtgspin .8s linear infinite;margin:6px auto}",
    "@keyframes vtgspin{to{transform:rotate(360deg)}}",
    "#vt-signed{position:fixed;right:12px;bottom:12px;z-index:2147483645;background:var(--navy,#0f2340);color:#fff;font-family:var(--sans,Inter,Arial,sans-serif);font-size:.76rem;padding:7px 12px;border-radius:999px;box-shadow:0 6px 18px rgba(15,35,64,.25)}",
    "#vt-signed b{color:var(--gold-soft,#e9dcb8);font-weight:700}",
    "#vt-signed button{background:none;border:none;color:#fff;text-decoration:underline;cursor:pointer;font:inherit;margin-left:8px;opacity:.85}",
    "#vt-signed button:hover{opacity:1}"
  ].join("\n");
  var st = document.createElement("style"); st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
  document.documentElement.classList.add("vt-gating");

  var gateEl = null, emailVal = "";

  function overlay() {
    if (gateEl) return gateEl;
    gateEl = document.createElement("div"); gateEl.id = "vt-gate";
    gateEl.innerHTML =
      '<div class="vtg-bar">' + (BANNER ? '<img src="' + BANNER + '" alt="VicThree Defence" />' : "") + "</div>" +
      '<div class="vtg-wrap"><div class="vtg-card" id="vtg-card">' +
      '<div class="vtg-spin"></div><p class="vtg-msg" style="text-align:center">Checking access...</p>' +
      "</div></div>";
    document.body.appendChild(gateEl);
    return gateEl;
  }
  function card() { return document.getElementById("vtg-card"); }

  function reveal(me) {
    document.documentElement.classList.remove("vt-gating");
    if (gateEl && gateEl.parentNode) { gateEl.parentNode.removeChild(gateEl); gateEl = null; }
    var old = document.getElementById("vt-signed"); if (old) old.parentNode.removeChild(old);
    var n = document.createElement("div"); n.id = "vt-signed";
    n.innerHTML = 'Signed in as <b></b><button type="button">Sign out</button>';
    n.querySelector("b").textContent = (me && me.name) ? me.name : "cadet";
    n.querySelector("button").onclick = function () { clrTok(); location.reload(); };
    document.body.appendChild(n);
  }

  function wallEmail() {
    var c = card(); if (!c) return;
    c.innerHTML =
      '<p class="vtg-eyebrow">VicThree Defence course</p>' +
      "<h1>For VicThree Defence course cadets</h1>" +
      '<p class="vtg-lede">This interview trainer is part of the VicThree Defence course. Sign in with your course email to begin.</p>' +
      '<label for="vtg-email">Course email</label>' +
      '<input id="vtg-email" type="email" autocomplete="email" placeholder="you@example.com" />' +
      '<button class="vtg-btn" id="vtg-send">Send me a code</button>' +
      '<p class="vtg-msg" id="vtg-msg"></p>' +
      '<p class="vtg-foot">Not enrolled yet? <a href="' + COURSE_URL + '">See the course &rarr;</a></p>';
    var em = c.querySelector("#vtg-email"); if (emailVal) em.value = emailVal; em.focus();
    c.querySelector("#vtg-send").onclick = sendCode;
    em.addEventListener("keydown", function (e) { if (e.key === "Enter") sendCode(); });
  }

  function sendCode() {
    var c = card(), em = c.querySelector("#vtg-email"), msg = c.querySelector("#vtg-msg"), btn = c.querySelector("#vtg-send");
    var email = (em.value || "").trim();
    if (!email || email.indexOf("@") < 0) { msg.className = "vtg-msg err"; msg.textContent = "Please enter a valid email."; em.focus(); return; }
    emailVal = email; btn.disabled = true; msg.className = "vtg-msg"; msg.textContent = "Sending...";
    _fetch(PORTAL + "/api/request-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function () { wallCode(); })            // ok:true always (anti-enumeration) — just move on
      .catch(function () { btn.disabled = false; msg.className = "vtg-msg err"; msg.textContent = "Could not reach the sign-in service. Please try again."; });
  }

  function wallCode(msg, msgCls) {
    var c = card(); if (!c) return;
    c.innerHTML =
      '<p class="vtg-eyebrow">VicThree Defence course</p>' +
      "<h1>Enter your code</h1>" +
      '<p class="vtg-lede">We sent a 6-digit code to <b>' + escapeHtml(emailVal) + "</b>. Enter it below to sign in.</p>" +
      '<label for="vtg-code">6-digit code</label>' +
      '<input id="vtg-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="------" />' +
      '<button class="vtg-btn" id="vtg-verify">Sign in</button>' +
      '<p class="vtg-msg ' + (msgCls || "") + '" id="vtg-msg">' + (msg || "") + "</p>" +
      '<button class="vtg-link" id="vtg-back">Use a different email</button>';
    var cc = c.querySelector("#vtg-code"); cc.focus();
    c.querySelector("#vtg-verify").onclick = verify;
    cc.addEventListener("keydown", function (e) { if (e.key === "Enter") verify(); });
    c.querySelector("#vtg-back").onclick = function () { wallEmail(); };
  }

  function wallBlocked(message) {
    var c = card(); if (!c) return;
    c.innerHTML =
      '<p class="vtg-eyebrow">VicThree Defence course</p>' +
      "<h1>Course access needed</h1>" +
      '<p class="vtg-lede">' + escapeHtml(message) + "</p>" +
      '<p class="vtg-foot"><a href="' + COURSE_URL + '">See the course &rarr;</a></p>' +
      '<button class="vtg-link" id="vtg-back">Use a different email</button>';
    c.querySelector("#vtg-back").onclick = function () { wallEmail(); };
  }

  function verify() {
    var c = card(), cc = c.querySelector("#vtg-code"), msg = c.querySelector("#vtg-msg"), btn = c.querySelector("#vtg-verify");
    var code = (cc.value || "").trim();
    if (!/^\d{6}$/.test(code)) { msg.className = "vtg-msg err"; msg.textContent = "Enter the 6-digit code."; cc.focus(); return; }
    btn.disabled = true; msg.className = "vtg-msg"; msg.textContent = "Signing in...";
    _fetch(PORTAL + "/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: emailVal, code: code }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, d: d }; }); })
      .then(function (res) {
        if (res.status === 200 && res.d && res.d.token) {
          setTok(res.d.token);
          return checkMe().then(function (me) {
            if (me.ok && me.tier === "course") { reveal(me); }
            else { clrTok(); wallBlocked("This email is not on a course plan yet."); }
          });
        }
        if (res.status === 403) { wallBlocked("This email is not on a course plan yet."); return; }
        msg.className = "vtg-msg err"; msg.textContent = "That code is not right or has expired. Request a new one."; btn.disabled = false;
      })
      .catch(function () { msg.className = "vtg-msg err"; msg.textContent = "Could not reach the sign-in service. Please try again."; btn.disabled = false; });
  }

  function checkMe() {
    var t = getTok(); if (!t) return Promise.resolve({ ok: false });
    return _fetch(PORTAL + "/api/me", { headers: { "Authorization": "Bearer " + t } })
      .then(function (r) { if (r.status !== 200) return { ok: false, status: r.status }; return r.json().then(function (d) { return { ok: true, tier: d.tier, name: d.name, email: d.email }; }); })
      .catch(function () { return { ok: false, status: 0 }; });
  }

  function gate() {
    overlay();
    if (!getTok()) { wallEmail(); return; }
    checkMe().then(function (me) {
      if (me.ok && me.tier === "course") { reveal(me); return; }
      if (me.status === 0) { // network error — keep the token, let them retry
        var c = card();
        if (c) {
          c.innerHTML = '<div class="vtg-spin"></div><p class="vtg-msg" style="text-align:center">Could not verify access right now. <button class="vtg-link" id="vtg-retry">Retry</button></p>';
          c.querySelector("#vtg-retry").onclick = function () { gate(); };
        }
        return;
      }
      clrTok(); wallEmail(); // not a course token, or 401/403 → sign in again
    });
  }

  function ready(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }
  ready(gate);

  window.V3Auth = { token: getTok, signOut: function () { clrTok(); location.reload(); } };
})();
