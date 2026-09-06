const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const ADMIN_EMAIL = "atjarvela@gmail.com";

/**
 * Kun uusi ajokerta tallentuu, tarkistetaan ja päivitetään oppilaan tilastot automaattisesti
 */
exports.onDriveCreated = onDocumentCreated("drives/{driveId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const drive = snapshot.data();
  const studentId = drive.studentId;

  if (!studentId) return;

  try {
    const studentRef = db.collection("users").doc(studentId);
    await db.runTransaction(async (transaction) => {
      const studentDoc = await transaction.get(studentRef);
      if (!studentDoc.exists) return;

      const currentStats = studentDoc.data().stats || {
        totalDurationSeconds: 0,
        totalDistanceKm: 0,
        driveCount: 0,
      };

      transaction.update(studentRef, {
        stats: {
          totalDurationSeconds: currentStats.totalDurationSeconds + (drive.durationSeconds || 0),
          totalDistanceKm: Number((currentStats.totalDistanceKm + (drive.distanceKm || 0)).toFixed(1)),
          driveCount: currentStats.driveCount + 1,
          lastDriveAt: drive.endTime || drive.startTime || new Date().toISOString(),
        },
      });
    });
  } catch (error) {
    console.error("Virhe tilastojen päivityksessä:", error);
  }
});

/**
 * Pääkäyttäjän API-funktio roolien asettamiseen (opettaja/admin/oppilas)
 */
exports.setUserRole = onCall(async (request) => {
  // Tarkistetaan kutsujan oikeudet
  const callerEmail = request.auth?.token?.email;
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Vaatii kirjautumisen.");
  }

  // Vain atjarvela@gmail.com tai olemassa oleva admin voi muuttaa rooleja
  const callerDoc = await db.collection("users").doc(callerUid).get();
  const isAdmin = callerEmail === ADMIN_EMAIL || callerDoc.data()?.role === "admin";

  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Vain pääkäyttäjä voi muuttaa rooleja.");
  }

  const { targetUid, newRole } = request.data;
  if (!targetUid || !["admin", "student"].includes(newRole)) {
    throw new HttpsError("invalid-argument", "Virheelliset parametrit.");
  }

  await db.collection("users").doc(targetUid).update({
    role: newRole,
    updatedAt: new Date().toISOString(),
  });

  return { success: true, targetUid, newRole };
});
