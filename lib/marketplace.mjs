import { randomUUID, createHash } from "node:crypto";
import {
  assert,
  available,
  clean,
  DISTRICTS,
  dateValid,
  distanceKm,
  indiaDate,
  slotTime,
  withinKerala,
} from "./common.mjs";
import { validSignature } from "./razorpay.mjs";

const HOLD_MS = 10 * 60 * 1000;
const activeHold = (b) => ["held", "payment_pending"].includes(b.status);
const audit = (b, action, at, actor) => [
  ...(b.audit || []),
  { action, at, actor },
];
const refundReceipt = (id) =>
  "tk_" + createHash("sha256").update(id).digest("hex").slice(0, 36);
const publicSlot = (s) => ({
  id: s.id,
  turfId: s.turfId,
  date: s.date,
  start: s.start,
  end: s.end,
  price: s.price,
});
export class Marketplace {
  constructor(store, gateway, config, clock = () => Date.now()) {
    Object.assign(this, { store, gateway, config, clock });
  }
  async search(q = {}) {
    let turfs = await this.store.list("turfs", [["published", "==", true]]);
    turfs = turfs.filter((t) => t.active);
    if (q.district) turfs = turfs.filter((t) => t.district === q.district);
    if (q.q) {
      const text = q.q.toLowerCase();
      turfs = turfs.filter((t) =>
        `${t.name} ${t.town} ${t.district} ${t.address}`
          .toLowerCase()
          .includes(text),
      );
    }
    if (q.format)
      turfs = turfs.filter((t) => t.formats.includes(Number(q.format)));
    if (q.surface) turfs = turfs.filter((t) => t.surface === q.surface);
    const date = dateValid(q.date) ? q.date : indiaDate(this.clock());
    const slots = await this.store.list("slots", [["date", "==", date]]);
    turfs = turfs.map((t) => ({
      ...t,
      openSlots: slots.filter(
        (s) => s.turfId === t.id && available(s, this.clock()),
      ).length,
    }));
    if (q.available === "true") turfs = turfs.filter((t) => t.openSlots > 0);
    const lat = Number(q.lat),
      lng = Number(q.lng);
    if (
      q.lat !== undefined &&
      q.lng !== undefined &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      turfs = turfs
        .map((t) => ({
          ...t,
          distance: distanceKm({ lat, lng }, t.coordinates),
        }))
        .sort((a, b) => a.distance - b.distance);
      if (q.radius)
        turfs = turfs.filter(
          (t) =>
            t.distance <= Math.max(1, Math.min(200, Number(q.radius) || 30)),
        );
    } else turfs.sort((a, b) => a.name.localeCompare(b.name));
    return { turfs, date };
  }
  async detail(id) {
    const turf = await this.store.get("turfs", id);
    assert(
      turf?.active && turf.published,
      404,
      "NOT_FOUND",
      "This turf is not available.",
    );
    const photos = await this.store.list("images", [["turfId", "==", id]]);
    return {
      turf,
      photos: photos
        .filter((p) => !p.deleted)
        .sort(
          (a, b) =>
            Number(b.id === turf.coverImageId) -
              Number(a.id === turf.coverImageId) ||
            a.createdAt - b.createdAt ||
            a.id.localeCompare(b.id),
        ),
    };
  }
  async availability(id, date) {
    await this.detail(id);
    assert(dateValid(date), 400, "INVALID_DATE", "Choose a valid date.");
    const slots = await this.store.list("slots", [["turfId", "==", id]]);
    return {
      slots: slots
        .filter((s) => s.date === date && available(s, this.clock()))
        .sort((a, b) => a.start - b.start)
        .map(publicSlot),
    };
  }
  async alternatives(slotId) {
    const slot = await this.store.get("slots", slotId);
    if (!slot) return [];
    const slots = await this.store.list("slots", [
      ["turfId", "==", slot.turfId],
    ]);
    return slots
      .filter((s) => available(s, this.clock()))
      .sort(
        (a, b) =>
          Math.abs(a.start - slot.start) - Math.abs(b.start - slot.start),
      )
      .slice(0, 4)
      .map(publicSlot);
  }
  owned(b, user) {
    assert(b, 404, "NOT_FOUND", "Booking not found.");
    assert(
      b.userId === user.id || user.role === "admin",
      403,
      "FORBIDDEN",
      "This booking belongs to another customer.",
    );
  }
  cutoff(b, admin = false) {
    assert(
      admin || b.start - this.clock() >= b.cutoffHours * 3600000,
      409,
      "CUTOFF_PASSED",
      `Changes close ${b.cutoffHours} hours before play.`,
    );
  }
  async hold(user, slotId, replaces = null) {
    assert(
      typeof slotId === "string" && slotId.length < 180,
      400,
      "INVALID_SLOT",
      "Choose a slot.",
    );
    const id = randomUUID(),
      now = this.clock();
    try {
      return await this.store.transaction(async (tx) => {
        const slot = await tx.get("slots", slotId);
        assert(slot, 404, "NOT_FOUND", "Slot not found.");
        const turf = await tx.get("turfs", slot.turfId);
        const old = replaces ? await tx.get("bookings", replaces) : null;
        const current = slot.holdId
          ? await tx.get("bookings", slot.holdId)
          : null;
        const pending = old?.pendingChange
          ? await tx.get("bookings", old.pendingChange)
          : null;
        if (
          current &&
          current.userId === user.id &&
          activeHold(current) &&
          current.expiresAt > now &&
          current.replaces === replaces
        )
          return current;
        assert(
          turf?.active && turf.published,
          409,
          "TURF_UNAVAILABLE",
          "This turf is no longer accepting bookings.",
        );
        assert(
          available(slot, now),
          409,
          "SLOT_CONFLICT",
          "This turf was just booked",
        );
        if (replaces) {
          this.owned(old, user);
          assert(
            old.status === "confirmed",
            409,
            "INVALID_STATE",
            "Only confirmed bookings can be rescheduled.",
          );
          this.cutoff(old);
          assert(
            !pending ||
              (activeHold(pending) && pending.expiresAt <= now) ||
              ["expired", "cancelled", "refunded"].includes(pending.status),
            409,
            "CHANGE_PENDING",
            "Another change is still being processed.",
          );
          assert(
            old.turfId === slot.turfId && old.slotId !== slotId,
            400,
            "INVALID_RESCHEDULE",
            "Choose a different slot on the same turf.",
          );
        }
        const booking = {
          id,
          userId: user.id,
          customerName: user.name,
          customerPhone: user.verifiedPhone,
          turfId: turf.id,
          turfName: turf.name,
          slotId,
          date: slot.date,
          start: slot.start,
          end: slot.end,
          price: slot.price,
          currency: "INR",
          cutoffHours: turf.cutoffHours,
          refundPercent: turf.refundPercent,
          status: "held",
          expiresAt: now + HOLD_MS,
          replaces,
          pendingChange: null,
          amountDue: replaces
            ? Math.max(0, slot.price - old.price)
            : slot.price,
          paymentIds: replaces ? [...old.paymentIds] : [],
          orderId: null,
          createdAt: now,
          updatedAt: now,
          audit: [{ action: "held", at: now, actor: user.id }],
        };
        tx.set("slots", slotId, {
          ...slot,
          holdId: id,
          holdUntil: booking.expiresAt,
        });
        tx.set("bookings", id, booking);
        if (old) tx.set("bookings", old.id, { ...old, pendingChange: id });
        return booking;
      });
    } catch (e) {
      if (e.code === "SLOT_CONFLICT")
        e.details = { alternatives: await this.alternatives(slotId) };
      throw e;
    }
  }
  async booking(user, id) {
    let b = await this.store.get("bookings", id);
    this.owned(b, user);
    if (activeHold(b) && b.expiresAt <= this.clock()) {
      await this.expire(id);
      b = await this.store.get("bookings", id);
    }
    return b;
  }
  async listBookings(user) {
    const bookings = await this.store.list(
      "bookings",
      user.role === "admin" ? [] : [["userId", "==", user.id]],
    );
    for (const b of bookings)
      if (activeHold(b) && b.expiresAt <= this.clock()) await this.expire(b.id);
    return (
      await this.store.list(
        "bookings",
        user.role === "admin" ? [] : [["userId", "==", user.id]],
      )
    ).sort((a, b) => b.createdAt - a.createdAt);
  }
  async expire(id) {
    const now = this.clock();
    return this.store.transaction(async (tx) => {
      const b = await tx.get("bookings", id);
      if (!b || !activeHold(b) || b.expiresAt > now) return;
      const slot = await tx.get("slots", b.slotId);
      const old = b.replaces ? await tx.get("bookings", b.replaces) : null;
      tx.set("bookings", id, {
        ...b,
        status: "expired",
        updatedAt: now,
        audit: audit(b, "expired", now, "system"),
      });
      if (slot?.holdId === id)
        tx.set("slots", slot.id, { ...slot, holdId: null, holdUntil: 0 });
      if (old?.pendingChange === id)
        tx.set("bookings", old.id, { ...old, pendingChange: null });
    });
  }
  async release(user, id) {
    const b = await this.booking(user, id);
    assert(
      activeHold(b),
      409,
      "INVALID_STATE",
      "This booking cannot be released.",
    );
    await this.store.transaction(async (tx) => {
      const current = await tx.get("bookings", id);
      assert(
        activeHold(current),
        409,
        "INVALID_STATE",
        "The booking has changed. Refresh to continue.",
      );
      tx.set("bookings", id, { ...current, expiresAt: 0 });
    });
    await this.expire(id);
    return this.booking(user, id);
  }
  async order(user, id) {
    const b = await this.booking(user, id);
    assert(
      activeHold(b),
      409,
      "HOLD_EXPIRED",
      "Your hold expired. Choose an available slot.",
    );
    if (!b.amountDue) return { booking: await this.finalizeFree(user, id) };
    assert(
      this.config.paymentsReady,
      503,
      "PAYMENTS_UNAVAILABLE",
      "Payments are not connected yet.",
    );
    if (b.orderId)
      return {
        orderId: b.orderId,
        amount: b.amountDue,
        keyId: this.config.razorpay.keyId,
        booking: b,
      };
    const token = randomUUID();
    await this.store.transaction(async (tx) => {
      const current = await tx.get("bookings", id);
      assert(
        activeHold(current) && current.expiresAt > this.clock(),
        409,
        "HOLD_EXPIRED",
        "Your hold expired.",
      );
      assert(
        !current.orderId && !current.orderCreating,
        409,
        "ORDER_PENDING",
        "Payment setup is already in progress. Refresh shortly.",
      );
      tx.set("bookings", id, {
        ...current,
        orderCreating: token,
        status: "payment_pending",
      });
    });
    let order;
    try {
      order = await this.gateway.createOrder(b.amountDue, id);
    } catch (e) {
      await this.store.transaction(async (tx) => {
        const current = await tx.get("bookings", id);
        if (current.orderCreating === token)
          tx.set("bookings", id, { ...current, orderCreating: null });
      });
      throw e;
    }
    await this.store.transaction(async (tx) => {
      const current = await tx.get("bookings", id);
      tx.set("orders", order.id, {
        id: order.id,
        bookingId: id,
        amount: b.amountDue,
        createdAt: this.clock(),
      });
      tx.set("bookings", id, {
        ...current,
        orderId: order.id,
        orderCreating: null,
      });
    });
    const current = await this.booking(user, id);
    assert(
      activeHold(current),
      409,
      "HOLD_EXPIRED",
      "Your hold expired. No payment was requested.",
    );
    return {
      orderId: order.id,
      amount: b.amountDue,
      keyId: this.config.razorpay.keyId,
      booking: current,
    };
  }
  async verifyPayment(user, id, input) {
    const b = await this.booking(user, id);
    assert(
      b.orderId &&
        input.razorpay_order_id === b.orderId &&
        validSignature(
          `${b.orderId}|${input.razorpay_payment_id}`,
          input.razorpay_signature,
          this.config.razorpay.secret,
        ),
      400,
      "INVALID_SIGNATURE",
      "Payment verification failed.",
    );
    const p = await this.gateway.payment(input.razorpay_payment_id);
    await this.settlePayment(p);
    return this.booking(user, id);
  }
  async settlePayment(p) {
    const mapping = await this.store.get("orders", p.order_id);
    assert(
      mapping,
      404,
      "ORDER_NOT_FOUND",
      "Payment order is not recorded yet.",
    );
    assert(
      p.currency === "INR" && p.amount === mapping.amount,
      400,
      "PAYMENT_MISMATCH",
      "The payment amount does not match the booking.",
    );
    const now = this.clock();
    const result = await this.store.transaction(async (tx) => {
      const b = await tx.get("bookings", mapping.bookingId);
      const payment = await tx.get("payments", p.id);
      const s = await tx.get("slots", b.slotId);
      const old = b.replaces ? await tx.get("bookings", b.replaces) : null;
      const oldSlot = old ? await tx.get("slots", old.slotId) : null;
      const t = await tx.get("turfs", b.turfId);
      if (payment?.settled) return b;
      const record = {
        id: p.id,
        bookingId: b.id,
        orderId: p.order_id,
        amount: p.amount,
        currency: "INR",
        method: ["card", "upi"].includes(p.method) ? p.method : "other",
        status: p.status,
        refunded: payment?.refunded || 0,
        reservedRefund: payment?.reservedRefund || 0,
        settled: false,
        updatedAt: now,
      };
      if (p.status !== "captured") {
        if (payment?.status !== "captured") tx.set("payments", p.id, record);
        return b;
      }
      record.settled = true;
      const canConfirm =
        activeHold(b) &&
        b.expiresAt > now &&
        s.holdId === b.id &&
        !s.bookingId &&
        !s.blocked &&
        t?.active &&
        t.published &&
        (!old || (old.status === "confirmed" && old.pendingChange === b.id));
      if (!canConfirm) {
        record.reservedRefund = p.amount;
        tx.set("payments", p.id, record);
        const refundId = `late_${p.id}`;
        tx.set("refunds", refundId, {
          id: refundId,
          bookingId: b.id,
          paymentId: p.id,
          amount: p.amount,
          reason: "late_payment",
          status: "queued",
          createdAt: now,
        });
        const failed = {
          ...b,
          status: b.status === "confirmed" ? b.status : "refund_pending",
          updatedAt: now,
          audit: audit(b, "late_payment_refund", now, "system"),
        };
        tx.set("bookings", b.id, failed);
        if (s.holdId === b.id)
          tx.set("slots", s.id, { ...s, holdId: null, holdUntil: 0 });
        if (old?.pendingChange === b.id)
          tx.set("bookings", old.id, { ...old, pendingChange: null });
        return failed;
      }
      tx.set("payments", p.id, record);
      const confirmed = {
        ...b,
        status: "confirmed",
        paymentIds: [...b.paymentIds, p.id],
        updatedAt: now,
        audit: audit(b, "payment_verified", now, "system"),
      };
      tx.set("bookings", b.id, confirmed);
      tx.set("slots", s.id, {
        ...s,
        bookingId: b.id,
        holdId: null,
        holdUntil: 0,
      });
      if (old) {
        tx.set("bookings", old.id, {
          ...old,
          status: "cancelled",
          cancelReason: "rescheduled",
          pendingChange: null,
          replacedBy: b.id,
          audit: audit(old, "rescheduled", now, b.userId),
        });
        tx.set("slots", oldSlot.id, { ...oldSlot, bookingId: null });
      }
      return confirmed;
    });
    await this.processRefunds(result.id);
    return result;
  }
  async finalizeFree(user, id) {
    const now = this.clock();
    await this.store.transaction(async (tx) => {
      const b = await tx.get("bookings", id);
      this.owned(b, user);
      assert(
        activeHold(b) && b.expiresAt > now && b.replaces && b.amountDue === 0,
        409,
        "HOLD_EXPIRED",
        "Your hold has expired.",
      );
      const old = await tx.get("bookings", b.replaces),
        s = await tx.get("slots", b.slotId),
        oldSlot = await tx.get("slots", old.slotId),
        t = await tx.get("turfs", b.turfId);
      const payments = await Promise.all(
        b.paymentIds.map((pid) => tx.get("payments", pid)),
      );
      assert(
        old.status === "confirmed" &&
          old.pendingChange === b.id &&
          s.holdId === b.id &&
          !s.blocked &&
          !s.bookingId &&
          t.active &&
          t.published,
        409,
        "SLOT_CONFLICT",
        "This turf was just booked",
      );
      this.cutoff(old);
      const difference = old.price - b.price;
      if (difference > 0) {
        this.queueRefunds(tx, b, payments, difference, "reschedule", now);
        tx.set("bookings", b.id, {
          ...b,
          status: "refund_pending",
          refundPurpose: "reschedule",
          updatedAt: now,
        });
        tx.set("slots", s.id, {
          ...s,
          bookingId: b.id,
          holdId: null,
          holdUntil: 0,
        });
        return;
      }
      tx.set("bookings", b.id, {
        ...b,
        status: "confirmed",
        updatedAt: now,
        audit: audit(b, "rescheduled", now, user.id),
      });
      tx.set("bookings", old.id, {
        ...old,
        status: "cancelled",
        cancelReason: "rescheduled",
        pendingChange: null,
        replacedBy: b.id,
        audit: audit(old, "rescheduled", now, user.id),
      });
      tx.set("slots", s.id, {
        ...s,
        bookingId: b.id,
        holdId: null,
        holdUntil: 0,
      });
      tx.set("slots", oldSlot.id, { ...oldSlot, bookingId: null });
    });
    await this.processRefunds(id);
    return this.booking(user, id);
  }
  queueRefunds(tx, b, payments, amount, reason, now) {
    let remaining = amount;
    const plan = [];
    for (const p of [...payments].reverse()) {
      if (!p) continue;
      const refund = Math.min(
        remaining,
        p.amount - p.refunded - p.reservedRefund,
      );
      if (refund > 0) {
        plan.push({ p, refund });
        remaining -= refund;
      }
      if (!remaining) break;
    }
    assert(
      !remaining,
      409,
      "REFUND_RECONCILIATION",
      "A previous refund is still being reconciled. Please try again later.",
    );
    for (const { p, refund } of plan) {
      const id = `${b.id}_${reason}_${p.id}`;
      tx.set("refunds", id, {
        id,
        bookingId: b.id,
        paymentId: p.id,
        amount: refund,
        reason,
        status: "queued",
        createdAt: now,
      });
      tx.set("payments", p.id, {
        ...p,
        reservedRefund: p.reservedRefund + refund,
      });
    }
  }
  async cancel(user, id) {
    const now = this.clock();
    await this.store.transaction(async (tx) => {
      const b = await tx.get("bookings", id);
      this.owned(b, user);
      if (
        ["cancelled", "refund_pending", "refunded"].includes(b.status) &&
        !b.refundPurpose
      )
        return;
      const slot = await tx.get("slots", b.slotId);
      const pending = b.pendingChange
        ? await tx.get("bookings", b.pendingChange)
        : null;
      const payments = await Promise.all(
        b.paymentIds.map((pid) => tx.get("payments", pid)),
      );
      assert(
        b.status === "confirmed",
        409,
        "INVALID_STATE",
        "Only confirmed bookings can be cancelled.",
      );
      this.cutoff(b, user.role === "admin");
      assert(
        !pending ||
          (activeHold(pending) && pending.expiresAt <= now) ||
          ["expired", "cancelled", "refunded"].includes(pending.status),
        409,
        "CHANGE_PENDING",
        "Finish the pending reschedule before cancelling.",
      );
      const amount =
        user.role === "admin"
          ? b.price
          : Math.floor((b.price * b.refundPercent) / 100);
      if (amount)
        this.queueRefunds(tx, b, payments, amount, "cancellation", now);
      tx.set("bookings", id, {
        ...b,
        status: amount ? "refund_pending" : "cancelled",
        refundAmount: amount,
        pendingChange: null,
        cancelReason:
          user.role === "admin" ? "admin_cancelled" : "customer_cancelled",
        updatedAt: now,
        audit: audit(b, "cancelled", now, user.id),
      });
      if (slot.bookingId === id)
        tx.set("slots", slot.id, { ...slot, bookingId: null });
    });
    await this.processRefunds(id);
    return this.booking(user, id);
  }
  async processRefunds(bookingId) {
    const jobs = await this.store.list("refunds", [
      ["bookingId", "==", bookingId],
    ]);
    for (const job of jobs) {
      if (["processed", "failed"].includes(job.status)) continue;
      const claimed = await this.store.transaction(async (tx) => {
        const r = await tx.get("refunds", job.id);
        if (r.status === "queued") {
          tx.set("refunds", r.id, {
            ...r,
            status: "requesting",
            requestedAt: this.clock(),
          });
          return true;
        }
        return false;
      });
      try {
        // Never repeat an uncertain refund POST. Recover it by its stable receipt.
        const receipt = refundReceipt(job.id);
        let refund;
        if (claimed)
          refund = await this.gateway.refund(
            job.paymentId,
            job.amount,
            receipt,
          );
        else {
          const list = await this.gateway.refunds(job.paymentId);
          refund = list.items?.find(
            (r) => r.receipt === receipt || r.notes?.operation === receipt,
          );
        }
        if (refund) await this.applyRefund(job.id, refund);
        else
          await this.store.transaction(async (tx) => {
            const r = await tx.get("refunds", job.id);
            if (!["processed", "failed"].includes(r.status))
              tx.set("refunds", r.id, { ...r, status: "needs_review" });
          });
      } catch {
        await this.store.transaction(async (tx) => {
          const r = await tx.get("refunds", job.id);
          if (!["processed", "failed"].includes(r.status))
            tx.set("refunds", r.id, { ...r, status: "needs_review" });
        });
      }
    }
  }
  async applyRefund(id, refund) {
    await this.store.transaction(async (tx) => {
      const r = await tx.get("refunds", id);
      if (!r || r.status === "processed") return;
      assert(
        refund.payment_id === r.paymentId && refund.amount === r.amount,
        400,
        "REFUND_MISMATCH",
        "Refund does not match the request.",
      );
      const p = await tx.get("payments", r.paymentId);
      const b = await tx.get("bookings", r.bookingId);
      const all = await tx.list("refunds", [["bookingId", "==", b.id]]);
      const old = b.replaces ? await tx.get("bookings", b.replaces) : null;
      const s = await tx.get("slots", b.slotId);
      const oldSlot = old ? await tx.get("slots", old.slotId) : null;
      const status =
        refund.status === "processed"
          ? "processed"
          : refund.status === "failed"
            ? "failed"
            : "pending";
      tx.set("refunds", id, {
        ...r,
        gatewayId: refund.id,
        status,
        updatedAt: this.clock(),
      });
      if (status === "processed")
        tx.set("payments", p.id, {
          ...p,
          refunded: p.refunded + r.amount,
          reservedRefund: Math.max(0, p.reservedRefund - r.amount),
        });
      if (status === "failed" && r.status !== "failed")
        tx.set("payments", p.id, {
          ...p,
          reservedRefund: Math.max(0, p.reservedRefund - r.amount),
        });
      const complete = all
        .filter((x) => x.reason === r.reason)
        .every((x) =>
          x.id === id ? status === "processed" : x.status === "processed",
        );
      if (
        complete &&
        b.refundPurpose === "reschedule" &&
        old?.status === "confirmed" &&
        old.pendingChange === b.id
      ) {
        tx.set("bookings", b.id, {
          ...b,
          status: "confirmed",
          refundPurpose: null,
          updatedAt: this.clock(),
          audit: audit(b, "rescheduled", this.clock(), "system"),
        });
        tx.set("bookings", old.id, {
          ...old,
          status: "cancelled",
          cancelReason: "rescheduled",
          pendingChange: null,
          replacedBy: b.id,
          audit: audit(old, "rescheduled", this.clock(), "system"),
        });
        tx.set("slots", oldSlot.id, { ...oldSlot, bookingId: null });
      } else if (complete && b.status === "refund_pending")
        tx.set("bookings", b.id, {
          ...b,
          status: "refunded",
          updatedAt: this.clock(),
          audit: audit(b, "refunded", this.clock(), "system"),
        });
      // A definite failed reschedule refund keeps the old game and releases the replacement.
      if (
        status === "failed" &&
        b.refundPurpose === "reschedule" &&
        all.length === 1
      ) {
        tx.set("bookings", b.id, {
          ...b,
          status: "cancelled",
          cancelReason: "refund_failed",
          refundPurpose: null,
        });
        if (old?.pendingChange === b.id)
          tx.set("bookings", old.id, { ...old, pendingChange: null });
        if (s?.bookingId === b.id)
          tx.set("slots", s.id, { ...s, bookingId: null });
      }
    });
  }
  async webhook(raw, signature, eventId) {
    assert(
      validSignature(raw, signature, this.config.razorpay.webhookSecret),
      400,
      "INVALID_SIGNATURE",
      "Invalid webhook signature.",
    );
    assert(
      typeof eventId === "string" && /^[\w-]{1,200}$/.test(eventId),
      400,
      "INVALID_EVENT",
      "Missing webhook event ID.",
    );
    if (await this.store.get("webhookEvents", eventId))
      return { duplicate: true };
    let e;
    try {
      e = JSON.parse(raw);
    } catch {
      assert(false, 400, "INVALID_EVENT", "Invalid webhook body.");
    }
    if (
      ["payment.captured", "payment.failed", "order.paid"].includes(e.event)
    ) {
      const entity = e.payload?.payment?.entity;
      if (entity) {
        const live = await this.gateway.payment(entity.id);
        await this.settlePayment(live);
      }
    }
    if (["refund.processed", "refund.failed"].includes(e.event)) {
      const entity = e.payload?.refund?.entity;
      if (entity) {
        const jobs = await this.store.list("refunds", [
          ["paymentId", "==", entity.payment_id],
        ]);
        const job = jobs.find(
          (r) =>
            r.gatewayId === entity.id || entity.receipt === refundReceipt(r.id),
        );
        if (job) {
          const refunds = await this.gateway.refunds(entity.payment_id);
          const live = refunds.items?.find((r) => r.id === entity.id);
          if (live) await this.applyRefund(job.id, live);
          else
            assert(
              false,
              503,
              "REFUND_PENDING",
              "Refund reconciliation pending.",
            );
        }
      }
    }
    await this.store.set("webhookEvents", eventId, {
      id: eventId,
      type: e.event,
      processedAt: this.clock(),
    });
    return { received: true };
  }
  async reconcile() {
    const bookings = await this.store.list("bookings");
    let checked = 0,
      errors = 0;
    for (const b of bookings) {
      // Expiry must still run when the payment provider is unavailable.
      try {
        if (activeHold(b) && b.expiresAt <= this.clock())
          await this.expire(b.id);
      } catch {
        errors++;
      }
      try {
        if (
          b.orderId &&
          ["held", "payment_pending", "expired"].includes(b.status)
        ) {
          const payments = await this.gateway.payments(b.orderId);
          for (const p of payments.items || []) await this.settlePayment(p);
          checked++;
        }
      } catch {
        errors++;
      }
    }
    // Refund jobs can belong to confirmed bookings (for example, an extra capture).
    const refunds = await this.store.list("refunds");
    const pending = new Set(
      refunds
        .filter((r) => !["processed", "failed"].includes(r.status))
        .map((r) => r.bookingId),
    );
    for (const id of pending) {
      try {
        await this.processRefunds(id);
      } catch {
        errors++;
      }
    }
    return { checked, errors };
  }
  async updateProfile(user, input) {
    const name = clean(input.name, 80);
    assert(name, 400, "INVALID_NAME", "Enter your name.");
    let location = null;
    if (input.preferredLocation) {
      const v = input.preferredLocation;
      assert(
        DISTRICTS.includes(v.district),
        400,
        "INVALID_LOCATION",
        "Choose a Kerala district.",
      );
      location = { district: v.district, town: clean(v.town, 100) };
      if (v.coordinates) {
        assert(
          withinKerala(v.coordinates.lat, v.coordinates.lng),
          400,
          "INVALID_LOCATION",
          "Choose a location within Kerala.",
        );
        location.coordinates = {
          lat: v.coordinates.lat,
          lng: v.coordinates.lng,
        };
      }
    }
    return this.store.transaction(async (tx) => {
      const current = await tx.get("users", user.id);
      const profile = {
        ...current,
        name,
        email: current.email || clean(input.email, 160),
        preferredLocation: location,
        updatedAt: this.clock(),
      };
      assert(
        !profile.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email),
        400,
        "INVALID_EMAIL",
        "Enter a valid email.",
      );
      tx.set("users", user.id, profile);
      return profile;
    });
  }
  admin(user) {
    assert(
      user.role === "admin",
      403,
      "ADMIN_REQUIRED",
      "Administrator access is required.",
    );
  }
  async saveTurf(user, id, input) {
    this.admin(user);
    const old = id ? await this.store.get("turfs", id) : null;
    assert(!id || old, 404, "NOT_FOUND", "Turf not found.");
    const coordinates = { lat: Number(input.lat), lng: Number(input.lng) };
    const formats = (input.formats || []).map(Number);
    assert(
      clean(input.name) &&
        clean(input.address) &&
        clean(input.town) &&
        DISTRICTS.includes(input.district) &&
        withinKerala(coordinates.lat, coordinates.lng),
      400,
      "INVALID_TURF",
      "Enter a name, address, Kerala district, town, and valid Kerala coordinates.",
    );
    assert(
      formats.length && formats.every((n) => [5, 7, 9, 11].includes(n)),
      400,
      "INVALID_FORMAT",
      "Select at least one team size.",
    );
    const price = Math.round(Number(input.price) * 100),
      duration = Number(input.slotDuration),
      cutoff = Number(input.cutoffHours ?? 2),
      refund = Number(input.refundPercent ?? 100);
    assert(
      Number.isSafeInteger(price) &&
        price >= 100 &&
        price <= 10000000 &&
        [30, 60, 90, 120].includes(duration) &&
        Number.isFinite(cutoff) &&
        cutoff >= 0 &&
        cutoff <= 168 &&
        Number.isFinite(refund) &&
        refund >= 0 &&
        refund <= 100,
      400,
      "INVALID_PRICING",
      "Check pricing, duration and cancellation settings.",
    );
    assert(
      ["Artificial grass", "Natural grass", "Indoor turf"].includes(
        input.surface,
      ),
      400,
      "INVALID_SURFACE",
      "Choose a turf surface.",
    );
    const t = {
      id: id || randomUUID(),
      name: clean(input.name, 100),
      description: clean(input.description, 2500),
      address: clean(input.address, 300),
      town: clean(input.town, 100),
      district: input.district,
      coordinates,
      formats: [...new Set(formats)],
      surface: input.surface,
      amenities: (Array.isArray(input.amenities) ? input.amenities : [])
        .slice(0, 20)
        .map((a) => clean(a, 60)),
      price,
      slotDuration: duration,
      cutoffHours: cutoff,
      refundPercent: refund,
      active: input.active !== false,
      published:
        input.published === undefined
          ? (old?.published ?? true)
          : input.published === true,
      coverImageId: old?.coverImageId || null,
      createdAt: old?.createdAt || this.clock(),
      updatedAt: this.clock(),
    };
    return this.store.transaction(async (tx) => {
      const current = await tx.get("turfs", t.id);
      assert(!id || current, 404, "NOT_FOUND", "Turf not found.");
      const saved = { ...t, coverImageId: current?.coverImageId || null };
      tx.set("turfs", t.id, saved);
      return saved;
    });
  }
  async publishSlots(user, turfId, input) {
    this.admin(user);
    assert(
      dateValid(input.from) &&
        dateValid(input.to) &&
        input.from <= input.to &&
        Date.parse(input.to) - Date.parse(input.from) <= 30 * 86400000,
      400,
      "INVALID_RANGE",
      "Choose a date range of at most 31 days.",
    );
    assert(
      /^([01]\d|2[0-3]):[0-5]\d$/.test(input.open) &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(input.close) &&
        input.open < input.close,
      400,
      "INVALID_HOURS",
      "Enter opening and closing times on the same day.",
    );
    let created = 0,
      skipped = 0;
    for (
      let day = Date.parse(input.from);
      day <= Date.parse(input.to);
      day += 86400000
    ) {
      const date = new Date(day).toISOString().slice(0, 10);
      const counts = await this.store.transaction(async (tx) => {
        const turf = await tx.get("turfs", turfId);
        assert(turf, 404, "NOT_FOUND", "Turf not found.");
        const block = await tx.get("blockedDates", `${turfId}_${date}`);
        const existing = await tx.list("slots", [["turfId", "==", turfId]]);
        const writes = [];
        let skipped = 0;
        for (
          let start = slotTime(date, input.open);
          start + turf.slotDuration * 60000 <= slotTime(date, input.close);
          start += turf.slotDuration * 60000
        ) {
          const end = start + turf.slotDuration * 60000;
          if (
            block?.blocked ||
            start <= this.clock() ||
            existing.some((s) => s.start < end && s.end > start)
          ) {
            skipped++;
            continue;
          }
          const id = `${turfId}_${start}`;
          writes.push({
            id,
            turfId,
            date,
            start,
            end,
            price: turf.price,
            published: true,
            blocked: false,
            bookingId: null,
            holdId: null,
            holdUntil: 0,
          });
        }
        for (const slot of writes) tx.set("slots", slot.id, slot);
        return { created: writes.length, skipped };
      });
      // Firestore may retry the callback; count only the committed attempt.
      created += counts.created;
      skipped += counts.skipped;
    }
    return { created, skipped };
  }
  async blockSlots(user, turfId, input) {
    this.admin(user);
    assert(
      input.slotId || dateValid(input.date),
      400,
      "INVALID_DATE",
      "Choose a slot or date.",
    );
    return this.store.transaction(async (tx) => {
      const turf = await tx.get("turfs", turfId);
      assert(turf, 404, "NOT_FOUND", "Turf not found.");
      const all = await tx.list("slots", [["turfId", "==", turfId]]);
      const slots = all.filter((s) =>
        input.slotId ? s.id === input.slotId : s.date === input.date,
      );
      const day = input.slotId ? slots[0]?.date : input.date;
      const block = day
        ? await tx.get("blockedDates", `${turfId}_${day}`)
        : null;
      const blocked = input.blocked !== false;
      assert(
        !input.slotId || slots.length,
        404,
        "NOT_FOUND",
        "Slot not found.",
      );
      assert(
        !input.slotId || blocked || !block?.blocked,
        409,
        "DATE_BLOCKED",
        "Unblock the date before opening individual slots.",
      );
      assert(
        !blocked ||
          slots.every(
            (s) => !s.bookingId && (!s.holdId || s.holdUntil <= this.clock()),
          ),
        409,
        "ACTIVE_BOOKINGS",
        "Cancel active bookings or wait for holds to expire before blocking these slots.",
      );
      if (!input.slotId) {
        const id = `${turfId}_${day}`;
        tx.set("blockedDates", id, {
          id,
          turfId,
          date: day,
          blocked,
          updatedAt: this.clock(),
          updatedBy: user.id,
        });
      }
      for (const slot of slots) tx.set("slots", slot.id, { ...slot, blocked });
      return {
        updated: slots.length,
        dateBlocked: input.slotId ? Boolean(block?.blocked) : blocked,
      };
    });
  }
  async dashboard(user) {
    this.admin(user);
    const [turfs, bookings, customers, payments, refunds, slots, blockedDates] =
      await Promise.all(
        [
          "turfs",
          "bookings",
          "users",
          "payments",
          "refunds",
          "slots",
          "blockedDates",
        ].map((c) => this.store.list(c)),
      );
    const today = indiaDate(this.clock());
    const todays = slots.filter(
      (s) => s.date === today && s.published && !s.blocked,
    );
    return {
      turfs,
      bookings,
      customers,
      payments,
      refunds,
      slots,
      blockedDates: blockedDates.filter((d) => d.blocked),
      summary: {
        today: bookings.filter(
          (b) => b.date === today && b.status === "confirmed",
        ).length,
        upcoming: bookings.filter(
          (b) => b.start > this.clock() && b.status === "confirmed",
        ).length,
        customers: customers.length,
        occupancy: todays.length
          ? Math.round(
              (todays.filter((s) => s.bookingId).length / todays.length) * 100,
            )
          : 0,
      },
    };
  }
}
