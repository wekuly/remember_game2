"use strict";
/**
 * 로비 화면: 방 만들기, 참가 가능한 방 목록, 참가 후 게임 UI로 이동
 */
const LOBBY_API_BASE = window.location.origin;
const LOBBY_STORAGE_KEY_USER = "remember_game2_user";
const LOBBY_STORAGE_KEY_ROOM = "remember_game2_room";
const ROOM_LIST_INTERVAL_MS = 3000;
function getPlayerName() {
    try {
        const raw = localStorage.getItem(LOBBY_STORAGE_KEY_USER);
        if (!raw)
            return "플레이어";
        const user = JSON.parse(raw);
        return String(user?.name ?? "").trim() || "플레이어";
    }
    catch {
        return "플레이어";
    }
}
function saveRoomState(roomId, playerIndex, code) {
    sessionStorage.setItem(LOBBY_STORAGE_KEY_ROOM, JSON.stringify({ roomId, playerIndex, code }));
}
async function fetchJoinableRooms() {
    const res = await fetch(`${LOBBY_API_BASE}/api/rooms`);
    const data = (await res.json());
    if (!data.ok || !Array.isArray(data.rooms))
        return [];
    return data.rooms;
}
async function createRoom() {
    const res = await fetch(`${LOBBY_API_BASE}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
    });
    const data = (await res.json());
    if (!data.ok || !data.roomId || !data.code) {
        throw new Error(data.error ?? "방 생성에 실패했습니다.");
    }
    return { roomId: data.roomId, code: data.code };
}
async function joinRoom(roomId, playerName) {
    const res = await fetch(`${LOBBY_API_BASE}/api/rooms/${encodeURIComponent(roomId)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName }),
    });
    const data = (await res.json());
    if (!data.ok || data.playerIndex === undefined) {
        throw new Error(data.error ?? "방 참가에 실패했습니다.");
    }
    return { playerIndex: data.playerIndex };
}
function renderRoomList(rooms, container, hint) {
    if (rooms.length === 0) {
        container.innerHTML = '<p class="lobby-hint">참가 가능한 방이 없습니다.</p>';
        hint.textContent = "방 만들기 후 다른 사용자가 여기서 참가할 수 있습니다.";
        return;
    }
    hint.textContent = "";
    container.innerHTML = rooms
        .map((room) => {
        const p1 = room.player1?.name ?? "대기 중";
        return `
          <div class="room-item" data-room-id="${room.id}" data-room-code="${room.code}">
            <div>
              <span class="room-item-code">${lobbyEscapeHtml(room.code)}</span>
              <span class="room-item-player"> · ${lobbyEscapeHtml(p1)}</span>
            </div>
            <button type="button" class="lobby-btn join" data-room-id="${room.id}" data-room-code="${room.code}">참가</button>
          </div>
        `;
    })
        .join("");
}
function lobbyEscapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
}
function lobbyInit() {
    const userInfo = document.getElementById("userInfo");
    const logoutBtn = document.getElementById("logoutBtn");
    const createRoomBtn = document.getElementById("createRoomBtn");
    const roomListEl = document.getElementById("roomList");
    const roomListHint = document.getElementById("roomListHint");
    if (!userInfo)
        return;
    const raw = localStorage.getItem(LOBBY_STORAGE_KEY_USER);
    if (!raw) {
        userInfo.textContent = "저장된 정보가 없습니다.";
        window.location.href = "/";
        return;
    }
    try {
        const user = JSON.parse(raw);
        userInfo.innerHTML = `로그인됨: <strong>${lobbyEscapeHtml(String(user?.name ?? ""))}</strong>`;
    }
    catch {
        userInfo.textContent = "저장된 정보가 없습니다.";
        window.location.href = "/";
        return;
    }
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem(LOBBY_STORAGE_KEY_USER);
            sessionStorage.removeItem(LOBBY_STORAGE_KEY_ROOM);
            window.location.href = "/";
        });
    }
    if (createRoomBtn) {
        createRoomBtn.addEventListener("click", async () => {
            createRoomBtn.disabled = true;
            try {
                const { roomId, code } = await createRoom();
                const playerName = getPlayerName();
                const { playerIndex } = await joinRoom(roomId, playerName);
                saveRoomState(roomId, playerIndex, code);
                window.location.href = "/game.html";
            }
            catch (err) {
                alert(err instanceof Error ? err.message : "방 생성에 실패했습니다.");
                createRoomBtn.disabled = false;
            }
        });
    }
    async function loadRoomList() {
        if (!roomListEl || !roomListHint)
            return;
        try {
            const rooms = await fetchJoinableRooms();
            renderRoomList(rooms, roomListEl, roomListHint);
            roomListEl.querySelectorAll(".lobby-btn.join").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    const roomId = btn.dataset.roomId;
                    const code = btn.dataset.roomCode;
                    if (!roomId || !code)
                        return;
                    btn.disabled = true;
                    try {
                        const playerName = getPlayerName();
                        const { playerIndex } = await joinRoom(roomId, playerName);
                        saveRoomState(roomId, playerIndex, code);
                        window.location.href = "/game.html";
                    }
                    catch (err) {
                        alert(err instanceof Error ? err.message : "참가에 실패했습니다.");
                        btn.disabled = false;
                    }
                });
            });
        }
        catch {
            if (roomListEl)
                roomListEl.textContent = "방 목록을 불러올 수 없습니다.";
        }
    }
    loadRoomList();
    setInterval(loadRoomList, ROOM_LIST_INTERVAL_MS);
}
lobbyInit();
