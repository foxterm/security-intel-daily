import { createContext, useContext, type ReactNode } from 'react';

const translations = {
  // Header
  eyebrow: 'FoxTerm Security Intel',
  title: 'Server & Security Intel',
  subtitle: 'Daily aggregation of public security sources into traceable intelligence reports.',
  scheduleHint: 'Daily automated collection',
  generate: 'Generate',
  generating: 'Generating...',
  stop: 'Stop',

  // Stats bar
  lastGenerated: 'Last generated',
  items: 'items',
  topics: 'topics',
  source: 'Sources',

  // Pipeline
  stageFetch: 'Fetch',
  stageFilter: 'Filter & Summarize',
  stageAnalyze: 'Analyze',
  stageWrite: 'Write',

  // Live phase hints
  phaseIdle: 'Preparing...',
  phaseFetched: 'Collected security candidates, filtering & summarizing...',
  phaseCurated: 'Filtered valuable security content, generating summaries...',
  phaseSummarized: 'Summaries done, analyzing security trends...',
  phaseAnalyzed: 'Analysis complete, writing final security report...',
  phaseWriting: 'Writing security report, almost done...',
  phaseDone: 'Security report ready',

  // Feed
  feedLabel: 'Security Feed',
  feedTitle: 'Security Feed',
  refresh: 'Refresh',
  newItems: 'New Items',
  recurring: 'Ongoing',
  emptyFeed: 'No items yet. Click "Generate" to start.',
  noNewBanner: 'No new security trends found. Here are recent items still worth noting.',
  sourceLabel: 'Source',
  score: 'score',

  // Sidebar
  reportsLabel: 'Security Reports',
  reportsTitle: 'Reports',
  reportCount: '',
  latest: 'Latest',
  viewReport: 'View full report',
  noSummary: 'No summary',
  noHistory: 'No report history',
  noHistoryHint: 'Reports will appear here after generation',
  deleteReport: 'Delete report',
  confirmDelete: 'Delete this report?',

  // Trigger badge
  triggerSchedule: 'Scheduled',
  triggerManual: 'Manual',

  // Status
  statusEmpty: 'Pending',
  statusRunning: 'Running',
  statusSuccess: 'Done',
  statusFailed: 'Failed',

  // Time
  noTime: 'Not generated',
  unknownTime: 'Unknown',

  // Mini typing card
  writingReport: 'Writing report',
  chars: 'chars',
  expandClick: 'Click to expand →',

  // Drawer
  liveWriting: 'Live Writing',
  fullReport: 'Full Report',
  writingTitle: 'Writing security report...',
  reportTitle: 'Security Report',

  // Onboarding
  onboardingTitle: 'FoxTerm Security Intel Daily',
  onboardingDesc: 'Daily automated collection from Hacker News, The Hacker News, CISA, GitHub Advisory and more into traceable security intelligence reports.',
  onboardingFeature1: 'Multi-source',
  onboardingFeature2: 'Smart Analysis',
  onboardingFeature3: 'Daily Updates',
  onboardingCta: 'Generate first report',
  onboardingGenerating: 'Generating...',

  // Drawer extras
  liveTag: 'Live generating',
  drawerLoading: 'Loading report...',
  reportItems: 'items',
  reportNew: 'new',
  noMoreHistory: 'No more history',
  close: 'Close',

  // Live phase tags
  phaseTagFetched: 'Fetched',
  phaseTagCurated: 'Curated',
  phaseTagSummarized: 'Summarized',
  otherCategory: 'Other',
  unknownTimeLabel: 'Unknown',
  fallbackSummary: 'update',

  // Deploy FAB
  deployButton: 'FoxTerm',
  deployDesc: 'Visit {link} for server management tools.',
  deployLink: 'foxterm.app',
} as const;

export type TranslationKey = keyof typeof translations;

const I18nContext = createContext<{
  t: (key: TranslationKey) => string;
}>({
  t: (key) => translations[key],
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const t = (key: TranslationKey): string => {
    return translations[key] ?? key;
  };

  return (
    <I18nContext.Provider value={{ t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
