export function readConfig(env = process.env) {
  const list = (value) =>
    (value || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const c = {
    port: Number(env.PORT || 3001),
    origin: env.APP_ORIGIN || "http://localhost:3001",
    business: env.BUSINESS_NAME || "TurfKerala",
    contact: env.ADMIN_CONTACT_PHONE || "",
    legalName: env.BUSINESS_LEGAL_NAME || "",
    refundPolicy: env.REFUND_POLICY_TEXT || "",
    launchMode: env.LAUNCH_MODE || "private",
    phoneEnabled: env.ENABLE_PHONE_AUTH === "true",
    adminUids: list(env.ADMIN_UIDS),
    adminPhones: list(env.ADMIN_PHONES),
    firebase: {
      apiKey: env.FIREBASE_API_KEY || "",
      authDomain: env.FIREBASE_AUTH_DOMAIN || "",
      projectId: env.FIREBASE_PROJECT_ID || "",
      appId: env.FIREBASE_APP_ID || "",
      storageBucket: env.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || "",
      measurementId: env.FIREBASE_MEASUREMENT_ID || "",
    },
    razorpay: {
      keyId: env.RAZORPAY_KEY_ID || "",
      secret: env.RAZORPAY_KEY_SECRET || "",
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || "",
    },
    mapsKey: env.GOOGLE_MAPS_API_KEY || "",
    jobsSecret: env.JOBS_SECRET || "",
  };
  c.firebaseReady = [
    "apiKey",
    "authDomain",
    "projectId",
    "appId",
    "storageBucket",
  ].every((key) => Boolean(c.firebase[key]));
  c.paymentsReady = Boolean(
    c.razorpay.keyId && c.razorpay.secret && c.razorpay.webhookSecret,
  );
  c.testPayments = !c.razorpay.keyId.startsWith("rzp_live_");
  if (!c.testPayments && env.ALLOW_LIVE_PAYMENTS !== "true")
    throw new Error("Live payments are disabled. Use Razorpay test keys.");
  if (
    c.launchMode === "public" &&
    (!c.firebaseReady ||
      !c.paymentsReady ||
      !c.contact ||
      !c.legalName ||
      !c.refundPolicy)
  )
    throw new Error(
      "Public launch requires Firebase, payments, business identity, contact and refund policy.",
    );
  return c;
}
