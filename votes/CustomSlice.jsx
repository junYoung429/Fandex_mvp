import React, { useState, useEffect } from 'react';
import { VictoryPie, Slice } from 'victory';
import './CustomSlice.css';

// CustomSlice: 부모에서 전달받은 expandedSliceIndex와 onSliceClick을 통해
// 자신이 확대되어야 하는지 판단하고, 클릭 시 onSliceClick 호출
const CustomSlice = (props) => {
  const { index, expandedSliceIndex, onSliceClick } = props;
  const isExpanded = expandedSliceIndex === index;
  const scale = isExpanded ? 1.1 : 1;
  const transform = `translate(${props.origin.x}, ${props.origin.y}) scale(${scale})`;

  const handleClick = (e) => {
    e.stopPropagation(); // 전역 클릭 이벤트 방지
    onSliceClick(index);
  };

  return (
    <Slice
      {...props}
      style={{ ...props.style }}
      events={{ onClick: handleClick }}
      transform={transform}
    />
  );
};

function PieChart({ imageUrl, data, voteData, totalVotes, voteEffect }) {
  const chartSize = 120;
  const innerRadius = 50;
  const centerImageSize = 80;
  const initialColors = ["#7D6CF6", "#B3CE1F"];

  const [expandedSliceIndex, setExpandedSliceIndex] = useState(null);
  const [sliceColors, setSliceColors] = useState(initialColors);
  const [overlayType, setOverlayType] = useState(null);

  // 기존 FANDEX Score 계산은 그대로 두되, voteData는 별도로 사용합니다.
  const validCheer = data.find((d) => d.x === "유효_응원해요")?.y || 0;
  const validRegret = data.find((d) => d.x === "유효_아쉬워요")?.y || 0;
  const validTotal = validCheer + validRegret;
  const fandexScore = validTotal ? (validCheer / validTotal) * 100 : 0;

  const collapseState = () => {
    setExpandedSliceIndex(null);
    setSliceColors(initialColors);
    setOverlayType(null);
  };

  // 슬라이스 클릭 시 처리하는 handleSliceClick은 그대로 둡니다.
  const handleSliceClick = (clickedIndex) => {
    if (expandedSliceIndex !== null) {
      collapseState();
    } else {
      setExpandedSliceIndex(clickedIndex);
      setOverlayType("chart");
      if (clickedIndex === 0) {
        setSliceColors([initialColors[0], "#606541"]);
      } else if (clickedIndex === 1) {
        setSliceColors(["#3B3754", initialColors[1]]);
      }
    }
  };

  const handleImageClick = (e) => {
    e.stopPropagation();
    if (expandedSliceIndex !== null) {
      collapseState();
    } else {
      setOverlayType(prev => (prev === "image" ? null : "image"));
    }
  };

  useEffect(() => {
    const handleGlobalClick = () => {
      collapseState();
    };
    document.addEventListener("click", handleGlobalClick);
    return () => {
      document.removeEventListener("click", handleGlobalClick);
    };
  }, []);

  // voteEffect가 있을 때 3초 동안 효과를 적용
  useEffect(() => {
    if (voteEffect) {
      // "응원해요"는 index 1, "아쉬워요"는 index 0으로 매핑 (data 순서에 따라 조정)
      const indexToExpand = voteEffect === "응원해요" ? 1 : 0;
      setExpandedSliceIndex(indexToExpand);
      setOverlayType("chart");
      if (indexToExpand === 0) {
        setSliceColors([initialColors[0], "#606541"]);
      } else {
        setSliceColors(["#3B3754", initialColors[1]]);
      }
      const timer = setTimeout(() => {
        collapseState();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [voteEffect]);

  return (
    <div style={{ position: "relative", width: chartSize, height: chartSize }}>
      <VictoryPie
        data={data}
        dataComponent={
          <CustomSlice
            expandedSliceIndex={expandedSliceIndex}
            onSliceClick={handleSliceClick}
          />
        }
        innerRadius={innerRadius}
        width={chartSize}
        height={chartSize}
        colorScale={sliceColors}
        style={{
          parent: { position: "absolute", top: 0, left: 0 },
          labels: { display: "none" },
        }}
      />
      <img
        src={imageUrl}
        alt="Center"
        onClick={handleImageClick}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: centerImageSize,
          height: centerImageSize,
          objectFit: "cover",
          borderRadius: "50%",
          zIndex: 2,
        }}
      />
      {overlayType && (
        <div
          onClick={collapseState}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 3,
            transition: "background-color 0.3s ease",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "12px",
            textAlign: "center",
            cursor: "pointer"
          }}
        >
          {overlayType === "image" ? (
            <>
              <span className="logo-overlay">
                <span style={{ color: "#B3CE1F" }}>FAN</span>
                <span style={{ color: "#7D6CF6" }}>DEX</span>
              </span>
              <span id="fandex-score">{Math.round(fandexScore)}</span>
              <span id="total-votes">누적투표수 | {totalVotes}</span>
            </>
          ) : overlayType === "chart" ? (
            <>
              <span className="response-text">누적응답수</span>
              <span className="response-count">
                {expandedSliceIndex === 0
                  ? voteData["아쉬워요"] || 0
                  : voteData["응원해요"] || 0}
              </span>
              <span className="response-text">유효응답수</span>
              <span className="response-count">
                {expandedSliceIndex === 0
                  ? Number(voteData["유효_아쉬워요"] || 0).toFixed(1)
                  : Number(voteData["유효_응원해요"] || 0).toFixed(1)}
              </span>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default PieChart;
