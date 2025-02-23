import { useEffect, useState } from "react";
import { db } from "./firebase-config"; // 🔹 db import 추가!
import { doc, setDoc, getDoc, getDocs, collection } from "firebase/firestore";
import { v4 as uuidv4 } from "uuid"; // UUID 생성 라이브러리
import './App.css';

import { adjectives } from "../utils/nameAdjectives"; // 닉네임 랜덤 형용사 
import CommentInput from '../comments/commentInput';
import CommentScroll from '../comments/commentScroll';
import Vote from '../votes/vote';
import { initGA, logPageView } from "../utils/analytics";

function App() {

  const [userUUID, setUserUUID] = useState(null); // ✅ userUUID를 상태로 관리. CommentInput에 props로 넘겨주기 위해 전역 관리
  const [refresh, setRefresh] = useState(false); // 🔹 댓글이 추가될 때마다 재렌더링 트리거
  const [currentTargetId, setCurrentTargetId] = useState(null); // 현재 선택된 투표 대상 ID

  useEffect(() => {

      initGA();
      logPageView();

      const initializeUser = async () => {
      const SERVICE_NAME = "Fandex"; // 서비스 고유 이름
      const USER_KEY = `${SERVICE_NAME}_userUUID`; // "Fandex_userUUID"
      
      let storedUUID = localStorage.getItem(USER_KEY); // 우리 서비스 전용 UUID 가져오기

      // 랜덤 이름 생성 로직
      function generateRandomUserName() {
        const randomIndex = Math.floor(Math.random() * adjectives.length);
        return `${adjectives[randomIndex]} 유령`;
      }
      
      if (!storedUUID) {
        storedUUID = uuidv4(); // 새 UUID 생성
        localStorage.setItem(USER_KEY, storedUUID); // 우리 서비스 전용 UUID 저장
      }

      setUserUUID(storedUUID); // ✅ 상태 업데이트
      
      // Firestore에 해당 UUID의 유저가 존재하는지 확인
      const userDocRef = doc(db, "users", storedUUID);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        // 1) Firestore에 유저 데이터 추가
        const newUser = {
          uid: storedUUID,
          displayName: generateRandomUserName(),
          profileImage: "/default_profile.webp",
          createAt: new Date().toISOString(),
        };
      
        await setDoc(userDocRef, newUser);
      
        // 2) voteResults 컬렉션에서 모든 대상 문서를 읽어서, voteinfo 하위 컬렉션 생성
        const voteResultsSnapshot = await getDocs(collection(db, "voteResults"));
        for (const targetDoc of voteResultsSnapshot.docs) {
          const targetId = targetDoc.id; // 예: "G-DRAGON"
          // users/{userUUID}/voteinfo/{targetId} 문서를 false로 초기화
          const voteInfoRef = doc(db, "users", storedUUID, "voteinfo", targetId);
          await setDoc(voteInfoRef, { voted: false });
        }
      
        localStorage.setItem("Fandex_userName", newUser.displayName);
      } else {
        const userData = userDocSnap.data();
        // localStorage에 업데이트
        localStorage.setItem("Fandex_userName", userData.displayName);
      }
    };

    initializeUser();
  }, []);

  return(
    <>
    <div className="container">
      <Vote 
        currentTargetId={currentTargetId} 
        setCurrentTargetId={setCurrentTargetId}
      />

      <CommentInput 
        userUUID={userUUID} 
        refresh={refresh} 
        setRefresh={setRefresh}
        currentTargetId={currentTargetId}
      />
      <CommentScroll 
        userUUID={userUUID} 
        refresh={refresh} 
        setRefresh={setRefresh}
        currentTargetId={currentTargetId}
      />
    </div>
    </>
  );
}

export default App
