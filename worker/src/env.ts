export interface Env {
  AI: Ai;
  DB: D1Database;
  FILES: R2Bucket;
  VEC: VectorizeIndex;
  ASSETS: Fetcher;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
  ADMIN_TOKEN?: string;
  AUTH_SECRET?: string;
  /** "1" in local dev only: honour the x-gearcast-as-of header (parity tests) and ?no_llm=1 on drafts. */
  DEV_MODE?: string;
  TZ_OFFSET_MIN?: string;
  LIMIT_LLM_CALLS_DAY?: string; LIMIT_EMBED_TEXTS_DAY?: string; LIMIT_UPLOADS_DAY?: string; LIMIT_UPLOAD_MB_DAY?: string;
  LIMIT_PDF_WRITES_DAY?: string; LIMIT_PHOTOS_DAY?: string; LIMIT_STORAGE_MB?: string;
}
