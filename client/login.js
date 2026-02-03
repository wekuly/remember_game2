"use strict";
/**
 * 로그인 화면 로직
 *
 * 현재: 로컬 스토리지에 닉네임 저장.
 * 추후 DB 연동 시 아래 주석 처리된 부분을 API 호출로 교체하면 됨.
 */
/** 로컬 스토리지 키 (DB 연동 시 세션/토큰 키로 교체 가능) */
const LOGIN_STORAGE_KEY_USER = "remember_game2_user";
/** 클라이언트용 서버 주소 (빌드 시 환경 변수로 오버라이드 가능) */
const LOGIN_API_BASE = "http://localhost:3000";
/**
 * 로컬 스토리지에서 저장된 사용자 조회
 *
 * [DB 연동 시]
 * - 여기서 토큰/세션 검증 API 호출 (예: GET /api/auth/me)
 * - 유효하면 사용자 정보 반환, 만료/무효면 null
 */
function getStoredUser() {
    try {
        const raw = localStorage.getItem(LOGIN_STORAGE_KEY_USER);
        if (!raw)
            return null;
        const parsed = JSON.parse(raw);
        if (parsed &&
            typeof parsed === "object" &&
            "id" in parsed &&
            "name" in parsed &&
            typeof parsed.name === "string") {
            return parsed;
        }
    }
    catch {
        // ignore
    }
    return null;
}
/**
 * 사용자 정보 저장 (현재: 로컬 스토리지)
 *
 * [DB 연동 시]
 * - POST /api/auth/login 또는 POST /api/users/login 호출
 * - 응답에서 토큰(JWT 등) + 사용자 정보 받아서
 * - localStorage 또는 httpOnly 쿠키에 토큰만 저장
 * - 예: localStorage.setItem("remember_game2_token", token);
 */
function saveUser(name) {
    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const user = { id, name };
    // ----- 현재: 로컬 스토리지 저장 -----
    localStorage.setItem(LOGIN_STORAGE_KEY_USER, JSON.stringify(user));
    // ----- [DB 연동 시] 아래처럼 API 호출 후 토큰 저장 -----
    /*
    const res = await fetch(`${LOGIN_API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password: "..." }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error ?? "로그인 실패");
    localStorage.setItem("remember_game2_token", data.token);
    return data.user;
    */
    return user;
}
function showError(el, message) {
    el.textContent = message;
    el.classList.remove("hidden");
}
function clearError(el) {
    el.textContent = "";
}
function setInputInvalid(input, invalid) {
    input.classList.toggle("invalid", invalid);
}
function loginInit() {
    const form = document.getElementById("loginForm");
    const nicknameInput = document.getElementById("nickname");
    const nicknameError = document.getElementById("nicknameError");
    const loginBtn = document.getElementById("loginBtn");
    if (!form || !nicknameInput || !nicknameError || !loginBtn)
        return;
    // [선택] 이미 로그인된 사용자가 있으면 로비로 바로 이동
    const stored = getStoredUser();
    if (stored && stored.name.trim()) {
        const lobbyPath = "/lobby.html";
        if (window.location.pathname !== lobbyPath) {
            window.location.href = lobbyPath;
            return;
        }
    }
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearError(nicknameError);
        setInputInvalid(nicknameInput, false);
        const name = nicknameInput.value.trim();
        if (name.length < 2) {
            showError(nicknameError, "닉네임은 2자 이상 입력해 주세요.");
            setInputInvalid(nicknameInput, true);
            nicknameInput.focus();
            return;
        }
        if (name.length > 12) {
            showError(nicknameError, "닉네임은 12자 이하로 입력해 주세요.");
            setInputInvalid(nicknameInput, true);
            return;
        }
        loginBtn.disabled = true;
        try {
            saveUser(name);
            window.location.href = "/lobby.html";
        }
        catch (err) {
            showError(nicknameError, err instanceof Error ? err.message : "로그인에 실패했습니다.");
            loginBtn.disabled = false;
        }
    });
}
loginInit();
