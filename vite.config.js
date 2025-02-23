import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',  // ✅ 추가 (Firebase에서 정적 파일을 찾기 쉽게 설정)
  build: {
    outDir: 'dist', // ✅ Vite가 빌드 결과를 dist에 생성
  }

})
