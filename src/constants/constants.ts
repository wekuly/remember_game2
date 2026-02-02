/**
 * 게임·로비·클라이언트 공용 상수
 */

export const GAME = {
  /** 1:1 인원 */
  PLAYERS_PER_ROOM: 2,
  /** 매칭 대기 최대 시간(ms) 등 확장 가능 */
  MATCH_TIMEOUT_MS: 30_000,
} as const;

export const LOBBY = {
  /** 대기열 이름 등 */
  QUEUE_NAME: "default",
} as const;

export const API = {
  /** 개발 시 서버 주소 (클라이언트에서 환경 변수/설정으로 오버라이드) */
  SERVER_URL: "http://localhost:3000",
} as const;
