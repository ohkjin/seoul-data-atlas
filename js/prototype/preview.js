// ── Live preview map (prototype) ────────────────────────────────────────────
// A self-contained deck.gl + MapLibre map. `compile(layerSet)` turns the
// semantic config into deck layers — showing exactly how a Composite Layer
// expands into several render layers while staying one logical object.

// selectable colour schemes (the "color theme") — 3 stops each
const SCHEMES = {
  bluered: { label: "Blue–Red", stops: [[125, 167, 255], [255, 184, 107], [228, 82, 78]] },
  warm: { label: "Warm", stops: [[255, 224, 138], [255, 150, 80], [228, 82, 78]] },
  cool: { label: "Cool", stops: [[125, 167, 255], [63, 200, 190], [63, 230, 165]] },
  viridis: { label: "Viridis", stops: [[92, 74, 160], [45, 160, 150], [240, 226, 92]] },
  mono: { label: "Mono", stops: [[86, 96, 116], [156, 166, 186], [235, 240, 248]] },
};
if (typeof window !== "undefined") window.SCHEMES = SCHEMES;

// Single/Total draw ONE value → one hue (a single-color sequential ramp).
const HUES = {
  blue: { label: "Blue", rgb: [125, 167, 255] },
  teal: { label: "Teal", rgb: [63, 200, 190] },
  green: { label: "Green", rgb: [72, 207, 143] },
  amber: { label: "Amber", rgb: [255, 184, 107] },
  red: { label: "Red", rgb: [228, 100, 96] },
  purple: { label: "Purple", rgb: [170, 132, 224] },
  mono: { label: "Mono", rgb: [176, 186, 206] },
};
if (typeof window !== "undefined") window.HUES = HUES;

// Multiple series (Across / Within) → a color THEME: one distinct color per series.
const PALETTES = {
  spectrum: { label: "Spectrum", colors: [[125, 167, 255], [63, 200, 190], [72, 207, 143], [255, 184, 107], [228, 120, 110], [170, 132, 224]] },
  warm: { label: "Warm", colors: [[255, 224, 138], [255, 184, 107], [255, 138, 92], [228, 100, 96], [200, 84, 112], [150, 74, 120]] },
  cool: { label: "Cool", colors: [[125, 167, 255], [94, 190, 220], [63, 200, 190], [72, 207, 143], [120, 180, 205], [150, 158, 230]] },
  earth: { label: "Earth", colors: [[196, 168, 120], [176, 150, 96], [150, 170, 120], [120, 150, 130], [168, 140, 110], [140, 120, 100]] },
  mono: { label: "Mono", colors: [[104, 116, 140], [134, 146, 168], [164, 176, 196], [196, 206, 222], [148, 158, 182], [122, 132, 156]] },
};
if (typeof window !== "undefined") window.PALETTES = PALETTES;

// a single-hue 3-stop ramp: dim (toward the dark basemap) → full colour
function hueStops(rgb) {
  const s = (f) => [Math.round(rgb[0] * f + 14 * (1 - f)), Math.round(rgb[1] * f + 18 * (1 - f)), Math.round(rgb[2] * f + 28 * (1 - f))];
  return [s(0.34), s(0.64), rgb.slice()];
}
if (typeof window !== "undefined") window.hueStops = hueStops;

