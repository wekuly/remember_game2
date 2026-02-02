/**
 * remember_game2 - HTTP + Socket.IO 서버 (1:1 온라인 게임)
 *
 * Express: REST(방 생성·입장·게임 결과 저장). Socket.IO: 로그인 → 로비 → 게임 방.
 * 배포 시: PORT 환경 변수로 포트 지정.
 */

import http from "http";
import path from "path";
import express from "express";
import { Server } from "socket.io";
import * as login from "./login/login";
import * as lobby from "./lobby/lobby";
import * as game from "./game/game";
import * as store from "./store/store";
import roomsRouter from "./routes/rooms";
import gamesRouter from "./routes/games";

/** REST로 만든 방에서 소켓이 입장한 방 정보 (socketId → roomId, playerIndex) */
const socketGameRooms = new Map<string, { roomId: string; playerIndex: number }>();

/** 프로젝트 루트 (서버 실행 시 cwd 기준) */
const projectRoot = process.cwd();

const PORT = Number(process.env.PORT) || 3000;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일: 로그인/로비 등 클라이언트 (public), 클라이언트 TS 빌드 결과 (dist/client)
app.use(express.static(path.join(projectRoot, "public")));
app.use("/client", express.static(path.join(projectRoot, "dist", "client")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, message: "서버 정상" });
});

app.use("/api/rooms", roomsRouter);
app.use("/api/games", gamesRouter);

