import { $, $$, esc, icon, icons } from "./ui.js";
import { credit, PHOTOS } from "./motion.js";
import groundsData from "./data/grounds.json";
import map from "./data/kerala-map.json";

// Real football venues from OpenStreetMap (scripts/fetch-grounds.mjs). Explore-only: not bookable inventory.
export const GROUNDS = groundsData.grounds;
export const OSM_CREDIT = `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>`;
const commons = (file) => "https://commons.wikimedia.org/wiki/File:" + file;
// One freely licensed photograph per district, shown on venue cards (see public/media/CREDITS.md).
export const DISTRICT_PHOTOS = {
  Alappuzha: { file: "district-alappuzha.jpg", place: "Backwaters near Nedumudy", author: "Ingo Mehling", license: "CC BY-SA 4.0", source: commons("Kerala_Backwaters_near_Nedumudy_-_4.jpg") },
  Ernakulam: { file: "district-ernakulam.jpg", place: "Jawaharlal Nehru Stadium, Kochi", author: "Ramit.mukherjee.1994", license: "CC BY-SA 4.0", source: commons("Jawaharlal_Nehru_Stadium,_Kochi,_Kerala.png") },
  Idukki: { file: "district-idukki.jpg", place: "Tea estates, Munnar", author: "Rainer Halama", license: "CC BY-SA 4.0", source: commons("Munnar_Tea_Plantations-WUS07343-Pano.jpg") },
  Kannur: { file: "district-kannur.jpg", place: "Muzhappilangad beach", author: "Shagil Kannur", license: "CC BY-SA 4.0", source: commons("Fisherman_at_Muzhappilangad_Beach.jpg") },
  Kasaragod: { file: "district-kasaragod.jpg", place: "Bekal fort", author: "Sugeesh", license: "CC BY-SA 4.0", source: commons("Bakel_fort_Kasargod_wide_view.jpg") },
  Kollam: { file: "district-kollam.jpg", place: "Ashtamudi lake", author: "Timothy A. Gonsalves", license: "CC BY-SA 4.0", source: commons("Mangrove_Arch_Boat_Ashtamudi_Kollam_Kerala_Mar22_A7C_01490.jpg") },
  Kottayam: { file: "district-kottayam.jpg", place: "Kumarakom backwaters", author: "Vis M", license: "CC BY-SA 4.0", source: commons("Kumarakom_backwaters_panorama.jpg") },
  Kozhikode: { file: "district-kozhikode.jpg", place: "Kozhikode beach", author: "Sulyab Thottungal", license: "CC BY-SA 4.0", source: commons("Kozhikode_Beach_Coastline.jpg") },
  Malappuram: { file: "payyanad-match.jpg", place: "District Sports Complex, Payyanad", author: "Shakkeerpadathakayil", license: "CC BY-SA 3.0", source: commons("Malappuram_District_Sports_Complex_Stadium.jpg") },
  Palakkad: { file: "district-palakkad.jpg", place: "Palakkad fort", author: "Ssriram mt", license: "CC BY-SA 4.0", source: commons("Palakkad_Fort_Panoramic_view.jpg") },
  Pathanamthitta: { file: "district-pathanamthitta.jpg", place: "Aranmula boat race", author: "Arun Sinha", license: "CC BY 2.0", source: commons("Aranmula-boat_race-_Kerala-India-1.jpg") },
  Thiruvananthapuram: { file: "district-thiruvananthapuram.jpg", place: "Greenfield stadium, Kariavattom", author: "Shabznazar23", license: "CC BY-SA 4.0", source: commons("Greenfield_International_Stadium.jpg") },
  Thrissur: { file: "district-thrissur.jpg", place: "Athirappilly falls", author: "Pranchiyettan", license: "CC BY-SA 3.0", source: commons("Athirappalli_Waterfalls,_Thrissur,_Kerala.jpg") },
  Wayanad: { file: "district-wayanad.jpg", place: "Chembra peak", author: "Ravi Dwivedi", license: "CC BY-SA 4.0", source: commons("Chembra_Peak_Heart_Lake.jpg") },
};
// Extra photographs per district so neighbouring cards differ.
const MORE_PHOTOS = {
  Ernakulam: [
    { file: "district-ernakulam-2.jpg", place: "Jawaharlal Nehru Stadium, Kochi", author: "Adithyak1997", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Jawaharlal_Nehru_Stadium,_Kochi.jpg" },
    { file: "district-ernakulam-3.jpg", place: "Jawaharlal Nehru Stadium, Kochi", author: "Ssooraj7", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Kochi_Jawaharlal_Nehru_Stadium_Panorama.jpg" },
  ],
  Kozhikode: [
    { file: "district-kozhikode-2.jpg", place: "Kozhikode beach", author: "Gannu03", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Kozhikode_Beach_9.jpg" },
    { file: "district-kozhikode-3.jpg", place: "Kozhikode beach", author: "Gannu03", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Kozhikode_Beach_8.jpg" },
  ],
  Thiruvananthapuram: [
    { file: "district-thiruvananthapuram-2.jpg", place: "Greenfield stadium, Kariavattom", author: "Arunsunilkollam", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Greenfield_International_Stadium_Kerala_2.jpg" },
    { file: "district-thiruvananthapuram-3.jpg", place: "Greenfield stadium, Kariavattom", author: "Arunsunilkollam", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Greenfield_International_Stadium_Kerala.jpg" },
  ],
  Thrissur: [
    { file: "district-thrissur-2.jpg", place: "Athirappilly falls", author: "Challiyan", license: "Public domain", source: "https://commons.wikimedia.org/wiki/File:Athirapilly_waterfalls.jpg" },
    { file: "district-thrissur-3.jpg", place: "Kudamattam at Thrissur Pooram", author: "Rameshng", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Kudamatom_at_thrissur_pooram_2013_7618.JPG" },
  ],
  Kannur: [
    { file: "district-kannur-2.jpg", place: "Muzhappilangad drive-in beach", author: "Shagil Kannur", license: "CC BY 3.0", source: "https://commons.wikimedia.org/wiki/File:Muzhappilangad_Drive-in_Beach_2.jpg" },
    { file: "district-kannur-3.jpg", place: "Muzhappilangad beach", author: "Rijin S", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Muzhappilangad_beach_(14).JPG" },
  ],
  Alappuzha: [
    { file: "district-alappuzha-2.jpg", place: "Backwater canal, Alappuzha", author: "Ingo Mehling", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Karala_Backwaters_-_Canal.jpg" },
    { file: "district-alappuzha-3.jpg", place: "Backwaters near Nedumudy", author: "Ingo Mehling", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Kerala_Backwaters_near_Nedumudy_-_1.jpg" },
  ],
  Kottayam: [
    { file: "district-kottayam-2.jpg", place: "Kumarakom backwaters", author: "Tux the penguin", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Kumarakom_backwaters.jpg" },
    { file: "district-kottayam-3.jpg", place: "Kumarakom backwaters", author: "Vis M", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Kumarakom_backwaters_02.jpg" },
  ],
  Kollam: [
    { file: "district-kollam-2.jpg", place: "Mangroves, Ashtamudi lake", author: "Timothy A. Gonsalves", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Mangrove_Reflection_Wide_Ashtamudi_Kollam_Kerala_Mar22_A7C_01464.jpg" },
    { file: "district-kollam-3.jpg", place: "Thevally bridge, Ashtamudi", author: "Timothy A. Gonsalves", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Thevally_Bridge_Ashtamudi_Kollam_Mar22_R16_05856.jpg" },
  ],
  Palakkad: [
    { file: "district-palakkad-2.jpg", place: "Palakkad fort", author: "Vis M", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Palakkad_Fort15.jpg" },
    { file: "district-palakkad-3.jpg", place: "Palakkad fort", author: "Me haridas", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Palakkad_Fort.JPG" },
  ],
  Idukki: [
    { file: "district-idukki-2.jpg", place: "Tea estates, Munnar", author: "Ingo Mehling", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Munnar_-_Tea_Plantations.jpg" },
    { file: "district-idukki-3.jpg", place: "Tea gardens, Munnar", author: "Unknown author", license: "Public domain", source: "https://commons.wikimedia.org/wiki/File:Munnar_tea_gardens.jpg" },
  ],
  Pathanamthitta: [
    { file: "district-pathanamthitta-2.jpg", place: "Aranmula boat race", author: "Sreeraj.n1", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Aranmula_boat_race_1.jpg" },
    { file: "district-pathanamthitta-3.jpg", place: "Konni elephant camp", author: "Gannu03", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Baby_Elephant_at_Konni_Elephant_Training_Centre_05.jpg" },
  ],
  Kasaragod: [
    { file: "district-kasaragod-2.jpg", place: "Bekal fort", author: "Phadke09", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Bekal_Fort-_Bekal_-Kerala-IMG_001.jpg" },
    { file: "district-kasaragod-3.jpg", place: "Beach below Bekal fort", author: "Shubham Srivastava", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Beach_view_at_Bekal_Fort..JPG" },
  ],
  Wayanad: [
    { file: "district-wayanad-2.jpg", place: "Chembra peak", author: "Ingo Mehling", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:En_Ooru_-_Chembra_Peak_View.jpg" },
    { file: "district-wayanad-3.jpg", place: "Chembra peak", author: "Jaseem Hamza", license: "CC BY 3.0", source: "https://commons.wikimedia.org/wiki/File:Chembra_Peak,_Wayanad_-_panoramio.jpg" },
  ],
  Malappuram: [PHOTOS.ground, PHOTOS.evening, PHOTOS.sunset, PHOTOS.paddy, PHOTOS.beach],
};
export const photosFor = (district) => [DISTRICT_PHOTOS[district], ...(MORE_PHOTOS[district] || [])];
// Pick a stable photo for a venue from its district's set.
const photoFor = (g) => {
  const set = photosFor(g.district);
  let h = 0;
  for (const c of g.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return set[h % set.length];
};
export const byDistrict = GROUNDS.reduce((all, g) => ((all[g.district] = (all[g.district] || 0) + 1), all), {});
export const districtCount = Object.keys(byDistrict).length;

const { view } = map;
export const project = (lat, lng) => [((lng - view.west) * view.kx * view.scale).toFixed(1), ((view.north - lat) * view.scale).toFixed(1)];
const xy = (g) => project(g.lat, g.lng);
const DOT = 3.4;
export function keralaMap({ active = "", cls = "", label = true } = {}) {
  return `<svg class="kerala-map ${cls}" viewBox="0 0 ${map.width} ${map.height}" ${label ? `role="img" aria-label="Map of Kerala with ${GROUNDS.length} football grounds"` : 'aria-hidden="true"'}><g class="map-districts">${Object.entries(map.districts)
    .map(([name, d]) => `<path class="district${name === active ? " active" : ""}" data-map-district="${name}" d="${d}" pathLength="1"><title>${name}: ${byDistrict[name] || 0} grounds</title></path>`)
    .join("")}</g><g class="map-dots">${GROUNDS.map((g, i) => {
    const [x, y] = xy(g);
    return `<circle class="ground-dot${active && g.district !== active ? " dim" : ""}" data-dot="${g.id}" cx="${x}" cy="${y}" r="${DOT}" style="--i:${i % 60}"><title>${esc(g.name)}, ${esc(g.town)}</title></circle>`;
  }).join("")}</g></svg>`;
}

// Tween the map's viewBox to frame a district (or all of Kerala), keeping dots a constant size.
function zoomTo(svg, district) {
  const full = [0, 0, map.width, map.height];
  let target = full;
  const path = district && svg.querySelector(`[data-map-district="${district}"]`);
  if (path) {
    const b = path.getBBox(), pad = Math.max(b.width, b.height) * 0.18;
    target = [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2];
    // Match the map's aspect ratio so the district stays centred.
    const ratio = map.width / map.height;
    if (target[2] / target[3] > ratio) { const h = target[2] / ratio; target[1] -= (h - target[3]) / 2; target[3] = h; }
    else { const w = target[3] * ratio; target[0] -= (w - target[2]) / 2; target[2] = w; }
  }
  const from = (svg.getAttribute("viewBox") || full.join(" ")).split(" ").map(Number);
  const dots = svg.querySelectorAll(".ground-dot");
  const apply = (box) => {
    svg.setAttribute("viewBox", box.map((n) => n.toFixed(2)).join(" "));
    const r = (DOT * box[2]) / map.width;
    dots.forEach((d) => d.setAttribute("r", Math.max(r, 0.9).toFixed(2)));
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return apply(target);
  const start = performance.now(), ms = 750;
  cancelAnimationFrame(svg._zoom);
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms), e = 1 - Math.pow(1 - t, 3);
    apply(from.map((f, i) => f + (target[i] - f) * e));
    if (t < 1) svg._zoom = requestAnimationFrame(step);
  };
  svg._zoom = requestAnimationFrame(step);
}

const card = (g) => {
  const p = photoFor(g);
  const [type, id] = [{ n: "node", w: "way", r: "relation" }[g.id[0]], g.id.slice(1)];
  return `<article class="ground-card" data-card="${g.id}"><div class="ground-photo"><img src="/media/${p.file}" alt="" loading="lazy"><span class="ground-status">Not on TurfKerala yet</span><span class="ground-district">${icon("map-pin")}${g.district}</span></div><div class="ground-body"><h3>${esc(g.name)}</h3><p class="location">${esc(g.town)}${g.surface ? ` <span class="tag">${g.surface}</span>` : ""}</p><div class="ground-actions"><a class="outline" href="https://www.google.com/maps/dir/?api=1&destination=${g.lat},${g.lng}" target="_blank" rel="noopener noreferrer">${icon("navigation")}Directions</a><a class="quiet" href="https://www.openstreetmap.org/${type}/${id}" target="_blank" rel="noopener noreferrer">Map details ${icon("external-link")}</a></div><small class="ground-photo-note">Pictured: ${esc(p.place)}. ${credit(p)}</small></div></article>`;
};

const km = (a, b) => {
  const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * 6371;
};
// Real venues to suggest when the bookable search comes back empty.
export function groundsFallback({ district = "", q = "", near = null } = {}) {
  const term = q.trim().toLowerCase();
  if (!district && !term && !near) return "";
  const found = GROUNDS.filter(
    (g) =>
      (!district || g.district === district) &&
      (!term || g.name.toLowerCase().includes(term) || g.town.toLowerCase().includes(term)) &&
      (!near || km(near, g) <= 50),
  );
  if (near) found.sort((a, b) => km(near, a) - km(near, b));
  if (!found.length) return "";
  const where = near ? "within 50 km" : district && !term ? `in ${district}` : `matching “${esc(q.trim())}”${district ? ` in ${district}` : ""}`;
  return `<section class="grounds-fallback"><div class="fallback-head"><div><h3>${found.length} real ${found.length === 1 ? "ground" : "grounds"} ${where}</h3><p>Not bookable on TurfKerala yet. Get directions and contact the venue directly.</p></div><a class="outline" href="/grounds${district ? `?district=${district}` : ""}">${icon("map")}See them on the map</a></div><div class="ground-grid">${found.slice(0, 6).map(card).join("")}</div>${found.length > 6 ? `<a class="quiet fallback-more" href="/grounds${district ? `?district=${district}` : ""}">See all ${found.length} ${icon("arrow-right")}</a>` : ""}<small class="muted">Venue data ${OSM_CREDIT}</small></section>`;
}

// Homepage preview: mini map with district bars linking into the directory.
export function groundsTeaser(active = "") {
  const top = Object.entries(byDistrict).sort((a, b) => b[1] - a[1]);
  const max = top[0][1];
  return `<section class="grounds-teaser" aria-labelledby="teaser-title"><div class="teaser-map">${keralaMap({ active, cls: "mini", label: false })}</div><div class="teaser-copy"><h2 id="teaser-title"><span data-count="${GROUNDS.length}">${GROUNDS.length}</span> real grounds across <span data-count="${districtCount}">${districtCount}</span> districts.</h2><p>Every dot is a football venue mapped by the OpenStreetMap community. They are not on TurfKerala yet, but you can find them, get directions and tell us which ones to bring on board.</p><div class="district-bars">${top
    .slice(0, 7)
    .map(([d, n], i) => `<a href="/grounds?district=${d}" class="${d === active ? "active" : ""}" style="--w:${(n / max).toFixed(3)};--i:${i}"><span>${d}</span><b>${n}</b></a>`)
    .join("")}</div><a class="primary" href="/grounds">${icon("map")}Explore the grounds map ${icon("arrow-right")}</a><small class="muted">Map data ${OSM_CREDIT}</small></div></section>`;
}

export function renderGrounds() {
  const params = new URLSearchParams(location.search);
  let district = DISTRICT_PHOTOS[params.get("district")] ? params.get("district") : "", query = "", shown = 12;
  const districts = Object.keys(DISTRICT_PHOTOS);
  $("#main").innerHTML = `<section class="grounds-hero"><div><a class="back" href="/">${icon("arrow-left")}Back to turfs</a><h1><span data-count="${GROUNDS.length}">${GROUNDS.length}</span> grounds.<br>One football state.</h1><p>Real turfs and pitches across Kerala, mapped by the OpenStreetMap community. Pick a district on the map, find a pitch near you and get directions.</p></div><div class="grounds-hero-stats">${["Malappuram", "Ernakulam", "Kozhikode"].map((d) => `<button type="button" data-pick="${d}"><strong data-count="${byDistrict[d] || 0}">${byDistrict[d] || 0}</strong><span>in ${d}</span></button>`).join("")}</div></section><div class="grounds-layout"><aside class="grounds-map-panel"><div class="map-frame">${keralaMap({ active: district })}<div class="map-tip" id="map-tip" hidden></div></div><p class="small muted">Map data ${OSM_CREDIT}. Select a district to zoom in.</p></aside><section class="grounds-list" aria-live="polite"><div class="grounds-tools"><label class="input-icon">${icon("search")}<input id="ground-search" type="search" placeholder="Search a turf or town" aria-label="Search grounds by name or town"></label><select id="ground-district" aria-label="District"><option value="">All of Kerala (${GROUNDS.length})</option>${districts.map((d) => `<option value="${d}" ${d === district ? "selected" : ""}>${d} (${byDistrict[d] || 0})</option>`).join("")}</select></div><div class="district-chips">${districts.map((d) => `<button type="button" data-pick="${d}" class="${d === district ? "active" : ""}" ${byDistrict[d] ? "" : "disabled"}>${d}<span>${byDistrict[d] || 0}</span></button>`).join("")}</div><p class="grounds-count" id="grounds-count"></p><div class="ground-grid" id="ground-grid"></div><div id="ground-more"></div></section></div><section class="grounds-note">${icon("flag")}<div><h3>Own one of these turfs?</h3><p>Listings here are for discovery only. Talk to us to put your slots, prices and photos on TurfKerala so teams can book you directly.</p></div><a class="outline" href="/contact">${icon("phone")}Contact the team</a></section><details class="photo-credits"><summary>District photo credits</summary><ul>${districts.flatMap((d) => photosFor(d).map((p) => `<li><strong>${d}</strong>: ${esc(p.place)}. ${credit(p)}</li>`)).join("")}</ul></details>`;
  const svg = $(".grounds-map-panel .kerala-map");
  function list() {
    const q = query.toLowerCase();
    return GROUNDS.filter((g) => (!district || g.district === district) && (!q || g.name.toLowerCase().includes(q) || g.town.toLowerCase().includes(q)));
  }
  function draw(rezoom = true) {
    const found = list();
    $("#grounds-count").textContent = `${found.length} ${found.length === 1 ? "ground" : "grounds"} ${district ? "in " + district : "across Kerala"}${query ? ` matching “${query}”` : ""}`;
    $("#ground-grid").innerHTML = found.length
      ? found.slice(0, shown).map(card).join("")
      : `<div class="empty-state"><span class="empty-goal">${icon("goal")}</span><h2>No grounds match yet.</h2><p>Try another town or clear the district to see all of Kerala.</p></div>`;
    $("#ground-more").innerHTML = found.length > shown ? `<button type="button" class="outline" id="show-more">${icon("plus")}Show ${Math.min(12, found.length - shown)} more of ${found.length - shown}</button>` : "";
    $("#show-more")?.addEventListener("click", () => { shown += 12; draw(false); });
    const ids = new Set(found.map((g) => g.id));
    svg.querySelectorAll(".ground-dot").forEach((d) => d.classList.toggle("dim", !ids.has(d.dataset.dot)));
    svg.querySelectorAll(".district").forEach((p) => p.classList.toggle("active", p.dataset.mapDistrict === district));
    $$("[data-pick]").forEach((b) => { b.classList.toggle("active", b.dataset.pick === district); b.setAttribute("aria-pressed", b.dataset.pick === district); });
    $("#ground-district").value = district;
    $$(".ground-card").forEach((c) => {
      const dot = svg.querySelector(`[data-dot="${c.dataset.card}"]`);
      c.onmouseenter = c.onfocusin = () => dot?.classList.add("hot");
      c.onmouseleave = c.onfocusout = () => dot?.classList.remove("hot");
    });
    if (rezoom) zoomTo(svg, district);
    icons();
  }
  function pick(next) {
    district = district === next ? "" : next;
    shown = 12;
    history.replaceState({}, "", district ? `/grounds?district=${district}` : "/grounds");
    draw();
  }
  $$("[data-pick]").forEach((b) => (b.onclick = () => pick(b.dataset.pick)));
  $("#ground-district").onchange = (e) => pick(e.target.value || district);
  svg.querySelectorAll(".district").forEach((p) => (p.onclick = () => byDistrict[p.dataset.mapDistrict] && pick(p.dataset.mapDistrict)));
  let typing;
  $("#ground-search").oninput = (e) => {
    clearTimeout(typing);
    typing = setTimeout(() => { query = e.target.value.trim(); shown = 12; draw(false); }, 180);
  };
  // Hovering a dot names the ground; clicking it brings its card into view.
  const tip = $("#map-tip");
  svg.addEventListener("pointerover", (e) => {
    const dot = e.target.closest(".ground-dot");
    if (!dot) return (tip.hidden = true);
    const g = GROUNDS.find((x) => x.id === dot.dataset.dot), r = dot.getBoundingClientRect(), f = svg.parentElement.getBoundingClientRect();
    tip.innerHTML = `<strong>${esc(g.name)}</strong>${esc(g.town)}, ${g.district}`;
    tip.style.left = r.left - f.left + r.width / 2 + "px";
    tip.style.top = r.top - f.top + "px";
    tip.hidden = false;
  });
  svg.addEventListener("pointerleave", () => (tip.hidden = true));
  svg.addEventListener("click", (e) => {
    const dot = e.target.closest(".ground-dot");
    if (!dot) return;
    const g = GROUNDS.find((x) => x.id === dot.dataset.dot);
    query = "";
    $("#ground-search").value = "";
    if (district !== g.district) { district = g.district; history.replaceState({}, "", `/grounds?district=${district}`); }
    const index = list().findIndex((x) => x.id === g.id);
    shown = Math.max(shown, Math.ceil((index + 1) / 12) * 12);
    draw();
    const target = $(`[data-card="${g.id}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.classList.add("flash");
  });
  draw();
}
