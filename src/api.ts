import type { HistoryEntry, PipelineEvent, StreamEvent, TrendReport } from './types';

export const API = {
  latest: './data/latest.json',
  history: './data/history.json',
} as const;

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.json() as T;
}

export async function fetchLatest(): Promise<TrendReport> {
  try {
    const res = await fetch(API.latest, { cache: 'no-store' });
    return await parseJson<TrendReport>(res);
  } catch {
    return {
      runId: '',
      status: 'empty',
      generatedAt: '',
      itemCount: 0,
      summary: '',
      reportMarkdown: '',
      trends: [],
      items: [],
    };
  }
}

export async function fetchHistory(): Promise<HistoryEntry[]> {
  try {
    const res = await fetch(API.history, { cache: 'no-store' });
    const data = await parseJson<HistoryEntry[]>(res);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchReportDetail(runId: string): Promise<TrendReport> {
  // In static mode, we only have the latest report - return it regardless of runId
  const latest = await fetchLatest();
  return latest;
}

export interface SSECallbacks {
  onStage?: (event: PipelineEvent) => void;
  onItems?: (event: Extract<StreamEvent, { type: 'items' }>) => void;
  onAnalysis?: (event: Extract<StreamEvent, { type: 'analysis' }>) => void;
  onToken?: (event: Extract<StreamEvent, { type: 'token' }>) => void;
}

/**
 * In static mode, "running" a report just reloads the latest data.
 * The actual generation happens via GitHub Actions.
 */
export async function runReportSSE(
  callbacks: SSECallbacks,
  _signal?: AbortSignal,
): Promise<TrendReport | null> {
  callbacks.onStage?.({ stage: 'fetch', status: 'running' });

  await new Promise(resolve => setTimeout(resolve, 300));
  callbacks.onStage?.({ stage: 'fetch', status: 'done', duration: 0.3 });

  const report = await fetchLatest();

  callbacks.onStage?.({ stage: 'curator', status: 'done', duration: 0 });
  callbacks.onStage?.({ stage: 'summarizer', status: 'done', duration: 0 });
  callbacks.onStage?.({ stage: 'analyst', status: 'done', duration: 0 });
  callbacks.onStage?.({ stage: 'writer', status: 'done', duration: 0 });

  if (report.items?.length) {
    callbacks.onItems?.({ type: 'items', phase: 'fetched', items: report.items });
    callbacks.onItems?.({ type: 'items', phase: 'curated', items: report.items });
    callbacks.onItems?.({ type: 'items', phase: 'summarized', items: report.items });
  }

  callbacks.onStage?.({ stage: 'complete', status: 'done', report });
  return report;
}

export async function stopReport(): Promise<boolean> {
  return true;
}

export async function deleteReport(_runId: string): Promise<boolean> {
  // Cannot delete in static mode
  return false;
}
