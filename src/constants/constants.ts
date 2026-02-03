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
  /** 게임·API·Socket 연결 대상 서버 (배포: 168.107.50.13:3000, 로컬: http://localhost:3000) */
  SERVER_URL: "http://168.107.50.13:3000",
} as const;
