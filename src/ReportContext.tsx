import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchAvailableDates, fetchReportByDate } from './api';
import { EMPTY_REPORT, normalizeReport } from './reportModel';
import type { TrendReport } from './types';

interface ReportContextValue {
  report: TrendReport;
  availableDates: string[];
  currentDate: string | null;
  loading: boolean;
  bootstrapping: boolean;
  loadReportByDate: (date: string) => Promise<void>;
  refresh: () => Promise<void>;
  updateReport: (date: string, report: TrendReport) => void;
}

const ReportContext = createContext<ReportContextValue | null>(null);

export function ReportProvider({ children }: { children: ReactNode }) {
  const [report, setReport] = useState<TrendReport>(EMPTY_REPORT);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [currentDate, setCurrentDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const bootstrapRef = useRef(false);

  const refresh = useCallback(async () => {
    const dates = await fetchAvailableDates().catch(() => []);
    setAvailableDates(dates);
    if (dates.length > 0) {
      const data = await fetchReportByDate(dates[0]);
      if (data) {
        setReport(normalizeReport(data));
        setCurrentDate(dates[0]);
      }
    }
  }, []);

  const loadReportByDate = useCallback(async (date: string) => {
    setLoading(true);
    setCurrentDate(date);
    try {
      const data = await fetchReportByDate(date);
      if (data) setReport(normalizeReport(data));
    } finally {
      setLoading(false);
    }
  }, []);

  const updateReport = useCallback((date: string, newReport: TrendReport) => {
    setReport(normalizeReport(newReport));
    setCurrentDate(date);
    setAvailableDates(prev => prev.includes(date) ? prev : [date, ...prev].sort((a, b) => b.localeCompare(a)));
  }, []);

  useEffect(() => {
    if (bootstrapRef.current) return;
    bootstrapRef.current = true;
    refresh().finally(() => setBootstrapping(false));
  }, [refresh]);

  return (
    <ReportContext.Provider value={{
      report,
      availableDates,
      currentDate,
      loading,
      bootstrapping,
      loadReportByDate,
      refresh,
      updateReport,
    }}>
      {children}
    </ReportContext.Provider>
  );
}

export function useReport() {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error('useReport must be used within ReportProvider');
  return ctx;
}
