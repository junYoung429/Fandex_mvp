import "./vote.css"; // CSS 파일 임포트
import { InfoIcon, MyProfileIcon } from "../components/Icons";
import { useEffect, useState, useRef } from "react";
import { InfoModal, ProfileModal } from "../components/popup";
import { db } from "../src/firebase-config";
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc } from "firebase/firestore";
import CenterMode from "./CenterScroll";
import VoteAlerts from "./VoteAlert";
import { STATIC_TARGETS } from "../utils/targets";

// 오늘 자정까지 남은 시간을 계산하는 함수
function getTimeLeftUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  let diffMs = midnight - now;
  if (diffMs < 0) diffMs = 0;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  const seconds = Math.floor((diffMs / 1000) % 60);
  return { hours, minutes, seconds };
}

function Vote({ currentTargetId, setCurrentTargetId }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [currentAffiliate, setCurrentAffiliate] = useState("");
  const [voted, setVoted] = useState(false); // 이미 투표했는가 여부
  const [voteType, setVoteType] = useState(null); // "응원해요" 또는 "아쉬워요"
  const [userUUID, setUserUUID] = useState(localStorage.getItem("Fandex_userUUID"));
  const [isVoting, setIsVoting] = useState(false); // UI 업데이트용, 투표 처리 중 여부
  const [voteEffect, setVoteEffect] = useState(null); // 투표 효과 상태
  // 동기적으로 사용할 ref
  const votingRef = useRef(false);

  // 남은 시간 상태 (자정까지)
  const [timeLeft, setTimeLeft] = useState(getTimeLeftUntilMidnight());
  useEffect(() => {
    const timerId = setInterval(() => {
      setTimeLeft(getTimeLeftUntilMidnight());
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  // 현재 타겟의 affiliate 정보 가져오기
  useEffect(() => {
    if (!currentTargetId) return;
    const targetData = STATIC_TARGETS.find((t) => t.id === currentTargetId);
    setCurrentAffiliate(targetData ? targetData.affiliate : "");
  }, [currentTargetId]);

  // 사용자가 해당 타겟에 대해 투표했는지 확인
  useEffect(() => {
    const fetchVotedInfo = async () => {
      if (!currentTargetId) {
        setVoted(false);
        setVoteType(null);
        return;
      }
      const userUUID = localStorage.getItem("Fandex_userUUID");
      if (!userUUID) return;
      try {
        const voteInfoRef = doc(db, "users", userUUID, "voteinfo", currentTargetId);
        const voteInfoSnap = await getDoc(voteInfoRef);
        if (voteInfoSnap.exists()) {
          const voteData = voteInfoSnap.data();
          setVoted(!!voteData.voted);
          setVoteType(voteData.type || null);
        } else {
          setVoted(false);
          setVoteType(null);
        }
      } catch (error) {
        console.error("Error fetching voteinfo:", error);
      }
    };
    fetchVotedInfo();
  }, [currentTargetId]);

  // 투표 버튼 클릭 시 처리 (동기적인 ref를 사용해 중복 클릭 방지)
  const handleVote = async (type) => {
    if (votingRef.current) return; // 이미 처리 중이면 무시
    votingRef.current = true;
    setIsVoting(true);

    try {
      const userUUID = localStorage.getItem("Fandex_userUUID");
      if (!userUUID) {
        console.error("사용자 UUID를 찾을 수 없습니다.");
        votingRef.current = false;
        setIsVoting(false);
        return;
      }
      const displayName = localStorage.getItem("Fandex_userName") || "익명";

      // 오늘 날짜 경로: 예) "2025-02-20"
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const datePath = `${year}-${month}-${day}`;

      const votesRef = collection(db, "votes", datePath, "votesDocs");
      await addDoc(votesRef, {
        authorUUID: userUUID,
        displayName,
        type,
        voteDate: serverTimestamp(),
        targetId: currentTargetId,
      });

      // 중복 투표 방지용 사용자 정보 기록
      const voteInfoRef = doc(db, "users", userUUID, "voteinfo", currentTargetId);
      await setDoc(voteInfoRef, { voted: true, type }, { merge: true });

      setVoted(true);
      setVoteType(type);
      // 투표 후 voteEffect를 설정하고 3초 후 초기화
      setVoteEffect(type);
      setTimeout(() => setVoteEffect(null), 500);
    } catch (error) {
      console.error("투표 저장 중 오류 발생:", error);
    } finally {
      votingRef.current = false;
      setIsVoting(false);
    }
  };

  const { hours, minutes, seconds } = timeLeft;
  const timeString = (
    <>
      다음 투표는{" "}
      <span style={{ fontWeight: 800, color: "#2C9CDB" }}>
        {hours}시간 {minutes}분 {seconds}초
      </span>{" "}
      후 가능합니다
    </>
  );

  return (
    <div>
      <div className="logo-container">
        <span className="logo-text">
          <span style={{ color: "#B3CE1F" }}>FAN</span>
          <span style={{ color: "#7D6CF6" }}>DEX</span>
        </span>
      </div>
      <div className="row-top">
        <div className="left">
          <span className="left-text">투표</span>
          <div onClick={() => setModalOpen(true)} style={{ display: "inline-block", cursor: "pointer" }}>
            <InfoIcon />
          </div>
        </div>
        <div onClick={() => setProfileModalOpen(true)} style={{ display: "inline-block", cursor: "pointer" }}>
          <MyProfileIcon />
        </div>
      </div>

      <InfoModal
        isOpen={modalOpen}
        onRequestClose={() => setModalOpen(false)}
        message={
          <>
            FANDEX는
            <br />
            자체 개발한 투표 집계 시스템을 통해
            <br />
            항상 최신의 지지율을 반영해요.
            <br />
            <br />
            누적투표수: 투표된 모든 표의 총 개수
            <br />
            누적응답수: 투표된 모든 응답
            <br />
            (응원해요 or 아쉬워요)의 총 개수
            <br />
            유효응답수: 최근 5일 이내 투표된 모든 응답의 표의 가치의 총 합
            <br />
            <br />
            사이트 관련 모든 문의는 seoyoonjsy@naver.com으로 부탁드립니다.
          </>
        }
      />

      <ProfileModal
        isOpen={profileModalOpen}
        onRequestClose={() => setProfileModalOpen(false)}
        userUUID={userUUID}
      />

      <VoteAlerts />

      <div style={{ height: "76px" }}></div>

      <CenterMode 
        currentTargetId={currentTargetId} 
        setCurrentTargetId={setCurrentTargetId} 
        voteEffect={voteEffect}
      />

      <div className="full-width affiliate-container">
        <span>{currentAffiliate}</span>
      </div>
      <div className="full-width name-container">
        <span>
          {STATIC_TARGETS.find((t) => t.id === currentTargetId)?.name || currentTargetId}
        </span>
      </div>

      <div className="row-bottom">
        {voted ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            <div
              className={`voteButton expanded ${voteType === "응원해요" ? "voteButton-like" : "voteButton-dislike"}`}
              style={{ marginBottom: "12px" }}
            >
              <span>{voteType}</span>
            </div>
            <div className="countdown-text">{timeString}</div>
          </div>
        ) : (
          <>
            <div
              className={`voteButton voteButton-like ${isVoting ? "disabled" : ""}`}
              onClick={() => handleVote("응원해요")}
            >
              <span>응원해요</span>
            </div>
            <div
              className={`voteButton voteButton-dislike ${isVoting ? "disabled" : ""}`}
              onClick={() => handleVote("아쉬워요")}
            >
              <span>아쉬워요</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Vote;