io.on("connection", (socket) => {
  const addr = socket.handshake.address;
  console.log(`[연결] ${socket.id} (${addr})`);

  socket.on("login", (data: { name?: string }) => {
    const name =
      data && typeof data.name === "string" ? data.name.trim() : "";
    const user = login.guestLogin(socket.id, name || undefined);
    socket.emit("login", { ok: true, user });
    console.log(`[로그인] ${socket.id} → ${user.name}`);
  });

  socket.on("lobby:join", () => {
    let user = login.getUser(socket.id);
    if (!user) {
      user = login.guestLogin(socket.id, undefined);
      socket.emit("login", { ok: true, user });
    }
    lobby.joinQueue(io, socket.id, user);
    console.log(`[로비] ${socket.id} 매칭 대기 중`);
  });

  socket.on("lobby:leave", () => {
    lobby.leaveQueue(socket.id);
  });

  socket.on("game:action", (data: { roomId?: string; playerId?: string; action?: string; payload?: Record<string, unknown> }) => {
    const { roomId, playerId, action, payload } = data ?? {};
    if (!roomId || !playerId || !action) return;
    game.dispatchAction(roomId, playerId, action, payload, io);
  });

  /** REST로 만든 방 입장: 같은 방의 두 클라이언트가 게임 시작 신호를 공유 */
  socket.on("game:joinRoom", (data: { roomId?: string; playerIndex?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const room = store.getRoomById(roomId);
    if (!room) return;
    socket.join(roomId);
    socketGameRooms.set(socket.id, { roomId, playerIndex });
  });

  /** 방장(playerIndex 0)만 게임 시작 요청 → 해당 방 전체에 game:start 브로드캐스트 */
  socket.on("game:start", (data: { roomId?: string }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    if (!roomId) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== 0) return;
    const room = store.getRoomById(roomId);
    if (!room || !room.player1 || !room.player2) return;
    io.to(roomId).emit("game:start", { roomId });
  });

  /** 접시 클릭: 방 전체에 브로드캐스트 (상대에게 알림) */
  socket.on("game:plateClick", (data: { roomId?: string; playerIndex?: number; plateIndex?: number; round?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    const plateIndex = typeof data?.plateIndex === "number" && data.plateIndex >= 0 ? data.plateIndex : -1;
    const round = typeof data?.round === "number" && data.round >= 1 ? data.round : -1;
    if (!roomId || playerIndex < 0 || plateIndex < 0 || round < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("game:plateClick", { roomId, playerIndex, plateIndex, round });
  });

  /** 메인 단계: 선수가 두 접시 선택 시 상대에게 알림 (correct: 두 접시 토큰 수가 같으면 true) */
  socket.on("game:mainTwoPlatesSelected", (data: { roomId?: string; playerIndex?: number; plateA?: number; plateB?: number; correct?: boolean }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    const plateA = typeof data?.plateA === "number" && data.plateA >= 0 ? data.plateA : -1;
    const plateB = typeof data?.plateB === "number" && data.plateB >= 0 ? data.plateB : -1;
    const correct = data?.correct === true;
    if (!roomId || playerIndex < 0 || plateA < 0 || plateB < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("game:mainTwoPlatesSelected", { roomId, playerIndex, plateA, plateB, correct });
  });

  /** 메인 단계: 선수가 토큰 놓을 접시 선택 시 상대에게 알림 (접시 인덱스, P1/P2 토큰 수) */
  socket.on("game:mainTokenPlaced", (data: {
    roomId?: string;
    playerIndex?: number;
    plateIndex?: number;
    countP1?: number;
    countP2?: number;
  }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    const plateIndex = typeof data?.plateIndex === "number" && data.plateIndex >= 0 ? data.plateIndex : -1;
    const countP1 = typeof data?.countP1 === "number" && data.countP1 >= 0 ? data.countP1 : 0;
    const countP2 = typeof data?.countP2 === "number" && data.countP2 >= 0 ? data.countP2 : 0;
    if (!roomId || playerIndex < 0 || plateIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("game:mainTokenPlaced", { roomId, playerIndex, plateIndex, countP1, countP2 });
  });

  /** 메인 단계: 틀렸을 때 페널티 표시·뚜껑 닫기 완료 신호 (상대가 뚜껑 닫기 동기화용) */
  socket.on("game:mainWrongAnswerDone", (data: { roomId?: string; playerIndex?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("game:mainWrongAnswerDone", { roomId, playerIndex });
  });

  /** 게임 종료: 승리(토큰 1개 남은 상태에서 정답) 또는 패배(패널티로 토큰 2배) 시 방 전체에 브로드캐스트 + 전적 기록 */
  socket.on("game:gameOver", (data: { roomId?: string; playerIndex?: number; reason?: string; winnerPlayerIndex?: number; loserPlayerIndex?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;

    const room = store.getRoomById(roomId);
    if (room) {
      const winnerIdx = data?.winnerPlayerIndex;
      const loserIdx = data?.loserPlayerIndex;
      const winnerId = winnerIdx === 0 ? room.player1?.id ?? null : winnerIdx === 1 ? room.player2?.id ?? null : null;
      const loserId = loserIdx === 0 ? room.player1?.id ?? null : loserIdx === 1 ? room.player2?.id ?? null : null;
      store.saveGameResult({
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
      // TODO: DB 저장. 현재는 store.gameResults 인메모리 배열에만 저장.
      // 추후 DB 연동 시 saveGameResult 내부에서 DB insert 후 gameResults는 캐시/조회용으로 사용.
      // 조회: store.getGameResults(limit) → API GET /api/games/results 등으로 노출 가능.
    }

    io.to(roomId).emit("game:gameOver", {
      roomId,
      reason: data?.reason ?? "end",
      winnerPlayerIndex: data?.winnerPlayerIndex,
      loserPlayerIndex: data?.loserPlayerIndex,
    });
  });

  /** 게임 종료 최종화: 클라이언트가 "잠시 후 종료됩니다" 표시 후 보냄. 방 전체에 roomClosed 알리고 방 제거 */
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
    store.leaveRoom(roomId, 0);
    store.leaveRoom(roomId, 1);
  });

  /** 메인 게임: 자기 턴에서 타이머 만료 시 시간 오버 페널티 (방 전체에 브로드캐스트) */
  socket.on("game:mainTimeOver", (data: { roomId?: string; playerIndex?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("game:mainTimeOver", { roomId, playerIndex });
  });

  /** 라운드 종료 신호: 클릭한 플레이어(현재 턴 소유자)가 애니메이션 끝난 뒤 보냄. 한 번 클릭 시 한 번 턴 전환 */
  socket.on("game:roundDone", (data: { roomId?: string; playerIndex?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    const room = store.getRoomById(roomId);
    if (!room || room.currentTurn !== playerIndex) return;
    const nextTurn: 0 | 1 = (room.currentTurn === 0 ? 1 : 0) as 0 | 1;
    store.setCurrentTurn(roomId, nextTurn);
    io.to(roomId).emit("game:turnSwitch", { roomId, currentTurn: nextTurn });
  });

  /** 나가기 버튼 등으로 의도적 퇴장 시: 상대에게 알린 뒤 store·소켓에서 방 제거 */
  socket.on("room:leave", (data: { roomId?: string; playerIndex?: number }) => {
    const roomId = typeof data?.roomId === "string" ? data.roomId.trim() : "";
    const playerIndex = data?.playerIndex === 0 || data?.playerIndex === 1 ? data.playerIndex : -1;
    if (!roomId || playerIndex < 0) return;
    const info = socketGameRooms.get(socket.id);
    if (!info || info.roomId !== roomId || info.playerIndex !== playerIndex) return;
    io.to(roomId).emit("room:playerLeft", { roomId, playerIndex });
    store.leaveRoom(roomId, playerIndex as 0 | 1);
    socket.leave(roomId);
    socketGameRooms.delete(socket.id);
  });

  socket.on("disconnect", (reason) => {
    const info = socketGameRooms.get(socket.id);
    if (info) {
      io.to(info.roomId).emit("room:playerLeft", { roomId: info.roomId, playerIndex: info.playerIndex });
      store.leaveRoom(info.roomId, info.playerIndex as 0 | 1);
      socket.leave(info.roomId);
      socketGameRooms.delete(socket.id);
    }
    lobby.leaveQueue(socket.id);
    game.onPlayerDisconnect(socket.id, io);
    login.logout(socket.id);
    console.log(`[연결 해제] ${socket.id} (${reason})`);
  });

  socket.on("error", (err: Error) => {
    console.error("[Socket.IO] 에러:", err);
  });
});

server.listen(PORT, () => {
  console.log(`서버: http://localhost:${PORT}`);
  console.log(`Socket.IO: http://localhost:${PORT} (로그인 → 로비 → 게임)`);
});

server.on("error", (err: Error) => {
  console.error("서버 에러:", err);
  process.exitCode = 1;
});
