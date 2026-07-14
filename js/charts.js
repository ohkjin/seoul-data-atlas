// Statistics-as-navigation renderers.
// Overview charts (histogram, feature-importance, industry winners/losers) double
// as the navigation surface: clicking a bar drills into a detail view.

const DARK_AXIS = {
  axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
  axisLabel: { color: "#8C93A3", fontSize: 10 },
  splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
};
const C_BLUE = "#7DA7FF", C_MAGENTA = "#E45C91", C_CYAN = "#39E6E6", C_AMBER = "#FFB86B", C_GREEN = "#3FE6A5";

function fmtKRW(n) {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e8) return "₩" + (n / 1e8).toFixed(1) + "억";
  if (Math.abs(n) >= 1e4) return "₩" + (n / 1e4).toFixed(0) + "만";
  return "₩" + Math.round(n).toLocaleString();
}
function pct(v) { return (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%"; }

// ---------- HSI SUMMARY: RHSI distribution histogram ----------
function renderRhsiHistogram(el, scope) {
  const chart = echarts.init(el);
  const bins = Atlas.rhsiHistogram(scope, 18);
  const stats = Atlas.rhsiStats(scope);
  // marker for the selected dong's own RHSI
  let markLine = null;
  if (stats.selectedRhsi != null) {
    markLine = {
      silent: true, symbol: "none",
      data: [{ xAxis: bins.findIndex((b) => stats.selectedRhsi >= b.x0 && stats.selectedRhsi < b.x1) }],
      lineStyle: { color: C_CYAN, width: 2, type: "solid" },
      label: { formatter: "this dong", color: C_CYAN, fontSize: 9, position: "insideEndTop" },
    };
  }
  chart.setOption({
    grid: { left: 30, right: 12, top: 14, bottom: 22 },
    xAxis: {
      type: "category",
      data: bins.map((b) => b.x0.toFixed(2)),
      axisLabel: { color: "#8C93A3", fontSize: 8, interval: 3 },
      axisLine: DARK_AXIS.axisLine,
    },
    yAxis: { type: "value", ...DARK_AXIS, show: false },
    tooltip: { trigger: "axis", formatter: (p) => `RHSI ≈ ${p[0].axisValue}<br/>${p[0].value} neighborhoods` },
    series: [{
      type: "bar", barWidth: "92%",
      data: bins.map((b) => ({ value: b.count, itemStyle: { color: b.sensitive ? C_BLUE : C_MAGENTA } })),
      markLine,
    }],
  });
  return chart;
}

// ---------- WHY: feature importance bars (clickable) ----------
function renderFeatureImportanceBar(el, scope, onBarClick) {
  const chart = echarts.init(el);
  const rows = Atlas.featureImportance(scope, 10).reverse(); // ECharts y-cat draws bottom-up
  chart.setOption({
    grid: { left: 150, right: 24, top: 8, bottom: 8 },
    xAxis: { type: "value", ...DARK_AXIS },
    yAxis: {
      type: "category", data: rows.map((r) => r.label),
      axisLabel: { color: "#8C93A3", fontSize: 10 }, axisLine: { show: false }, axisTick: { show: false },
    },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (p) => `${p[0].axisValue}<br/>mean |SHAP| ${(+p[0].value).toFixed(4)}<br/><span style="color:#8C93A3">click to expand →</span>` },
    series: [{
      type: "bar", barWidth: "62%",
      data: rows.map((r) => ({ value: r.importance, key: r.key, itemStyle: { color: r.signed < 0 ? C_BLUE : C_MAGENTA, borderRadius: [0, 3, 3, 0] } })),
    }],
  });
  chart.on("click", (p) => { if (p.data && p.data.key && onBarClick) onBarClick(p.data.key); });
  return chart;
}

// ---------- WHAT: industry winners/losers diverging bars (clickable) ----------
function renderIndustryDivergingBar(el, scope, onBarClick) {
  const chart = echarts.init(el);
  const { winners, losers } = Atlas.industryRanking(scope, 7);
  // stack losers (negative) then winners (positive), ordered most-negative at bottom
  const rows = [...losers].reverse().concat([...winners].reverse());
  chart.setOption({
    grid: { left: 150, right: 40, top: 8, bottom: 8 },
    xAxis: { type: "value", ...DARK_AXIS, axisLabel: { color: "#8C93A3", fontSize: 9, formatter: (v) => (v * 100).toFixed(0) + "%" } },
    yAxis: {
      type: "category", data: rows.map((r) => r.label),
      axisLabel: { color: "#8C93A3", fontSize: 10 }, axisLine: { show: false }, axisTick: { show: false },
    },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (p) => `${p[0].axisValue}<br/>${pct(p[0].data.value)} on hot days<br/><span style="color:#8C93A3">click to expand →</span>` },
    series: [{
      type: "bar", barWidth: "62%",
      label: { show: true, position: "right", color: "#8C93A3", fontSize: 9, formatter: (p) => pct(p.data.value) },
      data: rows.map((r) => ({ value: r.sensitivity, key: r.key, itemStyle: { color: r.sensitivity < 0 ? C_BLUE : C_MAGENTA } })),
    }],
  });
  chart.on("click", (p) => { if (p.data && p.data.key && onBarClick) onBarClick(p.data.key); });
  return chart;
}

// ---------- FEATURE DETAIL: scatter (feature vs RHSI) ----------
function renderFeatureDetail(el, scope, featureKey) {
  const chart = echarts.init(el);
  const pts = Atlas.featureScatter(scope, featureKey);
  const selCode = scope.level === "dong" ? scope.dongCode : null;
  chart.setOption({
    grid: { left: 48, right: 20, top: 16, bottom: 34 },
    xAxis: { type: "value", name: URBAN_FEATURE_LABELS[featureKey] || featureKey, nameLocation: "middle", nameGap: 22, nameTextStyle: { color: "#8C93A3", fontSize: 10 }, ...DARK_AXIS },
    yAxis: { type: "value", name: "RHSI", nameTextStyle: { color: "#8C93A3", fontSize: 10 }, ...DARK_AXIS },
    tooltip: { formatter: (p) => `${p.data.dong_name}<br/>${URBAN_FEATURE_LABELS[featureKey] || featureKey}: ${p.data.value[0]}<br/>RHSI: ${p.data.value[1].toFixed(3)}` },
    series: [{
      type: "scatter",
      symbolSize: (v, params) => (params.data.dong_code === selCode ? 14 : 6),
      data: pts.map((p) => ({
        value: [p.x, p.y], dong_code: p.dong_code, dong_name: p.dong_name,
        itemStyle: { color: p.dong_code === selCode ? C_CYAN : "rgba(125,167,255,0.4)", borderColor: p.dong_code === selCode ? "#fff" : "transparent", borderWidth: 1 },
      })),
      markLine: { silent: true, symbol: "none", lineStyle: { color: "rgba(255,255,255,0.15)", type: "dashed" }, data: [{ yAxis: 0 }] },
    }],
  });
  return chart;
}

// ---------- INDUSTRY DETAIL: hot vs mild bar ----------
function renderIndustryHotMild(el, scope, industryKey) {
  const chart = echarts.init(el);
  const { hot, mild, label } = Atlas.industryHotMild(scope, industryKey);
  chart.setOption({
    grid: { left: 60, right: 16, top: 16, bottom: 24 },
    xAxis: { type: "category", data: ["Mild Days", "Hot Days"], ...DARK_AXIS },
    yAxis: { type: "value", ...DARK_AXIS, axisLabel: { color: "#8C93A3", fontSize: 9, formatter: (v) => fmtKRW(v) } },
    tooltip: { trigger: "axis", formatter: (p) => `${p[0].axisValue}<br/>${fmtKRW(p[0].data)}` },
    title: { text: label, left: "center", top: 0, textStyle: { color: "#8C93A3", fontSize: 10, fontWeight: 400 } },
    series: [{
      type: "bar", barWidth: "45%",
      data: [{ value: mild, itemStyle: { color: C_BLUE } }, { value: hot, itemStyle: { color: C_MAGENTA } }],
    }],
  });
  return chart;
}

// ---------- INDUSTRY DETAIL: per-dong ranking list ----------
function renderIndustryDongRankingList(el, industryKey) {
  if (!Atlas.hasDongIndustry(industryKey)) {
    el.innerHTML = `<div style="color:var(--muted);font-size:11px;padding:8px 0;">Per-neighborhood detail is available for the highest-volume industries only.</div>`;
    return;
  }
  const rows = Atlas.industryDongRanking(industryKey, true, 8);
  const max = Math.max(...rows.map((r) => Math.abs(r.sensitivity)), 0.01);
  el.innerHTML = rows.map((r, i) => `
    <div class="rank-row">
      <span class="rank-num">${i + 1}</span>
      <span class="rank-name">${r.dong_name}</span>
      <span class="rank-bar-wrap"><span class="rank-bar" style="width:${(Math.abs(r.sensitivity) / max * 100).toFixed(0)}%;background:${r.sensitivity < 0 ? C_BLUE : C_MAGENTA}"></span></span>
      <span class="rank-val">${pct(r.sensitivity)}</span>
    </div>
  `).join("");
}

