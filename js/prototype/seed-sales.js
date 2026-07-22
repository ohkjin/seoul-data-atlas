// ── Seeded showcase Layer Sets (prototype) ──────────────────────────────────
// One curated Layer Set per project. Uses the axes: Structure (Single/Multiple)
// + Read-as (auto label) + Representation (the form).
// Theme order: 0 F&B · 1 Retail · 2 Fashion · 3 Health · 4 Leisure · 5 Housing

// For "Within a group": each theme group's industries that have per-dong sales
// data (the ~20 industries in salesByDong). Used to build variable-level series.
const INDUSTRY_GROUPS = {
  fnb: { label: "Food & Beverage", cols: ["korean_cuisine", "cafe", "other_food", "other_food_service"] },
  retail: { label: "Retail & Daily Goods", cols: ["department_store", "shopping_mall", "convenience_store", "supermarket_large_format", "discount_store", "independent_grocery", "home_appliances", "gift_certificate_lottery"] },
  fashion: { label: "Fashion / Beauty", cols: ["apparel"] },
  health: { label: "Health / Edu / Culture", cols: ["general_clinic", "general_hospital", "pharmacy", "academy_learning_materials", "computer_software"] },
  leisure: { label: "Leisure / Mobility", cols: ["gas_station"] },
  housing: { label: "Housing / Local", cols: ["funeral_home_cemetery"] },
};
if (typeof window !== "undefined") window.INDUSTRY_GROUPS = INDUSTRY_GROUPS;

function _themeMeasures(set) {
  const names = ["F&B", "Retail", "Fashion", "Health", "Leisure", "Housing"];
  return names.map((nm, i) => {
    const m = PM.measure({ name: nm + " sales", source: "salesThemes", op: "sum", variables: [i], unit: "KRW", formula: nm + " theme total" });
    set.measures[m.id] = m; return m;
  });
}

// ---- Sales -----------------------------------------------------------------
function buildSalesLayerSet() {
  const set = PM.layerSet({ name: "Sales", datasetIds: ["sales"], desc: "Daily card-sales — a total, the six-theme composition, and a Food-vs-Retail comparison." });
  const mSel = PM.measure({ name: "Selected sales (F&B + Retail)", source: "salesThemes", op: "sum", variables: [0, 1], unit: "KRW", formula: "sum of F&B + Retail" });
  const mDiff = PM.measure({ name: "Food − Retail", source: "salesThemes", op: "diff", variables: [0, 1], unit: "KRW", formula: "F&B − Retail" });
  set.measures[mSel.id] = mSel; set.measures[mDiff.id] = mDiff;
  const themes = _themeMeasures(set);

  set.sections.push(PM.section({ title: "Total", groups: [PM.group({
    name: "Total sales", layers: [PM.layer({
      name: "Selected industry sales", kind: "atomic", structure: "total", readAs: "magnitude", measureRef: mSel.id,
      transformation: { type: "log", negativeHandling: "preserve" }, encoding: { channel: "columns", palette: "sequential", heightRange: [0, 2600] } })] })] }));

  set.sections.push(PM.section({ title: "Composition", groups: [PM.group({
    name: "Sales themes", layers: [PM.layer({
      name: "Six-theme rings", kind: "composite", structure: "across", readAs: "magnitude",
      series: themes.map((m, i) => PM.series({ name: m.name, measureRef: m.id, color: Atlas.groupColor(i) })),
      transformation: { type: "minmax", negativeHandling: "preserve" }, encoding: { channel: "rings", radiusRange: [120, 1500] } })] })] }));

  set.sections.push(PM.section({ title: "Comparison", groups: [PM.group({
    name: "Food vs Retail", layers: [PM.layer({
      name: "Food vs Retail", kind: "composite", structure: "comparison", readAs: "change", measureRef: mDiff.id, visible: false,
      series: [PM.series({ name: "Food & Beverage", measureRef: themes[0].id }),
               PM.series({ name: "Retail & Daily Goods", measureRef: themes[1].id })],
      comparison: { target: "variables", operation: "difference", arrangement: "overlay" },
      encoding: { channel: "diverging", palette: "diverging" } })] })] }));

  // Group preset: compare several variables, each with its OWN visual type, bundled
  // as one group (toggle/opacity as a unit). Off by default so the map opens clean.
  set.sections.push(PM.section({ title: "Compare · mixed visuals", groups: [PM.group({
    name: "Themes by design", visible: false, layers: [
      PM.layer({ name: "F&B — columns", kind: "atomic", structure: "single", readAs: "magnitude", measureRef: themes[0].id,
        transformation: { type: "minmax" }, encoding: { channel: "columns", palette: "sequential", heightRange: [0, 2200] } }),
      PM.layer({ name: "Retail — choropleth", kind: "atomic", structure: "single", readAs: "magnitude", measureRef: themes[1].id,
        transformation: { type: "minmax" }, encoding: { channel: "choropleth", palette: "sequential" } }),
      PM.layer({ name: "Leisure — columns", kind: "atomic", structure: "single", readAs: "magnitude", measureRef: themes[4].id,
        transformation: { type: "minmax" }, encoding: { channel: "columns", palette: "sequential", heightRange: [0, 2200] } }),
    ] })] }));
  return set;
}

