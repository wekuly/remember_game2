/**
 * Express API용 인메모리 저장소
 * - 방 생성/입장: apiRooms
 * - 게임 결과: gameResults (추후 DB로 교체 가능)
 */

import { generateId } from "../util/util";

export interface ApiRoomPlayer {
  id: string;
  name: string;
  joinedAt: number;
}

/** 접시 개수: 10~20, 2단위 */
export const PLATE_COUNT_MIN = 10;
export const PLATE_COUNT_MAX = 20;
export const PLATE_COUNT_STEP = 2;

export interface ApiRoom {
  id: string;
  code: string;
  player1: ApiRoomPlayer | null;
  player2: ApiRoomPlayer | null;
  /** 접시 개수 (10~20, 2단위), 방장이 방 생성 시 선택 */
  plateCount: number;
  /** 방 생성 시 랜덤 결정, 서버만 알고 게임 시작 후 클라이언트에 전달 */
  firstPlayerIndex: 0 | 1;
  /** 현재 턴 (0: 1P, 1: 2P), 추후 행동 시 서버에서 변경 */
  currentTurn: 0 | 1;
  createdAt: number;
}

export interface ApiRoomResponse {
  id: string;
  code: string;
  player1: ApiRoomPlayer | null;
  player2: ApiRoomPlayer | null;
  plateCount: number;
  firstPlayerIndex: 0 | 1;
  currentTurn: 0 | 1;
  createdAt: number;
}

export interface JoinRoomResult {
  ok: boolean;
  playerIndex?: number;
  room?: ApiRoomResponse;
  error?: string;
}

export interface GameResultRecord {
  id: string;
  roomId: string;
  winnerId: string | null;
  player1Id: string | null;
  player2Id: string | null;
  player1Name: string;
  player2Name: string;
  player1Score: number | null;
  player2Score: number | null;
  finishedAt: number;
  [key: string]: unknown;
}

export interface SaveGameResultInput {
  roomId: string;
  winnerId?: string | null;
  player1Id?: string | null;
  player2Id?: string | null;
  player1Name?: string;
  player2Name?: string;
  player1Score?: number | null;
  player2Score?: number | null;
  payload?: Record<string, unknown>;
}

export interface SaveGameResultOutput {
  ok: boolean;
  result?: GameResultRecord;
  error?: string;
}

const apiRooms = new Map<string, ApiRoom>();

/** 게임 전적 (인메모리). TODO: DB 연동 시 saveGameResult에서 DB insert 후, 조회는 getGameResults → API GET /api/games/results 등으로 제공 */
const gameResults: GameResultRecord[] = [];

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)] ?? "";
  }
  return code;
}

export function findRoomByCode(code: string): ApiRoom | null {
  const upper = String(code ?? "").toUpperCase().trim();
  if (!upper) return null;
  for (const room of apiRooms.values()) {
    if (room.code === upper) return room;
  }
  return null;
}

function toRoomResponse(room: ApiRoom): ApiRoomResponse {
  return {
    id: room.id,
    code: room.code,
    player1: room.player1,
    player2: room.player2,
    plateCount: room.plateCount,
    firstPlayerIndex: room.firstPlayerIndex,
    currentTurn: room.currentTurn,
    createdAt: room.createdAt,
  };
}

function clampPlateCount(n: number): number {
  const min = PLATE_COUNT_MIN;
  const max = PLATE_COUNT_MAX;
  const step = PLATE_COUNT_STEP;
  const clamped = Math.min(max, Math.max(min, Math.round(n)));
  const remainder = (clamped - min) % step;
  const aligned = remainder === 0 ? clamped : clamped - remainder + (remainder >= step / 2 ? step : 0);
  return Math.min(max, Math.max(min, aligned));
}

export function createRoom(plateCount?: number): { roomId: string; code: string; room: ApiRoom } {
  let code = generateRoomCode();
  while (findRoomByCode(code)) {
    code = generateRoomCode();
  }
  const roomId = generateId("room");
  const count = clampPlateCount(plateCount ?? PLATE_COUNT_MIN);
  const firstPlayerIndex: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
  const room: ApiRoom = {
    id: roomId,
    code,
    player1: null,
    player2: null,
    plateCount: count,
    firstPlayerIndex,
    currentTurn: firstPlayerIndex,
    createdAt: Date.now(),
  };
  apiRooms.set(roomId, room);
  return { roomId, code, room };
}

export function getRoomById(roomId: string): ApiRoom | null {
  return apiRooms.get(roomId) ?? null;
}

/** 현재 턴 변경 (0 ↔ 1) */
export function setCurrentTurn(roomId: string, turn: 0 | 1): boolean {
  const room = apiRooms.get(roomId);
  if (!room) return false;
  room.currentTurn = turn;
  return true;
}

/** 참가 가능한 방 목록 (player2가 비어 있는 방만, 다른 사용자에게 보이게) */
export function getJoinableRooms(): ApiRoomResponse[] {
  const list: ApiRoomResponse[] = [];
  for (const room of apiRooms.values()) {
    if (room.player2 === null) list.push(toRoomResponse(room));
  }
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export function joinRoom(
  roomId: string,
  playerName: string
): JoinRoomResult {
  const room = apiRooms.get(roomId);
  if (!room) {
    return { ok: false, error: "방을 찾을 수 없습니다." };
  }
  const name = String(playerName ?? "").trim() || "플레이어";
  if (!room.player1) {
    room.player1 = { id: generateId("p"), name, joinedAt: Date.now() };
    return { ok: true, playerIndex: 0, room: toRoomResponse(room) };
  }
  if (!room.player2) {
    room.player2 = { id: generateId("p"), name, joinedAt: Date.now() };
    return { ok: true, playerIndex: 1, room: toRoomResponse(room) };
  }
  return { ok: false, error: "방이 가득 찼습니다." };
}

export function joinRoomByCode(
  code: string,
  playerName: string
): JoinRoomResult & { room?: ApiRoomResponse } {
  const room = findRoomByCode(code);
  if (!room) {
    return { ok: false, error: "초대 코드에 해당하는 방이 없습니다." };
  }
  return joinRoom(room.id, playerName);
}

/** 방 나가기: 해당 슬롯 비우기, 둘 다 비면 방 삭제 */
export function leaveRoom(
  roomId: string,
  playerIndex: 0 | 1
): { ok: boolean; error?: string } {
  const room = apiRooms.get(roomId);
  if (!room) {
    return { ok: false, error: "방을 찾을 수 없습니다." };
  }
  if (playerIndex === 0) {
    room.player1 = null;
  } else {
    room.player2 = null;
  }
  if (room.player1 === null && room.player2 === null) {
    apiRooms.delete(roomId);
  }
  return { ok: true };
}

export function saveGameResult(data: SaveGameResultInput): SaveGameResultOutput {
  const {
    roomId,
    winnerId = null,
    player1Id = null,
    player2Id = null,
    player1Name = "",
    player2Name = "",
    player1Score = null,
    player2Score = null,
    payload = {},
  } = data ?? {};

  if (!roomId) {
    return { ok: false, error: "roomId가 필요합니다." };
  }

  const result: GameResultRecord = {
    id: generateId("result"),
    roomId,
    winnerId,
    player1Id,
    player2Id,
    player1Name,
    player2Name,
    player1Score,
    player2Score,
    finishedAt: Date.now(),
    ...payload,
  };
  gameResults.unshift(result);
  return { ok: true, result };
}

export function getGameResults(limit = 50): GameResultRecord[] {
  return gameResults.slice(0, Math.max(0, limit));
}

export { apiRooms, gameResults };
