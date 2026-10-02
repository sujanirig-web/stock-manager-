import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDpZJ0uwXBbT9M6AqzRZIFa3Y4GycmyeiE",
  authDomain: "stock-manager-2c60f.firebaseapp.com",
  projectId: "stock-manager-2c60f",
  storageBucket: "stock-manager-2c60f.firebasestorage.app",
  messagingSenderId: "351828175155",
  appId: "1:351828175155:web:538514a6fd735ed19d3646",
  measurementId: "G-29MHF9TPCV"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);