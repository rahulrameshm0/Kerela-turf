import {
  createIcons,
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  ArrowDown,
  MapPin,
  Map as MapIcon,
  Search,
  SlidersHorizontal,
  Users,
  Goal,
  CalendarDays,
  Calendar,
  Clock,
  Sun,
  Moon,
  UserRound,
  LogOut,
  Menu,
  X,
  Check,
  ShieldCheck,
  Phone,
  Headset,
  Navigation,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Upload,
  Image,
  LockKeyhole,
  CreditCard,
  Smartphone,
  LoaderCircle,
  AlertCircle,
  RefreshCw,
  LayoutDashboard,
  Settings,
  CheckCircle2,
  Mail,
  LocateFixed,
  History,
  Flag,
  Lightbulb,
  ParkingCircle,
  Shirt,
  Wifi,
  GlassWater,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide";
const iconSet = {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  ArrowDown,
  MapPin,
  Map: MapIcon,
  Search,
  SlidersHorizontal,
  Users,
  Goal,
  CalendarDays,
  Calendar,
  Clock,
  Sun,
  Moon,
  UserRound,
  LogOut,
  Menu,
  X,
  Check,
  ShieldCheck,
  Phone,
  Headset,
  Navigation,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Upload,
  Image,
  LockKeyhole,
  CreditCard,
  Smartphone,
  LoaderCircle,
  AlertCircle,
  RefreshCw,
  LayoutDashboard,
  Settings,
  CheckCircle2,
  Mail,
  LocateFixed,
  History,
  Flag,
  Lightbulb,
  ParkingCircle,
  Shirt,
  Wifi,
  GlassWater,
  ExternalLink,
  Eye,
  EyeOff,
};
export const $ = (s) => document.querySelector(s);
export const $$ = (s) => [...document.querySelectorAll(s)];
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const icon = (name) =>
  `<i data-lucide="${name}" aria-hidden="true"></i>`;
export const icons = () => createIcons({ icons: iconSet });
export const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n / 100);
export const dateLabel = (d) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(
    new Date(
      typeof d === "string" && d.length === 10 ? d + "T12:00:00+05:30" : d,
    ),
  );
export const timeLabel = (ms) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(ms);
export const statusText = (s) =>
  ({
    held: "Slot held",
    payment_pending: "Payment pending",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    refund_pending: "Refund pending",
    refunded: "Refunded",
    expired: "Hold expired",
    needs_review: "Needs review",
    queued: "Queued",
    pending: "Pending",
    processed: "Processed",
    failed: "Failed",
    requesting: "Processing",
  })[s] || s;
export const badge = (s) =>
  `<span class="status status-${s}">${esc(statusText(s))}</span>`;
export const empty = (title, text, action = "") =>
  `<div class="empty-state"><span class="empty-goal">${icon("goal")}</span><h2>${esc(title)}</h2><p>${esc(text)}</p>${action}</div>`;
export const notice = (text, kind = "info") =>
  `<div class="notice ${kind}">${icon(kind === "success" ? "check-circle-2" : "alert-circle")}<span>${esc(text)}</span></div>`;
export function modal(html) {
  $("#modal-content").innerHTML = html;
  if (!$("#modal").open) $("#modal").showModal();
  icons();
}
let timer;
export function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => ($("#toast").hidden = true), 6000);
}
export async function busy(button, fn) {
  if (button.disabled) return;
  button.disabled = true;
  const original = button.innerHTML;
  button.innerHTML = icon("loader-circle") + " Please wait";
  icons();
  try {
    return await fn();
  } catch (e) {
    toast(e.message);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
    icons();
  }
}
export const field = (label, name, value = "", attrs = "") =>
  `<label class="field"><span>${esc(label)}</span><input name="${name}" value="${esc(value)}" ${attrs}></label>`;
export const options = (values, selected, all = "") =>
  (all ? `<option value="">${esc(all)}</option>` : "") +
  values
    .map(
      (x) =>
        `<option value="${esc(x)}" ${String(x) === String(selected) ? "selected" : ""}>${esc(x)}</option>`,
    )
    .join("");
