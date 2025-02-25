import { collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../src/firebase-config"; 

//  삭제 코드 
export default async function deleteCommentsByAuthor() {
    // 하드코딩된 authorUid
    const authorUid = "";
    // "voteResults" 컬렉션 내 "이재명" 문서의 "comments" 하위 컬렉션 참조
    const commentsRef = collection(db, "voteResults","이재명", "comments");
    // 해당 authorUid를 가진 문서 쿼리
    const commentsQuery = query(commentsRef, where("authorUid", "==", authorUid));
  
    try {
      const snapshot = await getDocs(commentsQuery);
  
      // writeBatch를 사용하여 여러 삭제 작업을 하나의 배치로 처리
      const batch = writeBatch(db);
      snapshot.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
  
      await batch.commit();
      console.log(`Deleted ${snapshot.docs.length} comments for authorUid: ${authorUid}`);
    } catch (error) {
      console.error("Error deleting comments:", error);
    }
  }