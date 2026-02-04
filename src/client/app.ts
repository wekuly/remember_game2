/**
 * 단일 페이지 앱: index.html 하나에서 화면을 지웠다가 다시 그리는 방식
 * 뷰: 로그인 → 로비 → 게임 방 (홈 버튼 없음)
 * Socket.IO 클라이언트는 index.html에서 CDN으로 로드 (window.io)
 */

/** index.html CDN으로 로드된 Socket.IO 클라이언트 (스크립트 로드 순서상 app.js보다 먼저 로드됨) */
function getIo(): (url: string, opts?: { path?: string; transports?: string[] }) => SocketLike {
  const w = window as Window & { io?: (url: string, opts?: object) => SocketLike };
  if (!w.io) throw new Error("Socket.IO not loaded. Check index.html script order.");
  return w.io;
}

interface SocketLike {
  emit(event: string, ...args: unknown[]): void;
  on(event: string, fn: (data?: unknown) => void): void;
  off(event: string, fn?: (data: unknown) => void): void;
}

/** 접속하자마자 Socket.IO 연결. 한 번만 생성하고, connect 시 저장된 닉네임으로 로그인 전송 */
function ensureSocketConnected(): void {
  if (gameSocket) return;
  gameSocket = getIo()(API_BASE, { path: "/socket.io", transports: ["websocket", "polling"] });
  gameSocket.on("connect", () => {
    const name = getStoredUser()?.name ?? "";
    gameSocket?.emit("login", { name: name || undefined });
  });
}

/** API·Socket 연결 서버. 무조건 아래 주소 사용 (배포 서버) */
// 로컬/동일 출처 사용 시: const API_BASE = window.location.origin;
// const API_BASE = "http://168.107.50.13:3000";
const API_BASE = "https://remembergame2-production.up.railway.app";
const STORAGE_KEY_USER = "remember_game2_user";
const STORAGE_KEY_ROOM = "remember_game2_room";
const ROOM_LIST_INTERVAL_MS = 3000;
const ROOM_POLL_INTERVAL_MS = 2000;

/** 토큰 놓기(round) 단계 타이머(초) */
const TIMER_DEFAULT_SECONDS = 30;
/** 확인할 두 접시 선택(메인 게임) 단계 타이머(초) */
const MAIN_GAME_TIMER_SECONDS = 60;
/** 게임 중앙 설명 문구, 개발자 조정용 */
const GAME_CENTER_MESSAGE = "";
/** 접시 개수 기본값 (방 정보 없을 때) */
const PLATE_COUNT_DEFAULT = 10;

interface StoredUser {
  id: string;
  name: string;
}

interface RoomState {
  roomId: string;
  playerIndex: number;
  plateCount?: number;
}

interface ApiRoom {
  id: string;
  player1: { id: string; name: string } | null;
  player2: { id: string; name: string } | null;
  plateCount?: number;
  firstPlayerIndex?: 0 | 1;
  currentTurn?: 0 | 1;
  createdAt: number;
}

let roomListIntervalId: ReturnType<typeof setInterval> | null = null;
let roomPollIntervalId: ReturnType<typeof setInterval> | null = null;
/** 게임 방 WebSocket (방 입장 시 연결·입장, 나가기 시 리스너만 해제) */
let gameSocket: SocketLike | null = null;

