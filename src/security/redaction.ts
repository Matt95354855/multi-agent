const KEY_PATTERN = /(authorization|api[-_]?key|token|secret|password)/i;
const VALUE_PATTERNS = [/\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{12,}\b/g, /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi];

export function redactText(value: string): string {
  return VALUE_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), value);
}

export function redact<T>(value: T): T {
  if (typeof value === 'string') return redactText(value) as T;
  if (Array.isArray(value)) return value.map(item => redact(item)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, KEY_PATTERN.test(key) ? '[REDACTED]' : redact(item)])) as T;
  return value;
}
