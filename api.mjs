import http from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { authenticate } from "./lib/firebase.mjs";
import { Marketplace } from "./lib/marketplace.mjs";
import { RazorpayGateway } from "./lib/razorpay.mjs";
import {
  assert,
  AppError,
  DISTRICTS,
  clean,
  withinKerala,
  indiaDate,
} from "./lib/common.mjs";
async function readBody(req, max = 7 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    assert(size <= max, 413, "TOO_LARGE", "The upload is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
const safeId = (id) => {
  assert(
    /^[\w-]{1,200}$/.test(id || ""),
    400,
    "INVALID_ID",
    "Invalid reference.",
  );
  return id;
};
export function createServer(
  config,
  services,
  gateway = new RazorpayGateway(config.razorpay),
) {
  const market = services.store
      ? new Marketplace(services.store, gateway, config)
      : null,
    limits = new Map();
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, config.origin),
      path = url.pathname,
      method = req.method;
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(self), camera=(), microphone=()",
    );
    try {
      if (!path.startsWith("/api/")) {
        if (!["GET", "HEAD"].includes(method))
          return send(405, {
            error: {
              code: "METHOD_NOT_ALLOWED",
              message: "Method not allowed.",
            },
          });
        const media = /^\/media\/[a-z0-9-]+\.jpg$/.test(path);
        const file = media
          ? path.slice(1)
          : { "/app.js": "app.js", "/styles.css": "styles.css" }[path] ||
            "index.html";
        let body;
        try {
          body = await readFile(`dist/${file}`);
        } catch (error) {
          if (!media) throw error;
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        res.setHeader(
          "Content-Type",
          media
            ? "image/jpeg"
            : file.endsWith(".js")
              ? "text/javascript; charset=utf-8"
              : file.endsWith(".css")
                ? "text/css; charset=utf-8"
                : "text/html; charset=utf-8",
        );
        res.setHeader(
          "Cache-Control",
          media ? "public, max-age=604800" : "no-cache",
        );
        res.end(method === "HEAD" ? undefined : body);
        return;
      }
      const ip = req.socket.remoteAddress || "local",
        now = Date.now();
      let rate = limits.get(ip);
      if (!rate || rate.until < now) {
        rate = { count: 0, until: now + 60000 };
        limits.set(ip, rate);
      }
      assert(
        ++rate.count <= 240,
        429,
        "RATE_LIMITED",
        "Too many requests. Please wait a minute.",
      );
      if (limits.size > 10000)
        for (const [key, value] of limits)
          if (value.until < now) limits.delete(key);
      if (!["GET", "HEAD"].includes(method) && req.headers.origin)
        assert(
          req.headers.origin === config.origin,
          403,
          "INVALID_ORIGIN",
          "This origin is not allowed.",
        );
      if (path === "/api/config" && method === "GET")
        return send(200, {
          business: config.business,
          contact: config.contact,
          legalName: config.legalName,
          refundPolicy: config.refundPolicy,
          launchMode: config.launchMode,
          firebase: config.firebase,
          firebaseReady: config.firebaseReady,
          paymentsReady: config.paymentsReady,
          testPayments: config.testPayments,
          phoneEnabled: config.phoneEnabled,
          mapsReady: Boolean(config.mapsKey),
          districts: DISTRICTS,
          today: indiaDate(),
        });
      if (path === "/api/health" && method === "GET")
        return send(200, { status: "ok", configured: Boolean(market) });
      if (path === "/api/turfs" && method === "GET")
        return send(
          200,
          market
            ? await market.search(Object.fromEntries(url.searchParams))
            : { turfs: [], date: indiaDate(), configured: false },
        );
      if (path === "/api/places" && method === "GET") {
        assert(
          config.mapsKey,
          503,
          "PLACES_UNAVAILABLE",
          "Town search is not connected yet. Choose a district instead.",
        );
        const query = clean(url.searchParams.get("q"), 120);
        assert(
          query.length >= 2,
          400,
          "INVALID_QUERY",
          "Enter at least two characters.",
        );
        const response = await fetch(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": config.mapsKey,
              "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,places.location",
            },
            body: JSON.stringify({
              textQuery: `${query}, Kerala, India`,
              regionCode: "IN",
              languageCode: "en",
              pageSize: 6,
              locationRestriction: {
                rectangle: {
                  low: { latitude: 8, longitude: 74.8 },
                  high: { latitude: 12.85, longitude: 77.5 },
                },
              },
            }),
            signal: AbortSignal.timeout(10000),
          },
        );
        assert(
          response.ok,
          503,
          "PLACES_UNAVAILABLE",
          "Location search is unavailable. Choose a district instead.",
        );
        const data = await response.json();
        return send(200, {
          places: (data.places || [])
            .filter(
              (p) =>
                withinKerala(p.location.latitude, p.location.longitude) &&
                /Kerala/i.test(p.formattedAddress),
            )
            .map((p) => ({
              id: p.id,
              name: p.displayName.text,
              address: p.formattedAddress,
              coordinates: {
                lat: p.location.latitude,
                lng: p.location.longitude,
              },
            })),
        });
      }
      assert(
        market,
        503,
        "SETUP_REQUIRED",
        "The marketplace is awaiting its Firebase connection.",
      );
      const parts = path.split("/").filter(Boolean);
      if (parts[1] === "turfs" && method === "GET") {
        const id = safeId(parts[2]);
        return send(
          200,
          parts[3] === "availability"
            ? await market.availability(id, url.searchParams.get("date"))
            : await market.detail(id),
        );
      }
      if (parts[1] === "images" && method === "GET") {
        const image = await services.store.get("images", safeId(parts[2]));
        assert(image && !image.deleted, 404, "NOT_FOUND", "Image not found.");
        const turf = await services.store.get("turfs", image.turfId);
        if (!turf?.published || !turf.active) {
          const user = await authenticate(req, services, config);
          market.admin(user);
        }
        const [bytes] = await services.bucket.file(image.path).download();
        res.writeHead(200, {
          "Content-Type": image.type,
          "Cache-Control": "private, no-store",
        });
        return res.end(bytes);
      }
      if (path === "/api/webhooks/razorpay" && method === "POST") {
        const raw = await readBody(req, 1024 * 1024);
        return send(
          200,
          await market.webhook(
            raw,
            req.headers["x-razorpay-signature"],
            req.headers["x-razorpay-event-id"],
          ),
        );
      }
      if (path === "/api/jobs/reconcile" && method === "POST") {
        const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
        assert(
          config.jobsSecret &&
            Buffer.byteLength(token) === Buffer.byteLength(config.jobsSecret) &&
            timingSafeEqual(Buffer.from(token), Buffer.from(config.jobsSecret)),
          401,
          "UNAUTHORIZED",
          "Invalid scheduler token.",
        );
        return send(200, await market.reconcile());
      }
      const user = await authenticate(req, services, config);
      if (parts[1] === "admin") market.admin(user);
      let body = {};
      if (["POST", "PATCH", "PUT"].includes(method)) {
        const raw = await readBody(req);
        try {
          body = JSON.parse(raw.toString() || "{}");
        } catch {
          throw new AppError(
            400,
            "INVALID_JSON",
            "Request must contain valid JSON.",
          );
        }
      }
      if (path === "/api/me" && method === "GET") return send(200, { user });
      if (path === "/api/profile" && method === "PATCH")
        return send(200, { user: await market.updateProfile(user, body) });
      if (path === "/api/bookings" && method === "GET")
        return send(200, {
          bookings: await market.listBookings({ ...user, role: "user" }),
        });
      if (path === "/api/holds" && method === "POST") {
        safeId(body.slotId);
        if (body.replaces) safeId(body.replaces);
        return send(201, {
          booking: await market.hold(user, body.slotId, body.replaces || null),
        });
      }
      if (parts[1] === "bookings" && parts[2]) {
        const id = safeId(parts[2]);
        if (method === "GET" && !parts[3])
          return send(200, {
            booking: await market.booking(user, id),
            refunds: await services.store.list("refunds", [
              ["bookingId", "==", id],
            ]),
          });
        if (method === "POST") {
          if (parts[3] === "order")
            return send(200, await market.order(user, id));
          if (parts[3] === "verify")
            return send(200, {
              booking: await market.verifyPayment(user, id, body),
            });
          if (parts[3] === "cancel")
            return send(200, { booking: await market.cancel(user, id) });
          if (parts[3] === "release")
            return send(200, { booking: await market.release(user, id) });
          if (parts[3] === "reconcile") {
            const b = await market.booking(user, id);
            if (b.orderId) {
              const payments = await gateway.payments(b.orderId);
              for (const p of payments.items || [])
                await market.settlePayment(p);
            }
            return send(200, { booking: await market.booking(user, id) });
          }
        }
      }
      if (path === "/api/admin/dashboard" && method === "GET")
        return send(200, await market.dashboard(user));
      if (path === "/api/admin/reconcile" && method === "POST")
        return send(200, await market.reconcile());
      if (path === "/api/admin/turfs" && method === "POST")
        return send(201, { turf: await market.saveTurf(user, null, body) });
      if (parts[1] === "admin" && parts[2] === "turfs" && parts[3]) {
        const id = safeId(parts[3]);
        if (method === "PATCH" && !parts[4])
          return send(200, { turf: await market.saveTurf(user, id, body) });
        if (method === "DELETE" && !parts[4]) {
          await services.store.transaction(async (tx) => {
            const turf = await tx.get("turfs", id);
            assert(turf, 404, "NOT_FOUND", "Turf not found.");
            tx.set("turfs", id, {
              ...turf,
              active: false,
              published: false,
              updatedAt: Date.now(),
            });
          });
          return send(200, { deactivated: true });
        }
        if (method === "POST" && parts[4] === "slots")
          return send(200, await market.publishSlots(user, id, body));
        if (method === "POST" && parts[4] === "block")
          return send(200, await market.blockSlots(user, id, body));
        if (method === "PATCH" && parts[4] === "cover") {
          const imageId = safeId(body.imageId);
          await services.store.transaction(async (tx) => {
            const turf = await tx.get("turfs", id);
            const image = await tx.get("images", imageId);
            assert(turf, 404, "NOT_FOUND", "Turf not found.");
            assert(
              image && !image.deleted && image.turfId === id,
              400,
              "INVALID_IMAGE",
              "Choose a photo belonging to this turf.",
            );
            tx.set("turfs", id, {
              ...turf,
              coverImageId: imageId,
              updatedAt: Date.now(),
            });
          });
          return send(200, { coverImageId: imageId });
        }
        if (method === "GET" && parts[4] === "photos")
          return send(200, {
            coverImageId:
              (await services.store.get("turfs", id))?.coverImageId || null,
            photos: (
              await services.store.list("images", [["turfId", "==", id]])
            ).filter((p) => !p.deleted),
          });
        if (method === "POST" && parts[4] === "photos") {
          assert(
            services.bucket,
            503,
            "STORAGE_UNAVAILABLE",
            "Photo storage is not configured.",
          );
          const turf = await services.store.get("turfs", id);
          assert(turf, 404, "NOT_FOUND", "Turf not found.");
          const bytes = Buffer.from(String(body.data || ""), "base64");
          assert(
            bytes.length > 0 && bytes.length <= 5 * 1024 * 1024,
            400,
            "INVALID_IMAGE",
            "Choose an image smaller than 5 MB.",
          );
          const type = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
            ? "image/jpeg"
            : bytes
                  .subarray(0, 8)
                  .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
              ? "image/png"
              : bytes.toString("ascii", 0, 4) === "RIFF" &&
                  bytes.toString("ascii", 8, 12) === "WEBP"
                ? "image/webp"
                : null;
          assert(
            type,
            400,
            "INVALID_IMAGE",
            "Upload a JPG, PNG or WebP photo.",
          );
          const imageId = randomUUID(),
            objectPath = `turfs/${id}/${imageId}`;
          await services.bucket.file(objectPath).save(bytes, {
            resumable: false,
            contentType: type,
            metadata: { cacheControl: "private, no-store" },
          });
          const image = {
            id: imageId,
            turfId: id,
            path: objectPath,
            type,
            alt: clean(body.alt || turf.name, 160),
            createdAt: Date.now(),
            deleted: false,
          };
          try {
            await services.store.transaction(async (tx) => {
              const current = await tx.get("turfs", id);
              assert(current, 404, "NOT_FOUND", "Turf not found.");
              tx.set("images", imageId, image);
              if (!current.coverImageId)
                tx.set("turfs", id, { ...current, coverImageId: imageId });
            });
          } catch (error) {
            await services.bucket
              .file(objectPath)
              .delete({ ignoreNotFound: true })
              .catch(() => {});
            throw error;
          }
          return send(201, { image });
        }
      }
      if (
        parts[1] === "admin" &&
        parts[2] === "images" &&
        parts[3] &&
        method === "DELETE"
      ) {
        const id = safeId(parts[3]);
        await services.store.transaction(async (tx) => {
          const image = await tx.get("images", id);
          assert(image, 404, "NOT_FOUND", "Photo not found.");
          const turf = await tx.get("turfs", image.turfId);
          const photos = await tx.list("images", [
            ["turfId", "==", image.turfId],
          ]);
          tx.set("images", id, { ...image, deleted: true });
          if (turf.coverImageId === id)
            tx.set("turfs", turf.id, {
              ...turf,
              coverImageId:
                photos.find((p) => p.id !== id && !p.deleted)?.id || null,
            });
        });
        return send(200, { removed: true });
      }
      throw new AppError(404, "NOT_FOUND", "Endpoint not found.");
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500)
        console.error(
          JSON.stringify({
            event: "request_error",
            path,
            code: error.code || "INTERNAL_ERROR",
            message: error.message,
          }),
        );
      send(status, {
        error: {
          code: error.code || "INTERNAL_ERROR",
          message:
            status === 500
              ? "Unable to complete this request. Please try again."
              : error.message,
          ...error.details,
        },
      });
    }
  });
}
