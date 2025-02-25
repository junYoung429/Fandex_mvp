import { collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../src/firebase-config"; 

// 삭제 코드
export default async function deleteCommentsByDisplayName() {
  // 하드코딩된 displayName
  const displayName = "친절한 유령"; // 원하는 displayName으로 변경하세요.
  // "voteResults" 컬렉션 내 "윤석열" 문서의 "comments" 하위 컬렉션 참조
  const commentsRef = collection(db, "voteResults", "윤석열", "comments");
  // 해당 displayName을 가진 문서를 쿼리
  const commentsQuery = query(commentsRef, where("displayName", "==", displayName));

  try {
    const snapshot = await getDocs(commentsQuery);

    // writeBatch를 사용하여 여러 삭제 작업을 하나의 배치로 처리
    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    await batch.commit();
    console.log(`Deleted ${snapshot.docs.length} comments for displayName: ${displayName}`);
  } catch (error) {
    console.error("Error deleting comments:", error);
  }
}
