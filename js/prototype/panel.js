// ── Panel: Layer-Set switcher + kepler-style cards (Structure / Read-as / Representation) ──
// Structure taxonomy: two families — Single (one value) and Multiple (several).
const STRUCT_FAMILY = { single: ["single", "total"], multiple: ["across", "within", "comparison"] };
const STRUCT_LABEL = { single: "Single", total: "Total", across: "Across groups", within: "Within a group", comparison: "Comparison" };
const REP_LABEL = { choropleth: "Choropleth", columns: "Columns", rings: "Rings", dominant: "Dominant", diverging: "Diverging map", "color+size": "Color + size" };
// glyph icons for the button-form controls (match the app's text-glyph nav icons)
const STRUCT_ICON = { single: "▪", total: "▣", across: "▤", within: "⊞", comparison: "⇄" };
const REP_ICON = { choropleth: "▦", columns: "▮", rings: "◎", dominant: "◧", diverging: "◐", "color+size": "⊙" };
const AGG_META = [["sum", "Σ", "Sum"], ["mean", "μ", "Mean"], ["share", "%", "Share"]];
const OP_META = [["difference", "−", "Diff"], ["ratio", "÷", "Ratio"], ["side-by-side", "◫", "Side by side"]];
// two-way compatibility: Structure ⇄ Representation
const REPS_FOR = { single: ["choropleth", "columns"], total: ["choropleth", "columns"], across: ["rings", "columns", "dominant"], within: ["rings", "columns", "dominant"], comparison: ["diverging", "color+size"] };
const STRUCTS_FOR = { choropleth: ["single", "total"], columns: ["single", "total", "across", "within"], rings: ["across", "within"], dominant: ["across", "within"], diverging: ["comparison"], "color+size": ["comparison"] };
function readAsOf(m) {
  if (!m) return "magnitude";
  if (m.op === "diff") return "change";
  if (m.source === "dongField" && /rhsi|delta_daypop|^shap_/i.test(m.field || "")) return "change";
  return "magnitude"; // (presence would be the default for sparse/point datasets — none here yet)
}

