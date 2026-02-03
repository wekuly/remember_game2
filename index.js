"use strict";
/**
 * remember_game2 진입점 (클라이언트/공용)
 * 1:1 온라인 게임: 로그인 → 로비(매칭) → 게임
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
// 타입·상수·유틸 (클라이언트/공용)
__exportStar(require("./types/types"), exports);
__exportStar(require("./constants/constants"), exports);
__exportStar(require("./util/util"), exports);
__exportStar(require("./login/login"), exports);
__exportStar(require("./lobby/lobby"), exports);
__exportStar(require("./game/game"), exports);
function main() {
    console.log("remember_game2 (1:1 온라인 게임)");
}
main();
//# sourceMappingURL=index.js.map