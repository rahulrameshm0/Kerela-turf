import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { FirestoreStore } from "./store.mjs";
import { assert } from "./common.mjs";
export async function firebaseServices(config) {
  if (!config.firebaseReady) return {};
  const credential = applicationDefault();
  // Validate credentials before Firestore starts any background connections.
  try {
    await credential.getAccessToken();
  } catch {
    throw new Error(
      "Firebase Admin credentials could not be loaded or refreshed. Browser FIREBASE_* settings do not authenticate the server. Set GOOGLE_APPLICATION_CREDENTIALS in .env to an absolute path to a valid credentials JSON file outside this project, and check network access. Run npm run doctor and see README.md for setup instructions.",
    );
  }
  const app = initializeApp({
    credential,
    projectId: config.firebase.projectId,
    storageBucket: config.firebase.storageBucket,
  });
  return {
    store: new FirestoreStore(getFirestore(app)),
    bucket: getStorage(app).bucket(),
    verify: async (token) => getAuth(app).verifyIdToken(token, true),
  };
}
export async function authenticate(req, services, config) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  assert(token, 401, "AUTH_REQUIRED", "Sign in to continue.");
  assert(
    services.verify,
    503,
    "AUTH_UNAVAILABLE",
    "Account services are not connected yet.",
  );
  let identity;
  try {
    identity = await services.verify(token);
  } catch (error) {
    const invalidSession = new Set([
      "auth/argument-error",
      "auth/invalid-id-token",
      "auth/id-token-expired",
      "auth/id-token-revoked",
      "auth/user-disabled",
      "auth/user-not-found",
    ]);
    if (invalidSession.has(error.code)) {
      assert(
        false,
        401,
        "TOKEN_EXPIRED",
        "Your session is invalid or has expired. Please sign in again.",
      );
    }
    assert(
      false,
      503,
      "AUTH_UNAVAILABLE",
      "Account verification is unavailable. Please try again later or contact support.",
    );
  }
  const admin =
    config.adminUids.includes(identity.uid) ||
    (identity.phone_number &&
      config.adminPhones.includes(identity.phone_number));
  return services.store.transaction(async (tx) => {
    const old = await tx.get("users", identity.uid);
    const user = {
      id: identity.uid,
      name: old?.name || identity.name || "",
      email: identity.email || old?.email || "",
      verifiedPhone: identity.phone_number || "",
      preferredLocation: old?.preferredLocation || null,
      role: admin ? "admin" : "user",
      createdAt: old?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    tx.set("users", user.id, user);
    return user;
  });
}
