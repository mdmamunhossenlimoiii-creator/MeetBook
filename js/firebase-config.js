// Fill in the values from: Firebase console -> Project settings -> Your apps -> Web app.
// These values are public by design (security comes from firestore.rules + App Check).
export const firebaseConfig = {
  apiKey: "AIzaSyBxFFuEAYDKX78opbJFjgbprHGORhKTg6U",
  authDomain: "mysocial-33681.firebaseapp.com",
  projectId: "mysocial-33681",
  storageBucket: "mysocial-33681.firebasestorage.app",
  messagingSenderId: "619243901911",
  appId: "1:619243901911:web:02fcc5316fcd6d5d4ab192"
};

// Optional: reCAPTCHA v3 site key for Firebase App Check. Leave "" to disable.
export const appCheckSiteKey = "";

// Optional: free Cloudinary account for uploading short videos from the browser.
// Create an *unsigned* upload preset in Cloudinary, then fill both values.
// Leave empty to allow video links only.
export const cloudinary = {
  cloudName: "",
  uploadPreset: ""
};
