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
    /** 개발 시 서버 주소 (클라이언트에서 환경 변수/설정으로 오버라이드) */
    readonly SERVER_URL: "http://localhost:3000";
};
//# sourceMappingURL=index.d.ts.map