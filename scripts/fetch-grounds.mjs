// Refreshes src/data/grounds.json from OpenStreetMap (ODbL, © OpenStreetMap contributors).
// These are real football venues for the explore-only directory; they are never written to Firestore.
// Usage: node scripts/fetch-grounds.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";

const UA = "TurfKeralaDirectory/1.0 (+https://www.openstreetmap.org/copyright)";
const OUT = "src/data/grounds.json";
const DISTRICTS = ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"];
const query = `[out:json][timeout:180];
area["name:en"="Kerala"]["admin_level"="4"]->.k;
rel(area.k)["boundary"="administrative"]["admin_level"="5"];
map_to_area->.ds;
foreach.ds->.d(
  .d out tags;
  (
    nwr["leisure"="pitch"]["sport"~"soccer|football|futsal"](area.d);
    nwr["leisure"="sports_centre"]["sport"~"soccer|football|futsal"](area.d);
  );
  out center tags;
);`;
// Names made only of these words describe a pitch type rather than a venue.
const GENERIC = /^(the\s+)?((football|soccer|futsal|turf|ground|grounds|court|pitch|field|play|playground|arena|sports|5s|7s|sevens|five|a|side|-|&|and)\s*)+$/i;
const TURFISH = /turf|arena|futsal|soccer|sports\s*(hub|centre|center|city|park|village)|football\s*(club|park|academy|court)|5s|sevens|\bfc\b/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(url, init) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { ...init, headers: { "User-Agent": UA, ...init?.headers } });
    if (r.ok) return r.json();
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`Request failed: ${url.slice(0, 80)}`);
}

const data = await json("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ data: query }),
});
let district = null;
const seen = new Map();
for (const e of data.elements) {
  if (e.type === "area") {
    const name = e.tags["name:en"] || e.tags.name;
    district = DISTRICTS.find((d) => name.includes(d) || (d === "Thiruvananthapuram" && /Trivandrum/i.test(name))) || null;
    continue;
  }
  const t = e.tags || {}, name = (t.name || "").split(";")[0].trim();
  const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
  if (!district || !name || lat == null || GENERIC.test(name)) continue;
  if (!TURFISH.test(name) && t.surface !== "artificial_turf") continue;
  const key = `${name.toLowerCase()}|${lat.toFixed(3)}|${lng.toFixed(3)}`;
  if (seen.has(key)) continue;
  seen.set(key, {
    id: `${e.type[0]}${e.id}`,
    name,
    district,
    town: t["addr:city"] || t["addr:suburb"] || t["addr:place"] || "",
    surface: t.surface === "artificial_turf" ? "Artificial turf" : t.surface === "grass" ? "Natural grass" : "",
    lat: +lat.toFixed(5),
    lng: +lng.toFixed(5),
  });
}

// Reuse towns from the previous run so a refresh only geocodes new venues (Nominatim allows 1 request/second).
let previous = [];
try { previous = JSON.parse(await readFile(OUT, "utf8")).grounds; } catch {}
const towns = new Map(previous.map((g) => [g.id, g.town]));
const grounds = [...seen.values()];
for (const g of grounds) {
  if (g.town) continue;
  if (towns.get(g.id)) { g.town = towns.get(g.id); continue; }
  try {
    const a = (await json(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=${g.lat}&lon=${g.lng}`)).address || {};
    g.town = a.suburb || a.town || a.village || a.city_district || a.city || a.hamlet || a.county || "";
  } catch {}
  await sleep(1100);
}
grounds.sort((a, b) => a.district.localeCompare(b.district) || a.name.localeCompare(b.name));
await mkdir("src/data", { recursive: true });
await writeFile(OUT, JSON.stringify({ source: "© OpenStreetMap contributors (ODbL)", fetched: new Date().toISOString().slice(0, 10), grounds }, null, 1) + "\n");
console.log(`Saved ${grounds.length} grounds to ${OUT}`);
