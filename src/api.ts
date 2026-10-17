import type { DateEntry, PipelineEvent, StreamEvent, TrendReport } from './types';

export const API = {
  dataRoot: './data',
} as const;

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json() as T;
}

export async function fetchAvailableDates(): Promise<DateEntry[]> {
  try {
    const res = await fetch(`${API.dataRoot}/index.json`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        // Handle both old format (strings) and new format (objects)
        return data
          .map((item: any) => typeof item === 'string' ? { date: item, count: 0 } : item)
          .sort((a: DateEntry, b: DateEntry) => b.date.localeCompare(a.date));
      }
    }
  } catch {}
  try {
    const res = await fetch(API.dataRoot + '/', { cache: 'no-store' });
    const html = await res.text();
    const matches = html.match(/href="(\d{4}-\d{2}-\d{2})\/?"/g) || [];
    const dates = matches.map(m => m.match(/(\d{4}-\d{2}-\d{2})/)?.[1]).filter(Boolean) as string[];
    return dates.map(date => ({ date, count: 0 })).sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export async function fetchReportByDate(date: string): Promise<TrendReport | null> {
  try {
    const res = await fetch(`${API.dataRoot}/${date}/report.json`, { cache: 'no-store' });
    return await parseJson<TrendReport>(res);
  } catch {
    return null;
  }
}

export interface SSECallbacks {
  onStage?: (event: PipelineEvent) => void;
  onItems?: (event: Extract<StreamEvent, { type: 'items' }>) => void;
  onAnalysis?: (event: Extract<StreamEvent, { type: 'analysis' }>) => void;
  onToken?: (event: Extract<StreamEvent, { type: 'token' }>) => void;
}

export async function runReportSSE(
  callbacks: SSECallbacks,
  _signal?: AbortSignal,
): Promise<{ date: string; report: TrendReport } | null> {
  callbacks.onStage?.({ stage: 'fetch', status: 'running' });
  await new Promise(resolve => setTimeout(resolve, 300));
  callbacks.onStage?.({ stage: 'fetch', status: 'done', duration: 0.3 });

  const dates = await fetchAvailableDates();
  let report: TrendReport | null = null;
  let date: string | null = null;
  if (dates.length > 0) {
    date = dates[0].date;
    report = await fetchReportByDate(dates[0].date);
  }

  callbacks.onStage?.({ stage: 'curator', status: 'done', duration: 0 });
  callbacks.onStage?.({ stage: 'summarizer', status: 'done', duration: 0 });
  callbacks.onStage?.({ stage: 'analyst', status: 'done', duration: 0 });
  callbacks.onStage?.({ stage: 'writer', status: 'done', duration: 0 });

  if (report?.items?.length) {
    callbacks.onItems?.({ type: 'items', phase: 'fetched', items: report.items });
    callbacks.onItems?.({ type: 'items', phase: 'curated', items: report.items });
    callbacks.onItems?.({ type: 'items', phase: 'summarized', items: report.items });
  }

  callbacks.onStage?.({ stage: 'complete', status: 'done', report: report ?? { status: 'empty', reportMarkdown: '', trends: [], items: [] } });
  return report && date ? { date, report } : null;
}

export async function stopReport(): Promise<boolean> {
  return true;
}
