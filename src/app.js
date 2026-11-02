import {
  initAuth,
  token,
  currentUser,
  emailAuth,
  googleAuth,
  logout,
  resetPassword,
  sendOtp,
  confirmOtp,
  authError,
  clearCaptcha,
} from "./auth.js";
import {
  $,
  $$,
  esc,
  icon,
  icons,
  money,
  dateLabel,
  timeLabel,
  badge,
  empty,
  notice,
  modal,
  toast,
  busy,
  field,
  options,
  statusText,
} from "./ui.js";
import { renderAdmin } from "./admin.js";
import { PHOTOS, credit, ball, pageEnter, heroSlides, initMotion } from "./motion.js";
import { GROUNDS, districtCount, keralaMap, groundsTeaser, groundsFallback, renderGrounds } from "./grounds.js";
const state = {
  config: null,
  user: null,
  authReady: false,
  location: null,
  search: { q: "", district: "", date: "", format: "", available: false },
  bookingFilter: "upcoming",
  returnTo: "/",
  payment: "upi",
};
let routeVersion = 0,
  cleanup = () => {};
export async function api(path, method = "GET", body) {
  const idToken = await token();
  const r = await fetch("/api" + path, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(
      data.error?.message || "Unable to complete your request.",
    );
    Object.assign(e, data.error);
    throw e;
  }
  return data;
}
function theme(value) {
  document.documentElement.dataset.theme = value;
  try {
    localStorage.setItem("turf-theme", value);
  } catch {}
  $("#theme-button")?.setAttribute(
    "aria-label",
    value === "dark" ? "Switch to light theme" : "Switch to dark theme",
  );
  if ($("#theme-button")) {
    $("#theme-button").innerHTML = icon(value === "dark" ? "sun" : "moon");
    icons();
  }
}
try {
  theme(
    localStorage.getItem("turf-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
} catch {
  theme("light");
}
function brand() {
  return `<a class="brand" href="/" aria-label="${esc(state.config.business)} home"><span>${ball("brand-ball")}</span>${esc(state.config.business)}</a>`;
}
function shell() {
  const p = location.pathname;
  $("#header").innerHTML =
    `<div class="header-inner">${brand()}<nav class="nav" aria-label="Main navigation"><a class="${p === "/" || p.startsWith("/turfs/") ? "active" : ""}" href="/">Find a turf</a><a class="${p === "/grounds" ? "active" : ""}" href="/grounds">Grounds map</a><a class="${p === "/bookings" ? "active" : ""}" href="/bookings">My bookings</a>${state.user?.role === "admin" ? `<a class="${p.startsWith("/admin") ? "active" : ""}" href="/admin">Admin</a>` : ""}</nav><div class="header-actions"><span class="header-location">${icon("map-pin")}Kerala, India</span><button id="theme-button" class="icon-button" title="Switch theme" aria-label="Switch theme">${icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon")}</button><a class="outline" href="${state.user ? "/profile" : "/login"}">${icon("user-round")}${state.user ? esc(state.user.name.split(" ")[0] || "Profile") : "Sign in"}</a></div></div>`;
  $("#theme-button").onclick = () =>
    theme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  $("#footer").innerHTML =
    `${brand()}<span>Made for the love of the game. Photographs of Malappuram by Wikimedia Commons contributors.</span><div class="footer-links"><a href="/grounds">Grounds map</a><a href="/contact">Contact</a><a href="/policy">Cancellation & refunds</a><span>Kerala, India</span></div>`;
  icons();
}
export function navigate(path) {
  if (!path.startsWith("/") || path.startsWith("//")) path = "/";
  history.pushState({}, "", path);
  route();
  window.scrollTo({ top: 0 });
  $("#main").focus({ preventScroll: true });
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (
    !a ||
    e.ctrlKey ||
    e.metaKey ||
    e.shiftKey ||
    a.target ||
    a.hasAttribute("download")
  )
    return;
  const url = new URL(a.href, location.origin);
  // Same-page #section links scroll natively; links to another page stay in the app.
  if (url.origin === location.origin && (!url.hash || url.pathname !== location.pathname)) {
    e.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  }
});
window.addEventListener("popstate", route);
$("#close-modal").onclick = () => $("#modal").close();
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $("#modal").close();
  }
});
const pageTop = (title, text, back = "") =>
  `<div class="page-top">${back ? `<a class="back" href="${back}">${icon("arrow-left")} Back</a>` : ""}<h1>${esc(title)}</h1><p>${esc(text)}</p></div>`;
