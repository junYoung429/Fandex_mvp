
export const disallowedChars = [
    "﷽",
  ];

  // 특수문자들을 정규식 특수문자 이스케이프 처리하는 헬퍼 함수
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  // disallowedChars 배열을 이용해 동적 정규식 생성 (global)
  export const disallowedRegex = new RegExp(
    `[${disallowedChars.map(escapeRegex).join('')}]`,
    "g"
  );