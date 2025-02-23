import Modal from "react-modal";
import React, { useEffect, useState, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { storage, db } from "../src/firebase-config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import "./popup.css";
import { CloseIcon, EditIcon } from "./Icons";
import { disallowedRegex } from "../utils/disallowedChars"; 

// 화면 전체를 덮고, 텍스트를 중앙에 배치하기 위한 스타일
const customModalStyles = {
  overlay: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    zIndex: 9999,
  },
  content: {
    // content 영역을 투명 & 전체 화면으로 설정
    backgroundColor: "transparent",
    border: "none",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 0,
    margin: 0,
    // Flex로 가운데 정렬
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};

function InfoModal({ isOpen, onRequestClose, message }) {
  // 전체 content 클릭 시 모달 닫기
  const handleClick = () => {
    onRequestClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={customModalStyles}
      ariaHideApp={false}
      contentLabel="Info Modal"
      shouldCloseOnOverlayClick={false} // overlay 클릭은 content에 포함되어 있으므로 false
    >
      {/* content 전체에 onClick 설정 */}
      <div
        style={{
          width: "100%",
          height: "100%",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onClick={handleClick}
      >
        {/* 내부 텍스트 영역에 좌우 padding 적용 */}
        <div
          style={{
            boxSizing: "border-box",
            width: "100%",
            padding: "0 20px",
            color: "white",
            fontFamily: "SUITE Variable",
            textAlign: "center",
            fontSize: "18px",
            fontStyle: "normal",
            fontWeight: "700",
            lineHeight: "24px",
          }}
        >
          {message}
        </div>
      </div>
    </Modal>
  );
}

function ProfileModal({ isOpen, onRequestClose, userUUID }) {
  const [profileImage, setProfileImage] = useState("/default_profile.webp");
  const [displayName, setDisplayName] = useState("");
  const fileInputRef = useRef(null);

  // 모달이 열릴 때마다 localStorage에서 닉네임을 가져와서 state에 반영
  useEffect(() => {
    if (isOpen) {
      const storedName = localStorage.getItem("Fandex_userName") || "";
      setDisplayName(storedName);
    }
  }, [isOpen]);

  // Firestore에서 최신 프로필 데이터를 가져옴
  useEffect(() => {
    const fetchProfileData = async () => {
      if (!userUUID) return;
      try {
        const userDocRef = doc(db, "users", userUUID);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          if (data.profileImage) {
            setProfileImage(data.profileImage);
          }
          if (data.displayName) {
            setDisplayName(data.displayName);
          }
        }
      } catch (error) {
        console.error("Error fetching profile data:", error);
      }
    };
    fetchProfileData();
  }, [userUUID]);

  // 이미지 클릭 시 파일 선택창 호출
  const handleImageClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // 파일 선택 후 Storage 업로드
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 파일 크기 확인 (3MB = 3 * 1024 * 1024 바이트)
    const maxSize = 3 * 1024 * 1024; // 3MB
    if (file.size > maxSize) {
      alert("업로드 가능한 파일 크기는 3MB로 제한됩니다.");
      return;
    }


    try {
      const storageRef = ref(storage, `profileImages/${userUUID}/profile.jpg`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const userDocRef = doc(db, "users", userUUID);
      await setDoc(userDocRef, { profileImage: downloadURL }, { merge: true });

      setProfileImage(downloadURL);
    } catch (error) {
      console.error("프로필 이미지 업로드 중 오류 발생:", error);
    }
  };

  // 프로필 이미지를 기본값으로 되돌리는 함수
  const handleResetProfileImage = async () => {
    try {
      const defaultUrl = "/default_profile.webp";
      // Firestore 문서 업데이트
      const userDocRef = doc(db, "users", userUUID);
      await setDoc(userDocRef, { profileImage: defaultUrl }, { merge: true });
      // 로컬 상태도 업데이트
      setProfileImage(defaultUrl);
    } catch (error) {
      console.error("프로필 이미지 기본값 복원 중 오류:", error);
    }
  };
    // 닉네임 입력값 업데이트 및 특수문자 필터링
    const handleDisplayNameChange = (e) => {
      let newName = e.target.value.replace(disallowedRegex, ""); // 특수문자 제거
      if (disallowedRegex.test(e.target.value)) {
        alert("입력할 수 없는 특수문자가 포함되어 있습니다."); // 추가된 경고 메시지
      }
      setDisplayName(newName);
    };

  // 닉네임 저장 함수
  const saveDisplayName = async () => {
    if (!displayName) return;
    try {
      const userDocRef = doc(db, "users", userUUID);
      await setDoc(userDocRef, { displayName }, { merge: true });
      // localStorage 업데이트
      localStorage.setItem("Fandex_userName", displayName);
    } catch (error) {
      console.error("디스플레이 이름 업데이트 중 오류 발생:", error);
    }
  };

  // 엔터키 입력 시 저장 처리
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.target.blur(); // onBlur 이벤트 발생 -> saveDisplayName
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="close-button" onClick={onRequestClose}>
          <CloseIcon />
        </button>
        <div style={{ height: "40px" }}></div>
        <span className="profile-title">마이 프로필</span>
        <div style={{ height: "60px" }}></div>

        {/* 프로필 이미지 */}
        <div className="profile-image">
          <img
            src={profileImage}
            alt="Profile"
            onClick={handleImageClick}
            style={{ cursor: "pointer" }}
          />
          <button
            className="mini-close-button"
            onClick={handleResetProfileImage}
            style={{ position: "absolute", top: "4px", right: "4px" }}
          >
            <CloseIcon width="32px" height="32px" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept="image/*"
            onChange={handleFileChange}
          />
        </div>

        <div style={{ height: "32px" }}></div>

        {/* 닉네임 인라인 입력 */}
        <div
          className="user-name"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderBottom: "1px solid white",
              paddingBottom: "4px",
              gap: "8px",
              width: "200px",
              justifyContent: "center",
            }}
          >
            <input
              type="text"
              value={displayName}
              onChange={handleDisplayNameChange} // 🔥 특수문자 제거 적용
              onBlur={saveDisplayName}
              onKeyDown={handleKeyDown}
              maxLength={12} // 12자 제한
              style={{
                border: "none",
                outline: "none",
                backgroundColor: "transparent",
                color: "white",
                fontFamily: "SUITE Variable",
                fontSize: "20px",
                fontWeight: "700",
                paddingBottom: "2px",
                textAlign: "center",
                width: "100%",
              }}
            />
            <div style={{ cursor: "pointer" }}>
              <EditIcon />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { InfoModal, ProfileModal };
