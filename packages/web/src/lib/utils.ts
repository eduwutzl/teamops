import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const compact = (n: number | null | undefined) => (n == null ? '—' : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : new Intl.NumberFormat('pt-BR').format(Math.round(n)));
export const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n)}%`);
export const bytes = (n: number | null | undefined) => (n == null ? '—' : n >= 1e12 ? `${(n / 1e12).toFixed(1)} TB` : n >= 1e9 ? `${(n / 1e9).toFixed(0)} GB` : `${(n / 1e6).toFixed(0)} MB`);
export const duration = (ms: number | null | undefined) => (ms == null ? '—' : ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`);

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' });
/** "há 5 min", "em 2 h" */
export function relative(iso: string | number | null | undefined): string {
  if (!iso) return '—';
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return diff < 0 ? 'agora há pouco' : 'em instantes';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
export const dateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const weekdayTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
