/**
 * remember_game2 진입점 (클라이언트/공용)
 * 1:1 온라인 게임: 로그인 → 로비(매칭) → 게임
 */

// 타입·상수·유틸 (클라이언트/공용)
export * from "./types/types";
export * from "./constants/constants";
export * from "./util/util";
export * from "./login/login";
export * from "./lobby/lobby";
export * from "./game/game";

function main(): void {
  console.log("remember_game2 (1:1 온라인 게임)");
}

main();
