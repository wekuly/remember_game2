/**
 * 서버용 유틸
 */

/** 고유 ID 생성 (방 id, 매칭 큐 등) */
export function generateId(prefix = ""): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 9);
  return prefix ? `${prefix}_${t}${r}` : `${t}${r}`;
}
