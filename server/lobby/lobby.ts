/**
 * 로비/매칭 모듈 (서버)
 * - 1:1 매칭 큐: 대기 중인 소켓을 두 명씩 묶어서 게임 방 생성
 */

import type { Server as SocketIOServer } from "socket.io";
import { generateId } from "../util/util";
import { createRoom, addPlayerToRoom } from "../game/game";
import type { ServerUser } from "../login/login";

const queue: string[] = [];

export function joinQueue(
  io: SocketIOServer,
  socketId: string,
  user: ServerUser
): void {
  if (queue.includes(socketId)) return;
  queue.push(socketId);

  if (queue.length >= 2) {
    const id1 = queue.shift();
    const id2 = queue.shift();
    if (!id1 || !id2) return;
    const roomId = generateId("room");
    const room = createRoom(roomId, id1, id2);
    addPlayerToRoom(room, id1, io);
    addPlayerToRoom(room, id2, io);

    io.to(id1).emit("lobby:match", { roomId, room });
    io.to(id2).emit("lobby:match", { roomId, room });
  }
}

export function leaveQueue(socketId: string): void {
  const i = queue.indexOf(socketId);
  if (i !== -1) queue.splice(i, 1);
}

export { queue };
