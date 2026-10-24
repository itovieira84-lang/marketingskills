/** Limitador simples de requisições por minuto (janela deslizante, por processo). */
export class RateLimiter {
  private stamps: number[] = [];
  constructor(private perMinute: number) {}

  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.stamps = this.stamps.filter((t) => now - t < 60_000);
      if (this.stamps.length < this.perMinute) {
        this.stamps.push(now);
        return;
      }
      await new Promise((r) => setTimeout(r, 60_000 - (now - this.stamps[0]) + 5));
    }
  }
}

/** Atraso exponencial com teto, usado nas novas tentativas do orquestrador. */
export function backoffMs(attempt: number, baseMs = 2_000, capMs = 5 * 60_000): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
}
