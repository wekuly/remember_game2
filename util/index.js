"use strict";
/**
 * 공용 유틸 (클라이언트/공유 로직)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateId = generateId;
exports.delay = delay;
exports.parseJSON = parseJSON;
/** 고유 ID 생성 (간단 버전, 실서비스는 UUID 등 사용) */
function generateId(prefix = "") {
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 9);
    return prefix ? `${prefix}_${t}${r}` : `${t}${r}`;
}
/** 딜레이 (ms) */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** 안전한 JSON 파싱 */
function parseJSON(json, fallback) {
    try {
        return JSON.parse(json);
    }
    catch {
        return fallback;
    }
}
//# sourceMappingURL=index.js.map