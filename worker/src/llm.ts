/** DeepSeek via the OpenAI-compatible API (port of backend llm.py; same request parameters). */
import type { Env } from './env';
import { charge } from './quota';

export const model = (env: Env) => env.DEEPSEEK_MODEL || 'deepseek-flash';
const base = (env: Env) => (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');

export class LLMError extends Error {
  constructor(public kind: string, msg: string) { super(msg); }
}

/** POST /chat/completions with one retry on network errors, 408/409/429 and 5xx (like openai max_retries=1). */
export async function chatCompletions(env: Env, body: any, signal?: AbortSignal): Promise<Response> {
  if (!env.DEEPSEEK_API_KEY) throw new LLMError('AuthenticationError', 'DEEPSEEK_API_KEY not set');
  await charge(env, 'llm', 'LIMIT_LLM_CALLS_DAY');
  let last: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${base(env)}/chat/completions`, {
        method: 'POST', signal: signal ?? AbortSignal.timeout(90_000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({ model: model(env), ...body }),
      });
      if (r.ok) return r;
      const kind = r.status === 401 ? 'AuthenticationError' : r.status === 429 ? 'RateLimitError' : r.status === 400 ? 'BadRequestError'
        : r.status >= 500 ? 'InternalServerError' : 'APIStatusError';
      last = new LLMError(kind, `${r.status} ${(await r.text()).slice(0, 300)}`);
      if (!(r.status === 408 || r.status === 409 || r.status === 429 || r.status >= 500)) throw last;
    } catch (e: any) {
      if (e instanceof LLMError && !['RateLimitError', 'InternalServerError'].includes(e.kind)) throw e;
      last = e instanceof LLMError ? e : new LLMError(e?.name === 'TimeoutError' ? 'APITimeoutError' : 'APIConnectionError', String(e));
    }
    if (attempt === 0) await new Promise(res => setTimeout(res, 600));
  }
  throw last;
}

/** Structured JSON output. Thinking disabled by default (fast; reasoning tokens can exhaust max_tokens). */
export async function completeJson(env: Env, system: string, user: string, maxTokens = 1500, think = false): Promise<any> {
  const extra = think ? { reasoning_effort: 'low', max_tokens: maxTokens + 6000 } : { thinking: { type: 'disabled' }, max_tokens: maxTokens };
  const r = await chatCompletions(env, {
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_object' }, ...extra,
  });
  const j: any = await r.json();
  const txt: string = j?.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(txt); } catch {
    const m = /\{[\s\S]*\}/.exec(txt);
    return m ? JSON.parse(m[0]) : {};
  }
}
