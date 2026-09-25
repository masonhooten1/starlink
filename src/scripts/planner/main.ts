/**
 * Planner controller: wires the shared geometry core (src/lib) to a Leaflet
 * map. Loaded only on /planner/; Leaflet itself is imported dynamically so
 * its ~42 KB gzipped bundle never reaches any other route.
 *
 * All placement math lives in src/lib — this file is DOM and event wiring.
 */
import type { Circle, GeoJSON, Marker } from "leaflet";
import { GEOCODER, TILE, WEDGE } from "../../config";
import { defaultWedgeAzimuth, destination, wedgeSectorGeoJSON } from "../../lib/geo";
import { decodePlan, encodePlan, type PlanState } from "../../lib/shareState";
import {
  formatBearing,
  formatLatLng,
  guidanceLine,
  initialBearing,
  nextSearchAllowedMs,
  nominatimUrl,
  pickSearchResult,
  wrapDegrees,
} from "../../lib/plannerModel";

type Leaflet = typeof import("leaflet");

// Colors duplicated from the --color-* tokens in global.css (the tokens are
// CSS custom properties, unreadable from TypeScript without getComputedStyle).
const WEDGE_COLOR = "#1d5fd6";
const WEDGE_FILL = "#7fd3ff";
const RING_COLOR = "#1c2733";

const PIN_SVG = `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M15 1C7.8 1 2 6.8 2 14c0 9.5 13 27 13 27s13-17.5 13-27C28 6.8 22.2 1 15 1Z" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="15" cy="13.5" r="4.5" fill="#fff"/></svg>`;

interface PlannerDom {
  sheet: HTMLDivElement;
  empty: HTMLDivElement;
  ready: HTMLDivElement;
  searchForm: HTMLFormElement;
  searchInput: HTMLInputElement;
  searchBtn: HTMLButtonElement;
  locateBtn: HTMLButtonElement;
  rotate: HTMLInputElement;
  azOut: HTMLOutputElement;
  coords: HTMLParagraphElement;
  guidance: HTMLParagraphElement;
  shareBtn: HTMLButtonElement;
  toast: HTMLParagraphElement;
}

/**
 * Look up one of the planner's server-rendered elements. The single cast is
 * the DOM-lookup seam: the shell and this controller ship together, so a
 * missing element is a bug we want to fail loudly on, not work around.
 */
function getElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Planner shell is missing #${id} — page and script drifted apart.`);
  return node as T;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function collectDom(): PlannerDom {
  return {
    sheet: getElement<HTMLDivElement>("planner-sheet"),
    empty: getElement<HTMLDivElement>("planner-empty"),
    ready: getElement<HTMLDivElement>("planner-ready"),
    searchForm: getElement<HTMLFormElement>("planner-search"),
    searchInput: getElement<HTMLInputElement>("planner-search-input"),
    searchBtn: getElement<HTMLButtonElement>("planner-search-btn"),
    locateBtn: getElement<HTMLButtonElement>("planner-locate"),
    rotate: getElement<HTMLInputElement>("planner-rotate"),
    azOut: getElement<HTMLOutputElement>("planner-az"),
    coords: getElement<HTMLParagraphElement>("planner-coords"),
    guidance: getElement<HTMLParagraphElement>("planner-guidance"),
    shareBtn: getElement<HTMLButtonElement>("planner-share"),
    toast: getElement<HTMLParagraphElement>("planner-toast"),
  };
}

/** Replace the sheet with a recovery notice — the map never half-works. */
function failPlanner(dom: PlannerDom, error: unknown): void {
  console.error("Planner failed to start:", error);
  dom.empty.hidden = true;
  dom.sheet.innerHTML =
    '<div class="sheet-state"><h2>The map could not load</h2>' +
    '<p class="sheet-lede">Check your connection and reload the page. ' +
    "The guides below still cover placement decisions without the map.</p></div>";
}

