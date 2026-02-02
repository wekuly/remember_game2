/**
 * 로그인/세션 모듈 (서버)
 * - 소켓 연결 시 닉네임으로 게스트 로그인
 * - 추후 JWT·DB 연동 시 이곳 확장
 */

import { generateId } from "../util/util";

export interface ServerUser {
  id: string;
  name: string;
  socketId: string;
}

/** socketId → User (메모리 세션, 재시작 시 초기화) */
const sessions = new Map<string, ServerUser>();

/** 게스트 로그인: 이름만 받아서 User 생성 후 세션에 저장 */
export function guestLogin(socketId: string, name?: string): ServerUser {
  const user: ServerUser = {
    id: socketId,
    name: name ?? `Guest_${generateId().slice(0, 6)}`,
    socketId,
  };
  sessions.set(socketId, user);
  return user;
}

/** socketId로 유저 조회 */
export function getUser(socketId: string): ServerUser | null {
  return sessions.get(socketId) ?? null;
}

/** 로그아웃 (연결 끊김 시 호출) */
export function logout(socketId: string): void {
  sessions.delete(socketId);
}

export { sessions };
