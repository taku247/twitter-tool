// Firebase configuration and initialization for Twitter Analytics Tool
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAME5BfBd-xfOpV-Mb7x2Q_XS9wG_jrwXA",
    authDomain: "meme-coin-tracker-79c24.firebaseapp.com",
    projectId: "meme-coin-tracker-79c24",
    storageBucket: "meme-coin-tracker-79c24.firebasestorage.app",
    messagingSenderId: "944579690444",
    appId: "1:944579690444:web:4f452680c38ff17caa2769",
    measurementId: "G-78KWRC4N05"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Export for global use
window.firebaseAuth = {
    db
};

console.log('🔥 Firebase initialized successfully for Twitter Analytics Tool');