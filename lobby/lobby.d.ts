/**
 * 로비 모듈 (클라이언트/공용)
 * - 매칭 요청·취소·매칭 완료 이벤트 타입
 * - 실제 큐·매칭 로직은 서버 lobby 모듈
 */
import type { User, GameRoom } from "../types/types";
export interface LobbyJoinPayload {
    user: User;
}
export interface LobbyMatchPayload {
    roomId: string;
    room: GameRoom;
}
export interface LobbyLeavePayload {
    userId: string;
}
//# sourceMappingURL=lobby.d.ts.map