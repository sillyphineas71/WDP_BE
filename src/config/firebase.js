import admin from "firebase-admin";

const loadServiceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const decoded = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      "base64",
    ).toString("utf8");
    return JSON.parse(decoded);
  }

  return null;
};

export const isFirebaseConfigured = () => {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
  );
};

export const getFirebaseMessaging = () => {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase Admin is not configured");
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(loadServiceAccount()),
    });
  }

  return admin.messaging();
};
