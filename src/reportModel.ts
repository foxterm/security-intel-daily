import type { TrendReport } from './types';

export const EMPTY_REPORT: TrendReport = {
  status: 'empty',
  summary: 'No security intelligence report generated yet.',
  reportMarkdown: '# FoxTerm Security Intel Daily\n\nClick "Refresh" to load the latest security intelligence.',
  trends: [],
  items: [],
};

export function normalizeReport(input: Partial<TrendReport> | null | undefined): TrendReport {
  const normalized = {
    ...EMPTY_REPORT,
    ...(input ?? {}),
    status: input?.status ?? EMPTY_REPORT.status,
    reportMarkdown: input?.reportMarkdown ?? EMPTY_REPORT.reportMarkdown,
    summary: input?.summary ?? EMPTY_REPORT.summary,
    trends: Array.isArray(input?.trends) ? input.trends : [],
    items: Array.isArray(input?.items) ? input.items : [],
  };
  return normalized;
}
