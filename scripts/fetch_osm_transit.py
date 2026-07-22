"""
One-time fetch: Seoul public-transport geometry from OpenStreetMap (Overpass API)
for the "Transit" context layer — subway lines, subway stations/entrances, and
bus stops. Static city fabric, not data-driven. Stands in for the Urban Features
accessibility variables (subway_access_coverage, bus_stop_density).

Scope: Seoul only (25 gu). Citywide node queries are heavy, so we fetch per-gu
bounding boxes from gu_geometry.json and dedupe by OSM id.

Run manually:  python scripts/fetch_osm_transit.py
Writes to:     ./data/transit.json
               { "subwayLines": [[[lon,lat],...], ...],
                 "stations":    [[lon,lat], ...],
                 "busStops":    [[lon,lat], ...] }
"""
import json
import os
import time
import requests
from shapely.geometry import LineString, shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data")

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
HEADERS = {"User-Agent": "SeoulDataAtlas/1.0 (research prototype)"}

SIMPLIFY_TOL = 0.00006
SLEEP_SEC = 12
MAX_RETRIES = 5
RETRY_WAIT = 30


def log(msg):
    print(msg, flush=True)


def gu_bbox(gu_geom):
    minx, miny, maxx, maxy = shape(gu_geom).bounds
    return (miny, minx, maxy, maxx)  # south, west, north, east


def fetch_gu(south, west, north, east):
    q = (
        f"[out:json][timeout:120];"
        f"("
        f'way["railway"="subway"]({south},{west},{north},{east});'
        f'node["railway"~"^(station|subway_entrance)$"]({south},{west},{north},{east});'
        f'node["station"="subway"]({south},{west},{north},{east});'
        f'node["highway"="bus_stop"]({south},{west},{north},{east});'
        f");"
        f"out geom;"
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


def simplify_line(geometry):
    coords = [(pt["lon"], pt["lat"]) for pt in geometry]
    if len(coords) < 2:
        return None
    line = LineString(coords).simplify(SIMPLIFY_TOL, preserve_topology=False)
    if line.is_empty:
        return None
    return [[round(x, 5), round(y, 5)] for x, y in line.coords]


def main():
    with open(os.path.join(OUT, "gu_geometry.json"), encoding="utf-8") as f:
        gu_list = json.load(f)

    subway_lines = []
    stations, bus_stops = [], []
    seen_ways, seen_station, seen_bus = set(), set(), set()

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

        for el in elements:
            t, oid = el.get("type"), el.get("id")
            tags = el.get("tags", {})
            if t == "way" and tags.get("railway") == "subway" and "geometry" in el:
                if oid in seen_ways:
                    continue
                seen_ways.add(oid)
                simp = simplify_line(el["geometry"])
                if simp:
                    subway_lines.append(simp)
            elif t == "node":
                pt = [round(el["lon"], 5), round(el["lat"], 5)]
                if tags.get("highway") == "bus_stop":
                    if oid not in seen_bus:
                        seen_bus.add(oid)
                        bus_stops.append(pt)
                else:  # railway station / subway_entrance / station=subway
                    if oid not in seen_station:
                        seen_station.add(oid)
                        stations.append(pt)

        log(f"  lines {len(subway_lines)} · stations {len(stations)} · bus {len(bus_stops)}")

    out = {"subwayLines": subway_lines, "stations": stations, "busStops": bus_stops}
    path = os.path.join(OUT, "transit.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    log(
        f"\nwrote transit.json  {len(subway_lines)} subway paths · "
        f"{len(stations)} stations · {len(bus_stops)} bus stops  "
        f"({os.path.getsize(path) / 1024:,.0f} KB)"
    )


if __name__ == "__main__":
    main()
