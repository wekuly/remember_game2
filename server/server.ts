/**
 * remember_game2 - HTTP + Socket.IO 서버 (1:1 온라인 게임)
 * server.js 하나만 배포해도 동작하도록 의존 모듈을 이 파일에 인라인함.
 * 배포 시: PORT 환경 변수로 포트 지정.
 */

import http from "http";
import path from "path";
import fs from "fs";
import express from "express";
import { Server } from "socket.io";

// ----- 인라인: util -----
function generateId(prefix = ""): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 9);
  return prefix ? `${prefix}_${t}${r}` : `${t}${r}`;
}

// ----- 인라인: login (소켓 게스트 로그인) -----
interface ServerUser {
  id: string;
  name: string;
  socketId: string;
}
const sessions = new Map<string, ServerUser>();
function guestLogin(socketId: string, name?: string): ServerUser {
  const user: ServerUser = {
    id: socketId,
    name: name ?? `Guest_${generateId().slice(0, 6)}`,
    socketId,
  };
  sessions.set(socketId, user);
  return user;
}
function getUser(socketId: string): ServerUser | null {
  return sessions.get(socketId) ?? null;
}
function logout(socketId: string): void {
  sessions.delete(socketId);
}

// ----- 인라인: store (방·전적) -----
const PLATE_COUNT_MIN = 10;
const PLATE_COUNT_MAX = 20;
const PLATE_COUNT_STEP = 2;

interface ApiRoomPlayer {
  id: string;
  name: string;
  joinedAt: number;
}

interface ApiRoom {
  id: string;
  code: string;
  player1: ApiRoomPlayer | null;
  player2: ApiRoomPlayer | null;
  plateCount: number;
  firstPlayerIndex: 0 | 1;
  currentTurn: 0 | 1;
  createdAt: number;
}

interface GameResultRecord {
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

const apiRooms = new Map<string, ApiRoom>();
const gameResults: GameResultRecord[] = [];

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)] ?? "";
  }
  return code;
}