// ---------- INDUSTRY DETAIL: gu daily time series (sales bars + temp line) ----------
function renderGuTimeseries(el, guCode) {
  const chart = echarts.init(el);
  const series = Atlas.guTimeseries[guCode] || [];
  const dates = series.map((s) => s.date.slice(5));
  chart.setOption({
    grid: { left: 46, right: 40, top: 14, bottom: 22 },
    xAxis: { type: "category", data: dates, axisLabel: { color: "#8C93A3", fontSize: 8, interval: 29 }, axisLine: DARK_AXIS.axisLine },
    yAxis: [
      { type: "value", ...DARK_AXIS, axisLabel: { color: "#8C93A3", fontSize: 8, formatter: (v) => fmtKRW(v) } },
      { type: "value", name: "°C", splitLine: { show: false }, axisLine: DARK_AXIS.axisLine, axisLabel: DARK_AXIS.axisLabel },
    ],
    tooltip: { trigger: "axis" },
    series: [
      { type: "bar", yAxisIndex: 0, data: series.map((s) => s.retail_total_amount), itemStyle: { color: "rgba(125,167,255,0.5)" } },
      { type: "line", yAxisIndex: 1, data: series.map((s) => s.temp_max), symbol: "none", lineStyle: { color: C_AMBER, width: 1.5 } },
    ],
  });
  return chart;
}

// ============ DONUT: composition (percentage) ============
const DONUT_PALETTE = ["#7DA7FF", "#39E6E6", "#3FE6A5", "#FFB86B", "#E45C91", "#8C93A3", "#B98CFF"];
function renderDonut(el, scope, kind) {
  const chart = echarts.init(el);
  const rows = Atlas.composition(scope, kind);
  chart.setOption({
    tooltip: { trigger: "item", formatter: (p) => `${p.name}<br/>${p.value}%` },
    legend: { type: "scroll", orient: "vertical", right: 4, top: "center", textStyle: { color: "#8C93A3", fontSize: 10 }, itemWidth: 9, itemHeight: 9 },
    series: [{
      type: "pie", radius: ["48%", "74%"], center: ["34%", "50%"], avoidLabelOverlap: true,
      itemStyle: { borderColor: "#0B0F17", borderWidth: 2 },
      label: { show: false }, labelLine: { show: false },
      data: rows.map((r, i) => ({ ...r, itemStyle: { color: DONUT_PALETTE[i % DONUT_PALETTE.length] } })),
    }],
  });
  return chart;
}

// ============ 3D SCATTER (echarts-gl): featА × featВ × RHSI ============
function renderScatter3D(el, scope, fxKey, fyKey) {
  const chart = echarts.init(el);
  const dongs = Atlas.dongsInScope(scope);
  const selCode = scope.level === "dong" ? scope.dongCode : null;
  const data = dongs.map((d) => ({
    value: [d[fxKey], d[fyKey], d.RHSI_retail], name: d.dong_name, code: d.dong_code,
  }));
  const rhsis = dongs.map((d) => d.RHSI_retail);
  chart.setOption({
    tooltip: { formatter: (p) => `${p.data.name}<br/>${URBAN_FEATURE_LABELS[fxKey]}: ${p.data.value[0]}<br/>${URBAN_FEATURE_LABELS[fyKey]}: ${p.data.value[1]}<br/>RHSI: ${p.data.value[2].toFixed(3)}` },
    visualMap: {
      show: false, dimension: 2, min: Math.min(...rhsis), max: Math.max(...rhsis),
      inRange: { color: ["#7DA7FF", "#786E8C", "#E4524E"] },
    },
    xAxis3D: { name: URBAN_FEATURE_LABELS[fxKey], type: "value", nameTextStyle: { color: "#8C93A3" }, axisLabel: { color: "#8C93A3", fontSize: 8 } },
    yAxis3D: { name: URBAN_FEATURE_LABELS[fyKey], type: "value", nameTextStyle: { color: "#8C93A3" }, axisLabel: { color: "#8C93A3", fontSize: 8 } },
    zAxis3D: { name: "RHSI", type: "value", nameTextStyle: { color: "#8C93A3" }, axisLabel: { color: "#8C93A3", fontSize: 8 } },
    grid3D: {
      boxWidth: 90, boxDepth: 90, viewControl: { distance: 200, alpha: 18, beta: 30 },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.15)" } },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
      axisPointer: { lineStyle: { color: "#39E6E6" } },
    },
    series: [{
      type: "scatter3D", data,
      symbolSize: (v, p) => (p.data.code === selCode ? 16 : 7),
      itemStyle: { opacity: 0.85, borderWidth: 0 },
      emphasis: { itemStyle: { color: "#39E6E6" } },
    }],
  });
  return chart;
}

// ============ SURFACE (echarts-gl): RHSI response surface over two features ============
function renderSurface(el, fxKey, fyKey) {
  const chart = echarts.init(el);
  const grid = Atlas.surfaceGrid(fxKey, fyKey, 12);
  const zs = grid.data.map((d) => d[2]);
  chart.setOption({
    tooltip: {},
    visualMap: { show: false, dimension: 2, min: Math.min(...zs), max: Math.max(...zs), inRange: { color: ["#7DA7FF", "#786E8C", "#E4524E"] } },
    xAxis3D: { name: URBAN_FEATURE_LABELS[fxKey], type: "value", nameTextStyle: { color: "#8C93A3" }, axisLabel: { color: "#8C93A3", fontSize: 8 } },
    yAxis3D: { name: URBAN_FEATURE_LABELS[fyKey], type: "value", nameTextStyle: { color: "#8C93A3" }, axisLabel: { color: "#8C93A3", fontSize: 8 } },
    zAxis3D: { name: "RHSI", type: "value", nameTextStyle: { color: "#8C93A3" }, axisLabel: { color: "#8C93A3", fontSize: 8 } },
    grid3D: {
      boxWidth: 90, boxDepth: 90, viewControl: { distance: 200, alpha: 22, beta: 35 },
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.15)" } },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } },
    },
    series: [{
      type: "surface", data: grid.data, wireframe: { show: true, lineStyle: { color: "rgba(255,255,255,0.12)", width: 0.5 } },
      shading: "color", itemStyle: { opacity: 0.9 },
    }],
  });
  return chart;
}

// ============ NETWORK (optional): urban-feature correlation graph ============
function renderNetwork(el) {
  const chart = echarts.init(el);
  const { nodes, links } = Atlas.featureCorrelation(0.45);
  const degree = {}; nodes.forEach((n) => (degree[n.id] = 0));
  links.forEach((l) => { degree[l.source]++; degree[l.target]++; });
  chart.setOption({
    tooltip: { formatter: (p) => (p.dataType === "edge" ? `${p.data.source} ↔ ${p.data.target}<br/>r = ${p.data.value}` : p.data.name) },
    series: [{
      type: "graph", layout: "force", roam: true,
      force: { repulsion: 180, edgeLength: [40, 120], gravity: 0.12 },
      label: { show: true, color: "#C9D2E3", fontSize: 9, position: "right" },
      lineStyle: { color: "source", opacity: 0.5, curveness: 0.1 },
      data: nodes.map((n) => ({
        id: n.id, name: n.name, symbolSize: 8 + degree[n.id] * 3,
        itemStyle: { color: "#7DA7FF" },
      })),
      links: links.map((l) => ({
        source: l.source, target: l.target, value: l.value,
        lineStyle: { width: 0.6 + Math.abs(l.value) * 2.4, color: l.value < 0 ? "#E45C91" : "#3FE6A5" },
      })),
    }],
  });
  return chart;
}

// ============ RHSI DASHBOARD WIDGETS (HTML, from the video spec) ============
function scopeSub(scope) {
  if (scope.level === "dong") { const d = Atlas.dongByCode.get(scope.dongCode); return d ? `${d.gu_name} · ${d.dong_name}` : "Dong"; }
  if (scope.level === "gu") { const g = Atlas.guByCode.get(scope.guCode); return g ? g.gu_name : "Gu"; }
  return "All of Seoul";
}
function hsiPct(v) { const p = Atlas.rhsiToPct(v); return p == null ? "—" : (p >= 0 ? "+" : "") + p.toFixed(1) + "%"; }
function signClass(v) { return v == null ? "" : v < 0 ? "neg" : "pos"; }
function fmtHSI(v) { return v == null || Number.isNaN(v) ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2); }

