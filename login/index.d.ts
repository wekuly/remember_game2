/**
 * 로그인 모듈 (클라이언트/공용)
 * - 타입·상수는 types, constants에서 import
 * - 실제 인증은 서버 login 모듈과 연동
 */
import type { User } from "../types";
/** 로그인 요청 파라미터 (닉네임만 쓰는 간단 버전) */
export interface LoginPayload {
    name: string;
}
/** 로그인 결과 */
export interface LoginResult {
    ok: boolean;
    user?: User;
    error?: string;
}
/** 클라이언트: 로그인 상태 저장용 (실제로는 서버 세션/토큰과 연동) */
export declare function createGuestUser(name: string, socketId: string): User;
//# sourceMappingURL=index.d.ts.map