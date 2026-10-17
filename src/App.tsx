import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, SVGProps } from 'react';
import { runReportSSE, stopReport } from './api';
import { useI18n } from './i18n';
import MarkdownReport from './MarkdownReport';
import { ReportProvider, useReport } from './ReportContext';
import { EMPTY_REPORT, normalizeReport } from './reportModel';
import type { AnalystCategoryEvent, AnalystDeepDiveEvent, ItemPhase, PipelineEvent, TrendItem, TrendReport } from './types';
import styles from './App.module.css';

function formatTime(value?: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function StatusPill({ status }: { status?: string }) {
  const { t } = useI18n();
  const normalized = status || 'empty';
  const labels: Record<string, string> = {
    empty: t('statusEmpty'),
    running: t('statusRunning'),
    success: t('statusSuccess'),
    failed: t('statusFailed'),
  };
  return <span className={`${styles.status} ${styles[`status_${normalized}`] ?? ''}`}>{labels[normalized] ?? normalized}</span>;
}

function itemSummary(item?: TrendItem, fallbackLabel = 'update'): string {
  if (!item) return '';
  const summary = item.aiSummary || item.summary;
  return summary?.trim() || `${item.category || 'Security'} ${fallbackLabel}: ${item.title}`;
}

function getItemTitle(item: TrendItem): string {
  return item.title;
}

function formatItemTime(value?: string, fallbackLabel = 'Unknown'): string {
  if (!value) return fallbackLabel;
  return formatTime(value);
}

function getTopics(): string[] {
  return ['Vulnerability', 'Server Security', 'Network Security', 'Malware', 'Cloud & Infra', 'Data Breach'];
}

const DEFAULT_SOURCES = ['Hacker News', 'BleepingComputer', 'The Hacker News', 'GitHub Advisory'];

const PIPELINE_STAGES = [
  { key: 'fetch', i18nKey: 'stageFetch' as const, parallel: undefined },
  { key: 'filter', i18nKey: 'stageFilter' as const, parallel: ['curator', 'summarizer'] },
  { key: 'analyst', i18nKey: 'stageAnalyze' as const, parallel: undefined },
  { key: 'writer', i18nKey: 'stageWrite' as const, parallel: undefined },
] as const;

type StageStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

interface StageState {
  status: StageStatus;
  duration?: number;
  detail?: string;
}

/* ====================================
   Live Item Model (during generation)
   ==================================== */
interface LiveItem extends TrendItem {
  _phase?: ItemPhase;
  _categoryAssigned?: string;
  _categoryStatus?: 'new' | 'active' | 'single';
  _importance?: 'high' | 'medium' | 'low';
  _dropping?: boolean;
}

type LivePhase = 'idle' | 'fetched' | 'curated' | 'summarized' | 'analyzed' | 'writing' | 'done';

/* ====================================
   Inline SVG Icons (Lucide-style)
   ==================================== */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ children, size = 16, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

const IconCheck = (p: IconProps) => (
  <Icon {...p}><polyline points="20 6 9 17 4 12" /></Icon>
);
const IconX = (p: IconProps) => (
  <Icon {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Icon>
);
const IconSparkle = (p: IconProps) => (
  <Icon {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></Icon>
);
const IconHistory = (p: IconProps) => (
  <Icon {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></Icon>
);
const IconRefresh = (p: IconProps) => (
  <Icon {...p}><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M3 21v-5h5" /></Icon>
);
const IconTrendingUp = (p: IconProps) => (
  <Icon {...p}><polyline points="3 17 9 11 13 15 21 7" /><polyline points="14 7 21 7 21 14" /></Icon>
);
const IconPlay = (p: IconProps) => (
  <Icon {...p}><polygon points="6 4 20 12 6 20 6 4" /></Icon>
);
const IconStop = (p: IconProps) => (
  <Icon {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></Icon>
);
const IconBookmark = (p: IconProps) => (
  <Icon {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></Icon>
);
const IconArrowRight = (p: IconProps) => (
  <Icon {...p}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></Icon>
);
const IconArrowLeft = (p: IconProps) => (
  <Icon {...p}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></Icon>
);
const IconExternal = (p: IconProps) => (
  <Icon {...p}><path d="M15 3h6v6" /><path d="M10 14L21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></Icon>
);
const IconInbox = (p: IconProps) => (
  <Icon {...p}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></Icon>
);
const IconCompass = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></Icon>
);
const IconLayers = (p: IconProps) => (
  <Icon {...p}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></Icon>
);
const IconDatabase = (p: IconProps) => (
  <Icon {...p}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" /></Icon>
);
const IconClock = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Icon>
);
const IconRocket = (p: IconProps) => (
  <Icon {...p}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></Icon>
);
const IconGitHub = (p: IconProps) => (
  <Icon {...p}><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></Icon>
);
const IconChevronLeft = (p: IconProps) => (
  <Icon {...p}><polyline points="15 18 9 12 15 6" /></Icon>
);
const IconChevronRight = (p: IconProps) => (
  <Icon {...p}><polyline points="9 18 15 12 9 6" /></Icon>
);

function TriggerBadge({ trigger }: { trigger?: string }) {
  const { t } = useI18n();
  if (trigger === 'schedule') {
    return <span className={styles.triggerBadge} data-trigger="schedule"><IconClock size={11} /> {t('triggerSchedule')}</span>;
  }
  if (trigger === 'manual') {
    return <span className={styles.triggerBadge} data-trigger="manual"><IconPlay size={11} /> {t('triggerManual')}</span>;
  }
  return null;
}

/* ====================================
   Pipeline Bar
   ==================================== */
function PipelineBar({
  stages,
}: {
  stages: Record<string, StageState>;
}) {
  const { t } = useI18n();
  const getStageState = (def: typeof PIPELINE_STAGES[number]): StageState => {
    if ('parallel' in def && def.parallel) {
      const subs = def.parallel.map(k => stages[k] || { status: 'pending' as StageStatus });
      if (subs.every(s => s.status === 'done')) {
        const maxDur = Math.max(...subs.map(s => s.duration ?? 0));
        return { status: 'done', duration: maxDur };
      }
      if (subs.some(s => s.status === 'failed')) return { status: 'failed' };
      if (subs.some(s => s.status === 'running')) return { status: 'running' };
      return { status: 'pending' };
    }
    return stages[def.key] || { status: 'pending' as StageStatus };
  };

  const hasAnyActivity = Object.keys(stages).length > 0;
  if (!hasAnyActivity) return null;

  return (
    <div className={styles.pipelineBar}>
      {PIPELINE_STAGES.map((def, i) => {
        const state = getStageState(def);
        const prevState = i > 0 ? getStageState(PIPELINE_STAGES[i - 1]) : null;
        return (
          <div key={def.key} className={styles.pipelineStageWrap}>
            {i > 0 && (
              <div className={`${styles.stageConnector} ${
                prevState && (prevState.status === 'done' || prevState.status === 'failed') ? styles.stageConnectorActive : ''
              }`} />
            )}
            <div className={`${styles.pipelineStage} ${styles[`stage_${state.status}`] || ''}`}>
              <div className={styles.stageDot}>
                {state.status === 'done' && <IconCheck size={14} />}
                {state.status === 'failed' && <IconX size={14} />}
                {state.status === 'running' && <span className={styles.stagePulse} />}
              </div>
              <div className={styles.stageInfo}>
                <span className={styles.stageName}>{t(def.i18nKey)}</span>
                {state.duration != null && (
                  <span className={styles.stageDuration}>{state.duration.toFixed(0)}s</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ====================================
   Live Feed (during generation)
   ==================================== */
const LIVE_PHASE_KEYS: Record<LivePhase, string> = {
  idle: 'phaseIdle',
  fetched: 'phaseFetched',
  curated: 'phaseCurated',
  summarized: 'phaseSummarized',
  analyzed: 'phaseAnalyzed',
  writing: 'phaseWriting',
  done: 'phaseDone',
};

function LiveFeed({
  items,
  phase,
  analysis,
}: {
  items: LiveItem[];
  phase: LivePhase;
  analysis: { categories: AnalystCategoryEvent[]; deepDives?: AnalystDeepDiveEvent[]; keyInsight?: string } | null;
}) {
  const { t } = useI18n();
  const phaseHint = t(LIVE_PHASE_KEYS[phase] as any);
  const grouped = useMemo(() => {
    if (!analysis || !analysis.categories?.length) return null;
    const byId = new Map(items.map(i => [i.id, i]));
    const result: Array<{ name: string; items: LiveItem[] }> = [];
    const used = new Set<string>();
    for (const cat of analysis.categories) {
      const catItems = cat.items
        .map(ci => byId.get(ci.id))
        .filter((x): x is LiveItem => !!x);
      catItems.forEach(it => used.add(it.id));
      if (catItems.length) result.push({ name: cat.name, items: catItems });
    }
    const orphans = items.filter(it => !used.has(it.id));
    if (orphans.length) result.push({ name: t('otherCategory'), items: orphans });
    return result;
  }, [items, analysis]);

  return (
    <div className={styles.liveFeed}>
      <div className={styles.livePhaseBanner}>
        <span className={styles.livePhasePulse} />
        <span>{analysis?.keyInsight || phaseHint}</span>
      </div>

      {grouped ? (
        grouped.map(group => (
          <div key={group.name}>
            <div className={styles.feedGroupHeader}>
              <IconLayers />
              <span>{group.name}</span>
              <span className={styles.feedGroupBadge}>{group.items.length}</span>
            </div>
            {group.items.map(item => <LiveItemCard key={item.id} item={item} showScore={true} />)}
          </div>
        ))
      ) : (
        items.map(item => <LiveItemCard key={item.id} item={item} showScore={false} />)
      )}
    </div>
  );
}

function LiveItemCard({ item, showScore }: { item: LiveItem; showScore: boolean }) {
  const { t } = useI18n();
  const phaseClass =
    item._phase === 'summarized' ? styles.liveItemSummarized
      : item._phase === 'curated' ? styles.liveItemCurated
        : styles.liveItemFetched;
  const droppingClass = item._dropping ? styles.liveItemDropping : '';
  const importanceClass = item._importance === 'high' ? styles.liveItemHigh : '';
  return (
    <div className={`${styles.liveItemCard} ${phaseClass} ${droppingClass} ${importanceClass}`}>
      <div className={styles.newsMain}>
        <div className={styles.newsMetaTop}>
          <span className={styles.sourceBadge}>{item.source}</span>
          <span>{item.publishedAt ? formatTime(item.publishedAt) : ''}</span>
          {item._phase === 'fetched' && <span className={styles.livePhaseTag}>{t('phaseTagFetched')}</span>}
          {item._phase === 'curated' && <span className={styles.livePhaseTagCurated}>{t('phaseTagCurated')}</span>}
          {item._phase === 'summarized' && <span className={styles.livePhaseTagSummarized}>{t('phaseTagSummarized')}</span>}
          {item._categoryStatus === 'new' && <span className={styles.newBadge}>NEW</span>}
        </div>
        <strong>{getItemTitle(item)}</strong>
        {item._phase === 'summarized' && item.aiSummaryEn && (
          <p className={styles.liveSummaryFadeIn}>{item.aiSummaryEn}</p>
        )}
        {item._phase !== 'summarized' && item.summary && (
          <p style={{ opacity: 0.55 }}>{item.summary}</p>
        )}
      </div>
      <div className={styles.newsSideMeta}>
        <span>{item._categoryAssigned || item.category || 'Security'}</span>
        {showScore && item.score != null && <span>score {item.score}</span>}
      </div>
    </div>
  );
}

/* ====================================
   Mini Typing Card (sidebar, Writer streaming)
   ==================================== */
function MiniTypingCard({ text, onClick }: { text: string; onClick: () => void }) {
  const { t } = useI18n();
  const tail = text.slice(-220);
  return (
    <button type="button" className={styles.miniTypingCard} onClick={onClick}>
      <div className={styles.miniTypingHeader}>
        <span className={styles.miniTypingDot} />
        <span>{t('writingReport')}</span>
      </div>
      <div className={styles.miniTypingPreview}>
        <div className={styles.miniTypingPreviewInner}>
          {tail}
          <span className={styles.miniTypingCursor} />
        </div>
      </div>
      <div className={styles.miniTypingFooter}>
        <span>{text.length} {t('chars')}</span>
        <span>{t('expandClick')}</span>
      </div>
    </button>
  );
}

/* ====================================
   Deploy URL helper
   ==================================== */

function getDeployUrl(): string {
  return 'https://foxterm.app';
}

/* ====================================
   Skeleton Loaders
   ==================================== */
function SkeletonNewsCard() {
  return (
    <div className={styles.skeletonCard}>
      <div className={styles.skeletonMain}>
        <div className={`${styles.skeletonShimmer} ${styles.skeletonLine}`} style={{ width: '40%' }} />
        <div className={`${styles.skeletonShimmer} ${styles.skeletonTitle}`} style={{ width: '85%' }} />
        <div className={`${styles.skeletonShimmer} ${styles.skeletonLine} ${styles.skeletonSummary}`} style={{ width: '95%' }} />
        <div className={`${styles.skeletonShimmer} ${styles.skeletonLine}`} style={{ width: '70%' }} />
      </div>
      <div className={styles.skeletonMeta}>
        <div className={`${styles.skeletonShimmer} ${styles.skeletonLine}`} style={{ width: '60px' }} />
        <div className={`${styles.skeletonShimmer} ${styles.skeletonLine}`} style={{ width: '50px' }} />
        <div className={`${styles.skeletonShimmer} ${styles.skeletonLine}`} style={{ width: '40px' }} />
      </div>
    </div>
  );
}

function SkeletonNewsList() {
  return (
    <div className={styles.newsList}>
      <div className={styles.skeletonGroupHeader}>
        <div className={`${styles.skeletonShimmer} ${styles.skeletonLine}`} style={{ width: '90px' }} />
        <div className={`${styles.skeletonShimmer} ${styles.skeletonLine}`} style={{ width: '24px', height: '20px', borderRadius: '999px' }} />
      </div>
      {Array.from({ length: 4 }).map((_, i) => <SkeletonNewsCard key={i} />)}
    </div>
  );
}

function SkeletonReportItem() {
  return (
    <div className={styles.skeletonReportItem}>
      <div className={`${styles.skeletonShimmer} ${styles.skeletonLine}`} style={{ width: '60%' }} />
      <div className={`${styles.skeletonShimmer} ${styles.skeletonLine}`} style={{ width: '95%' }} />
      <div className={`${styles.skeletonShimmer} ${styles.skeletonLine}`} style={{ width: '40%' }} />
    </div>
  );
}

/* ====================================
   Empty State – Onboarding Hero
   ==================================== */
function OnboardingHero({ loading }: { loading: boolean }) {
  const { t } = useI18n();
  return (
    <div className={styles.onboardCard}>
      <div className={styles.onboardIconWrap}>
        <IconCompass size={28} />
      </div>
      <h3 className={styles.onboardTitle}>{t('onboardingTitle')}</h3>
      <p className={styles.onboardSubtitle}>{t('onboardingDesc')}</p>
      <div className={styles.onboardFeatureRow}>
        <span className={styles.onboardFeature}>
          <IconDatabase size={13} /> {t('onboardingFeature1')}
        </span>
        <span className={styles.onboardFeature}>
          <IconLayers size={13} /> {t('onboardingFeature2')}
        </span>
        <span className={styles.onboardFeature}>
          <IconTrendingUp size={13} /> {t('onboardingFeature3')}
        </span>
      </div>
    </div>
  );
}

/* ====================================
   Main App
   ==================================== */
function AppContent() {
  const { t } = useI18n();
  const { report, availableDates, currentDate, loading, bootstrapping, loadReportByDate, refresh, updateReport } = useReport();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pipelineStages, setPipelineStages] = useState<Record<string, StageState>>({});

  // Live (during-generation) state
  const [liveItems, setLiveItems] = useState<LiveItem[]>([]);
  const [livePhase, setLivePhase] = useState<LivePhase>('idle');
  const [liveAnalysis, setLiveAnalysis] = useState<
    { categories: AnalystCategoryEvent[]; deepDives?: AnalystDeepDiveEvent[]; keyInsight?: string } | null
  >(null);
  const [liveWriterText, setLiveWriterText] = useState('');
  const [streamingDrawerOpen, setStreamingDrawerOpen] = useState(false);
  const streamingDrawerOpenRef = useRef(false);
  useEffect(() => { streamingDrawerOpenRef.current = streamingDrawerOpen; }, [streamingDrawerOpen]);

  const drawerBodyRef = useRef<HTMLDivElement | null>(null);
  const activeRunRef = useRef<AbortController | null>(null);
  const droppingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const currentIndex = currentDate ? availableDates.indexOf(currentDate) : -1;
  const canGoPrev = currentIndex >= 0 && currentIndex < availableDates.length - 1;
  const canGoNext = currentIndex > 0;

  const goToPrevDate = useCallback(() => {
    if (!canGoPrev) return;
    loadReportByDate(availableDates[currentIndex + 1]);
  }, [canGoPrev, availableDates, currentIndex, loadReportByDate]);

  const goToNextDate = useCallback(() => {
    if (!canGoNext) return;
    loadReportByDate(availableDates[currentIndex - 1]);
  }, [canGoNext, availableDates, currentIndex, loadReportByDate]);

  const run = useCallback(async () => {
    activeRunRef.current?.abort();
    const controller = new AbortController();
    activeRunRef.current = controller;
    setGenerating(true);
    setPipelineStages({});
    setLiveItems([]);
    setLiveAnalysis(null);
    setLivePhase('idle');
    setLiveWriterText('');
    droppingTimersRef.current.forEach(t => clearTimeout(t));
    droppingTimersRef.current.clear();

    try {
      const result = await runReportSSE({
        onStage: (event: PipelineEvent) => {
          if (event.stage === 'complete' || event.stage === 'error') return;
          setPipelineStages(prev => ({
            ...prev,
            [event.stage]: {
              status: event.status as StageStatus,
              duration: event.duration,
              detail: event.detail,
            },
          }));
          if (event.stage === 'writer' && event.status === 'running') {
            setLivePhase('writing');
            setLiveWriterText('');
          }
        },

        onItems: (event) => {
          if (event.phase === 'fetched') {
            setLiveItems(event.items.map(it => ({ ...it, _phase: 'fetched' })));
            setLivePhase('fetched');
          } else if (event.phase === 'curated') {
            const newIds = new Set(event.items.map(it => it.id));
            const newById = new Map(event.items.map(it => [it.id, it]));
            setLiveItems(prev => prev.map(it => {
              if (newIds.has(it.id)) {
                const updated = newById.get(it.id);
                return {
                  ...it,
                  ...(updated ?? {}),
                  _phase: 'curated',
                  _dropping: false,
                };
              }
              return { ...it, _dropping: true };
            }));
            const timer = setTimeout(() => {
              setLiveItems(prev => prev.filter(it => !it._dropping));
              droppingTimersRef.current.delete(timer);
            }, 650);
            droppingTimersRef.current.add(timer);
            setLivePhase('curated');
          } else if (event.phase === 'summarized') {
            const summaryById = new Map(event.items.map(it => [it.id, it]));
            setLiveItems(prev => prev.map(it => {
              const enriched = summaryById.get(it.id);
              if (!enriched) return it;
              return {
                ...it,
                aiSummary: enriched.aiSummary ?? it.aiSummary,
                category: enriched.category ?? it.category,
                _phase: 'summarized',
              };
            }));
            setLivePhase('summarized');
          }
        },

        onAnalysis: (event) => {
          setLiveAnalysis({
            categories: event.categories,
            deepDives: event.deepDives,
            keyInsight: event.keyInsight,
          });
          const decoration = new Map<string, { cat: string; status: 'new' | 'active' | 'single'; importance: 'high' | 'medium' | 'low' }>();
          for (const cat of event.categories) {
            for (const ci of cat.items) {
              decoration.set(ci.id, { cat: cat.name, status: ci.status, importance: ci.importance });
            }
          }
          setLiveItems(prev => prev.map(it => {
            const dec = decoration.get(it.id);
            if (!dec) return it;
            return {
              ...it,
              _categoryAssigned: dec.cat,
              _categoryStatus: dec.status,
              _importance: dec.importance,
            };
          }));
          setLivePhase('analyzed');
        },

        onToken: (event) => {
          setLiveWriterText(prev => prev + event.delta);
        },
      }, controller.signal);

      if (result) {
        updateReport(result.date, result.report);
        if (streamingDrawerOpenRef.current) {
          setStreamingDrawerOpen(false);
          setDrawerOpen(true);
        }
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error(error);
      }
    } finally {
      if (activeRunRef.current === controller) activeRunRef.current = null;
      setGenerating(false);
      setLivePhase('done');
      setTimeout(() => {
        setLiveItems([]);
        setLiveAnalysis(null);
      }, 400);
    }
  }, [updateReport]);

  const stop = useCallback(async () => {
    activeRunRef.current?.abort();
    activeRunRef.current = null;
    setGenerating(false);
    setPipelineStages(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key].status === 'running') {
          next[key] = { ...next[key], status: 'skipped' };
        }
      }
      return next;
    });
    setLivePhase('done');
    setLiveWriterText('');
    await stopReport();
  }, []);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    setStreamingDrawerOpen(false);
    requestAnimationFrame(() => drawerBodyRef.current?.scrollTo(0, 0));
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setStreamingDrawerOpen(false);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  useEffect(() => {
    if (!streamingDrawerOpen) return;
    const el = drawerBodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [streamingDrawerOpen, liveWriterText]);

  const safeReport = normalizeReport(report);
  const newsItems = safeReport.items;
  const newItems = useMemo(() => newsItems.filter(item => item.isNew), [newsItems]);
  const recurringItems = useMemo(() => newsItems.filter(item => !item.isNew), [newsItems]);
  const trendCount = safeReport.trends.length;
  const allSources = useMemo(() => Array.from(new Set(newsItems.map(item => item.source))), [newsItems]);
  const sourceNames = allSources.join(' / ') || 'Hacker News / BleepingComputer / The Hacker News';

  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);

  const filteredNewItems = useMemo(() => {
    let items = newItems;
    if (activeSource) items = items.filter(i => i.source === activeSource);
    if (activeTopic) items = items.filter(i => i.category === activeTopic);
    return items;
  }, [newItems, activeSource, activeTopic]);

  const filteredRecurringItems = useMemo(() => {
    let items = recurringItems;
    if (activeSource) items = items.filter(i => i.source === activeSource);
    if (activeTopic) items = items.filter(i => i.category === activeTopic);
    return items;
  }, [recurringItems, activeSource, activeTopic]);

  const hasAnyContent = safeReport.status === 'success' || newsItems.length > 0;
  const showOnboarding = !bootstrapping && !hasAnyContent && !generating;

  return (
    <main className={styles.shell}>
      <div className={styles.topCorner}>
        <a className={styles.deployButton} href={getDeployUrl()} target="_blank" rel="noreferrer">
          <IconRocket size={13} /> {t('deployButton')}
        </a>
        <a className={styles.topCornerIcon} href="https://github.com/foxterm" target="_blank" rel="noreferrer" title="GitHub">
          <IconGitHub size={16} />
        </a>
      </div>
      <header className={styles.topbar}>
        <div className={styles.brandBlock}>
          <p className={styles.eyebrow}>{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
          <p className={styles.scheduleHint}><IconClock size={12} /> {t('scheduleHint')}</p>
        </div>
      </header>

      <PipelineBar stages={pipelineStages} />

      {!bootstrapping && (
        <div className={styles.statsBar}>
          <span className={styles.statItem}>{t('lastGenerated')} <strong>{formatTime(safeReport.generatedAt) || t('noTime')}</strong></span>
          <span className={styles.statDot}>·</span>
          <span className={styles.statItem}><strong>{safeReport.itemCount ?? newsItems.length}</strong> {t('items')}</span>
          <span className={styles.statDot}>·</span>
          <span className={styles.statItem}><strong>{trendCount}</strong> {t('topics')}</span>
          <span className={styles.statDot}>·</span>
          <span className={styles.statItem}>{t('source')} {sourceNames}</span>
        </div>
      )}

      {!bootstrapping && availableDates.length > 1 && (
        <div className={styles.dateBar}>
          <span className={styles.dateBarLabel}>{t('selectDate')}</span>
          <div className={styles.dateList}>
            {availableDates.map(date => (
              <button
                key={date}
                type="button"
                className={`${styles.dateButton} ${currentDate === date ? styles.dateButtonActive : ''}`}
                onClick={() => loadReportByDate(date)}
              >
                {date}
              </button>
            ))}
          </div>
        </div>
      )}

      <section className={styles.mainLayout}>
        {/* Main: News Feed */}
        <section className={styles.contentPanel}>
          <div className={styles.feedHeader}>
            <div>
              <p className={styles.panelLabel}>{t('feedLabel')}</p>
              <h2 className={styles.feedTitle}>{t('feedTitle')}</h2>
            </div>
          </div>

          <div className={styles.filterRow}>
            <div className={styles.sourceList}>
              {allSources.map(source => (
                <button
                  key={source}
                  type="button"
                  className={`${styles.filterTag} ${activeSource === source ? styles.filterTagActive : ''}`}
                  onClick={() => setActiveSource(prev => prev === source ? null : source)}
                >
                  {source}
                </button>
              ))}
            </div>
            <div className={styles.topicGrid}>
              {getTopics().map(topic => (
                <button
                  key={topic}
                  type="button"
                  className={`${styles.filterTag} ${styles.filterTagTopic} ${activeTopic === topic ? styles.filterTagActive : ''}`}
                  onClick={() => setActiveTopic(prev => prev === topic ? null : topic)}
                >
                  {topic}
                </button>
              ))}
            </div>
            {(activeSource || activeTopic) && (
              <button
                type="button"
                className={styles.clearFilters}
                onClick={() => { setActiveSource(null); setActiveTopic(null); }}
              >
                {t('clearFilters')}
              </button>
            )}
          </div>

          {bootstrapping ? (
            <SkeletonNewsList />
          ) : generating && liveItems.length > 0 ? (
            <LiveFeed items={liveItems} phase={livePhase} analysis={liveAnalysis} />
          ) : generating && !liveItems.length ? (
            <SkeletonNewsList />
          ) : showOnboarding ? (
            <OnboardingHero loading={generating} />
          ) : (
            <div className={styles.newsList}>
              {safeReport.newItemCount === 0 && safeReport.status === 'success' && !activeSource && !activeTopic && (
                <div className={styles.noNewBanner}>
                  {t('noNewBanner')}
                </div>
              )}

              {filteredNewItems.length > 0 && (
                <>
                  <div className={styles.feedGroupHeader}>
                    <IconSparkle />
                    <span>{t('newItems')}</span>
                    <span className={styles.feedGroupBadge}>{filteredNewItems.length}</span>
                  </div>
                  {filteredNewItems.map(item => (
                    <a
                      className={styles.newsCard}
                      href={item.url}
                      key={item.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className={styles.newsMain}>
                        <div className={styles.newsMetaTop}>
                          <span className={styles.sourceBadge}>{item.source}</span>
                          <span>{formatItemTime(item.publishedAt, t('unknownTimeLabel'))}</span>
                          {item.isNew && <span className={styles.newBadge}>NEW</span>}
                        </div>
                        <strong>{getItemTitle(item)}</strong>
                        <p>{itemSummary(item, t('fallbackSummary'))}</p>
                      </div>
                      <div className={styles.newsSideMeta}>
                        <span>{item.category || 'Security'}</span>
                        <span>score {item.score ?? 0}</span>
                        <span>
                          {t('sourceLabel')} <IconExternal size={11} style={{ verticalAlign: '-1px', marginLeft: 2 }} />
                        </span>
                      </div>
                    </a>
                  ))}
                </>
              )}

              {filteredRecurringItems.length > 0 && (
                <>
                  <div className={`${styles.feedGroupHeader} ${styles.recurring}`}>
                    <IconHistory />
                    <span>{t('recurring')}</span>
                    <span className={styles.feedGroupBadge}>{filteredRecurringItems.length}</span>
                  </div>
                  {filteredRecurringItems.map(item => (
                    <a
                      className={styles.newsCard}
                      href={item.url}
                      key={item.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className={styles.newsMain}>
                        <div className={styles.newsMetaTop}>
                          <span className={styles.sourceBadge}>{item.source}</span>
                          <span>{formatItemTime(item.publishedAt, t('unknownTimeLabel'))}</span>
                          {item.isNew && <span className={styles.newBadge}>NEW</span>}
                        </div>
                        <strong>{getItemTitle(item)}</strong>
                        <p>{itemSummary(item, t('fallbackSummary'))}</p>
                      </div>
                      <div className={styles.newsSideMeta}>
                        <span>{item.category || 'Security'}</span>
                        <span>score {item.score ?? 0}</span>
                        <span>
                          {t('sourceLabel')} <IconExternal size={11} style={{ verticalAlign: '-1px', marginLeft: 2 }} />
                        </span>
                      </div>
                    </a>
                  ))}
                </>
              )}

              {!filteredNewItems.length && !filteredRecurringItems.length && (
                <p className={styles.emptyText}>
                  {activeSource || activeTopic ? t('noResults') : t('emptyFeed')}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Right Sidebar: Today's Report */}
        <aside className={styles.reportSidebar}>
          <div className={styles.sidebarHeader}>
            <div>
              <p className={styles.panelLabel}>{t('reportsLabel')}</p>
              <h2 className={styles.sidebarTitle}>{t('reportsTitle')}</h2>
            </div>
          </div>

          {bootstrapping ? (
            <div className={styles.reportList}>
              <SkeletonReportItem />
              <SkeletonReportItem />
            </div>
          ) : (
            <>
              {liveWriterText.length > 0 && livePhase === 'writing' && (
                <MiniTypingCard
                  text={liveWriterText}
                  onClick={() => {
                    setStreamingDrawerOpen(true);
                    setDrawerOpen(true);
                  }}
                />
              )}

              {currentDate && (
                <button
                  type="button"
                  className={styles.todayReportCard}
                  onClick={openDrawer}
                >
                  <div className={styles.todayReportHeader}>
                    <span className={styles.latestBadge}>{currentDate}</span>
                    <span className={styles.todayReportCount}>
                      {safeReport.itemCount ?? newsItems.length} {t('items')}
                    </span>
                  </div>
                  <strong>
                    {safeReport.itemCount ?? newsItems.length} {t('items')}
                    {safeReport.newItemCount != null && safeReport.newItemCount > 0
                      ? ` · ${safeReport.newItemCount} ${t('reportNew')}`
                      : ''}
                  </strong>
                  <span className={styles.todayReportSources}>
                    {allSources.join(', ')}
                  </span>
                  <span className={styles.viewReportLink}>
                    {t('viewFullReport')} <IconArrowRight size={12} />
                  </span>
                </button>
              )}

              {!currentDate && !loading && (
                <div className={styles.sidebarEmpty}>
                  <IconInbox />
                  <p className={styles.sidebarEmptyHint}>{t('noMoreHistory')}</p>
                </div>
              )}
            </>
          )}
        </aside>
      </section>

      {/* Report Drawer */}
      <div
        className={`${styles.drawerOverlay} ${drawerOpen ? styles.drawerOverlayVisible : ''}`}
        onClick={closeDrawer}
      />
      <aside className={`${styles.drawer} ${drawerOpen ? styles.drawerOpen : ''}`}>
        <div className={styles.drawerHeader}>
          <div className={styles.drawerHeaderLeft}>
            <button
              type="button"
              className={styles.drawerNavButton}
              onClick={goToPrevDate}
              disabled={!canGoPrev}
              aria-label="Previous date"
            >
              <IconChevronLeft size={16} />
            </button>
            <div>
              <p className={styles.panelLabel}>{streamingDrawerOpen ? t('liveWriting') : t('fullReport')}</p>
              <h2 className={styles.drawerTitle}>
                {streamingDrawerOpen
                  ? t('writingTitle')
                  : currentDate || t('reportTitle')}
              </h2>
            </div>
            <button
              type="button"
              className={styles.drawerNavButton}
              onClick={goToNextDate}
              disabled={!canGoNext}
              aria-label="Next date"
            >
              <IconChevronRight size={16} />
            </button>
          </div>
          <button type="button" className={styles.drawerClose} onClick={closeDrawer} aria-label={t('close')}>
            <IconX size={16} />
          </button>
        </div>

        {streamingDrawerOpen && (
          <div className={styles.drawerBody} ref={drawerBodyRef}>
            <div className={styles.drawerMeta}>
              <span className={`${styles.reportMetaTag} ${styles.reportMetaTagLive}`}>
                <span className={styles.miniTypingDot} /> {t('liveTag')}
              </span>
              <span className={styles.reportMetaTag}>{liveWriterText.length} {t('chars')}</span>
            </div>
            <div className={styles.streamingMarkdownWrap}>
              <MarkdownReport markdown={liveWriterText} />
              <span className={styles.streamingCursor} />
            </div>
          </div>
        )}

        {!streamingDrawerOpen && (
          <div className={styles.drawerBody} ref={drawerBodyRef}>
            <div className={styles.drawerMeta}>
              {safeReport.itemCount != null && <span className={styles.reportMetaTag}>{safeReport.itemCount} {t('reportItems')}</span>}
              {safeReport.newItemCount != null && <span className={styles.reportMetaTag}>{safeReport.newItemCount} {t('reportNew')}</span>}
              {safeReport.durationMs != null && <span className={styles.reportMetaTag}>{(safeReport.durationMs / 1000).toFixed(1)}s</span>}
            </div>
            {safeReport.reportMarkdown ? (
              <MarkdownReport markdown={safeReport.reportMarkdown} />
            ) : (
              <div className={styles.drawerItemsList}>
                {safeReport.trends.map(group => (
                  <div key={group.category}>
                    <div className={styles.feedGroupHeader}>
                      <IconLayers />
                      <span>{group.category}</span>
                      <span className={styles.feedGroupBadge}>{group.count}</span>
                    </div>
                    {(group.itemIds || []).map((id: string) => {
                      const item = safeReport.items.find(i => i.id === id);
                      if (!item) return null;
                      return (
                        <a
                          className={styles.newsCard}
                          href={item.url}
                          key={item.id}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <div className={styles.newsMain}>
                            <div className={styles.newsMetaTop}>
                              <span className={styles.sourceBadge}>{item.source}</span>
                              <span>{item.publishedAt ? formatTime(item.publishedAt) : ''}</span>
                              {item.isNew && <span className={styles.newBadge}>NEW</span>}
                            </div>
                            <strong>{item.title}</strong>
                            {item.summary && <p>{item.summary.slice(0, 200)}</p>}
                          </div>
                          <div className={styles.newsSideMeta}>
                            <span>{item.category || 'Security'}</span>
                            <span>
                              {t('sourceLabel')} <IconExternal size={11} style={{ verticalAlign: '-1px', marginLeft: 2 }} />
                            </span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                ))}
                {safeReport.trends.length === 0 && safeReport.items.length > 0 && (
                  safeReport.items.map(item => (
                    <a
                      className={styles.newsCard}
                      href={item.url}
                      key={item.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className={styles.newsMain}>
                        <div className={styles.newsMetaTop}>
                          <span className={styles.sourceBadge}>{item.source}</span>
                          <span>{item.publishedAt ? formatTime(item.publishedAt) : ''}</span>
                        </div>
                        <strong>{item.title}</strong>
                        {item.summary && <p>{item.summary.slice(0, 200)}</p>}
                      </div>
                      <div className={styles.newsSideMeta}>
                        <span>{item.category || 'Security'}</span>
                      </div>
                    </a>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </aside>

    </main>
  );
}

export default function App() {
  return (
    <ReportProvider>
      <AppContent />
    </ReportProvider>
  );
}
