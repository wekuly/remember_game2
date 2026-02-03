"use strict";
/**
 * 게임 방 UI: 방 정보 표시, 대기 중 / 준비 완료 상태
 * (실제 게임 로직·Socket.IO 연동은 추후 확장)
 */
const GAME_API_BASE = window.location.origin;
const GAME_STORAGE_KEY_ROOM = "remember_game2_room";
const ROOM_POLL_INTERVAL_MS = 2000;
function getRoomState() {
    try {
        const raw = sessionStorage.getItem(GAME_STORAGE_KEY_ROOM);
        if (!raw)
            return null;
        const data = JSON.parse(raw);
        if (data &&
            typeof data === "object" &&
            "roomId" in data &&
            "playerIndex" in data &&
            "code" in data) {
            return data;
        }
    }
    catch {
        // ignore
    }
    return null;
}
async function fetchRoom(roomId) {
    try {
        const res = await fetch(`${GAME_API_BASE}/api/rooms/${encodeURIComponent(roomId)}`);
        const data = (await res.json());
        if (!data.ok || !data.room)
            return null;
        return data.room;
    }
    catch {
        return null;
    }
}
function gameEscapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
}
function updateUI(room, state) {
    const statusEl = document.getElementById("gameStatus");
    const codeEl = document.getElementById("roomCode");
    const playersEl = document.getElementById("roomPlayers");
    const stateEl = document.getElementById("roomState");
    const p1Name = room.player1?.name ?? "대기 중";
    const p2Name = room.player2?.name ?? "대기 중";
    const isReady = room.player1 != null && room.player2 != null;
    if (statusEl) {
        statusEl.textContent =
            state.playerIndex === 0
                ? "방장입니다. 상대가 참가할 때까지 기다려 주세요."
                : "참가했습니다. 게임이 시작되면 여기서 진행됩니다.";
    }
    if (codeEl) {
        codeEl.textContent = `초대 코드: ${room.code}`;
    }
    if (playersEl) {
        playersEl.textContent = `1P: ${p1Name}  ·  2P: ${p2Name}`;
    }
    if (stateEl) {
        stateEl.textContent = isReady ? "준비 완료" : "상대 대기 중…";
    }
}
function gameInit() {
    const state = getRoomState();
    if (!state) {
        window.location.href = "/lobby.html";
        return;
    }
    const roomState = state;
    async function pollRoom() {
        const room = await fetchRoom(roomState.roomId);
        if (!room) {
            const statusEl = document.getElementById("gameStatus");
            if (statusEl)
                statusEl.textContent = "방 정보를 불러올 수 없습니다.";
            return;
        }
        updateUI(room, roomState);
    }
    pollRoom();
    const intervalId = setInterval(pollRoom, ROOM_POLL_INTERVAL_MS);
    window.addEventListener("beforeunload", () => clearInterval(intervalId));
}
gameInit();
