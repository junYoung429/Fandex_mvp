// functions/index.js
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as functions from "firebase-functions/v2";

import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import admin from "firebase-admin";

// Firebase Admin 초기화 (한 번만 호출)
initializeApp();

// --------------------------------------------------------------------------------
// 1. 투표 생성 시 voteResults 문서 실시간 업데이트 (onCreate 트리거)
// --------------------------------------------------------------------------------
export const aggregateVoteOnCreate = onDocumentCreated(
  {
    document: "votes/{date}/votesDocs/{voteId}",
  },
  async (event) => {
    const voteData = event.data.data();
    const targetId = voteData.targetId;
    if (!targetId) return;

    // 투표 종류에 따라 업데이트할 필드 결정
    const field = voteData.type === "응원해요" ? "응원해요" : "아쉬워요";
    const validField = voteData.type === "응원해요" ? "유효_응원해요" : "유효_아쉬워요";

    const voteResultsRef = admin.firestore().collection("voteResults").doc(targetId);
    try {
      await admin
        .firestore()
        .runTransaction(async (transaction) => {
          const docSnap = await transaction.get(voteResultsRef);
          if (!docSnap.exists) {
            transaction.set(voteResultsRef, {
              [field]: 1,
              [validField]: 1,
            });
          } else {
            transaction.update(voteResultsRef, {
              [field]: FieldValue.increment(1),
              [validField]: FieldValue.increment(1),
            });
          }
        });
    } catch (error) {
      console.error("voteResults 업데이트 중 오류:", error);
    }
  }
);



// 모든 유저 투표 가능 초기화   
export const resetVoteInfo = onSchedule(
  {
    schedule: "2 0 * * *", // 매일 20시 15분 (KST)
    timeZone: "Asia/Seoul"
  },
  async (event) => {
    const db = getFirestore();
    console.log("🔄 모든 유저의 voteinfo 하위 컬렉션 초기화 시작...");

    try {
      // 1) 모든 user 문서 가져오기
      const usersSnapshot = await db.collection("users").get();
      const userDocs = usersSnapshot.docs;

      const BATCH_SIZE = 500;
      let batch = db.batch();
      let batchCount = 0;
      let batchIndex = 1;

      // 2) 각 유저에 대해 voteinfo 하위 컬렉션의 문서들을 가져옴
      for (let i = 0; i < userDocs.length; i++) {
        const userDocRef = userDocs[i].ref;

        // 하위 컬렉션 "voteinfo"의 모든 문서 가져오기
        const voteinfoSnapshot = await userDocRef.collection("voteinfo").get();

        voteinfoSnapshot.forEach((voteinfoDoc) => {
          // voteinfoDoc = "users/{userId}/voteinfo/{targetId}"
          batch.update(voteinfoDoc.ref, { voted: false });
          batchCount++;

          // 배치 한도(500개) 도달 시 commit
          if (batchCount === BATCH_SIZE) {
            batch.commit();
            console.log(`✅ Batch ${batchIndex} (총 ${batchCount}개 문서) 커밋 완료.`);
            batchIndex++;
            batch = db.batch();
            batchCount = 0;
          }
        });
      }

      // 남은 배치 커밋
      if (batchCount > 0) {
        await batch.commit();
        console.log(`✅ Batch ${batchIndex} (총 ${batchCount}개 문서) 커밋 완료.`);
      }

      console.log("🎉 모든 유저의 voteinfo 문서 voted 필드를 false로 초기화 완료!");
    } catch (error) {
      console.error("❌ voteinfo 초기화 중 오류 발생:", error);
    }
  }
);


// 가중치 계산: 행사일 기준으로 d+1일마다 0.2씩 하락 (오늘: 1.0, 어제: 0.8, 그저께: 0.6, ...)
export const computeWeightedVotes = onSchedule(
  {
    // 매일 자정(00:00) KST에 실행
    schedule: "2 0 * * *",
    timeZone: "Asia/Seoul",
  },
  async (event) => {
    const db = getFirestore();
    // KST 기준의 현재 시간 구하기
    const nowKST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    console.log("⚖️ 가중치 투표 계산 시작 (KST):", nowKST.toISOString());

    try {
      const sums = {};

      for (let dayOffset = 0; dayOffset <= 4; dayOffset++) {
        const rawWeight = 1 - 0.2 * dayOffset;
        const weight = parseFloat(Math.max(rawWeight, 0).toFixed(1));
        if (weight <= 0) break;

        // KST 기준의 날짜 계산
        const dateObj = new Date(
          nowKST.getFullYear(),
          nowKST.getMonth(),
          nowKST.getDate() - dayOffset
        );
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const day = String(dateObj.getDate()).padStart(2, "0");
        const datePath = `${year}-${month}-${day}`;
        console.log(` - [${datePath}] dayOffset=${dayOffset}, weight=${weight}`);

        const dayCollectionRef = db.collection(`votes/${datePath}/votesDocs`);
        const daySnapshot = await dayCollectionRef.get();
        if (daySnapshot.empty) {
          console.log(`   -> ${datePath} 에는 투표 문서가 없습니다.`);
          continue;
        }

        daySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const targetId = data.targetId?.trim();
          const type = data.type;
          if (!targetId || !type) return;

          if (!sums[targetId]) {
            sums[targetId] = { 응원해요: 0, 아쉬워요: 0 };
          }
          if (type === "응원해요") {
            sums[targetId].응원해요 += weight;
          } else if (type === "아쉬워요") {
            sums[targetId].아쉬워요 += weight;
          }
        });
      }

      // 결과 업데이트 로직은 동일하게 진행
      let batch = db.batch();
      let count = 0;
      const BATCH_SIZE = 500;

      for (const targetId in sums) {
        const targetRef = db.collection("voteResults").doc(targetId);
        const { 응원해요, 아쉬워요 } = sums[targetId];

        batch.update(targetRef, {
          유효_응원해요: 응원해요,
          유효_아쉬워요: 아쉬워요,
        });
        count++;
        if (count === BATCH_SIZE) {
          await batch.commit();
          console.log(`   -> ${count}개 문서 커밋 완료.`);
          batch = db.batch();
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
        console.log(`   -> ${count}개 문서 커밋 완료.`);
      }

      console.log("✅ 가중치 투표 계산 완료!", sums);
    } catch (err) {
      console.error("❌ 가중치 계산 중 오류 발생:", err);
    }
  }
);