// ---- Weather ---------------------------------------------------------------
function buildWeatherLayerSet() {
  const set = PM.layerSet({ name: "Weather", datasetIds: ["weather"], desc: "Heat exposure per neighborhood — extreme-heat and mild day counts across 2024." });
  const mHot = PM.measure({ name: "Extreme-heat days", source: "dongField", field: "n_hot_days", unit: "days", formula: "count of days ≥ 33°C apparent" });
  const mMild = PM.measure({ name: "Mild days", source: "dongField", field: "n_mild_days", unit: "days", formula: "count of 18–26°C dry non-holiday days" });
  set.measures[mHot.id] = mHot; set.measures[mMild.id] = mMild;

  set.sections.push(PM.section({ title: "Heat exposure", groups: [PM.group({
    name: "Heat exposure", layers: [PM.layer({
      name: "Extreme-heat days", kind: "atomic", structure: "single", readAs: "magnitude", measureRef: mHot.id,
      binding: { datasetId: "weather", spatialField: "dong_code", temporalField: "date", timeRange: null },
      transformation: { type: "minmax", negativeHandling: "preserve" }, encoding: { channel: "choropleth", palette: "sequential" } })] })] }));

  set.sections.push(PM.section({ title: "Reference", groups: [PM.group({
    name: "Mild days", visible: false, layers: [PM.layer({
      name: "Mild days", kind: "atomic", structure: "single", readAs: "magnitude", measureRef: mMild.id, visible: false,
      binding: { datasetId: "weather", spatialField: "dong_code" },
      transformation: { type: "minmax" }, encoding: { channel: "choropleth", palette: "sequential" } })] })] }));
  return set;
}

// ---- Heat × Sales (combined datasets) --------------------------------------
function buildHeatSalesLayerSet() {
  const set = PM.layerSet({ name: "Heat × Sales", datasetIds: ["weather", "sales"], desc: "A Layer Set spanning TWO datasets: temperature heat exposure (color) beneath the six sales-theme rings." });
  const mHot = PM.measure({ name: "Extreme-heat days", source: "dongField", field: "n_hot_days", unit: "days", formula: "count of days ≥ 33°C apparent" });
  set.measures[mHot.id] = mHot;
  const themes = _themeMeasures(set);

  set.sections.push(PM.section({ title: "Heat × Sales", groups: [PM.group({ name: "Overlay", layers: [
    PM.layer({ name: "Heat exposure", kind: "atomic", structure: "single", readAs: "magnitude", measureRef: mHot.id,
      binding: { datasetId: "weather", spatialField: "dong_code" },
      transformation: { type: "minmax" }, encoding: { channel: "choropleth", palette: "sequential" } }),
    PM.layer({ name: "Sales themes", kind: "composite", structure: "across", readAs: "magnitude",
      binding: { datasetId: "sales", spatialField: "dong_code" },
      series: themes.map((m, i) => PM.series({ name: m.name, measureRef: m.id, color: Atlas.groupColor(i) })),
      transformation: { type: "minmax" }, encoding: { channel: "rings", radiusRange: [120, 1400] } }),
  ] })] }));
  return set;
}

function buildAllSets() {
  const sets = { sales: buildSalesLayerSet(), weather: buildWeatherLayerSet(), heatxsales: buildHeatSalesLayerSet() };
  // seeded layers AND groups are author presets
  Object.values(sets).forEach((s) => { s.sections.forEach((sec) => sec.groups.forEach((g) => (g.preset = true))); PM.eachLayer(s, (L) => (L.preset = true)); });
  return sets;
}
if (typeof window !== "undefined") { window.buildAllSets = buildAllSets; window.buildSalesLayerSet = buildSalesLayerSet; }
