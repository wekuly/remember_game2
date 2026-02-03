/**
 * 게임·로비·클라이언트 공용 상수
 */
export declare const GAME: {
    /** 1:1 인원 */
    readonly PLAYERS_PER_ROOM: 2;
    /** 매칭 대기 최대 시간(ms) 등 확장 가능 */
    readonly MATCH_TIMEOUT_MS: 30000;
};
export declare const LOBBY: {
    /** 대기열 이름 등 */
    readonly QUEUE_NAME: "default";
};
export declare const API: {
    /** 게임·API·Socket 연결 대상 서버 (배포: 168.107.50.13:3000, 로컬: http://localhost:3000) */
    readonly SERVER_URL: "http://168.107.50.13:3000";
};
//# sourceMappingURL=constants.d.ts.map