"""
One-time fetch: a CURATED set of Seoul amenities/facilities from OpenStreetMap
(Overpass API) for the "Amenities" context layer. NOT the full amenity tag (that
is huge and noisy) — only classes that stand in for Urban Features:
Urban Environment & Accessibility (education, health, civic, cooling/shelter,
activity facilities, parking).

Scope: Seoul only (25 gu), per-gu bounding boxes from gu_geometry.json, deduped
by OSM id. Ways use their center (`out center;`); nodes use their coordinate.

Run manually:  python scripts/fetch_osm_amenity.py
Writes to:     ./data/amenity.json   -> [{ "x": lon, "y": lat, "c": <category int> }]
"""
import json
import os
import time
import requests
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
HEADERS = {"User-Agent": "SeoulDataAtlas/1.0 (research prototype)"}

SLEEP_SEC = 12
MAX_RETRIES = 5
RETRY_WAIT = 30

# Category code (kept in sync with the "amenity" legend in js/map.js).
#   0 education · 1 health · 2 civic/public · 3 cooling/shelter · 4 activity · 5 parking
CATEGORY = {
    "school": 0, "university": 0, "college": 0, "kindergarten": 0, "library": 0,
    "hospital": 1, "clinic": 1, "pharmacy": 1, "doctors": 1,
    "community_centre": 2, "townhall": 2, "marketplace": 2, "police": 2, "fire_station": 2,
    "drinking_water": 3, "fountain": 3, "shelter": 3,
    "sports_centre": 4, "pitch": 4, "playground": 4,  # leisure=*
    "parking": 5,
}
AMENITY_VALS = "school|university|college|kindergarten|library|hospital|clinic|pharmacy|doctors|community_centre|townhall|marketplace|police|fire_station|drinking_water|fountain|shelter|parking"
LEISURE_VALS = "sports_centre|pitch|playground"


def log(msg):
    print(msg, flush=True)


def gu_bbox(gu_geom):
    minx, miny, maxx, maxy = shape(gu_geom).bounds
    return (miny, minx, maxy, maxx)  # south, west, north, east


def fetch_gu(south, west, north, east):
    b = f"{south},{west},{north},{east}"
    q = (
        f"[out:json][timeout:120];"
        f"("
        f'node["amenity"~"^({AMENITY_VALS})$"]({b});'
        f'way["amenity"~"^({AMENITY_VALS})$"]({b});'
        f'node["leisure"~"^({LEISURE_VALS})$"]({b});'
        f'way["leisure"~"^({LEISURE_VALS})$"]({b});'
        f");"
        f"out center;"
    )
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        url = OVERPASS_URLS[(attempt - 1) % len(OVERPASS_URLS)]
        try:
            r = requests.post(url, data={"data": q}, headers=HEADERS, timeout=150)
            if r.status_code in (429, 504):
                wait = RETRY_WAIT * attempt
                log(f"  {r.status_code} from {url.split('/')[2]}, retry in {wait}s...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()["elements"]
        except requests.RequestException as exc:
            last_err = exc
            wait = RETRY_WAIT * attempt
            log(f"  error ({exc}), retry in {wait}s...")
            time.sleep(wait)
    raise last_err


def main():
    with open(os.path.join(OUT, "gu_geometry.json"), encoding="utf-8") as f:
        gu_list = json.load(f)

    points, seen = [], set()

    for i, gu in enumerate(gu_list):
        if i:
            time.sleep(SLEEP_SEC)
        bbox = gu_bbox(gu["geometry"])
        log(f"[{i + 1}/{len(gu_list)}] {gu['gu_name']} ...")
        try:
            elements = fetch_gu(*bbox)
        except requests.RequestException as exc:
            log(f"  FAILED after retries: {exc}")
            continue

        added = 0
        for el in elements:
            oid = (el.get("type", "?"), el.get("id"))
            if oid in seen:
                continue
            tags = el.get("tags", {})
            val = tags.get("amenity") or tags.get("leisure")
            c = CATEGORY.get(val)
            if c is None:
                continue
            if el.get("type") == "node":
                lon, lat = el.get("lon"), el.get("lat")
            else:
                center = el.get("center") or {}
                lon, lat = center.get("lon"), center.get("lat")
            if lon is None or lat is None:
                continue
            seen.add(oid)
            points.append({"x": round(lon, 5), "y": round(lat, 5), "c": c})
            added += 1

        log(f"  +{added} (total {len(points)})")

    path = os.path.join(OUT, "amenity.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(points, f, separators=(",", ":"))
    log(f"\nwrote amenity.json  {len(points)} points  ({os.path.getsize(path) / 1024:,.0f} KB)")


if __name__ == "__main__":
    main()
