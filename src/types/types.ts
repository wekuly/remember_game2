/**
 * 1:1 온라인 게임 공용 타입
 * 클라이언트/서버 간 이벤트·상태 정의 시 참고
 */

/** 로그인된 사용자 (서버 세션 등) */
export interface User {
  id: string;
  name: string;
  socketId?: string;
}

/** 로비/매칭 대기 방 */
export interface LobbyRoom {
  id: string;
  players: User[];
  createdAt: number;
}

/** 1:1 게임 방 */
export interface GameRoom {
  id: string;
  player1: User;
  player2: User;
  state: GameState;
  createdAt: number;
}

/** 게임 상태 (게임별로 확장) */
export interface GameState {
  phase: "waiting" | "playing" | "finished";
  turn?: string; // 플레이어 id
  payload?: Record<string, unknown>;
}

/** Socket 이벤트명 상수화용 (서버와 동일하게 유지) */
export type SocketEvent =
  | "login"
  | "lobby:join"
  | "lobby:leave"
  | "lobby:match"
  | "game:join"
  | "game:action"
  | "game:state"
  | "game:over";
