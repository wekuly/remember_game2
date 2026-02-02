/**
 * 1:1 게임 방 모듈 (서버)
 * - 방 생성·참가·액션·상태 브로드캐스트
 * - 게임 규칙(턴, 승패)은 추후 확장
 */

import type { Server as SocketIOServer } from "socket.io";
import * as login from "../login/login";
import type { ServerUser } from "../login/login";

export interface GameRoomState {
  phase: "waiting" | "playing" | "finished";
  turn: string | null;
  payload: Record<string, unknown>;
}

export interface GameRoom {
  id: string;
  player1: ServerUser;
  player2: ServerUser;
  state: GameRoomState;
  createdAt: number;
}

const rooms = new Map<string, GameRoom>();

export function createRoom(
  roomId: string,
  player1SocketId: string,
  player2SocketId: string
): GameRoom {
  const u1 = login.getUser(player1SocketId);
  const u2 = login.getUser(player2SocketId);
  const room: GameRoom = {
    id: roomId,
    player1: u1 ?? { id: player1SocketId, name: "P1", socketId: player1SocketId },
    player2: u2 ?? { id: player2SocketId, name: "P2", socketId: player2SocketId },
    state: { phase: "waiting", turn: null, payload: {} },
    createdAt: Date.now(),
  };
  rooms.set(roomId, room);
  return room;
}

export function addPlayerToRoom(
  room: GameRoom,
  socketId: string,
  io: SocketIOServer
): void {
  const socket = io.sockets.sockets.get(socketId);
  if (!socket) return;
  socket.join(room.id);
  const playerIndex = room.player1.socketId === socketId ? 0 : 1;
  socket.emit("game:join", {
    roomId: room.id,
    playerIndex,
    state: room.state,
  });
}

export function getRoom(roomId: string): GameRoom | null {
  return rooms.get(roomId) ?? null;
}

export function dispatchAction(
  roomId: string,
  _playerId: string,
  action: string,
  payload: Record<string, unknown> | undefined,
  io: SocketIOServer
): void {
  const room = rooms.get(roomId);
  if (!room) return;
  room.state = {
    ...room.state,
    phase: "playing",
    payload: {
      ...room.state.payload,
      lastAction: action,
      lastPayload: payload ?? {},
    },
  };
  io.to(roomId).emit("game:state", { roomId, state: room.state });
}

export function endGame(
  roomId: string,
  winnerId: string | null,
  io: SocketIOServer
): void {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("game:over", { roomId, winnerId });
  rooms.delete(roomId);
}

export function onPlayerDisconnect(
  socketId: string,
  io: SocketIOServer
): void {
  for (const [rid, room] of rooms.entries()) {
    const p1 = room.player1.socketId === socketId;
    const p2 = room.player2.socketId === socketId;
    if (p1 || p2) {
      const winnerId = p1 ? room.player2.id : room.player1.id;
      endGame(rid, winnerId ?? null, io);
      break;
    }
  }
}

export { rooms };
