# UHUS Dashboard — Overview Video Narration

Full narration script for the dashboard walkthrough, section by section.
Written in simple, straightforward academic English; names and figures match the
dashboard source code.

---

## 1 — Project Detail Page

This is the Project Detail page for UHUS — short for Urban Heat and Urban Sales.
Every dataset in the project is accessible from here. All five datasets are
measured at the neighborhood, or *dong*, level, covering Seoul's 422
neighborhoods.

## 2 — Weather (Daily_Weather.csv)

The first dataset is the daily weather data. It records each neighborhood's daily
maximum air temperature, total precipitation, maximum humidity, and maximum
apparent temperature for the year 2024.

**Insight.** These readings define heat exposure. A day is marked *hot* when the
apparent temperature reaches 33 degrees Celsius or higher, and *mild* when it
stays between 18 and 26 degrees with no rain and no public holiday. These
categories become the baseline for the entire analysis.

**Temporal / 3D map.** Because the weather data is temporal, the 3D map can be
animated over time. Using the time controls together with the time-series graph
panel at the bottom, we can play the sequence and watch the temperature field
rise and fall across the year, peaking in mid-summer.

## 3 — Sales (sales.csv)

The next dataset is the sales data. It records daily card-transaction amounts for
each neighborhood — the behavioral signal behind retail heat sensitivity. A
combined retail total sums the 19 core retail sectors used to compute the main
index.

**Insight.** This shows how consumer spending shifts day to day, and reveals
which retail activity contracts when temperatures climb.

**Rings.** The 85 industries are divided into 6 groups — Food & Beverage, Retail
& Daily Goods, Fashion / Beauty / Personal, Health / Education / Culture, Leisure
/ Mobility / Lodging, and Housing / Professional / Local. Each group is
aggregated and drawn as one ring per neighborhood.

**Forms.** Differences between variables can also be displayed by selecting a
different form in the map panel — for example, rings, columns, a flat choropleth,
or a dominant-group view.

## 4 — Urban Features (Urban_Features.csv)

The Urban Features dataset describes each neighborhood's urban context — its
demographics, accessibility, land use, and built environment — across 21
variables. These explain *why* heat sensitivity differs between places.

**Insight.** Shown as a choropleth, each urban feature can be compared directly
against the heat-sensitivity index to see which characteristics line up with it.

**Hover.** When we hover over the 3D map, each neighborhood's name appears along
with its details for that region — including its mapped value, its
heat-sensitivity index, and its citywide rank.

## 5 — SHAP (shap_result.csv)

The SHAP dataset explains the model. For each neighborhood, it shows how much
every model input pushed the predicted heat-sensitivity index up or down.

**Insight.** This decomposes the index into its contributing factors, ranking
which urban features drive each neighborhood's result. It explains the model's
behavior — not causation.

## 6 — RHSI (RHSI.csv)

Finally, the RHSI dataset — the Retail Heat-Sensitivity Index — is the study's
main output. It is the log-ratio of average retail sales on hot days compared
with mild days, for each neighborhood.

**Insight.** A negative value means retail sales fall on hot days: that
neighborhood is heat-sensitive. The map colors each neighborhood by this index,
so we can see at a glance where hot weather costs the most retail activity.

**Target area.** We can choose a target area — the whole of Seoul, a district
(*gu*), or a neighborhood (*dong*). This selection can be made by clicking
directly on the map, and also through the spatial selection boxes.

**Map options.** The map panel also offers several other options — for example,
switching to a flat 2D view, or enabling automatic rotation.
