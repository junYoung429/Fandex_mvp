import React, { useEffect, useState, useRef } from "react";
import Slider from "react-slick";
import { onSnapshot, doc } from "firebase/firestore";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import "./CenterScroll.css";
import { db } from "../src/firebase-config"; 
import { RightArrow, LeftArrow } from "../components/Icons";
import Indicator from "./Indicator";
import { STATIC_TARGETS } from "../utils/targets";
import { VictoryPie } from "victory";
import PieChart from "./CustomSlice";

function CenterMode({ currentTargetId, setCurrentTargetId, voteEffect }) {
  // STATIC_TARGETS를 초기 데이터로 사용 (voteResults 필드는 빈 객체)
  const [items, setItems] = useState(
    STATIC_TARGETS.map((target) => ({ ...target, 유효_응원해요: 0, 유효_아쉬워요: 0 }))
  );
  // client side 캐싱: 각 target의 최신 voteResults 데이터를 저장하는 객체
  const [voteResultsCache, setVoteResultsCache] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const sliderRef = useRef(null);

  // 각 타겟의 voteResults 문서를 onSnapshot으로 구독하여 실시간 업데이트하고 캐싱
  useEffect(() => {
    // STATIC_TARGETS의 각 target에 대해 한 번씩 구독 (컴포넌트 마운트 시)
    const unsubscribers = STATIC_TARGETS.map((target) => {
      const docRef = doc(db, "voteResults", target.id);
      return onSnapshot(
        docRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const updatedData = docSnap.data();
            // 캐시에 업데이트
            setVoteResultsCache((prevCache) => ({
              ...prevCache,
              [target.id]: updatedData,
            }));
            // items 배열 업데이트: 캐시된 데이터가 있다면 target 정보를 덮어씌움
            setItems((prevItems) =>
              prevItems.map((item) =>
                item.id === target.id ? { ...item, ...updatedData } : item
              )
            );
          }
        },
        (error) => {
          console.error(`Error subscribing to target ${target.id}:`, error);
        }
      );
    });
    // 컴포넌트 언마운트 시 구독 해제
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  const settings = {
    className: "center",
    centerMode: true,
    infinite: true,
    centerPadding: "80px",
    slidesToShow: 1,
    speed: 500,
    arrows: true,
    nextArrow: <RightArrow />,
    prevArrow: <LeftArrow />,
    afterChange: (index) => {
      const currentId = items[index]?.id;
      if (currentId) {
        setCurrentTargetId(currentId);
        setCurrentIndex(index);
      }
    },
    accessibility: false, // 🔹 추가 (Slick이 포커스 자동 할당하는 문제 해결)

  };

  // 초기 center 요소의 id 설정 (선택사항)
  useEffect(() => {
    if (items.length > 0) {
      setTimeout(() => {
        const centerSlide = document.querySelector('.slick-center .circle');
        if (centerSlide) {
          const currentId = centerSlide.getAttribute("data-id");
          if (currentId) {
            setCurrentTargetId(currentId);
          }
        }
      }, 100);
    }
  }, [items, setCurrentTargetId]);

  return (
    <div className="slider-viewport">
      <div className="left-gradient"></div>
      <div className="right-gradient"></div>
      <Indicator total={items.length} currentIndex={currentIndex} />
      <Slider ref={sliderRef} {...settings}>
        {items.map((item) => (
           <div key={item.id} style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
            {/* 각 circle에 data-id 속성 추가 */}
            <div className="circle" data-id={item.id}>
              <PieChart
                imageUrl={item.imageUrl} 
                data={[
                  { x: "유효_아쉬워요", y: item.유효_아쉬워요 || 0 },
                  { x: "유효_응원해요", y: item.유효_응원해요 || 0 },
                ]}
                voteData={item}  // item 전체를 전달
                totalVotes={(item["응원해요"] || 0) + (item["아쉬워요"] || 0)}
                voteEffect={item.id === currentTargetId ? voteEffect : null}
              />
            </div> 
          </div>
        ))}
      </Slider>
    </div>
  );
}

export default CenterMode;
