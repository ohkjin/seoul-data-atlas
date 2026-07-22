// ── prototype3 wiring: boot the layer-set editor + cosmetic controls ────────
window.addEventListener("load", async function () {
  try { await bootPrototype(); } catch (e) { console.error(e); document.getElementById("cards").innerHTML = '<div style="color:#8c93a3;padding:16px">Boot error: ' + e.message + '</div>'; }

  // segmented controls: active state + view-mode pitch on the real map
  document.querySelectorAll(".p3seg").forEach(function (seg) {
    seg.querySelectorAll("button").forEach(function (b) {
      b.onclick = function () {
        seg.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        if (seg.id === "p3-mode" && window.Preview && Preview.map) {
          const v = b.dataset.v, pitch = v === "2d" ? 0 : v === "top" ? 85 : 45;
          try { Preview.map.easeTo({ pitch: pitch, duration: 600 }); } catch (e) {}
        }
        if (seg.id === "p3-theme") document.body.setAttribute("data-theme", b.dataset.v);
      };
    });
  });

  // top toolbar toggles
  document.querySelectorAll("#map-toolbar button[data-v]").forEach((b) => b.onclick = () => b.classList.toggle("on"));

  // left nav → Saved presets library popover
  const navSaved = document.getElementById("nav-saved");
  if (navSaved) navSaved.onclick = () => { if (window.PApp && PApp.toggleSavedNav) PApp.toggleSavedNav(); };

  // right-panel rail tabs → swap panel-host mode
  document.querySelectorAll(".rail-tab").forEach(function (t) {
    t.onclick = function () {
      document.querySelectorAll(".rail-tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      document.getElementById("panel-host").className = "panel-host mode-" + t.dataset.panelTab;
    };
  });

  // slider read-outs
  document.querySelectorAll(".mc-slider input[type=range]").forEach(function (s) {
    const out = s.parentElement.querySelector("label span");
    if (!out) return;
    const unit = /°/.test(out.textContent) ? "°" : "";
    s.oninput = function () { out.textContent = s.value + unit; };
  });

  // play button toggle
  const play = document.getElementById("p3-play");
  if (play) play.onclick = () => { const on = play.textContent === "❚❚"; play.textContent = on ? "▶" : "❚❚"; };

  // faux timeline sparkline
  const chart = document.getElementById("p3-chart");
  if (chart) chart.innerHTML = sparkline();
});

function sparkline() {
  const pts = [];
  for (let i = 0; i <= 72; i++) { const t = i / 72; const y = 0.5 + 0.42 * Math.sin(t * Math.PI * 2 - 1.4); pts.push([t * 100, (1 - y) * 100]); }
  const d = "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" L");
  const area = d + " L100,100 L0,100 Z";
  return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%">'
    + '<path d="' + area + '" fill="rgba(125,167,255,0.10)" stroke="none"/>'
    + '<path d="' + d + '" fill="none" stroke="#FFB74D" stroke-width="1.1" vector-effect="non-scaling-stroke"/>'
    + '<line x1="63" y1="0" x2="63" y2="100" stroke="#FFF3DD" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>';
}