function guard(admin = false) {
  if (!state.config.firebaseReady) {
    $("#main").innerHTML =
      pageTop(admin ? "Admin access" : "Your account", "") +
      empty(
        "Account setup is in progress",
        "Sign-in will be available once the marketplace account service is connected.",
        `<a class="outline" href="/">${icon("arrow-left")}Back to turfs</a>`,
      );
    icons();
    return false;
  }
  if (!state.authReady) {
    $("#main").innerHTML =
      '<div class="loading">Restoring your session...</div>';
    return false;
  }
  if (!state.user) {
    state.returnTo = location.pathname + location.search;
    login();
    return false;
  }
  if (admin && state.user.role !== "admin") {
    $("#main").innerHTML =
      pageTop("Administrator access required", "") +
      empty(
        "This area is for administrators",
        "Your account can browse turfs and manage your own bookings.",
        `<a class="primary" href="/">Find a turf</a>`,
      );
    icons();
    return false;
  }
  return true;
}
async function route() {
  const version = ++routeVersion;
  cleanup();
  cleanup = () => {};
  shell();
  pageEnter();
  const path = location.pathname;
  try {
    if (path === "/") return await discovery(version);
    if (path === "/login") return login();
    if (path === "/grounds") return renderGrounds();
    if (path === "/login/phone") return phoneLogin();
    if (path.startsWith("/turfs/"))
      return await turfDetail(path.split("/")[2], version);
    if (path.startsWith("/checkout/")) {
      if (guard()) return await checkout(path.split("/")[2], version);
      return;
    }
    if (path === "/bookings") {
      if (guard()) return await bookings(version);
      return;
    }
    if (path === "/profile") {
      if (guard()) return profile();
      return;
    }
    if (path.startsWith("/admin")) {
      if (guard(true))
        return await renderAdmin({
          api,
          navigate,
          state,
          version,
          isCurrent: () => version === routeVersion,
        });
      return;
    }
    if (path === "/contact") {
      contact();
      return;
    }
    if (path === "/policy") {
      $("#main").innerHTML =
        `<section class="policy">${pageTop("Cancellation & refunds", "", "/")}<p>${esc(state.config.refundPolicy || "The business refund policy will be published before bookings open.")}</p><p class="muted small">Each turf displays its cancellation cutoff and refund percentage before you book. Refunds are returned to the original payment method.</p>${state.config.legalName ? `<p>${esc(state.config.legalName)}</p>` : ""}</section>`;
      icons();
      return;
    }
    $("#main").innerHTML =
      pageTop("Page not found", "") +
      empty(
        "Let’s get you back on the pitch.",
        "This page does not exist.",
        `<a class="primary" href="/">Find a turf</a>`,
      );
    icons();
  } catch (e) {
    if (version !== routeVersion) return;
    $("#main").innerHTML =
      pageTop("We couldn’t load this page", "") +
      notice(e.message, "error") +
      '<button class="outline" id="retry-page">Try again</button>';
    $("#retry-page").onclick = route;
    icons();
  }
}
async function discovery(version) {
  const s = state.search;
  $("#main").innerHTML =
    `<section class="intro" aria-label="Football in Malappuram"><div class="hero-slides" aria-hidden="true">${HERO.map((k, i) => `<img class="hero-slide${i ? "" : " active"}" data-photo="${k}" src="/media/${PHOTOS[k].file}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>`).join("")}</div><div class="floodlight" aria-hidden="true"></div>${pitchLines}<a class="hero-map" href="/grounds" aria-label="Explore ${GROUNDS.length} real grounds on the Kerala map">${keralaMap({ cls: "hero", label: false })}<span class="hero-map-label"><strong data-count="${GROUNDS.length}">${GROUNDS.length}</strong>real grounds in ${districtCount} districts</span></a><div class="intro-content"><div class="hero-location">${icon("map-pin")}From Malappuram, Kerala’s football heartland</div><h1><span class="line"><span>Good friends.</span></span><span class="line"><span>Great games.</span></span></h1><p>Your next game starts here. Find a turf nearby<br class="desktop-break"> and make time for your team.</p><a class="hero-link" href="#search-form">Find your next pitch ${icon("arrow-down")}</a></div><div class="hero-caption"><span id="hero-place">${PHOTOS[HERO[0]].place}</span>${credit(PHOTOS[HERO[0]]).replace("<a ", '<a id="hero-credit" ')}</div><div class="hero-dots">${HERO.map((k, i) => `<button type="button" aria-label="Show ${esc(PHOTOS[k].place)}" aria-current="${!i}"></button>`).join("")}</div><div class="hero-roll" aria-hidden="true">${ball()}</div></section><section class="search-section" aria-label="Find a turf"><form id="search-form" class="search-grid"><label class="field"><span>Turf or town</span><div class="input-icon">${icon("search")}<input name="q" id="search-query" placeholder="Where are you playing?" value="${esc(s.q)}"></div></label><label class="field"><span>District</span><select name="district">${options(state.config.districts, s.district, "All Kerala districts")}</select></label>${field("Game date", "date", s.date, `type="date" min="${state.config.today}" required`)}<button class="primary">${icon("search")}Find a turf</button></form><div class="search-secondary"><button class="quiet" id="near-me">${icon("locate-fixed")}Use my location</button><button class="quiet" id="town-search">${icon("map-pin")}Search a locality</button><label class="check-label"><input type="checkbox" id="available-only" ${s.available ? "checked" : ""}>Available slots only</label>${state.location ? `<span class="location-chip">${icon("navigation")}${esc(state.location.name)}<button class="icon-button" id="clear-location" title="Clear location" aria-label="Clear location">${icon("x")}</button></span>` : ""}</div><div id="location-message" role="status"></div></section>${ticker()}<div class="section-heading discovery-heading"><div><h2>${s.district ? `Turfs in ${esc(s.district)}` : state.location ? "Turfs near you" : "Find your home ground"}</h2><p id="result-count">Checking available pitches...</p><span id="listing-status" class="small muted" role="status"></span></div><div class="segmented" aria-label="Team size">${[
      ["", "All turfs"],
      ["5", "5-a-side"],
      ["7", "7-a-side"],
      ["9", "9-a-side"],
      ["11", "11-a-side"],
    ]
      .map(
        ([v, l]) =>
          `<button data-format="${v}" class="${s.format === v ? "active" : ""}" aria-pressed="${s.format === v}">${l}</button>`,
      )
      .join(
        "",
      )}</div></div><div class="discovery-body"><section id="results" aria-live="polite"><div class="loading">Finding turfs...</div></section><aside class="sidebar"><div class="district-heading">${icon("map-pin")}<h3>Where’s your game?</h3></div><p class="small muted">Find a ground in your district.</p><div class="district-list">${state.config.districts.map((d) => `<button data-district="${d}" class="${s.district === d ? "active" : ""}">${d}${icon("chevron-right")}</button>`).join("")}</div></aside></div>${groundsTeaser(s.district)}${story()}${contactBand()}`;
  heroSlides();
  $$("[data-town]").forEach(
    (b) =>
      (b.onclick = () => {
        Object.assign(s, { q: b.dataset.town, district: "Malappuram" });
        state.location = null;
        route();
      }),
  );
  $("#search-form").onsubmit = (e) => {
    e.preventDefault();
    Object.assign(s, Object.fromEntries(new FormData(e.target)));
    route();
  };
  $("#available-only").onchange = (e) => {
    s.available = e.target.checked;
    route();
  };
  $$("[data-format]").forEach(
    (b) =>
      (b.onclick = () => {
        s.format = b.dataset.format;
        route();
      }),
  );
  $$("[data-district]").forEach(
    (b) =>
      (b.onclick = () => {
        s.district = b.dataset.district;
        state.location = null;
        route();
      }),
  );
  $("#clear-location")?.addEventListener("click", () => {
    state.location = null;
    route();
  });
  $("#near-me").onclick = () => locate();
  $("#town-search").onclick = townSearch;
  icons();
  const params = new URLSearchParams({
    ...s,
    available: String(s.available),
    ...(state.location
      ? {
          lat: state.location.coordinates.lat,
          lng: state.location.coordinates.lng,
          radius: 50,
        }
      : {}),
  });
  let inFlight = false, lastResult = "";
  async function refresh(initial = false) {
    if (inFlight || version !== routeVersion) return;
    inFlight = true;
    try {
      const data = await api("/turfs?" + params);
      if (version !== routeVersion) return;
      $("#listing-status").textContent = "";
      const signature = JSON.stringify(data);
      if (signature === lastResult) return;
      lastResult = signature;
      $("#result-count").textContent =
        `${data.turfs.length} ${data.turfs.length === 1 ? "turf" : "turfs"} · ${dateLabel(s.date)}`;
      const fallback = data.turfs.length
        ? ""
        : groundsFallback({ district: s.district, q: s.q, near: state.location?.coordinates });
      $("#results").innerHTML = data.turfs.length
        ? `<div class="turf-grid">${data.turfs.map((t) => `<article class="turf-card"><a href="/turfs/${t.id}?date=${s.date}" class="turf-photo" aria-label="View ${esc(t.name)}">${t.coverImageId ? `<img src="/api/images/${t.coverImageId}" alt="${esc(t.name)}" loading="lazy">` : `<div class="pitch-placeholder" aria-hidden="true"><span class="pitch-center"></span></div><span class="photo-pending">Photos coming soon</span>`}<span class="photo-badge">${t.formats.map((n) => n + "-a-side").join(" / ")}</span></a><div class="turf-content"><h3><a href="/turfs/${t.id}?date=${s.date}">${esc(t.name)}</a></h3><div class="location">${icon("map-pin")}${esc(t.town)}, ${esc(t.district)}${t.distance !== undefined ? ` · ${t.distance.toFixed(1)} km` : ""}</div><div class="tags"><span class="tag">${esc(t.surface)}</span>${t.formats.map((n) => `<span class="tag">${n * 2} players</span>`).join("")}</div><div class="card-bottom"><div><div class="price">${money(t.price)} <small>/ ${t.slotDuration} min</small></div><span class="availability">${t.openSlots ? t.openSlots + " open slots" : "No open slots on this date"}</span></div><a class="outline" href="/turfs/${t.id}?date=${s.date}">View slots ${icon("arrow-up-right")}</a></div></div></article>`).join("")}</div>`
        : empty(
            state.location
              ? "No bookable turfs within 50 km yet"
              : s.district && fallback
                ? `No bookable turfs in ${s.district} yet`
                : s.district || s.q || s.format || s.available
                  ? "No pitches match this search"
                  : "The next kick-off is coming.",
            fallback
              ? "TurfKerala is still signing up venues here. Meanwhile, these real grounds are nearby."
              : s.district || s.q || s.format || s.available || state.location
                ? "Try another district, date, or team size to find your next game."
                : "New grounds will appear here as they join. Check back soon to find your next game.",
            `<button id="clear-filters" class="outline">${icon("refresh-cw")}Explore all Kerala</button>`,
          ) + fallback;
      $("#clear-filters")?.addEventListener("click", () => {
        Object.assign(s, { q: "", district: "", format: "", available: false });
        state.location = null;
        route();
      });
      icons();
    } catch (error) {
      if (version !== routeVersion) return;
      if (initial) throw error;
      $("#listing-status").textContent = "Couldn’t refresh listings. We’ll retry shortly.";
    } finally {
      inFlight = false;
    }
  }
  await refresh(true);
  if (version !== routeVersion) return;
  const onVisible = () => { if (!document.hidden) void refresh(); };
  const timer = setInterval(onVisible, 30000);
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  cleanup = () => {
    clearInterval(timer);
    window.removeEventListener("focus", onVisible);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
const HERO = ["evening", "ground", "match"];
const TOWNS = ["Manjeri", "Tirur", "Perinthalmanna", "Kottakkal", "Nilambur", "Ponnani", "Kondotty", "Tanur", "Valanchery", "Areekode", "Malappuram", "Parappanangadi"];
const pitchLines = `<svg class="pitch-lines" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect x="40" y="40" width="1120" height="440" rx="4"/><path d="M600 40v440"/><circle cx="600" cy="260" r="78"/><circle cx="600" cy="260" r="4" class="spot"/><path d="M40 150h150v220H40M1160 150h-150v220h150M40 205h55v110H40M1160 205h-55v110h55"/><path d="M190 205a80 80 0 0 1 0 110M1010 205a80 80 0 0 0 0 110"/></svg>`;
function ticker() {
  const items = TOWNS.map((t) => `<button type="button" data-town="${t}">${ball("tick-ball")}${t}</button>`).join("");
  return `<section class="ticker" aria-label="Search turfs in Malappuram towns"><div class="ticker-track"><div class="ticker-group">${items}</div><div class="ticker-group" aria-hidden="true" inert>${items}</div></div></section>`;
}
function story() {
  const tiles = ["ground", "sunset", "paddy", "beach"];
  return `<section class="story" aria-labelledby="story-title"><div class="story-copy"><span class="story-ml" lang="ml" aria-hidden="true">പന്ത്</span><h2 id="story-title">Malappuram plays everywhere.</h2><p>Sevens tournaments fill village grounds every season, red-earth pitches sit between the coconut palms, and Payyanad stadium in Manjeri hosted the Santosh Trophy final round in 2022. Bring that spirit to your next booking, wherever you are in Kerala.</p><button type="button" class="outline" data-district="Malappuram">${icon("map-pin")}See Malappuram turfs</button></div><div class="story-grid">${tiles.map((k) => `<figure class="story-tile tile-${k}"><img src="/media/${PHOTOS[k].file}" alt="${esc(PHOTOS[k].alt)}" loading="lazy"><figcaption><strong>${esc(PHOTOS[k].place)}</strong>${credit(PHOTOS[k])}</figcaption></figure>`).join("")}</div></section>`;
}
function authStage(photo, html) {
  const p = PHOTOS[photo];
  return `<div class="auth-stage"><figure class="auth-art"><img src="/media/${p.file}" alt="${esc(p.alt)}"><figcaption><strong>${esc(p.place)}</strong>${credit(p)}</figcaption></figure>${html}</div>`;
}
function contactBand() {
  return `<section class="contact-band"><span class="contact-symbol">${icon("headset")}</span><div><h3>A question before kick-off?</h3><p>Talk to the team about facilities, booking details, or your game.</p></div><a class="quiet" href="/contact">${icon("phone")}Contact the team ${icon("arrow-up-right")}</a></section>`;
}
function locate() {
  const target = $("#location-message");
  if (!navigator.geolocation) {
    target.innerHTML = notice(
      "Location is unavailable in this browser. Choose a district or search a locality.",
    );
    icons();
    return;
  }
  $("#near-me").disabled = true;
  target.innerHTML = notice(
    "Finding nearby turfs. Your location will not be saved.",
  );
  navigator.geolocation.getCurrentPosition(
    (p) => {
      state.location = {
        name: "Current location",
        coordinates: { lat: p.coords.latitude, lng: p.coords.longitude },
      };
      state.search.district = "";
      state.search.q = "";
      route();
    },
    (e) => {
      if ($("#near-me")) $("#near-me").disabled = false;
      if ($("#location-message"))
        $("#location-message").innerHTML = notice(
          e.code === 1
            ? "Location permission was denied. Search a locality or choose your district."
            : "We could not find your location. Search a locality or choose your district.",
        );
      icons();
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
  );
}
function townSearch() {
  modal(
    `<h2>Where’s your game?</h2><p>Find a town or locality in Kerala.</p><form id="places-form"><label class="field"><span>Town or locality</span><input name="q" placeholder="For example, Kakkanad" minlength="2" required></label><button class="primary full" style="margin-top:16px">${icon("search")}Search</button></form><div id="places" class="place-results" aria-live="polite"></div>`,
  );
  $("#places-form").onsubmit = (e) => {
    e.preventDefault();
    busy(e.target.querySelector("button"), async () => {
      try {
        const data = await api(
          "/places?q=" + encodeURIComponent(new FormData(e.target).get("q")),
        );
        $("#places").innerHTML = data.places.length
          ? data.places
              .map(
                (p, i) =>
                  `<button data-place="${i}">${esc(p.name)}<small>${esc(p.address)}</small></button>`,
              )
              .join("")
          : notice("No Kerala localities found. Try a nearby town.");
        $$("[data-place]").forEach(
          (b) =>
            (b.onclick = () => {
              const p = data.places[Number(b.dataset.place)];
              state.location = { name: p.name, coordinates: p.coordinates };
              state.search.q = "";
              state.search.district = "";
              $("#modal").close();
              route();
            }),
        );
      } catch (error) {
        $("#places").innerHTML = notice(error.message);
        icons();
      }
    });
  };
}
async function turfDetail(id, version) {
  $("#main").innerHTML = '<div class="loading">Loading turf...</div>';
  const { turf: t, photos } = await api("/turfs/" + id);
  if (version !== routeVersion) return;
  const params = new URLSearchParams(location.search),
    date = params.get("date") || state.search.date,
    replaces = params.get("reschedule");
  $("#main").innerHTML =
    `${pageTop(t.name, `${t.town}, ${t.district}`, "/")}<div class="details-layout"><section>${photos.length ? `<div class="photo-gallery">${photos.map((p) => `<img src="/api/images/${p.id}" alt="${esc(p.alt)}">`).join("")}</div>` : `<div class="photo-placeholder">${icon("goal")}<span>Photos coming soon</span></div>`}<div class="detail-section"><h2>Your pitch</h2><div class="tags">${t.formats.map((n) => `<span class="tag">${n}-a-side · ${n * 2} players</span>`).join("")}<span class="tag">${esc(t.surface)}</span><span class="tag">${t.slotDuration}-minute slots</span></div><p style="margin-top:16px">${esc(t.description)}</p></div><div class="detail-section"><h2>Facilities</h2><div class="amenities">${t.amenities.map((a) => `<span>${icon("check")}${esc(a)}</span>`).join("") || '<span class="muted">Contact the team for facility details.</span>'}</div></div><div class="detail-section"><h2>Getting here</h2><p>${esc(t.address)}</p><a class="quiet" href="https://www.google.com/maps/search/?api=1&query=${t.coordinates.lat},${t.coordinates.lng}" target="_blank" rel="noopener noreferrer">${icon("map-pin")}Open in Google Maps ${icon("external-link")}</a></div><div class="detail-section"><h2>Cancellation & rescheduling</h2><p>Changes close ${t.cutoffHours} hours before your slot. Eligible cancellations receive a ${t.refundPercent}% refund. Rescheduling is subject to availability; any price difference is collected or refunded.</p></div></section><aside class="booking-panel"><h2>${replaces ? "Reschedule your game" : "Make it game time"}</h2><p class="muted small">${t.formats.map((n) => n + "-a-side").join(" / ")} · ${t.slotDuration} minutes</p>${replaces ? notice("Your current booking stays confirmed until the change succeeds.") : ""}<label class="field"><span>Choose a date</span><input id="slot-date" type="date" min="${state.config.today}" value="${esc(date)}"></label><div id="slot-results" aria-live="polite"></div><p class="booking-note">${icon("lock-keyhole")} Slots are held for 10 minutes at checkout.</p></aside></div>${contactBand()}`;
  async function slots() {
    const value = $("#slot-date").value;
    $("#slot-results").innerHTML =
      '<div class="loading">Checking slots...</div>';
    try {
      const result = await api(`/turfs/${id}/availability?date=${value}`);
      if (version !== routeVersion || $("#slot-date").value !== value) return;
      $("#slot-results").innerHTML = result.slots.length
        ? `<div class="slot-grid">${result.slots.map((s) => `<button class="slot" data-slot="${s.id}">${timeLabel(s.start)}<small>${money(s.price)}</small></button>`).join("")}</div>`
        : notice(
            "Filled or no slots published for this date. Please try another day.",
          );
      $$("[data-slot]").forEach(
        (b) => (b.onclick = () => selectSlot(b.dataset.slot, replaces, b)),
      );
      icons();
    } catch (e) {
      if ($("#slot-results"))
        $("#slot-results").innerHTML = notice(e.message, "error");
      icons();
    }
  }
  $("#slot-date").onchange = slots;
  icons();
  await slots();
}
async function selectSlot(slotId, replaces, button) {
  if (!state.user) {
    state.returnTo = location.pathname + location.search;
    toast("Sign in, then choose your time to reserve the slot.");
    navigate("/login");
    return;
  }
  await busy(button, async () => {
    try {
      const { booking } = await api("/holds", "POST", { slotId, replaces });
      navigate("/checkout/" + booking.id);
    } catch (e) {
      if (e.code === "SLOT_CONFLICT") {
        modal(
          `<h2>This turf was just booked</h2><p>Choose one of the nearest available alternatives.</p><div class="modal-list">${(e.alternatives || []).map((s) => `<button data-alternative="${s.id}">${dateLabel(s.date)} · ${timeLabel(s.start)}<small>${money(s.price)}</small></button>`).join("") || "<p>No alternatives are available yet. Try another date.</p>"}</div>`,
        );
        $$("[data-alternative]").forEach(
          (b) =>
            (b.onclick = () => {
              $("#modal").close();
              selectSlot(b.dataset.alternative, replaces, b);
            }),
        );
        route();
      } else throw e;
    }
  });
}
function login(mode = "login") {
  if (state.user) {
    navigate(state.returnTo || "/profile");
    return;
  }
  const ready = state.config.firebaseReady;
  $("#main").innerHTML = authStage(
    "sunset",
    `<section class="auth-layout"><a class="back" href="/">${icon("arrow-left")}Back to turfs</a><h1>${mode === "register" ? "Join the game." : "Welcome back."}</h1><p class="muted">${mode === "register" ? "One account. Every pitch in Kerala." : "Sign in to book your next game."}</p>${!ready ? notice("Sign-in is not available yet. The marketplace account service is being connected.", "warn") : ""}<button id="google-login" class="outline full" ${ready ? "" : "disabled"}>${icon("user-round")}Continue with Google</button><div class="divider">or use your email</div><form id="login-form">${mode === "register" ? field("Full name", "name", "", 'autocomplete="name" maxlength="80" required') : ""}${field("Email address", "email", "", 'type="email" autocomplete="email" required')}${field("Password", "password", "", `type="password" ${mode === "register" ? 'minlength="8"' : ""} autocomplete="${mode === "register" ? "new-password" : "current-password"}" required`)}<div class="error-text" id="auth-error" role="alert"></div><button class="primary full" ${ready ? "" : "disabled"}>${mode === "register" ? "Create account" : "Sign in"}${icon("arrow-right")}</button></form><button class="text-link full" id="switch-auth">${mode === "register" ? "Already have an account? Sign in" : "New to TurfKerala? Create an account"}</button>${mode === "login" ? '<button class="text-link full" id="reset-password">Forgot password?</button>' : ""}${state.config.phoneEnabled ? '<a class="text-link" href="/login/phone">Sign in with a phone number</a>' : ""}</section>`,
  );
  $("#switch-auth").onclick = () =>
    login(mode === "login" ? "register" : "login");
  const finish = async () => {
    const result = await api("/me");
    state.user = result.user;
    navigate(state.returnTo || "/");
  };
  $("#google-login").onclick = (e) =>
    busy(e.currentTarget, async () => {
      try {
        await googleAuth();
        await finish();
      } catch (e) {
        if ($("#auth-error")) $("#auth-error").textContent = authError(e);
      }
    });
  $("#login-form").onsubmit = (e) => {
    e.preventDefault();
    const form = e.target,
      data = Object.fromEntries(new FormData(form));
    busy(form.querySelector("button"), async () => {
      try {
        await emailAuth(mode, data.email, data.password, data.name);
        if (data.name)
          await api("/profile", "PATCH", {
            name: data.name,
            preferredLocation: null,
          });
        await finish();
      } catch (e) {
        if ($("#auth-error")) $("#auth-error").textContent = authError(e);
      }
    });
  };
  $("#reset-password")?.addEventListener("click", () => {
    const email = $("[name=email]").value;
    if (!email) return toast("Enter your email address first.");
    resetPassword(email)
      .then(() => toast("If this account exists, a reset email has been sent."))
      .catch((e) => toast(authError(e)));
  });
  icons();
}
function phoneLogin() {
  if (!state.config.phoneEnabled) {
    $("#main").innerHTML =
      pageTop("Phone sign-in", "") +
      empty(
        "Phone sign-in is not enabled",
        "Use your email or Google account to continue.",
        `<a class="primary" href="/login">${icon("arrow-right")}Sign in</a>`,
      );
    icons();
    return;
  }
  $("#main").innerHTML = authStage(
    "paddy",
    `<section class="auth-layout"><a class="back" href="/login">${icon("arrow-left")}Other sign-in options</a><h1>Sign in with your phone.</h1><p class="muted">We’ll send a verification code by SMS.</p><p class="small muted">Your number is sent to Google for verification and abuse prevention. SMS charges may apply.</p><form id="phone-form">${field("Phone number", "phone", "+91", 'type="tel" autocomplete="tel" required pattern="\\+[0-9]{10,15}"')}<button class="primary full" id="send-code" ${state.config.firebaseReady ? "" : "disabled"}>Send verification code</button></form><div id="recaptcha"></div><form id="otp-form" hidden style="margin-top:24px">${field("Verification code", "code", "", 'inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required maxlength="6"')}<button class="primary full">Verify & sign in</button></form><div class="error-text" id="auth-error" role="alert"></div></section>`,
  );
  let resendAt = 0;
  $("#phone-form").onsubmit = (e) => {
    e.preventDefault();
    if (Date.now() < resendAt)
      return toast("Wait a minute before requesting another code.");
    busy($("#send-code"), async () => {
      try {
        await sendOtp(new FormData(e.target).get("phone"));
        resendAt = Date.now() + 60000;
        $("#otp-form").hidden = false;
        toast("Verification code sent. You can resend it after one minute.");
      } catch (e) {
        $("#auth-error").textContent = authError(e);
      }
    });
  };
  $("#otp-form").onsubmit = (e) => {
    e.preventDefault();
    busy(e.target.querySelector("button"), async () => {
      try {
        await confirmOtp(new FormData(e.target).get("code"));
        state.user = (await api("/me")).user;
        navigate(state.returnTo || "/");
      } catch (e) {
        if ($("#auth-error")) $("#auth-error").textContent = authError(e);
      }
    });
  };
  cleanup = clearCaptcha;
  icons();
}
let razorpayLoader;
function loadRazorpay() {
  return (razorpayLoader ||= new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = resolve;
    script.onerror = () => {
      razorpayLoader = null;
      reject(new Error("Unable to load secure checkout. Please try again."));
    };
    document.head.append(script);
  }));
}
async function checkout(id, version) {
  $("#main").innerHTML = '<div class="loading">Checking your booking...</div>';
  const { booking: b, refunds } = await api("/bookings/" + id);
  if (version !== routeVersion) return;
  if (!["held", "payment_pending"].includes(b.status)) {
    $("#main").innerHTML =
      pageTop(
        statusText(b.status),
        b.status === "confirmed"
          ? "Your game is booked. See you on the pitch."
          : "Your latest booking status is shown below.",
        "/bookings",
      ) +
      `<div class="checkout-info"><h2>${esc(b.turfName)}</h2><p>${dateLabel(b.date)} · ${timeLabel(b.start)} - ${timeLabel(b.end)}</p>${badge(b.status)}<p class="small muted" style="margin-top:16px">Booking #${b.id.slice(0, 8).toUpperCase()}</p>${b.status === "refund_pending" ? notice(b.refundPurpose === "reschedule" ? "Your original booking remains valid while the partial refund is processed." : "Your payment is being returned to the original payment method.") : ""}${refunds.map((r) => `<p class="small">Refund ${money(r.amount)} · ${esc(statusText(r.status))}</p>`).join("")}<div class="form-actions"><a class="primary" href="/bookings">My bookings ${icon("arrow-right")}</a><a class="outline" href="/turfs/${b.turfId}">Find another slot</a></div></div>`;
    icons();
    return;
  }
  $("#main").innerHTML =
    `${pageTop(b.replaces ? "Confirm your new game time" : "One step closer to kick-off.", "", `/turfs/${b.turfId}`)}<div class="checkout-layout"><section><div class="checkout-info"><h2>${esc(b.turfName)}</h2><div class="meta-line">${icon("calendar-days")}${dateLabel(b.date)}</div><div class="meta-line">${icon("clock")}${timeLabel(b.start)} - ${timeLabel(b.end)}</div><div class="meta-line">${icon("user-round")}${esc(state.user.name || state.user.email)}</div></div><div class="detail-section"><h2>${b.amountDue ? "Payment method" : "Confirm reschedule"}</h2>${b.amountDue ? `<div class="payment-methods"><button data-method="upi" class="${state.payment === "upi" ? "active" : ""}">${icon("smartphone")}UPI</button><button data-method="card" class="${state.payment === "card" ? "active" : ""}">${icon("credit-card")}Card</button></div><p>Payment details are entered securely in Razorpay checkout.</p>` : `<p>${b.replaces ? "Your original slot will be released after the change succeeds. Any price reduction is refunded to your original payment method." : ""}</p>`}${state.config.testPayments ? notice("Razorpay test mode. No real money will be charged.", "warn") : ""}${!state.config.paymentsReady && b.amountDue ? notice("Checkout is awaiting payment service configuration.", "warn") : ""}</div><div class="detail-section"><h2>Cancellation policy</h2><p>Cancel or reschedule at least ${b.cutoffHours} hours before play. Eligible cancellations receive a ${b.refundPercent}% refund.</p><a class="quiet" href="/policy">Full refund policy ${icon("arrow-up-right")}</a></div></section><aside class="booking-panel"><h2>Booking summary</h2><div class="hold-clock">${icon("clock")}Held for <strong id="hold-clock"></strong></div><div class="sum-row"><span>Pitch rental</span><strong>${money(b.price)}</strong></div>${b.replaces ? `<div class="sum-row"><span>Already paid</span><strong>${money(b.price - b.amountDue)}</strong></div>` : ""}<div class="sum-row"><span>Booking fee</span><strong>Free</strong></div><div class="sum-row total"><span>Due now</span><span>${money(b.amountDue)}</span></div><div id="payment-message" role="status"></div><button class="primary full" id="pay" ${b.amountDue && !state.config.paymentsReady ? "disabled" : ""}>${b.amountDue ? "Pay " + money(b.amountDue) : "Confirm new time"}${icon("arrow-right")}</button><button class="quiet full" id="release-hold">Release this slot</button><p class="booking-note">${icon("shield-check")} Confirmed only after verified payment.</p></aside></div>`;
  const tick = () => {
    const left = Math.max(0, Math.ceil((b.expiresAt - Date.now()) / 1000));
    if ($("#hold-clock"))
      $("#hold-clock").textContent =
        `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    if (!left) {
      clearInterval(interval);
      if ($("#pay")) $("#pay").disabled = true;
      if ($("#payment-message"))
        $("#payment-message").innerHTML = notice(
          "This hold has expired. Choose another available slot.",
          "warn",
        );
      icons();
    }
  };
  const interval = setInterval(tick, 1000);
  tick();
  cleanup = () => clearInterval(interval);
  $$("[data-method]").forEach(
    (button) =>
      (button.onclick = () => {
        state.payment = button.dataset.method;
        $$("[data-method]").forEach((x) =>
          x.classList.toggle("active", x === button),
        );
      }),
  );
  $("#release-hold").onclick = (e) =>
    busy(e.currentTarget, async () => {
      await api(`/bookings/${id}/release`, "POST", {});
      navigate("/bookings");
    });
  $("#pay").onclick = (e) =>
    busy(e.currentTarget, async () => {
      try {
        const order = await api(`/bookings/${id}/order`, "POST", {});
        if (
          order.booking?.status === "confirmed" ||
          order.booking?.status === "refund_pending"
        ) {
          toast("Your reschedule has been submitted.");
          route();
          return;
        }
        await loadRazorpay();
        const checkout = new window.Razorpay({
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amount,
          currency: "INR",
          name: state.config.business,
          description: `${b.turfName} · ${dateLabel(b.date)}`,
          prefill: {
            name: state.user.name,
            email: state.user.email,
            contact: state.user.verifiedPhone,
          },
          theme: { color: "#21664b" },
          config: {
            display: {
              blocks: {
                preferred: {
                  name:
                    "Pay with " + (state.payment === "upi" ? "UPI" : "card"),
                  instruments: [{ method: state.payment }],
                },
              },
              sequence: ["block.preferred"],
              preferences: { show_default_blocks: false },
            },
          },
          handler: async (result) => {
            try {
              const data = await api(`/bookings/${id}/verify`, "POST", result);
              toast(
                data.booking.status === "confirmed"
                  ? "Booking confirmed. Your game is on."
                  : "Payment received. Checking final status.",
              );
              route();
            } catch (error) {
              toast(error.message);
              route();
            }
          },
          modal: {
            ondismiss: () => {
              toast(
                "Checkout closed. Your slot stays held until the timer expires.",
              );
            },
          },
        });
        checkout.on("payment.failed", () => {
          if ($("#payment-message"))
            $("#payment-message").innerHTML = notice(
              "Payment was not completed. You can retry while your hold is active.",
              "error",
            );
          icons();
        });
        checkout.open();
      } catch (error) {
        if ($("#payment-message"))
          $("#payment-message").innerHTML = notice(error.message, "error");
        icons();
      }
    });
  icons();
}
async function bookings(version) {
  $("#main").innerHTML =
    pageTop("My bookings", "All your games, in one place.") +
    '<div class="loading">Loading bookings...</div>';
  const { bookings: all } = await api("/bookings");
  if (version !== routeVersion) return;
  const list = all.filter(
    (b) =>
      state.bookingFilter === "all" ||
      (state.bookingFilter === "upcoming" &&
        b.start > Date.now() &&
        !["cancelled", "refunded", "expired"].includes(b.status)) ||
      (state.bookingFilter === "past" &&
        (b.start <= Date.now() ||
          ["cancelled", "refunded", "expired"].includes(b.status))),
  );
  $("#main").innerHTML =
    `<div class="page-top page-top-row"><div><h1>My bookings</h1><p>All your games, in one place.</p></div><a class="primary" href="/">${icon("plus")}Find a turf</a></div><div class="segmented">${["upcoming", "past", "all"].map((v) => `<button data-booking-filter="${v}" class="${state.bookingFilter === v ? "active" : ""}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div><div class="booking-list">${
      list.length
        ? list
            .map((b) => {
              const editable =
                b.status === "confirmed" &&
                b.start - Date.now() >= b.cutoffHours * 3600000;
              return `<article class="booking-row"><span class="booking-symbol">${icon("goal")}</span><div><h3>${esc(b.turfName)}</h3><p>${dateLabel(b.date)} · ${timeLabel(b.start)} - ${timeLabel(b.end)}</p><p>${money(b.price)} · #${b.id.slice(0, 8).toUpperCase()}</p>${badge(b.status)}${b.pendingChange ? ' <span class="status">Reschedule in progress</span>' : ""}${b.cancelReason === "rescheduled" ? '<span class="status">Rescheduled</span>' : ""}</div><div class="booking-actions"><a class="outline" href="/checkout/${b.id}">Details</a>${editable ? `<a class="outline" href="/turfs/${b.turfId}?reschedule=${b.id}&date=${b.date}">${icon("calendar-days")}Reschedule</a><button class="outline danger" data-cancel="${b.id}">${icon("x")}Cancel</button>` : ""}${["held", "payment_pending"].includes(b.status) ? `<a class="primary" href="/checkout/${b.id}">Continue checkout</a><button class="icon-button" data-reconcile="${b.id}" title="Refresh payment status" aria-label="Refresh payment status">${icon("refresh-cw")}</button>` : ""}</div></article>`;
            })
            .join("")
        : empty(
            "No games here yet.",
            "Find an available pitch and get your team together.",
            `<a class="primary" href="/">Find a turf ${icon("arrow-right")}</a>`,
          )
    }</div>`;
  $$("[data-booking-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        state.bookingFilter = b.dataset.bookingFilter;
        route();
      }),
  );
  $$("[data-cancel]").forEach(
    (b) =>
      (b.onclick = () =>
        cancelBooking(all.find((x) => x.id === b.dataset.cancel))),
  );
  $$("[data-reconcile]").forEach(
    (b) =>
      (b.onclick = () =>
        busy(b, async () => {
          await api(`/bookings/${b.dataset.reconcile}/reconcile`, "POST", {});
          route();
        })),
  );
  icons();
}
export function cancelBooking(b, after = route) {
  modal(
    `<h2>Cancel this game?</h2><p>${esc(b.turfName)} · ${dateLabel(b.date)} · ${timeLabel(b.start)}</p><p>Your slot will be released. The eligible refund is ${money(Math.floor((b.price * (state.user.role === "admin" ? 100 : b.refundPercent)) / 100))}, returned to the original payment method.</p><div id="cancel-error" role="alert"></div><div class="dialog-actions"><button id="confirm-cancel" class="primary">Cancel booking</button><button id="keep-booking" class="outline">Keep my game</button></div>`,
  );
  $("#keep-booking").onclick = () => $("#modal").close();
  $("#confirm-cancel").onclick = (e) =>
    busy(e.currentTarget, async () => {
      try {
        await api(`/bookings/${b.id}/cancel`, "POST", {});
        $("#modal").close();
        toast("Booking cancelled. Refund status is available in your booking.");
        after();
      } catch (error) {
        $("#cancel-error").innerHTML = notice(error.message, "error");
        icons();
      }
    });
}
function profile() {
  const u = state.user;
  $("#main").innerHTML =
    `${pageTop("Your profile", "Your details, your team, your next game.")}<section class="profile-layout"><div class="profile-avatar">${esc((u.name || u.email || "P")[0].toUpperCase())}</div><form id="profile-form"><div class="form-grid">${field("Full name", "name", u.name, 'required maxlength="80"')}${field("Email address", "email", u.email, `type="email" ${currentUser()?.email ? "readonly" : ""}`)}${field("Verified phone", "verifiedPhone", u.verifiedPhone, 'readonly placeholder="No verified phone linked"')}<label class="field"><span>Preferred district</span><select name="district">${options(state.config.districts, u.preferredLocation?.district, "No preferred district")}</select></label>${field("Preferred town", "town", u.preferredLocation?.town || "", 'maxlength="100"')}<div class="field"><span>Account</span><a class="outline" href="/bookings">${icon("history")}View booking history</a></div></div>${state.location ? `<label class="check-label" style="margin-top:20px"><input type="checkbox" name="saveLocation">Save ${esc(state.location.name)} as my preferred location</label>` : ""}${u.preferredLocation?.coordinates ? '<label class="check-label" style="margin-top:15px"><input type="checkbox" name="removeCoordinates">Remove saved coordinates</label>' : ""}<div class="form-actions"><button class="primary">${icon("check")}Save profile</button><button type="button" class="quiet danger" id="logout">${icon("log-out")}Sign out</button></div></form></section>`;
  $("#profile-form").onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    busy(e.target.querySelector("button"), async () => {
      const preferredLocation = data.district
        ? {
            district: data.district,
            town: data.town,
            ...(data.saveLocation && state.location
              ? { coordinates: state.location.coordinates }
              : u.preferredLocation?.coordinates && !data.removeCoordinates
                ? { coordinates: u.preferredLocation.coordinates }
                : {}),
          }
        : null;
      if (data.saveLocation && !data.district)
        throw new Error("Select the district before saving your location.");
      state.user = (
        await api("/profile", "PATCH", {
          name: data.name,
          email: data.email,
          preferredLocation,
        })
      ).user;
      toast("Profile updated.");
      shell();
    });
  };
  $("#logout").onclick = (e) =>
    busy(e.currentTarget, async () => {
      await logout();
      state.user = null;
      state.location = null;
      state.returnTo = "/";
      navigate("/");
      toast("You have signed out.");
    });
  icons();
}
function contact() {
  $("#main").innerHTML = authStage(
    "beach",
    `<section class="auth-layout">${pageTop("Talk to the turf team.", "A little help before kick-off.", "/")}<div class="contact-symbol">${icon("headset")}</div><p style="margin-top:20px">For facilities, booking details, cancellations, and group games.</p>${state.config.contact ? `<a class="primary full" href="tel:${esc(state.config.contact.replace(/[^+\d]/g, ""))}">${icon("phone")}${esc(state.config.contact)}</a>` : notice("The admin contact number will be published before bookings open.")}<p class="small muted" style="margin-top:20px">${esc(state.config.legalName || state.config.business)}</p></section>`,
  );
  icons();
}
async function init() {
  initMotion();
  try {
    state.config = await api("/config");
    state.search.date = state.config.today;
    await initAuth(state.config, async (user) => {
      state.authReady = true;
      if (user) {
        try {
          state.user = (await api("/me")).user;
        } catch (e) {
          state.user = null;
          toast(e.message);
        }
      } else state.user = null;
      route();
    });
  } catch (e) {
    $("#main").innerHTML = empty(
      "Unable to connect",
      e.message,
      '<button id="reload" class="primary">Try again</button>',
    );
    $("#reload").onclick = () => location.reload();
    icons();
  }
}
init();
