import { collection, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../src/firebase-config";

/**
 * Firestore에 저장된 모든 댓글 문서를 조회하여,
 * 각 댓글의 likedBy/dislikedBy 배열 길이를 기반으로 좋아요와 싫어요 수치를 재설정하는 함수입니다.
 */
export default async function updateAllCommentCounts() {
  try {
    // voteResults 하위의 모든 comments 컬렉션의 문서를 조회합니다.
    const commentsQuery = collection(db, "voteResults","윤석열", "comments");
    const snapshot = await getDocs(commentsQuery);

    // 각 댓글 문서에 대해 likedBy/dislikedBy 배열 길이를 읽어 업데이트
    const updatePromises = snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();
      const newLikeCount = data.likedBy ? data.likedBy.length : 0;
      const newDislikeCount = data.dislikedBy ? data.dislikedBy.length : 0;

      return updateDoc(docSnap.ref, {
        좋아요: newLikeCount,
        싫어요: newDislikeCount,
      });
    });

    await Promise.all(updatePromises);
    console.log("모든 댓글의 좋아요 및 싫어요 수치가 업데이트되었습니다.");
  } catch (error) {
    console.error("댓글 업데이트 중 오류 발생:", error);
  }
}
