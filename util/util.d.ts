/**
 * 공용 유틸 (클라이언트/공유 로직)
 */
/** 고유 ID 생성 (간단 버전, 실서비스는 UUID 등 사용) */
export declare function generateId(prefix?: string): string;
/** 딜레이 (ms) */
export declare function delay(ms: number): Promise<void>;
/** 안전한 JSON 파싱 */
export declare function parseJSON<T>(json: string, fallback: T): T;
//# sourceMappingURL=util.d.ts.map