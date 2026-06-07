/* EBK · preloader + scroll behavior (loaded in <head> on every page). */
(function () {
  "use strict";

  // ---------- scroll behavior ----------
  // Lock page scroll when the content fits the viewport on desktop; allow
  // scrolling on mobile, on touch, or whenever content is taller than the
  // viewport (so nothing is ever unreachable).
  function applyScroll() {
    var el = document.documentElement;
    var mobile = window.matchMedia("(max-width: 820px)").matches ||
                 window.matchMedia("(pointer: coarse)").matches;
    var desired;
    if (mobile) {
      desired = "";
    } else {
      var content = Math.max(el.scrollHeight, document.body ? document.body.scrollHeight : 0);
      desired = content > window.innerHeight + 1 ? "auto" : "hidden";
    }
    if (el.style.overflowY !== desired) el.style.overflowY = desired;
  }
  function initScroll() {
    applyScroll();
    window.addEventListener("resize", applyScroll);
    window.addEventListener("load", applyScroll);
    if (window.ResizeObserver && document.body) {
      try { new ResizeObserver(applyScroll).observe(document.body); } catch (e) { setInterval(applyScroll, 1200); }
    } else {
      setInterval(applyScroll, 1200);
    }
  }
  if (document.body) initScroll();
  else document.addEventListener("DOMContentLoaded", initScroll);

  // ---------- branded preloader (once per session) ----------
  var seen = false;
  try { seen = !!sessionStorage.getItem("ebk_seen"); } catch (e) {}
  if (seen) return;

  var MIN = 500, MAX = 7000, start = Date.now();
  var css =
    '#ebk-load{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;gap:20px;' +
    'background:radial-gradient(120% 80% at 50% -20%,#121a32,#0a0e1c 60%);' +
    'opacity:1;transition:opacity .45s ease;}' +
    '#ebk-load.ebk-hide{opacity:0;pointer-events:none;}' +
    '#ebk-load .wm{font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;font-weight:900;' +
    'font-size:clamp(2.6rem,9vw,4.4rem);letter-spacing:-.03em;color:#f3f6ff;line-height:1;}' +
    '#ebk-load .wm b{color:#3ddc97;}' +
    '#ebk-load .ring{width:40px;height:40px;border-radius:50%;border:3px solid rgba(255,255,255,.15);' +
    'border-top-color:#3ddc97;animation:ebkspin .8s linear infinite;}' +
    '#ebk-load .sub{font-family:"Segoe UI",system-ui,sans-serif;color:#9aa6cc;font-size:.72rem;' +
    'letter-spacing:.28em;text-transform:uppercase;}' +
    '@keyframes ebkspin{to{transform:rotate(360deg);}}' +
    '@media (prefers-reduced-motion:reduce){#ebk-load .ring{animation:none;}}';

  var st = document.createElement("style");
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var o = document.createElement("div");
  o.id = "ebk-load";
  o.setAttribute("aria-hidden", "true");
  o.innerHTML = '<div class="wm">E<b>B</b>K</div><div class="ring"></div><div class="sub">Elite Ball Knowledge</div>';
  (document.body || document.documentElement).appendChild(o);

  function intoBody() { if (document.body && o.parentNode !== document.body) document.body.appendChild(o); }
  document.addEventListener("DOMContentLoaded", intoBody);

  var done = false;
  function hide() {
    if (done) return; done = true;
    intoBody();
    try { sessionStorage.setItem("ebk_seen", "1"); } catch (e) {}
    var wait = Math.max(0, MIN - (Date.now() - start));
    setTimeout(function () {
      o.classList.add("ebk-hide");
      setTimeout(function () { if (o.parentNode) o.parentNode.removeChild(o); }, 500);
    }, wait);
  }
  if (document.readyState === "complete") hide();
  else window.addEventListener("load", hide);
  setTimeout(hide, MAX);
})();
