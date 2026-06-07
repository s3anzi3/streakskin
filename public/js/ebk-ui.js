/* EBK · auth widget + sign-in modal. Self-loads firebase + its CSS.
   Add <script src="/js/ebk-ui.js"></script> on any page with a .site-header. */
(function () {
  "use strict";
  if (window.__ebkui) return;
  window.__ebkui = true;

  if (!document.querySelector('link[href="/css/ebk-ui.css"]')) {
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/css/ebk-ui.css";
    document.head.appendChild(l);
  }
  if (!window.EBKF) {
    var s = document.createElement("script"); s.src = "/js/ebk-firebase.js";
    document.head.appendChild(s);
  }

  // ---- modal ----
  var modal = document.createElement("div");
  modal.className = "ebk-modal-back"; modal.hidden = true;
  modal.innerHTML =
    '<div class="ebk-modal">' +
    '<button class="ebk-x" data-act="close" aria-label="Close">&times;</button>' +
    '<h3>Welcome to EBK</h3><p class="sub">Save your scores and climb the leaderboards.</p>' +
    '<div class="ebk-tabs"><button class="ebk-tab active" data-tab="in">Sign in</button>' +
    '<button class="ebk-tab" data-tab="up">Sign up</button></div>' +
    '<input class="ebk-field" id="ebk-name" placeholder="Display name" hidden autocomplete="nickname" />' +
    '<input class="ebk-field" id="ebk-email" type="email" placeholder="Email" autocomplete="email" />' +
    '<input class="ebk-field" id="ebk-pw" type="password" placeholder="Password" autocomplete="current-password" />' +
    '<div class="ebk-err" id="ebk-err"></div>' +
    '<button class="ebk-btn" data-act="submit">Sign in</button>' +
    '</div>';
  document.body.appendChild(modal);

  var mode = "in";
  var nameF = modal.querySelector("#ebk-name"), emailF = modal.querySelector("#ebk-email"),
      pwF = modal.querySelector("#ebk-pw"), errEl = modal.querySelector("#ebk-err"),
      submitBtn = modal.querySelector('[data-act="submit"]');

  function openModal() { modal.hidden = false; errEl.textContent = ""; emailF.focus(); }
  function closeModal() { modal.hidden = true; }
  function setMode(m) {
    mode = m; errEl.textContent = "";
    modal.querySelectorAll(".ebk-tab").forEach(function (t) { t.classList.toggle("active", t.dataset.tab === m); });
    nameF.hidden = m !== "up";
    submitBtn.textContent = m === "up" ? "Create account" : "Sign in";
    pwF.autocomplete = m === "up" ? "new-password" : "current-password";
  }

  modal.addEventListener("click", function (e) {
    var act = e.target.dataset.act, tab = e.target.dataset.tab;
    if (e.target === modal || act === "close") return closeModal();
    if (tab) return setMode(tab);
    if (act === "submit") return doSubmit();
    if (act === "google") return doGoogle();
  });

  function doSubmit() {
    var email = emailF.value.trim(), pw = pwF.value, name = nameF.value.trim();
    if (!email || !pw) { errEl.textContent = "Email and password required."; return; }
    submitBtn.disabled = true; errEl.textContent = "…";
    var p = mode === "up" ? EBKF.signUp(email, pw, name || email.split("@")[0]) : EBKF.signIn(email, pw);
    p.then(closeModal).catch(function (e) { errEl.textContent = pretty(e); })
      .finally(function () { submitBtn.disabled = false; if (errEl.textContent === "…") errEl.textContent = ""; });
  }
  function doGoogle() {
    errEl.textContent = "…";
    EBKF.signInGoogle().then(closeModal).catch(function (e) { errEl.textContent = pretty(e); });
  }
  function pretty(e) {
    var c = (e && e.code) || "";
    if (c.indexOf("wrong-password") > -1 || c.indexOf("invalid-credential") > -1) return "Wrong email or password.";
    if (c.indexOf("email-already") > -1) return "That email already has an account — sign in.";
    if (c.indexOf("weak-password") > -1) return "Password should be at least 6 characters.";
    if (c.indexOf("invalid-email") > -1) return "Enter a valid email.";
    if (c.indexOf("operation-not-allowed") > -1) return "Auth isn't enabled yet (admin).";
    if (c.indexOf("popup") > -1) return "Popup blocked — allow popups and retry.";
    return (e && e.message) || "Something went wrong.";
  }
  window.EBKopenAuth = openModal;

  // ---- header nav + account ----
  function injectNav() {
    document.querySelectorAll(".site-header").forEach(function (h) {
      if (h.querySelector(".ebk-nav")) return;
      var nav = document.createElement("div");
      nav.className = "ebk-nav";
      nav.innerHTML =
        '<a href="/leaderboard">Leaderboard</a>' +
        '<a href="/dashboard">Dashboard</a>' +
        '<span class="ebk-acct"></span>';
      h.appendChild(nav);
    });
    renderAccount(window.EBKF && EBKF.user);
  }
  function renderAccount(user) {
    document.querySelectorAll(".ebk-acct").forEach(function (el) {
      if (user) {
        el.innerHTML = '<span class="ebk-user"><span class="nm">' +
          (user.displayName || "Player") + '</span><button class="ebk-out">Sign out</button></span>';
      } else {
        el.innerHTML = '<button class="ebk-signin">Sign in</button>';
      }
    });
  }
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("ebk-signin")) openModal();
    if (e.target.classList.contains("ebk-out")) EBKF.signOut();
  });

  function whenReady(cb) {
    if (window.EBKF && EBKF.onChange) cb();
    else setTimeout(function () { whenReady(cb); }, 40);
  }
  injectNav();
  whenReady(function () { EBKF.onChange(renderAccount); });
})();
