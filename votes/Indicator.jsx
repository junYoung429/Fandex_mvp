import React from "react";
import "./Indicator.css";

function Indicator({ total, currentIndex, onDotClick }) {
  return (
    <ul className="slick-dots">
      {Array.from({ length: total }).map((_, idx) => (
        <li
          key={idx}
          className={idx === currentIndex ? "slick-active" : ""}
          onClick={() => onDotClick(idx)}
        >
          {/* 기본 slick before 점은 CSS에서 투명화 */}
          <button />
        </li>
      ))}
    </ul>
  );
}

export default Indicator;
