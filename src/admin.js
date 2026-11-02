import { photoSection, photoManager } from "./photos.js";
import { token } from "./auth.js";
import { GROUNDS, keralaMap, project } from "./grounds.js";
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

const DAY = 86400000;
// Dates are IST calendar days ("YYYY-MM-DD"); noon IST keeps arithmetic clear of midnight edges.
const addDays = (date, n) =>
  new Date(Date.parse(date + "T12:00:00+05:30") + n * DAY).toISOString().slice(0, 10);
const weekday = (date) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" }).format(
    new Date(date + "T12:00:00+05:30"),
  );
const dayNumber = (date) => Number(date.slice(8));
const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const isHeld = (s) => s.holdId && s.holdUntil > Date.now();
const ACTIVE = ["confirmed", "refund_pending"];

// Derived numbers shared by the sidebar, overview and turf cards.
function metrics(data, today) {
  const upcomingSlots = data.slots.filter((s) => s.date >= today && s.published !== false);
  const perTurf = {};
  for (const t of data.turfs) {
    const mine = upcomingSlots.filter((s) => s.turfId === t.id && !s.blocked);
    const week = mine.filter((s) => s.date < addDays(today, 7));
    perTurf[t.id] = {
      open: mine.filter((s) => !s.bookingId && !isHeld(s)).length,
      booked: week.filter((s) => s.bookingId).length,
      weekSlots: week.length,
      fill: pct(week.filter((s) => s.bookingId).length, week.length),
    };
  }
  const captured = data.payments.filter((p) => p.status === "captured");
  const collected = captured.reduce((n, p) => n + p.amount, 0);
  const refunded = data.payments.reduce((n, p) => n + (p.refunded || 0), 0);
  const upcomingGames = data.bookings.filter((b) => b.status === "confirmed" && b.start > Date.now());
  const attention = data.bookings.filter((b) => ["needs_review", "refund_pending"].includes(b.status));
  return { perTurf, collected, refunded, upcomingGames, attention };
}

// Launch checklist built from real inventory and server configuration.
function setupSteps(data, config, today) {
  const live = data.turfs.filter((t) => t.active);
  return [
    { done: data.turfs.length > 0, title: "Add your first turf", text: "Name, location, formats and price.", href: "/admin/turfs/new", action: "Add a turf" },
    { done: live.length > 0 && live.every((t) => t.coverImageId), title: "Give every turf a cover photo", text: "Listings with real photographs get chosen first.", href: live.find((t) => !t.coverImageId) ? `/admin/turfs/${live.find((t) => !t.coverImageId).id}#turf-photos` : "/admin/turfs", action: "Upload photos" },
    { done: live.some((t) => t.published), title: "Show a turf on the public page", text: "Tick “Show on the public page” and save.", href: "/admin/turfs", action: "Open turfs" },
    { done: data.slots.some((s) => s.date >= today && !s.blocked), title: "Publish upcoming slots", text: "Customers can only book published times.", href: data.turfs[0] ? `/admin/turfs/${data.turfs[0].id}#availability` : "/admin/turfs/new", action: "Publish slots" },
    { done: config.paymentsReady, title: "Connect Razorpay", text: "Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET in .env.", env: true },
    { done: Boolean(config.contact && config.legalName && config.refundPolicy), title: "Add business details", text: "Set ADMIN_CONTACT_PHONE, BUSINESS_LEGAL_NAME and REFUND_POLICY_TEXT in .env.", env: true },
    { done: config.launchMode === "public" && !config.testPayments, title: "Go live", text: "Switch to live Razorpay keys and LAUNCH_MODE=public once checks pass.", env: true },
  ];
}
const ring = (value, size = 64, label = "") =>
  `<svg class="ring" viewBox="0 0 36 36" style="width:${size}px;height:${size}px" role="img" aria-label="${label || value + "%"}"><circle cx="18" cy="18" r="15.9" class="ring-track"/><circle cx="18" cy="18" r="15.9" class="ring-value" style="--v:${value}"/><text x="18" y="20.5">${value}%</text></svg>`;

async function loadPrivateImages() {
  const elements = $$("[data-admin-image]");
  if (!elements.length) return;
  const bearer = await token();
  await Promise.all(
    elements.map(async (el) => {
      try {
        const r = await fetch("/api/images/" + el.dataset.adminImage, { headers: { Authorization: "Bearer " + bearer } });
        if (!r.ok) throw new Error();
        const url = URL.createObjectURL(await r.blob());
        if (!el.isConnected) return URL.revokeObjectURL(url);
        el.onload = () => URL.revokeObjectURL(url);
        el.src = url;
        el.classList.add("loaded");
      } catch {}
    }),
  );
}

