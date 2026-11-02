import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
let auth, verifier, confirmation;
export async function initAuth(config, onChange) {
  if (!config.firebaseReady) {
    onChange(null);
    return;
  }
  const app = initializeApp(config.firebase);
  auth = getAuth(app);
  if (config.firebase.measurementId) {
    // Analytics must not prevent sign-in in unsupported or restricted browsers.
    void isSupported()
      .then((supported) => { if (supported) getAnalytics(app); })
      .catch(() => console.warn("Firebase Analytics is unavailable in this browser."));
  }
  await setPersistence(auth, browserLocalPersistence);
  onAuthStateChanged(auth, onChange);
}
export const token = () => auth?.currentUser?.getIdToken();
export const currentUser = () => auth?.currentUser;
export async function emailAuth(mode, email, password, name) {
  const result =
    mode === "register"
      ? await createUserWithEmailAndPassword(auth, email, password)
      : await signInWithEmailAndPassword(auth, email, password);
  if (mode === "register" && name)
    await updateProfile(result.user, { displayName: name });
  return result.user;
}
export const googleAuth = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);
export async function sendOtp(phone) {
  verifier?.clear();
  verifier = new RecaptchaVerifier(auth, "recaptcha", { size: "invisible" });
  try {
    confirmation = await signInWithPhoneNumber(auth, phone, verifier);
  } catch (e) {
    verifier.clear();
    verifier = null;
    throw e;
  }
}
export const confirmOtp = (code) => confirmation.confirm(code);
export const clearCaptcha = () => {
  verifier?.clear();
  verifier = null;
};
export function authError(e) {
  return (
    {
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/email-already-in-use":
        "This email already has an account. Sign in instead.",
      "auth/weak-password": "Use a password with at least 8 characters.",
      "auth/popup-closed-by-user":
        "Google sign-in was closed. You can try again.",
      "auth/unauthorized-domain":
        "This domain must be authorized in Firebase before sign-in can work.",
      "auth/operation-not-allowed":
        "This sign-in method has not been enabled by the administrator.",
      "auth/invalid-verification-code":
        "That code is incorrect. Check the SMS and try again.",
      "auth/code-expired": "This code has expired. Request another code.",
      "auth/too-many-requests":
        "Too many attempts. Please wait before trying again.",
      "auth/invalid-phone-number":
        "Enter a valid phone number with country code, such as +91.",
      "auth/captcha-check-failed":
        "Verification expired. Please request a new code.",
      "auth/network-request-failed": "Check your connection and try again.",
    }[e.code] ||
    e.message ||
    "Unable to sign in. Please try again."
  );
}
