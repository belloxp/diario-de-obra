const TZ = 'America/Sao_Paulo';

export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

/** 'YYYY-MM-DD' -> 'DD/MM/AAAA' */
export function formatDate(d: string): string {
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

export function formatDateLong(d: string): string {
  const date = new Date(`${d.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, timeStyle: 'short' }).format(new Date(iso));
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'Nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} dia${d > 1 ? 's' : ''}`;
  return formatDateTime(iso);
}

/** ISO -> valor de <input type="datetime-local"> no fuso de Brasília */
export function toDateTimeLocal(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** valor de datetime-local (fuso de Brasília, UTC-3 sem horário de verão) -> ISO UTC */
export function fromDateTimeLocal(value: string): string {
  return new Date(`${value}:00-03:00`).toISOString();
}

export function formatMm(mm: number): string {
  return `${mm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mm`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, days: last };
}

export function currentYear(): number {
  return Number(todayISO().slice(0, 4));
}

export function yearBounds(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/**
 * Semanas do ano no estilo GitHub (colunas = semanas, 7 linhas Dom..Sáb).
 * Dias fora do ano vêm como null (espaçadores invisíveis).
 */
export function buildYearWeeks(year: number): (string | null)[][] {
  const DAY = 86_400_000;
  const jan1 = Date.UTC(year, 0, 1);
  const dec31 = Date.UTC(year, 11, 31);
  const start = jan1 - new Date(jan1).getUTCDay() * DAY;
  const end = dec31 + (6 - new Date(dec31).getUTCDay()) * DAY;
  const weeks: (string | null)[][] = [];
  for (let t = start; t <= end; ) {
    const week: (string | null)[] = [];
    for (let d = 0; d < 7; d++, t += DAY) {
      const date = new Date(t);
      const iso = date.toISOString().slice(0, 10);
      week.push(date.getUTCFullYear() === year ? iso : null);
    }
    weeks.push(week);
  }
  return weeks;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function formatBytes(n: number | null): string {
  if (!n) return '';
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

export const DEVELOPER = {
  name: 'Guilherme Bello',
  github: (import.meta.env.VITE_DEVELOPER_GITHUB as string | undefined) || '',
};
