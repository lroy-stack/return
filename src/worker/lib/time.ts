export function nowIso(): string {
  return new Date().toISOString();
}

export function daysAgoIso(days: number, from = Date.now()): string {
  return new Date(from - days * 86_400_000).toISOString();
}
