/**
 * Express 라우터: 방 생성, 방 입장
 * - POST /api/rooms          → 방 생성 (roomId, code 반환)
 * - GET  /api/rooms/:roomId  → 방 정보 조회
 * - GET  /api/rooms/by-code/:code → 코드로 방 조회
 * - POST /api/rooms/:roomId/join  → 방 입장 (playerName)
 * - POST /api/rooms/join          → 코드로 방 입장 (code, playerName)
 */

import { Router, Request, Response } from "express";
import * as store from "../store/store";

const router = Router();

/** 참가 가능한 방 목록 (다른 사용자에게 보이는 목록) - :roomId보다 먼저 정의 */
router.get("/", (_req: Request, res: Response) => {
  const rooms = store.getJoinableRooms();
  res.json({ ok: true, rooms });
});

/** 방 생성 (body: { plateCount?: number } — 10~20, 2단위) */
router.post("/", (req: Request, res: Response) => {
  const plateCount = (req.body as { plateCount?: number })?.plateCount;
  const { roomId, code, room } = store.createRoom(plateCount);
  res.status(201).json({
    ok: true,
    roomId,
    code,
    room: {
      id: room.id,
      code: room.code,
      player1: room.player1,
      player2: room.player2,
      plateCount: room.plateCount,
      firstPlayerIndex: room.firstPlayerIndex,
      currentTurn: room.currentTurn,
      createdAt: room.createdAt,
    },
  });
});

/** 코드로 방 조회 (GET /api/rooms/by-code/ABC123) - :roomId보다 먼저 정의 */
router.get("/by-code/:code", (req: Request, res: Response) => {
  const room = store.findRoomByCode(req.params.code ?? "");
  if (!room) {
    return res.status(404).json({ ok: false, error: "방을 찾을 수 없습니다." });
  }
  res.json({
    ok: true,
    room: {
      id: room.id,
      code: room.code,
      player1: room.player1,
      player2: room.player2,
      plateCount: room.plateCount,
      firstPlayerIndex: room.firstPlayerIndex,
      currentTurn: room.currentTurn,
      createdAt: room.createdAt,
    },
  });
});

/** 코드로 방 입장 (POST /api/rooms/join, body: { code, playerName }) */
router.post("/join", (req: Request, res: Response) => {
  const { code, playerName } = (req.body as { code?: string; playerName?: string }) ?? {};
  const result = store.joinRoomByCode(code ?? "", playerName ?? "");
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  res.json({
    ok: true,
    roomId: result.room?.id,
    playerIndex: result.playerIndex,
    room: result.room,
  });
});

/** roomId로 방 정보 조회 */
router.get("/:roomId", (req: Request, res: Response) => {
  const room = store.getRoomById(req.params.roomId ?? "");
  if (!room) {
    return res.status(404).json({ ok: false, error: "방을 찾을 수 없습니다." });
  }
  res.json({
    ok: true,
    room: {
      id: room.id,
      code: room.code,
      player1: room.player1,
      player2: room.player2,
      plateCount: room.plateCount,
      firstPlayerIndex: room.firstPlayerIndex,
      currentTurn: room.currentTurn,
      createdAt: room.createdAt,
    },
  });
});

/** roomId로 방 입장 */
router.post("/:roomId/join", (req: Request, res: Response) => {
  const roomId = req.params.roomId ?? "";
  const playerName = (req.body as { playerName?: string })?.playerName;
  const result = store.joinRoom(roomId, playerName ?? "");
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  res.json({
    ok: true,
    playerIndex: result.playerIndex,
    room: result.room,
  });
});

/** roomId로 방 나가기 (body: { playerIndex: 0 | 1 }) */
router.post("/:roomId/leave", (req: Request, res: Response) => {
  const roomId = req.params.roomId ?? "";
  const playerIndex = (req.body as { playerIndex?: number })?.playerIndex;
  if (playerIndex !== 0 && playerIndex !== 1) {
    return res.status(400).json({ ok: false, error: "playerIndex는 0 또는 1이어야 합니다." });
  }
  const result = store.leaveRoom(roomId, playerIndex as 0 | 1);
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  res.json({ ok: true });
});

export default router;
