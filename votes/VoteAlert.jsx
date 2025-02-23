import React, { useEffect, useState, useRef } from "react";
import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../src/firebase-config";
import { CSSTransition } from "react-transition-group";
import "./VoteAlert.css";

// 오늘 날짜를 "YYYY-MM-DD" 형식으로 반환하는 함수
const getTodayDatePath = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function VoteAlerts() {
  const [alertQueue, setAlertQueue] = useState([]);
  const [currentAlert, setCurrentAlert] = useState(null);
  const nodeRef = useRef(null);
  // 접속 시점 이후의 새로운 vote를 필터링하기 위한 기준 시간
  const [startTime, setStartTime] = useState(null);

  useEffect(() => {
    // 컴포넌트 마운트 시점의 로컬 시간을 기준 시간으로 설정합니다.
    const now = new Date();
    setStartTime(now);
  }, []);

  useEffect(() => {
    if (!startTime) return;

    const todayPath = getTodayDatePath();
    const votesColRef = collection(db, "votes", todayPath, "votesDocs");

    // 접속 시점 이후 생성된 문서만 반환하도록 쿼리에 where 조건 추가
    const q = query(
      votesColRef,
      where("voteDate", ">", startTime),
      orderBy("voteDate", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newVotes = [];
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          newVotes.push({ id: change.doc.id, ...change.doc.data() });
        }
      });
      if (newVotes.length > 0) {
        setAlertQueue((prev) => [...prev, ...newVotes]);
      }
    });
    return () => unsubscribe();
  }, [startTime]);

  // 큐에서 하나씩 알림을 처리합니다.
  useEffect(() => {
    if (!currentAlert && alertQueue.length > 0) {
      const nextAlert = alertQueue[0];
      setCurrentAlert(nextAlert);
      setAlertQueue((prev) => prev.slice(1));
    }
  }, [alertQueue, currentAlert]);

  // 현재 알림이 표시되면 3초 후 자동 제거
  useEffect(() => {
    if (currentAlert) {
      const timerId = setTimeout(() => {
        setCurrentAlert(null);
      }, 3000);
      return () => clearTimeout(timerId);
    }
  }, [currentAlert]);

  return (
    <div style={alertBoxStyle}>
      <CSSTransition
        in={!!currentAlert}
        timeout={300}
        classNames="alert"
        unmountOnExit
        nodeRef={nodeRef}
      >
        <p ref={nodeRef} style={alertTextStyle}>
          {currentAlert && (
            <>
              {currentAlert.type === "응원해요" ? "🔥" : "😣"}{" "}
              <span style={{ fontWeight: 700 }}>
                {currentAlert.displayName}
              </span>
              님이{" "}
              <span style={{ fontWeight: 700 }}>
                {currentAlert.targetId}
              </span>
              님을{" "}
              {currentAlert.type === "응원해요" ? "응원해요" : "아쉬워해요"}!
            </>
          )}
        </p>
      </CSSTransition>
    </div>
  );
}

const alertBoxStyle = {
  width: "100%",
  height: "20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background-color 0.3s",
};

const alertTextStyle = {
  margin: 0,
  fontWeight: 400,
  fontFamily: "SUITE Variable",
  fontSize: "14px",
  textAlign: "center",
  color: "white",
};

export default VoteAlerts;