// W1 — Key indicators (4 KPI cards)
function rhsiKPIHtml(scope) {
  const rhsi = Atlas.retailHSI(scope), all = Atlas.allIndustryHSI(scope);
  const msi = Atlas.mostSensitiveIndustry(scope), dd = Atlas.deltaDaypop(scope), days = Atlas.heatDayCounts(scope);
  const kpi = (k, v, badge, badgeCls, note) => `<div class="kpi"><div class="kpi-k">${k}</div><div class="kpi-v">${v}</div>${badge ? `<div class="kpi-badge ${badgeCls}">${badge}</div>` : ""}<div class="kpi-note">${note}</div></div>`;
  return `<div class="ins-widget">
    <div class="iw-head"><span class="iw-title">Key indicators</span><span class="iw-sub">${scopeSub(scope)}</span></div>
    <div class="kpi-grid">
      ${kpi("RHSI · retail heat sensitivity", fmtHSI(rhsi), hsiPct(rhsi), signClass(rhsi), "extreme-heat ÷ mild-day retail sales")}
      ${kpi("All-industry HSI", fmtHSI(all), hsiPct(all), signClass(all), "all sectors, extreme-heat ÷ mild")}
      ${kpi("Most heat-sensitive industry", msi ? (msi.sensitivity * 100).toFixed(1) + "%" : "—", null, signClass(msi ? msi.sensitivity : 0), msi ? msi.label : "—")}
      ${kpi("Δ Daytime population", hsiPct(dd), null, signClass(dd), `${days.hot} extreme-heat / ${days.mild} mild days`)}
    </div>
    <div class="iw-cap">Negative means retail sales <b>fall</b> on extreme-heat days (apparent temp ≥ 33 °C) vs mild days.</div>
  </div>`;
}

// W2 — Most heat-sensitive industry
function mostSensitiveHtml(scope) {
  const m = Atlas.mostSensitiveIndustry(scope);
  if (!m) return "";
  return `<div class="ins-widget">
    <div class="iw-head"><span class="iw-title">Most heat-sensitive industry</span><span class="iw-sub">${scopeSub(scope)}</span></div>
    <div class="msi-head"><span class="msi-rank">Rank 1</span><span class="msi-name">${m.label}</span></div>
    <div class="msi-cards">
      <div class="msi-card"><div class="msi-lab">Mild-day avg</div><b>${fmtKRW(m.mild)}</b></div>
      <div class="msi-card"><div class="msi-lab">Extreme-heat-day avg</div><b>${fmtKRW(m.hot)}</b></div>
      <div class="msi-card accent"><div class="msi-lab">RHSI</div><b class="${signClass(m.rhsi)}">${fmtHSI(m.rhsi)}</b><span>${(m.sensitivity * 100).toFixed(1)}%</span></div>
    </div>
    <div class="iw-cap">The retail sector whose sales drop most on extreme-heat days in ${scopeSub(scope)}.</div>
  </div>`;
}

// W3 — Top contributing urban characteristics (city correlation, or dong SHAP)
function topCharacteristicsHtml(scope) {
  const isDong = scope.level === "dong";
  const rows = isDong
    ? Atlas.signedDrivers(scope.dongCode, 6).map((r) => ({ label: r.label, val: r.value }))
    : Atlas.rhsiCorrelations(6).map((r) => ({ label: r.label, val: r.r }));
  const max = Math.max(...rows.map((r) => Math.abs(r.val)), 1e-9);
  const body = rows.map((r) => `
    <div class="corr-row">
      <span class="corr-name">${r.label}</span>
      <span class="corr-track"><span class="corr-bar ${r.val < 0 ? "neg" : "pos"}" style="width:${(Math.abs(r.val) / max * 100).toFixed(0)}%"></span></span>
      <span class="corr-val ${r.val < 0 ? "neg" : "pos"}">${r.val >= 0 ? "+" : ""}${isDong ? r.val.toFixed(3) : r.val.toFixed(2)}</span>
    </div>`).join("");
  return `<div class="ins-widget">
    <div class="iw-head"><span class="iw-title">${isDong ? "Why this place is heat-sensitive" : "Top contributing urban characteristics"}</span><span class="iw-sub">${isDong ? scopeSub(scope) : "correlation · city-wide"}</span></div>
    <div class="corr-list">${body}</div>
    <div class="iw-cap">${isDong ? "SHAP contributions to this dong's RHSI — rose raises it (more resilient), blue lowers it (more heat-sensitive)." : "Pearson correlation with RHSI across 422 dongs; rose raises RHSI, blue lowers it."}</div>
  </div>`;
}

// W4 — Retail share & heat response by group (donut + table)
function retailGroupHtml(scope) {
  const groups = Atlas.retailGroupHeatResponse(scope);
  const cols = ["#FFB86B", "#3FE6A5", "#9F8CFF", "#7DA7FF"];
  const totMild = groups.reduce((s, g) => s + (g.mild || 0), 0) || 1;
  // conic-gradient donut of the group shares
  let acc = 0; const stops = groups.map((g, i) => { const a = acc, b = acc + (g.mild || 0) / totMild * 100; acc = b; return `${cols[i]} ${a.toFixed(1)}% ${b.toFixed(1)}%`; }).join(", ");
  const table = groups.map((g, i) => `
    <div class="ht-row">
      <span class="ht-name"><i style="background:${cols[i]}"></i>${g.name}</span>
      <span>${g.mild == null ? "—" : fmtKRW(g.mild)}</span>
      <span>${g.hot == null ? "—" : fmtKRW(g.hot)}</span>
      <span class="${signClass(g.change)}">${g.change == null ? "—" : (g.change >= 0 ? "+" : "") + (g.change * 100).toFixed(1) + "%"}</span>
      <span class="${signClass(g.hsi)}">${fmtHSI(g.hsi)}</span>
    </div>`).join("");
  return `<div class="ins-widget">
    <div class="iw-head"><span class="iw-title">Retail share &amp; heat response by group</span><span class="iw-sub">${scopeSub(scope)}</span></div>
    <div class="rg-wrap">
      <div class="rg-donut" style="background:conic-gradient(${stops})"><div class="rg-hole"></div></div>
      <div class="heat-table">
        <div class="ht-row ht-head"><span>Group</span><span>Mild</span><span>Ext-heat</span><span>Δ</span><span>HSI</span></div>
        ${table}
      </div>
    </div>
    <div class="iw-cap">Mild-day vs extreme-heat-day retail sales by group — Δ and HSI show the heat response.</div>
  </div>`;
}

// W5 — How to read RHSI (words-only explanation; also used in the detail panel)
function howToReadRhsiHtml() {
  return `<div class="ins-widget iw-explain">
    <div class="iw-title">How to read RHSI</div>
    <div class="explain-formula">RHSI = log( avg retail sales on extreme-heat days ÷ avg on mild days )</div>
    <div class="explain-line pos"><b>RHSI &gt; 0</b> → retail sales rise on extreme-heat days</div>
    <div class="explain-line neg"><b>RHSI &lt; 0</b> → retail sales fall on extreme-heat days</div>
    <div class="explain-note">Computed over 19 retail industries. Extreme-heat day = apparent temp ≥ 33 °C; mild days are the baseline. Click a dong on the map to refocus every panel.</div>
  </div>`;
}

// Full insights body for the floating panel (W1–W4).
function insightsBodyHtml(scope) {
  return rhsiKPIHtml(scope) + mostSensitiveHtml(scope) + topCharacteristicsHtml(scope) + retailGroupHtml(scope);
}

// Editorial KPI strip for the Insights column — same figure language as the charts below.
function regionSummaryHtml(scope) {
  const rhsi = Atlas.retailHSI(scope), all = Atlas.allIndustryHSI(scope);
  const msi = Atlas.mostSensitiveIndustry(scope), dd = Atlas.deltaDaypop(scope), days = Atlas.heatDayCounts(scope);
  const pct = Atlas.rhsiToPct(rhsi);
  const where = scopeSub(scope);
  const place = scope.level === "city" ? "across Seoul" : `in <b>${where}</b>`;
  const finding = pct == null
    ? `Key heat-response metrics ${scope.level === "city" ? "for Seoul" : `for <b>${where}</b>`}.`
    : pct < 0
      ? `Retail sales fall <span class="hot">${Math.abs(pct).toFixed(1)}%</span> on extreme-heat days ${place}.`
      : `Retail sales rise <span class="cool">${pct.toFixed(1)}%</span> on extreme-heat days ${place}.`;
  const cell = (key, value, sub, opts = {}) =>
    `<div class="metric-block${opts.primary ? " primary" : ""}"><span class="metric-key">${key}</span><div class="metric-value ${opts.signed ? signClass(opts.signed) : ""}">${value}</div><span class="metric-sub">${sub}</span></div>`;
  return `<figure class="ins-fig ins-kpi-fig">
    <div class="fig-head"><span class="fig-kicker">KPI</span><h4 class="fig-title">Key indicators</h4></div>
    <p class="fig-finding">${finding}</p>
    <div class="key-metrics ins-kpi-grid">
      ${cell("RHSI", fmtHSI(rhsi), `${hsiPct(rhsi)} · retail heat response`, { primary: true, signed: rhsi })}
      ${cell("All-industry HSI", fmtHSI(all), `${hsiPct(all)} · all sectors`, { signed: all })}
      ${cell("Most sensitive", msi ? (msi.sensitivity * 100).toFixed(1) + "%" : "—", msi ? msi.label : "—", { signed: msi ? msi.sensitivity : null })}
      ${cell("Δ Daytime pop.", hsiPct(dd), `${days.hot} heat / ${days.mild} mild days`, { signed: dd })}
    </div>
    <p class="fig-caption">RHSI = log(hot-day ÷ mild-day retail sales) · negative = sales fall on heat days.</p>
  </figure>`;
}

