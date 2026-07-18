// ── Layer-Set panel (real dashboard) ────────────────────────────────────────
// Single-active, two surfaces:
//   • FULL editor  → left map-control panel (#mc-layerset). Presets are PAGES:
//     a pager flips between Single / Total / Across / Within / Comparison (+ saved
//     presets); the active page holds Structure · Representation · Variable/Group ·
//     Appearance (colour theme) · Save/Reset. Only the active page shows on the map.
//   • COMPACT      → right rail (#layerset-panel): quick view pick + variable.
// Drives the real engine: Panels.applyRepresentation + map.unifyLayerColors /
// setSectorView / setColorScheme. Other datasets keep the classic controls.
(function () {
  const REP_ICON = { choropleth: "▦", bars: "▮", columns: "▮", rings: "◎", radial: "✳", dominant: "◧", buildingmix: "◱", points: "⊙" };
  // colour themes — keys match map.js COLOR_SCHEMES; css gradient for the swatch
  const THEMES = [
    { key: "default", label: "Amber", grad: "linear-gradient(90deg,#3a2a10,#ffc857,#ff5a28)" },
    { key: "blue", label: "Blue", grad: "linear-gradient(90deg,#0e121c,#466eb4,#7db4ff)" },
    { key: "teal", label: "Teal", grad: "linear-gradient(90deg,#0c1618,#289c8c,#50e6c8)" },
    { key: "viridis", label: "Viridis", grad: "linear-gradient(90deg,#281e46,#2da096,#f0e25c)" },
    { key: "magenta", label: "Magenta", grad: "linear-gradient(90deg,#120e18,#b43c96,#ff6ec8)" },
  ];
  // "Single" is a GROUP of variable-layers. Each layer renders on its own map
  // channel so several show at once (composite): colour / height / points.
  const CHANNELS = [
    { key: "color", label: "Color", icon: "▦", layer: "choropleth" },
    { key: "height", label: "Height", icon: "▮", layer: "columns" },
    { key: "points", label: "Points", icon: "⊙", layer: "pointCore" },
  ];

  // Built-in preset pages per dataset. supported=false → shown but greyed (real map can't render yet).
  const LS_DATASETS = {
    sales: {
      pages: [
        { key: "single", label: "Single", icon: "▪", supported: true, reps: ["choropleth"], measures: "salesGroups", hint: "One theme's heat-sensitivity, as a choropleth." },
        { key: "total", label: "Total", icon: "▣", supported: false, msg: "No total-magnitude metric on the real map yet." },
        { key: "across", label: "Across", icon: "▤", supported: true, reps: ["rings", "columns", "radial", "dominant"], measures: null, hint: "All six sales themes at once, as per-dong glyphs." },
        { key: "within", label: "Within", icon: "⊞", supported: false, msg: "Per-group view is coming to the real map." },
        { key: "comparison", label: "Compare", icon: "⇄", supported: false, msg: "A-vs-B diverging view is coming to the real map." },
      ],
    },
    rhsi: {
      pages: [
        { key: "single", label: "Single", icon: "▪", supported: true, reps: ["choropleth", "bars", "buildingmix", "points"], measures: "rhsiOnly", hint: "The retail heat-sensitivity index per dong." },
      ],
    },
  };

  const LayerSetPanel = {
    _page: {},     // active page key per dataset (built-in key or "saved:<id>")
    _appear: {},   // { dsId: { scheme } }
    _grp: {},      // { dsId: { layers: [ {id, channel, measure} ] } } — the Single group
    _saved: null,  // { dsId: [ {id,name,page,rep,measure,scheme,layers} ] }
    _uid: 0,

    isSemantic(dsId) { return !!LS_DATASETS[dsId]; },

    sync() {
      const dsId = (typeof Panels !== "undefined") ? Panels.selectedDatasetId : null;
      const semantic = this.isSemantic(dsId);
      if (this._saved === null) this._saved = this._load();

      const rail = document.getElementById("layerset-panel");
      const colorG = document.getElementById("dd-color-group");
      const heightG = document.getElementById("dd-height-group");
      const railTitle = document.getElementById("dd-title");
      if (rail) { rail.hidden = !semantic; if (!semantic) rail.innerHTML = ""; }
      if (colorG) colorG.hidden = semantic;
      if (heightG) heightG.hidden = semantic;
      if (railTitle) railTitle.textContent = semantic ? "LAYER SET" : "SELECT";

      const mcHost = document.getElementById("mc-layerset");
      const mcTitle = document.getElementById("mc-ls-title");
      const repTitle = document.getElementById("mc-rep-title");
      const repSeg = document.getElementById("mc-representation");
      const mcStage = document.getElementById("map-stage");
      if (mcStage) mcStage.classList.toggle("ls-wide", semantic); // roomier while the Layer-Set editor is up
      if (mcHost) mcHost.hidden = !semantic;
      if (mcTitle) mcTitle.hidden = !semantic;
      if (repTitle) repTitle.hidden = semantic;
      if (repSeg) repSeg.hidden = semantic;

      if (!semantic) return;
      if (!this._page[dsId]) this._page[dsId] = this._inferPage(dsId);
      if (!this._appear[dsId]) this._appear[dsId] = {
        scheme: (typeof map !== "undefined" && map && map.colorScheme) || "default",
        opacity: (typeof map !== "undefined" && map && map.opacity != null) ? map.opacity : 0.85,
        glow: (typeof map !== "undefined" && map && map.glow != null) ? map.glow : 1,
        colorScale: "quantile", outline: 1, size: 1, label: false };
      if (dsId === "sales" && !this._grp[dsId]) this._grp[dsId] = { single: { layers: [this._newLayer("color", 0)] }, across: { rep: "rings", layers: [] } };
      if (mcHost) this.renderFull(dsId, mcHost);
      if (rail) this.renderCompact(dsId, rail);
    },

    // ---- FULL paged editor (map panel) ----
    renderFull(dsId, host) {
      const cfg = LS_DATASETS[dsId];
      const saved = this._savedFor(dsId);
      const activeKey = this._page[dsId];
      const active = this._pageByKey(dsId, activeKey);

      // pager: built-in pages + saved presets
      const tabs = cfg.pages.map((p) =>
        `<button class="ls-tab${activeKey === p.key ? " on" : ""}${p.supported ? "" : " ls-dis"}" data-ls-page="${p.key}"${p.supported ? "" : ` title="${p.msg}"`}>${p.label}</button>`).join("")
        + saved.map((s) =>
          `<button class="ls-tab ls-tab-saved${activeKey === "saved:" + s.id ? " on" : ""}" data-ls-page="saved:${s.id}" title="Saved preset">${s.name}<span class="ls-tabx" data-ls-delsaved="${s.id}">×</span></button>`).join("");
      const pager = `<div class="ls-pager">${tabs}</div>`;

      let body;
      if (active && active.supported === false) {
        body = `<div class="ls-hint ls-hint-warn">${active.msg}</div>`;
      } else {
        const rep = (typeof Panels !== "undefined") ? Panels.selectedRep : null;
        const measures = this._measures(active.measures);
        const scheme = this._appear[dsId].scheme;
        const isSingle = dsId === "sales" && active.key === "single";
        const isAcross = dsId === "sales" && active.key === "across";
        const isGroup = isSingle || isAcross;
        let mainRows;
        if (isSingle) {
          mainRows = this._groupEditorHTML(dsId, "single", "Layers · one variable each");
        } else if (isAcross) {
          mainRows = this._acrossEditorHTML(dsId);
        } else {
          const repRow = (active.reps && active.reps.length)
            ? `<div class="ls-row-l">Representation</div><div class="ls-seg ls-seg-wrap">${active.reps.map((r) =>
                `<button class="ls-b${r === rep ? " on" : ""}" data-ls-rep="${r}"><i>${REP_ICON[r] || "▦"}</i><span>${this._repLabel(r)}</span></button>`).join("")}</div>` : "";
          const varRow = (active.key === "single" && measures.length > 1)
            ? `<div class="ls-row-l">Variable</div>${this._measureSelect(measures, (typeof map !== "undefined" && map) ? map.colorBy : null)}` : "";
          mainRows = repRow + varRow;
        }
        const saveLabel = activeKey.indexOf("saved:") === 0 ? "Update" : "Save as…";
        const isSaved = activeKey.indexOf("saved:") === 0;
        const actions = `<div class="ls-actions"><button class="ls-act" data-ls-save>${saveLabel}</button><button class="ls-act" data-ls-reset>Reset</button></div>`;
        const nAcross = isAcross ? this._grp[dsId].across.layers.length : 0;
        const gnote = isSingle ? "group of " + this._grp[dsId].single.layers.length
          : isAcross ? "glyph + " + nAcross + " layer" + (nAcross === 1 ? "" : "s") : "";
        // #1 section chrome + badges
        const head = `<span class="ls-badge s-${active.key}"><i>${active.icon || "▪"}</i>${active.label}</span>` +
          (gnote ? `<span class="ls-gnote">${gnote}</span>` : "") +
          `<span class="ls-headsp"></span><span class="ls-tag ${isSaved ? "custom" : "preset"}">${isSaved ? "saved" : "preset"}</span>`;
        const readas = this._readAsHTML(dsId, active);
        const appearance = this._appearanceHTML(dsId);   // #3
        body = `<div class="ls-card-head">${head}</div>
          <div class="ls-card-body">${mainRows}${readas}${appearance}${actions}${(!isGroup && active.hint) ? `<div class="ls-hint">${active.hint}</div>` : ""}</div>`;
      }

      host.innerHTML = `<div class="ls-inner">${pager}<div class="ls-card">${body}</div></div>`;
      this._wireFull(host, dsId);
    },

    _wireFull(host, dsId) {
      host.querySelectorAll("[data-ls-page]").forEach((b) => b.onclick = (e) => {
        if (e.target.dataset.lsDelsaved) return; // handled below
        this._selectPage(dsId, b.dataset.lsPage);
      });
      host.querySelectorAll("[data-ls-delsaved]").forEach((x) => x.onclick = (e) => { e.stopPropagation(); this._deleteSaved(dsId, x.dataset.lsDelsaved); });
      host.querySelectorAll("[data-ls-rep]").forEach((b) => b.onclick = () => this._applyPage(dsId, b.dataset.lsRep));
      const sel = host.querySelector("[data-ls-measure]");
      if (sel) sel.onchange = () => this._applyMeasure(dsId, sel.value);
      // group layer controls (Single + Across)
      host.querySelectorAll("[data-ls-glyph]").forEach((b) => b.onclick = () => this._setGlyph(dsId, b.dataset.lsGlyph));
      host.querySelectorAll("[data-ls-lchan]").forEach((b) => b.onclick = () => this._setLayerField(dsId, b.dataset.lsLchan, "channel", b.dataset.ch));
      host.querySelectorAll("[data-ls-lvar]").forEach((s) => s.onchange = () => this._setLayerField(dsId, s.dataset.lsLvar, "measure", s.value));
      host.querySelectorAll("[data-ls-ldel]").forEach((b) => b.onclick = () => this._removeLayer(dsId, b.dataset.lsLdel));
      const addL = host.querySelector("[data-ls-addlayer]"); if (addL) addL.onclick = () => this._addLayer(dsId);
      host.querySelectorAll("[data-ls-theme]").forEach((b) => b.onclick = () => this._applyTheme(dsId, b.dataset.lsTheme));
      // #3 appearance controls
      host.querySelectorAll("[data-ls-ap]").forEach((inp) => {
        const handler = () => this._setAppear(dsId, inp.dataset.lsAp, inp.type === "checkbox" ? inp.checked : inp.value, inp.type === "range");
        if (inp.type === "range") inp.oninput = handler; else inp.onchange = handler;
      });
      host.querySelectorAll("[data-ls-scale]").forEach((b) => b.onclick = () => this._setAppear(dsId, "colorScale", b.dataset.lsScale, false));
      const save = host.querySelector("[data-ls-save]"); if (save) save.onclick = () => this._save(dsId);
      const reset = host.querySelector("[data-ls-reset]"); if (reset) reset.onclick = () => this._reset(dsId);
    },

    // ---- COMPACT (right rail): pick a PRESET (Single / Total / … + saved) + variable ----
    renderCompact(dsId, host) {
      const cfg = LS_DATASETS[dsId];
      const activeKey = this._page[dsId];
      const active = this._pageByKey(dsId, activeKey);
      const builtins = cfg.pages.map((p) =>
        `<button class="ls-b${activeKey === p.key ? " on" : ""}${p.supported ? "" : " ls-dis"}" data-ls-page="${p.key}"${p.supported ? "" : ` title="${p.msg}"`}><i>${p.icon}</i><span>${p.label}</span></button>`).join("");
      const saved = this._savedFor(dsId).map((s) =>
        `<button class="ls-b${activeKey === "saved:" + s.id ? " on" : ""}" data-ls-page="saved:${s.id}" title="Saved preset"><i>★</i><span>${s.name}</span></button>`).join("");
      const presetHTML = `<div class="ls-row-l">Preset</div><div class="ls-seg ls-seg-wrap">${builtins}${saved}</div>`;

      let measHTML = "";
      const measures = this._measures(active && active.measures);
      if (active && active.key === "single" && measures.length > 1) measHTML = `<div class="ls-row-l">${dsId === "sales" ? "Group" : "Variable"}</div>${this._measureSelect(measures, (typeof map !== "undefined" && map) ? map.colorBy : null)}`;

      host.innerHTML = `<div class="ls-inner">${presetHTML}${measHTML}</div>`;
      host.querySelectorAll("[data-ls-page]").forEach((b) => b.onclick = () => this._selectPage(dsId, b.dataset.lsPage));
      const sel = host.querySelector("[data-ls-measure]");
      if (sel) sel.onchange = () => this._applyMeasure(dsId, sel.value);
    },

    // ---- Single = group of variable-layers (composite) ----
    _newLayer(channel, measureIdx) {
      const m = this._measures("salesGroups");
      return { id: "L" + (++this._uid), channel: channel || "color", measure: (m[measureIdx] || m[0]).key };
    },
    _curPage(dsId) { const p = this._pageByKey(dsId, this._page[dsId]); return p ? p.key : "single"; },
    _grpOf(dsId, pageKey) { return this._grp[dsId][pageKey || this._curPage(dsId)]; },
    // list of variable-layer rows (shared by Single + Across "extra layers")
    _layerRowsHTML(grp, minLayers) {
      const measures = this._measures("salesGroups");
      return grp.layers.map((L) => `<div class="ls-layer">
        <div class="ls-seg ls-lchan">${CHANNELS.map((c) => `<button class="ls-b2${L.channel === c.key ? " on" : ""}" data-ls-lchan="${L.id}" data-ch="${c.key}" title="${c.label}"><i>${c.icon}</i></button>`).join("")}</div>
        <select class="ls-select ls-lvar" data-ls-lvar="${L.id}">${measures.map((m) => `<option value="${m.key}"${m.key === L.measure ? " selected" : ""}>${m.label}</option>`).join("")}</select>
        <button class="ls-lx" data-ls-ldel="${L.id}"${grp.layers.length <= minLayers ? " disabled" : ""} title="Remove layer">×</button></div>`).join("");
    },
    _groupEditorHTML(dsId, pageKey, label) {
      const grp = this._grpOf(dsId, pageKey);
      return `<div class="ls-row-l">${label}</div><div class="ls-layers">${this._layerRowsHTML(grp, 1)}<button class="ls-addlayer" data-ls-addlayer>＋ Add variable layer</button></div>`;
    },
    _acrossEditorHTML(dsId) {
      const g = this._grp[dsId].across, rep = g.rep;
      const glyphs = ["rings", "columns", "radial", "dominant"];
      const glyphRow = `<div class="ls-row-l">Six-theme glyph</div><div class="ls-seg ls-seg-wrap">${glyphs.map((r) =>
        `<button class="ls-b${r === rep ? " on" : ""}" data-ls-glyph="${r}"><i>${REP_ICON[r] || "◎"}</i><span>${this._repLabel(r)}</span></button>`).join("")}</div>`;
      const extra = `<div class="ls-row-l">Extra variable layers</div><div class="ls-layers">${this._layerRowsHTML(g, 0)}<button class="ls-addlayer" data-ls-addlayer>＋ Add variable layer</button></div>`;
      return glyphRow + extra;
    },
    _setGlyph(dsId, rep) { this._grp[dsId].across.rep = rep; this._applyActive(dsId); },
    _setLayerField(dsId, layerId, field, val) {
      const grp = this._grpOf(dsId); const L = (grp.layers || []).find((x) => x.id === layerId); if (!L) return;
      L[field] = val; this._applyActive(dsId);
    },
    _addLayer(dsId) {
      const grp = this._grpOf(dsId), used = grp.layers.map((L) => L.measure);
      const measures = this._measures("salesGroups");
      const nextIdx = Math.max(0, measures.findIndex((m) => used.indexOf(m.key) === -1));
      const nextChan = CHANNELS[Math.min(grp.layers.length, CHANNELS.length - 1)].key;
      grp.layers.push(this._newLayer(nextChan, nextIdx < 0 ? 0 : nextIdx));
      this._applyActive(dsId);
    },
    _removeLayer(dsId, layerId) {
      const grp = this._grpOf(dsId), min = this._curPage(dsId) === "single" ? 1 : 0;
      if (grp.layers.length <= min) return;
      grp.layers = grp.layers.filter((L) => L.id !== layerId);
      this._applyActive(dsId);
    },
    // Set each variable-layer's per-layer var on its channel; returns the enabled channels.
    _compositeLayers(layers) {
      const on = {}; let firstColor = null;
      (layers || []).forEach((L) => {
        if (!L.measure || (typeof Atlas !== "undefined" && !Atlas.metricSpec(L.measure))) return;
        if (L.channel === "color") { on.choropleth = true; map.layerVar.choropleth = L.measure; if (!firstColor) firstColor = L.measure; }
        else if (L.channel === "height") { on.columns = true; map.layerVar.columns = L.measure; map.layerHeightVar.columns = L.measure; }
        else if (L.channel === "points") { on.pointCore = true; on.pointHalo = true; map.layerVar.pointCore = L.measure; map.layerVar.pointHalo = L.measure; }
      });
      return { on: on, firstColor: firstColor };
    },
    _applyActive(dsId) { if (this._curPage(dsId) === "across") this._applyAcross(dsId); else this._applySingle(dsId); },
    // Single = variable-layers composited on data channels (no sector glyph).
    _applySingle(dsId) {
      if (typeof Panels === "undefined" || typeof map === "undefined" || !map) { this.sync(); return; }
      Panels.applyRepresentation("sales", "choropleth");
      if (typeof exitTimeMode === "function") exitTimeMode();
      map.layerVar = {}; map.layerHeightVar = {};
      const c = this._compositeLayers(this._grp[dsId].single.layers);
      c.on.boundary = true; c.on.roads = true;
      Object.keys(map.layers).forEach((k) => { map.layers[k] = !!c.on[k]; });
      if (c.firstColor) map.colorBy = c.firstColor;
      this._applyAppearance(dsId);
      if (typeof Panels !== "undefined") Panels.selectedRep = "single";
      map.render(); this._afterApply();
    },
    // Across = the six-theme sector glyph + optional variable-layers composited on top.
    _applyAcross(dsId) {
      if (typeof Panels === "undefined" || typeof map === "undefined" || !map) { this.sync(); return; }
      const g = this._grp[dsId].across;
      Panels.applyRepresentation("sales", g.rep);   // sets sectorView + base allow-list
      map.layerVar = {}; map.layerHeightVar = {};
      const c = this._compositeLayers(g.layers);
      map.layers.boundary = true;
      Object.keys(c.on).forEach((k) => { map.layers[k] = true; });   // add data layers over the glyph
      if (c.firstColor) map.colorBy = c.firstColor;
      this._applyAppearance(dsId);
      map.render(); this._afterApply();
    },
    _afterApply() {
      if (typeof syncLayerChecks === "function") syncLayerChecks();
      if (typeof updateLegend === "function") updateLegend();
      this.sync();
    },
    // scheme + opacity + glow are the appearance controls the real map honors today
    _applyAppearance(dsId) {
      const a = this._appear[dsId]; if (!a || typeof map === "undefined" || !map) return;
      if (typeof map.setColorScheme === "function") map.setColorScheme(a.scheme);
      if (a.opacity != null) map.opacity = +a.opacity;
      if (a.glow != null) map.glow = +a.glow;
    },
    _setAppear(dsId, field, val, isSliderLive) {
      const a = this._appear[dsId]; if (!a) return;
      a[field] = field === "label" ? !!val : (field === "colorScale" ? val : +val);
      if (typeof map !== "undefined" && map) {
        if (field === "opacity") { map.opacity = +val; if (map.render) map.render(); }
        else if (field === "glow") { map.glow = +val; if (map.render) map.render(); }
        // outline / size / label / colorScale are stored only (real map can't drive them yet)
      }
      if (!isSliderLive) this.sync();   // reflect discrete changes (theme/scale/label); skip during slider drag
    },
    // #1 read-as label — inferred from the variable (magnitude vs change), not a toggle
    _readAsHTML(dsId, active) {
      let label = "value", readAs = "magnitude";
      if (active.key === "across") { label = "six themes"; readAs = "magnitude"; }
      else {
        const key = (typeof map !== "undefined" && map) ? map.colorBy : null;
        const spec = (typeof Atlas !== "undefined" && Atlas.metricSpec) ? Atlas.metricSpec(key) : null;
        const m = this._measures(active.measures).find((x) => x.key === key);
        label = m ? m.label : (active.label + " value");
        readAs = spec && spec.signed ? "change" : "magnitude";
      }
      return `<div class="ls-readas">${label} · <b>${readAs}</b> <span class="ls-i" title="Read-as is inferred from the variable — a label, not a toggle.">&#9432;</span></div>`;
    },
    // #3 appearance section — working (color theme/opacity/glow) + inert "coming" (color scale/outline/size/label)
    _appearanceHTML(dsId) {
      const a = this._appear[dsId];
      const themes = THEMES.map((t) => `<button class="ls-sw${a.scheme === t.key ? " on" : ""}" data-ls-theme="${t.key}" title="${t.label}" style="background:${t.grad}"></button>`).join("");
      const scales = ["linear", "quantize", "quantile"].map((s) => `<button class="ls-b3${a.colorScale === s ? " on" : ""}" data-ls-scale="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</button>`).join("");
      return `<div class="ls-row-l">Appearance</div><div class="ls-app">
        <div class="ls-arow"><span>Color theme</span><div class="ls-swrow">${themes}</div></div>
        <label class="ls-arow"><span>Opacity</span><input type="range" class="ls-mini" data-ls-ap="opacity" min="0.2" max="1" step="0.05" value="${a.opacity}"></label>
        <label class="ls-arow"><span>Glow</span><input type="range" class="ls-mini" data-ls-ap="glow" min="0" max="2" step="0.1" value="${a.glow}"></label>
        <div class="ls-arow ls-dim"><span>Color scale</span><div class="ls-seg ls-scaleseg">${scales}</div><span class="ls-coming">coming</span></div>
        <label class="ls-arow ls-dim"><span>Outline</span><input type="range" class="ls-mini" data-ls-ap="outline" min="0" max="4" step="0.5" value="${a.outline}"><span class="ls-coming">coming</span></label>
        <label class="ls-arow ls-dim"><span>Size</span><input type="range" class="ls-mini" data-ls-ap="size" min="0.5" max="3" step="0.1" value="${a.size}"><span class="ls-coming">coming</span></label>
        <label class="ls-arow ls-dim"><span>Label</span><span class="ls-apsp"></span><input type="checkbox" data-ls-ap="label"${a.label ? " checked" : ""}><span class="ls-coming">coming</span></label>
      </div>`;
    },

    // ---- helpers ----
    _repLabel(r) { return (typeof REP_TYPES !== "undefined" && REP_TYPES[r] && REP_TYPES[r].label) || r; },
    _measureSelect(measures, cur) {
      const has = measures.some((m) => m.key === cur);
      return `<select class="ls-select" data-ls-measure>${has ? "" : `<option value="" selected hidden>— pick a variable —</option>`}${measures.map((m) =>
        `<option value="${m.key}"${m.key === cur ? " selected" : ""}>${m.label}</option>`).join("")}</select>`;
    },
    _measures(kind) {
      if (kind === "salesGroups") { const S = (typeof SALES_GROUPS !== "undefined") ? SALES_GROUPS : {}; return Object.keys(S).map((k) => ({ key: "grp_" + k, label: S[k].title })); }
      if (kind === "rhsiOnly") { return [{ key: "RHSI_retail", label: "RHSI (heat sensitivity)" }]; }
      return [];
    },
    _validMeasure(key, kind) { return this._measures(kind).some((m) => m.key === key) ? key : null; },
    _builtin(dsId, key) { return LS_DATASETS[dsId].pages.find((p) => p.key === key); },
    _savedFor(dsId) { return (this._saved && this._saved[dsId]) || []; },
    _savedById(dsId, id) { return this._savedFor(dsId).find((s) => s.id === id); },
    // resolve a page key (built-in or "saved:<id>") → a page-like object
    _pageByKey(dsId, key) {
      if (key && key.indexOf("saved:") === 0) {
        const s = this._savedById(dsId, key.slice(6)); if (!s) return this._builtin(dsId, "single");
        const base = this._builtin(dsId, s.page) || {};
        return { key: s.page, label: s.name, icon: "★", supported: base.supported !== false, reps: base.reps, measures: base.measures, hint: base.hint, _saved: s };
      }
      return this._builtin(dsId, key);
    },
    _inferPage(dsId) {
      const sv = (typeof map !== "undefined" && map) ? map.sectorView : null;
      if (dsId === "sales" && ["rings", "columns", "radial", "dominant"].includes(sv)) return "across";
      return "single";
    },

    // ---- engine actions ----
    _selectPage(dsId, key) {
      const page = this._pageByKey(dsId, key);
      if (!page) return;
      this._page[dsId] = key;
      if (page.supported === false) { this.sync(); return; }
      if (page._saved) {   // apply a full saved preset
        const s = page._saved;
        if (s.appear) this._appear[dsId] = Object.assign(this._appear[dsId] || {}, s.appear);
        else if (s.scheme) this._appear[dsId].scheme = s.scheme;
        if (dsId === "sales" && page.key === "single") {
          this._grp[dsId].single = { layers: (s.layers && s.layers.length) ? s.layers.map((L) => this._cloneLayer(L)) : [this._newLayer("color", 0)] };
          this._applyActive(dsId); return;
        }
        if (dsId === "sales" && page.key === "across") {
          this._grp[dsId].across = { rep: s.rep || "rings", layers: (s.layers || []).map((L) => this._cloneLayer(L)) };
          this._applyActive(dsId); return;
        }
        this._applyPage(dsId, s.rep, s.measure);
        return;
      }
      if (dsId === "sales" && (page.key === "single" || page.key === "across")) { this._applyActive(dsId); return; }
      this._applyPage(dsId, (page.reps && page.reps[0]) || null);
    },
    _cloneLayer(L) { return { id: "L" + (++this._uid), channel: L.channel || "color", measure: L.measure }; },
    _applyPage(dsId, rep, measure) {
      if (typeof Panels === "undefined" || typeof map === "undefined" || !map) { this.sync(); return; }
      const page = this._pageByKey(dsId, this._page[dsId]);
      this._applyAppearance(dsId);
      if (page.key === "across") {
        Panels.applyRepresentation(dsId, rep);
      } else if (dsId === "sales") { // single
        Panels.applyRepresentation("sales", "choropleth");
        if (typeof exitTimeMode === "function") exitTimeMode();
        const meas = measure || this._validMeasure(map.colorBy, "salesGroups") || this._measures("salesGroups")[0].key;
        map.unifyLayerColors(meas);
      } else { // rhsi single
        Panels.applyRepresentation("rhsi", rep || "choropleth");
        map.unifyLayerColors(measure || "RHSI_retail");
      }
      if (typeof updateLegend === "function") updateLegend();
      this.sync();
    },
    _applyMeasure(dsId, key) {
      if (typeof map === "undefined" || !map || !key) return;
      if (typeof exitTimeMode === "function") exitTimeMode();
      map.unifyLayerColors(key);
      if (typeof updateLegend === "function") updateLegend();
      this.sync();
    },
    _applyTheme(dsId, scheme) {
      this._appear[dsId].scheme = scheme;
      if (typeof map !== "undefined" && map && typeof map.setColorScheme === "function") map.setColorScheme(scheme);
      if (typeof updateLegend === "function") updateLegend();
      this.sync();
    },

    // ---- Save / Reset preset library ----
    _snapshot(dsId) {
      const page = this._pageByKey(dsId, this._page[dsId]);
      const snap = { page: page.key, rep: (typeof Panels !== "undefined") ? Panels.selectedRep : null,
        measure: (typeof map !== "undefined" && map) ? map.colorBy : null, scheme: this._appear[dsId].scheme,
        appear: Object.assign({}, this._appear[dsId]) };
      if (dsId === "sales" && page.key === "single") snap.layers = (this._grp[dsId].single.layers || []).map((L) => ({ channel: L.channel, measure: L.measure }));
      if (dsId === "sales" && page.key === "across") { snap.rep = this._grp[dsId].across.rep; snap.layers = (this._grp[dsId].across.layers || []).map((L) => ({ channel: L.channel, measure: L.measure })); }
      return snap;
    },
    _save(dsId) {
      const activeKey = this._page[dsId];
      if (activeKey.indexOf("saved:") === 0) {   // Update the active saved preset in place
        const s = this._savedById(dsId, activeKey.slice(6)); if (!s) return;
        Object.assign(s, this._snapshot(dsId)); this._persist(); this._flash("Updated “" + s.name + "”"); this.sync(); return;
      }
      this._promptName("", (name) => {          // Save as… a new preset
        const snap = this._snapshot(dsId);
        const entry = Object.assign({ id: "p" + Date.now().toString(36), name: name }, snap);
        (this._saved[dsId] = this._saved[dsId] || []).push(entry);
        this._page[dsId] = "saved:" + entry.id;
        this._persist(); this._flash("Saved “" + name + "”"); this.sync();
      });
    },
    _reset(dsId) {
      const activeKey = this._page[dsId];
      this._appear[dsId] = { scheme: "default", opacity: 0.85, glow: 1, colorScale: "quantile", outline: 1, size: 1, label: false };
      if (activeKey.indexOf("saved:") === 0) {   // revert edits to the saved preset's stored config
        const s = this._savedById(dsId, activeKey.slice(6));
        if (s) { if (s.appear) this._appear[dsId] = Object.assign(this._appear[dsId], s.appear); else if (s.scheme) this._appear[dsId].scheme = s.scheme; this._selectPage(dsId, activeKey); return; }
      }
      const page = this._builtin(dsId, activeKey) || this._builtin(dsId, "single");
      if (dsId === "sales" && page.key === "single") { this._grp[dsId].single = { layers: [this._newLayer("color", 0)] }; this._applyActive(dsId); return; }
      if (dsId === "sales" && page.key === "across") { this._grp[dsId].across = { rep: "rings", layers: [] }; this._applyActive(dsId); return; }
      this._applyPage(dsId, (page.reps && page.reps[0]) || null);
    },
    _deleteSaved(dsId, id) {
      this._saved[dsId] = this._savedFor(dsId).filter((s) => s.id !== id);
      if (this._page[dsId] === "saved:" + id) this._page[dsId] = "single";
      this._persist(); this.sync();
    },
    _load() { try { return JSON.parse(localStorage.getItem("atlas_ls_presets") || "") || {}; } catch (e) { return {}; } },
    _persist() { try { localStorage.setItem("atlas_ls_presets", JSON.stringify(this._saved)); } catch (e) {} },

    _promptName(def, cb) {
      const ov = document.createElement("div"); ov.className = "ls-modal-ov";
      ov.innerHTML = `<div class="ls-modal"><div class="ls-modal-t">Save preset as…</div>
        <input class="ls-modal-in" type="text" value="${(def || "").replace(/"/g, "&quot;")}" placeholder="Preset name"/>
        <div class="ls-modal-btns"><button class="ls-modal-cancel">Cancel</button><button class="ls-modal-ok">Save</button></div></div>`;
      document.body.appendChild(ov);
      const inp = ov.querySelector(".ls-modal-in"), close = () => ov.remove();
      const ok = () => { const v = inp.value.trim(); if (v) { close(); cb(v); } };
      setTimeout(() => { inp.focus(); }, 0);
      ov.querySelector(".ls-modal-cancel").onclick = close;
      ov.querySelector(".ls-modal-ok").onclick = ok;
      inp.onkeydown = (e) => { if (e.key === "Enter") ok(); else if (e.key === "Escape") close(); };
      ov.onclick = (e) => { if (e.target === ov) close(); };
    },
    _flash(msg) {
      const t = document.createElement("div"); t.className = "ls-toast"; t.textContent = msg; document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add("show"));
      setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 1500);
    },
  };

  window.LayerSetPanel = LayerSetPanel;
})();
