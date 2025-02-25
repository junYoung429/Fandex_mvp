import { useState, useEffect } from "react";
import "./commentInput.css";
import { UploadIcon, InfoIcon } from "../components/Icons";
import { db } from "../src/firebase-config";
import { doc, getDoc, collection, addDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { InfoModal } from "../components/popup";
import { disallowedRegex } from "../utils/disallowedChars";

function CommentInput({ userUUID, refresh, setRefresh, currentTargetId }) { 
  const [text, setText] = useState("");
  const [userName, setUserName] = useState("익명 유령");
  const [userProfile, setUserProfile] = useState("/default_profile.webp");
  const [commentCount, setCommentCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 최근 1분 내에 댓글을 제출한 시간들을 저장 (밀리초 값)
  const [recentComments, setRecentComments] = useState([]);
  // 제한 상태: 댓글 작성 제한이 끝나는 시점 (밀리초)
  const [disabledUntil, setDisabledUntil] = useState(null);
  // 남은 제한 시간을 초 단위로 저장
  const [disabledCountdown, setDisabledCountdown] = useState(0);
  // 제한 알림을 한 번만 띄우기 위한 flag
  const [limitAlertShown, setLimitAlertShown] = useState(false);

  // 사용자 정보 로드
  useEffect(() => {
    if (!userUUID) return;
    const storedName = localStorage.getItem("Fandex_userName");
    const storedProfile = localStorage.getItem("Fandex_userProfile") || "/default_profile.webp";
    if (storedName) setUserName(storedName);
    setUserProfile(storedProfile);
  }, [userUUID]);

  // 댓글 전체 개수를 실시간 업데이트
  useEffect(() => {
    if (!currentTargetId) return;
    const commentRef = collection(db, "voteResults", currentTargetId, "comments");
    const unsubscribe = onSnapshot(
      commentRef,
      (snapshot) => {
        setCommentCount(snapshot.size);
      },
      (error) => {
        console.error("댓글 개수를 실시간 업데이트하는 중 오류 발생:", error);
      }
    );
    return () => unsubscribe();
  }, [currentTargetId]);

  // 입력값에서 disallowed 특수문자 제거
  const handleTextChange = (e) => {
    let newValue = e.target.value;
    if (disallowedRegex.test(newValue)) {
      newValue = newValue.replace(disallowedRegex, '');
      alert("입력할 수 없는 특수문자가 포함되어 있습니다.");
    }
    setText(newValue);
  };

  // 공백을 제외한 문자 수가 5자 이상이어야 유효한 댓글로 간주
  const isValidComment = text.replace(/\s/g, '').length >= 5;

  // 최근 1분 내 댓글 수 계산 (밀리초 단위로 저장된 타임스탬프들)
  const recentCount = recentComments.filter(ts => ts > Date.now() - 60000).length;
  const reachedLimit = recentCount >= 2;

  // 제한 상태: 최근 1분 내 2개 이상 댓글이 있다면, disabledUntil를 설정
  useEffect(() => {
    if (reachedLimit && !disabledUntil) {
      // 최근 1분 내 댓글들 중 가장 오래된 시간을 찾아, 1분 후를 제한 종료 시간으로 설정
      const validTimestamps = recentComments.filter(ts => ts > Date.now() - 60000);
      if (validTimestamps.length > 0) {
        const earliest = Math.min(...validTimestamps);
        setDisabledUntil(earliest + 60000);
      }
    }
  }, [recentComments, reachedLimit, disabledUntil]);

  // 제한 상태일 때, 남은 시간(초)을 업데이트
  useEffect(() => {
    if (!disabledUntil) return;
    const intervalId = setInterval(() => {
      const remaining = Math.ceil((disabledUntil - Date.now()) / 1000);
      setDisabledCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(intervalId);
        setDisabledUntil(null);
        setLimitAlertShown(false);
        setRecentComments([]); // 제한 해제 시 recentComments 초기화
      }
    }, 1000);
    return () => clearInterval(intervalId);
  }, [disabledUntil]);

  const handleCommentSubmit = async () => {
    if (reachedLimit) {
      // 제한 상태이므로 제출하지 않음
      return;
    }
    if (!isValidComment) {
      // 유효하지 않은 댓글인 경우 제출하지 않음 (알림 없이 바로 종료)
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      let latestName = userName; 
      let latestProfile = userProfile; 

      if (userUUID) {
        const userDocRef = doc(db, "users", userUUID);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          if (data.displayName) {
            latestName = data.displayName;
            localStorage.setItem("Fandex_userName", data.displayName);
          }
          if (data.profileImage) {
            latestProfile = data.profileImage;
            localStorage.setItem("Fandex_userProfile", data.profileImage);
          }
        }
      }

      const commentRef = collection(db, "voteResults", currentTargetId, "comments");
      await addDoc(commentRef, {
        authorUid: userUUID,
        displayName: latestName,
        profileImage: latestProfile,
        context: text,
        createdAt: serverTimestamp(),
        싫어요: 0,
        좋아요: 0,
        likedBy: [],
        dislikedBy: []
      });

      setText("");
      const now = Date.now();
      // 최근 1분 내 댓글들을 업데이트하고, 1분 경과하지 않은 것들만 남김
      setRecentComments(prev => [
        ...prev.filter(ts => ts > now - 60000),
        now
      ]);
    } catch (error) {
      console.error("댓글 저장 중 오류 발생:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="row">
        <div className="left" onClick={() => {}}>
          <span className="left-text">댓글</span>
          <div onClick={() => setModalOpen(true)} style={{ display: "inline-block", cursor: "pointer" }}>
            <InfoIcon />
          </div>
        </div>
        <span className="right-text">{commentCount}개</span>
      </div>
      <div className="input-wrapper">
        <textarea
          className="comment"
          placeholder={
            disabledUntil 
              ? `${disabledCountdown}초 후 댓글 작성 가능` 
              : "댓글은 공백 제외 5자 이상 200자 이하로 작성해주세요."
          }
          value={text}
          onChange={handleTextChange}
          maxLength={200}
          disabled={isSubmitting || reachedLimit}
        />
        <div 
          className="upload-button"
          style={{
            pointerEvents: isSubmitting || reachedLimit ? "none" : "auto",
            cursor: isValidComment && !isSubmitting && !reachedLimit ? "pointer" : "default",
            opacity: reachedLimit ? 0.5 : 1
          }}
          onClick={handleCommentSubmit}
        >
          <UploadIcon 
            fill={(isValidComment && !isSubmitting && !reachedLimit) ? "#2C9CDB" : "#939393"} 
          />
        </div>            
      </div>
      <InfoModal
        isOpen={modalOpen}
        onRequestClose={() => setModalOpen(false)}
        message={
          <>
            댓글은 수정 또는 삭제가 불가하니
            <br />
            신중하게 작성해 주세요.
            <br />
            또한, 지나친 비방이나 욕설이 포함된 댓글은
            <br />
            임의로 삭제될 수 있어요.
          </>
        }
      />
    </div>
  );
}

export default CommentInput;