// SHAP-only summary used when the model-explanation dataset is selected.
// It intentionally replaces the retail KPI strip so Insights stays on-topic.
function shapSummaryHtml(scope) {
  const coverage = Atlas.shapCoverage(scope);
  const isDong = scope.level === "dong";
  const local = isDong ? Atlas.signedDrivers(scope.dongCode, 1)[0] : null;
  const global = !isDong ? Atlas.featureImportance(scope, 1)[0] : null;
  const lead = local || global;
  const leadValue = !lead ? "—" : isDong
    ? `${lead.value >= 0 ? "+" : ""}${lead.value.toFixed(3)}`
    : lead.importance.toFixed(3);
  const leadNote = !lead ? "no model explanation available" : isDong
    ? `${lead.label} · signed contribution`
    : `${lead.label} · mean |SHAP|`;
  const cell = (key, value, sub, primary = false) =>
    `<div class="metric-block${primary ? " primary" : ""}><span class="metric-key">${key}</span><div class="metric-value">${value}</div><span class="metric-sub">${sub}</span></div>`;
  return `<figure class="ins-fig ins-kpi-fig">
    <div class="fig-head"><span class="fig-kicker">MODEL</span><h4 class="fig-title">SHAP explanation scope</h4></div>
    <p class="fig-finding">SHAP describes how each input changes the model's <b>predicted RHSI</b>. It does not identify a causal effect.</p>
    <div class="key-metrics ins-kpi-grid">
      ${cell("Explained output", "RHSI", "model prediction", true)}
      ${cell("Model inputs", coverage.features, "complete SHAP feature set")}
      ${cell("Coverage", `${coverage.valid}/${coverage.total}`, "dongs with contributions")}
      ${cell(isDong ? "Largest local push" : "Top importance", leadValue, leadNote)}
    </div>
    <p class="fig-caption">Positive SHAP → higher predicted RHSI (more resilient) · negative SHAP → lower predicted RHSI (more heat-sensitive).</p>
  </figure>`;
}

// Dataset-specific KPI strip. Cross-dataset KPIs are reserved for the project
// overview (datasetId = null); every dataset page describes only its own fields.
function datasetSummaryHtml(scope, datasetId) {
  if (!datasetId) return regionSummaryHtml(scope);
  if (datasetId === "shap") return shapSummaryHtml(scope);
  const dongs = scope.level === "dong"
    ? [Atlas.dongByCode.get(scope.dongCode)].filter(Boolean)
    : Atlas.dongsInScope(scope);
  const mean = (key) => {
    const vals = dongs.map((d) => d && d[key]).filter((v) => Number.isFinite(v));
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const cell = (key, value, sub, primary = false, signed = null) =>
    `<div class="metric-block${primary ? " primary" : ""}><span class="metric-key">${key}</span><div class="metric-value${signed == null ? "" : " " + signClass(signed)}">${value}</div><span class="metric-sub">${sub}</span></div>`;
  const wrap = (title, finding, cells, caption) => `<figure class="ins-fig ins-kpi-fig">
    <div class="fig-head"><span class="fig-kicker">DATASET</span><h4 class="fig-title">${title}</h4></div>
    <p class="fig-finding">${finding}</p><div class="key-metrics ins-kpi-grid">${cells}</div>
    <p class="fig-caption">${caption}</p></figure>`;
  const days = Atlas.heatDayCounts(scope);

  if (datasetId === "rhsi") {
    const v = Atlas.retailHSI(scope), pct = Atlas.rhsiToPct(v);
    const rank = scope.level === "dong" ? Atlas.dongByCode.get(scope.dongCode)?.rhsi_rank
      : scope.level === "gu" ? Atlas.guByCode.get(scope.guCode)?.rhsi_rank : null;
    return wrap("RHSI summary", "Observed retail sales on extreme-heat days compared with mild reference days.",
      cell("RHSI", fmtHSI(v), hsiPct(v), true, v) +
      cell("Approx. change", pct == null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, "exp(RHSI) − 1", false, v) +
      cell("Rank", rank ? `${rank}` : "—", rank ? (scope.level === "dong" ? "of 422 dongs" : "of 25 districts") : "citywide") +
      cell("Coverage", dongs.length, "neighborhoods in scope"),
      "RHSI only · negative = lower hot-day retail sales · association, not causation.");
  }
  if (datasetId === "weather") {
    const s = Atlas.dailySeries(scope).filter((d) => Number.isFinite(d.temp));
    const temps = s.map((d) => d.temp), max = temps.length ? Math.max(...temps) : null;
    const avg = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
    return wrap("Daily weather summary", "Daily maximum temperature observations for the selected geography.",
      cell("Peak temperature", max == null ? "—" : `${max.toFixed(1)}°C`, "maximum in 2024", true) +
      cell("Mean daily max", avg == null ? "—" : `${avg.toFixed(1)}°C`, "2024 average") +
      cell("Observations", s.length, "daily records") +
      cell("Period", "2024", "calendar year"),
      "Temperature series only; hot/mild classification is shown in its derived-feature dataset.");
  }
  if (datasetId === "heatfeature" || datasetId === "heatdays") {
    return wrap(datasetId === "heatdays" ? "Heat-day count summary" : "Heat classification summary",
      "Days classified from the UHUS apparent-temperature thresholds.",
      cell("Extreme-heat days", days.hot, "apparent temperature ≥ 33°C", true) +
      cell("Mild days", days.mild, "18–26°C, dry, non-holiday") +
      cell("Coverage", dongs.length, "neighborhoods in scope") +
      cell("Threshold", "33°C", "apparent temperature"),
      "Classification and qualifying-day counts only.");
  }
  if (datasetId === "sales" || datasetId === "sectorprofile") {
    const m = Atlas.mostSensitiveIndustry(scope);
    const groups = Atlas.retailGroupHeatResponse(scope).filter((g) => g.mild != null);
    const mild = groups.reduce((s, g) => s + g.mild, 0), hot = groups.reduce((s, g) => s + g.hot, 0);
    const change = mild > 0 ? (hot - mild) / mild : null;
    return wrap(datasetId === "sectorprofile" ? "Sector profile summary" : "Sales response summary",
      "Hot-day and mild-day card sales within the selected sales scope.",
      cell("Most sensitive", m ? m.label : "—", m ? `${(m.sensitivity * 100).toFixed(1)}%` : "no value", true) +
      cell("Retail change", change == null ? "—" : `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`, "hot vs mild", false, change) +
      cell("Retail groups", groups.length, "groups with observations") +
      cell("Geography", scopeSub(scope), "active sales scope"),
      "Sales and sector statistics only.");
  }
  if (datasetId === "salesfeature") {
    const groups = Atlas.retailGroupHeatResponse(scope).filter((g) => g.mild != null);
    const total = groups.reduce((s, g) => s + g.mild, 0) || 1;
    const top = groups.slice().sort((a, b) => b.mild - a.mild)[0];
    return wrap("Sales composition summary", "Retail composition features derived from sector shares.",
      cell("Largest group", top ? top.name : "—", top ? `${(top.mild / total * 100).toFixed(1)}% of mild-day retail` : "no value", true) +
      cell("Retail share", mean("retail_share") == null ? "—" : `${(mean("retail_share") * 100).toFixed(1)}%`, "share of all-sector sales") +
      cell("Feature groups", groups.length, "retail composition groups") +
      cell("Coverage", dongs.length, "neighborhoods in scope"),
      "Composition ratios only; this section does not display weather or SHAP results.");
  }
  if (datasetId === "context") {
    return wrap("Urban context summary", "Built environment, demographic, accessibility, and land-use variables.",
      cell("Context variables", URBAN_FEATURE_KEYS.filter((k) => !SALES_SHARE_KEYS.has(k) && k !== "delta_daypop").length, "non-sales context fields", true) +
      cell("Coverage", dongs.length, "neighborhoods in scope") +
      cell("Land-use fields", 7, "residential, commercial, green, etc.") +
      cell("Green space", mean("green_space_share") == null ? "—" : `${(mean("green_space_share") * 100).toFixed(1)}%`, "mean share in scope"),
      "Urban feature values only; RHSI association and SHAP attribution are shown in their own datasets.");
  }
  if (datasetId === "mobility") {
    const dd = mean("delta_daypop"), dnpr = mean("dnpr");
    return wrap("Mobility summary", "Day/night population structure and hot-versus-mild daytime-population response.",
      cell("Δ Day population", hsiPct(dd), "hot vs mild log-ratio", true, dd) +
      cell("Day/night ratio", dnpr == null ? "—" : dnpr.toFixed(2), "mean DNPR") +
      cell("Mobility fields", 2, "DNPR and Δ day population") +
      cell("Coverage", dongs.length, "neighborhoods in scope"),
      "Mobility variables only; associations with RHSI are exploratory.");
  }
  if (datasetId === "dongbase" || datasetId === "geometry") {
    const guCount = new Set(dongs.map((d) => d.gu_code)).size;
    return wrap(datasetId === "geometry" ? "Geometry coverage" : "Administrative coverage",
      "Administrative units available for joining and map rendering.",
      cell("Dongs", dongs.length, "neighborhood records", true) +
      cell("Districts", guCount, "gu represented") +
      cell("Join key", "dong_code", "primary spatial key") +
      cell("Geometry", datasetId === "geometry" ? "Polygon" : "Lookup", "dataset role"),
      "Administrative coverage only; no outcome or model metrics.");
  }
  if (datasetId === "atlas") {
    return wrap("Combined atlas view", "Integrated map view of the UHUS project datasets.",
      cell("Dongs", dongs.length, "active spatial coverage", true) +
      cell("Districts", new Set(dongs.map((d) => d.gu_code)).size, "gu represented") +
      cell("Period", "2024", "daily weather and sales") +
      cell("Primary index", "RHSI", "retail heat response"),
      "Combined-view metadata; full cross-dataset findings remain in the UHUS project overview.");
  }
  return "";
}

// ============ EDITORIAL-SCIENTIFIC FIGURES (Insights column) ============
// Muted, report-style palette (navy/amber/rose + grey) over the night theme.
// Palette drawn from the interface theme tokens so the figures match the UI.
const ED = { ink: "#E9EDF5", muted: "#8C93A3", grid: "rgba(255,255,255,0.06)", axis: "rgba(255,255,255,0.14)",
  blue: "#7DA7FF", amber: "#FFB86B", rose: "#E45C91", green: "#3FE6A5", cyan: "#39E6E6", grey: "#59616F" };
const EDAXIS = { axisLine: { lineStyle: { color: ED.axis } }, axisLabel: { color: ED.muted, fontSize: 9 },
  splitLine: { lineStyle: { color: ED.grid } }, axisTick: { show: false } };
const EDTIP = { backgroundColor: "rgba(11,15,23,0.96)", borderColor: "rgba(255,255,255,0.12)", textStyle: { color: ED.ink, fontSize: 11 } };
function edInit(el, h) { el.style.height = h + "px"; const c = echarts.init(el); return c; }

// FIGURE 1 — RHSI distribution across 422 dongs (region marker when drilled)
function figRhsiDistribution(el, scope) {
  const c = edInit(el, 148);
  const bins = Atlas.rhsiHistogram({ level: "city", guCode: null, dongCode: null }, 26);
  const zeroIdx = bins.findIndex((b) => b.x1 >= 0);
  const markData = [{ xAxis: zeroIdx, lineStyle: { color: "rgba(255,255,255,0.35)", type: "dashed", width: 1 }, label: { formatter: "RHSI 0", color: ED.muted, fontSize: 8, position: "insideEndTop" } }];
  const rv = scope.level !== "city" ? Atlas.retailHSI(scope) : null;
  if (rv != null) { const ri = bins.findIndex((b) => rv < b.x1); if (ri >= 0) markData.push({ xAxis: ri, lineStyle: { color: ED.amber, width: 1.6 }, label: { formatter: "here", color: ED.amber, fontSize: 8, position: "insideEndTop" } }); }
  c.setOption({
    grid: { left: 30, right: 10, top: 10, bottom: 22 },
    xAxis: { type: "category", data: bins.map((b) => b.x0.toFixed(2)), axisLabel: { color: ED.muted, fontSize: 8, interval: 5 }, ...EDAXIS },
    yAxis: { type: "value", ...EDAXIS },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...EDTIP, formatter: (p) => `RHSI ≈ ${p[0].axisValue}<br/>${p[0].value} dongs` },
    series: [{ type: "bar", barCategoryGap: "18%", data: bins.map((b) => ({ value: b.count, itemStyle: { color: b.sensitive ? ED.blue : ED.rose } })),
      markLine: { silent: true, symbol: "none", data: markData } }],
  });
  return c;
}