const Preview = {
  map: null, overlay: null, ctx: null, _geo: null,

  // interpolate a scheme's 3 stops: sequential (0..1) and diverging (−1..1, middle = 0)
  _ramp(stops, t) {
    t = Math.max(0, Math.min(1, t)); const s = t * 2, i = Math.min(1, Math.floor(s)), f = s - i;
    const a = stops[i], b = stops[i + 1] || stops[i];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  },
  _rampDiv(stops, t) {
    const neg = stops[0], mid = stops[1], pos = stops[2];
    if (t < 0) { const f = Math.min(1, -t); return [mid[0] + (neg[0] - mid[0]) * f, mid[1] + (neg[1] - mid[1]) * f, mid[2] + (neg[2] - mid[2]) * f]; }
    const f = Math.min(1, t); return [mid[0] + (pos[0] - mid[0]) * f, mid[1] + (pos[1] - mid[1]) * f, mid[2] + (pos[2] - mid[2]) * f];
  },

  init() {
    this.ctx = { themeTotals: Atlas.groupTotalsByDong(), dongMetrics: Atlas.dongByCode, salesByDong: Atlas.salesByDong };
    // dong geometry table: { code, name, gu, centroid:[lon,lat], polygon:[[ [lon,lat],… ]] }
    this._geo = Atlas.dongGeometry.map((d) => ({
      code: d.dong_code, name: d.dong_name, gu: d.gu_code,
      centroid: d.centroid, polygon: d.geometry.coordinates,
    }));
    this.map = new maplibregl.Map({
      container: "pmap",
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [126.986, 37.545], zoom: 9.6, pitch: 42, bearing: -12, attributionControl: false,
    });
    this.overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
    this.map.addControl(this.overlay);
    return this;
  },

  // ---- color helpers ----
  _seq(t) { // blue → amber → red
    const stops = [[125, 167, 255], [255, 184, 107], [228, 82, 78]];
    t = Math.max(0, Math.min(1, t)); const s = t * 2, i = Math.min(1, Math.floor(s)), f = s - i;
    const a = stops[i], b = stops[i + 1] || stops[i];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  },
  _div(t) { // −1..1 → blue … grey … red
    const neg = [125, 167, 255], mid = [120, 110, 140], pos = [228, 82, 78];
    if (t < 0) { const f = Math.min(1, -t); return [mid[0] + (neg[0] - mid[0]) * f, mid[1] + (neg[1] - mid[1]) * f, mid[2] + (neg[2] - mid[2]) * f]; }
    const f = Math.min(1, t); return [mid[0] + (pos[0] - mid[0]) * f, mid[1] + (pos[1] - mid[1]) * f, mid[2] + (pos[2] - mid[2]) * f];
  },

  // ---- compile the semantic config → deck layers ----
  compile(set) {
    const layers = [];
    const self = this;
    PM.eachLayer(set, (L, group) => {
      if (group && group.visible === false) return;
      if (L.visible === false) return;
      // per-layer appearance
      const lop = L.encoding.opacity != null ? L.encoding.opacity : 1;
      const alpha = Math.round(235 * (group ? group.opacity : 1) * lop);
      const out = L.encoding.outline || { on: true, width: 1 };
      const lineW = out.on ? out.width : 0;
      const labelLayer = () => L.encoding.label ? [new deck.TextLayer({
        id: L.id + "-label", data: self._geo, pickable: false, getPosition: (d) => d.centroid, getText: (d) => d.name,
        getSize: 9, sizeUnits: "pixels", getColor: [230, 236, 246, 210], fontFamily: "Inter, sans-serif",
        getTextAnchor: "middle", getAlignmentBaseline: "center", outlineWidth: 2, outlineColor: [6, 9, 14, 200], fontSettings: { sdf: true },
      })] : [];

      const st = L.structure, rep = L.encoding.channel;
      // Single/Total → one hue ramp; Comparison → diverging scheme; series colours (across/within) come per-series.
      const stops = (st === "single" || st === "total")
        ? hueStops((HUES[L.encoding.hue] || HUES.blue).rgb)
        : (SCHEMES[L.encoding.scheme] || SCHEMES.bluered).stops;

      // ── Single / Total → one value, drawn as a choropleth or columns ──
      if (st === "single" || st === "total") {
        const raw = PM.resolveMeasure(PM.measureById(set, L.measureRef), self.ctx);
        const { norm, signed } = PM.transform(raw, L.transformation);
        const colr = signed ? (t) => self._rampDiv(stops, t) : (t) => self._ramp(stops, t);
        if (rep === "columns") {
          const hi = (L.encoding.heightRange || [0, 2600])[1];
          layers.push(new deck.ColumnLayer({
            id: L.id + "-col", data: self._geo, diskResolution: 6, radius: 180, extruded: true, pickable: !!L.interaction.tooltip,
            getPosition: (d) => d.centroid, getElevation: (d) => (norm[d.code] || 0) * hi,
            getFillColor: (d) => { const c = colr(norm[d.code] || 0); return [c[0], c[1], c[2], alpha]; },
          }));
        } else { // choropleth
          layers.push(new deck.PolygonLayer({
            id: L.id + "-chor", data: self._geo, stroked: out.on, filled: true, extruded: false, pickable: !!L.interaction.tooltip,
            getPolygon: (d) => d.polygon, getLineColor: [10, 14, 22, 150], lineWidthUnits: "pixels", getLineWidth: lineW,
            getFillColor: (d) => { const c = colr(norm[d.code] || 0); return [c[0], c[1], c[2], alpha]; },
          }));
        }
        layers.push(...labelLayer());
        return;
      }

      // ── Comparison → diverging map (+ optional magnitude dots for color+size) ──
      if (st === "comparison") {
        const raw = PM.resolveMeasure(PM.measureById(set, L.measureRef), self.ctx);
        const { norm } = PM.transform(raw, { type: "raw", negativeHandling: "preserve" });
        layers.push(new deck.PolygonLayer({
          id: L.id + "-diff", data: self._geo, stroked: out.on, filled: true, pickable: true,
          getPolygon: (d) => d.polygon, getLineColor: [10, 14, 22, 150], lineWidthUnits: "pixels", getLineWidth: lineW,
          getFillColor: (d) => { const c = self._rampDiv(stops, norm[d.code] || 0); return [c[0], c[1], c[2], alpha]; },
        }));
        layers.push(...labelLayer());
        if (rep === "color+size") {
          layers.push(new deck.ScatterplotLayer({
            id: L.id + "-cs", data: self._geo, radiusUnits: "meters", stroked: false, pickable: false,
            getPosition: (d) => d.centroid, getRadius: (d) => 180 + Math.abs(norm[d.code] || 0) * 900,
            getFillColor: [255, 255, 255, 70],
          }));
        }
        return;
      }

      // ── Composition → rings / columns / dominant ──
      const ch = rep || "rings";
      const seriesRaw = L.series.map((s) => PM.resolveMeasure(PM.measureById(set, s.measureRef), self.ctx));
      if (ch === "rings") {
        const [rlo, rhi] = L.encoding.radiusRange || [120, 1500];
        L.series.forEach((s, i) => {
          const { norm } = PM.transform(seriesRaw[i], L.transformation);
          const col = s.color || Atlas.groupColor(i);
          layers.push(new deck.ScatterplotLayer({
            id: L.id + "-ring-" + i, data: self._geo, stroked: true, filled: false, radiusUnits: "meters",
            getPosition: (d) => d.centroid, getRadius: (d) => rlo + (norm[d.code] || 0) * (rhi - rlo),
            getLineColor: [col[0], col[1], col[2], alpha], lineWidthUnits: "pixels", getLineWidth: Math.max(0.6, out.width), lineWidthMinPixels: 1,
          }));
        });
      } else {
        // dominant theme + total per dong (for the "columns" / "dominant" designs)
        const dom = {}, tot = {};
        self._geo.forEach((d) => {
          let best = -1, bv = -Infinity, sum = 0;
          L.series.forEach((s, i) => { const v = seriesRaw[i][d.code] || 0; sum += v; if (v > bv) { bv = v; best = i; } });
          dom[d.code] = best; tot[d.code] = sum;
        });
        const tmax = Math.max(1, ...Object.values(tot));
        const domCol = (code) => { const i = dom[code]; return (i >= 0 && L.series[i] && L.series[i].color) || Atlas.groupColor(Math.max(0, i)); };
        if (ch === "columns") {
          layers.push(new deck.ColumnLayer({
            id: L.id + "-cols", data: self._geo, radius: 170, extruded: true, diskResolution: 6, pickable: false,
            getPosition: (d) => d.centroid, getElevation: (d) => ((tot[d.code] || 0) / tmax) * 2400,
            getFillColor: (d) => { const c = domCol(d.code); return [c[0], c[1], c[2], alpha]; },
          }));
        } else { // dominant
          layers.push(new deck.PolygonLayer({
            id: L.id + "-dom", data: self._geo, stroked: out.on, filled: true, pickable: false,
            getPolygon: (d) => d.polygon, getLineColor: [10, 14, 22, 150], lineWidthUnits: "pixels", getLineWidth: lineW,
            getFillColor: (d) => { const c = domCol(d.code); return [c[0], c[1], c[2], alpha]; },
          }));
        }
      }
      layers.push(...labelLayer());
    });
    return layers;
  },

  render(set) {
    this._lastLayers = this.compile(set);
    if (this.overlay) this.overlay.setProps({ layers: this._lastLayers });
    return this._lastLayers;
  },
};

if (typeof window !== "undefined") window.Preview = Preview;
