import { useEffect, useState, useRef } from "react";
import "./commentScroll.css";
import { ThumbUp, ThumbDown } from "../components/Icons";
import { db } from "../src/firebase-config";
import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  doc,
  runTransaction,
  increment,
  arrayUnion,
  arrayRemove,
  startAfter,
  limit,
  getDocs,
} from "firebase/firestore";

// Firestore Converter: 필요한 필드만 매핑
const commentConverter = {
  toFirestore(comment) {
    return comment;
  },
  fromFirestore(snapshot, options) {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      displayName: data.displayName,
      context: data.context,
      createdAt: data.createdAt,
      profileImage: data.profileImage,
      좋아요: data.좋아요,
      싫어요: data.싫어요,
      likedBy: data.likedBy,
      dislikedBy: data.dislikedBy,
    };
  }
};

function CommentScroll({ userUUID, currentTargetId }) {
  const [sortOrder, setSortOrder] = useState("latest");

  return (
    <>
      <SortButtons setSortOrder={setSortOrder} />
      <CommentList
        userUUID={userUUID}
        sortOrder={sortOrder}
        currentTargetId={currentTargetId}
      />
    </>
  );
}

const SortButtons = ({ setSortOrder }) => {
  const [active, setActive] = useState("latest");
  return (
    <div className="sort-container">
      <button
        className={`sort-button ${active === "popular" ? "active" : ""}`}
        onClick={() => {
          setActive("popular");
          setSortOrder("popular");
        }}
      >
        인기순
      </button>
      <button
        className={`sort-button ${active === "latest" ? "active" : ""}`}
        onClick={() => {
          setActive("latest");
          setSortOrder("latest");
        }}
      >
        최신순
      </button>
    </div>
  );
};

/**
 * CommentList 컴포넌트  
 * - 타겟과 정렬 방식(sortOrder)에 따라 메모리 캐시(cacheRef)를 사용해 데이터를 불러오지만,  
 *   정렬 순서가 변경되면 해당 캐시를 초기화하여 Firestore의 최신 데이터를 불러옵니다.
 * - 스크롤 시 startAfter()로 추가 데이터를 로드하며, onSnapshot을 통해 실시간 업데이트합니다.
 */
