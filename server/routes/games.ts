/**
 * Express 라우터: 게임 결과 저장·조회
 * - POST /api/games/result  → 게임 결과 저장
 * - GET  /api/games/result → 결과 목록 (최신순, ?limit=20)
 */

import { Router, Request, Response } from "express";
import * as store from "../store/store";

const router = Router();

/** 게임 결과 저장 */
router.post("/result", (req: Request, res: Response) => {
  const body = (req.body as Record<string, unknown>) ?? {};
  const result = store.saveGameResult({
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
  res.status(201).json({
    ok: true,
    result: result.result,
  });
});

/** 게임 결과 목록 (최신순) */
router.get("/result", (req: Request, res: Response) => {
  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.limit), 10) || 20)
  );
  const results = store.getGameResults(limit);
  res.json({
    ok: true,
    results,
    count: results.length,
  });
});

export default router;
