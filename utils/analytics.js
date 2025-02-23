import ReactGA from "react-ga4";

// GA 초기화 함수
export const initGA = () => {
  if (process.env.NODE_ENV === "production") {
    ReactGA.initialize("G-6NCQSKZ0HG"); // 여기에 측정 ID 입력
  }
};

// 페이지 이동을 추적하는 함수
export const logPageView = () => {
  if (process.env.NODE_ENV === "production") {
    ReactGA.send({ hitType: "pageview", page: window.location.pathname });
  }
};
