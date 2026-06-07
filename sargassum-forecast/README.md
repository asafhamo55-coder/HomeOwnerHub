# Sargassum Forecast & Beaching-Risk Dashboard

An interactive, single-file web dashboard that maps **sargassum** (pelagic *Sargassum* seaweed) beaching risk across the Gulf of Mexico, the Mexican Caribbean, and the Florida coasts. It combines a colour-coded risk map, a seasonal Atlantic-belt overlay, drift-current arrows, biomass hotspots, and a suite of explanatory charts into a 6-month outlook (June–December 2026) that you can step through month by month. The dashboard is built as one self-contained `index.html` using Leaflet and Chart.js loaded from public CDNs — there is no build step, bundler, or server to run.

---

## What it shows

- **Interactive risk map** of 19 monitored beaches across the Gulf of Mexico, Mexican Caribbean, and Florida, with each site colour-coded on a green → yellow → orange → red scale by its modelled risk for the selected month.
- **Seasonal Atlantic belt overlay** — a schematic polygon representing the Great Atlantic Sargassum Belt, whose opacity waxes and wanes through the year to reflect the seasonal growth and decline of open-ocean biomass.
- **Drift-current arrows and biomass hotspots** illustrating the general transport pathways that carry sargassum westward toward the Caribbean and Gulf.
- **6-month month-stepper** — month buttons (June through December 2026) that re-compute and re-render the map, table, and overlay for the chosen month.
- **Per-beach sortable risk table** listing every monitored site with its country, modelled risk value, and tier; columns are sortable.
- **Four charts**:
  - Seasonal cycle (monthly climatological index across the year).
  - Annual GASB bloom magnitude, 2011–2025.
  - Regional phasing comparing how the season peaks at different times across ocean regions.
  - (Supporting context chart accompanying the above.)

---

## How to use / run

1. Open `index.html` in any modern web browser (double-click it, or use **File → Open**).
2. An **internet connection is required** — the map tiles, Leaflet, and Chart.js are all loaded from public CDNs at runtime.
3. Use the **month buttons** to step through the June–December 2026 outlook. Click table headers to sort, and click map markers for per-beach detail.

There is **no build and no install** — no Node, no package manager, no local server needed.

---

## Methodology

The per-beach risk shown on the map is computed in-page as:

> **risk = monthly 2011–2024 climatology × per-site baseline exposure**, then **capped at each site's known seasonal-peak tier**.

- The **monthly climatology** (the `SEASON` index) captures the average annual rhythm of sargassum abundance derived from the 2011–2024 record.
- Each site's **baseline exposure** scales that seasonal signal by how exposed the beach is to incoming rafts, given its coastline orientation and position relative to drift pathways.
- The result is **capped at the site's documented seasonal-peak tier** so that modelled values do not exceed the worst conditions historically reported for that location.

The **belt overlay** and the **regional phasing** curves are **schematic** — they are stylised representations drawn from the published literature rather than live satellite retrievals, intended to communicate spatial and temporal structure rather than to provide precise measurements.

---

## Data dictionary

All data structures below are defined inline in `index.html`.

