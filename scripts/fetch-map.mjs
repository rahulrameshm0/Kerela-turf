// Builds src/data/kerala-map.json: simplified district outlines as SVG paths (© OpenStreetMap contributors, ODbL).
// Usage: node scripts/fetch-map.mjs
import { writeFile, mkdir } from "node:fs/promises";

const UA = "TurfKeralaDirectory/1.0 (+https://www.openstreetmap.org/copyright)";
const DISTRICTS = ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"];
// Equirectangular projection shared with the browser (src/grounds.js) so venue dots line up with outlines.
const view = { west: 74.8, north: 12.85, scale: 120, kx: Math.cos((10.5 * Math.PI) / 180) };
const project = ([lng, lat]) => [((lng - view.west) * view.kx * view.scale).toFixed(1), ((view.north - lat) * view.scale).toFixed(1)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const districts = {};
for (const name of DISTRICTS) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&polygon_geojson=1&polygon_threshold=0.004&q=${encodeURIComponent(name + " district, Kerala, India")}`;
  const results = await (await fetch(url, { headers: { "User-Agent": UA } })).json();
  const hit = results.find((r) => /Polygon/.test(r.geojson?.type) && r.addresstype !== "city" && r.addresstype !== "town") || results.find((r) => /Polygon/.test(r.geojson?.type));
  if (!hit) throw new Error(`No outline for ${name}`);
  const polygons = hit.geojson.type === "Polygon" ? [hit.geojson.coordinates] : hit.geojson.coordinates;
  districts[name] = polygons
    .map((rings) => "M" + rings[0].map((p) => project(p).join(",")).join("L") + "Z")
    .join("");
  console.log(name, hit.addresstype, districts[name].length);
  await sleep(1100);
}
await mkdir("src/data", { recursive: true });
await writeFile(
  "src/data/kerala-map.json",
  JSON.stringify({ source: "© OpenStreetMap contributors (ODbL)", view, width: Math.ceil((77.45 - view.west) * view.kx * view.scale), height: Math.ceil((view.north - 8.15) * view.scale), districts }) + "\n",
);
