// ── Semantic Layer-Set model (prototype) ────────────────────────────────────
// Plain JSON-serializable config objects that sit ABOVE the deck.gl engine:
//   LayerSet → Section → LayerGroup → Atomic/Composite Layer → Series
// plus reusable DerivedMeasure. No production files are touched — this is a
// parallel prototype that only READS the shared `Atlas` data.
//
// Pipeline the objects encode:  Select data → Define measure → Transform →
// Compare → Encode.  (Per the proposed architecture.)

const PM = {
  _id: 0,
  uid(p) { return (p || "id") + "_" + (++this._id); },

  // ---- factories (each returns a plain object) ----
  measure(o) {
    // source: "salesThemes" (variables = theme indices 0..5) | "dongField" (field = a dong-metric column)
    // formula = human provenance shown in the legend ("sum of 6 themes", "log(hot ÷ mild)"…)
    return Object.assign({ id: PM.uid("m"), name: "Measure", source: "salesThemes", op: "sum", variables: [], field: null, unit: "", formula: "", missingRule: "ignore" }, o);
  },
  series(o) {
    return Object.assign({ id: PM.uid("s"), name: "Series", measureRef: null, encodingChannel: "radius", color: null }, o);
  },
  layer(o) {
    o = o || {};
    // encoding.channel = REPRESENTATION form; the rest is per-layer APPEARANCE (kepler-style).
    // Merge defaults so a layer that overrides `encoding` still gets every appearance field.
    const encDefault = { channel: "choropleth", hue: "blue", paletteKey: "spectrum", scheme: "bluered", palette: "sequential", colorScale: "quantile",
      outline: { on: true, width: 1 }, opacity: 1, glow: 1, label: false, radiusRange: [200, 1400], heightRange: [0, 2600] };
    const encoding = Object.assign(encDefault, o.encoding || {});
    return Object.assign({
      id: PM.uid("L"), name: "Layer", kind: "atomic", preset: false, // "atomic" | "composite"; preset = author-configured showcase layer
      binding: { datasetId: "sales", spatialField: "dong_code", temporalField: null, timeRange: null },
      structure: "single",     // single | total | across | within | comparison   (Single/Multiple families)
      groupKey: null,          // for structure "within": which theme group's variables to show
      readAs: "magnitude",     // magnitude | presence | change   (auto label, not a toggle)
      entry: "data",           // how the layer was started: "data" | "representation"
      measureRef: null, series: [],
      transformation: { type: "raw", scaleDomain: "auto", negativeHandling: "preserve" }, // raw|log|minmax|percentile
      comparison: { target: "none", operation: "difference", arrangement: "overlay" },
      interaction: { tooltip: true, highlight: true },
      visible: true,
    }, o, { encoding: encoding });
  },
  group(o) {
    // preset = an author-configured bundle of layers (e.g. a mixed-visual comparison)
    return Object.assign({ id: PM.uid("g"), name: "Group", preset: false, visible: true, opacity: 1, layers: [] }, o);
  },
  section(o) {
    return Object.assign({ id: PM.uid("sec"), title: "Section", collapsed: false, groups: [] }, o);
  },
  layerSet(o) {
    return Object.assign({
      id: PM.uid("set"), name: "Layer Set", datasetIds: ["sales"],
      setControls: { targetArea: "seoul" }, measures: {}, sections: [], ungrouped: [],
    }, o);
  },

  // ---- traversal ----
  eachLayer(set, fn) {
    set.sections.forEach((sec) => sec.groups.forEach((g) => g.layers.forEach((L) => fn(L, g, sec))));
    (set.ungrouped || []).forEach((L) => fn(L, null, null));
  },
  measureById(set, id) { return set.measures[id] || null; },

  // ---- measure resolution → { dong_code: rawValue } ────────────────────────
  // ctx.themeTotals = Atlas.groupTotalsByDong() : { dong_code: [6] }
  // A DerivedMeasure's `variables` are theme indices (0..5) for this prototype.
  resolveMeasure(measure, ctx) {
    const out = {};
    if (!measure) return out;
    // A measure sourced from a per-dong metric column (weather hot-days, RHSI, etc.).
    if (measure.source === "dongField" && ctx.dongMetrics) {
      ctx.dongMetrics.forEach((rec, code) => { const v = rec[measure.field]; if (Number.isFinite(v)) out[code] = v; });
      return out;
    }
    // A single industry's per-dong sales (hot + mild), for "within a group".
    if (measure.source === "salesIndustry" && ctx.salesByDong) {
      ctx.salesByDong.forEach((rec, code) => {
        const h = rec[measure.field + "_hot"], m = rec[measure.field + "_mild"];
        if (Number.isFinite(h) || Number.isFinite(m)) out[code] = (h || 0) + (m || 0);
      });
      return out;
    }
    const totals = ctx.themeTotals, vars = measure.variables || [];
    Object.keys(totals).forEach((code) => {
      const row = totals[code]; if (!row) return;
      const picked = vars.length ? vars.map((i) => row[i] || 0) : row.slice();
      let v = null;
      switch (measure.op) {
        case "mean": v = picked.reduce((a, b) => a + b, 0) / (picked.length || 1); break;
        case "share": { const tot = row.reduce((a, b) => a + b, 0) || 1; v = picked.reduce((a, b) => a + b, 0) / tot; break; }
        case "diff": v = (picked[0] || 0) - (picked[1] || 0); break;   // A − B (comparison)
        case "sum": default: v = picked.reduce((a, b) => a + b, 0);
      }
      out[code] = v;
    });
    return out;
  },

  // ---- transformation → { dong_code: 0..1 }  (+ meta about sign) ────────────
  transform(values, spec) {
    const codes = Object.keys(values);
    const nums = codes.map((c) => values[c]).filter((v) => Number.isFinite(v));
    if (!nums.length) return { norm: {}, signed: false };
    const type = (spec && spec.type) || "raw";
    let min = Math.min(...nums), max = Math.max(...nums);
    const out = {};
    if (type === "log") {
      const lg = (v) => Math.log(Math.max(1, v));
      min = lg(Math.max(1, min)); max = lg(Math.max(1, max));
      codes.forEach((c) => out[c] = (lg(Math.max(1, values[c])) - min) / ((max - min) || 1));
      return { norm: out, signed: false };
    }
    // signed diverging when values cross zero and negatives are preserved
    const signed = min < 0 && (!spec || spec.negativeHandling === "preserve");
    if (signed) {
      const m = Math.max(Math.abs(min), Math.abs(max)) || 1;
      codes.forEach((c) => out[c] = values[c] / m);              // −1..1
      return { norm: out, signed: true };
    }
    codes.forEach((c) => out[c] = (values[c] - min) / ((max - min) || 1)); // 0..1
    return { norm: out, signed: false };
  },
};

if (typeof window !== "undefined") window.PM = PM;
