import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 开发期:Vite 跑在 5173,后端在 8000(通过 API base 直连)。
// 生产期:npm run build 产出 dist/,由后端在同一源下托管。
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: 'dist' },
})
