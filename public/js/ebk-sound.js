/* EBK · sound effects. Synthesized with WebAudio (no audio files, no
   licensing, instant load). Exposes window.EBKS:
     EBKS.play("click|correct|wrong|timeout|fill|best|over")
     EBKS.jingle("nfl|nba|mlb|nhl|cfb|soccer")   — short league-flavored sting
     EBKS.on / EBKS.toggle()
   A floating 🔊/🔇 toggle is injected on every page; preference persists in
   localStorage. The AudioContext resumes on the first user gesture (browser
   autoplay rules). */
(function () {
  "use strict";
  if (window.EBKS) return;

  var KEY = "ebk_sound";
  var on = true;
  try { on = localStorage.getItem(KEY) !== "0"; } catch (e) {}

  var ctx = null;
  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  // wake the context on the first gesture so timed sounds (timeouts) can play
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
    document.addEventListener(ev, function once() {
      document.removeEventListener(ev, once);
      if (on) ac();
    }, { passive: true });
  });

  // one note: freq -> (optional) slide, with a quick attack/decay envelope
  function tone(opts) {
    var c = ac();
    if (!c || !on) return;
    var t0 = c.currentTime + (opts.at || 0);
    var dur = opts.dur || 0.15;
    var o = c.createOscillator(), g = c.createGain();
    o.type = opts.type || "sine";
    o.frequency.setValueAtTime(opts.f, t0);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
    var peak = (opts.gain || 0.16);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function seq(notes, type, step, dur, gain) {
    notes.forEach(function (f, i) {
      if (f) tone({ f: f, at: i * step, dur: dur || step * 1.2, type: type, gain: gain || 0.13 });
    });
  }

  var SFX = {
    click:   function () { tone({ f: 1500, dur: 0.04, type: "square", gain: 0.05 }); },
    fill:    function () { tone({ f: 520, slide: 880, dur: 0.12, type: "sine", gain: 0.14 }); },
    correct: function () { seq([660, 880], "sine", 0.09, 0.14, 0.16); },
    wrong:   function () { tone({ f: 220, slide: 110, dur: 0.32, type: "sawtooth", gain: 0.12 }); },
    timeout: function () { seq([180, 0, 150], "square", 0.12, 0.14, 0.1); },
    best:    function () { seq([523, 659, 784, 1046], "triangle", 0.09, 0.2, 0.15); },
    over:    function () { seq([392, 330, 262], "triangle", 0.16, 0.22, 0.13); },
  };

  // short league-flavored stings (distinct voice + motif per sport)
  var JINGLES = {
    nfl:    function () { seq([196, 262, 330, 392], "sawtooth", 0.13, 0.18, 0.07); },           // brassy march up
    cfb:    function () { seq([392, 392, 392, 523], "sawtooth", 0.11, 0.14, 0.07); },           // fight-song triplet
    nba:    function () { seq([330, 392, 440, 0, 392, 440], "square", 0.1, 0.12, 0.05); },      // funky riff
    mlb:    function () { seq([392, 523, 659, 784, 659, 784], "triangle", 0.11, 0.16, 0.12); }, // ballpark organ "charge"
    nhl:    function () { seq([262, 330, 392, 330, 523], "triangle", 0.12, 0.18, 0.12); },      // arena organ
    soccer: function () { seq([440, 440, 440, 392, 440, 523], "sine", 0.12, 0.16, 0.12); },     // terrace chant
  };

  window.EBKS = {
    get on() { return on; },
    play: function (name) { try { if (on && SFX[name]) SFX[name](); } catch (e) {} },
    jingle: function (sport) { try { if (on && JINGLES[sport]) JINGLES[sport](); } catch (e) {} },
    toggle: function () {
      on = !on;
      try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) {}
      paint();
      if (on) { ac(); SFX.click(); }
      return on;
    },
  };

  // floating mute toggle
  var btn = document.createElement("button");
  btn.id = "ebk-mute";
  btn.setAttribute("aria-label", "Toggle sound");
  function paint() { btn.textContent = on ? "🔊" : "🔇"; btn.classList.toggle("off", !on); }
  var css = document.createElement("style");
  css.textContent =
    "#ebk-mute{position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:80;" +
    "width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,0.18);" +
    "background:rgba(16,22,44,0.85);color:#f3f6ff;font-size:1.05rem;cursor:pointer;" +
    "box-shadow:0 6px 18px rgba(0,0,0,0.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}" +
    "#ebk-mute.off{opacity:0.55;}#ebk-mute:active{transform:scale(0.92);}";
  function mount() {
    (document.head || document.documentElement).appendChild(css);
    paint();
    document.body.appendChild(btn);
    btn.addEventListener("click", function () { EBKS.toggle(); });
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
