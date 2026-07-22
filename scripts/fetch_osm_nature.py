"""
One-time fetch: Seoul nature/green + water polygons from OpenStreetMap (Overpass
API) for the "Nature" context layer. Static city fabric, not data-driven. Stands
in for the Urban Features cooling variables (green_space_share, leisure land).

Green:  leisure=park|garden|recreation_ground, landuse=forest|grass|meadow|cemetery,
        natural=wood|scrub
Water:  natural=water, water=*, waterway=riverbank  (Han River, streams, ponds)

Scope: Seoul only (25 gu), per-gu bounding boxes from gu_geometry.json, deduped by
OSM id. Ways become polygons directly; relation (multipolygon) members are added
best-effort as individual outer polygons.

Run manually:  python scripts/fetch_osm_nature.py
                python scripts/fetch_osm_nature.py --resume
Writes to:     ./data/nature.json   (GeoJSON FeatureCollection; props {k:"green"|"water"})
"""
import argparse
import json
import os
import sys
import time
import requests
from shapely.geometry import Polygon, mapping, shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
HEADERS = {"User-Agent": "SeoulDataAtlas/1.0 (research prototype)"}

SIMPLIFY_TOL = 0.00006  # ~6-7 m; nature is a soft context layer, coarse is fine
SLEEP_SEC = 15
MIN_AREA = 5e-9
MAX_RETRIES = 5
RETRY_WAIT = 30


def log(msg):
    print(msg, flush=True)


def round_coords(obj, ndigits=5):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(v, ndigits) for v in obj]
        return [round_coords(o, ndigits) for o in obj]
    return obj


def gu_bbox(gu_geom):
    minx, miny, maxx, maxy = shape(gu_geom).bounds
    return (miny, minx, maxy, maxx)  # south, west, north, east


def classify(tags):
    if tags.get("natural") == "water" or tags.get("waterway") == "riverbank" or "water" in tags:
        return "water"
    if tags.get("natural") in ("wood", "scrub") or \
       tags.get("leisure") in ("park", "garden", "recreation_ground") or \
       tags.get("landuse") in ("forest", "grass", "meadow", "cemetery"):
        return "green"
    return None


def geom_to_polygon(geometry):
    coords = [(pt["lon"], pt["lat"]) for pt in geometry if "lon" in pt and "lat" in pt]
    if len(coords) < 3:
        return None
    poly = Polygon(coords)
    if not poly.is_valid:
        poly = poly.buffer(0)
    if poly.is_empty or poly.area < MIN_AREA:
        return None
    poly = poly.simplify(SIMPLIFY_TOL, preserve_topology=True)
    if poly.is_empty or poly.area < MIN_AREA:
        return None
    return poly


def fetch_gu(south, west, north, east):
    b = f"{south},{west},{north},{east}"
    q = (
        f"[out:json][timeout:180];"
        f"("
        f'way["leisure"~"^(park|garden|recreation_ground)$"]({b});'
        f'relation["leisure"~"^(park|garden|recreation_ground)$"]({b});'
        f'way["landuse"~"^(forest|grass|meadow|cemetery)$"]({b});'
        f'way["natural"~"^(wood|scrub|water)$"]({b});'
        f'relation["natural"="water"]({b});'
        f'way["waterway"="riverbank"]({b});'
        f'way["water"]({b});'
        f");"
        f"out geom;"
    )
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        url = OVERPASS_URLS[(attempt - 1) % len(OVERPASS_URLS)]
        try:
            r = requests.post(url, data={"data": q}, headers=HEADERS, timeout=200)
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


def add_feature(features, poly, kind):
    geom = mapping(poly)
    geom["coordinates"] = round_coords(geom["coordinates"])
    features.append({"type": "Feature", "properties": {"k": kind}, "geometry": geom})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", action="store_true",
                        help="keep existing nature.json and only fetch un-done gu")
    args = parser.parse_args()

    out_path = os.path.join(OUT, "nature.json")
    progress_path = os.path.join(OUT, "nature_fetch_progress.json")

    with open(os.path.join(OUT, "gu_geometry.json"), encoding="utf-8") as f:
        gu_list = json.load(f)

    if args.resume and os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as f:
            features = json.load(f).get("features", [])
        done_gu = set()
        if os.path.exists(progress_path):
            with open(progress_path, encoding="utf-8") as f:
                done_gu = set(json.load(f).get("completed_gu", []))
        log(f"resume: {len(features):,} features, {len(done_gu)} gu done")
    else:
        features, done_gu = [], set()

    for i, gu in enumerate(gu_list):
        name = gu["gu_name"]
        if name in done_gu:
            log(f"[{i + 1}/{len(gu_list)}] {name} - skip (done)")
            continue
        if i or done_gu:
            time.sleep(SLEEP_SEC)

        log(f"[{i + 1}/{len(gu_list)}] {name} ...")
        try:
            elements = fetch_gu(*gu_bbox(gu["geometry"]))
        except requests.RequestException as exc:
            log(f"  FAILED after retries: {exc}")
            continue

        added, seen = 0, set()
        for el in elements:
            kind = classify(el.get("tags", {}))
            if kind is None:
                continue
            oid = (el.get("type"), el.get("id"))
            if oid in seen:
                continue
            seen.add(oid)
            if el.get("type") == "way" and "geometry" in el:
                poly = geom_to_polygon(el["geometry"])
                if poly:
                    add_feature(features, poly, kind)
                    added += 1
            elif el.get("type") == "relation":
                for m in el.get("members", []):
                    if m.get("type") == "way" and m.get("role") != "inner" and "geometry" in m:
                        poly = geom_to_polygon(m["geometry"])
                        if poly:
                            add_feature(features, poly, kind)
                            added += 1

        done_gu.add(name)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))
        with open(progress_path, "w", encoding="utf-8") as f:
            json.dump({"completed_gu": sorted(done_gu)}, f)
        log(f"  +{added} features (total {len(features):,})")

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    log(f"\nwrote nature.json  {len(features):,} features  ({size_mb:.1f} MB)  "
        f"completed {len(done_gu)}/{len(gu_list)} gu")
    if len(done_gu) < len(gu_list):
        log("re-run:  python scripts/fetch_osm_nature.py --resume")
        sys.exit(1)


if __name__ == "__main__":
    main()