function startPlanner(L: Leaflet, dom: PlannerDom): void {
  const map = L.map("planner-map", { zoomControl: true });
  // Give the map its view BEFORE adding any layer. Leaflet adds layers queued
  // on the map's 'load' event while it has no view, and the lazily-created
  // vector renderer never gets its pixel bounds set in that cascade — the
  // first polygon added then throws in _clipPoints.
  map.setView([20, 0], 2);
  // Esri World Imagery per config; the attribution control is always on.
  L.tileLayer(TILE.url, {
    attribution: TILE.attribution,
    maxZoom: TILE.maxZoom,
  }).addTo(map);

  let plan: PlanState | null = null;
  let pin: Marker | null = null;
  let handle: Marker | null = null;
  let wedgeLayer: GeoJSON | null = null;
  const ringCircles: Circle[] = [];

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const showToast = (message: string): void => {
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove("is-visible"), 4500);
  };

  const syncUrl = (): void => {
    if (plan) history.replaceState(null, "", encodePlan(plan));
  };

  /** Redraw every placement affordance from the current plan. */
  const render = (moveHandle: boolean): void => {
    if (!plan || !pin || !handle || !wedgeLayer) return;
    pin.setLatLng([plan.lat, plan.lng]);
    wedgeLayer
      .clearLayers()
      .addData(wedgeSectorGeoJSON(plan.lat, plan.lng, plan.az, WEDGE.spreadDeg, WEDGE.tipRadiusM));
    for (const ring of ringCircles) ring.setLatLng([plan.lat, plan.lng]);
    if (moveHandle) handle.setLatLng(destination(plan.lat, plan.lng, plan.az, WEDGE.tipRadiusM));
    dom.coords.textContent = formatLatLng(plan.lat, plan.lng);
    dom.azOut.textContent = formatBearing(plan.az);
    dom.rotate.value = String(wrapDegrees(Math.round(plan.az)));
    dom.guidance.textContent = guidanceLine(plan.lat, plan.az);
  };

  const showReady = (): void => {
    dom.empty.hidden = true;
    dom.ready.hidden = false;
  };

  /** Create the pin, wedge, handle, and rings once, on first placement. */
  const ensureLayers = (): void => {
    if (!plan || pin || handle || wedgeLayer) return;
    const position: [number, number] = [plan.lat, plan.lng];
    // One shared SVG renderer for every vector layer: initialized once against
    // the settled map instead of lazily per layer.
    const vectorRenderer = L.svg({ padding: 0.5 });

    wedgeLayer = L.geoJSON(
      wedgeSectorGeoJSON(plan.lat, plan.lng, plan.az, WEDGE.spreadDeg, WEDGE.tipRadiusM),
      {
        renderer: vectorRenderer,
        interactive: false,
        style: {
          color: WEDGE_COLOR,
          weight: 2,
          opacity: 0.9,
          fillColor: WEDGE_FILL,
          fillOpacity: 0.3,
        },
      },
    ).addTo(map);

    for (const meters of WEDGE.ringsM) {
      ringCircles.push(
        L.circle(position, {
          radius: meters,
          renderer: vectorRenderer,
          interactive: false,
          color: RING_COLOR,
          weight: 1,
          opacity: 0.55,
          fill: false,
          dashArray: "4 6",
        }).addTo(map),
      );
    }

    pin = L.marker(position, {
      draggable: true,
      icon: L.divIcon({
        className: "planner-pin",
        html: PIN_SVG,
        iconSize: [30, 42],
        iconAnchor: [15, 40],
      }),
      keyboard: true,
      alt: "Dish placement pin — drag to move",
    }).addTo(map);
    pin.on("drag", () => {
      if (!plan || !pin) return;
      const next = pin.getLatLng();
      plan.lat = next.lat;
      plan.lng = next.lng;
      render(true);
    });
    pin.on("dragend", syncUrl);

    // The wedge handle rides the arc tip; dragging it swings the wedge.
    handle = L.marker(destination(plan.lat, plan.lng, plan.az, WEDGE.tipRadiusM), {
      draggable: true,
      icon: L.divIcon({
        className: "planner-handle",
        html: '<span aria-hidden="true"></span>',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
      keyboard: true,
      alt: "Wedge rotation handle — drag to rotate the open-sky wedge",
    }).addTo(map);
    handle.on("drag", () => {
      if (!plan || !handle) return;
      const next = handle.getLatLng();
      plan.az = initialBearing(plan.lat, plan.lng, next.lat, next.lng);
      render(false); // the handle is mid-drag — never move it under the pointer
    });
    handle.on("dragend", () => {
      render(true); // snap the handle back onto the arc tip
      syncUrl();
    });
  };

  /** Interactive placement (map tap, search, or GPS): first placement takes
   * the hemisphere default; later moves keep the chosen direction. */
  const placePin = (lat: number, lng: number): void => {
    const az = plan ? plan.az : defaultWedgeAzimuth(lat);
    plan = { lat, lng, az };
    ensureLayers();
    showReady();
    render(true);
    syncUrl();
  };

  map.on("click", (event) => {
    const wasFirst = plan === null;
    placePin(event.latlng.lat, event.latlng.lng);
    // A tap at world zoom leaves the wedge sub-pixel — pull in so the
    // placement tools mean something (search and GPS already fly close).
    if (wasFirst && map.getZoom() < 15) map.flyTo(event.latlng, 16);
  });

  let tileNoticeShown = false;
  map.on("tileerror", () => {
    if (tileNoticeShown) return;
    tileNoticeShown = true;
    showToast(
      "Satellite imagery is not loading right now — the planner still works, and imagery usually returns when you retry.",
    );
  });

  // Address search: throttled per GEOCODER.minDelayMs, every failure falls
  // back to manual pan — the planner never dead-ends.
  let lastSearchAt: number | null = null;
  let searchInFlight = false;
  dom.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = dom.searchInput.value.trim();
    if (!query || searchInFlight) return;
    searchInFlight = true;
    dom.searchBtn.disabled = true;
    dom.searchBtn.textContent = "Searching…";
    const finish = (): void => {
      searchInFlight = false;
      dom.searchBtn.disabled = false;
      dom.searchBtn.textContent = "Search address";
    };
    void (async () => {
      try {
        const wait = nextSearchAllowedMs(lastSearchAt, Date.now(), GEOCODER.minDelayMs);
        if (wait > 0) await sleep(wait);
        lastSearchAt = Date.now();
        const response = await fetch(nominatimUrl(GEOCODER.endpoint, query), {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Nominatim responded ${response.status}`);
        const payload: unknown = await response.json();
        const result = pickSearchResult(payload);
        if (!result) throw new Error("Nominatim returned no usable result");
        map.flyTo([result.lat, result.lng], 18);
        placePin(result.lat, result.lng);
        dom.searchInput.value = "";
      } catch {
        showToast("Address search is unavailable — pan the map and tap to drop your pin.");
      } finally {
        finish();
      }
    })();
  });

  // Device location: permission failures name the two remaining paths.
  dom.locateBtn.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      showToast(
        "Location is unavailable — search an address or pan the map and tap to drop your pin.",
      );
      return;
    }
    dom.locateBtn.disabled = true;
    dom.locateBtn.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        dom.locateBtn.disabled = false;
        dom.locateBtn.textContent = "Use my location";
        const { latitude, longitude } = position.coords;
        map.flyTo([latitude, longitude], 17);
        placePin(latitude, longitude);
      },
      () => {
        dom.locateBtn.disabled = false;
        dom.locateBtn.textContent = "Use my location";
        showToast(
          "Location is unavailable — search an address or pan the map and tap to drop your pin.",
        );
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  });

  // Rotation: slider input redraws live; the URL syncs on release.
  dom.rotate.addEventListener("input", () => {
    if (!plan) return;
    plan.az = Number(dom.rotate.value);
    render(true);
  });
  dom.rotate.addEventListener("change", syncUrl);

  // Share: the full plan is the URL — copy it, with a legacy fallback.
  dom.shareBtn.addEventListener("click", () => {
    if (!plan) return;
    const url = `${location.origin}${location.pathname}${encodePlan(plan)}`;
    const announceCopied = (): void =>
      showToast("Share link copied — paste it to whoever holds the drill.");
    const fallbackCopy = (): void => {
      const area = document.createElement("textarea");
      area.value = url;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      area.remove();
      if (copied) {
        announceCopied();
      } else {
        showToast("Copying failed — the share link is in the address bar.");
      }
    };
    if (typeof navigator.clipboard?.writeText === "function") {
      navigator.clipboard.writeText(url).then(announceCopied, fallbackCopy);
    } else {
      fallbackCopy();
    }
  });

  // Opened with a plan in the URL? Restore it; otherwise world view.
  const initial = decodePlan(new URLSearchParams(location.search));
  if (initial) {
    plan = initial;
    // View first, then layers: never add vector layers to a map with no view.
    map.setView([initial.lat, initial.lng], 17);
    ensureLayers();
    showReady();
    render(true);
    syncUrl(); // normalize the URL (e.g. az=361 → 1) so re-shares are clean
  }
}

function init(): void {
  const dom = collectDom();
  void import("leaflet")
    .then((L) => {
      startPlanner(L, dom);
    })
    .catch((error: unknown) => {
      failPlanner(dom, error);
    });
}

init();
