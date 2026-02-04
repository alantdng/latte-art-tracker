/**
 * Firebase Configuration for Latte'd
 */

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCJPNl-hv8edOlPdE6IxNVvM13HNC2Xsxc",
  authDomain: "latte-art-tracker-b9fb4.firebaseapp.com",
  projectId: "latte-art-tracker-b9fb4",
  storageBucket: "latte-art-tracker-b9fb4.firebasestorage.app",
  messagingSenderId: "1018331383453",
  appId: "1:1018331383453:web:ca6676d8e445a83b31b674"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Export for use in other modules
window.firebaseAuth = auth;
window.firebaseDb = db;

console.log('Firebase initialized');