// RHSI-only district comparison.
function figRhsiDistrictRanking(el, scope) {
  const c = edInit(el, 190);
  const selected = scope.guCode || null;
  const rows = Atlas.guMetrics.slice().sort((a, b) => a.RHSI_retail - b.RHSI_retail);
  c.setOption({
    grid: { left: 82, right: 34, top: 7, bottom: 22 },
    xAxis: { type: "value", ...EDAXIS, axisLabel: { color: ED.muted, fontSize: 8 } },
    yAxis: { type: "category", data: rows.map((r) => r.gu_name.replace("-gu", "")), axisLabel: { color: ED.muted, fontSize: 8, interval: 1 }, axisLine: { show: false }, axisTick: { show: false } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...EDTIP, formatter: (p) => `${p[0].axisValue}<br/>RHSI ${(+p[0].value).toFixed(3)}` },
    series: [{ type: "bar", barWidth: "62%", data: rows.map((r) => ({ value: r.RHSI_retail,
      itemStyle: { color: r.gu_code === selected ? ED.amber : (r.RHSI_retail < 0 ? ED.blue : ED.rose), borderRadius: 2 } })),
      markLine: { silent: true, symbol: "none", data: [{ xAxis: 0 }], lineStyle: { color: "rgba(255,255,255,0.2)", type: "dashed" } } }],
  });
  return c;
}

// Context-only association chart: always Pearson r, never SHAP.
function figContextAssociations(el) {
  const c = edInit(el, 185);
  const rows = Atlas.rhsiCorrelations(10).slice().reverse();
  c.setOption({
    grid: { left: 124, right: 40, top: 6, bottom: 8 },
    xAxis: { type: "value", min: -1, max: 1, ...EDAXIS, axisLabel: { color: ED.muted, fontSize: 8 } },
    yAxis: { type: "category", data: rows.map((r) => r.label), axisLabel: { color: ED.muted, fontSize: 8.5 }, axisLine: { show: false }, axisTick: { show: false } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...EDTIP, formatter: (p) => `${p[0].axisValue}<br/>Pearson r ${p[0].value >= 0 ? "+" : ""}${(+p[0].value).toFixed(2)}` },
    series: [{ type: "bar", barWidth: "55%", data: rows.map((r) => ({ value: r.r,
      itemStyle: { color: r.r < 0 ? ED.blue : ED.rose, borderRadius: 2 } })),
      label: { show: true, position: "right", color: ED.muted, fontSize: 8, formatter: (p) => `${p.value >= 0 ? "+" : ""}${(+p.value).toFixed(2)}` } }],
  });
  return c;
}

