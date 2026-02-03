import { defineConfig } from "vite";

/**
 * GitHub Pages: 저장소 이름이 다르면 base를 '/저장소이름/' 으로 변경하세요.
 * 예: https://username.github.io/remember_game2/ → base: '/remember_game2/'
 */
const REPO_NAME = "remember_game2";

export default defineConfig({
  base: `/${REPO_NAME}/`,
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
  },
  server: {
    port: 5173,
  },
});
