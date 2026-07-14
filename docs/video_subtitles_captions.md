# UHUS Dashboard — Overview Video Captions

Condensed on-screen caption lines (~7–10 words each), grouped by section.
Each line is meant to display as one short subtitle. Names and figures match the
dashboard source code.

---

## 1 — Project Detail Page

- UHUS: Urban Heat and Urban Sales.
- Every dataset is accessible here.
- All five datasets are neighborhood-level — Seoul's 422 dongs.

## 2 — Weather

- First: the daily weather data.
- Max temperature, precipitation, humidity, and apparent temperature, 2024.
- These define heat exposure.
- Hot day: apparent temperature 33°C or higher.
- Mild day: 18–26°C, no rain, no holiday.
- The weather data is temporal.
- The 3D map can be played over time.
- Use the time controls with the time-series panel below.
- Watch temperature peak in mid-summer.

## 3 — Sales

- Next: the daily card-sales data.
- The behavioral signal behind retail heat sensitivity.
- It shows how spending shifts each day.
- 85 industries, divided into 6 groups.
- Food & Beverage; Retail & Daily Goods; Fashion / Beauty / Personal.
- Health / Education / Culture; Leisure / Mobility / Lodging; Housing / Professional / Local.
- Each group is aggregated into one ring per neighborhood.
- Different variables appear by choosing a form in the map panel.

## 4 — Urban Features

- Urban Features: each neighborhood's context.
- Demographics, accessibility, land use, built environment — 21 variables.
- They explain why heat sensitivity differs.
- Shown as a choropleth, compared against the index.
- Hover the 3D map for each dong's name and details.

## 5 — SHAP

- SHAP explains the model.
- How much each input pushed the predicted index up or down.
- It ranks the drivers behind each neighborhood's result.
- This explains the model — not causation.

## 6 — RHSI

- Finally, the Retail Heat-Sensitivity Index — the main output.
- Log-ratio of retail sales on hot versus mild days.
- Negative means retail falls on hot days: heat-sensitive.
- The map colors each neighborhood by this index.
- Choose a target area: Seoul, a district, or a neighborhood.
- Select it by clicking the map, or with the spatial boxes.
- The map panel also offers 2D view and auto-rotation.
