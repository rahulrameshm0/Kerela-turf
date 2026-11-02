import { photoSection, photoManager } from "./photos.js";
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
export async function renderAdmin(ctx) {
  const { api, navigate, state, isCurrent } = ctx;
  const parts = location.pathname.split("/").filter(Boolean);
  const tab = parts[1] || "overview";
  $("#main").innerHTML =
    '<div class="loading">Loading marketplace operations...</div>';
  const data = await api("/admin/dashboard");
  if (!isCurrent()) return;
  const head = `<div class="page-top page-top-row"><div><h1>Marketplace operations</h1><p>Manage Kerala’s pitches, games, and customers.</p></div><a class="primary" href="/admin/turfs/new">${icon("plus")}Add a turf</a></div><nav class="admin-nav" aria-label="Admin navigation">${[
    ["overview", "Overview"],
    ["turfs", "Turfs"],
    ["bookings", "Bookings"],
    ["customers", "Customers"],
    ["payments", "Payments & refunds"],
  ]
    .map(
      ([key, label]) =>
        `<a href="/admin/${key}" class="${tab === key ? "active" : ""}">${label}</a>`,
    )
    .join("")}</nav>`;
  $("#main").innerHTML = head + '<div id="admin-content"></div>';
  if (tab === "turfs" && parts[2]) {
    await editor(parts[2], data, ctx);
    icons();
    return;
  }
  if (tab === "overview") {
    $("#admin-content").innerHTML = `<section class="stat-row">${[
      ["Today’s bookings", data.summary.today],
      ["Upcoming games", data.summary.upcoming],
      ["Customers", data.summary.customers],
      ["Today’s occupancy", data.summary.occupancy + "%"],
    ]
      .map(
        ([label, value]) =>
          `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`,
      )
      .join(
        "",
      )}</section><div class="section-heading"><div><h2>Today’s bookings</h2><p>${dateLabel(state.config.today)}</p></div><a class="quiet" href="/admin/bookings">All bookings ${icon("arrow-right")}</a></div><div id="admin-table"></div>`;
    bookingTable(
      data.bookings.filter((b) => b.date === state.config.today),
      data,
      ctx,
    );
  } else if (tab === "turfs") {
    $("#admin-content").innerHTML =
      `<div class="table-tools"><h2>Turf inventory</h2><input id="table-search" aria-label="Search turfs" placeholder="Search turf, town, district"></div><div id="admin-table"></div>`;
    const draw = (q) => {
      const list = data.turfs.filter((t) =>
        `${t.name} ${t.town} ${t.district}`.toLowerCase().includes(q),
      );
      $("#admin-table").innerHTML = list.length
        ? table(
            ["Turf", "Location", "Price", "Status", "Actions"],
            list.map(
              (t) =>
                `<tr><td><strong>${esc(t.name)}</strong><small>${t.formats.join(" / ")}-a-side</small></td><td>${esc(t.town)}<small>${esc(t.district)}</small></td><td>${money(t.price)}<small>${t.slotDuration} min</small></td><td>${badge(t.active ? (t.published ? "confirmed" : "held") : "cancelled")}<small>${t.active ? (t.published ? "Published" : "Draft") : "Inactive"}</small></td><td><div class="row-actions"><a class="icon-button" title="Edit turf" aria-label="Edit ${esc(t.name)}" href="/admin/turfs/${t.id}">${icon("pencil")}</a><a class="icon-button" title="Manage availability" aria-label="Manage availability" href="/admin/turfs/${t.id}?section=slots">${icon("calendar-days")}</a><button class="icon-button danger" data-deactivate="${t.id}" title="Deactivate turf" aria-label="Deactivate ${esc(t.name)}">${icon("trash-2")}</button></div></td></tr>`,
            ),
          )
        : empty(
            "No turfs yet.",
            "Add your first real turf, upload photographs, and publish available slots.",
          );
      $$("[data-deactivate]").forEach(
        (b) =>
          (b.onclick = () => {
            modal(
              '<h2>Deactivate this turf?</h2><p>The turf will disappear from discovery. Existing bookings remain available for you to manage.</p><button class="primary" id="deactivate-confirm">Deactivate turf</button>',
            );
            $("#deactivate-confirm").onclick = (e) =>
              busy(e.currentTarget, async () => {
                await api("/admin/turfs/" + b.dataset.deactivate, "DELETE");
                $("#modal").close();
                renderAdmin(ctx);
              });
          }),
      );
      icons();
    };
    draw("");
    $("#table-search").oninput = (e) => draw(e.target.value.toLowerCase());
  } else if (tab === "bookings") {
    $("#admin-content").innerHTML =
      `<div class="table-tools"><input id="table-search" aria-label="Search bookings" placeholder="Customer, phone, turf, booking ID"><select id="booking-status" aria-label="Filter booking status" style="max-width:210px">${options(["confirmed", "payment_pending", "held", "cancelled", "refund_pending", "refunded", "expired"], "", "All statuses")}</select></div><div id="admin-table"></div>`;
    const draw = () => {
      const q = $("#table-search").value.toLowerCase(),
        status = $("#booking-status").value;
      bookingTable(
        data.bookings.filter(
          (b) =>
            (!status || b.status === status) &&
            `${b.customerName} ${b.customerPhone} ${b.turfName} ${b.id}`
              .toLowerCase()
              .includes(q),
        ),
        data,
        ctx,
      );
    };
    $("#table-search").oninput = draw;
    $("#booking-status").onchange = draw;
    draw();
  } else if (tab === "customers") {
    $("#admin-content").innerHTML =
      '<div class="table-tools"><h2>Customers</h2><input id="table-search" aria-label="Search customers" placeholder="Name, phone, or email"></div><div id="admin-table"></div>';
    const draw = (q) => {
      const list = data.customers.filter((u) =>
        `${u.name} ${u.verifiedPhone} ${u.email}`.toLowerCase().includes(q),
      );
      $("#admin-table").innerHTML = list.length
        ? table(
            ["Customer", "Verified phone", "Email", "Bookings", "History"],
            list.map(
              (u) =>
                `<tr><td>${esc(u.name || "Unnamed customer")}</td><td>${esc(u.verifiedPhone || "Not linked")}</td><td>${esc(u.email || "Not provided")}</td><td>${data.bookings.filter((b) => b.userId === u.id).length}</td><td><button class="icon-button" data-history="${u.id}" title="Booking history" aria-label="View booking history">${icon("history")}</button></td></tr>`,
            ),
          )
        : empty(
            "No customers found.",
            "Profiles appear after the first verified sign-in.",
          );
      $$("[data-history]").forEach(
        (b) =>
          (b.onclick = () => {
            const list = data.bookings.filter(
              (x) => x.userId === b.dataset.history,
            );
            modal(
              `<h2>Booking history</h2>${list.map((x) => `<div class="checkout-info"><h3>${esc(x.turfName)}</h3><p>${dateLabel(x.date)} · ${timeLabel(x.start)} · ${money(x.price)}</p>${badge(x.status)}</div>`).join("") || "<p>No bookings yet.</p>"}`,
            );
          }),
      );
      icons();
    };
    draw("");
    $("#table-search").oninput = (e) => draw(e.target.value.toLowerCase());
  } else if (tab === "payments") {
    $("#admin-content").innerHTML =
      `<div class="table-tools"><input id="table-search" aria-label="Search payment references" placeholder="Payment or booking reference"><button class="outline" id="reconcile">${icon("refresh-cw")}Reconcile payments</button></div><div id="admin-table"></div><div class="section-heading"><h2>Refunds</h2></div><div id="refund-table"></div>`;
    const draw = (q) => {
      $("#admin-table").innerHTML = data.payments.length
        ? table(
            [
              "Payment reference",
              "Booking",
              "Method",
              "Amount",
              "Status",
              "Refunded",
            ],
            data.payments
              .filter((p) =>
                `${p.id} ${p.bookingId} ${p.orderId}`.toLowerCase().includes(q),
              )
              .map(
                (p) =>
                  `<tr><td>${esc(p.id)}<small>${esc(p.orderId)}</small></td><td>${p.bookingId.slice(0, 8)}</td><td>${esc(p.method)}</td><td>${money(p.amount)}</td><td>${badge(p.status)}</td><td>${money(p.refunded)}</td></tr>`,
              ),
          )
        : empty(
            "No payments recorded.",
            "Verified payment activity will appear here.",
          );
      $("#refund-table").innerHTML = data.refunds.length
        ? table(
            ["Booking", "Payment reference", "Amount", "Reason", "Status"],
            data.refunds
              .filter((r) =>
                `${r.paymentId} ${r.bookingId} ${r.gatewayId}`
                  .toLowerCase()
                  .includes(q),
              )
              .map(
                (r) =>
                  `<tr><td>${r.bookingId.slice(0, 8)}</td><td>${esc(r.paymentId)}<small>${esc(r.gatewayId || "Awaiting gateway reference")}</small></td><td>${money(r.amount)}</td><td>${esc(r.reason.replaceAll("_", " "))}</td><td>${badge(r.status)}</td></tr>`,
              ),
          )
        : '<p class="muted">No refunds requested.</p>';
      icons();
    };
    draw("");
    $("#table-search").oninput = (e) => draw(e.target.value.toLowerCase());
    $("#reconcile").onclick = (e) =>
      busy(e.currentTarget, async () => {
        const result = await api("/admin/reconcile", "POST", {});
        toast(
          `Reconciliation complete. ${result.checked} orders checked; ${result.errors} need another attempt.`,
        );
        renderAdmin(ctx);
      });
  } else
    $("#admin-content").innerHTML = empty(
      "Page not found",
      "Choose an admin section above.",
    );
  icons();
}
function table(headers, rows) {
  return `<div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}">No matching records.</td></tr>`}</tbody></table></div>`;
}
function bookingTable(list, data, ctx) {
  $("#admin-table").innerHTML = list.length
    ? table(
        ["Customer", "Turf & time", "Amount", "Status", "Actions"],
        list
          .sort((a, b) => a.start - b.start)
          .map(
            (b) =>
              `<tr><td>${esc(b.customerName || "Customer")}<small>${esc(b.customerPhone || "No verified phone")}</small></td><td>${esc(b.turfName)}<small>${dateLabel(b.date)} · ${timeLabel(b.start)}</small></td><td>${money(b.price)}</td><td>${badge(b.status)}</td><td><div class="row-actions"><button class="icon-button" data-inspect="${b.id}" title="Booking details" aria-label="Inspect booking">${icon("search")}</button>${b.status === "confirmed" ? `<button class="icon-button danger" data-admin-cancel="${b.id}" title="Cancel and refund booking" aria-label="Cancel booking">${icon("x")}</button>` : ""}</div></td></tr>`,
          ),
      )
    : empty(
        "No bookings found.",
        "Bookings will appear when customers reserve a published slot.",
      );
  $$("[data-inspect]").forEach(
    (button) =>
      (button.onclick = () => {
        const b = list.find((b) => b.id === button.dataset.inspect);
        modal(
          `<h2>${esc(b.turfName)}</h2><p>${esc(b.customerName)}<br>${esc(b.customerPhone)}<br>${dateLabel(b.date)} · ${timeLabel(b.start)}</p>${badge(b.status)}<div class="checkout-info"><p>Booking ${b.id}<br>Order ${esc(b.orderId || "Not created")}<br>Payments ${b.paymentIds.map(esc).join(", ") || "None"}<br>Total ${money(b.price)}</p></div><h3 style="margin-top:20px">Activity</h3>${b.audit.map((a) => `<p class="small">${esc(a.action.replaceAll("_", " "))} · ${dateLabel(a.at)} ${timeLabel(a.at)}</p>`).join("")}`,
        );
      }),
  );
  $$("[data-admin-cancel]").forEach(
    (button) =>
      (button.onclick = () => {
        const b = list.find((b) => b.id === button.dataset.adminCancel);
        modal(
          `<h2>Cancel this booking?</h2><p>${esc(b.customerName)} · ${esc(b.turfName)}<br>${dateLabel(b.date)} · ${timeLabel(b.start)}</p><p>Admin cancellation releases the slot and requests a full ${money(b.price)} refund.</p><div id="admin-cancel-error"></div><button id="admin-cancel-confirm" class="primary">Cancel & refund</button>`,
        );
        $("#admin-cancel-confirm").onclick = (e) =>
          busy(e.currentTarget, async () => {
            try {
              await ctx.api(`/bookings/${b.id}/cancel`, "POST", {});
              $("#modal").close();
              renderAdmin(ctx);
            } catch (error) {
              $("#admin-cancel-error").innerHTML = notice(
                error.message,
                "error",
              );
              icons();
            }
          });
      }),
  );
  icons();
}
async function editor(id, data, ctx) {
  const { api, navigate, state } = ctx;
  const isNew = id === "new",
    t = isNew
      ? {
          formats: [7],
          price: 120000,
          slotDuration: 60,
          cutoffHours: 2,
          refundPercent: 100,
          active: true,
          published: true,
          amenities: [],
        }
      : data.turfs.find((t) => t.id === id);
  if (!t) {
    $("#admin-content").innerHTML = empty(
      "Turf not found",
      "Choose another turf from inventory.",
    );
    return;
  }
  $("#admin-content").innerHTML =
    `<div class="admin-editor"><a class="back" href="/admin/turfs">${icon("arrow-left")}All turfs</a><h2>${isNew ? "Add a real turf" : esc(t.name)}</h2>${!isNew && t.active && t.published ? `<a class="quiet" href="/turfs/${t.id}">View public listing ${icon("external-link")}</a>` : ""}<form id="turf-form"><section class="form-section"><h2>Turf details</h2><div class="form-grid">${field("Turf name", "name", t.name, 'required maxlength="100"')}${field("Town / locality", "town", t.town, 'required maxlength="100"')}<label class="field"><span>District</span><select name="district" required>${options(state.config.districts, t.district, "Select district")}</select></label><label class="field"><span>Surface</span><select name="surface">${options(["Artificial grass", "Natural grass", "Indoor turf"], t.surface)}</select></label><label class="field span-2"><span>Full address</span><input name="address" value="${esc(t.address)}" required maxlength="300"></label>${field("Latitude", "lat", t.coordinates?.lat, 'type="number" step="any" min="8" max="12.85" required')}${field("Longitude", "lng", t.coordinates?.lng, 'type="number" step="any" min="74.8" max="77.5" required')}<label class="field span-2"><span>About this turf</span><textarea name="description" maxlength="2500">${esc(t.description)}</textarea></label></div><div class="field" style="margin-top:20px"><span>Team formats</span><div class="checks">${[5, 7, 9, 11].map((n) => `<label class="check-label"><input type="checkbox" name="formats" value="${n}" ${t.formats.includes(n) ? "checked" : ""}>${n}-a-side (${n * 2} players)</label>`).join("")}</div></div><div class="field" style="margin-top:15px"><span>Facilities</span><div class="checks">${["Floodlights", "Parking", "Changing rooms", "Drinking water", "Washrooms", "Seating", "Wi-Fi"].map((a) => `<label class="check-label"><input type="checkbox" name="amenities" value="${a}" ${t.amenities.includes(a) ? "checked" : ""}>${a}</label>`).join("")}</div></div></section><section class="form-section"><h2>Pricing & cancellation</h2><div class="form-grid">${field("Price per slot (INR)", "price", t.price / 100, 'type="number" min="1" max="100000" step="0.01" required')}<label class="field"><span>Slot duration (minutes)</span><select name="slotDuration">${options([30, 60, 90, 120], t.slotDuration)}</select></label>${field("Cancellation cutoff (hours)", "cutoffHours", t.cutoffHours, 'type="number" min="0" max="168" step="0.5" required')}${field("Refund before cutoff (%)", "refundPercent", t.refundPercent, 'type="number" min="0" max="100" required')}</div><p class="small muted" style="margin-top:15px">Pricing and duration apply to newly generated slots. Existing bookings retain their agreed price and policy.</p></section>${photoSection}<section class="form-section"><h2>Publication</h2><div class="checks"><label class="check-label"><input type="checkbox" name="active" ${t.active ? "checked" : ""}>Active</label><label class="check-label"><input type="checkbox" name="published" ${t.published ? "checked" : ""}>Show on the public page</label></div><p class="small muted" style="margin-top:12px">Active turfs appear on the home page when this is checked, even before slots are added. Uncheck to save a draft.</p></section><div class="form-actions"><button type="submit" class="primary">${icon("check")}Save turf</button><a class="outline" href="/admin/turfs">Back to inventory</a></div><div id="turf-error" role="alert"></div></form>${isNew ? "" : `<section class="form-section" id="availability-editor"><h2>Publish availability</h2><form id="slots-form"><div class="form-grid">${field("From date", "from", state.config.today, `type="date" min="${state.config.today}" required`)}${field("Through date", "to", state.config.today, `type="date" min="${state.config.today}" required`)}${field("Opening time (IST)", "open", "06:00", 'type="time" required')}${field("Closing time (IST)", "close", "23:00", 'type="time" required')}</div><p class="small muted" style="margin-top:15px">Up to 31 days per batch. Existing or overlapping slots are left unchanged.</p><button class="primary">${icon("calendar-days")}Publish slots</button></form></section><section class="form-section"><h2>Manage slots & blocked dates</h2><div class="table-tools"><input id="admin-slot-date" type="date" value="${state.config.today}" aria-label="Manage slots for date"><button id="block-day" class="outline danger">${icon("x")}Block date</button><button id="unblock-day" class="outline">${icon("check")}Unblock date</button></div><div id="admin-slots"></div></section>`}</div>`;
  let savedId = isNew ? null : id;
  const manager = photoManager({ api, turfId: savedId, coverImageId: t.coverImageId, name: t.name, isCurrent: ctx.isCurrent });
  await manager.load();
  if (!ctx.isCurrent()) return;
  $("#turf-form").onsubmit = (e) => {
    e.preventDefault();
    if (e.target.dataset.saving) return;
    const form = new FormData(e.target),
      input = Object.fromEntries(form);
    input.formats = form.getAll("formats").map(Number);
    input.amenities = form.getAll("amenities");
    input.active = form.has("active");
    input.published = form.has("published");
    busy(e.target.querySelector('button[type="submit"]'), async () => {
      e.target.dataset.saving = "true";
      try {
        const result = await api(
          "/admin/turfs" + (savedId ? "/" + savedId : ""),
          savedId ? "PATCH" : "POST",
          isNew && manager.hasPending ? { ...input, published: false } : input,
        );
        savedId = result.turf.id;
        if (manager.hasPending) {
          await manager.upload(savedId, input.name);
          if (input.published) await api("/admin/turfs/" + savedId, "PATCH", input);
        }
        toast(input.active && input.published ? "Turf saved and visible on the public page." : "Turf saved. This listing is hidden from the public page.");
        navigate("/admin/turfs/" + result.turf.id);
      } catch (error) {
        if (ctx.isCurrent()) $("#turf-error").innerHTML = notice(error.message, "error");
        icons();
      } finally {
        delete e.target.dataset.saving;
      }
    });
  };
  if (isNew) return;
  let slots = data.slots.filter((s) => s.turfId === id);
  const blockedDates = new Set((data.blockedDates || []).filter(d => d.turfId === id).map(d => d.date));
  function drawSlots() {
    const list = slots
      .filter((s) => s.date === $("#admin-slot-date").value)
      .sort((a, b) => a.start - b.start);
    const dateBlocked = blockedDates.has($("#admin-slot-date").value);
    $("#admin-slots").innerHTML = (dateBlocked ? notice("This date is blocked. Unblock it before publishing or opening slots.", "warn") : "") + (list.length
      ? `<div class="slot-admin-list">${list
          .map((s) => {
            const held = s.holdId && s.holdUntil > Date.now();
            return `<div class="slot-admin"><strong>${timeLabel(s.start)}</strong><small>${money(s.price)} · ${s.bookingId ? "Booked" : held ? "Held" : s.blocked ? "Blocked" : "Open"}</small><button data-toggle-slot="${s.id}" ${s.bookingId || held || dateBlocked ? "disabled" : ""}>${s.blocked ? "Unblock" : "Block"}</button></div>`;
          })
          .join("")}</div>`
      : '<p class="muted">No published slots on this date.</p>');
    $$("[data-toggle-slot]").forEach(
      (button) =>
        (button.onclick = () =>
          busy(button, async () => {
            const s = slots.find((s) => s.id === button.dataset.toggleSlot);
            await api(`/admin/turfs/${id}/block`, "POST", {
              slotId: s.id,
              blocked: !s.blocked,
            });
            s.blocked = !s.blocked;
            drawSlots();
          })),
    );
    icons();
  }
  $("#admin-slot-date").onchange = drawSlots;
  $("#slots-form").onsubmit = (e) => {
    e.preventDefault();
    busy(e.target.querySelector("button"), async () => {
      const r = await api(
        `/admin/turfs/${id}/slots`,
        "POST",
        Object.fromEntries(new FormData(e.target)),
      );
      toast(
        `${r.created} slots published; ${r.skipped} existing, blocked or past slots skipped.`,
      );
      slots = (await api("/admin/dashboard")).slots.filter(
        (s) => s.turfId === id,
      );
      drawSlots();
    });
  };
  for (const [selector, blocked] of [
    ["#block-day", true],
    ["#unblock-day", false],
  ])
    $(selector).onclick = (e) =>
      busy(e.currentTarget, async () => {
        await api(`/admin/turfs/${id}/block`, "POST", {
          date: $("#admin-slot-date").value,
          blocked,
        });
        if (blocked) blockedDates.add($("#admin-slot-date").value);
        else blockedDates.delete($("#admin-slot-date").value);
        slots
          .filter((s) => s.date === $("#admin-slot-date").value)
          .forEach((s) => (s.blocked = blocked));
        drawSlots();
        toast(blocked ? "Date blocked." : "Date unblocked.");
      });
  drawSlots();
  if (new URLSearchParams(location.search).get("section") === "slots")
    $("#availability-editor").scrollIntoView();
}
