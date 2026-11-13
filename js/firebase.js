// Single place that talks to the Firebase SDK (modular v10, loaded from the CDN).
import { firebaseConfig, appCheckSiteKey } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updateProfile, GoogleAuthProvider, signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, increment, deleteField,
  arrayUnion, arrayRemove, writeBatch, Timestamp, getCountFromServer, getAggregateFromServer, sum, startAfter
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

export let app = null;
export let auth = null;
export let db = null;

if (configured) {
  app = initializeApp(firebaseConfig);
  if (appCheckSiteKey) {
    try {
      const m = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js');
      m.initializeAppCheck(app, {
        provider: new m.ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true
      });
    } catch (e) {
      console.warn('App Check failed to initialise:', e);
    }
  }
  auth = getAuth(app);
  db = getFirestore(app);
}

export {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail, updateProfile, GoogleAuthProvider, signInWithPopup,
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, increment, deleteField,
  arrayUnion, arrayRemove, writeBatch, runTransaction, Timestamp, getCountFromServer, getAggregateFromServer, sum, startAfter
};