const PApp = {
  sets: null, current: "sales", expanded: new Set(),

  boot() {
    Preview.init();
    this.sets = buildAllSets();
    this.originals = JSON.parse(JSON.stringify(this.sets)); // pristine snapshot for Reset (preserves ids)
    this.saved = this._loadSaved();
    const first = this._firstLayer(this.set()); if (first) this.expanded.add(first.id);
    Preview.map.on("load", () => this.renderAll());
    this.renderAll();
  },
  set() { return this.sets[this.current]; },
  _firstLayer(set) { let f = null; PM.eachLayer(set, (L) => { if (!f) f = L; }); return f; },
  _measures(set) { return Object.values(set.measures); },
  _themes(set) { return this._measures(set).filter((m) => m.source === "salesThemes" && (m.variables || []).length === 1).sort((a, b) => a.variables[0] - b.variables[0]); },
  _singleMeasures(set) { return this._measures(set).filter((m) => (m.source === "salesThemes" && (m.variables || []).length === 1) || m.source === "dongField"); },
  _aggMeasures(set) { return this._measures(set).filter((m) => m.source === "salesThemes" && (m.variables || []).length > 1 && m.op !== "diff"); },

  renderAll() { Preview.render(this.set()); this.renderSetBar(); this.renderCards(); this.renderLegend(); },

  renderSetBar() {
    const el = document.getElementById("setbar");
    const tabs = [["sales", "Sales"], ["weather", "Weather"], ["heatxsales", "Heat × Sales"]];
    el.innerHTML = `
      <div class="ktabs">${tabs.map(([k, n]) => `<button class="ktab${this.current === k ? " on" : ""}" data-set="${k}">${n}</button>`).join("")}</div>
      <div class="ksetdesc"><b>${this.set().name}</b> · Layer Set ${this.set().datasetIds.length > 1 ? `<span>· ${this.set().datasetIds.length} datasets</span>` : ""}<br>${this.set().desc || ""}</div>`;
    el.querySelectorAll("[data-set]").forEach((n) => n.onclick = () => {
      this.current = n.dataset.set; this.expanded = new Set();
      const f = this._firstLayer(this.set()); if (f) this.expanded.add(f.id); this.renderAll();
    });
  },

  renderCards() {
    const set = this.set(), el = document.getElementById("cards");
    const opt = (v, cur, label) => `<option value="${v}"${v === cur ? " selected" : ""}>${label || v}</option>`;

    const cardBody = (L) => {
      const st = L.structure, rep = L.encoding.channel;
      const measure = PM.measureById(set, L.measureRef);
      const isMulti = st === "across" || st === "within" || st === "comparison";
      const readAs = isMulti && st !== "comparison" ? "magnitude" : readAsOf(measure);
      const repOpts = REPS_FOR[st] || ["choropleth"];
      // icon segmented buttons instead of dropdowns for the small fixed sets
      const seg = (field, items, cur) => `<div class="kseg">${items.map(([v, icon, label]) =>
        `<button class="ksegb${v === cur ? " on" : ""}" data-f="${field}" data-lid="${L.id}" data-val="${v}" title="${label || v}"><i>${icon}</i><span>${label || v}</span></button>`).join("")}</div>`;
      // Structure grouped under two families (Single / Multiple)
      const fam = (name, structs) => `<div class="kfam"><span class="kfam-l">${name}</span>${seg("struct", structs.map((s) => [s, STRUCT_ICON[s], STRUCT_LABEL[s]]), st)}</div>`;
      const structSel = `<div class="krow">Structure<div class="kfams">${fam("Single", STRUCT_FAMILY.single)}${fam("Multiple", STRUCT_FAMILY.multiple)}</div></div>`;
      const repSel = `<div class="krow">Representation${seg("rep", repOpts.map((r) => [r, REP_ICON[r], REP_LABEL[r]]), rep)}</div>`;
      const aggSel = `<div class="krow">Aggregate${seg("agg", AGG_META, (measure || {}).op)}</div>`;

      let mid = "";
      if (st === "single") {
        const opts = this._singleMeasures(set);
        mid = `<label class="krow">Variable<select data-f="measure" data-lid="${L.id}">${opts.map((m) => opt(m.id, L.measureRef, m.name)).join("")}</select></label>`;
      } else if (st === "total") {
        const opts = this._aggMeasures(set).length ? this._aggMeasures(set) : this._singleMeasures(set);
        mid = `<label class="krow">Variables<select data-f="measure" data-lid="${L.id}">${opts.map((m) => opt(m.id, L.measureRef, m.name)).join("")}</select></label>` + aggSel;
      } else if (st === "within") {
        const groups = (typeof INDUSTRY_GROUPS !== "undefined") ? Object.entries(INDUSTRY_GROUPS) : [];
        mid = `<label class="krow">Group<select data-f="grp" data-lid="${L.id}">${groups.map(([k, g]) => opt(k, L.groupKey, g.label + " (" + g.cols.length + ")")).join("")}</select></label>
          <div class="kseries">${L.series.map((s) => `<span class="kserie"><i style="background:rgb(${(s.color || [150, 150, 150]).join(",")})"></i>${s.name}</span>`).join("")}</div>` + aggSel;
      } else if (st === "across") {
        mid = `<div class="kseries">${L.series.map((s) => `<span class="kserie"><i style="background:rgb(${(s.color || [150, 150, 150]).join(",")})"></i>${s.name}</span>`).join("")}</div>` + aggSel;
      } else { // comparison
        mid = `<div class="kseries">${L.series.map((s, i) => `<span class="kserie"><i class="ab">${i ? "B" : "A"}</i>${s.name}</span>`).join("")}</div>
          <div class="krow">Operation${seg("op", OP_META, L.comparison.operation)}</div>`;
      }

      const readLabel = `<div class="kreadas">${measure ? measure.name : (isMulti && st !== "comparison" ? (st === "within" ? "group variables" : "6 themes") : "—")} · <b>${readAs}</b><span class="khelp" title="Read-as is set automatically from the variable; it is a label, not a toggle.">ⓘ</span></div>`;
      const entryNote = !L.preset ? `<div class="kentry">Started ${L.entry === "representation" ? "by representation → pick a form, the data structures it fits are offered" : "by data → pick a structure, the representations that fit are offered"}.</div>` : "";
      const blocks = L.entry === "representation" ? [repSel, structSel, mid] : [structSel, mid, repSel];

      // per-layer Appearance (kepler-style); tolerant of seeded layers missing new fields
      const e = L.encoding, out = e.outline || (e.outline = { on: true, width: 1 });
      const sizeRow = e.channel === "columns"
        ? `<label class="kaline"><span>Height</span><input type="range" class="kmini" data-f="size" data-lid="${L.id}" min="600" max="4000" step="100" value="${(e.heightRange || [0, 2600])[1]}"/></label>`
        : (e.channel === "rings" || e.channel === "color+size")
          ? `<label class="kaline"><span>Size</span><input type="range" class="kmini" data-f="size" data-lid="${L.id}" min="400" max="2500" step="50" value="${(e.radiusRange || [120, 1500])[1]}"/></label>` : "";
      // Colour control is structure-aware: one hue for Single/Total, a colour theme for
      // multiple series (Across/Within), a diverging scheme for Comparison.
      let colorRow;
      if (st === "across" || st === "within") {
        const palettes = (typeof PALETTES !== "undefined") ? PALETTES : {};
        colorRow = `<div class="krow">Color theme<div class="kschemes">${Object.entries(palettes).map(([k, p]) =>
          `<button class="kschemeb kpal${(e.paletteKey || "spectrum") === k ? " on" : ""}" data-f="paletteKey" data-lid="${L.id}" title="${p.label}">${p.colors.slice(0, 5).map((c) => `<i style="background:rgb(${c})"></i>`).join("")}</button>`).join("")}</div></div>`;
      } else if (st === "comparison") {
        const schemes = (typeof SCHEMES !== "undefined") ? SCHEMES : {};
        colorRow = `<div class="krow">Color<div class="kschemes">${Object.entries(schemes).map(([k, s]) =>
          `<button class="kschemeb${(e.scheme || "bluered") === k ? " on" : ""}" data-f="scheme" data-lid="${L.id}" title="${s.label}" style="background:linear-gradient(90deg,rgb(${s.stops[0]}),rgb(${s.stops[1]}),rgb(${s.stops[2]}))"></button>`).join("")}</div></div>`;
      } else {
        const hues = (typeof HUES !== "undefined") ? HUES : {};
        colorRow = `<div class="krow">Color<div class="kschemes">${Object.entries(hues).map(([k, h]) =>
          `<button class="kschemeb khue${(e.hue || "blue") === k ? " on" : ""}" data-f="hue" data-lid="${L.id}" title="${h.label}" style="background:rgb(${h.rgb})"></button>`).join("")}</div></div>`;
      }
      const appearance = `<details class="kapp" open><summary>Appearance</summary>
        ${colorRow}
        <div class="krow">Color scale${seg("cscale", [["linear", "／", "Linear"], ["quantize", "▚", "Quantize"], ["quantile", "▞", "Quantile"]], e.colorScale || "quantile")}</div>
        <label class="kaline"><span>Outline</span><input type="checkbox" data-f="outon" data-lid="${L.id}"${out.on ? " checked" : ""}/><input type="range" class="kmini" data-f="outw" data-lid="${L.id}" min="0" max="4" step="0.5" value="${out.width}"/></label>
        ${sizeRow}
        <label class="kaline"><span>Opacity</span><input type="range" class="kmini" data-f="opac" data-lid="${L.id}" min="0.2" max="1" step="0.05" value="${e.opacity != null ? e.opacity : 1}"/></label>
        <label class="kaline"><span>Glow</span><input type="range" class="kmini" data-f="glow" data-lid="${L.id}" min="0" max="2" step="0.1" value="${e.glow != null ? e.glow : 1}"/></label>
        <label class="kaline"><span>Label</span><input type="checkbox" data-f="label" data-lid="${L.id}"${e.label ? " checked" : ""}/></label>
      </details>`;

      return `<div class="kbody">
        ${entryNote}${blocks.join("")}
        ${readLabel}
        ${appearance}
        <details class="kadv"><summary>Advanced</summary>
          <label class="krow">Transformation<select data-f="tf" data-lid="${L.id}">${["raw", "log", "minmax", "percentile"].map((o) => opt(o, L.transformation.type, o)).join("")}</select></label>
          <label class="krow">Negative handling<select data-f="neg" data-lid="${L.id}">${["preserve", "absolute", "clip", "separate"].map((o) => opt(o, L.transformation.negativeHandling, o)).join("")}</select></label>
        </details>
      </div>`;
    };

    const card = (L) => {
      const open = this.expanded.has(L.id);
      const tag = L.preset ? `<span class="ktag-p preset">preset</span>` : `<span class="ktag-p custom">custom</span>`;
      const del = L.preset ? "" : `<button class="kdel" data-del="${L.id}" onclick="event.stopPropagation()" title="Remove">×</button>`;
      const menuBtn = `<button class="kmenu-btn" data-menu="l:${L.id}" onclick="event.stopPropagation()" title="Preset actions">⋯</button>`;
      const canReset = L.preset && !L.savedFrom;
      const menuRow = `<div class="kmenu" data-menurow="l:${L.id}" hidden>${canReset ? `<button data-reset="l:${L.id}">↺ Reset</button>` : ""}<button data-savenow="l:${L.id}">💾 Save${L.savedFrom ? "" : ""}</button><button data-saveas="l:${L.id}">⤓ Save as…</button></div>`;
      return `<div class="kcard${open ? " open" : ""}" draggable="true" data-drag="${L.id}">
        <div class="kcard-head" data-exp="${L.id}">
          <label class="keye" onclick="event.stopPropagation()"><input type="checkbox" data-f="vis" data-lid="${L.id}"${L.visible ? " checked" : ""}/></label>
          <span class="kname">${L.name}</span>
          <span class="kbadge ${STRUCT_LABEL[L.structure] ? "s-" + L.structure : ""}">${STRUCT_LABEL[L.structure] || L.kind}</span>${tag}
          ${menuBtn}${del}<span class="kcaret">${open ? "▾" : "▸"}</span>
        </div>
        ${menuRow}
        ${open ? cardBody(L) : ""}
      </div>`;
    };

    const groupBlock = (g) => `
      <div class="kgroup${g.visible === false ? " ghidden" : ""}">
        <div class="kgrp-head">
          <label class="keye" onclick="event.stopPropagation()"><input type="checkbox" data-gvis="${g.id}"${g.visible ? " checked" : ""}/></label>
          <span class="kgrp-fold">🗂</span><span class="kgrp-name">${g.name}</span>
          <span class="ktag-p ${g.preset ? "preset" : "custom"}">${g.preset ? "group preset" : "group"}</span>
          <button class="kmenu-btn" data-menu="g:${g.id}" title="Preset actions">⋯</button>
          <input class="kgrp-op" type="range" min="0.15" max="1" step="0.05" value="${g.opacity}" data-gop="${g.id}" title="Group opacity"/>
        </div>
        <div class="kmenu" data-menurow="g:${g.id}" hidden>${g.preset && !g.savedFrom ? `<button data-reset="g:${g.id}">↺ Reset</button>` : ""}<button data-savenow="g:${g.id}">💾 Save</button><button data-saveas="g:${g.id}">⤓ Save as…</button></div>
        <div class="kgrp-layers" data-dropgroup="${g.id}">
          ${g.layers.length ? g.layers.map((L) => card(L)).join("") : `<div class="kdrop">⤓ drag layers here</div>`}
          <button class="kaddlayer" data-addto="${g.id}">＋ layer</button>
        </div>
      </div>`;

    // Saved presets for the CURRENT dataset (also shown here "when the dataset is pressed").
    const saved = this._savedList();
    const savedSection = saved.length ? `<div class="ksec">Saved presets<span class="ksectag">yours</span></div>
      <div class="ksaved">${saved.map((e) => `<div class="ksaved-row">
        <span class="ksaved-ic">${e.kind === "group" ? "🗂" : "▪"}</span>
        <span class="ksaved-name">${e.name}</span><span class="ksaved-kind">${e.kind}</span>
        <button class="ksaved-add" data-savedadd="${e.id}" title="Add to map">＋</button>
        <button class="ksaved-del" data-saveddel="${e.id}" title="Delete saved">×</button></div>`).join("")}</div>` : "";

    const custom = set.ungrouped || [];
    el.innerHTML = savedSection + set.sections.map((sec) => `
      <div class="ksec">${sec.title}<span class="ksectag">Section</span></div>
      ${sec.groups.map((g) => groupBlock(g)).join("")}`).join("")
      + `<div class="ksec">Loose layers<span class="ksectag">ungrouped</span></div>`
      + `<div class="kloose" data-dropgroup="">` + (custom.length ? custom.map((L) => card(L)).join("") : `<div class="kdrop">⤓ drag a layer here to ungroup it</div>`) + `</div>`
      + `<div class="kaddrow"><button class="kadd" data-add="data">＋ By data</button><button class="kadd" data-add="representation">＋ By representation</button></div>`
      + `<button class="kadd kaddgroup" data-addgroup="1">＋ Add group (bundle for comparison)</button>`
      + `<div class="knote">A <b>Group</b> bundles layers under one 👁 / opacity. A <b>group preset</b> like "Themes by design" is an author-made comparison where <b>each variable uses its own representation</b> (columns vs choropleth). Build your own with "＋ layer" inside any group, or "＋ Add group".</div>`;

    el.querySelectorAll("[data-exp]").forEach((n) => n.onclick = () => { const id = n.dataset.exp; this.expanded.has(id) ? this.expanded.delete(id) : this.expanded.add(id); this.renderCards(); });
    el.querySelectorAll("select[data-f], input[data-f]").forEach((n) => n.onchange = (e) => { e.stopPropagation(); this._apply(n.dataset.f, n.dataset.lid, n.type === "checkbox" ? n.checked : n.value); });
    el.querySelectorAll("button[data-f]").forEach((n) => n.onclick = (e) => { e.stopPropagation(); this._apply(n.dataset.f, n.dataset.lid, n.dataset.val); });
    el.querySelectorAll("[data-del]").forEach((n) => n.onclick = (e) => { e.stopPropagation(); this._removeLayer(n.dataset.del); });
    // preset actions: ⋯ toggles the Reset / Save-as menu row
    el.querySelectorAll("[data-menu]").forEach((n) => n.onclick = (e) => { e.stopPropagation(); const row = el.querySelector(`[data-menurow="${n.dataset.menu}"]`); if (row) row.hidden = !row.hidden; });
    el.querySelectorAll("[data-reset]").forEach((n) => n.onclick = (e) => { e.stopPropagation(); const [k, id] = this._splitRef(n.dataset.reset); k === "g" ? this._resetGroup(id) : this._resetLayer(id); });
    el.querySelectorAll("[data-savenow]").forEach((n) => n.onclick = (e) => { e.stopPropagation(); const [k, id] = this._splitRef(n.dataset.savenow); this._saveNow(k, id); });
    el.querySelectorAll("[data-saveas]").forEach((n) => n.onclick = (e) => {
      e.stopPropagation(); const [k, id] = this._splitRef(n.dataset.saveas);
      const def = k === "g" ? ((this._group(id) || {}).name || "Group") : (() => { let L = null; PM.eachLayer(this.set(), (x) => { if (x.id === id) L = x; }); return L ? L.name : "Layer"; })();
      this._promptName(def, (nm) => { k === "g" ? this._saveAsGroup(id, nm) : this._saveAsLayer(id, nm); });
    });
    el.querySelectorAll("[data-savedadd]").forEach((n) => n.onclick = (e) => { e.stopPropagation(); this._addSaved(n.dataset.savedadd); });
    el.querySelectorAll("[data-saveddel]").forEach((n) => n.onclick = (e) => { e.stopPropagation(); this._deleteSaved(n.dataset.saveddel); });
    el.querySelectorAll("[data-add]").forEach((n) => n.onclick = () => this._addLayer(n.dataset.add));
    el.querySelectorAll("[data-addto]").forEach((n) => n.onclick = () => this._addLayer("data", n.dataset.addto));
    el.querySelectorAll("[data-addgroup]").forEach((n) => n.onclick = () => this._addGroup());
    el.querySelectorAll("[data-gvis]").forEach((n) => n.onchange = (e) => { e.stopPropagation(); const g = this._group(n.dataset.gvis); if (g) g.visible = n.checked; this.renderAll(); });
    el.querySelectorAll("[data-gop]").forEach((n) => n.oninput = () => { const g = this._group(n.dataset.gop); if (g) { g.opacity = +n.value; Preview.render(set); } });
    // drag a layer card into a group folder (or into "Loose layers" to ungroup)
    el.querySelectorAll("[data-drag]").forEach((n) => {
      n.ondragstart = (e) => { e.dataTransfer.setData("text/plain", n.dataset.drag); e.dataTransfer.effectAllowed = "move"; n.classList.add("dragging"); };
      n.ondragend = () => n.classList.remove("dragging");
    });
    el.querySelectorAll("[data-dropgroup]").forEach((z) => {
      z.ondragover = (e) => { e.preventDefault(); z.classList.add("dropok"); };
      z.ondragleave = () => z.classList.remove("dropok");
      z.ondrop = (e) => { e.preventDefault(); z.classList.remove("dropok"); const id = e.dataTransfer.getData("text/plain"); if (id) this._moveLayer(id, z.dataset.dropgroup || null); };
    });
  },

  // relocate a layer to a target group (or null = ungrouped/loose)
  _moveLayer(id, targetGroupId) {
    const set = this.set(); let L = null;
    set.ungrouped = (set.ungrouped || []).filter((x) => { if (x.id === id) { L = x; return false; } return true; });
    set.sections.forEach((sec) => sec.groups.forEach((g) => { g.layers = g.layers.filter((x) => { if (x.id === id) { L = x; return false; } return true; }); }));
    if (!L) return;
    const g = targetGroupId ? this._group(targetGroupId) : null;
    if (g) g.layers.push(L); else (set.ungrouped = set.ungrouped || []).push(L);
    this.renderAll();
  },

  _apply(field, layerId, val) {
    const set = this.set(); let L = null; PM.eachLayer(set, (x) => { if (x.id === layerId) L = x; });
    if (!L) return;
    switch (field) {
      case "vis": L.visible = val; break;
      case "struct": this._setStructure(L, val); break;
      case "rep": L.encoding.channel = val; if (!(STRUCTS_FOR[val] || []).includes(L.structure)) { this._setStructure(L, STRUCTS_FOR[val][0]); L.encoding.channel = val; } break;
      case "measure": L.measureRef = val; L.readAs = readAsOf(PM.measureById(set, val)); break;
      case "grp": L.groupKey = val; L.series = this._withinSeries(set, val); this._applyPalette(L); break;
      case "agg": this._setAgg(L, val); break;
      case "op": L.comparison.operation = val; break;
      case "tf": L.transformation.type = val; break;
      case "neg": L.transformation.negativeHandling = val; break;
      // per-layer appearance
      case "hue": L.encoding.hue = val; break;
      case "paletteKey": L.encoding.paletteKey = val; this._applyPalette(L); break;
      case "scheme": L.encoding.scheme = val; break;
      case "pal": L.encoding.palette = val; break;
      case "cscale": L.encoding.colorScale = val; break;
      case "outon": (L.encoding.outline = L.encoding.outline || { on: true, width: 1 }).on = val; break;
      case "outw": (L.encoding.outline = L.encoding.outline || { on: true, width: 1 }).width = +val; break;
      case "size": if (L.encoding.channel === "columns") L.encoding.heightRange = [(L.encoding.heightRange || [0])[0] || 0, +val]; else L.encoding.radiusRange = [(L.encoding.radiusRange || [120])[0] || 120, +val]; break;
      case "opac": L.encoding.opacity = +val; break;
      case "glow": L.encoding.glow = +val; break;
      case "label": L.encoding.label = val; break;
    }
    // sliders: re-render the map only, keep the card (avoid rebuilding mid-adjust)
    const sliderField = field === "outw" || field === "size" || field === "opac" || field === "glow";
    Preview.render(set); this.renderLegend();
    if (!sliderField) this.renderCards();
  },

  // Recolour a layer's series from its chosen colour theme (Across/Within).
  _applyPalette(L) {
    const key = (L.encoding && L.encoding.paletteKey) || "spectrum";
    const pal = (typeof PALETTES !== "undefined" && PALETTES[key]) || null;
    const cols = pal ? pal.colors : null;
    (L.series || []).forEach((s, i) => { s.color = cols ? cols[i % cols.length].slice() : Atlas.groupColor(i % 6); });
  },

  _setAgg(L, op) {
    const set = this.set();
    if (L.series && L.series.length) L.series.forEach((s) => { const m = PM.measureById(set, s.measureRef); if (m) m.op = op; });
    else { const m = PM.measureById(set, L.measureRef); if (m) m.op = op; }
  },

  // "Within a group" → series from one theme group's industry variables (find-or-create measures).
  _withinSeries(set, groupKey) {
    const g = (typeof INDUSTRY_GROUPS !== "undefined") ? INDUSTRY_GROUPS[groupKey] : null;
    if (!g) return [];
    const pretty = (c) => c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    return g.cols.map((col, i) => {
      let m = Object.values(set.measures).find((x) => x.source === "salesIndustry" && x.field === col);
      if (!m) { m = PM.measure({ name: pretty(col), source: "salesIndustry", op: "sum", field: col, unit: "KRW", formula: pretty(col) + " sales" }); set.measures[m.id] = m; }
      return PM.series({ name: m.name, measureRef: m.id, color: Atlas.groupColor(i % 6) });
    });
  },

  // Structure change reshapes the layer (kind / series / measure / representation).
  _setStructure(L, structure) {
    const set = this.set(), themes = this._themes(set), hasThemes = themes.length >= 2;
    if ((structure === "across" || structure === "comparison") && !hasThemes) structure = "single";
    if (structure === "within" && typeof INDUSTRY_GROUPS === "undefined") structure = "single";
    L.structure = structure;
    if (structure === "across") {
      L.kind = "composite"; L.measureRef = null;
      L.series = themes.map((m, i) => PM.series({ name: m.name, measureRef: m.id, color: Atlas.groupColor(i) }));
    } else if (structure === "within") {
      L.kind = "composite"; L.measureRef = null;
      if (!L.groupKey) L.groupKey = Object.keys(INDUSTRY_GROUPS)[0];
      L.series = this._withinSeries(set, L.groupKey);
    } else if (structure === "comparison") {
      L.kind = "composite";
      let diff = Object.values(set.measures).find((m) => m.op === "diff");
      if (!diff) { diff = PM.measure({ name: themes[0].name + " − " + themes[1].name, source: "salesThemes", op: "diff", variables: [themes[0].variables[0], themes[1].variables[0]], unit: "KRW", formula: themes[0].name + " − " + themes[1].name }); set.measures[diff.id] = diff; }
      L.measureRef = diff.id;
      L.series = [PM.series({ name: themes[0].name, measureRef: themes[0].id }), PM.series({ name: themes[1].name, measureRef: themes[1].id })];
    } else { // single | total → atomic
      L.kind = "atomic"; L.series = [];
      const isAgg = (m) => m && m.source === "salesThemes" && (m.variables || []).length > 1 && m.op !== "diff";
      const isSingle = (m) => m && ((m.source === "salesThemes" && (m.variables || []).length === 1) || m.source === "dongField");
      const cur = PM.measureById(set, L.measureRef);
      if (structure === "total") { if (!isAgg(cur)) { const a = this._aggMeasures(set)[0] || this._singleMeasures(set)[0]; if (a) L.measureRef = a.id; } }
      else { if (!isSingle(cur)) { const s = this._singleMeasures(set)[0]; if (s) L.measureRef = s.id; } }
    }
    if (structure === "across" || structure === "within") this._applyPalette(L);
    if (!(REPS_FOR[structure] || []).includes(L.encoding.channel)) L.encoding.channel = REPS_FOR[structure][0];
    L.readAs = (structure === "across" || structure === "within") ? "magnitude" : readAsOf(PM.measureById(set, L.measureRef));
  },

  _group(id) { let f = null; this.set().sections.forEach((sec) => sec.groups.forEach((g) => { if (g.id === id) f = g; })); return f; },
  _addLayer(entry, groupId) {
    const set = this.set(), m0 = this._singleMeasures(set)[0] || Object.values(set.measures)[0];
    const L = PM.layer({ name: "New layer", preset: false, entry: entry || "data", structure: "single",
      measureRef: m0 ? m0.id : null, transformation: { type: "minmax", negativeHandling: "preserve" }, encoding: { channel: "choropleth", palette: "sequential" } });
    L.readAs = readAsOf(m0);
    const g = groupId ? this._group(groupId) : null;
    if (g) g.layers.push(L); else (set.ungrouped = set.ungrouped || []).push(L);
    this.expanded.add(L.id); this.renderAll();
  },
  _removeLayer(id) {
    const set = this.set();
    set.ungrouped = (set.ungrouped || []).filter((L) => L.id !== id);
    set.sections.forEach((sec) => sec.groups.forEach((g) => { g.layers = g.layers.filter((L) => L.id !== id); }));
    this.expanded.delete(id); this.renderAll();
  },
  _addGroup() {
    const set = this.set();
    let sec = set.sections.find((s) => s._custom);
    if (!sec) { sec = PM.section({ title: "Custom groups" }); sec._custom = true; set.sections.push(sec); }
    sec.groups.push(PM.group({ name: "New group " + (sec.groups.length + 1), preset: false }));
    this.renderAll();
  },

  // ── Saved presets (library of reusable groups / layers, per dataset) ────────
  _splitRef(s) { const i = s.indexOf(":"); return [s.slice(0, i), s.slice(i + 1)]; },
  _clone(o) { return JSON.parse(JSON.stringify(o)); },
  _savedList() { return (this.saved[this.current] = this.saved[this.current] || []); },
  _loadSaved() { try { return JSON.parse(localStorage.getItem("atlas_saved_presets") || "") || {}; } catch (e) { return {}; } },
  _persistSaved() { try { localStorage.setItem("atlas_saved_presets", JSON.stringify(this.saved)); } catch (e) {} },
  // measure ids referenced by a list of layers
  _refIds(layers) { const ids = new Set(); layers.forEach((L) => { if (L.measureRef) ids.add(L.measureRef); (L.series || []).forEach((s) => s.measureRef && ids.add(s.measureRef)); }); return [...ids]; },
  _grabMeasures(set, ids) { const out = {}; ids.forEach((i) => { if (set.measures[i]) out[i] = this._clone(set.measures[i]); }); return out; },

  _findLayer(id) { let L = null; PM.eachLayer(this.set(), (x) => { if (x.id === id) L = x; }); return L; },
  _findSavedEntry(savedId) { let e = null; Object.keys(this.saved).forEach((k) => (this.saved[k] || []).forEach((x) => { if (x.id === savedId) e = x; })); return e; },
  _captureLayer(set, L, name) { return { id: PM.uid("sav"), name: name, kind: "layer", payload: this._clone(L), measures: this._grabMeasures(set, this._refIds([L])) }; },
  _captureGroup(set, g, name) { return { id: PM.uid("sav"), name: name, kind: "group", payload: this._clone(g), measures: this._grabMeasures(set, this._refIds(g.layers)) }; },

  // Save as… → always a NEW named library entry; links the live item to it.
  _saveAsLayer(id, name) {
    const set = this.set(), L = this._findLayer(id); if (!L) return;
    const e = this._captureLayer(set, L, name); this._savedList().push(e); L.savedFrom = e.id;
    this._persistSaved(); this._flash("Saved “" + name + "”"); this.renderAll();
  },
  _saveAsGroup(id, name) {
    const g = this._group(id); if (!g) return; const set = this.set();
    const e = this._captureGroup(set, g, name); this._savedList().push(e); g.savedFrom = e.id;
    this._persistSaved(); this._flash("Saved “" + name + "”"); this.renderAll();
  },
  // Save → update the linked library entry in place; if none yet, create one under the item's name.
  _saveNow(kind, id) {
    const set = this.set(), item = kind === "g" ? this._group(id) : this._findLayer(id); if (!item) return;
    let entry = item.savedFrom ? this._findSavedEntry(item.savedFrom) : null;
    if (entry) {
      const fresh = kind === "g" ? this._captureGroup(set, item, entry.name) : this._captureLayer(set, item, entry.name);
      entry.payload = fresh.payload; entry.measures = fresh.measures;
      this._persistSaved(); this._flash("Updated “" + entry.name + "”");
    } else {
      entry = kind === "g" ? this._captureGroup(set, item, item.name) : this._captureLayer(set, item, item.name);
      this._savedList().push(entry); item.savedFrom = entry.id;
      this._persistSaved(); this._flash("Saved “" + entry.name + "”");
    }
    this.renderAll();
  },
  _flash(msg) {
    const t = document.createElement("div"); t.className = "ktoast"; t.textContent = msg; document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 1600);
  },
  _deleteSaved(entryId) {
    Object.keys(this.saved).forEach((k) => { this.saved[k] = (this.saved[k] || []).filter((e) => e.id !== entryId); });
    this._persistSaved(); this.renderAll();
  },

  // re-id a saved payload + its measures with fresh uids so it's a fresh instance
  _reidClone(entry) {
    const map = {}, measures = {};
    Object.keys(entry.measures || {}).forEach((oldId) => { const nid = PM.uid("m"); map[oldId] = nid; const m = this._clone(entry.measures[oldId]); m.id = nid; measures[nid] = m; });
    const payload = this._clone(entry.payload);
    const remap = (L) => { L.id = PM.uid("L"); if (L.measureRef && map[L.measureRef]) L.measureRef = map[L.measureRef]; (L.series || []).forEach((s) => { s.id = PM.uid("s"); if (s.measureRef && map[s.measureRef]) s.measureRef = map[s.measureRef]; }); };
    if (entry.kind === "group") { payload.id = PM.uid("g"); (payload.layers || []).forEach(remap); } else remap(payload);
    return { payload, measures };
  },
  // drop a saved preset into the current set (as an editable, non-preset instance)
  _addSaved(entryId) {
    let entry = null, ds = null;
    Object.keys(this.saved).forEach((k) => (this.saved[k] || []).forEach((e) => { if (e.id === entryId) { entry = e; ds = k; } }));
    if (!entry) return;
    if (ds !== this.current) { this.current = ds; this.expanded = new Set(); }
    const set = this.set(), out = this._reidClone(entry);
    Object.assign(set.measures, out.measures);
    if (entry.kind === "group") {
      let sec = set.sections.find((s) => s._custom); if (!sec) { sec = PM.section({ title: "Custom groups" }); sec._custom = true; set.sections.push(sec); }
      out.payload.preset = false; out.payload.savedFrom = entry.id; (out.payload.layers || []).forEach((L) => (L.preset = false));
      sec.groups.push(out.payload); this.expanded.add((out.payload.layers[0] || {}).id);
    } else { out.payload.preset = false; out.payload.savedFrom = entry.id; (set.ungrouped = set.ungrouped || []).push(out.payload); this.expanded.add(out.payload.id); }
    this.renderAll();
  },

  // Reset a preset group/layer back to its seeded original (restores referenced measures too).
  _resetLayer(id) {
    const set = this.set(), orig = this.originals[this.current]; let src = null;
    PM.eachLayer(orig, (L) => { if (L.id === id) src = L; }); if (!src) return;
    this._refIds([src]).forEach((mid) => { if (orig.measures[mid]) set.measures[mid] = this._clone(orig.measures[mid]); });
    set.sections.forEach((sec) => sec.groups.forEach((g) => g.layers.forEach((L, i) => { if (L.id === id) g.layers[i] = this._clone(src); })));
    (set.ungrouped || []).forEach((L, i) => { if (L.id === id) set.ungrouped[i] = this._clone(src); });
    this.renderAll();
  },
  _resetGroup(id) {
    const set = this.set(), orig = this.originals[this.current]; let src = null;
    orig.sections.forEach((sec) => sec.groups.forEach((g) => { if (g.id === id) src = g; })); if (!src) return;
    this._refIds(src.layers).forEach((mid) => { if (orig.measures[mid]) set.measures[mid] = this._clone(orig.measures[mid]); });
    set.sections.forEach((sec) => sec.groups.forEach((g, i) => { if (g.id === id) sec.groups[i] = this._clone(src); }));
    this.renderAll();
  },

  // Name popup for Save-as (a small in-page modal, not window.prompt).
  _promptName(def, cb) {
    const ov = document.createElement("div"); ov.className = "kmodal-ov";
    ov.innerHTML = `<div class="kmodal"><div class="kmodal-t">Save preset as…</div>
      <input class="kmodal-in" type="text" value="${(def || "").replace(/"/g, "&quot;")}" />
      <div class="kmodal-btns"><button class="kmodal-cancel">Cancel</button><button class="kmodal-ok">Save</button></div></div>`;
    document.body.appendChild(ov);
    const inp = ov.querySelector(".kmodal-in"), close = () => ov.remove();
    const ok = () => { const v = inp.value.trim(); if (v) { close(); cb(v); } };
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
    ov.querySelector(".kmodal-cancel").onclick = close;
    ov.querySelector(".kmodal-ok").onclick = ok;
    inp.onkeydown = (e) => { if (e.key === "Enter") ok(); else if (e.key === "Escape") close(); };
    ov.onclick = (e) => { if (e.target === ov) close(); };
  },

  // Saved menu on the LEFT (◈ nav) — lists every saved preset across datasets.
  toggleSavedNav() {
    const ex = document.getElementById("saved-nav-pop"); if (ex) { ex.remove(); return; }
    const ov = document.createElement("div"); ov.id = "saved-nav-pop"; ov.className = "ksaved-pop";
    const all = []; Object.keys(this.saved).forEach((ds) => (this.saved[ds] || []).forEach((e) => all.push({ ds, e })));
    ov.innerHTML = `<div class="ksaved-pop-t">Saved presets</div>` + (all.length ? all.map(({ ds, e }) =>
      `<div class="ksaved-row"><span class="ksaved-ic">${e.kind === "group" ? "🗂" : "▪"}</span><span class="ksaved-name">${e.name}</span><span class="ksaved-kind">${ds} · ${e.kind}</span><button class="ksaved-add" data-navadd="${e.id}" title="Add to map">＋</button><button class="ksaved-del" data-navdel="${e.id}" title="Delete">×</button></div>`).join("")
      : `<div class="ksaved-empty">No saved presets yet.<br>Use ⋯ → “Save as…” on a group or layer.</div>`);
    document.body.appendChild(ov);
    ov.querySelectorAll("[data-navadd]").forEach((n) => n.onclick = () => { this._addSaved(n.dataset.navadd); ov.remove(); });
    ov.querySelectorAll("[data-navdel]").forEach((n) => n.onclick = () => { this._deleteSaved(n.dataset.navdel); ov.remove(); this.toggleSavedNav(); });
  },

  // ---- legend with derivation/provenance ----
  renderLegend() {
    const set = this.set(), el = document.getElementById("legend");
    const seqGrad = "linear-gradient(90deg,#7da7ff,#ffb86b,#e4524e)", divGrad = "linear-gradient(90deg,#7da7ff,#786e8c,#e4524e)";
    const rows = [];
    PM.eachLayer(set, (L, g) => {
      if (L.visible === false || (g && g.visible === false)) return;
      if (L.structure === "across" || L.structure === "within") {
        rows.push(`<div class="klg-row"><span class="klg-swatches">${L.series.map((s) => `<i class="klg-ring" style="border-color:rgb(${(s.color || [150, 150, 150]).join(",")})"></i>`).join("")}</span><span><b>${L.name}</b> — <span class="klg-f">${L.structure === "within" ? "group variables" : "themes"} ${(PM.measureById(set, (L.series[0] || {}).measureRef) || {}).op || "sum"}s</span></span></div>`);
      } else {
        const m = PM.measureById(set, L.measureRef);
        let grad;
        if (L.structure === "comparison") {
          const sc = (typeof SCHEMES !== "undefined" && SCHEMES[L.encoding.scheme]) || null;
          grad = sc ? `linear-gradient(90deg,rgb(${sc.stops[0]}),rgb(${sc.stops[1]}),rgb(${sc.stops[2]}))` : divGrad;
        } else {
          const h = (typeof HUES !== "undefined" && HUES[L.encoding.hue]) || null;
          if (h && typeof hueStops === "function") { const s = hueStops(h.rgb); grad = `linear-gradient(90deg,rgb(${s[0]}),rgb(${s[1]}),rgb(${s[2]}))`; }
          else grad = seqGrad;
        }
        rows.push(`<div class="klg-row"><span class="klg-bar" style="background:${grad}"></span><span><b>${L.name}</b>${m && m.formula ? ` — <span class="klg-f">${m.formula}</span>` : ""}${m && m.unit ? ` · ${m.unit}` : ""}</span></div>`);
      }
    });
    el.innerHTML = rows.length ? `<div class="klg-title">Legend — how each value is made</div>` + rows.join("") : "";
  },
};

async function bootPrototype() { await Atlas.load(); PApp.boot(); }
if (typeof window !== "undefined") { window.PApp = PApp; window.bootPrototype = bootPrototype; }
