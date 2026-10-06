// =============================================================
// FIREBASE CONFIG — same project as the rest of the site.
// Your added notes, quotes and spider diagrams are saved in the
// Realtime Database under the "omam/" path so they sync between
// devices. Values come from: Firebase Console → Project settings.
// =============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyCIbHiXO3CCve5mERPeD7bOg3zwkWgIo88",
  authDomain: "worldcup-d1228.firebaseapp.com",
  projectId: "worldcup-d1228",
  storageBucket: "worldcup-d1228.firebasestorage.app",
  messagingSenderId: "549881783961",
  appId: "1:549881783961:web:6b221a71ff168fa7073a08",
  databaseURL: "https://worldcup-d1228-default-rtdb.europe-west1.firebasedatabase.app",
};

// Root path in the database for everything this site saves.
export const DB_ROOT = "omam";
