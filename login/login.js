"use strict";
/**
 * 로그인 모듈 (클라이언트/공용)
 * - 타입·상수는 types, constants에서 import
 * - 실제 인증은 서버 login 모듈과 연동
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGuestUser = createGuestUser;
/** 클라이언트: 로그인 상태 저장용 (실제로는 서버 세션/토큰과 연동) */
function createGuestUser(name, socketId) {
    return { id: socketId, name, socketId };
}
//# sourceMappingURL=login.js.map