const CommentList = ({ userUUID, sortOrder, currentTargetId }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [topTimestamp, setTopTimestamp] = useState(null);
  // 메모리 캐시: key = `${currentTargetId}_${sortOrder}`
  const cacheRef = useRef({});
  // 구독 관리
  const unsubscribesRef = useRef([]);
  const newCommentsUnsubRef = useRef(null);

  // 캐시 유지: 1시간 동안 유지하며, 10분마다 오래된 캐시 삭제
  useEffect(() => {
    const cacheTimeout = 60 * 60 * 1000; // 1시간
    const intervalId = setInterval(() => {
      const now = Date.now();
      Object.keys(cacheRef.current).forEach((key) => {
        if (
          cacheRef.current[key].timestamp &&
          now - cacheRef.current[key].timestamp > cacheTimeout
        ) {
          delete cacheRef.current[key];
        }
      });
    }, 10 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  // 타겟이나 정렬 방식 변경 시 기존 구독 해제
  useEffect(() => {
    unsubscribesRef.current.forEach((unsub) => unsub());
    unsubscribesRef.current = [];
    if (newCommentsUnsubRef.current) {
      newCommentsUnsubRef.current();
      newCommentsUnsubRef.current = null;
    }
  }, [currentTargetId, sortOrder]);

  // 정렬 순서 변경 시 해당 캐시를 무효화하여 항상 최신 데이터를 불러오도록 함
  useEffect(() => {
    if (!currentTargetId) return;
    const cacheKey = `${currentTargetId}_${sortOrder}`;
    delete cacheRef.current[cacheKey]; // 캐시 초기화
    setLoading(true);
    loadInitialPage();
  }, [currentTargetId, sortOrder]);

  // sortOrder에 따른 orderBy 조건 반환
  const getOrderQuery = () => {
    return sortOrder === "latest"
      ? orderBy("createdAt", "desc")
      : orderBy("좋아요", "desc");
  };

  // 첫 페이지 로드 (onSnapshot 구독)
  const loadInitialPage = () => {
    const commentsRef = collection(
      db,
      "voteResults",
      currentTargetId,
      "comments"
    ).withConverter(commentConverter);
    const q = query(commentsRef, getOrderQuery(), limit(20));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedComments = snapshot.docs.map((doc) => doc.data());
        setComments(loadedComments);
        const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;
        setLastDoc(lastVisible);
        setHasMore(snapshot.docs.length === 20);
        const cacheKey = `${currentTargetId}_${sortOrder}`;
        cacheRef.current[cacheKey] = {
          comments: loadedComments,
          lastDoc: lastVisible,
          hasMore: snapshot.docs.length === 20,
          timestamp: Date.now(),
        };
        setLoading(false);
      },
      (error) => {
        console.error("댓글 실시간 업데이트 중 오류 발생:", error);
        setLoading(false);
      }
    );
    unsubscribesRef.current.push(unsubscribe);
  };

  // 페이지네이션: 추가 댓글 로드
  const loadMore = async () => {
    if (!lastDoc || !hasMore || loading) return;
    setLoading(true);
    const commentsRef = collection(
      db,
      "voteResults",
      currentTargetId,
      "comments"
    ).withConverter(commentConverter);
    const q = query(
      commentsRef,
      getOrderQuery(),
      startAfter(lastDoc),
      limit(20)
    );
    try {
      const snapshot = await getDocs(q);
      const newComments = snapshot.docs.map((doc) => doc.data());
      if (newComments.length > 0) {
        setComments((prev) => {
          const merged = [...prev, ...newComments];
          const cacheKey = `${currentTargetId}_${sortOrder}`;
          cacheRef.current[cacheKey] = {
            comments: merged,
            lastDoc: snapshot.docs[snapshot.docs.length - 1] || lastDoc,
            hasMore: newComments.length === 20,
            timestamp: Date.now(),
          };
          return merged;
        });
        setLastDoc(snapshot.docs[snapshot.docs.length - 1] || lastDoc);
        setHasMore(newComments.length === 20);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("추가 댓글 로드 중 오류 발생:", error);
    } finally {
      setLoading(false);
    }
  };

  // 새 댓글 구독을 위한 기준 타임스탬프 업데이트
  useEffect(() => {
    if (!currentTargetId || comments.length === 0) return;
    if (sortOrder === "latest") {
      setTopTimestamp(comments[0].createdAt);
    } else {
      const maxTimestamp = comments.reduce((max, comment) => {
        if (!max) return comment.createdAt;
        if (comment.createdAt && comment.createdAt.toDate() > max.toDate()) {
          return comment.createdAt;
        }
        return max;
      }, null);
      setTopTimestamp(maxTimestamp);
    }
  }, [currentTargetId, sortOrder, comments.length]);

  // 실시간 새 댓글 구독 (topTimestamp 기준)
  useEffect(() => {
    if (!currentTargetId || !topTimestamp) return;
    if (newCommentsUnsubRef.current) {
      newCommentsUnsubRef.current();
      newCommentsUnsubRef.current = null;
    }
    const commentsRef = collection(
      db,
      "voteResults",
      currentTargetId,
      "comments"
    ).withConverter(commentConverter);
    let newCommentsQuery = query(
      commentsRef,
      where("createdAt", ">", topTimestamp),
      orderBy("createdAt", "asc")
    );
    const unsubscribe = onSnapshot(newCommentsQuery, (snapshot) => {
      const newCommentsFromSnapshot = snapshot.docs.map((doc) => doc.data());
      if (newCommentsFromSnapshot.length > 0) {
        setComments((prev) => {
          const merged = [...prev];
          newCommentsFromSnapshot.forEach((newComment) => {
            if (!merged.some((existing) => existing.id === newComment.id)) {
              merged.push(newComment);
            }
          });
          if (sortOrder === "latest") {
            merged.sort((a, b) => b.createdAt?.toDate() - a.createdAt?.toDate());
          } else {
            merged.sort((a, b) => (b.좋아요 || 0) - (a.좋아요 || 0));
          }
          const cacheKey = `${currentTargetId}_${sortOrder}`;
          if (cacheRef.current[cacheKey]) {
            cacheRef.current[cacheKey].comments = merged;
            cacheRef.current[cacheKey].timestamp = Date.now();
          }
          return merged;
        });
      }
    });
    newCommentsUnsubRef.current = unsubscribe;
    return () => {
      if (newCommentsUnsubRef.current) {
        newCommentsUnsubRef.current();
        newCommentsUnsubRef.current = null;
      }
    };
  }, [currentTargetId, sortOrder, topTimestamp]);

  // 전역 스크롤 이벤트: 페이지 하단 50px 내 도달 시 추가 로드
  const handleScroll = () => {
    if (
      window.innerHeight + document.documentElement.scrollTop >=
      document.documentElement.offsetHeight - 50 &&
      hasMore &&
      !loading
    ) {
      loadMore();
    }
  };

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () =>
      window.removeEventListener("scroll", handleScroll);
  }, [hasMore, loading]);

  const sortedComments = [...comments].sort((a, b) => {
    return sortOrder === "latest"
      ? b.createdAt?.toDate() - a.createdAt?.toDate()
      : (b.좋아요 || 0) - (a.좋아요 || 0);
  });

  if (loading && comments.length === 0) {
    return <div className="loading">로딩중...</div>;
  }

  return (
    <div>
      {sortedComments.length > 0 ? (
        sortedComments.map((comment) => (
          <Comments
            key={comment.id}
            comment={comment}
            userUUID={userUUID}
            currentTargetId={currentTargetId}
          />
        ))
      ) : (
        <>
          <div className="no-comments">
            <img
              src="/horse.png"
              alt="말 이미지"
              style={{
                width: "100px",
                height: "100px",
                objectFit: "cover",
              }}
            />
          </div>
          <p className="no-comments">아직 아무 말도 없어요.</p>
          <div className="spacer"></div>
        </>
      )}
      {loading && <div className="loading">로딩중...</div>}
      <div style={{ height: "30px" }}></div>
    </div>
  );
};

