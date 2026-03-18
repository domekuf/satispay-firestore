import admin from 'firebase-admin';

function buildCredential(): admin.credential.Credential {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      const parsed = JSON.parse(json);
      return admin.credential.cert(parsed as admin.ServiceAccount);
    } catch (error) {
      throw new Error(`Error parsing FIREBASE_SERVICE_ACCOUNT_JSON: ${error}`);
    }
  }
  return admin.credential.applicationDefault();
}

export function getAdminApp(): admin.app.App {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: buildCredential(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
  return admin.app();
}

export function getAdminAuth(): admin.auth.Auth {
  return getAdminApp().auth();
}

export function getAdminDb() {
  return getAdminApp().firestore();
}