export async function renderAdmin(ctx) {
  const { api, state, isCurrent } = ctx;
  const parts = location.pathname.split("/").filter(Boolean);
  const tab = parts[1] || "overview";
  $("#main").innerHTML = '<div class="loading">Loading marketplace operations...</div>';
  const data = await api("/admin/dashboard");
  if (!isCurrent()) return;
  const today = state.config.today;
  const m = metrics(data, today);
  const steps = setupSteps(data, state.config, today);
  const doneSteps = steps.filter((s) => s.done).length;
  const nav = [
    ["overview", "Overview", "layout-dashboard", m.attention.length || ""],
    ["turfs", "Turfs", "goal", data.turfs.length],
    ["bookings", "Bookings", "calendar-days", m.upcomingGames.length],
    ["customers", "Customers", "users", data.customers.length],
    ["payments", "Payments & refunds", "credit-card", ""],
  ];
  $("#main").innerHTML = `<div class="admin-shell"><aside class="admin-side"><div class="admin-side-head"><span class="admin-avatar">${esc(initials(state.user.name || "Admin"))}</span><div><strong>${esc(state.user.name || "Administrator")}</strong><small>${esc(state.config.business)} admin</small></div></div><nav class="admin-nav" aria-label="Admin navigation">${nav
    .map(([key, label, ic, count]) => `<a href="/admin/${key}" class="${tab === key ? "active" : ""}" ${tab === key ? 'aria-current="page"' : ""}>${icon(ic)}<span>${label}</span>${count !== "" ? `<b>${count}</b>` : ""}</a>`)
    .join("")}</nav><a class="admin-setup-mini" href="/admin/overview#setup">${ring(pct(doneSteps, steps.length), 44, `Setup ${doneSteps} of ${steps.length} done`)}<span><strong>Setup ${doneSteps}/${steps.length}</strong><small>${doneSteps === steps.length ? "Ready for bookings" : "Next: " + esc(steps.find((s) => !s.done).title)}</small></span></a><div class="admin-side-links"><a class="primary full" href="/admin/turfs/new">${icon("plus")}Add a turf</a><a class="quiet full" href="/">${icon("external-link")}View public site</a></div></aside><section class="admin-main" id="admin-content"></section></div>`;
  const content = $("#admin-content");
  const header = (title, text, actions = "") =>
    `<header class="admin-head"><div><h1>${title}</h1><p>${text}</p></div><div class="admin-head-actions">${actions}</div></header>`;

  if (tab === "turfs" && parts[2]) {
    await editor(parts[2], data, ctx, m);
    icons();
    return;
  }
  if (tab === "overview") {
    const todays = data.bookings.filter((b) => b.date === today && ACTIVE.includes(b.status)).sort((a, b) => a.start - b.start);
    const todaySlots = data.slots.filter((s) => s.date === today && !s.blocked);
    const occupancy = pct(todaySlots.filter((s) => s.bookingId).length, todaySlots.length);
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
    const perDay = days.map((d) => {
      const list = data.slots.filter((s) => s.date === d && !s.blocked);
      return { d, booked: list.filter((s) => s.bookingId).length, open: list.filter((s) => !s.bookingId).length };
    });
    const peak = Math.max(1, ...perDay.map((x) => x.booked + x.open));
    const issues = [
      ...data.turfs.filter((t) => t.active && !t.coverImageId).map((t) => ({ ic: "image", text: `${t.name} has no cover photo`, href: `/admin/turfs/${t.id}#turf-photos`, action: "Add photos" })),
      ...data.turfs.filter((t) => t.active && !m.perTurf[t.id].open).map((t) => ({ ic: "calendar-days", text: `${t.name} has no open upcoming slots`, href: `/admin/turfs/${t.id}#availability`, action: "Publish slots" })),
      ...data.turfs.filter((t) => t.active && !t.published).map((t) => ({ ic: "eye-off", text: `${t.name} is a draft, hidden from customers`, href: `/admin/turfs/${t.id}#publication`, action: "Review" })),
      ...m.attention.map((b) => ({ ic: "alert-circle", text: `${statusText(b.status)}: ${b.customerName || "Customer"} at ${b.turfName}, ${dateLabel(b.date)}`, href: "/admin/bookings?status=" + b.status, action: "Open" })),
    ];
    content.innerHTML =
      header(`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${esc((state.user.name || "there").split(" ")[0])}.`, `Here’s ${esc(state.config.business)} on ${dateLabel(today)}.`, `<a class="outline" href="/admin/bookings">${icon("calendar-days")}All bookings</a>`) +
      (doneSteps < steps.length
        ? `<section class="setup-card" id="setup"><div class="setup-head">${ring(pct(doneSteps, steps.length), 72)}<div><h2>Get ready to take bookings</h2><p>${doneSteps} of ${steps.length} steps complete. Finish these before opening TurfKerala to customers.</p></div></div><ol class="setup-steps">${steps
            .map((s) => `<li class="${s.done ? "done" : ""}"><span class="step-mark">${icon(s.done ? "check" : s.env ? "settings" : "arrow-right")}</span><div><strong>${s.title}</strong><small>${s.text}</small></div>${!s.done && s.href ? `<a class="outline" href="${s.href}">${s.action}</a>` : !s.done && s.env ? '<span class="step-env">Server setting</span>' : ""}</li>`)
            .join("")}</ol></section>`
        : "") +
      `<section class="kpi-row"><div class="kpi"><span>${icon("goal")}Games today</span><strong data-count="${todays.length}">${todays.length}</strong><small>${todaySlots.length} slots published today</small></div><div class="kpi"><span>${icon("calendar-days")}Upcoming games</span><strong data-count="${m.upcomingGames.length}">${m.upcomingGames.length}</strong><small>Confirmed and still to play</small></div><div class="kpi"><span>${icon("credit-card")}Collected</span><strong>${money(m.collected - m.refunded)}</strong><small>${money(m.collected)} paid, ${money(m.refunded)} refunded</small></div><div class="kpi kpi-ring"><div><span>${icon("users")}Occupancy today</span><small>${todaySlots.filter((s) => s.bookingId).length} of ${todaySlots.length} slots booked</small></div>${ring(occupancy, 74)}</div></section>
      <div class="overview-grid"><section class="panel"><div class="panel-head"><h2>Next 14 days</h2><span class="legend"><i class="lg-booked"></i>Booked <i class="lg-open"></i>Open</span></div><div class="day-chart">${perDay
        .map((x, i) => `<div class="day-col${x.d === today ? " today" : ""}" style="--i:${i}" title="${dateLabel(x.d)}: ${x.booked} booked, ${x.open} open"><div class="day-stack"><span class="bar-open" style="--h:${x.open / peak}"></span><span class="bar-booked" style="--h:${x.booked / peak}"></span></div><b>${dayNumber(x.d)}</b><small>${weekday(x.d)}</small></div>`)
        .join("")}</div>${perDay.every((x) => !x.open && !x.booked) ? `<p class="muted small">No slots published for the next two weeks. ${data.turfs[0] ? `<a class="text-inline" href="/admin/turfs/${data.turfs[0].id}#availability">Publish availability</a>` : ""}</p>` : ""}</section>
      <section class="panel"><div class="panel-head"><h2>Needs attention</h2><span class="count-pill">${issues.length}</span></div>${issues.length ? `<ul class="issue-list">${issues.slice(0, 7).map((x) => `<li>${icon(x.ic)}<span>${esc(x.text)}</span><a class="quiet" href="${x.href}">${x.action}</a></li>`).join("")}</ul>` : `<div class="all-clear">${icon("check-circle-2")}<p>All clear. Every turf has photos, slots and no pending issues.</p></div>`}</section></div>
      <section class="panel"><div class="panel-head"><h2>Today’s schedule</h2><a class="quiet" href="/admin/bookings">All bookings ${icon("arrow-right")}</a></div>${todays.length ? `<ol class="timeline">${todays.map((b) => `<li class="${b.end < Date.now() ? "past" : b.start <= Date.now() ? "now" : ""}"><time>${timeLabel(b.start)}</time><div><strong>${esc(b.turfName)}</strong><small>${esc(b.customerName || "Customer")} · ${esc(b.customerPhone || "No verified phone")}</small></div>${badge(b.status)}<button class="icon-button" data-inspect="${b.id}" title="Booking details" aria-label="Booking details">${icon("search")}</button></li>`).join("")}</ol>` : `<p class="muted">No games booked for today yet.</p>`}</section>`;
    bindBookingActions(data.bookings, ctx);
  } else if (tab === "turfs") {
    content.innerHTML =
      header("Turfs", `${data.turfs.filter((t) => t.active && t.published).length} live, ${plural(data.turfs.filter((t) => t.active && !t.published).length, "draft")}, ${data.turfs.filter((t) => !t.active).length} inactive.`, `<a class="primary" href="/admin/turfs/new">${icon("plus")}Add a turf</a>`) +
      `<div class="table-tools"><label class="input-icon">${icon("search")}<input id="table-search" aria-label="Search turfs" placeholder="Search turf, town, district"></label><div class="chip-row" id="turf-filter">${["all", "live", "draft", "inactive"].map((f) => `<button type="button" data-filter="${f}" class="${f === "all" ? "active" : ""}">${f[0].toUpperCase() + f.slice(1)}</button>`).join("")}</div></div><div id="admin-table"></div>`;
    let filter = "all";
    const draw = () => {
      const q = $("#table-search").value.toLowerCase();
      const list = data.turfs.filter(
        (t) =>
          `${t.name} ${t.town} ${t.district}`.toLowerCase().includes(q) &&
          (filter === "all" || (filter === "live" && t.active && t.published) || (filter === "draft" && t.active && !t.published) || (filter === "inactive" && !t.active)),
      );
      $("#admin-table").innerHTML = list.length
        ? `<div class="admin-turf-grid">${list
            .map((t) => {
              const s = m.perTurf[t.id];
              const state = t.active ? (t.published ? "live" : "draft") : "inactive";
              return `<article class="admin-turf ${state}"><a class="admin-turf-photo" href="/admin/turfs/${t.id}">${t.coverImageId ? `<img data-admin-image="${t.coverImageId}" alt="">` : ""}<span class="pitch-placeholder" aria-hidden="true"><span class="pitch-center"></span></span><span class="state-pill state-${state}">${{ live: "Live", draft: "Draft", inactive: "Inactive" }[state]}</span>${t.coverImageId ? "" : `<span class="photo-pending">No cover photo</span>`}</a><div class="admin-turf-body"><h3><a href="/admin/turfs/${t.id}">${esc(t.name)}</a></h3><p class="location">${icon("map-pin")}${esc(t.town)}, ${esc(t.district)}</p><div class="turf-stats"><div><strong>${money(t.price)}</strong><small>${t.slotDuration} min</small></div><div><strong>${s.open}</strong><small>open slots</small></div><div><strong>${s.booked}</strong><small>this week</small></div></div><div class="fill-meter" title="${s.fill}% of this week’s slots booked"><span style="--w:${s.fill / 100}"></span></div><small class="muted">${s.weekSlots ? `${s.fill}% of the next 7 days booked` : "No slots in the next 7 days"}</small><div class="admin-turf-actions"><a class="outline" href="/admin/turfs/${t.id}">${icon("pencil")}Edit</a><a class="outline" href="/admin/turfs/${t.id}#availability">${icon("calendar-days")}Slots</a>${t.active && t.published ? `<a class="icon-button" href="/turfs/${t.id}" title="View public listing" aria-label="View public listing for ${esc(t.name)}">${icon("external-link")}</a>` : ""}${t.active ? `<button class="icon-button danger" data-deactivate="${t.id}" title="Deactivate turf" aria-label="Deactivate ${esc(t.name)}">${icon("trash-2")}</button>` : ""}</div></div></article>`;
            })
            .join("")}</div>`
        : empty(data.turfs.length ? "No turfs match." : "No turfs yet.", data.turfs.length ? "Try another search or filter." : "Add your first real turf, upload photographs, and publish available slots.", data.turfs.length ? "" : `<a class="primary" href="/admin/turfs/new">${icon("plus")}Add a turf</a>`);
      $$("[data-deactivate]").forEach(
        (b) =>
          (b.onclick = () => {
            const t = data.turfs.find((x) => x.id === b.dataset.deactivate);
            modal(
              `<h2>Deactivate ${esc(t.name)}?</h2><p>The turf will disappear from discovery. Existing bookings remain available for you to manage.</p><div class="dialog-actions"><button class="primary" id="deactivate-confirm">Deactivate turf</button><button class="outline" id="deactivate-keep">Keep it live</button></div>`,
            );
            $("#deactivate-keep").onclick = () => $("#modal").close();
            $("#deactivate-confirm").onclick = (e) =>
              busy(e.currentTarget, async () => {
                await api("/admin/turfs/" + b.dataset.deactivate, "DELETE");
                $("#modal").close();
                toast(`${t.name} deactivated.`);
                renderAdmin(ctx);
              });
          }),
      );
      icons();
      loadPrivateImages();
    };
    $$("#turf-filter button").forEach(
      (b) =>
        (b.onclick = () => {
          filter = b.dataset.filter;
          $$("#turf-filter button").forEach((x) => x.classList.toggle("active", x === b));
          draw();
        }),
    );
    $("#table-search").oninput = draw;
    draw();
  } else if (tab === "bookings") {
    const statuses = ["confirmed", "payment_pending", "held", "refund_pending", "needs_review", "cancelled", "refunded", "expired"];
    const counts = Object.fromEntries(statuses.map((s) => [s, data.bookings.filter((b) => b.status === s).length]));
    let status = new URLSearchParams(location.search).get("status") || "";
    let when = "upcoming";
    content.innerHTML =
      header("Bookings", `${m.upcomingGames.length} upcoming confirmed games, ${data.bookings.length} bookings in total.`) +
      `<div class="table-tools"><label class="input-icon">${icon("search")}<input id="table-search" aria-label="Search bookings" placeholder="Customer, phone, turf, booking ID"></label><div class="chip-row" id="when-filter">${[["upcoming", "Upcoming"], ["today", "Today"], ["past", "Past"], ["all", "All dates"]].map(([v, l]) => `<button type="button" data-when="${v}" class="${v === when ? "active" : ""}">${l}</button>`).join("")}</div></div><div class="chip-row status-chips" id="status-filter"><button type="button" data-status="" class="${!status ? "active" : ""}">All statuses</button>${statuses
        .filter((s) => counts[s])
        .map((s) => `<button type="button" data-status="${s}" class="${status === s ? "active" : ""}">${statusText(s)} <b>${counts[s]}</b></button>`)
        .join("")}</div><div id="admin-table"></div>`;
    const draw = () => {
      const q = $("#table-search").value.toLowerCase();
      const list = data.bookings.filter(
        (b) =>
          (!status || b.status === status) &&
          (when === "all" || (when === "today" && b.date === today) || (when === "upcoming" && b.date >= today) || (when === "past" && b.date < today)) &&
          `${b.customerName} ${b.customerPhone} ${b.turfName} ${b.id}`.toLowerCase().includes(q),
      );
      bookingTable(list, ctx, when === "past" ? -1 : 1);
    };
    $$("#status-filter button").forEach(
      (b) =>
        (b.onclick = () => {
          status = b.dataset.status;
          $$("#status-filter button").forEach((x) => x.classList.toggle("active", x === b));
          draw();
        }),
    );
    $$("#when-filter button").forEach(
      (b) =>
        (b.onclick = () => {
          when = b.dataset.when;
          $$("#when-filter button").forEach((x) => x.classList.toggle("active", x === b));
          draw();
        }),
    );
    $("#table-search").oninput = draw;
    draw();
  } else if (tab === "customers") {
    const stats = (u) => {
      const mine = data.bookings.filter((b) => b.userId === u.id);
      const paid = mine.filter((b) => ACTIVE.includes(b.status) || b.status === "refunded");
      return { games: mine.filter((b) => ACTIVE.includes(b.status)).length, spent: paid.reduce((n, b) => n + b.price, 0), last: mine.sort((a, b) => b.start - a.start)[0] };
    };
    content.innerHTML =
      header("Customers", `${data.customers.length} players have signed in.`) +
      `<div class="table-tools"><label class="input-icon">${icon("search")}<input id="table-search" aria-label="Search customers" placeholder="Name, phone, or email"></label></div><div id="admin-table"></div>`;
    const draw = (q) => {
      const list = data.customers.filter((u) => `${u.name} ${u.verifiedPhone} ${u.email}`.toLowerCase().includes(q));
      $("#admin-table").innerHTML = list.length
        ? table(
            ["Customer", "Contact", "Games", "Spent", "Last game", ""],
            list.map((u) => {
              const s = stats(u);
              return `<tr><td><div class="person"><span class="person-avatar">${esc(initials(u.name || u.email))}</span><div>${esc(u.name || "Unnamed customer")}${u.role === "admin" ? ' <span class="status">Admin</span>' : ""}</div></div></td><td>${esc(u.verifiedPhone || "No verified phone")}<small>${esc(u.email || "No email")}</small></td><td>${s.games}</td><td>${money(s.spent)}</td><td>${s.last ? `${esc(s.last.turfName)}<small>${dateLabel(s.last.date)}</small>` : '<span class="muted">None yet</span>'}</td><td><button class="icon-button" data-history="${u.id}" title="Booking history" aria-label="View booking history for ${esc(u.name || "customer")}">${icon("history")}</button></td></tr>`;
            }),
          )
        : empty("No customers found.", "Profiles appear after the first verified sign-in.");
      $$("[data-history]").forEach(
        (b) =>
          (b.onclick = () => {
            const u = data.customers.find((x) => x.id === b.dataset.history);
            const list = data.bookings.filter((x) => x.userId === u.id).sort((a, b) => b.start - a.start);
            modal(
              `<h2>${esc(u.name || "Customer")}</h2><p>${esc(u.verifiedPhone || "No verified phone")} · ${esc(u.email || "No email")}</p><div class="modal-list">${list.map((x) => `<div class="history-row"><div><strong>${esc(x.turfName)}</strong><small>${dateLabel(x.date)} · ${timeLabel(x.start)} · ${money(x.price)}</small></div>${badge(x.status)}</div>`).join("") || "<p>No bookings yet.</p>"}</div>`,
            );
          }),
      );
      icons();
    };
    draw("");
    $("#table-search").oninput = (e) => draw(e.target.value.toLowerCase());
  } else if (tab === "payments") {
    const pendingRefunds = data.refunds.filter((r) => !["processed", "failed"].includes(r.status));
    content.innerHTML =
      header("Payments & refunds", "Verified Razorpay activity and refund progress.", `<button class="outline" id="reconcile">${icon("refresh-cw")}Reconcile payments</button>`) +
      `${state.config.testPayments ? notice("Razorpay test mode. No real money moves until live keys are configured.", "warn") : ""}<section class="kpi-row"><div class="kpi"><span>${icon("credit-card")}Collected</span><strong>${money(m.collected)}</strong><small>${data.payments.filter((p) => p.status === "captured").length} captured payments</small></div><div class="kpi"><span>${icon("refresh-cw")}Refunded</span><strong>${money(m.refunded)}</strong><small>${data.refunds.filter((r) => r.status === "processed").length} refunds processed</small></div><div class="kpi"><span>${icon("check-circle-2")}Net</span><strong>${money(m.collected - m.refunded)}</strong><small>After refunds</small></div><div class="kpi"><span>${icon("clock")}Refunds in progress</span><strong>${pendingRefunds.length}</strong><small>${money(pendingRefunds.reduce((n, r) => n + r.amount, 0))} waiting</small></div></section><div class="table-tools"><label class="input-icon">${icon("search")}<input id="table-search" aria-label="Search payment references" placeholder="Payment or booking reference"></label></div><div class="panel-head"><h2>Payments</h2></div><div id="admin-table"></div><div class="panel-head" style="margin-top:28px"><h2>Refunds</h2></div><div id="refund-table"></div>`;
    const draw = (q) => {
      $("#admin-table").innerHTML = data.payments.length
        ? table(
            ["Payment reference", "Booking", "Method", "Amount", "Status", "Refunded"],
            data.payments
              .filter((p) => `${p.id} ${p.bookingId} ${p.orderId}`.toLowerCase().includes(q))
              .map((p) => `<tr><td>${esc(p.id)}<small>${esc(p.orderId)}</small></td><td>#${p.bookingId.slice(0, 8).toUpperCase()}</td><td>${esc(p.method)}</td><td>${money(p.amount)}</td><td>${badge(p.status)}</td><td>${money(p.refunded)}</td></tr>`),
          )
        : empty("No payments recorded.", "Verified payment activity will appear here.");
      $("#refund-table").innerHTML = data.refunds.length
        ? table(
            ["Booking", "Payment reference", "Amount", "Reason", "Status"],
            data.refunds
              .filter((r) => `${r.paymentId} ${r.bookingId} ${r.gatewayId}`.toLowerCase().includes(q))
              .map((r) => `<tr><td>#${r.bookingId.slice(0, 8).toUpperCase()}</td><td>${esc(r.paymentId)}<small>${esc(r.gatewayId || "Awaiting gateway reference")}</small></td><td>${money(r.amount)}</td><td>${esc(r.reason.replaceAll("_", " "))}</td><td>${badge(r.status)}</td></tr>`),
          )
        : '<p class="muted">No refunds requested.</p>';
      icons();
    };
    draw("");
    $("#table-search").oninput = (e) => draw(e.target.value.toLowerCase());
    $("#reconcile").onclick = (e) =>
      busy(e.currentTarget, async () => {
        const result = await api("/admin/reconcile", "POST", {});
        toast(`Reconciliation complete. ${result.checked} orders checked; ${result.errors} need another attempt.`);
        renderAdmin(ctx);
      });
  } else content.innerHTML = empty("Page not found", "Choose an admin section from the menu.");
  icons();
}
function table(headers, rows) {
  return `<div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}">No matching records.</td></tr>`}</tbody></table></div>`;
}
function bookingTable(list, ctx, order = 1) {
  $("#admin-table").innerHTML = list.length
    ? table(
        ["Customer", "Turf & time", "Amount", "Status", ""],
        list
          .sort((a, b) => (a.start - b.start) * order)
          .map(
            (b) =>
              `<tr><td><div class="person"><span class="person-avatar">${esc(initials(b.customerName))}</span><div>${esc(b.customerName || "Customer")}<small>${esc(b.customerPhone || "No verified phone")}</small></div></div></td><td>${esc(b.turfName)}<small>${dateLabel(b.date)} · ${timeLabel(b.start)}</small></td><td>${money(b.price)}</td><td>${badge(b.status)}</td><td><div class="row-actions"><button class="icon-button" data-inspect="${b.id}" title="Booking details" aria-label="Inspect booking">${icon("search")}</button>${b.status === "confirmed" ? `<button class="icon-button danger" data-admin-cancel="${b.id}" title="Cancel and refund booking" aria-label="Cancel booking">${icon("x")}</button>` : ""}</div></td></tr>`,
          ),
      )
    : empty("No bookings found.", "Bookings will appear when customers reserve a published slot.");
  bindBookingActions(list, ctx);
}
function bindBookingActions(list, ctx) {
  $$("[data-inspect]").forEach(
    (button) =>
      (button.onclick = () => {
        const b = list.find((b) => b.id === button.dataset.inspect);
        modal(
          `<h2>${esc(b.turfName)}</h2><p>${dateLabel(b.date)} · ${timeLabel(b.start)}${b.end ? " - " + timeLabel(b.end) : ""}</p>${badge(b.status)}<dl class="detail-list"><dt>Customer</dt><dd>${esc(b.customerName || "Customer")}<br>${esc(b.customerPhone || "No verified phone")}</dd><dt>Booking</dt><dd>#${b.id.slice(0, 8).toUpperCase()}<small>${b.id}</small></dd><dt>Order</dt><dd>${esc(b.orderId || "Not created")}</dd><dt>Payments</dt><dd>${b.paymentIds.map(esc).join(", ") || "None"}</dd><dt>Total</dt><dd>${money(b.price)}</dd></dl><h3>Activity</h3><ol class="audit">${b.audit.map((a) => `<li><span>${esc(a.action.replaceAll("_", " "))}</span><small>${dateLabel(a.at)} ${timeLabel(a.at)}</small></li>`).join("")}</ol>`,
        );
      }),
  );
  $$("[data-admin-cancel]").forEach(
    (button) =>
      (button.onclick = () => {
        const b = list.find((b) => b.id === button.dataset.adminCancel);
        modal(
          `<h2>Cancel this booking?</h2><p>${esc(b.customerName)} · ${esc(b.turfName)}<br>${dateLabel(b.date)} · ${timeLabel(b.start)}</p><p>Admin cancellation releases the slot and requests a full ${money(b.price)} refund.</p><div id="admin-cancel-error"></div><div class="dialog-actions"><button id="admin-cancel-confirm" class="primary">Cancel & refund</button><button id="admin-cancel-keep" class="outline">Keep booking</button></div>`,
        );
        $("#admin-cancel-keep").onclick = () => $("#modal").close();
        $("#admin-cancel-confirm").onclick = (e) =>
          busy(e.currentTarget, async () => {
            try {
              await ctx.api(`/bookings/${b.id}/cancel`, "POST", {});
              $("#modal").close();
              toast("Booking cancelled. The refund has been requested.");
              renderAdmin(ctx);
            } catch (error) {
              $("#admin-cancel-error").innerHTML = notice(error.message, "error");
              icons();
            }
          });
      }),
  );
  icons();
}
const SURFACES = ["Artificial grass", "Natural grass", "Indoor turf"];
const AMENITIES = ["Floodlights", "Parking", "Changing rooms", "Drinking water", "Washrooms", "Seating", "Wi-Fi"];
async function editor(id, data, ctx, m) {
  const { api, navigate, state } = ctx;
  const isNew = id === "new",
    t = isNew
      ? { formats: [7], price: 120000, slotDuration: 60, cutoffHours: 2, refundPercent: 100, active: true, published: true, amenities: [] }
      : data.turfs.find((t) => t.id === id);
  if (!t) {
    $("#admin-content").innerHTML = empty("Turf not found", "Choose another turf from inventory.", `<a class="outline" href="/admin/turfs">${icon("arrow-left")}All turfs</a>`);
    return;
  }
  const sections = [
    ["details", "Details"],
    ["location", "Location"],
    ["pricing", "Pricing"],
    ["turf-photos", "Photos"],
    ["publication", "Publication"],
    ...(isNew ? [] : [["availability", "Availability"]]),
  ];
  $("#admin-content").innerHTML = `<header class="admin-head"><div><a class="back" href="/admin/turfs">${icon("arrow-left")}All turfs</a><h1>${isNew ? "Add a real turf" : esc(t.name)}</h1><p>${isNew ? "Fill in the details customers see, then publish slots to take bookings." : `${esc(t.town)}, ${esc(t.district)}`}</p></div><div class="admin-head-actions">${!isNew && t.active && t.published ? `<a class="outline" href="/turfs/${t.id}">${icon("external-link")}View public listing</a>` : ""}</div></header><nav class="editor-steps" aria-label="Turf editor sections">${sections.map(([k, l], i) => `<a href="#${k}"><b>${i + 1}</b>${l}</a>`).join("")}</nav><div class="editor-layout"><div class="admin-editor">${
    isNew
      ? `<section class="form-section prefill"><h2>${icon("map")}Start from a mapped ground</h2><p class="small muted">Search ${GROUNDS.length} real Kerala venues from OpenStreetMap to fill the name and location. Check every detail with the owner before publishing.</p><label class="input-icon">${icon("search")}<input id="prefill-search" placeholder="For example, Anfield or Kakkanad" aria-label="Search mapped grounds"></label><div id="prefill-results" class="prefill-results"></div></section>`
      : ""
  }<form id="turf-form"><section class="form-section" id="details"><h2>Turf details</h2><div class="form-grid">${field("Turf name", "name", t.name, 'required maxlength="100" placeholder="For example, Kottakkal Sports Arena"')}<label class="field"><span>Surface</span><select name="surface">${options(SURFACES, t.surface)}</select></label><label class="field span-2"><span>About this turf</span><textarea name="description" maxlength="2500" placeholder="Pitch size, lighting, parking, nearby landmarks…">${esc(t.description)}</textarea><small><span id="desc-count">${(t.description || "").length}</span>/2500 characters</small></label></div><div class="field" style="margin-top:20px"><span>Team formats</span><div class="toggle-grid">${[5, 7, 9, 11].map((n) => `<label class="toggle-card"><input type="checkbox" name="formats" value="${n}" ${t.formats.includes(n) ? "checked" : ""}><span><strong>${n}-a-side</strong><small>${n * 2} players</small></span></label>`).join("")}</div></div><div class="field" style="margin-top:18px"><span>Facilities</span><div class="toggle-grid amenities-grid">${AMENITIES.map((a) => `<label class="toggle-card"><input type="checkbox" name="amenities" value="${a}" ${t.amenities.includes(a) ? "checked" : ""}><span>${a}</span></label>`).join("")}</div></div></section><section class="form-section" id="location"><h2>Location</h2><div class="location-grid"><div class="form-grid">${field("Town / locality", "town", t.town, 'required maxlength="100"')}<label class="field"><span>District</span><select name="district" required>${options(state.config.districts, t.district, "Select district")}</select></label><label class="field span-2"><span>Full address</span><input name="address" value="${esc(t.address)}" required maxlength="300"></label>${field("Latitude", "lat", t.coordinates?.lat, 'type="number" step="any" min="8" max="12.85" required')}${field("Longitude", "lng", t.coordinates?.lng, 'type="number" step="any" min="74.8" max="77.5" required')}<p class="small muted span-2">Tip: in Google Maps, right-click the pitch and click the coordinates to copy them. <a class="text-inline" id="check-map" href="#" target="_blank" rel="noopener noreferrer">Check this pin in Google Maps</a></p></div><div class="pin-map" id="pin-map">${keralaMap({ label: false, cls: "pin" })}<small id="pin-label">Enter coordinates to place the pin</small></div></div></section><section class="form-section" id="pricing"><h2>Pricing & cancellation</h2><div class="form-grid">${field("Price per slot (INR)", "price", t.price / 100, 'type="number" min="1" max="100000" step="0.01" required')}<label class="field"><span>Slot duration (minutes)</span><select name="slotDuration">${options([30, 60, 90, 120], t.slotDuration)}</select></label>${field("Cancellation cutoff (hours)", "cutoffHours", t.cutoffHours, 'type="number" min="0" max="168" step="0.5" required')}${field("Refund before cutoff (%)", "refundPercent", t.refundPercent, 'type="number" min="0" max="100" required')}</div><p class="policy-preview" id="policy-preview"></p><p class="small muted">Pricing and duration apply to newly generated slots. Existing bookings retain their agreed price and policy.</p></section><div id="turf-photos">${photoSection}</div><section class="form-section" id="publication"><h2>Publication</h2><div class="toggle-grid publish-grid"><label class="toggle-card switch"><input type="checkbox" name="active" ${t.active ? "checked" : ""}><span><strong>Active</strong><small>Inactive turfs are hidden everywhere and cannot be booked.</small></span></label><label class="toggle-card switch"><input type="checkbox" name="published" ${t.published ? "checked" : ""}><span><strong>Show on the public page</strong><small>Uncheck to keep this turf as a private draft.</small></span></label></div></section><div class="form-actions sticky-save"><button type="submit" class="primary">${icon("check")}${isNew ? "Save turf" : "Save changes"}</button><a class="outline" href="/admin/turfs">Cancel</a><span class="save-hint" id="save-hint"></span></div><div id="turf-error" role="alert"></div></form>${
    isNew
      ? ""
      : `<section class="form-section" id="availability"><h2>Availability</h2><div class="cal-strip" id="cal-strip"></div><div class="slot-day-head"><div><h3 id="slot-day-title"></h3><p class="small muted" id="slot-day-summary"></p></div><div class="row-actions"><input id="admin-slot-date" type="date" value="${state.config.today}" aria-label="Manage slots for date"><button id="block-day" class="outline danger">${icon("x")}Block date</button><button id="unblock-day" class="outline">${icon("check")}Unblock date</button></div></div><div id="admin-slots"></div><form id="slots-form" class="publish-box"><h3>${icon("calendar-days")}Publish new slots</h3><div class="chip-row"><span class="small muted">Dates</span>${[["Today", 0], ["Next 7 days", 6], ["Next 30 days", 30]].map(([l, n]) => `<button type="button" data-range="${n}">${l}</button>`).join("")}<span class="small muted">Hours</span>${[["6 AM to 11 PM", "06:00-23:00"], ["Evenings 4 to 11 PM", "16:00-23:00"], ["Mornings 5 to 10 AM", "05:00-10:00"]].map(([l, v]) => `<button type="button" data-hours="${v}">${l}</button>`).join("")}</div><div class="form-grid four">${field("From date", "from", state.config.today, `type="date" min="${state.config.today}" required`)}${field("Through date", "to", addDays(state.config.today, 6), `type="date" min="${state.config.today}" required`)}${field("Opening time (IST)", "open", "06:00", 'type="time" required')}${field("Closing time (IST)", "close", "23:00", 'type="time" required')}</div><p class="small muted" id="publish-estimate"></p><button class="primary">${icon("calendar-days")}Publish slots</button></form></section>`
  }</div><aside class="editor-preview"><p class="preview-label">${icon("eye")}Customer preview</p><article class="turf-card preview-card" id="preview-card"></article><div class="completeness" id="completeness"></div></aside></div>`;
  let savedId = isNew ? null : id;
  const manager = photoManager({ api, turfId: savedId, coverImageId: t.coverImageId, name: t.name, isCurrent: ctx.isCurrent });
  await manager.load();
  if (!ctx.isCurrent()) return;
  const form = $("#turf-form");
  const pinSvg = $("#pin-map svg");
  pinSvg.insertAdjacentHTML("beforeend", '<g class="map-pin" id="map-pin" hidden><circle r="22" class="pin-halo"/><circle r="10" class="pin-dot"/></g>');
  let dirty = false;
  // Keep the preview, map pin and policy text in step with the form.
  function preview() {
    const f = new FormData(form),
      v = Object.fromEntries(f),
      formats = f.getAll("formats").map(Number),
      amenities = f.getAll("amenities");
    const price = Math.round(Number(v.price || 0) * 100);
    const cover = t.coverImageId && !isNew ? `<img data-admin-image="${t.coverImageId}" alt="">` : "";
    $("#preview-card").innerHTML = `<div class="turf-photo">${cover}<div class="pitch-placeholder" aria-hidden="true"><span class="pitch-center"></span></div><span class="photo-badge">${formats.map((n) => n + "-a-side").join(" / ") || "Choose a format"}</span></div><div class="turf-content"><h3>${esc(v.name || "Turf name")}</h3><div class="location">${icon("map-pin")}${esc(v.town || "Town")}, ${esc(v.district || "District")}</div><div class="tags"><span class="tag">${esc(v.surface)}</span>${formats.map((n) => `<span class="tag">${n * 2} players</span>`).join("")}</div><div class="card-bottom"><div><div class="price">${money(price)} <small>/ ${v.slotDuration} min</small></div><span class="availability">${!isNew && m.perTurf[id] ? m.perTurf[id].open + " open slots" : "Publish slots after saving"}</span></div></div></div>`;
    $("#policy-preview").innerHTML = `${icon("shield-check")}Customers see: “Changes close ${esc(v.cutoffHours || 0)} hours before your slot. Eligible cancellations receive a ${esc(v.refundPercent || 0)}% refund.”`;
    $("#desc-count").textContent = (v.description || "").length;
    const lat = Number(v.lat), lng = Number(v.lng), pin = $("#map-pin");
    if (lat >= 8 && lat <= 12.85 && lng >= 74.8 && lng <= 77.5) {
      const [x, y] = project(lat, lng);
      pin.setAttribute("transform", `translate(${x} ${y})`);
      pin.hidden = false;
      $("#pin-label").textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      $("#check-map").href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    } else {
      pin.hidden = true;
      $("#pin-label").textContent = "Enter coordinates inside Kerala to place the pin";
    }
    pinSvg.querySelectorAll(".district").forEach((p) => p.classList.toggle("active", p.dataset.mapDistrict === v.district));
    const checks = [
      [v.name, "Name"],
      [v.town && v.district && v.address, "Address"],
      [v.lat && v.lng, "Map pin"],
      [formats.length, "Team format"],
      [(v.description || "").length >= 40, "Description"],
      [amenities.length, "Facilities"],
      [t.coverImageId || manager.hasPending, "Cover photo"],
    ];
    const done = checks.filter(([ok]) => ok).length;
    $("#completeness").innerHTML = `<div class="completeness-head"><strong>Listing ${pct(done, checks.length)}% complete</strong><div class="fill-meter"><span style="--w:${done / checks.length}"></span></div></div><ul>${checks.map(([ok, label]) => `<li class="${ok ? "done" : ""}">${icon(ok ? "check" : "x")}${label}</li>`).join("")}</ul>`;
    icons();
    loadPrivateImages();
  }
  form.addEventListener("input", () => {
    dirty = true;
    $("#save-hint").textContent = "Unsaved changes";
    preview();
  });
  form.addEventListener("change", preview);
  preview();
  // Highlight the editor section in view.
  const stepLinks = $$(".editor-steps a");
  const spy = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) stepLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
      }),
    { rootMargin: "-30% 0px -60% 0px" },
  );
  sections.forEach(([k]) => document.getElementById(k) && spy.observe(document.getElementById(k)));
  if (isNew) {
    const results = $("#prefill-results");
    $("#prefill-search").oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      const found = q.length < 2 ? [] : GROUNDS.filter((g) => `${g.name} ${g.town} ${g.district}`.toLowerCase().includes(q)).slice(0, 6);
      results.innerHTML = found.map((g) => `<button type="button" data-ground="${g.id}">${icon("map-pin")}<span><strong>${esc(g.name)}</strong><small>${esc(g.town)}, ${g.district}${g.surface ? " · " + g.surface : ""}</small></span>${icon("arrow-right")}</button>`).join("") || (q.length >= 2 ? '<p class="small muted">No mapped grounds match. Fill in the details below.</p>' : "");
      results.querySelectorAll("[data-ground]").forEach(
        (b) =>
          (b.onclick = () => {
            const g = GROUNDS.find((x) => x.id === b.dataset.ground);
            const set = (name, value) => (form.elements[name].value = value);
            set("name", g.name);
            set("town", g.town);
            set("district", g.district);
            set("lat", g.lat);
            set("lng", g.lng);
            if (!form.elements.address.value) set("address", `${g.town}, ${g.district}, Kerala`);
            if (g.surface === "Natural grass") set("surface", "Natural grass");
            else if (g.surface) set("surface", "Artificial grass");
            form.dispatchEvent(new Event("input"));
            results.innerHTML = notice(`Filled from OpenStreetMap: ${g.name}. Confirm the address, price and formats with the owner.`, "success");
            icons();
            $("#details").scrollIntoView({ behavior: "smooth", block: "start" });
          }),
      );
      icons();
    };
  }
  // Warn before closing the tab with unsaved edits; inert once the editor is gone.
  const leave = (e) => {
    if (dirty && form.isConnected) e.preventDefault();
  };
  addEventListener("beforeunload", leave);
  form.onsubmit = (e) => {
    e.preventDefault();
    if (form.dataset.saving) return;
    const f = new FormData(form),
      input = Object.fromEntries(f);
    input.formats = f.getAll("formats").map(Number);
    input.amenities = f.getAll("amenities");
    input.active = f.has("active");
    input.published = f.has("published");
    if (!input.formats.length) {
      $("#turf-error").innerHTML = notice("Choose at least one team format.", "error");
      icons();
      return;
    }
    busy(form.querySelector('button[type="submit"]'), async () => {
      form.dataset.saving = "true";
      try {
        const result = await api("/admin/turfs" + (savedId ? "/" + savedId : ""), savedId ? "PATCH" : "POST", isNew && manager.hasPending ? { ...input, published: false } : input);
        savedId = result.turf.id;
        if (manager.hasPending) {
          await manager.upload(savedId, input.name);
          if (input.published) await api("/admin/turfs/" + savedId, "PATCH", input);
        }
        dirty = false;
        removeEventListener("beforeunload", leave);
        toast(input.active && input.published ? "Turf saved and visible on the public page." : "Turf saved. This listing is hidden from the public page.");
        navigate("/admin/turfs/" + result.turf.id + (isNew ? "#availability" : ""));
      } catch (error) {
        if (ctx.isCurrent()) $("#turf-error").innerHTML = notice(error.message, "error");
        icons();
      } finally {
        delete form.dataset.saving;
      }
    });
  };
  if (isNew) return;
  let slots = data.slots.filter((s) => s.turfId === id);
  const blockedDates = new Set((data.blockedDates || []).filter((d) => d.turfId === id).map((d) => d.date));
  const slotState = (s) => (s.bookingId ? "booked" : isHeld(s) ? "held" : s.blocked ? "blocked" : "open");
  function drawCalendar() {
    const selected = $("#admin-slot-date").value;
    $("#cal-strip").innerHTML = Array.from({ length: 14 }, (_, i) => addDays(state.config.today, i))
      .map((d, i) => {
        const list = slots.filter((s) => s.date === d);
        const booked = list.filter((s) => s.bookingId).length, open = list.filter((s) => slotState(s) === "open").length;
        const blocked = blockedDates.has(d);
        return `<button type="button" data-day="${d}" class="cal-day${d === selected ? " active" : ""}${blocked ? " blocked" : ""}${!list.length && !blocked ? " empty" : ""}" style="--i:${i}"><small>${weekday(d)}</small><strong>${dayNumber(d)}</strong><span class="cal-fill"><i style="--w:${list.length ? booked / list.length : 0}"></i></span><small>${blocked ? "Blocked" : list.length ? `${open} open` : "No slots"}</small></button>`;
      })
      .join("");
    $$("[data-day]").forEach(
      (b) =>
        (b.onclick = () => {
          $("#admin-slot-date").value = b.dataset.day;
          drawSlots();
        }),
    );
  }
  function drawSlots() {
    const date = $("#admin-slot-date").value;
    const list = slots.filter((s) => s.date === date).sort((a, b) => a.start - b.start);
    const dateBlocked = blockedDates.has(date);
    const count = (k) => list.filter((s) => slotState(s) === k).length;
    $("#slot-day-title").textContent = dateLabel(date);
    $("#slot-day-summary").textContent = list.length ? `${count("open")} open, ${count("booked")} booked, ${count("held")} held, ${count("blocked")} blocked` : "No published slots on this date.";
    $("#admin-slots").innerHTML =
      (dateBlocked ? notice("This date is blocked. Unblock it before publishing or opening slots.", "warn") : "") +
      (list.length
        ? `<div class="slot-admin-list">${list
            .map((s) => {
              const st = slotState(s);
              return `<div class="slot-admin slot-${st}"><strong>${timeLabel(s.start)}</strong><small>${money(s.price)} · ${{ booked: "Booked", held: "Held", blocked: "Blocked", open: "Open" }[st]}</small><button data-toggle-slot="${s.id}" ${s.bookingId || isHeld(s) || dateBlocked ? "disabled" : ""}>${s.blocked ? "Unblock" : "Block"}</button></div>`;
            })
            .join("")}</div>`
        : "");
    $$("[data-toggle-slot]").forEach(
      (button) =>
        (button.onclick = () =>
          busy(button, async () => {
            const s = slots.find((s) => s.id === button.dataset.toggleSlot);
            await api(`/admin/turfs/${id}/block`, "POST", { slotId: s.id, blocked: !s.blocked });
            s.blocked = !s.blocked;
            drawSlots();
          })),
    );
    drawCalendar();
    icons();
  }
  $("#admin-slot-date").onchange = drawSlots;
  const sf = $("#slots-form");
  function estimate() {
    const v = Object.fromEntries(new FormData(sf));
    const days = Math.round((Date.parse(v.to) - Date.parse(v.from)) / DAY) + 1;
    const [oh, om] = (v.open || "0:0").split(":").map(Number), [ch, cm] = (v.close || "0:0").split(":").map(Number);
    const per = Math.max(0, Math.floor((ch * 60 + cm - oh * 60 - om) / Number(form.elements.slotDuration.value)));
    $("#publish-estimate").textContent = days > 0 && days <= 31 && per ? `About ${days * per} slots: ${per} a day for ${days} ${days === 1 ? "day" : "days"}. Existing, blocked and past times are skipped.` : days > 31 ? "Choose up to 31 days per batch." : "Check the dates and opening hours.";
  }
  $$("[data-range]").forEach(
    (b) =>
      (b.onclick = () => {
        sf.elements.from.value = state.config.today;
        sf.elements.to.value = addDays(state.config.today, Number(b.dataset.range));
        estimate();
      }),
  );
  $$("[data-hours]").forEach(
    (b) =>
      (b.onclick = () => {
        [sf.elements.open.value, sf.elements.close.value] = b.dataset.hours.split("-");
        estimate();
      }),
  );
  sf.oninput = estimate;
  estimate();
  sf.onsubmit = (e) => {
    e.preventDefault();
    busy(sf.querySelector("button:not([type])"), async () => {
      const r = await api(`/admin/turfs/${id}/slots`, "POST", Object.fromEntries(new FormData(sf)));
      toast(`${r.created} slots published; ${r.skipped} existing, blocked or past slots skipped.`);
      slots = (await api("/admin/dashboard")).slots.filter((s) => s.turfId === id);
      $("#admin-slot-date").value = sf.elements.from.value;
      drawSlots();
    });
  };
  for (const [selector, blocked] of [
    ["#block-day", true],
    ["#unblock-day", false],
  ])
    $(selector).onclick = (e) =>
      busy(e.currentTarget, async () => {
        const date = $("#admin-slot-date").value;
        await api(`/admin/turfs/${id}/block`, "POST", { date, blocked });
        if (blocked) blockedDates.add(date);
        else blockedDates.delete(date);
        slots.filter((s) => s.date === date).forEach((s) => (s.blocked = blocked));
        drawSlots();
        toast(blocked ? "Date blocked." : "Date unblocked.");
      });
  drawSlots();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