const Comments = ({ comment, userUUID, currentTargetId }) => {
  // onSnapshot 구독을 통해 최신 상태 반영
  const [localComment, setLocalComment] = useState(comment);
  const [isUpdating, setIsUpdating] = useState(false);

  // localComment에서 현재 투표 상태 파생
  const currentVote = localComment.likedBy?.includes(userUUID)
    ? "like"
    : localComment.dislikedBy?.includes(userUUID)
    ? "dislike"
    : null;

  // 부모로부터 comment prop이 변경되면 로컬 상태 업데이트
  useEffect(() => {
    setLocalComment(comment);
  }, [comment]);

  // Firestore 트랜잭션을 이용해 원자적으로 투표 업데이트 수행
  const handleVote = async (type) => {
    if (!localComment.id || !userUUID || isUpdating) return;

    setIsUpdating(true);
    const commentRef = doc(
      db,
      "voteResults",
      currentTargetId,
      "comments",
      localComment.id
    );

    try {
      await runTransaction(db, async (transaction) => {
        const commentDoc = await transaction.get(commentRef);
        if (!commentDoc.exists()) throw new Error("문서가 존재하지 않습니다.");
        const data = commentDoc.data();
        const likedBy = data.likedBy || [];
        const dislikedBy = data.dislikedBy || [];

        if (type === "like") {
          // 이미 좋아요 리스트에 있으면 아무 작업도 하지 않음.
          if (likedBy.includes(userUUID)) return;
          let updateData = {};
          if (dislikedBy.includes(userUUID)) {
            // 싫어요에서 좋아요로 변경: dislikedBy 제거, 싫어요 -1, likedBy 추가, 좋아요 +1
            updateData = {
              좋아요: increment(1),
              likedBy: arrayUnion(userUUID),
              싫어요: increment(-1),
              dislikedBy: arrayRemove(userUUID),
            };
          } else {
            // 단순 좋아요: likedBy 추가, 좋아요 +1
            updateData = {
              좋아요: increment(1),
              likedBy: arrayUnion(userUUID),
            };
          }
          transaction.update(commentRef, updateData);
        } else if (type === "dislike") {
          // 이미 싫어요 리스트에 있으면 아무 작업도 하지 않음.
          if (dislikedBy.includes(userUUID)) return;
          let updateData = {};
          if (likedBy.includes(userUUID)) {
            // 좋아요에서 싫어요로 변경: likedBy 제거, 좋아요 -1, dislikedBy 추가, 싫어요 +1
            updateData = {
              싫어요: increment(1),
              dislikedBy: arrayUnion(userUUID),
              좋아요: increment(-1),
              likedBy: arrayRemove(userUUID),
            };
          } else {
            // 단순 싫어요: dislikedBy 추가, 싫어요 +1
            updateData = {
              싫어요: increment(1),
              dislikedBy: arrayUnion(userUUID),
            };
          }
          transaction.update(commentRef, updateData);
        }
      });
    } catch (error) {
      console.error("좋아요/싫어요 트랜잭션 실패:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="comment-container">
      <img
        src={localComment.profileImage}
        alt="프로필 이미지"
        style={{
          width: "32px",
          height: "32px",
          marginTop: "4px",
          objectFit: "cover",
          objectPosition: "center",
          borderRadius: "50%",
        }}
      />
      <div id="comment">
        <div className="comment-title">
          <span id="username">{localComment.displayName}</span> ·{" "}
          <span id="date-time">{formatDate(localComment.createdAt)}</span>
        </div>
        <div className="comment-content">
          <span>{localComment.context}</span>
        </div>
        <div className="comment-thumb">
          <ThumbUp
            onClick={() => handleVote("like")}
            fill={currentVote === "like" ? "#B3CE1F" : "white"}
          />{" "}
          <span>{localComment.좋아요}</span>
          <ThumbDown
            onClick={() => handleVote("dislike")}
            fill={currentVote === "dislike" ? "#7D6CF6" : "white"}
          />{" "}
          <span>{localComment.싫어요}</span>
        </div>
      </div>
    </div>
  );
};

const formatDate = (timestamp) => {
  if (!timestamp) return "날짜 없음";
  const date = timestamp.toDate();
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(
    date.getDate()
  ).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
};

export default CommentScroll;