function esc(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function getApp(): HTMLElement {
  const el = document.getElementById("app");
  if (!el) throw new Error("#app not found");
  return el;
}

function getStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "name" in parsed && typeof (parsed as StoredUser).name === "string") {
      return parsed as StoredUser;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveUser(name: string): StoredUser {
  const user: StoredUser = {
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name,
  };
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
  return user;
}

function getRoomState(): RoomState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_ROOM);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (data && typeof data === "object" && "roomId" in data && "playerIndex" in data) {
      return data as RoomState;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveRoomState(roomId: string, playerIndex: number, plateCount?: number): void {
  sessionStorage.setItem(STORAGE_KEY_ROOM, JSON.stringify({ roomId, playerIndex, plateCount }));
}

function clearRoomState(): void {
  sessionStorage.removeItem(STORAGE_KEY_ROOM);
}

function getPlayerName(): string {
  const user = getStoredUser();
  return (user?.name ?? "").trim() || "플레이어";
}

async function fetchJoinableRooms(): Promise<ApiRoom[]> {
  try {
    const res = await fetch(`${API_BASE}/api/rooms`);
    const data = (await res.json()) as { ok?: boolean; rooms?: ApiRoom[] };
    return data.ok && Array.isArray(data.rooms) ? data.rooms : [];
  } catch {
    return [];
  }
}

async function createRoom(plateCount: number): Promise<{ roomId: string; plateCount: number }> {
  const creatorName = getPlayerName();
  const res = await fetch(`${API_BASE}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plateCount, creatorName }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    roomId?: string;
    room?: { plateCount?: number };
    error?: string;
  };
  if (!data.ok || !data.roomId) throw new Error(data.error ?? "방 생성에 실패했습니다.");
  const count = data.room?.plateCount ?? plateCount;
  return { roomId: data.roomId, plateCount: count };
}

async function joinRoom(
  roomId: string,
  playerName: string
): Promise<{ playerIndex: number; room: ApiRoom | null }> {
  const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(roomId)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerName }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    playerIndex?: number;
    room?: ApiRoom;
    error?: string;
  };
  if (!data.ok || data.playerIndex === undefined) throw new Error(data.error ?? "방 참가에 실패했습니다.");
  return { playerIndex: data.playerIndex, room: data.room ?? null };
}

async function leaveRoom(roomId: string, playerIndex: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(roomId)}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerIndex }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(data.error ?? "방 나가기에 실패했습니다.");
}

async function fetchRoom(roomId: string): Promise<ApiRoom | null> {
  try {
    const res = await fetch(`${API_BASE}/api/rooms/${encodeURIComponent(roomId)}`);
    const data = (await res.json()) as { ok?: boolean; room?: ApiRoom };
    return data.ok && data.room ? data.room : null;
  } catch {
    return null;
  }
}

// ---------- 뷰: 로그인 ----------
function renderLogin(): void {
  if (roomListIntervalId) {
    clearInterval(roomListIntervalId);
    roomListIntervalId = null;
  }
  if (roomPollIntervalId) {
    clearInterval(roomPollIntervalId);
    roomPollIntervalId = null;
  }

  const app = getApp();
  app.innerHTML = `
    <main class="login-wrap">
      <h1 class="login-title">remember_game2</h1>
      <p class="login-desc">1:1 온라인 게임</p>
      <form id="loginForm" class="login-form" novalidate>
        <label for="nickname" class="sr-only">닉네임</label>
        <input type="text" id="nickname" name="nickname" class="login-input" placeholder="닉네임 입력" minlength="2" maxlength="12" autocomplete="username" required />
        <span id="nicknameError" class="login-error" aria-live="polite"></span>
        <button type="submit" class="login-btn" id="loginBtn">로그인</button>
      </form>
      <p class="login-foot">현재 로컬 스토리지 저장 · 추후 DB 연동 예정</p>
    </main>
  `;

  const form = document.getElementById("loginForm") as HTMLFormElement;
  const nicknameInput = document.getElementById("nickname") as HTMLInputElement;
  const nicknameError = document.getElementById("nicknameError") as HTMLElement;
  const loginBtn = document.getElementById("loginBtn") as HTMLButtonElement;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    nicknameError.textContent = "";
    nicknameInput.classList.remove("invalid");

    const name = nicknameInput.value.trim();
    if (name.length < 2) {
      nicknameError.textContent = "닉네임은 2자 이상 입력해 주세요.";
      nicknameInput.classList.add("invalid");
      nicknameInput.focus();
      return;
    }
    if (name.length > 12) {
      nicknameError.textContent = "닉네임은 12자 이하로 입력해 주세요.";
      nicknameInput.classList.add("invalid");
      return;
    }

    loginBtn.disabled = true;
    saveUser(name);
    ensureSocketConnected();
    gameSocket?.emit("login", { name });
    renderLobby();
  });
}

// ---------- 뷰: 로비 ----------
function renderLobby(): void {
  if (roomPollIntervalId) {
    clearInterval(roomPollIntervalId);
    roomPollIntervalId = null;
  }

  const user = getStoredUser();
  if (!user) {
    renderLogin();
    return;
  }

  const app = getApp();
  const plateOptions = [10, 12, 14, 16, 18, 20];
  app.innerHTML = `
    <main class="login-wrap lobby-wrap">
      <h1 class="login-title">로비</h1>
      <p class="login-desc">방을 만들거나 참가할 수 있습니다</p>
      <div class="lobby-user" id="userInfo">로그인됨: <strong>${esc(user.name)}</strong></div>
      <section class="lobby-section lobby-section-create">
        <div class="lobby-plate-row">
          <label for="plateCountSelect" class="lobby-label">접시 개수</label>
          <select id="plateCountSelect" class="lobby-select" aria-describedby="plateCountHint">
            ${plateOptions.map((n) => `<option value="${n}">${n}개</option>`).join("")}
          </select>
        </div>
        <span id="plateCountHint" class="lobby-hint">방 만들 때 사용됩니다 (10~20개, 2단위)</span>
        <button type="button" class="lobby-btn primary" id="createRoomBtn">방 만들기</button>
      </section>
      <section class="lobby-section">
        <h2 class="lobby-section-title">참가 가능한 방</h2>
        <div id="roomList" class="room-list">불러오는 중…</div>
        <p class="lobby-hint" id="roomListHint">다른 사용자가 만든 방이 여기 표시됩니다</p>
      </section>
      <button type="button" class="logout-btn" id="logoutBtn">로그아웃</button>
    </main>
  `;

  const createRoomBtn = document.getElementById("createRoomBtn") as HTMLButtonElement;
  const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement;
  const roomListEl = document.getElementById("roomList") as HTMLElement;
  const roomListHint = document.getElementById("roomListHint") as HTMLElement;

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY_USER);
    clearRoomState();
    renderLogin();
  });

  createRoomBtn.addEventListener("click", async () => {
    createRoomBtn.disabled = true;
    const selectEl = document.getElementById("plateCountSelect") as HTMLSelectElement;
    const plateCount = selectEl ? Math.min(20, Math.max(10, parseInt(selectEl.value, 10) || 10)) : 10;
    try {
      const { roomId, plateCount: savedCount } = await createRoom(plateCount);
      const playerName = getPlayerName();
      const { playerIndex } = await joinRoom(roomId, playerName);
      saveRoomState(roomId, playerIndex, savedCount);
      renderGame();
    } catch (err) {
      alert(err instanceof Error ? err.message : "방 생성에 실패했습니다.");
      createRoomBtn.disabled = false;
    }
  });

  function updateRoomList(): void {
    fetchJoinableRooms().then((rooms) => {
      if (!roomListEl || !roomListHint) return;
      if (rooms.length === 0) {
        roomListEl.innerHTML = '<p class="lobby-hint">참가 가능한 방이 없습니다.</p>';
        roomListHint.textContent = "방 만들기 후 다른 사용자가 여기서 참가할 수 있습니다.";
        return;
      }
      roomListHint.textContent = "";
      roomListEl.innerHTML = rooms
        .map((room) => {
          const p1 = room.player1?.name ?? "대기 중";
          const plates = room.plateCount ?? PLATE_COUNT_DEFAULT;
          return `
            <div class="room-item">
              <div>
                <span class="room-item-player">${esc(p1)} 대기 중</span>
                <span class="room-item-plates">접시 ${plates}개</span>
              </div>
              <button type="button" class="lobby-btn join" data-room-id="${esc(room.id)}">참가</button>
            </div>
          `;
        })
        .join("");

      roomListEl.querySelectorAll(".lobby-btn.join").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const roomId = (btn as HTMLElement).dataset.roomId;
          if (!roomId) return;
          (btn as HTMLButtonElement).disabled = true;
          try {
            const playerName = getPlayerName();
            const { playerIndex, room } = await joinRoom(roomId, playerName);
            const plateCount = room?.plateCount ?? PLATE_COUNT_DEFAULT;
            saveRoomState(roomId, playerIndex, plateCount);
            renderGame();
          } catch (err) {
            alert(err instanceof Error ? err.message : "참가에 실패했습니다.");
            (btn as HTMLButtonElement).disabled = false;
          }
        });
      });
    }).catch(() => {
      if (roomListEl) roomListEl.textContent = "방 목록을 불러올 수 없습니다.";
    });
  }

  updateRoomList();
  if (roomListIntervalId) clearInterval(roomListIntervalId);
  roomListIntervalId = setInterval(updateRoomList, ROOM_LIST_INTERVAL_MS);
}

// ---------- 뷰: 게임 방 ----------
function renderGame(): void {
  if (roomListIntervalId) {
    clearInterval(roomListIntervalId);
    roomListIntervalId = null;
  }

  const state = getRoomState();
  if (!state) {
    renderLobby();
    return;
  }

  const app = getApp();
  const plateCountForTokens = Math.min(20, Math.max(10, state.plateCount ?? PLATE_COUNT_DEFAULT));
  const tokenCount = Math.min(10, Math.floor(plateCountForTokens / 2));
  const tokenLabelN = tokenCount * (tokenCount - 1) / 2;
  const tokens1P = Array.from({ length: tokenCount }, () => '<span class="player-token player-token--p1" aria-hidden="true"></span>').join("");
  const tokens2P = Array.from({ length: tokenCount }, () => '<span class="player-token player-token--p2" aria-hidden="true"></span>').join("");
  app.innerHTML = `
    <main class="login-wrap game-wrap" id="gameWrap">
      <h1 class="login-title">기억의 만찬</h1>
      <div id="gameRoom" class="game-room">
        <div id="roomPlayers" class="game-room-players">
          <div class="player-slot" data-slot="0">
            <span class="player-label">1P</span>
            <div class="player-info">
              <span class="player-name"></span>
              <span class="player-badge" aria-hidden="true">나</span>
            </div>
            <div class="player-tokens">${tokens1P}</div>
          </div>
          <span class="game-room-vs" aria-hidden="true">VS</span>
          <div class="player-slot" data-slot="1">
            <span class="player-label">2P</span>
            <div class="player-info">
              <span class="player-name"></span>
              <span class="player-badge" aria-hidden="true">나</span>
            </div>
            <div class="player-tokens">${tokens2P}</div>
          </div>
        </div>
      </div>
      <div id="gameArea" class="game-area">
        <div class="game-area-token-label game-area-token-label--p1" aria-hidden="true"><span class="player-token player-token--p1" aria-hidden="true"></span> x <span class="game-area-token-n">${tokenLabelN}</span></div>
        <div class="game-area-token-label game-area-token-label--p2" aria-hidden="true"><span class="player-token player-token--p2" aria-hidden="true"></span> x <span class="game-area-token-n">${tokenLabelN}</span></div>
        <div id="gameAreaContent"></div>
      </div>
      <button type="button" class="logout-btn" id="backToLobbyBtn">나가기</button>
    </main>
  `;

  const roomState = state;
  type GamePhase = "ready" | "playing";
  let gamePhase: GamePhase = "ready";
  let currentTurn: 0 | 1 = 0;
  /** 선수(먼저 두는 쪽), 서버 방 생성 시 랜덤 결정. 후수 = 1 - firstPlayerIndex */
  let firstPlayerIndex: 0 | 1 = 0;
  let timerIntervalId: ReturnType<typeof setInterval> | null = null;
  let timerSecondsLeft = TIMER_DEFAULT_SECONDS;
  const usedPlates = new Set<number>();
  /** 접시별 P1/P2 토큰 개수 (round·메인 단계에서 사용, 메인에서 혼합 색 유지) */
  const plateTokensByPlayer: Record<number, { 0: number; 1: number }> = {};
  let myClickCount = 0;
  /** 상대가 마지막으로 클릭한 라운드 번호 (상대 차례일 때 표시할 round = lastOpponentRound + 1) */
  let lastOpponentRound = 0;
  let inputBlocked = false;
  /** 게임 종료(승리/패배) 시 true, 이후 모든 키·클릭 입력 차단 */
  let gameEnded = false;
  /** 'round'(토큰 놓기) | 'main'(확인할 두 접시 선택). 메인 전환 후 3초 지나면 'main' */
  let gameSubPhase: "round" | "main" = "round";
  /** 메인 단계에서 선수가 선택한 접시(뚜껑) 인덱스 최대 2개 */
  const selectedPlatesForMain: number[] = [];
  /** 메인 단계 하위: 두 접시 선택 중 | 토큰 하나 놓을 접시 선택 중 */
  let mainSubPhase: "selectTwoPlates" | "placeToken" = "selectTwoPlates";
  /** 상대가 두 접시 선택 시 받은 [plateA, plateB] (상대가 토큰 놓은 뒤 뚜껑 닫을 때 사용) */
  let opponentSelectedPlatesForMain: [number, number] | null = null;
  /** 라운드 단계: 접시에 놓을 때마다 줄어드는 토큰 수 (초기 = tokenLabelN, 라운드별 myRound만큼 감소) */
  let roundRemainingP1 = tokenLabelN;
  let roundRemainingP2 = tokenLabelN;
  /** 메인 단계: 닉네임 아래 표시하는 보유 토큰 수 (초기 = tokenCount = 접시수/2, 정답 시 -1, 페널티 시 +1) */
  let heldTokensP1 = tokenCount;
  let heldTokensP2 = tokenCount;
  const LID_ANIMATION_MS = 2000;

  function formatTimer(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  const plateCount = Math.min(20, Math.max(10, roomState.plateCount ?? PLATE_COUNT_DEFAULT));
  /** 게임 중 '본인 차례가 아닐 때' 클릭 시 잠깐 띄우는 공지 */
  function showNotice(message: string): void {
    const existing = document.getElementById("gameNotice");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.id = "gameNotice";
    el.className = "game-notice";
    el.setAttribute("role", "alert");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  /** 마지막 라운드: (N/2)-1. 후수(선이 아닌 쪽) 차례에서 끝나면 메인 게임 전환 */
  const lastRound = Math.floor(plateCount / 2) - 1;
  /** 후수 = 나중에 두는 쪽 (firstPlayerIndex와 반대). firstPlayerIndex 갱신 후 사용 */
  function isSecondPlayer(p: number): boolean {
    return p === (1 - firstPlayerIndex);
  }
  /** 메인 게임 전환 후 클릭 차단 시간(ms) */
  const MAIN_GAME_TRANSITION_BLOCK_MS = 3000;
  let transitionToMainDone = false;
  const isHost = roomState.playerIndex === 0;

  /** WebSocket: 방 입장 및 게임 시작 수신 (API_BASE와 동일 서버) */
  if (!gameSocket) {
    gameSocket = getIo()(API_BASE, { path: "/socket.io", transports: ["websocket", "polling"] });
  }
  gameSocket.emit("game:joinRoom", {
    roomId: roomState.roomId,
    playerIndex: roomState.playerIndex,
    playerName: getPlayerName(),
  });

  const onGameStart = (data: unknown) => {
    const payload = data as { roomId?: string };
    if (payload?.roomId !== roomState.roomId) return;
    gamePhase = "playing";
    timerSecondsLeft = TIMER_DEFAULT_SECONDS;
    renderGameArea();
    fetchRoom(roomState.roomId).then((room) => {
      if (room) updateGameUI(room);
    });
  };
  gameSocket.on("game:start", onGameStart);

  /** 방 나가기: 타이머·폴링·소켓 정리 후 API 호출·로비 이동 (나가기 버튼 / 상대 퇴장 / 게임 종료 roomClosed 시 공통) */
  function doLeaveRoom(options: {
    emitSocketLeave?: boolean;
    showOpponentLeftAlert?: boolean;
    reenableBackBtn?: boolean;
    /** true면 room:leave 미전송·leave API 미호출 (서버가 이미 방을 닫은 경우) */
    skipEmitAndApi?: boolean;
  }): void {
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    if (roomPollIntervalId) {
      clearInterval(roomPollIntervalId);
      roomPollIntervalId = null;
    }
    if (gameSocket) gameSocket.off("room:playerLeft", onPlayerLeft);
    if (gameSocket) gameSocket.off("game:start", onGameStart);
    if (gameSocket) gameSocket.off("game:plateClick", onPlateClickFromServer);
    if (gameSocket) gameSocket.off("game:mainTwoPlatesSelected");
    if (gameSocket) gameSocket.off("game:mainTokenPlaced");
    if (gameSocket) gameSocket.off("game:mainWrongAnswerDone");
    if (gameSocket) gameSocket.off("game:mainTimeOver");
    if (gameSocket) gameSocket.off("game:turnSwitch", onTurnSwitch);
    if (gameSocket) gameSocket.off("game:gameOver", onGameOver);
    if (gameSocket) gameSocket.off("game:roomClosed", onGameRoomClosed);
    if (options.emitSocketLeave) {
      gameSocket?.emit("room:leave", { roomId: roomState.roomId, playerIndex: roomState.playerIndex });
    }
    if (!options.skipEmitAndApi) {
      leaveRoom(roomState.roomId, roomState.playerIndex).catch(() => { });
    }
    clearRoomState();
    if (options.showOpponentLeftAlert) alert("상대가 방을 나갔습니다.");
    renderLobby();
    if (options.reenableBackBtn) {
      const btn = document.getElementById("backToLobbyBtn") as HTMLButtonElement | null;
      if (btn) btn.disabled = false;
    }
  }

  /** 상대가 나갔을 때(나가기·새로고침·연결 끊김): 알림 후 로비로 */
  const onPlayerLeft = (data: unknown) => {
    const payload = data as { roomId?: string; playerIndex?: number };
    if (payload?.roomId !== roomState.roomId) return;
    if (payload?.playerIndex === roomState.playerIndex) return;
    doLeaveRoom({ showOpponentLeftAlert: true });
  };
  gameSocket.on("room:playerLeft", onPlayerLeft);

  /** 라운드 단계용: 접시에 놓고 남은 토큰 수(roundRemaining)를 라벨에 반영 */
  function updateTokenLabels(): void {
    const p1El = document.querySelector(".game-area-token-label--p1 .game-area-token-n");
    const p2El = document.querySelector(".game-area-token-label--p2 .game-area-token-n");
    if (p1El) p1El.textContent = String(Math.max(0, roundRemainingP1));
    if (p2El) p2El.textContent = String(Math.max(0, roundRemainingP2));
  }

  /** 클릭 전: round 단계는 토큰 N개 문구, 메인 단계는 확인할 두 접시 문구 */
  function updateCenterMessageForWaiting(): void {
    const msgEl = document.getElementById("gameCenterMessage");
    if (!msgEl || gamePhase !== "playing") return;
    if (transitionToMainDone && gameSubPhase === "main") {
      msgEl.textContent =
        currentTurn === roomState.playerIndex
          ? "확인할 두 접시를 선택해주세요"
          : "상대가 확인할 접시를 고르고 있습니다";
      return;
    }
    if (transitionToMainDone) return;
    const rawRound =
      currentTurn === roomState.playerIndex ? myClickCount + 1 : lastOpponentRound + 1;
    const round = Math.min(rawRound, lastRound);
    if (currentTurn === roomState.playerIndex) {
      msgEl.textContent = `토큰 ${round}개를 원하는 접시에 놓아주세요`;
    } else {
      msgEl.textContent = `상대가 토큰 ${round}개를 놓을 접시를 고르고 있습니다.`;
    }
  }

  /** 접시 위에 토큰 N개 표시 (클릭 시 호출, 뚜껑이 덮이면 z-index로 가려짐). playerIndex에 따라 1P/2P 색 적용 */
  /** 접시 위에 P1/P2 토큰 개수만큼 그리기 (상대 색 유지 + 본인 1개 추가 시 혼합) */
  function setPlateTokens(plateIndex: number, counts: { 0: number; 1: number }): void {
    const container = document.querySelector(
      `#gamePlateRing .game-plate[data-plate-index="${plateIndex}"] .game-plate-tokens`
    ) as HTMLElement | null;
    if (!container) return;
    container.innerHTML = "";
    const c0 = counts[0] ?? 0;
    const c1 = counts[1] ?? 0;
    for (let i = 0; i < c0; i++) {
      const token = document.createElement("span");
      token.className = "game-plate-token game-plate-token--p1";
      token.setAttribute("aria-hidden", "true");
      container.appendChild(token);
    }
    for (let i = 0; i < c1; i++) {
      const token = document.createElement("span");
      token.className = "game-plate-token game-plate-token--p2";
      token.setAttribute("aria-hidden", "true");
      container.appendChild(token);
    }
  }

  /** 클릭 직후: 'x번 접시에 토큰 round 개를 놓았습니다' (x, round는 강조 스타일) */
  function setCenterMessagePlaced(plateNum: number, round: number): void {
    if (transitionToMainDone) return;
    const msgEl = document.getElementById("gameCenterMessage");
    if (!msgEl) return;
    msgEl.innerHTML = `<span class="game-center-highlight">${plateNum}</span>번 접시에 토큰 <span class="game-center-highlight">${round}</span> 개를 놓았습니다`;
  }

  /** 마지막 라운드 종료 시: '빈 접시의 뚜껑을 덮습니다' → 뚜껑 애니메이션 → '이제 게임을 시작합니다' → 3초 후 선수/후수별 메인 게임 문구 */
  function doTransitionToMainGame(): void {
    if (transitionToMainDone) return;
    transitionToMainDone = true;
    const msgEl = document.getElementById("gameCenterMessage");
    if (msgEl) msgEl.textContent = "빈 접시의 뚜껑을 덮습니다";
    const uncovered = Array.from({ length: plateCount }, (_, i) => i).filter((i) => !usedPlates.has(i));
    const two = uncovered.slice(0, 2);
    two.forEach((i) => {
      usedPlates.add(i);
      const lid = document.querySelector(
        `#gamePlateRing .game-plate-lid[data-plate-index="${i}"]`
      ) as HTMLElement | null;
      if (lid && !lid.classList.contains("game-plate-lid--covered")) {
        lid.classList.add("game-plate-lid--covered");
      }
      const plateEl = document.querySelector(
        `#gamePlateRing .game-plate[data-plate-index="${i}"]`
      ) as HTMLElement | null;
      if (plateEl) plateEl.classList.add("game-plate--used");
    });
    inputBlocked = true;
    setTimeout(() => {
      if (msgEl) msgEl.textContent = "이제 게임을 시작합니다";
      const timerEl = document.getElementById("gameTimer");
      if (timerEl) timerEl.classList.add("game-timer--hidden");
      setTimeout(() => {
        if (timerEl) timerEl.classList.remove("game-timer--hidden");
        inputBlocked = false;
        gameSubPhase = "main";
        document.getElementById("gameArea")?.classList.add("game-area--main-phase");
        if (msgEl) {
          msgEl.textContent =
            roomState.playerIndex === firstPlayerIndex
              ? "확인할 두 접시를 선택해주세요"
              : "상대가 확인할 접시를 고르고 있습니다";
        }
        startTimer();
      }, MAIN_GAME_TRANSITION_BLOCK_MS);
    }, LID_ANIMATION_MS);
  }

  /** 메인 단계: 선수가 뚜껑(접시) 클릭 시 선택/해제. 1개 선택 시 포커스, 다시 클릭 시 취소. 2개 선택 시 다음 이벤트 준비(콘솔) */
  function toggleMainPlateSelection(plateIndex: number): void {
    if (gameEnded) return;
    const idx = selectedPlatesForMain.indexOf(plateIndex);
    if (idx >= 0) {
      selectedPlatesForMain.splice(idx, 1);
    } else if (selectedPlatesForMain.length < 2) {
      selectedPlatesForMain.push(plateIndex);
    }
    document.querySelectorAll("#gamePlateRing .game-plate-lid").forEach((lid) => {
      const i = lid.getAttribute("data-plate-index");
      const n = i !== null ? parseInt(i, 10) : -1;
      lid.classList.toggle("game-plate-lid--selected", selectedPlatesForMain.includes(n));
    });
    if (selectedPlatesForMain.length === 2) {
      if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
      }
      const [a, b] = [selectedPlatesForMain[0], selectedPlatesForMain[1]];
      const lidA = document.querySelector(
        `#gamePlateRing .game-plate-lid[data-plate-index="${a}"]`
      ) as HTMLElement | null;
      const lidB = document.querySelector(
        `#gamePlateRing .game-plate-lid[data-plate-index="${b}"]`
      ) as HTMLElement | null;
      if (lidA) lidA.classList.add("game-plate-lid--uncover");
      if (lidB) lidB.classList.add("game-plate-lid--uncover");
      const countA = (plateTokensByPlayer[a]?.[0] ?? 0) + (plateTokensByPlayer[a]?.[1] ?? 0);
      const countB = (plateTokensByPlayer[b]?.[0] ?? 0) + (plateTokensByPlayer[b]?.[1] ?? 0);
      const same = countA === countB;
      gameSocket?.emit("game:mainTwoPlatesSelected", {
        roomId: roomState.roomId,
        playerIndex: roomState.playerIndex,
        plateA: a,
        plateB: b,
        correct: same,
      });
      const msgEl = document.getElementById("gameCenterMessage");
      const LID_UNCOVER_MS = 1500;
      const PENALTY_DISPLAY_MS = 2000;
      if (same && msgEl) msgEl.textContent = "정답입니다";
      if (!same && msgEl) msgEl.textContent = "틀렸습니다";
      setTimeout(() => {
        if (same) {
          mainSubPhase = "placeToken";
          // 이 플레이어가 토큰1개 남아있는 상태라면 승리로 게임오버
          if (
            (roomState.playerIndex === 0 && heldTokensP1 === 1) ||
            (roomState.playerIndex === 1 && heldTokensP2 === 1)
          ) {
            gameEnded = true;
            console.log("토큰이 1개만 남았는데 정답 맞춰서 승리!");
            gameSocket?.emit("game:gameOver", {
              roomId: roomState.roomId,
              playerIndex: roomState.playerIndex,
              reason: "win",
              winnerPlayerIndex: roomState.playerIndex,
            });
            return;
          }
          if (msgEl) msgEl.textContent = "토큰 1개를 놓을 접시를 선택해주세요";
          [a, b].forEach((i) => {
            const plateEl = document.querySelector(
              `#gamePlateRing .game-plate[data-plate-index="${i}"]`
            ) as HTMLElement | null;
            if (plateEl) plateEl.classList.add("game-plate--placeable");
          });
        } else {
          if (msgEl) msgEl.textContent = "페널티로 토큰 1개를 받습니다";
          heldTokensP1 += roomState.playerIndex === 0 ? 1 : 0;
          heldTokensP2 += roomState.playerIndex === 1 ? 1 : 0;
          updateTokenLabels();
          if (heldTokensP1 >= tokenCount * 2 || heldTokensP2 >= tokenCount * 2) {
            gameEnded = true;
            console.log("게임이 끝났습니다 (패널티로 토큰이 tokenCount의 2배가 됨)");
            gameSocket?.emit("game:gameOver", {
              roomId: roomState.roomId,
              playerIndex: roomState.playerIndex,
              reason: "penalty",
              loserPlayerIndex: roomState.playerIndex,
            });
          }
          const mySlot = document.querySelector(
            `.player-slot[data-slot="${roomState.playerIndex}"] .player-tokens`
          ) as HTMLElement | null;
          const tokenClass = roomState.playerIndex === 0 ? "player-token player-token--p1" : "player-token player-token--p2";
          const penaltyToken = document.createElement("span");
          penaltyToken.className = tokenClass;
          penaltyToken.setAttribute("aria-hidden", "true");
          mySlot?.appendChild(penaltyToken);
          const recoverLid = (lid: HTMLElement | null) => {
            if (!lid) return;
            lid.classList.remove("game-plate-lid--uncover");
            lid.classList.remove("game-plate-lid--covered");
            lid.offsetHeight;
            lid.classList.add("game-plate-lid--covered");
          };
          setTimeout(() => {
            recoverLid(lidA);
            recoverLid(lidB);
            selectedPlatesForMain.length = 0;
            document.querySelectorAll("#gamePlateRing .game-plate-lid").forEach((el) => el.classList.remove("game-plate-lid--selected"));
            if (!gameEnded) {
              gameSocket?.emit("game:roundDone", { roomId: roomState.roomId, playerIndex: roomState.playerIndex });
              gameSocket?.emit("game:mainWrongAnswerDone", { roomId: roomState.roomId, playerIndex: roomState.playerIndex });
              mainSubPhase = "selectTwoPlates";
              inputBlocked = false;
            }
          }, PENALTY_DISPLAY_MS);
        }
      }, LID_UNCOVER_MS);
    }
  }

  /** 메인 단계: true 후 두 접시 중 하나에 토큰 1개 놓기 → 상대에게 알림 → 뚜껑 다시 덮기 → 턴 전환 */
  function placeTokenOnPlate(plateIndex: number): void {
    if (gameEnded) return;
    if (mainSubPhase !== "placeToken" || selectedPlatesForMain.length !== 2) return;
    if (!selectedPlatesForMain.includes(plateIndex)) return;
    inputBlocked = true;
    const [a, b] = [selectedPlatesForMain[0], selectedPlatesForMain[1]];
    document.querySelectorAll("#gamePlateRing .game-plate").forEach((el) => el.classList.remove("game-plate--placeable"));
    selectedPlatesForMain.length = 0;
    document.querySelectorAll("#gamePlateRing .game-plate-lid").forEach((lid) => lid.classList.remove("game-plate-lid--selected"));

    const cur = plateTokensByPlayer[plateIndex] ?? { 0: 0, 1: 0 };
    const newCounts = {
      0: cur[0] + (roomState.playerIndex === 0 ? 1 : 0),
      1: cur[1] + (roomState.playerIndex === 1 ? 1 : 0),
    };
    plateTokensByPlayer[plateIndex] = newCounts;
    if (roomState.playerIndex === 0) {
      heldTokensP1 = Math.max(0, heldTokensP1 - 1);
    } else {
      heldTokensP2 = Math.max(0, heldTokensP2 - 1);
    }
    updateTokenLabels();

    gameSocket?.emit("game:mainTokenPlaced", {
      roomId: roomState.roomId,
      playerIndex: roomState.playerIndex,
      plateIndex,
      countP1: newCounts[0],
      countP2: newCounts[1],
    });

    const plateNum = plateIndex + 1;
    const msgEl = document.getElementById("gameCenterMessage");
    if (msgEl) msgEl.innerHTML = `<span class="game-center-highlight">${plateNum}</span>번 접시에 토큰 1개를 더 놓았습니다`;

    const mySlot = document.querySelector(
      `.player-slot[data-slot="${roomState.playerIndex}"] .player-tokens`
    ) as HTMLElement | null;
    const firstToken = mySlot?.querySelector(".player-token");
    if (firstToken) {
      firstToken.classList.add("game-token--removing");
      setTimeout(() => {
        firstToken.remove();
      }, 300);
    }

    setTimeout(() => {
      setPlateTokens(plateIndex, newCounts);
    }, 200);

    const lidA = document.querySelector(
      `#gamePlateRing .game-plate-lid[data-plate-index="${a}"]`
    ) as HTMLElement | null;
    const lidB = document.querySelector(
      `#gamePlateRing .game-plate-lid[data-plate-index="${b}"]`
    ) as HTMLElement | null;
    const recoverLid = (lid: HTMLElement | null) => {
      if (!lid) return;
      lid.classList.remove("game-plate-lid--uncover");
      lid.classList.remove("game-plate-lid--covered");
      lid.offsetHeight;
      lid.classList.add("game-plate-lid--covered");
    };
    setTimeout(() => {
      recoverLid(lidA);
      recoverLid(lidB);
    }, 400);

    gameSocket?.emit("game:roundDone", { roomId: roomState.roomId, playerIndex: roomState.playerIndex });

    setTimeout(() => {
      mainSubPhase = "selectTwoPlates";
      inputBlocked = false;
      /* 턴/메시지/타이머는 game:turnSwitch 수신 시 onTurnSwitch에서 갱신 */
    }, 400 + LID_ANIMATION_MS);
  }

  /** 접시 클릭: 타이머 정지, 상대에게 알림, 뚜껑 애니메이션, 토큰 N 감소, 한 번 클릭한 접시 비활성화, 애니메이션 끝날 때까지 입력 차단. 마지막 라운드면 전환 후에도 잠시 차단 */
  function onPlateClick(index: number): void {
    if (gameEnded) return;
    if (gamePhase !== "playing" || currentTurn !== roomState.playerIndex) return;
    if (inputBlocked || usedPlates.has(index)) return;
    const nextRound = myClickCount + 1;
    if (nextRound > lastRound) return;
    inputBlocked = true;
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    const myRound = myClickCount + 1;
    usedPlates.add(index);
    myClickCount += 1;
    gameSocket?.emit("game:plateClick", {
      roomId: roomState.roomId,
      playerIndex: roomState.playerIndex,
      plateIndex: index,
      round: myRound,
    });
    const lid = document.querySelector(
      `#gamePlateRing .game-plate-lid[data-plate-index="${index}"]`
    ) as HTMLElement | null;
    if (lid && !lid.classList.contains("game-plate-lid--covered")) {
      lid.classList.add("game-plate-lid--covered");
    }
    const plateEl = document.querySelector(
      `#gamePlateRing .game-plate[data-plate-index="${index}"]`
    ) as HTMLElement | null;
    if (plateEl) plateEl.classList.add("game-plate--used");
    const cur = plateTokensByPlayer[index] ?? { 0: 0, 1: 0 };
    const next = {
      0: cur[0] + (roomState.playerIndex === 0 ? myRound : 0),
      1: cur[1] + (roomState.playerIndex === 1 ? myRound : 0),
    };
    plateTokensByPlayer[index] = next;
    setPlateTokens(index, next);
    if (roomState.playerIndex === 0) {
      roundRemainingP1 = Math.max(0, roundRemainingP1 - myRound);
    } else {
      roundRemainingP2 = Math.max(0, roundRemainingP2 - myRound);
    }
    updateTokenLabels();
    setCenterMessagePlaced(index + 1, myRound);
    const ringEl = document.getElementById("gamePlateRing");
    ringEl?.dispatchEvent(
      new CustomEvent("plateclick", { detail: { index }, bubbles: true })
    );
    setTimeout(() => {
      if (myRound === lastRound && isSecondPlayer(roomState.playerIndex)) {
        doTransitionToMainGame();
      } else {
        inputBlocked = false;
      }
      gameSocket?.emit("game:roundDone", { roomId: roomState.roomId, playerIndex: roomState.playerIndex });
    }, LID_ANIMATION_MS);
  }

  /** 메인 게임: 자기 턴에서 타이머 만료 시 시간 오버 페널티 (토큰 1개 추가, 2초 문구, 턴 유지·타이머만 재시작) */
  const TIME_OVER_MESSAGE_MS = 2000;
  function doMainTimeOverPenalty(): void {
    inputBlocked = true;
    heldTokensP1 += currentTurn === 0 ? 1 : 0;
    heldTokensP2 += currentTurn === 1 ? 1 : 0;
    updateTokenLabels();
    const msgEl = document.getElementById("gameCenterMessage");
    if (msgEl) msgEl.textContent = "시간 오버 페널티로 토큰1개를 받습니다";
    const mySlot = document.querySelector(
      `.player-slot[data-slot="${currentTurn}"] .player-tokens`
    ) as HTMLElement | null;
    const tokenClass = currentTurn === 0 ? "player-token player-token--p1" : "player-token player-token--p2";
    const penaltyToken = document.createElement("span");
    penaltyToken.className = tokenClass;
    penaltyToken.setAttribute("aria-hidden", "true");
    mySlot?.appendChild(penaltyToken);
    if (heldTokensP1 >= tokenCount * 2 || heldTokensP2 >= tokenCount * 2) {
      gameEnded = true;
      console.log("게임이 끝났습니다 (패널티로 토큰이 tokenCount의 2배가 됨)");
      gameSocket?.emit("game:gameOver", {
        roomId: roomState.roomId,
        playerIndex: roomState.playerIndex,
        reason: "penalty",
        loserPlayerIndex: currentTurn,
      });
    }
    gameSocket?.emit("game:mainTimeOver", { roomId: roomState.roomId, playerIndex: currentTurn });
    setTimeout(() => {
      if (!gameEnded) {
        updateCenterMessageForWaiting();
        inputBlocked = false;
        startTimer();
      }
    }, TIME_OVER_MESSAGE_MS);
  }

  /** 타이머를 처음부터 다시 시작. round 단계는 5초·시간 종료 시 랜덤 접시, main 단계는 30초 */
  function startTimer(): void {
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    const duration =
      gameSubPhase === "main" ? MAIN_GAME_TIMER_SECONDS : TIMER_DEFAULT_SECONDS;
    timerSecondsLeft = duration;
    const timerEl = document.getElementById("gameTimer");
    if (timerEl) timerEl.textContent = formatTimer(timerSecondsLeft);
    timerIntervalId = setInterval(() => {
      timerSecondsLeft = Math.max(0, timerSecondsLeft - 1);
      if (timerEl) timerEl.textContent = formatTimer(timerSecondsLeft);
      if (timerSecondsLeft <= 0 && timerIntervalId) {
        if (
          gameSubPhase === "round" &&
          currentTurn === roomState.playerIndex &&
          gamePhase === "playing" &&
          !inputBlocked
        ) {
          const unused = Array.from({ length: plateCount }, (_, i) => i).filter((i) => !usedPlates.has(i));
          if (unused.length > 0) {
            const idx = unused[Math.floor(Math.random() * unused.length)];
            onPlateClick(idx);
          }
        }
        if (
          gameSubPhase === "main" &&
          currentTurn === roomState.playerIndex &&
          gamePhase === "playing" &&
          !inputBlocked &&
          !gameEnded
        ) {
          doMainTimeOverPenalty();
        }
        clearInterval(timerIntervalId);
        timerIntervalId = null;
      }
    }, 1000);
  }

  /** 상대 접시 클릭 수신: 뚜껑 표시, 해당 접시 비활성화, 상대 토큰 N 감소 (턴 전환은 클릭한 쪽의 roundDone으로만 처리) */
  const onPlateClickFromServer = (data: unknown) => {
    const payload = data as { roomId?: string; playerIndex?: number; plateIndex?: number; round?: number };
    if (payload?.roomId !== roomState.roomId) return;
    const plateIndex = payload.plateIndex ?? -1;
    const round = payload.round ?? 0;
    if (plateIndex < 0 || round < 1) return;
    /* 본인 클릭은 onPlateClick에서 이미 반영했으므로 중복 반영하지 않음 → round 개수만 놓이게 함 */
    if (payload.playerIndex === roomState.playerIndex) return;
    lastOpponentRound = round;
    usedPlates.add(plateIndex);
    const lid = document.querySelector(
      `#gamePlateRing .game-plate-lid[data-plate-index="${plateIndex}"]`
    ) as HTMLElement | null;
    if (lid && !lid.classList.contains("game-plate-lid--covered")) {
      lid.classList.add("game-plate-lid--covered");
    }
    const plateEl = document.querySelector(
      `#gamePlateRing .game-plate[data-plate-index="${plateIndex}"]`
    ) as HTMLElement | null;
    if (plateEl) plateEl.classList.add("game-plate--used");
    const cur = plateTokensByPlayer[plateIndex] ?? { 0: 0, 1: 0 };
    const p = (payload.playerIndex ?? 0) as 0 | 1;
    const next = {
      0: cur[0] + (p === 0 ? round : 0),
      1: cur[1] + (p === 1 ? round : 0),
    };
    plateTokensByPlayer[plateIndex] = next;
    setPlateTokens(plateIndex, next);
    if (payload.playerIndex === 0) {
      roundRemainingP1 = Math.max(0, roundRemainingP1 - round);
    } else {
      roundRemainingP2 = Math.max(0, roundRemainingP2 - round);
    }
    updateTokenLabels();
    setCenterMessagePlaced(plateIndex + 1, round);
    if (isSecondPlayer(payload.playerIndex ?? -1) && round === lastRound) {
      setTimeout(() => doTransitionToMainGame(), LID_ANIMATION_MS);
    }
  };
  gameSocket.on("game:plateClick", onPlateClickFromServer);

  /** 메인 단계: 상대가 두 접시 선택 시 같은 뚜껑 애니메이션 + 문구(상대가 정답 맞췄습니다 → 상대가 토큰 1개 놓을 접시 선택중) */
  const onMainTwoPlatesSelected = (data: unknown) => {
    const payload = data as { roomId?: string; playerIndex?: number; plateA?: number; plateB?: number; correct?: boolean };
    if (payload?.roomId !== roomState.roomId) return;
    if (payload.playerIndex === roomState.playerIndex) return;
    const plateA = payload.plateA ?? -1;
    const plateB = payload.plateB ?? -1;
    if (plateA < 0 || plateB < 0) return;
    opponentSelectedPlatesForMain = [plateA, plateB];
    const lidA = document.querySelector(
      `#gamePlateRing .game-plate-lid[data-plate-index="${plateA}"]`
    ) as HTMLElement | null;
    const lidB = document.querySelector(
      `#gamePlateRing .game-plate-lid[data-plate-index="${plateB}"]`
    ) as HTMLElement | null;
    if (lidA) lidA.classList.add("game-plate-lid--uncover");
    if (lidB) lidB.classList.add("game-plate-lid--uncover");
    const msgEl = document.getElementById("gameCenterMessage");
    if (payload.correct && msgEl) msgEl.textContent = "상대가 정답을 맞췄습니다";
    if (!payload.correct && msgEl) msgEl.textContent = "상대가 틀렸습니다";
    const LID_UNCOVER_MS = 1500;
    setTimeout(() => {
      if (payload.correct && msgEl) msgEl.textContent = "상대가 토큰 1개를 놓을 접시를 선택중입니다";
      if (!payload.correct && msgEl) {
        msgEl.textContent = "상대방이 페널티로 토큰 1개를 받았습니다";
        const who = (payload.playerIndex ?? 0) as 0 | 1;
        if (who === 0) heldTokensP1 += 1;
        else heldTokensP2 += 1;
        updateTokenLabels();
        const opponentSlot = document.querySelector(
          `.player-slot[data-slot="${who}"] .player-tokens`
        ) as HTMLElement | null;
        const tokenClass = who === 0 ? "player-token player-token--p1" : "player-token player-token--p2";
        const penaltyToken = document.createElement("span");
        penaltyToken.className = tokenClass;
        penaltyToken.setAttribute("aria-hidden", "true");
        opponentSlot?.appendChild(penaltyToken);
        if (heldTokensP1 >= tokenCount * 2 || heldTokensP2 >= tokenCount * 2) {
          gameEnded = true;
          console.log("게임이 끝났습니다 (상대가 패널티로 토큰이 tokenCount의 2배가 됨)");
        }
      }
    }, LID_UNCOVER_MS);
  };
  gameSocket.on("game:mainTwoPlatesSelected", onMainTwoPlatesSelected);

  /** 메인 게임: 상대가 시간 오버 페널티 받았을 때 (상대 슬롯에 토큰 1개, 2초 문구) */
  const onMainTimeOver = (data: unknown) => {
    const payload = data as { roomId?: string; playerIndex?: number };
    if (payload?.roomId !== roomState.roomId) return;
    if (payload.playerIndex === roomState.playerIndex) return;
    const who = (payload.playerIndex ?? 0) as 0 | 1;
    heldTokensP1 += who === 0 ? 1 : 0;
    heldTokensP2 += who === 1 ? 1 : 0;
    updateTokenLabels();
    const msgEl = document.getElementById("gameCenterMessage");
    if (msgEl) msgEl.textContent = "상대방이 시간오버 페널티로 토큰1개를 받습니다";
    const opponentSlot = document.querySelector(
      `.player-slot[data-slot="${who}"] .player-tokens`
    ) as HTMLElement | null;
    const tokenClass = who === 0 ? "player-token player-token--p1" : "player-token player-token--p2";
    const penaltyToken = document.createElement("span");
    penaltyToken.className = tokenClass;
    penaltyToken.setAttribute("aria-hidden", "true");
    opponentSlot?.appendChild(penaltyToken);
    if (heldTokensP1 >= tokenCount * 2 || heldTokensP2 >= tokenCount * 2) {
      gameEnded = true;
      console.log("게임이 끝났습니다 (상대가 패널티로 토큰이 tokenCount의 2배가 됨)");
    }
    setTimeout(() => {
      updateCenterMessageForWaiting();
    }, TIME_OVER_MESSAGE_MS);
  };
  gameSocket.on("game:mainTimeOver", onMainTimeOver);

  /** 게임 종료 수신: 입력 차단, GameOver 문구 → 잠시 후 종료됩니다 → gameEndFinalize 전송 (둘 다 동일 흐름) */
  const onGameOver = (data: unknown) => {
    const payload = data as { roomId?: string; reason?: string; winnerPlayerIndex?: number; loserPlayerIndex?: number };
    if (payload?.roomId !== roomState.roomId) return;
    gameEnded = true;

    const msgEl = document.getElementById("gameCenterMessage");
    if (msgEl) msgEl.textContent = "GameOver";

    setTimeout(() => {
      if (msgEl) msgEl.textContent = "잠시 후 종료됩니다";
      setTimeout(() => {
        gameSocket?.emit("game:gameEndFinalize", { roomId: roomState.roomId });
      }, 2000);
    }, 3000);
  };
  gameSocket.on("game:gameOver", onGameOver);

  /** 서버가 방을 닫은 후 브로드캐스트. 로비로 이동 (leave API/emit 생략) */
  const onGameRoomClosed = (data: unknown) => {
    const payload = data as { roomId?: string };
    if (payload?.roomId !== roomState.roomId) return;
    doLeaveRoom({ skipEmitAndApi: true });
  };
  gameSocket.on("game:roomClosed", onGameRoomClosed);

  /** 메인 단계: 상대가 틀렸을 때 페널티 표시 후 뚜껑 닫기 완료 신호 수신 → 내 화면에서도 두 뚜껑 닫기 */
  const onMainWrongAnswerDone = (data: unknown) => {
    const payload = data as { roomId?: string; playerIndex?: number };
    if (payload?.roomId !== roomState.roomId) return;
    if (payload.playerIndex === roomState.playerIndex) return;
    if (!opponentSelectedPlatesForMain) return;
    const [pa, pb] = opponentSelectedPlatesForMain;
    const lidA = document.querySelector(
      `#gamePlateRing .game-plate-lid[data-plate-index="${pa}"]`
    ) as HTMLElement | null;
    const lidB = document.querySelector(
      `#gamePlateRing .game-plate-lid[data-plate-index="${pb}"]`
    ) as HTMLElement | null;
    const recoverLid = (lid: HTMLElement | null) => {
      if (!lid) return;
      lid.classList.remove("game-plate-lid--uncover");
      lid.classList.remove("game-plate-lid--covered");
      lid.offsetHeight;
      lid.classList.add("game-plate-lid--covered");
    };
    recoverLid(lidA);
    recoverLid(lidB);
    opponentSelectedPlatesForMain = null;
  };
  gameSocket.on("game:mainWrongAnswerDone", onMainWrongAnswerDone);

  /** 메인 단계: 상대가 토큰 놓을 접시 선택 시 같은 접시에 토큰 표시 + 문구 + 뚜껑 닫기 (플레이어와 동일한 타이밍으로 애니메이션) */
  const onMainTokenPlaced = (data: unknown) => {
    const payload = data as { roomId?: string; playerIndex?: number; plateIndex?: number; countP1?: number; countP2?: number };
    if (payload?.roomId !== roomState.roomId) return;
    if (payload.playerIndex === roomState.playerIndex) return;
    const plateIndex = payload.plateIndex ?? -1;
    if (plateIndex < 0) return;
    const countP1 = payload.countP1 ?? 0;
    const countP2 = payload.countP2 ?? 0;
    plateTokensByPlayer[plateIndex] = { 0: countP1, 1: countP2 };
    /* 상대(토큰 놓은 사람) 닉네임 아래 보유 토큰 감소: 숫자 갱신 + 슬롯에서 원 하나 제거 */
    if (payload.playerIndex === 0) {
      heldTokensP1 = Math.max(0, heldTokensP1 - 1);
    } else {
      heldTokensP2 = Math.max(0, heldTokensP2 - 1);
    }
    updateTokenLabels();
    const opponentSlot = document.querySelector(
      `.player-slot[data-slot="${payload.playerIndex}"] .player-tokens`
    ) as HTMLElement | null;
    const firstToken = opponentSlot?.querySelector(".player-token");
    if (firstToken) {
      firstToken.classList.add("game-token--removing");
      setTimeout(() => firstToken.remove(), 300);
    }
    const plateNum = plateIndex + 1;
    const msgEl = document.getElementById("gameCenterMessage");
    if (msgEl) msgEl.innerHTML = `<span class="game-center-highlight">${plateNum}</span>번 접시에 토큰 1개를 더 놓았습니다`;
    document.querySelectorAll("#gamePlateRing .game-plate").forEach((el) => el.classList.remove("game-plate--placeable"));
    /* 플레이어와 동일: 200ms 후 접시에 토큰 표시, 400ms 후 두 뚜껑 닫기 */
    setTimeout(() => {
      setPlateTokens(plateIndex, { 0: countP1, 1: countP2 });
    }, 200);
    if (opponentSelectedPlatesForMain) {
      const [pa, pb] = opponentSelectedPlatesForMain;
      const lidA = document.querySelector(
        `#gamePlateRing .game-plate-lid[data-plate-index="${pa}"]`
      ) as HTMLElement | null;
      const lidB = document.querySelector(
        `#gamePlateRing .game-plate-lid[data-plate-index="${pb}"]`
      ) as HTMLElement | null;
      const recoverLid = (lid: HTMLElement | null) => {
        if (!lid) return;
        lid.classList.remove("game-plate-lid--uncover");
        lid.classList.remove("game-plate-lid--covered");
        lid.offsetHeight;
        lid.classList.add("game-plate-lid--covered");
      };
      setTimeout(() => {
        recoverLid(lidA);
        recoverLid(lidB);
      }, 400);
      opponentSelectedPlatesForMain = null;
    }
  };
  gameSocket.on("game:mainTokenPlaced", onMainTokenPlaced);

  /** 서버에서 턴 전환 알림: UI 턴 표시 갱신, 타이머 처음부터 재시작 */
  const onTurnSwitch = (data: unknown) => {
    const payload = data as { roomId?: string; currentTurn?: 0 | 1 };
    if (payload?.roomId !== roomState.roomId) return;
    const next = payload.currentTurn === 0 || payload.currentTurn === 1 ? payload.currentTurn : currentTurn;
    currentTurn = next;
    const slots = document.getElementById("roomPlayers")?.querySelectorAll(".player-slot");
    slots?.forEach((slot, i) => {
      slot.classList.toggle("player-slot--turn", gamePhase === "playing" && i === currentTurn);
    });
    /* 메인 단계에서는 'x번 접시에 토큰 1개를 더 놓았습니다' 문구가 잠시 보이도록 갱신 지연 */
    if (transitionToMainDone && gameSubPhase === "main") {
      setTimeout(() => updateCenterMessageForWaiting(), LID_ANIMATION_MS);
    } else {
      updateCenterMessageForWaiting();
    }
    startTimer();
  };
  gameSocket.on("game:turnSwitch", onTurnSwitch);

  function renderGameArea(): void {
    const content = document.getElementById("gameAreaContent");
    if (!content) return;
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    if (gamePhase === "ready") {
      const readySection = isHost
        ? `<button type="button" class="game-ready-btn" id="readyBtn" disabled>Ready</button>`
        : `<p class="game-phase-label game-phase-label--waiting" aria-live="polite">방장이 게임을 시작할 때까지 기다리는 중…</p>`;
      content.innerHTML = `
        <p class="game-phase-label" aria-live="polite"></p>
        ${readySection}
      `;
      const readyBtn = content.querySelector("#readyBtn") as HTMLButtonElement | null;
      if (readyBtn) {
        readyBtn.addEventListener("click", () => {
          gameSocket?.emit("game:start", { roomId: roomState.roomId });
        });
      }
    } else {
      document.getElementById("gameRoom")?.classList.add("game-room--playing");
      document.getElementById("gameArea")?.classList.add("game-area--playing");
      const centerMsg = GAME_CENTER_MESSAGE.trim() || "\u00A0";
      const count = plateCount;
      const platesHtml = Array.from({ length: count }, (_, i) => {
        const angle = (360 / count) * i;
        const num = i + 1;
        return `
          <div class="game-plate" data-plate-index="${i}" style="--plate-angle: ${angle}deg" role="button" tabindex="0" aria-label="접시 ${num}">
            <span class="game-plate-number" aria-hidden="true">${num}</span>
            <div class="game-plate-tokens" aria-hidden="true"></div>
          </div>
          <div class="game-plate-lid" data-plate-index="${i}" style="--plate-angle: ${angle}deg" aria-hidden="true"></div>`;
      }).join("");
      content.innerHTML = `
        <div class="game-plate-ring" id="gamePlateRing">
          ${platesHtml}
          <div class="game-center-zone">
            <div id="gameTimer" class="game-timer">${formatTimer(timerSecondsLeft)}</div>
            <div id="gameCenterMessage" class="game-center-message">${esc(centerMsg)}</div>
          </div>
        </div>
        <div id="gameMainContent" class="game-main-content"></div>
      `;
      const ringEl = content.querySelector(".game-plate-ring");
      ringEl?.addEventListener("click", (e) => {
        if (gameEnded) return;
        const target = e.target as HTMLElement;
        /* 내 턴일 때만 클릭 처리: 메인 단계는 턴 소유자(선·후수 모두), round 단계는 턴 소유자만 */
        const isMyTurn = currentTurn === roomState.playerIndex;
        const canActMain = gameSubPhase === "main" && isMyTurn && !inputBlocked;
        if (canActMain) {
          if (mainSubPhase === "placeToken") {
            const plate = target.closest(".game-plate.game-plate--placeable");
            if (plate) {
              const indexStr = plate.getAttribute("data-plate-index");
              if (indexStr !== null) {
                const index = parseInt(indexStr, 10);
                if (!Number.isNaN(index)) placeTokenOnPlate(index);
              }
              return;
            }
          }
          const lid = target.closest(".game-plate-lid");
          if (lid) {
            const indexStr = lid.getAttribute("data-plate-index");
            if (indexStr !== null) {
              const index = parseInt(indexStr, 10);
              if (!Number.isNaN(index)) toggleMainPlateSelection(index);
            }
            return;
          }
        }
        /* round 단계: 접시 클릭 시 턴/inputBlocked는 onPlateClick에서 검사 */
        const plate = target.closest(".game-plate");
        if (!plate) return;
        const indexStr = plate.getAttribute("data-plate-index");
        if (indexStr === null) return;
        const index = parseInt(indexStr, 10);
        if (!Number.isNaN(index)) onPlateClick(index);
      });
      ringEl?.addEventListener("keydown", (e: Event) => {
        if (gameEnded) return;
        const ke = e as KeyboardEvent;
        if (ke.key !== "Enter" && ke.key !== " ") return;
        const plate = (e.target as HTMLElement).closest(".game-plate");
        if (!plate) return;
        ke.preventDefault();
        const indexStr = plate.getAttribute("data-plate-index");
        if (indexStr === null) return;
        const index = parseInt(indexStr, 10);
        if (!Number.isNaN(index)) onPlateClick(index);
      });
      startTimer();
      updateCenterMessageForWaiting();
    }
  }

  renderGameArea();

  const backBtn = document.getElementById("backToLobbyBtn") as HTMLButtonElement;
  backBtn.addEventListener("click", () => {
    backBtn.disabled = true;
    doLeaveRoom({ emitSocketLeave: true, reenableBackBtn: true });
  });

  /** 자기 턴이 아닐 때 나가기 외 영역 클릭 시 공지 표시 */
  const gameWrap = document.getElementById("gameWrap");
  if (gameWrap) {
    gameWrap.addEventListener("click", (e: Event) => {
      if (gameEnded) return;
      const target = e.target as HTMLElement;
      if (gamePhase !== "playing") return;
      if (currentTurn === roomState.playerIndex) return;
      if (target.closest("#backToLobbyBtn")) return;
      showNotice("본인 차례가 아닐때는 클릭할 수 없습니다");
    });
  }

  function updateGameUI(room: ApiRoom | null): void {
    const playersEl = document.getElementById("roomPlayers");
    if (!room) return;
    currentTurn = room.currentTurn ?? 0;
    if (room.firstPlayerIndex === 0 || room.firstPlayerIndex === 1) {
      firstPlayerIndex = room.firstPlayerIndex;
    }
    const p1Name = room.player1?.name ?? "대기 중";
    const p2Name = room.player2?.name ?? "대기 중";
    const myIndex = roomState.playerIndex;
    const slots = playersEl?.querySelectorAll(".player-slot");
    if (slots && slots.length >= 2) {
      const names = [p1Name, p2Name];
      slots.forEach((slot, i) => {
        const nameEl = slot.querySelector(".player-name");
        const badgeEl = slot.querySelector(".player-badge");
        if (nameEl) nameEl.textContent = names[i] ?? "대기 중";
        if (badgeEl) {
          (badgeEl as HTMLElement).hidden = i !== myIndex;
        }
        slot.classList.toggle("player-slot--me", i === myIndex);
        slot.classList.toggle("player-slot--turn", gamePhase === "playing" && i === currentTurn);
      });
    }
    // 준비 단계: 방장만 Ready 버튼 표시, 두 명이 모두 들어왔을 때만 활성화
    if (gamePhase === "ready" && isHost) {
      const readyBtn = document.getElementById("readyBtn") as HTMLButtonElement | null;
      if (readyBtn) {
        const bothJoined = Boolean(room.player1 && room.player2);
        readyBtn.disabled = !bothJoined;
      }
    }
  }

  async function pollRoom(): Promise<void> {
    const room = await fetchRoom(roomState.roomId);
    updateGameUI(room);
  }

  pollRoom();
  if (roomPollIntervalId) clearInterval(roomPollIntervalId);
  roomPollIntervalId = setInterval(pollRoom, ROOM_POLL_INTERVAL_MS);
}

// ---------- 진입점 ----------
function init(): void {
  /** 접속하자마자 Socket.IO 연결 → 서버에서 [접속] / [로그인] 로그 */
  ensureSocketConnected();

  /** 새로 고침 시 방 정보만 제거 (로비부터 다시). 로그인은 유지(자동 로그인) */
  clearRoomState();

  const user = getStoredUser();
  const room = getRoomState();
  if (!user) {
    renderLogin();
    return;
  }
  if (room) {
    renderGame();
    return;
  }
  renderLobby();
}

init();

export { };
