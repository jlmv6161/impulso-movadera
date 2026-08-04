/* firebase-init.js — inicializa Firebase (Auth + Firestore) para el Programa Impulso.
 * La config es pública por diseño; la seguridad la imponen las reglas de Firestore.
 */
firebase.initializeApp({
  apiKey: "AIzaSyDgVTWm7BdQ6B8PFKZmeuRsCNLrq50fg6E",
  authDomain: "impulso-movadera.firebaseapp.com",
  projectId: "impulso-movadera",
  storageBucket: "impulso-movadera.firebasestorage.app",
  messagingSenderId: "624831856015",
  appId: "1:624831856015:web:278162a72352d26d37dffa"
});

const _auth = firebase.auth();
const _db = firebase.firestore();

// Respaldo local + trabajo offline: guarda en el dispositivo y sincroniza al volver la señal.
_db.enablePersistence({ synchronizeTabs: true }).catch(() => { /* varias pestañas o navegador sin soporte */ });

window.fb = { auth: _auth, db: _db };