function findRoomByCode(code: string): ApiRoom | null {
  const upper = String(code ?? "").toUpperCase().trim();
  if (!upper) return null;
  for (const room of apiRooms.values()) {
    if (room.code === upper) return room;
  }
  return null;
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

function createRoom(plateCount?: number): { roomId: string; code: string; room: ApiRoom } {
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

function getRoomById(roomId: string): ApiRoom | null {
  return apiRooms.get(roomId) ?? null;
}

function setCurrentTurn(roomId: string, turn: 0 | 1): boolean {
  const room = apiRooms.get(roomId);
  if (!room) return false;
  room.currentTurn = turn;
  return true;
}

function getJoinableRooms(): ApiRoom[] {
  const list: ApiRoom[] = [];
  for (const room of apiRooms.values()) {
    if (room.player2 === null) list.push(room);
  }
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

function joinRoom(roomId: string, playerName: string): { ok: boolean; playerIndex?: number; room?: ApiRoom; error?: string } {
  const room = apiRooms.get(roomId);
  if (!room) return { ok: false, error: "방을 찾을 수 없습니다." };
  const name = String(playerName ?? "").trim() || "플레이어";
  if (!room.player1) {
    room.player1 = { id: generateId("p"), name, joinedAt: Date.now() };
    return { ok: true, playerIndex: 0, room };
  }
  if (!room.player2) {
    room.player2 = { id: generateId("p"), name, joinedAt: Date.now() };
    return { ok: true, playerIndex: 1, room };
  }
  return { ok: false, error: "방이 가득 찼습니다." };
}

function joinRoomByCode(code: string, playerName: string): { ok: boolean; playerIndex?: number; room?: ApiRoom; roomId?: string; error?: string } {
  const room = findRoomByCode(code);
  if (!room) return { ok: false, error: "초대 코드에 해당하는 방이 없습니다." };
  const result = joinRoom(room.id, playerName);
  if (!result.ok) return result;
  return { ...result, roomId: room.id };
}

function leaveRoom(roomId: string, playerIndex: 0 | 1): { ok: boolean; error?: string } {
  const room = apiRooms.get(roomId);
  if (!room) return { ok: false, error: "방을 찾을 수 없습니다." };
  if (playerIndex === 0) room.player1 = null;
  else room.player2 = null;
  if (room.player1 === null && room.player2 === null) {
    apiRooms.delete(roomId);
  }
  return { ok: true };
}

function saveGameResult(data: {
  roomId: string;
  winnerId?: string | null;
  player1Id?: string | null;
  player2Id?: string | null;
  player1Name?: string;
  player2Name?: string;
  player1Score?: number | null;
  player2Score?: number | null;
  payload?: Record<string, unknown>;
}): { ok: boolean; result?: GameResultRecord; error?: string } {
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
  if (!roomId) return { ok: false, error: "roomId가 필요합니다." };
  const result: GameResultRecord = {
    id: generateId("result"),
    roomId,
    winnerId: winnerId ?? null,
    player1Id: player1Id ?? null,
    player2Id: player2Id ?? null,
    player1Name: player1Name ?? "",
    player2Name: player2Name ?? "",
    player1Score: player1Score ?? null,
    player2Score: player2Score ?? null,
    finishedAt: Date.now(),
    ...payload,
  };
  gameResults.unshift(result);
  return { ok: true, result };
}

function getGameResults(limit = 50): GameResultRecord[] {
  return gameResults.slice(0, Math.max(0, limit));
}

// ----- 게임 로그 (시간 + 핵심 이벤트만) -----
interface GameLogEntry {
  at: string;
  msg: string;
}
const gameLog: GameLogEntry[] = [];
const GAME_LOG_MAX = 500;

function gameLogWrite(msg: string): void {
  const at = new Date().toISOString();
  gameLog.push({ at, msg });
  if (gameLog.length > GAME_LOG_MAX) gameLog.shift();
  console.log(`[LOG] ${at} ${msg}`);
}

// ----- 인라인: lobby (매칭 큐만 유지, 방 생성 없음 - REST 방 사용) -----
const lobbyQueue: string[] = [];
function joinQueue(_io: unknown, socketId: string, _user: ServerUser): void {
  if (lobbyQueue.includes(socketId)) return;
  lobbyQueue.push(socketId);
}
function leaveQueue(socketId: string): void {
  const i = lobbyQueue.indexOf(socketId);
  if (i !== -1) lobbyQueue.splice(i, 1);
}

// ----- 서버 설정 -----
const socketGameRooms = new Map<string, { roomId: string; playerIndex: number }>();
const projectRoot = process.cwd();
const PORT = Number(process.env.PORT) || 3000;

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS: 다른 출처(포트/도메인)에서 API·Socket 접근 허용
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (_req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// 요청/응답 확인용 로그 (간단히)
app.use((req, _res, next) => {
  const start = Date.now();
  _res.on("finish", () => {
    // console.log(`[HTTP] ${req.method} ${req.path} → ${_res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// 정적 파일: server.js 단일 배포 시 폴더가 없을 수 있으므로 존재할 때만 마운트
const publicDir = path.join(projectRoot, "public");
const clientDir = path.join(projectRoot, "dist", "client");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}
if (fs.existsSync(clientDir)) {
  app.use("/client", express.static(clientDir));
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, message: "서버 정상" });
});

// ----- 인라인: /api/rooms -----
app.get("/api/rooms", (_req, res) => {
  res.json({ ok: true, rooms: getJoinableRooms() });
});

app.post("/api/rooms", (req, res) => {
  const body = req.body as { plateCount?: number; creatorName?: string };
  const plateCount = body?.plateCount;
  const creatorName = typeof body?.creatorName === "string" ? body.creatorName.trim() : "";
  const { roomId, code, room } = createRoom(plateCount);
  if (creatorName) {
    gameLogWrite(`${creatorName} 방 만들었다 (code=${code})`);
  } else {
    gameLogWrite(`방 생성 (code=${code})`);
  }
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

app.get("/api/rooms/by-code/:code", (req, res) => {
  const room = findRoomByCode(req.params.code ?? "");
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

app.post("/api/rooms/join", (req, res) => {
  const { code, playerName } = (req.body as { code?: string; playerName?: string }) ?? {};
  const result = joinRoomByCode(code ?? "", playerName ?? "");
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  const name = (playerName ?? "").trim() || "플레이어";
  const nth = result.playerIndex === 0 ? "1번" : "2번";
  const codeStr = result.room?.code ?? code ?? "";
  gameLogWrite(`${name} 방 들어갔다 (${nth}, code=${codeStr})`);
  res.json({
    ok: true,
    roomId: result.room?.id,
    playerIndex: result.playerIndex,
    room: result.room,
  });
});

app.get("/api/rooms/:roomId", (req, res) => {
  const room = getRoomById(req.params.roomId ?? "");
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

app.post("/api/rooms/:roomId/join", (req, res) => {
  const roomId = req.params.roomId ?? "";
  const playerName = (req.body as { playerName?: string })?.playerName;
  const result = joinRoom(roomId, playerName ?? "");
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  const name = (playerName ?? "").trim() || "플레이어";
  const room = getRoomById(roomId);
  const code = room?.code ?? roomId;
  const nth = result.playerIndex === 0 ? "1번" : "2번";
  gameLogWrite(`${name} 방 들어갔다 (${nth}, code=${code})`);
  res.json({ ok: true, playerIndex: result.playerIndex, room: result.room });
});

app.post("/api/rooms/:roomId/leave", (req, res) => {
  const roomId = req.params.roomId ?? "";
  const playerIndex = (req.body as { playerIndex?: number })?.playerIndex;
  if (playerIndex !== 0 && playerIndex !== 1) {
    return res.status(400).json({ ok: false, error: "playerIndex는 0 또는 1이어야 합니다." });
  }
  const result = leaveRoom(roomId, playerIndex as 0 | 1);
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  res.json({ ok: true });
});

// ----- 인라인: /api/games -----
app.post("/api/games/result", (req, res) => {
  const body = (req.body as Record<string, unknown>) ?? {};
  const result = saveGameResult({
    roomId: body.roomId as string,
    winnerId: (body.winnerId as string | null) ?? null,
    player1Id: (body.player1Id as string | null) ?? null,
    player2Id: (body.player2Id as string | null) ?? null,
    player1Name: (body.player1Name as string) ?? "",
    player2Name: (body.player2Name as string) ?? "",
    player1Score: (body.player1Score as number | null) ?? null,
    player2Score: (body.player2Score as number | null) ?? null,
    payload: (body.payload as Record<string, unknown>) ?? {},
  });
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  res.status(201).json({ ok: true, result: result.result });
});

app.get("/api/games/result", (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
  const results = getGameResults(limit);
  res.json({ ok: true, results, count: results.length });
});

/** 게임 로그 조회 (최신순, ?limit=100) */
app.get("/api/games/log", (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
  const logs = gameLog.slice(-limit).reverse();
  res.json({ ok: true, logs, count: logs.length });
});

// ----- Socket.IO -----
io.on("connection", (socket) => {
  console.log(`[연결] ${socket.id} (${socket.handshake.address})`);

  socket.on("login", (data: { name?: string }) => {
    const name = data && typeof data.name === "string" ? data.name.trim() : "";
    const user = guestLogin(socket.id, name || undefined);
    socket.emit("login", { ok: true, user });
    console.log(`[로그인] ${socket.id} → ${user.name}`);
  });

  socket.on("lobby:join", () => {
    let user = getUser(socket.id);
    if (!user) {
      user = guestLogin(socket.id, undefined);
      socket.emit("login", { ok: true, user });
    }
    joinQueue(io, socket.id, user);
    // console.log(`[로비] ${user.name} 매칭 대기 중`);
  });

  socket.on("lobby:leave", () => {
    leaveQueue(socket.id);
    console.log(`[Socket] ${socket.id} lobby:leave`);
  });

  socket.on("game:joinRoom", (data: { roomId?: string; playerIndex?: number; playerName?: string }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const room = getRoomById(roomId);
    if (!room) return;
    const playerName = typeof data?.playerName === "string" ? data.playerName.trim() : "";
    if (playerName && room) {
      if (playerIndex === 0 && room.player1) room.player1.name = playerName;
      else if (playerIndex === 1 && room.player2) room.player2.name = playerName;
    }
    socket.join(roomId);
    socketGameRooms.set(socket.id, { roomId, playerIndex });
    console.log(`[Socket] ${socket.id} game:joinRoom roomId=${roomId} playerIndex=${playerIndex}`);
  });

  socket.on("game:start", (data: { roomId?: string }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    if (!roomId) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== 0) return;
    const room = getRoomById(roomId);
    if (!room || !room.player1 || !room.player2) return;
    io.to(roomId).emit("game:start", { roomId });
    const p1 = room.player1?.name ?? "1P";
    const p2 = room.player2?.name ?? "2P";
    gameLogWrite(`게임 시작 (${p1} vs ${p2}, code=${room.code})`);
  });

  socket.on("game:plateClick", (data: { roomId?: string; playerIndex?: number; plateIndex?: number; round?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    const plateIndex = typeof data?.plateIndex === "number" && data.plateIndex >= 0 ? data.plateIndex : -1;
    const round = typeof data?.round === "number" && data.round >= 1 ? data.round : -1;
    if (!roomId || playerIndex < 0 || plateIndex < 0 || round < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("game:plateClick", { roomId, playerIndex, plateIndex, round });
    console.log(`[Socket] ${socket.id} game:plateClick roomId=${roomId} plate=${plateIndex}`);
  });

  socket.on("game:mainTwoPlatesSelected", (data: { roomId?: string; playerIndex?: number; plateA?: number; plateB?: number; correct?: boolean }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    const plateA = typeof data?.plateA === "number" && data.plateA >= 0 ? data.plateA : -1;
    const plateB = typeof data?.plateB === "number" && data.plateB >= 0 ? data.plateB : -1;
    if (!roomId || playerIndex < 0 || plateA < 0 || plateB < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("game:mainTwoPlatesSelected", { roomId, playerIndex, plateA, plateB, correct: data?.correct === true });
    const room = getRoomById(roomId);
    const who = room && playerIndex === 0 ? room.player1?.name : room?.player2?.name;
    const name = (who ?? "").trim() || (playerIndex === 0 ? "1P" : "2P");
    const result = data?.correct === true ? "맞췄다" : "틀렸다";
    gameLogWrite(`${name} 접시 ${plateA + 1},${plateB + 1} 골랐다 → ${result}`);
  });

  socket.on("game:mainTokenPlaced", (data: { roomId?: string; playerIndex?: number; plateIndex?: number; countP1?: number; countP2?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    const plateIndex = typeof data?.plateIndex === "number" && data.plateIndex >= 0 ? data.plateIndex : -1;
    const countP1 = typeof data?.countP1 === "number" && data.countP1 >= 0 ? data.countP1 : 0;
    const countP2 = typeof data?.countP2 === "number" && data.countP2 >= 0 ? data.countP2 : 0;
    if (!roomId || playerIndex < 0 || plateIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("game:mainTokenPlaced", { roomId, playerIndex, plateIndex, countP1, countP2 });
    console.log(`[Socket] ${socket.id} game:mainTokenPlaced roomId=${roomId} plate=${plateIndex}`);
  });

  socket.on("game:mainWrongAnswerDone", (data: { roomId?: string; playerIndex?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("game:mainWrongAnswerDone", { roomId, playerIndex });
    console.log(`[Socket] ${socket.id} game:mainWrongAnswerDone roomId=${roomId}`);
  });

  socket.on("game:gameOver", (data: { roomId?: string; playerIndex?: number; reason?: string; winnerPlayerIndex?: number; loserPlayerIndex?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;

    const room = getRoomById(roomId);
    if (room) {
      const winnerIdx = data?.winnerPlayerIndex;
      const loserIdx = data?.loserPlayerIndex;
      const winnerId = winnerIdx === 0 ? room.player1?.id ?? null : winnerIdx === 1 ? room.player2?.id ?? null : null;
      const loserId = loserIdx === 0 ? room.player1?.id ?? null : loserIdx === 1 ? room.player2?.id ?? null : null;
      saveGameResult({
        roomId,
        winnerId: winnerId ?? undefined,
        player1Id: room.player1?.id ?? null,
        player2Id: room.player2?.id ?? null,
        player1Name: room.player1?.name ?? "",
        player2Name: room.player2?.name ?? "",
        player1Score: null,
        player2Score: null,
        payload: { reason: data?.reason ?? "end", winnerPlayerIndex: winnerIdx, loserPlayerIndex: loserIdx },
      });
    }

    io.to(roomId).emit("game:gameOver", {
      roomId,
      reason: data?.reason ?? "end",
      winnerPlayerIndex: data?.winnerPlayerIndex,
      loserPlayerIndex: data?.loserPlayerIndex,
    });
    const roomForLog = getRoomById(roomId);
    const winnerIdx = data?.winnerPlayerIndex;
    const loserIdx = data?.loserPlayerIndex;
    const winnerName = winnerIdx === 0 ? roomForLog?.player1?.name : winnerIdx === 1 ? roomForLog?.player2?.name : null;
    const loserName = loserIdx === 0 ? roomForLog?.player1?.name : loserIdx === 1 ? roomForLog?.player2?.name : null;
    if (winnerName) gameLogWrite(`${winnerName} 이겼다`);
    if (loserName) gameLogWrite(`${loserName} 졌다`);
  });

  socket.on("game:gameEndFinalize", (data: { roomId?: string }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    if (!roomId) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId) return;

    io.to(roomId).emit("game:roomClosed", { roomId });
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const sid of roomSockets) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.leave(roomId);
          socketGameRooms.delete(sid);
        }
      }
    }
    leaveRoom(roomId, 0);
    leaveRoom(roomId, 1);
    console.log(`[Socket] ${socket.id} game:gameEndFinalize roomId=${roomId}`);
  });

  socket.on("game:mainTimeOver", (data: { roomId?: string; playerIndex?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("game:mainTimeOver", { roomId, playerIndex });
    console.log(`[Socket] ${socket.id} game:mainTimeOver roomId=${roomId}`);
  });

  socket.on("game:roundDone", (data: { roomId?: string; playerIndex?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    const room = getRoomById(roomId);
    if (!room || room.currentTurn !== playerIndex) return;
    const nextTurn: 0 | 1 = room.currentTurn === 0 ? 1 : 0;
    setCurrentTurn(roomId, nextTurn);
    io.to(roomId).emit("game:turnSwitch", { roomId, currentTurn: nextTurn });
    console.log(`[Socket] ${socket.id} game:roundDone roomId=${roomId} nextTurn=${nextTurn}`);
  });

  socket.on("room:leave", (data: { roomId?: string; playerIndex?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("room:playerLeft", { roomId, playerIndex });
    leaveRoom(roomId, playerIndex as 0 | 1);
    socket.leave(roomId);
    socketGameRooms.delete(socket.id);
    console.log(`[Socket] ${socket.id} room:leave roomId=${roomId}`);
  });

  socket.on("disconnect", (reason) => {
    const info = socketGameRooms.get(socket.id);
    if (info) {
      io.to(info.roomId).emit("room:playerLeft", { roomId: info.roomId, playerIndex: info.playerIndex });
      leaveRoom(info.roomId, info.playerIndex as 0 | 1);
      socket.leave(info.roomId);
      socketGameRooms.delete(socket.id);
    }
    leaveQueue(socket.id);
    logout(socket.id);
    console.log(`[연결 해제] ${socket.id} (${reason})`);
  });

  socket.on("error", (err: Error) => {
    console.error("[Socket.IO] 에러:", err);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`서버: http://168.107.50.13:${PORT}`);
  console.log(`Socket.IO: http://168.107.50.13:${PORT} (Remember_game_server)`);
});

httpServer.on("error", (err: Error) => {
  console.error("서버 에러:", err);
  process.exitCode = 1;
});
