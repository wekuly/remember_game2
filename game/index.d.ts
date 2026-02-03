/**
 * 게임 모듈 (클라이언트/공용)
 * - 게임 방 참가·액션·상태 동기화 타입
 * - 실제 룸·턴 로직은 서버 game 모듈
 */
import type { GameState } from "../types";
export interface GameJoinPayload {
    roomId: string;
    playerIndex: 0 | 1;
    state: GameState;
}
export interface GameActionPayload {
    roomId: string;
    playerId: string;
    action: string;
    payload?: Record<string, unknown>;
}
export interface GameStatePayload {
    roomId: string;
    state: GameState;
}
export interface GameOverPayload {
    roomId: string;
    winnerId: string | null;
}
//# sourceMappingURL=index.d.ts.map