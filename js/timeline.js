// Time-flow bottom strip: an inline ECharts area/line chart of 2024 daily
// temperature (line) + retail sales (area) with a moving day cursor, plus the
// play/pause/speed/reset controls. Emits day changes to a callback (app.js
// wires them to the map's temporal mode). Static-only data comes from Atlas.

const Timeline = {
  chart: null,
  scope: { level: "city", guCode: null, dongCode: null },
  onScrub: null,   // (dayIndex) => {}  — user clicked a day (pauses)
  onToggle: null,  // (playing) => {}
  _series: null,
  _enabled: true,  // filled only for time-based datasets (UHUS / weather / sales)
  _channel: "both", // "temp" | "sales" | "both" — which series to draw (app-driven)

  init({ onScrub, onToggle, onSpeed }) {
    this.onScrub = onScrub; this.onToggle = onToggle; this.onSpeed = onSpeed;
    this.chart = echarts.init(document.getElementById("tl-chart"));
    this.setScope(this.scope);

    // click anywhere on the chart → jump to that day (app pauses)
    this.chart.getZr().on("click", (e) => {
      const x = [e.offsetX, e.offsetY];
      const pt = this.chart.convertFromPixel({ xAxisIndex: 0 }, x);
      if (pt != null && this._series) {
        const i = Math.max(0, Math.min(this._series.length - 1, Math.round(pt[0])));
        if (this.onScrub) this.onScrub(i);
      }
    });

    // draggable day-slider under the chart → moves the map + graph cursor to that day
    const scrub = document.getElementById("tl-scrub");
    if (scrub) {
      scrub.max = String(Math.max(0, (Atlas.timeDayCount ? Atlas.timeDayCount() : 366) - 1));
      scrub.addEventListener("input", () => { if (this.onScrub) this.onScrub(+scrub.value); });
    }

    document.getElementById("tl-play").addEventListener("click", () => {
      if (this.onToggle) this.onToggle();
    });
    document.getElementById("tl-reset").addEventListener("click", () => {
      if (this.onScrub) this.onScrub(0, true);
    });
    document.querySelectorAll("#tl-speeds button").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#tl-speeds button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        if (this.onSpeed) this.onSpeed(+b.dataset.speed);
      });
    });
    window.addEventListener("resize", () => this.chart && this.chart.resize());
  },

  // Enable/disable the time-series (dataset-gated). When off, the chart is cleared
  // and a hint is shown; scope updates are ignored until re-enabled.
  setEnabled(on) {
    if (this._enabled === on) return;
    this._enabled = on;
    if (!on && this.chart) {
      this.chart.clear();
      const ro = document.getElementById("tl-readout");
      if (ro) ro.innerHTML = "Time-series Graph for showing data trends and controlling the Map Display.";
    }
  },

  // Choose which flow the graph draws: "temp" (Weather), "sales" (Sales), or
  // "both" (Heat × sales). Re-renders if a series is already loaded.
  setChannel(ch) {
    if (ch !== "temp" && ch !== "sales" && ch !== "both") return;
    if (this._channel === ch) return;
    this._channel = ch;
    if (this._enabled !== false && this._series) { this._render(this._dayIndex || 0); this.setDay(this._dayIndex || 0); }
  },

  setScope(scope) {
    this.scope = scope;
    if (this._enabled === false) return; // dataset not time-based → leave cleared
    this._series = Atlas.dailySeries(scope);
    this._render(this._dayIndex || 0);
    this.setDay(this._dayIndex || 0);
  },

  _render(dayIndex) {
    const s = this._series;
    const ch = this._channel;
    const showTemp = ch !== "sales", showSales = ch !== "temp";
    const dates = s.map((d) => d.date);
    const temp = s.map((d) => Number.isFinite(d.temp) ? +d.temp.toFixed(1) : null);
    const salesMax = Math.max(...s.map((d) => d.sales)) || 1;
    const sales = s.map((d) => d.sales / salesMax); // 0..1 for the dim area

    // The moving day-cursor rides the first present series (a vertical xAxis
    // markLine), so setDay can always target series[0] regardless of channel.
    const cursor = { silent: true, symbol: "none", data: [{ xAxis: dayIndex }],
      lineStyle: { color: "#FFF3DD", width: 1.4, type: "solid" }, label: { show: false } };
    const tempSeries = { name: "Temp", type: "line", yAxisIndex: 0, data: temp, smooth: true, symbol: "none",
      lineStyle: { color: "#FFB74D", width: 1.6 } };
    const salesSeries = { name: "Sales", type: "line", yAxisIndex: 1, data: sales, smooth: true, symbol: "none",
      lineStyle: { width: 0 }, areaStyle: { color: "rgba(125,167,255,0.16)" } };
    const series = [];
    if (showTemp) series.push(tempSeries);
    if (showSales) series.push(salesSeries);
    if (series.length) series[0] = Object.assign({}, series[0], { markLine: cursor });

    this.chart.setOption({
      animation: false,
      grid: { left: 34, right: 40, top: 10, bottom: 18 },
      xAxis: {
        type: "category", data: dates, boundaryGap: false,
        axisLabel: { color: "#8C93A3", fontSize: 8, interval: 30, formatter: (v) => v.slice(5) },
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } }, axisTick: { show: false },
      },
      yAxis: [
        { type: "value", scale: true, position: "left", name: "°C", show: showTemp, nameTextStyle: { color: "#8C93A3", fontSize: 9 },
          axisLabel: { color: "#8C93A3", fontSize: 8 }, splitLine: { lineStyle: { color: "rgba(255,255,255,0.05)" } } },
        { type: "value", min: 0, max: 1, position: "right", show: false },
      ],
      tooltip: {
        trigger: "axis",
        formatter: (p) => {
          const i = p[0].dataIndex; const row = s[i];
          const tempLabel = Number.isFinite(row.temp) ? `${row.temp.toFixed(1)}°C` : "—";
          const lines = [`${Atlas.scopeLabel(this.scope)}`, `${row.date}`];
          if (showTemp) lines.push(`Temp <b>${tempLabel}</b>`);
          if (showSales) lines.push(`Sales ₩${(row.sales / 1e8).toFixed(1)}억`);
          return lines.join("<br/>");
        },
      },
      series: series.length ? series : [{ type: "line", data: [] }],
    }, { replaceMerge: ["series", "yAxis"] });
  },

  // Move just the cursor (cheap) during playback without a full re-render.
  setDay(dayIndex) {
    this._dayIndex = dayIndex;
    if (!this.chart) return;
    // cursor lives on series[0] (whichever channel series is first)
    this.chart.setOption({
      series: [{ markLine: { silent: true, symbol: "none", data: [{ xAxis: dayIndex }],
        lineStyle: { color: "#FFF3DD", width: 1.4 }, label: { show: false } } }],
    });
    const scrub = document.getElementById("tl-scrub");
    if (scrub && +scrub.value !== dayIndex) scrub.value = String(dayIndex);
    const row = this._series && this._series[dayIndex];
    if (row) {
      const ch = this._channel;
      const tempLabel = Number.isFinite(row.temp) ? `${row.temp.toFixed(1)}°C` : "—";
      const parts = [`<b>${Atlas.scopeLabel(this.scope)}</b>`, row.date];
      if (ch !== "sales") parts.push(tempLabel);
      if (ch !== "temp") parts.push(`₩${(row.sales / 1e8).toFixed(1)}억`);
      document.getElementById("tl-readout").innerHTML = parts.join(" · ");
    }
  },

  setPlaying(on) {
    const btn = document.getElementById("tl-play");
    btn.textContent = on ? "❚❚" : "▶";
    btn.classList.toggle("playing", on);
  },
};