| Structure | Description |
|-----------|-------------|
| `SEASON` | 12-month seasonal index, values **0–100**, capturing the annual abundance cycle. Peaks in **June (= 100)** and declines through the second half of the year. |
| `YEARS` | Annual peak belt biomass, **2011–2025**, in **million tonnes (Mt)**. Notable points: **2013 = no belt** (effectively zero), and **2025 ≈ 37.5 Mt**, an all-time record. |
| `SITES` | The 19 monitored beaches. Each entry holds: beach **name**, **country**, **lat/lng**, **exposure** (baseline susceptibility, **0–1**), and **peak tier** (the site's known worst seasonal tier, used as the cap). |
| `REGIONS` | Self-normalised monthly **phasing** curves for four regions — **Open Atlantic**, **Caribbean**, **Gulf**, and **E. Atlantic** — showing how the seasonal peak shifts in timing between regions. |
| `GASB_POLYGON` | Schematic polygon outlining the Great Atlantic Sargassum Belt for the overlay. |
| `ARROWS` | Schematic drift-current arrows indicating general transport direction. |
| `HOTSPOTS` | Schematic biomass hotspot markers. |

---

## Risk tiers

Each beach is classified into one of five tiers for the selected month:

| Tier | Meaning |
|------|---------|
| **None** | No meaningful sargassum expected; beaches effectively clear. |
| **Low** | Minor, scattered amounts possible; little impact on beach use. |
| **Moderate** | Noticeable accumulation likely; some cleanup and odour possible. |
| **High** | Substantial landings expected; significant impact on beach use and operations. |
| **Severe** | Major inundation likely; heavy accumulation, strong odour, and widespread disruption. |

---

## Sources

- **USF Optical Oceanography Lab — Sargassum Watch System (SaWS)** and its monthly **Outlook bulletins** — optics.marine.usf.edu/projects/SaWS/
- **NOAA CoastWatch / AOML — Sargassum Inundation Risk (SIR)** product.
- **Wang, M. et al. (2019).** "The great Atlantic Sargassum belt." *Science* **365**(6448): 83–87.
- **US EPA** — Great Atlantic Sargassum Belt (GASB) information pages.
- Presentation inspired by **sargassummonitoring.com** and its green / yellow / red citizen-report convention.

---

## Important caveats & disclaimer

- **2025–2026 figures are MODELED projections, not measurements.** They are derived from historical climatology and schematic assumptions, not from real-time observations of the current season.
- **Open-ocean biomass ≠ beaching volume.** The amount of sargassum floating offshore does not directly translate to how much lands on a given beach; actual landings depend heavily on local **winds and currents** at the time.
- **Verify against the latest USF SaWS bulletin** before any operational or decision-making use. This dashboard is a communication and planning aid, not an authoritative forecast.
- **Not for navigation or any safety-critical use.** Do not rely on this tool for vessel routing, emergency response, or other situations where accuracy is essential to safety.

---

## Going live with real data

The dashboard ships with one **real, near-real-time** layer already wired in: the
**🛰️ Live chlorophyll** toggle adds a NASA EOSDIS **GIBS MODIS-Aqua chlorophyll-a**
tile layer (no auth, CORS-friendly, Leaflet-ready). Chlorophyll-a is a *proxy* for
floating-algae blooms — it is not a sargassum-specific product, but it shows genuine
current ocean conditions alongside the modeled outlook.

To replace more of the modeled layers with authoritative data, the recommended phased
plan (from the integration research) is:

| Phase | What | Source | Backend needed? |
|-------|------|--------|-----------------|
| **1** *(done)* | Live satellite tiles | **NASA GIBS** WMTS (MODIS/VIIRS chlorophyll-a) — `gibs.earthdata.nasa.gov`, no auth, CORS-clean | No — client-side |
| **2** | Real coastal **risk categories** | **NOAA SIR** (AOML/CoastWatch) GeoJSON + ERDDAP `noaa_aoml_atlantic_oceanwatch_AFAI_7D` | Yes — small proxy (host blocks bots / CORS; normalize NOAA tiers → the 5-tier ramp; cache daily) |
| **3** | Real **drift** overlay | **Copernicus Marine** surface currents (GLORYS / `GLOBAL_ANALYSISFORECAST_PHY_001_024`) via the `copernicusmarine` toolbox | Yes — scheduled job (auth + NetCDF; precompute particle advection) |

Key sources for going live:

- **NOAA Sargassum Inundation Risk (SIR)** — the single best operational source, since it
  natively outputs coastal beaching-**risk categories**: daily maps at `cwcgom.aoml.noaa.gov/SIR/`,
  GeoJSON risk geometries, and an ERDDAP server (`cwcgom.aoml.noaa.gov/erddap/`) exposing
  NetCDF/GeoTIFF/PNG/WMS/OPeNDAP. Free, no auth. *Note: the host blocks non-browser user-agents,
  so a tiny serverless proxy is needed.*
- **USF SaWS** — monthly Outlook PDFs at a predictable URL
  (`…/Sargassum_outlook_<YEAR>_bulletin<NN>_USF.pdf`) plus daily AFAI/density imagery. Host also
  blocks bots → proxy.
- **NASA GIBS** — `gibs.earthdata.nasa.gov/wmts/epsg3857/best/…` — the only fully client-side option.
- **Copernicus Marine Service** — ocean-colour (`OCEANCOLOUR_GLO_BGC_L3_NRT_009_101`) and currents
  products; free account; WMTS viz tiles are browser-usable, bulk NetCDF needs a backend.
- **sargassummonitoring.com** — citizen-science map, **no public API** — link out / attribute only,
  do not scrape.

> The repo is a Next.js monorepo (`apps/`) with existing serverless route handlers, so a
> `sargassum-forecast` API route is a natural home for the Phase-2 NOAA SIR proxy.
