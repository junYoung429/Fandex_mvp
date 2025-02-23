// firebase-config.js
import { initializeApp } from "firebase/app";
import { 
  initializeFirestore, 
  persistentLocalCache 
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

// 단일 탭 지원을 위한 오프라인 캐시 활성화 (여러 탭 지원 옵션은 사용하지 않음)
const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});

const storage = getStorage(app);

export { db, storage };
