/**
 * SkinSignal DeepSeek Client — King Backend
 * Thin OpenAI-compatible wrapper with concurrency limit (3) and graceful fallback
 */

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_CONCURRENT = 3;

interface DeepSeekMsg { role: 'system' | 'user' | 'assistant'; content: string }

interface DeepSeekResp {
  choices: Array<{ message: DeepSeekMsg; finish_reason: string }>;
}

export interface DeepSeekOpts {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  requireJson?: boolean;
}

class Semaphore {
  private count: number;
  private queue: Array<() => void> = [];
  constructor(n: number) { this.count = n; }
  acquire(): Promise<void> {
    if (this.count > 0) { this.count--; return Promise.resolve(); }
    return new Promise(r => this.queue.push(r));
  }
  release(): void {
    if (this.queue.length) { this.queue.shift()!(); } else { this.count++; }
  }
}

const sem = new Semaphore(MAX_CONCURRENT);

function getApiKey(): string {
  const k = process.env.DEEPSEEK_API_KEY;
  if (!k) throw new Error('DEEPSEEK_API_KEY not set');
  return k;
}

function stripFences(s: string): string {
  return s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
}

export async function callDeepSeek(
  system: string,
  user: string,
  opts: DeepSeekOpts = {},
): Promise<string> {
  const model = opts.model ?? process.env.DEEPSEEK_MODEL_STATS ?? 'deepseek-chat';
  const temperature = opts.temperature ?? 0.3;
  const max_tokens = opts.maxTokens ?? 8192;
  const requireJson = opts.requireJson ?? true;

  await sem.acquire();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature,
      max_tokens,
    };
    if (requireJson) body.response_format = { type: 'json_object' };

    const resp = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getApiKey()}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!resp.ok) throw new Error(`DeepSeek ${resp.status}: ${await resp.text()}`);
    const data = (await resp.json()) as DeepSeekResp;
    return stripFences(data.choices[0]?.message?.content ?? '');
  } finally {
    clearTimeout(timer);
    sem.release();
  }
}

export async function parseDeepSeekJson<T>(
  system: string,
  user: string,
  fallback: () => T,
  opts: DeepSeekOpts = {},
): Promise<{ data: T | null; fromApi: boolean; error?: string }> {
  try {
    const raw = await callDeepSeek(system, user, opts);
    const parsed = JSON.parse(raw) as T;
    return { data: parsed, fromApi: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[skinsignal/deepseek] fallback: ${msg}`);
    try {
      return { data: fallback(), fromApi: false, error: msg };
    } catch {
      return { data: null, fromApi: false, error: msg };
    }
  }
}
