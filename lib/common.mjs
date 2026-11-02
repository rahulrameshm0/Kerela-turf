export const DISTRICTS = [
  "Alappuzha",
  "Ernakulam",
  "Idukki",
  "Kannur",
  "Kasaragod",
  "Kollam",
  "Kottayam",
  "Kozhikode",
  "Malappuram",
  "Palakkad",
  "Pathanamthitta",
  "Thiruvananthapuram",
  "Thrissur",
  "Wayanad",
];
export class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
export const assert = (condition, status, code, message, details) => {
  if (!condition) throw new AppError(status, code, message, details);
};
export const indiaDate = (ms = Date.now()) =>
  new Date(ms + 19800000).toISOString().slice(0, 10);
export const slotTime = (date, time) => Date.parse(`${date}T${time}:00+05:30`);
export function dateValid(d) {
  return (
    typeof d === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d
  );
}
export const withinKerala = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= 8 &&
  lat <= 12.85 &&
  lng >= 74.8 &&
  lng <= 77.5;
export function distanceKm(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat),
    dLng = r(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export const available = (s, now) =>
  s.published &&
  !s.blocked &&
  s.start > now &&
  !s.bookingId &&
  (!s.holdId || s.holdUntil <= now);
export const clean = (value, max = 200) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
