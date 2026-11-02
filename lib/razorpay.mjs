import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, assert } from "./common.mjs";
export function validSignature(text, signature, secret) {
  if (
    !secret ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  return timingSafeEqual(
    createHmac("sha256", secret).update(text).digest(),
    Buffer.from(signature, "hex"),
  );
}
export class RazorpayGateway {
  constructor(config) {
    this.config = config;
  }
  async request(path, method = "GET", body) {
    assert(
      this.config.keyId && this.config.secret,
      503,
      "PAYMENTS_UNAVAILABLE",
      "Payments are not connected yet.",
    );
    let r;
    try {
      r = await fetch(`https://api.razorpay.com/v1${path}`, {
        method,
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${this.config.keyId}:${this.config.secret}`).toString(
              "base64",
            ),
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AppError(
        503,
        "PAYMENT_GATEWAY_UNAVAILABLE",
        "Payment provider did not respond. Your payment will be reconciled automatically.",
      );
    }
    const data = await r.json();
    if (!r.ok)
      throw new AppError(
        502,
        "PAYMENT_GATEWAY_ERROR",
        "The payment provider could not complete this request. Please try again.",
      );
    return data;
  }
  createOrder(amount, receipt) {
    return this.request("/orders", "POST", {
      amount,
      currency: "INR",
      receipt,
      notes: { platform: "TurfKerala" },
    });
  }
  payment(id) {
    assert(
      /^pay_[a-zA-Z0-9]+$/.test(id),
      400,
      "INVALID_PAYMENT",
      "Invalid payment reference.",
    );
    return this.request("/payments/" + id);
  }
  payments(order) {
    return this.request(`/orders/${order}/payments`);
  }
  refunds(payment) {
    return this.request(`/payments/${payment}/refunds?count=100`);
  }
  refund(payment, amount, receipt) {
    return this.request(`/payments/${payment}/refund`, "POST", {
      amount,
      speed: "normal",
      receipt,
      notes: { operation: receipt },
    });
  }
}
