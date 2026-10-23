import type { TradeProfile, AnalysisField, Instrument, TagCategory, Trade, TradeFilters } from '../types';

// Relative so the app works from any origin (local dev proxied by Vite, prod served by Nginx)
const BASE_URL = `${import.meta.env.BASE_URL}api`;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Trades ────────────────────────────────────────────────
export async function fetchTrades(filters?: TradeFilters): Promise<Trade[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.contractType) params.set('contractType', filters.contractType);
  if (filters?.instrumentId) params.set('instrumentId', String(filters.instrumentId));
  const qs = params.toString();
  return request<Trade[]>(`/trades${qs ? `?${qs}` : ''}`);
}

export async function fetchTrade(id: number): Promise<Trade> {
  return request<Trade>(`/trades/${id}`);
}

export async function createTrade(trade: Partial<Trade>): Promise<{ id: number }> {
  return request<{ id: number }>(`/trades`, { method: 'POST', body: JSON.stringify(trade) });
}

export async function updateTrade(id: number, trade: Partial<Trade>): Promise<void> {
  await request(`/trades/${id}`, { method: 'PUT', body: JSON.stringify(trade) });
}

export async function deleteTrade(id: number): Promise<void> {
  await request(`/trades/${id}`, { method: 'DELETE' });
}

// ── Instruments ───────────────────────────────────────────
export async function fetchInstruments(): Promise<Instrument[]> {
  return request<Instrument[]>(`/instruments`);
}

export async function createInstrument(data: Omit<Instrument, 'id'>): Promise<Instrument> {
  return request<Instrument>(`/instruments`, { method: 'POST', body: JSON.stringify(data) });
}

export async function updateInstrument(id: number, data: Partial<Instrument>): Promise<void> {
  await request(`/instruments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function deleteInstrument(id: number): Promise<void> {
  await request(`/instruments/${id}`, { method: 'DELETE' });
}

// ── Tags ──────────────────────────────────────────────────
export async function fetchTagCategories(): Promise<TagCategory[]> {
  return request<TagCategory[]>(`/tags/categories`);
}

export async function createTagCategory(name: string): Promise<TagCategory> {
  return request<TagCategory>(`/tags/categories`, { method: 'POST', body: JSON.stringify({ name }) });
}

export async function createTag(categoryId: number, name: string): Promise<void> {
  await request(`/tags/categories/${categoryId}/tags`, { method: 'POST', body: JSON.stringify({ name }) });
}

export async function deleteTag(tagId: number): Promise<void> {
  await request(`/tags/tags/${tagId}`, { method: 'DELETE' });
}

export async function deleteTagCategory(categoryId: number): Promise<void> {
  await request(`/tags/categories/${categoryId}`, { method: 'DELETE' });
}

// ── Snapshots ─────────────────────────────────────────────
export async function uploadSnapshot(tradeId: number, file: File | Blob, ctx?: { name?: string; entry?: string }): Promise<{ id:number; filePath: string }> {
  const formData = new FormData();
  formData.append('snapshot', file, file instanceof File ? file.name : 'clipboard.png');
  const qs = new URLSearchParams();
  if (ctx?.name) qs.set('instrumentName', ctx.name);
  if (ctx?.entry) qs.set('entry', ctx.entry);
  const res = await fetch(`${BASE_URL}/trades/${tradeId}/snapshots${qs.toString() ? `?${qs}` : ''}`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
  return res.json();
}

export async function deleteSnapshot(snapshotId: number): Promise<void> {
  await request(`/trades/snapshots/${snapshotId}`, { method: 'DELETE' });
}

// ── CSV export ────────────────────────────────────────────
export const SNAPSHOT_BASE_URL = '';
export const fetchProfiles = () => request<TradeProfile[]>('/profiles');
export const saveProfile = (id: string, fields: AnalysisField[]) => request('/profiles/' + id, { method: 'PUT', body: JSON.stringify({ fields }) });
