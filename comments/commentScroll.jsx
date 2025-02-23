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
  getDoc,
  updateDoc,
  increment,
  arrayUnion,
  arrayRemove,
  startAfter,
  limit,
  serverTimestamp,
  getDocs
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
 * - 타겟과 정렬 방식(sortOrder)에 따라 메모리 캐시(cacheRef)에 저장된 댓글 데이터를 우선 사용하고,  
 * - 캐시가 없으면 첫 페이지(20개)를 onSnapshot()으로 구독하여 로드합니다.  
 * - 스크롤 시 startAfter()를 사용해 추가 20개씩 단발성 getDocs() 호출로 데이터를 로드합니다.
 * - 새 댓글 구독은 별도의 state(topTimestamp)를 기준으로 설정하여 불필요한 재구독을 피합니다.
 */
const CommentList = ({ userUUID, sortOrder, currentTargetId }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  // 새 댓글 구독을 위한 기준 타임스탬프
  const [topTimestamp, setTopTimestamp] = useState(null);
  // 메모리 캐시: key = `${currentTargetId}_${sortOrder}`
  const cacheRef = useRef({});
  // 구독 관리 (초기 로드 및 추가 페이지 구독)
  const unsubscribesRef = useRef([]);
  const newCommentsUnsubRef = useRef(null);

  // 캐시 유지 시간 설정 (1시간 유지, 10분마다 오래된 캐시 삭제)
  useEffect(() => {
    const cacheTimeout = 60 * 60 * 1000; // 1시간
    const intervalId = setInterval(() => {
      const now = Date.now();
      Object.keys(cacheRef.current).forEach((key) => {
        if (cacheRef.current[key].timestamp && now - cacheRef.current[key].timestamp > cacheTimeout) {
          delete cacheRef.current[key];
        }
      });
    }, 10 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  // 타겟이나 정렬 방식 변경 시 기존 구독 해제 (불필요한 재구독을 방지)
  useEffect(() => {
    unsubscribesRef.current.forEach((unsub) => unsub());
    unsubscribesRef.current = [];
    if (newCommentsUnsubRef.current) {
      newCommentsUnsubRef.current();
      newCommentsUnsubRef.current = null;
    }
  }, [currentTargetId, sortOrder]);

  // 캐시가 있으면 캐시 데이터를 사용하고, 없으면 첫 페이지 구독 시작
  useEffect(() => {
    if (!currentTargetId) return;
    const cacheKey = `${currentTargetId}_${sortOrder}`;
    if (cacheRef.current[cacheKey]) {
      const cached = cacheRef.current[cacheKey];
      setComments(cached.comments);
      setLastDoc(cached.lastDoc);
      setHasMore(cached.hasMore);
      setLoading(false);
    } else {
      setLoading(true);
      loadInitialPage();
    }
  }, [currentTargetId, sortOrder]);

  // sortOrder에 따른 orderBy 조건 반환
  const getOrderQuery = () => {
    return sortOrder === "latest"
      ? orderBy("createdAt", "desc")
      : orderBy("좋아요", "desc");
  };

  // 첫 페이지 로드 (onSnapshot을 통한 실시간 구독)
  const loadInitialPage = () => {
    const commentsRef = collection(db, "voteResults", currentTargetId, "comments").withConverter(commentConverter);
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
          timestamp: Date.now()
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

  // 페이지네이션: 스크롤 시 단발성 getDocs()로 추가 데이터 로드
  const loadMore = async () => {
    if (!lastDoc || !hasMore || loading) return;
    setLoading(true);
    const commentsRef = collection(db, "voteResults", currentTargetId, "comments").withConverter(commentConverter);
    const q = query(commentsRef, getOrderQuery(), startAfter(lastDoc), limit(20));
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
            timestamp: Date.now()
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

  // 실시간 새 댓글 구독 (topTimestamp를 기준으로)
  useEffect(() => {
    if (!currentTargetId || !topTimestamp) return;
    if (newCommentsUnsubRef.current) {
      newCommentsUnsubRef.current();
      newCommentsUnsubRef.current = null;
    }
    const commentsRef = collection(db, "voteResults", currentTargetId, "comments").withConverter(commentConverter);
    let newCommentsQuery;
    if (sortOrder === "latest") {
      newCommentsQuery = query(
        commentsRef,
        where("createdAt", ">", topTimestamp),
        orderBy("createdAt", "asc")
      );
    } else {
      newCommentsQuery = query(
        commentsRef,
        where("createdAt", ">", topTimestamp),
        orderBy("createdAt", "asc")
      );
    }
    if (!newCommentsQuery) return;
    const unsubscribe = onSnapshot(newCommentsQuery, (snapshot) => {
      const newCommentsFromSnapshot = snapshot.docs.map((doc) => doc.data());
      if (newCommentsFromSnapshot.length > 0) {
        setComments(prev => {
          const merged = [...prev];
          newCommentsFromSnapshot.forEach(newComment => {
            if (!merged.some(existing => existing.id === newComment.id)) {
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

  // 전역 스크롤 이벤트: 페이지 하단 50px 이내 도달 시 loadMore 호출
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
    return () => window.removeEventListener("scroll", handleScroll);
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
              style={{ width: "100px", height: "100px", objectFit: "cover" }}
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
  // 로컬 상태로 comment를 관리하여 낙관적 업데이트 적용
  const [localComment, setLocalComment] = useState(comment);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);

  // 부모로부터 comment prop이 바뀌면 로컬 상태 업데이트
  useEffect(() => {
    setLocalComment(comment);
  }, [comment]);

  // 초기 liked/disliked 상태 설정
  useEffect(() => {
    if (localComment.likedBy?.includes(userUUID)) {
      setLiked(true);
      setDisliked(false);
    } else if (localComment.dislikedBy?.includes(userUUID)) {
      setLiked(false);
      setDisliked(true);
    } else {
      setLiked(false);
      setDisliked(false);
    }
  }, [localComment, userUUID]);

  const handleVote = async (type) => {
    if (!localComment.id || !userUUID) return;

    // 기존 상태 복사
    let updatedComment = { ...localComment };

    if (type === "like") {
      if (localComment.likedBy?.includes(userUUID)) {
        // 이미 응원한 경우 취소
        updatedComment["좋아요"] = (localComment["좋아요"] || 0) - 1;
        updatedComment.likedBy = localComment.likedBy.filter((uid) => uid !== userUUID);
      } else {
        // 응원 추가
        updatedComment["좋아요"] = (localComment["좋아요"] || 0) + 1;
        updatedComment.likedBy = localComment.likedBy ? [...localComment.likedBy, userUUID] : [userUUID];
        if (localComment.dislikedBy?.includes(userUUID)) {
          updatedComment["싫어요"] = (localComment["싫어요"] || 0) - 1;
          updatedComment.dislikedBy = localComment.dislikedBy.filter((uid) => uid !== userUUID);
        }
      }
    } else if (type === "dislike") {
      if (localComment.dislikedBy?.includes(userUUID)) {
        // 이미 아쉬워요 한 경우 취소
        updatedComment["싫어요"] = (localComment["싫어요"] || 0) - 1;
        updatedComment.dislikedBy = localComment.dislikedBy.filter((uid) => uid !== userUUID);
      } else {
        // 아쉬워요 추가
        updatedComment["싫어요"] = (localComment["싫어요"] || 0) + 1;
        updatedComment.dislikedBy = localComment.dislikedBy ? [...localComment.dislikedBy, userUUID] : [userUUID];
        if (localComment.likedBy?.includes(userUUID)) {
          updatedComment["좋아요"] = (localComment["좋아요"] || 0) - 1;
          updatedComment.likedBy = localComment.likedBy.filter((uid) => uid !== userUUID);
        }
      }
    }

    // 로컬 상태에 낙관적 업데이트 적용
    setLocalComment(updatedComment);
    if (type === "like") {
      setLiked(!liked);
      if (disliked) setDisliked(false);
    } else if (type === "dislike") {
      setDisliked(!disliked);
      if (liked) setLiked(false);
    }

    try {
      const commentRef = doc(db, "voteResults", currentTargetId, "comments", localComment.id);
      if (type === "like") {
        if (localComment.likedBy?.includes(userUUID)) {
          // 응원 취소
          await updateDoc(commentRef, {
            좋아요: increment(-1),
            likedBy: arrayRemove(userUUID),
          });
        } else {
          await updateDoc(commentRef, {
            좋아요: increment(1),
            싫어요: localComment.dislikedBy?.includes(userUUID) ? increment(-1) : 0,
            likedBy: arrayUnion(userUUID),
            dislikedBy: arrayRemove(userUUID),
          });
        }
      } else if (type === "dislike") {
        if (localComment.dislikedBy?.includes(userUUID)) {
          // 아쉬워요 취소
          await updateDoc(commentRef, {
            싫어요: increment(-1),
            dislikedBy: arrayRemove(userUUID),
          });
        } else {
          await updateDoc(commentRef, {
            싫어요: increment(1),
            좋아요: localComment.likedBy?.includes(userUUID) ? increment(-1) : 0,
            dislikedBy: arrayUnion(userUUID),
            likedBy: arrayRemove(userUUID),
          });
        }
      }
    } catch (error) {
      console.error("좋아요/싫어요 업데이트 중 오류 발생:", error);
      // 업데이트 실패 시 추가 동기화 로직이 필요합니다.
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
          <ThumbUp onClick={() => handleVote("like")} fill={liked ? "#B3CE1F" : "white"} />{" "}
          <span>{localComment.좋아요}</span>
          <ThumbDown onClick={() => handleVote("dislike")} fill={disliked ? "#7D6CF6" : "white"} />{" "}
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