// Urban Features view: profile the baseline context variables themselves. This
// deliberately avoids RHSI correlation and SHAP attribution.
function figContextProfile(el, scope) {
  const c = edInit(el, 205);
  const city = { level: "city", guCode: null, dongCode: null };
  const keys = [
    "land_price", "subway_access_coverage", "bus_stop_density", "green_space_share",
    "commercial_area_share", "residential_area_share", "activity_facility_density",
    "aged_housing_share", "parking_capacity", "elderly_share", "low_income_share", "dnpr",
  ];
  const avgNorm = (s, key) => {
    const dongs = s.level === "dong" ? [Atlas.dongByCode.get(s.dongCode)].filter(Boolean) : Atlas.dongsInScope(s);
    const vals = dongs.map((d) => Atlas._normFeat(d, key)).filter((v) => Number.isFinite(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const rows = keys.map((k) => ({
    key: k,
    label: URBAN_FEATURE_LABELS[k] || k,
    scope: avgNorm(scope, k),
    city: avgNorm(city, k),
  })).filter((r) => r.scope != null && r.city != null)
    .sort((a, b) => Math.abs(b.scope - b.city) - Math.abs(a.scope - a.city))
    .slice(0, 8).reverse();
  c.setOption({
    grid: { left: 126, right: 16, top: 24, bottom: 22 },
    legend: { data: ["This scope", "Seoul avg"], top: 0, right: 0, textStyle: { color: ED.muted, fontSize: 9 }, itemWidth: 9, itemHeight: 9 },
    xAxis: { type: "value", min: 0, max: 1, ...EDAXIS, axisLabel: { color: ED.muted, fontSize: 8, formatter: (v) => v.toFixed(1) } },
    yAxis: { type: "category", data: rows.map((r) => r.label), axisLabel: { color: ED.muted, fontSize: 8.5 }, axisLine: { show: false }, axisTick: { show: false } },
    tooltip: { trigger: "axis", ...EDTIP, formatter: (p) => `${p[0].axisValue}<br/>This scope: ${(+p[0].value).toFixed(2)}<br/>Seoul avg: ${(+p[1].value).toFixed(2)}` },
    series: [
      { name: "This scope", type: "bar", barWidth: "46%", data: rows.map((r) => +r.scope.toFixed(3)), itemStyle: { color: ED.amber, borderRadius: 2 } },
      { name: "Seoul avg", type: "bar", barWidth: "46%", data: rows.map((r) => +r.city.toFixed(3)), itemStyle: { color: "rgba(125,167,255,0.45)", borderRadius: 2 } },
    ],
  });
  return c;
}

// Administrative/geometry coverage by district.
function figAdministrativeCoverage(el, scope) {
  const c = edInit(el, 190);
  const selected = scope.guCode || null;
  const counts = new Map();
  Atlas.dongMetrics.forEach((d) => counts.set(d.gu_code, (counts.get(d.gu_code) || 0) + 1));
  const rows = Atlas.guMetrics.map((g) => ({ ...g, count: counts.get(g.gu_code) || 0 })).sort((a, b) => b.count - a.count);
  c.setOption({
    grid: { left: 82, right: 28, top: 7, bottom: 22 },
    xAxis: { type: "value", ...EDAXIS, axisLabel: { color: ED.muted, fontSize: 8, precision: 0 } },
    yAxis: { type: "category", data: rows.map((r) => r.gu_name.replace("-gu", "")), axisLabel: { color: ED.muted, fontSize: 8, interval: 1 }, axisLine: { show: false }, axisTick: { show: false } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...EDTIP, formatter: (p) => `${p[0].axisValue}<br/>${p[0].value} dongs` },
    series: [{ type: "bar", barWidth: "62%", data: rows.map((r) => ({ value: r.count,
      itemStyle: { color: r.gu_code === selected ? ED.amber : ED.grey, borderRadius: 2 } })) }],
  });
  return c;
}

// FIGURE 2 — Heat-sensitivity drivers (dong SHAP / gu mean SHAP / city correlation)
function figHeatDrivers(el, scope) {
  const c = edInit(el, 185);
  let rows;
  if (scope.level === "dong") rows = Atlas.signedDrivers(scope.dongCode, 8).map((r) => ({ label: r.label, v: r.value, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(3) }));
  else if (scope.level === "gu") rows = Atlas.featureImportance(scope, 8).map((r) => ({ label: r.label, v: r.signed, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(3) }));
  else rows = Atlas.rhsiCorrelations(8).map((r) => ({ label: r.label, v: r.r, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(2) }));
  rows = rows.slice().reverse();
  c.setOption({
    grid: { left: 118, right: 40, top: 6, bottom: 6 },
    xAxis: { type: "value", ...EDAXIS, axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: "category", data: rows.map((r) => r.label), axisLabel: { color: ED.muted, fontSize: 9 }, axisLine: { show: false }, axisTick: { show: false } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...EDTIP, formatter: (p) => `${p[0].axisValue}<br/>${rows[p[0].dataIndex].fmt(p[0].value)}` },
    series: [{ type: "bar", barWidth: "56%", data: rows.map((r) => ({ value: +r.v.toFixed(4), itemStyle: { color: r.v < 0 ? ED.blue : ED.rose, borderRadius: [0, 2, 2, 0] } })),
      label: { show: true, position: "right", color: ED.muted, fontSize: 8.5, formatter: (p) => rows[p.dataIndex].fmt(p.value) } }],
  });
  return c;
}

// SHAP importance uses magnitude for city/gu and signed local contributions for
// a dong. Keeping these encodings separate avoids signed-mean cancellation.
function figShapImportance(el, scope) {
  const c = edInit(el, 205);
  const local = scope.level === "dong";
  let rows = local
    ? Atlas.signedDrivers(scope.dongCode, 10).map((r) => ({ label: r.label, v: r.value }))
    : Atlas.featureImportance(scope, 10).map((r) => ({ label: r.label, v: r.importance }));
  rows = rows.slice().reverse();
  c.setOption({
    grid: { left: 124, right: 46, top: 6, bottom: 8 },
    xAxis: { type: "value", ...EDAXIS, axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: "category", data: rows.map((r) => r.label), axisLabel: { color: ED.muted, fontSize: 8.5 }, axisLine: { show: false }, axisTick: { show: false } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...EDTIP,
      formatter: (p) => `${p[0].axisValue}<br/>${local ? "SHAP" : "mean |SHAP|"}: ${p[0].value >= 0 && local ? "+" : ""}${(+p[0].value).toFixed(4)}` },
    series: [{ type: "bar", barWidth: "56%", data: rows.map((r) => ({
      value: +r.v.toFixed(5),
      itemStyle: { color: local ? (r.v < 0 ? ED.blue : ED.rose) : ED.amber, borderRadius: 2 },
    })), label: { show: true, position: "right", color: ED.muted, fontSize: 8,
      formatter: (p) => `${local && p.value >= 0 ? "+" : ""}${(+p.value).toFixed(3)}` } }],
  });
  return c;
}

// Model-dependence plot: raw feature value on x, that feature's SHAP value on y.
function figShapDependence(el, scope, key) {
  const c = edInit(el, 178);
  const pts = Atlas.shapDependence(key);
  const selected = scope.level === "dong" ? scope.dongCode : null;
  const label = URBAN_FEATURE_LABELS[key] || key;
  c.setOption({
    grid: { left: 43, right: 14, top: 12, bottom: 31 },
    xAxis: { type: "value", ...EDAXIS, name: label, nameLocation: "middle", nameGap: 21, nameTextStyle: { color: ED.muted, fontSize: 8.5 } },
    yAxis: { type: "value", ...EDAXIS, name: "SHAP", nameTextStyle: { color: ED.muted, fontSize: 8.5 } },
    tooltip: { ...EDTIP, formatter: (p) => `${p.data.name}<br/>${label}: ${(+p.data.value[0]).toFixed(3)}<br/>SHAP: ${(+p.data.value[1]).toFixed(4)}` },
    series: [{
      type: "scatter",
      data: pts.map((p) => ({ value: [p.x, p.y], name: p.dong_name, dong: p.dong_code })),
      symbolSize: (v, p) => p.data.dong === selected ? 13 : 5,
      itemStyle: {
        color: (p) => p.data.dong === selected ? ED.amber : (p.data.value[1] < 0 ? "rgba(228,92,145,0.42)" : "rgba(125,167,255,0.42)"),
        borderColor: (p) => p.data.dong === selected ? "#fff" : "transparent", borderWidth: 1,
      },
      markLine: { silent: true, symbol: "none", data: [{ yAxis: 0 }], lineStyle: { color: "rgba(255,255,255,0.18)", type: "dashed" } },
    }],
  });
  return c;
}

// Quartile view of contribution heterogeneity. A selected dong is overlaid as
// an amber point against the citywide distribution.
function figShapDistributions(el, scope) {
  const c = edInit(el, 185);
  const distScope = scope.level === "dong" ? { level: "city", guCode: null, dongCode: null } : scope;
  const rows = Atlas.shapFeatureDistributions(distScope, 6).slice().reverse();
  const rec = scope.level === "dong" ? Atlas.dongByCode.get(scope.dongCode) : null;
  const selected = rec ? rows.map((r, i) => {
    const v = rec["shap_" + r.key];
    return Number.isFinite(v) ? { value: [v, i], name: r.label } : null;
  }).filter(Boolean) : [];
  c.setOption({
    grid: { left: 124, right: 18, top: 8, bottom: 24 },
    xAxis: { type: "value", ...EDAXIS, name: "SHAP contribution", nameLocation: "middle", nameGap: 18, nameTextStyle: { color: ED.muted, fontSize: 8.5 } },
    yAxis: { type: "category", data: rows.map((r) => r.label), axisLabel: { color: ED.muted, fontSize: 8.5 }, axisLine: { show: false }, axisTick: { show: false } },
    tooltip: { trigger: "item", ...EDTIP },
    series: [
      { name: "Distribution", type: "boxplot", data: rows.map((r) => r.stats.map((v) => +v.toFixed(5))),
        itemStyle: { color: "rgba(125,167,255,0.18)", borderColor: ED.blue }, boxWidth: [7, 15] },
      { name: "Selected dong", type: "scatter", data: selected, symbolSize: 8, itemStyle: { color: ED.amber, borderColor: "#fff", borderWidth: 1 } },
    ],
  });
  return c;
}

// FIGURE 3 — Hot vs mild retail sales by group (paired bars)
function figHotVsMild(el, scope) {
  const c = edInit(el, 168);
  const g = Atlas.retailGroupHeatResponse(scope).filter((x) => x.mild != null);
  c.setOption({
    grid: { left: 42, right: 10, top: 24, bottom: 30 },
    legend: { data: ["Mild days", "Extreme-heat days"], textStyle: { color: ED.muted, fontSize: 9 }, top: 0, right: 0, itemWidth: 9, itemHeight: 9, itemGap: 10 },
    xAxis: { type: "category", data: g.map((x) => x.name.replace(" Retail", "").replace(" & ", "/")), axisLabel: { color: ED.muted, fontSize: 8, interval: 0 }, ...EDAXIS },
    yAxis: { type: "value", ...EDAXIS, axisLabel: { color: ED.muted, fontSize: 8, formatter: (v) => "₩" + (v / 1e8).toFixed(0) + "억" } },
    tooltip: { trigger: "axis", ...EDTIP, valueFormatter: (v) => fmtKRW(v) },
    series: [
      { name: "Mild days", type: "bar", data: g.map((x) => Math.round(x.mild)), itemStyle: { color: ED.blue, borderRadius: [2, 2, 0, 0] } },
      { name: "Extreme-heat days", type: "bar", data: g.map((x) => Math.round(x.hot)), itemStyle: { color: ED.amber, borderRadius: [2, 2, 0, 0] } },
    ],
  });
  return c;
}

// FIGURE 4 — Heat exposure across 2024 (temp line coloured by heat)
function figHeatExposure(el, scope) {
  const c = edInit(el, 150);
  const s = Atlas.dailySeries(scope);
  c.setOption({
    grid: { left: 30, right: 12, top: 12, bottom: 22 },
    xAxis: { type: "category", data: s.map((d) => d.date), boundaryGap: false, axisLabel: { color: ED.muted, fontSize: 8, interval: 45, formatter: (v) => v.slice(5) }, ...EDAXIS },
    yAxis: { type: "value", scale: true, ...EDAXIS, axisLabel: { color: ED.muted, fontSize: 8, formatter: (v) => v + "°" } },
    tooltip: { trigger: "axis", ...EDTIP, formatter: (p) => `${p[0].axisValue}<br/>${(+p[0].value).toFixed(1)}°C` },
    visualMap: { show: false, dimension: 1, min: 18, max: 36, inRange: { color: [ED.blue, "#9DB0C9", ED.amber, ED.rose] } },
    series: [{ type: "line", data: s.map((d) => +d.temp.toFixed(1)), smooth: true, symbol: "none", lineStyle: { width: 1.5 }, areaStyle: { color: "rgba(224,160,90,0.06)" },
      markLine: { silent: true, symbol: "none", data: [{ yAxis: 33 }], lineStyle: { color: ED.rose, type: "dashed", width: 1 }, label: { formatter: "33°C heat", color: ED.rose, fontSize: 8, position: "insideStartTop" } } }],
  });
  return c;
}

// FIGURE 5 — Industry heat response (winners / losers diverging)
function figIndustryResponse(el, scope) {
  const c = edInit(el, 198);
  const { winners, losers } = Atlas.industryRanking(scope, 5);
  const rows = [...losers].reverse().concat([...winners].reverse());
  c.setOption({
    grid: { left: 112, right: 42, top: 6, bottom: 6 },
    xAxis: { type: "value", ...EDAXIS, axisLabel: { show: false }, splitLine: { show: false } },
    yAxis: { type: "category", data: rows.map((r) => r.label), axisLabel: { color: ED.muted, fontSize: 9 }, axisLine: { show: false }, axisTick: { show: false } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...EDTIP, formatter: (p) => `${p[0].axisValue}<br/>${(p[0].value * 100).toFixed(1)}% on hot days` },
    series: [{ type: "bar", barWidth: "58%", data: rows.map((r) => ({ value: +r.sensitivity.toFixed(4), itemStyle: { color: r.sensitivity < 0 ? ED.blue : ED.rose, borderRadius: 2 } })),
      label: { show: true, position: "right", color: ED.muted, fontSize: 8.5, formatter: (p) => (p.value >= 0 ? "+" : "") + (p.value * 100).toFixed(0) + "%" } }],
  });
  return c;
}

// FIGURE — one urban feature vs RHSI (scatter, selected region highlighted)
function figFeatureVsRhsi(el, scope, key) {
  const c = edInit(el, 170);
  const pts = Atlas.featureScatter({ level: "city", guCode: null, dongCode: null }, key);
  const sel = scope.level === "dong" ? scope.dongCode : null;
  const label = (typeof URBAN_FEATURE_LABELS !== "undefined" && URBAN_FEATURE_LABELS[key]) || key;
  c.setOption({
    grid: { left: 40, right: 14, top: 12, bottom: 30 },
    xAxis: { type: "value", ...EDAXIS, name: label, nameLocation: "middle", nameGap: 20, nameTextStyle: { color: ED.muted, fontSize: 9 }, axisLabel: { color: ED.muted, fontSize: 8 } },
    yAxis: { type: "value", ...EDAXIS, name: "RHSI", nameTextStyle: { color: ED.muted, fontSize: 9 }, axisLabel: { color: ED.muted, fontSize: 8 } },
    tooltip: { ...EDTIP, formatter: (p) => `${p.data.name}<br/>${label}: ${(+p.data.value[0]).toFixed(2)}<br/>RHSI: ${(+p.data.value[1]).toFixed(3)}` },
    series: [{
      type: "scatter",
      data: pts.map((p) => ({ value: [p.x, p.y], name: p.dong_name, dong: p.dong_code })),
      symbolSize: (v, params) => (params.data.dong === sel ? 13 : 5),
      itemStyle: { color: (params) => (params.data.dong === sel ? ED.amber : "rgba(125,167,255,0.38)"), borderColor: (params) => (params.data.dong === sel ? "#fff" : "transparent"), borderWidth: 1 },
      markLine: { silent: true, symbol: "none", data: [{ yAxis: 0 }], lineStyle: { color: "rgba(255,255,255,0.15)", type: "dashed" } },
    }],
  });
  return c;
}

// FIGURE — distribution of extreme-heat days across the scope's dongs
function figHeatDayCounts(el, scope) {
  const c = edInit(el, 150);
  const vals = Atlas.dongsInScope(scope).map((d) => d.n_hot_days);
  const lo = Math.min(...Atlas.dongMetrics.map((d) => d.n_hot_days)), hi = Math.max(...Atlas.dongMetrics.map((d) => d.n_hot_days));
  const nb = 20, w = (hi - lo) / nb || 1;
  const bins = Array.from({ length: nb }, (_, i) => ({ x: lo + i * w, count: 0 }));
  vals.forEach((v) => { let i = Math.floor((v - lo) / w); if (i >= nb) i = nb - 1; if (i < 0) i = 0; bins[i].count++; });
  c.setOption({
    grid: { left: 30, right: 10, top: 12, bottom: 22 },
    xAxis: { type: "category", data: bins.map((b) => Math.round(b.x)), axisLabel: { color: ED.muted, fontSize: 8, interval: 3 }, ...EDAXIS },
    yAxis: { type: "value", ...EDAXIS },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, ...EDTIP, formatter: (p) => `${p[0].axisValue} heat-days<br/>${p[0].value} dongs` },
    series: [{ type: "bar", barCategoryGap: "18%", data: bins.map((b) => b.count), itemStyle: { color: ED.amber } }],
  });
  return c;
}

// FIGURE — composition donut (retail-group share of sales, or land-use)
function figComposition(el, scope, kind) {
  const c = edInit(el, 170);
  let rows;
  if (kind === "retail") {
    const g = Atlas.retailGroupHeatResponse(scope).filter((x) => x.mild != null);
    rows = g.map((x) => ({ name: x.name.replace(" Retail", ""), value: Math.round(x.mild) }));
  } else {
    rows = Atlas.composition(scope, "landuse").map((r) => ({ name: r.name, value: r.value }));
  }
  const pal = [ED.blue, ED.amber, "#9F8CFF", ED.green, ED.rose, ED.cyan, "#8C93A3"];
  c.setOption({
    tooltip: { ...EDTIP, formatter: (p) => `${p.name}<br/>${kind === "retail" ? fmtKRW(p.value) : p.value + "%"} (${p.percent}%)` },
    legend: { type: "scroll", orient: "vertical", right: 2, top: "center", textStyle: { color: ED.muted, fontSize: 9.5 }, itemWidth: 9, itemHeight: 9 },
    series: [{ type: "pie", radius: ["46%", "72%"], center: ["33%", "50%"], avoidLabelOverlap: true,
      itemStyle: { borderColor: "#0B0F17", borderWidth: 2 }, label: { show: false }, labelLine: { show: false },
      data: rows.map((r, i) => ({ ...r, itemStyle: { color: pal[i % pal.length] } })) }],
  });
  return c;
}

// Figure specs (kicker/title/finding/caption/render) for the current scope.
function insightsFigures(scope, datasetId) {
  const city = { level: "city", guCode: null, dongCode: null };
  const isRegion = scope.level !== "city";
  const where = isRegion ? scopeSub(scope) : "Seoul";
  const rscope = isRegion ? scope : city;
  const selectedHeightKey = (typeof map !== "undefined" && map && Atlas.metricSpec(map.heightBy))
    ? map.heightBy
    : "land_price";

  // ---- individual figure specs (reused across dataset sets) ----
  const S = {};
  S.distribution = () => {
    const dongs = Atlas.dongMetrics, pctNeg = Math.round(dongs.filter((d) => d.RHSI_retail < 0).length / dongs.length * 100);
    let f = `Across all <b>${dongs.length}</b> neighborhoods, <b>${pctNeg}%</b> have a <span class="hot">negative RHSI</span> — retail sales fall on extreme-heat days.`;
    if (isRegion) { const rv = Atlas.retailHSI(scope); f = `<b>${where}</b> sits at RHSI <b>${rv == null ? "—" : rv.toFixed(2)}</b> — ${rv < 0 ? '<span class="hot">more heat-sensitive</span>' : '<span class="cool">more resilient</span>'} than most of Seoul (amber marker).`; }
    return { title: "Most of Seoul's retail is heat-sensitive", finding: f, caption: "RHSI = log(hot-day ÷ mild-day retail sales) per dong · blue = sales fall, rose = rise.", render: (el) => figRhsiDistribution(el, scope) };
  };
  S.rhsiRanking = () => {
    const selected = scope.guCode ? Atlas.guByCode.get(scope.guCode) : null;
    return { title: "RHSI by district",
      finding: selected ? `<b>${selected.gu_name}</b> is highlighted against all 25 district RHSI averages.` : "District averages reveal where lower hot-day retail sales are most concentrated.",
      caption: "District mean RHSI only · blue = negative · rose = positive.",
      render: (el) => figRhsiDistrictRanking(el, scope) };
  };
  S.drivers = () => {
    const drv = Atlas.rhsiCorrelations(8);
    const f = isRegion ? `The urban features pushing <b>${where}</b>'s predicted RHSI up (rose) and down (blue).`
      : `<b>${drv[0].label}</b> tracks RHSI most strongly (r ${drv[0].r >= 0 ? "+" : ""}${drv[0].r.toFixed(2)}), then ${drv[1].label} and ${drv[2].label}.`;
    return { title: isRegion ? "Why this place responds to heat" : "What drives heat sensitivity", finding: f, caption: isRegion ? (scope.level === "dong" ? "Per-dong SHAP contribution to RHSI." : "Mean SHAP contribution across the district's dongs.") : "Pearson correlation of urban characteristics with RHSI, 422 dongs.", render: (el) => figHeatDrivers(el, scope) };
  };
  S.hotVsMild = () => {
    const worst = Atlas.retailGroupHeatResponse(rscope).filter((x) => x.change != null).sort((a, b) => a.change - b.change)[0];
    return { title: "Hot days cut retail sales", finding: worst ? `<span class="hot">${worst.name}</span> falls most on extreme-heat days — <b>${(worst.change * 100).toFixed(1)}%</b> below mild-day sales.` : "Mild-day vs extreme-heat-day retail sales by group.", caption: "Average daily retail sales — mild days vs extreme-heat days (apparent temp ≥ 33°C).", render: (el) => figHotVsMild(el, rscope) };
  };
  S.heatExposure = () => {
    const days = Atlas.heatDayCounts(rscope);
    return { title: "Heat exposure across 2024", finding: `${where} saw about <b>${days.hot}</b> <span class="heat">extreme-heat days</span> against <b>${days.mild}</b> mild baseline days, concentrated in mid-summer.`, caption: "Daily maximum temperature over 2024 · dashed line = 33°C heat threshold.", render: (el) => figHeatExposure(el, rscope) };
  };
  S.industry = () => {
    const rank = Atlas.industryRanking(rscope, 5), w = rank.losers[0], b = rank.winners[0];
    return { title: "Which sectors feel the heat", finding: `<span class="hot">${w.label}</span> loses the most on hot days (<b>${(w.sensitivity * 100).toFixed(0)}%</b>); <span class="cool">${b.label}</span> holds up best.`, caption: "Change in daily sales, extreme-heat vs mild days, by industry (volume-filtered).", render: (el) => figIndustryResponse(el, rscope) };
  };
  S.dayCounts = () => {
    const days = Atlas.heatDayCounts(rscope);
    return { title: "How many extreme-heat days?", finding: `Dongs averaged about <b>${days.hot}</b> <span class="heat">days ≥ 33°C</span> in 2024 — exposure varies across the city.`, caption: "Distribution of extreme-heat day counts across dongs.", render: (el) => figHeatDayCounts(el, rscope) };
  };
  S.retailComposition = () => ({ title: "What retail is here", finding: `The mix of retail sales by group — its balance shapes how sensitive the area is to heat.`, caption: "Share of mild-day retail sales by group.", render: (el) => figComposition(el, rscope, "retail") });
  S.landComposition = () => ({ title: "How the land is used", finding: `Land-use mix — commercial and green space both correlate with heat response.`, caption: "Share of land area by use (dong average).", render: (el) => figComposition(el, rscope, "landuse") });
  S.scatter = (key) => {
    const label = (typeof URBAN_FEATURE_LABELS !== "undefined" && URBAN_FEATURE_LABELS[key]) || key;
    return { title: `${label} vs heat sensitivity`, finding: `How <b>${label}</b> relates to RHSI across the 422 dongs${isRegion ? " (this place highlighted)" : ""}.`, caption: `Each point is a dong · x = ${label}, y = RHSI.`, render: (el) => figFeatureVsRhsi(el, scope, key) };
  };
  S.contextAssociations = () => {
    const top = Atlas.rhsiCorrelations(1)[0];
    return { title: "Model-input associations",
      finding: top ? `<b>${top.label}</b> has the strongest citywide linear association with RHSI (r ${top.r >= 0 ? "+" : ""}${top.r.toFixed(2)}).` : "Model-input associations with RHSI.",
      caption: "Pearson correlation across 422 dongs · raw association before SHAP attribution, not causality.",
      render: (el) => figContextAssociations(el) };
  };
  S.contextProfile = () => ({ title: "Urban feature profile",
    finding: isRegion ? `<b>${where}</b>'s baseline urban features compared with the Seoul average.` : "Citywide baseline urban features shown on a normalized 0–1 scale.",
    caption: "Min-max normalized feature values · excludes sales composition, heat-response mobility, RHSI, and SHAP.",
    render: (el) => figContextProfile(el, scope) });
  S.adminCoverage = () => ({ title: "Administrative coverage by district",
    finding: "The number of administrative dongs represented in each district.",
    caption: "Record count by gu · geometry and lookup coverage only.",
    render: (el) => figAdministrativeCoverage(el, scope) });
  S.shapImportance = () => {
    const local = scope.level === "dong";
    const top = local ? Atlas.signedDrivers(scope.dongCode, 1)[0] : Atlas.featureImportance(scope, 1)[0];
    const finding = !top ? "No SHAP explanation is available for this scope."
      : local
        ? `<b>${top.label}</b> has the largest local contribution (${top.value >= 0 ? "+" : ""}${top.value.toFixed(3)}) to the model's predicted RHSI.`
        : `<b>${top.label}</b> is the most influential model input in ${where}, ranked by mean absolute SHAP.`;
    return { title: local ? "What moves this prediction" : "Global SHAP importance", finding,
      caption: local ? "Signed local SHAP · rose raises predicted RHSI · blue lowers it." : "Mean absolute SHAP · magnitude shows model importance, not direction or causality.",
      render: (el) => figShapImportance(el, scope) };
  };
  S.shapDependence = () => {
    const local = scope.level === "dong";
    const top = local ? Atlas.signedDrivers(scope.dongCode, 1)[0] : Atlas.featureImportance(scope, 1)[0];
    const key = top ? top.key : "delta_daypop";
    const label = URBAN_FEATURE_LABELS[key] || key;
    return { title: `${label}: model response`, finding: `How the observed <b>${label}</b> value relates to its SHAP contribution across Seoul${local ? " (selected dong in amber)" : ""}.`,
      caption: "x = observed feature value · y = contribution to predicted RHSI · this is model behavior, not a causal effect.",
      render: (el) => figShapDependence(el, scope, key) };
  };
  S.shapSpread = () => {
    const distScope = scope.level === "dong" ? city : scope;
    const top = Atlas.shapFeatureDistributions(distScope, 1)[0];
    const share = top && top.positiveShare != null ? Math.round(top.positiveShare * 100) : null;
    return { title: "Contribution spread across neighborhoods",
      finding: top ? `<b>${top.label}</b> contributes positively in ${share}% of neighborhoods in this comparison scope; the box shows how strongly direction and magnitude vary.` : "Distribution of SHAP contributions.",
      caption: `Box = min, quartiles, median, max${scope.level === "dong" ? " · amber = selected dong" : ""} · variation is hidden by a signed average.`,
      render: (el) => figShapDistributions(el, scope) };
  };

  // ---- dataset-specific sets (2–3 each); whole project = the full 5 ----
  let picks;
  switch (datasetId) {
    case "shap": picks = [S.contextAssociations(), S.shapImportance(), S.shapDependence(), S.shapSpread()]; break;
    case "rhsi": picks = [S.distribution(), S.rhsiRanking()]; break;
    case "context": picks = [S.contextProfile(), S.scatter(selectedHeightKey), S.landComposition()]; break;
    case "mobility": picks = [S.scatter("delta_daypop"), S.scatter("dnpr")]; break;
    case "sales": case "sectorprofile": picks = [S.industry(), S.hotVsMild()]; break;
    case "salesfeature": picks = [S.retailComposition()]; break;
    case "weather": picks = [S.heatExposure()]; break;
    case "heatfeature": case "heatdays": picks = [S.dayCounts()]; break;
    case "dongbase": case "geometry": picks = [S.adminCoverage()]; break;
    case "atlas": picks = []; break;
    case null: picks = [S.distribution(), S.drivers(), S.hotVsMild(), S.heatExposure(), S.industry()]; break;
    default: picks = [];
  }
  return picks.map((p, i) => ({ ...p, kicker: `FIGURE ${i + 1}` }));
}
