"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconAccessPoint,
  IconAlertCircle,
  IconAlertTriangle,
  IconCalendar,
  IconCheck,
  IconClock,
  IconCurrencyDollar,
  IconEdit,
  IconEye,
  IconFlag,
  IconLoader3,
  IconRefresh,
  IconSettings,
  IconShield,
  IconTool,
  IconTrendingUp,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { Card, CardContent } from "@/components/ui/card";
import { SearchFilterBar } from "@/components/ui/SearchFilterBar";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { LoadingLogo } from "@/components/ui/LoadingLogo";
import { useToast } from "@/components/ui/toast-notification";
import { cn } from "@/lib/utils";
import {
  aiAgentApi,
  marketsApi,
  type AiAgentConfig,
  type AiAgentHealth,
  type AiAgentMetrics,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api/client";
import { useCurrency, type CurrencyType } from "@/lib/utils/currency";

type AiMarket = {
  id: string;
  title: string;
  description: string;
  status: string;
  tags: string[];
  category: string;
  buyInAmount: number;
  buyInCurrency: CurrencyType;
  participantCount: number;
  totalPool: number;
  closeTime?: string;
  settlementTime?: string;
  scheduledPublishTime?: string;
  createdAt?: string;
  adminReport?: string;
  externalSource?: string;
  isFlagged: boolean;
  betType?: string;
  isFeatured?: boolean;
  isTrending?: boolean;
  mediaUrl?: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  active: "Active",
  closed: "Expired",
  settling: "Settling",
  settled: "Resolved",
  cancelled: "Cancelled",
  suspended: "Suspended",
};

function toString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj._id === "string") return obj._id;
    if (typeof obj.id === "string") return obj.id;
    if (typeof (obj as any).$oid === "string") return (obj as any).$oid;
  }
  return fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatDate(value?: string) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value?: string) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return "0s";
  let remaining = Math.floor(seconds);
  const days = Math.floor(remaining / 86400);
  remaining -= days * 86400;
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (!days && minutes) parts.push(`${minutes}m`);
  return parts.join(" ") || "0s";
}

function ensureCurrencyType(value: unknown): CurrencyType {
  return value === "USD" ? "USD" : "KSH";
}

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
    case "published":
      return "bg-green-50 text-green-700 border-green-200";
    case "scheduled":
    case "draft":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "closed":
      return "bg-neutral-100 text-neutral-600 border-neutral-200";
    case "settling":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "settled":
      return "bg-green-100 text-green-800 border-green-200";
    case "cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-neutral-100 text-neutral-700 border-neutral-200";
  }
}

function normalizeMarket(raw: Record<string, unknown>): AiMarket | null {
  const externalSource = toString(raw.externalSource).toLowerCase();
  const adminReport = toString(raw.adminReport);
  const isAiMarket =
    externalSource === "ai-agent" ||
    externalSource === "ai" ||
    adminReport.toLowerCase().includes("ai agent");

  if (!isAiMarket) return null;

  const status = toString(raw.status, "unknown").toLowerCase();
  const tags = toArray<string>(raw.tags).filter(Boolean);
  const category = toString(raw.category, tags[0] || "General");
  const rawCurrency = toString(raw.buyInCurrency, "KSH").toUpperCase();
  const buyInCurrency: CurrencyType =
    rawCurrency === "USD" ? "USD" : rawCurrency === "KES" ? "KSH" : "KSH";
  const isFlagged =
    Boolean(raw.isFlagged) ||
    adminReport.toLowerCase().includes("flagged") ||
    adminReport.toLowerCase().includes("manual review");

  return {
    id: toString(raw._id || raw.id),
    title: toString(raw.title, "Untitled Market"),
    description: toString(raw.description, ""),
    status,
    tags,
    category,
    buyInAmount: toNumber(raw.buyInAmount ?? raw.minStake, 0),
    buyInCurrency,
    participantCount: toNumber(raw.participantCount, 0),
    totalPool: toNumber(raw.totalPool ?? raw.poolAmount, 0),
    closeTime: toString(raw.closeTime || raw.endsAt),
    settlementTime: toString(raw.settlementTime),
    scheduledPublishTime: toString(raw.scheduledPublishTime),
    createdAt: toString(raw.createdAt),
    adminReport,
    externalSource: toString(raw.externalSource, "ai-agent"),
    isFlagged,
    betType: toString(raw.betType || raw.marketType || raw.type),
    isFeatured: Boolean(raw.isFeatured),
    isTrending: Boolean(raw.isTrending),
    mediaUrl: toString(raw.mediaUrl),
  };
}

export default function AiMarketsAdminPage() {
  const toast = useToast();
  const { formatCurrency } = useCurrency();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const isAdmin = role === "admin";
  const isModerator = role === "moderator";

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [health, setHealth] = useState<AiAgentHealth | null>(null);
  const [metrics, setMetrics] = useState<AiAgentMetrics | null>(null);
  const [config, setConfig] = useState<AiAgentConfig | null>(null);
  const [configDraft, setConfigDraft] = useState<AiAgentConfig | null>(null);
  const [aiMarkets, setAiMarkets] = useState<AiMarket[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("approvals");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [confirmReject, setConfirmReject] = useState<{
    open: boolean;
    market?: AiMarket;
  }>({ open: false });
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  const loadAll = useCallback(
    async (initial = false) => {
      if (initial) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      const [healthRes, metricsRes, configRes, marketsRes] = await Promise.allSettled([
        aiAgentApi.getHealth(),
        aiAgentApi.getMetrics(),
        aiAgentApi.getConfig(),
        marketsApi.list({ limit: 200, offset: 0, externalSource: "ai-agent" }),
      ]);

      if (healthRes.status === "fulfilled") {
        setHealth(healthRes.value);
      } else if (initial) {
        setHealth(null);
      }

      if (metricsRes.status === "fulfilled") {
        setMetrics(metricsRes.value);
      } else if (initial) {
        setMetrics(null);
      }

      if (configRes.status === "fulfilled") {
        const next = configRes.value;
        setConfig(next);
        setConfigDraft((prevDraft) => {
          if (!prevDraft) return next;
          // Only sync if the draft hasn't been edited yet (comparing against the OLD config)
          // We use setConfig's prev value indirectly or just check if they are deep equal
          return prevDraft;
        });
      } else if (initial) {
        setConfig(null);
      }

      if (marketsRes.status === "fulfilled") {
        const payload = marketsRes.value as any;
        const list = Array.isArray(payload) ? payload : payload?.data || [];
        const normalized = list
          .map((market: any) => normalizeMarket(market))
          .filter(Boolean) as AiMarket[];
        setAiMarkets(
          normalized.sort((a, b) => {
            const aTime = new Date(a.createdAt || 0).getTime();
            const bTime = new Date(b.createdAt || 0).getTime();
            return bTime - aTime;
          }),
        );
      } else if (initial) {
        setAiMarkets([]);
      }

      setLastSyncAt(new Date());
      setIsLoading(false);
      setIsRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    void loadAll(true);
  }, [loadAll]);

  const configDirty = useMemo(() => {
    if (!config || !configDraft) return false;
    return JSON.stringify(config) !== JSON.stringify(configDraft);
  }, [config, configDraft]);

  const approvals = useMemo(
    () => aiMarkets.filter((market) => ["draft", "scheduled"].includes(market.status)),
    [aiMarkets],
  );
  const resolutionQueue = useMemo(
    () => aiMarkets.filter((market) => ["closed", "settling"].includes(market.status)),
    [aiMarkets],
  );
  const flaggedQueue = useMemo(
    () => aiMarkets.filter((market) => market.isFlagged),
    [aiMarkets],
  );
  const activeAi = useMemo(
    () => aiMarkets.filter((market) => ["active", "published"].includes(market.status)),
    [aiMarkets],
  );
  const settledAi = useMemo(
    () => aiMarkets.filter((market) => market.status === "settled"),
    [aiMarkets],
  );

  const filteredMarkets = useMemo(() => {
    const base =
      activeTab === "approvals"
        ? approvals
        : activeTab === "resolution"
          ? resolutionQueue
          : activeTab === "flagged"
            ? flaggedQueue
            : aiMarkets;

    if (!searchQuery) return base;
    const query = searchQuery.toLowerCase();
    return base.filter((market) => {
      const haystack = [
        market.title,
        market.description,
        market.category,
        market.externalSource,
        market.adminReport,
        ...(market.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [activeTab, approvals, aiMarkets, flaggedQueue, resolutionQueue, searchQuery]);

  const stats = useMemo(() => {
    return [
      {
        label: "Pending Approvals",
        value: approvals.length,
        icon: IconShield,
        tone: "blue",
      },
      {
        label: "Resolution Queue",
        value: resolutionQueue.length,
        icon: IconAlertCircle,
        tone: "amber",
      },
      {
        label: "Flagged Markets",
        value: flaggedQueue.length,
        icon: IconFlag,
        tone: "red",
      },
      {
        label: "Active AI Markets",
        value: activeAi.length,
        icon: IconTrendingUp,
        tone: "green",
      },
      {
        label: "Settled AI Markets",
        value: settledAi.length,
        icon: IconCheck,
        tone: "neutral",
      },
      {
        label: "Total AI Markets",
        value: aiMarkets.length,
        icon: IconUsers,
        tone: "purple",
      },
    ];
  }, [activeAi.length, aiMarkets.length, approvals.length, flaggedQueue.length, resolutionQueue.length, settledAi.length]);

  const handleApprove = useCallback(
    async (market: AiMarket) => {
      setActionLoading(market.id);
      try {
        await marketsApi.update(market.id, {
          status: "active",
          scheduledPublishTime: new Date().toISOString(),
        });
        toast.success("Market Approved", "The AI market has been published.");
        await loadAll(false);
      } catch (error) {
        toast.error(
          "Approval Failed",
          getApiErrorMessage(error, "Unable to approve market"),
        );
      } finally {
        setActionLoading(null);
      }
    },
    [loadAll, toast],
  );

  const handleReject = useCallback(
    async (market: AiMarket) => {
      setActionLoading(market.id);
      try {
        const rejectionNote = `Rejected by ${role || "admin"} on ${new Date().toLocaleString()}.`;
        const nextReport = [market.adminReport, rejectionNote].filter(Boolean).join("\n");
        await marketsApi.update(market.id, {
          status: "cancelled",
          adminReport: nextReport,
        });
        toast.success("Market Rejected", "The AI market was cancelled.");
        await loadAll(false);
      } catch (error) {
        toast.error(
          "Rejection Failed",
          getApiErrorMessage(error, "Unable to reject market"),
        );
      } finally {
        setActionLoading(null);
        setConfirmReject({ open: false });
      }
    },
    [loadAll, role, toast],
  );

  const handleTrigger = useCallback(
    async (action: "discovery" | "resolution" | "daily-report") => {
      setActionLoading(action);
      try {
        if (action === "discovery") await aiAgentApi.runDiscovery();
        if (action === "resolution") await aiAgentApi.runResolution();
        if (action === "daily-report") await aiAgentApi.runDailyReport();
        toast.success("Action Queued", "The AI agent is running the requested task.");
      } catch (error) {
        toast.error(
          "Action Failed",
          getApiErrorMessage(error, "Unable to trigger AI task"),
        );
      } finally {
        setActionLoading(null);
      }
    },
    [toast],
  );

  const handleSaveConfig = useCallback(async () => {
    if (!configDraft) return;
    setConfigSaving(true);
    try {
      const updated = await aiAgentApi.updateConfig(configDraft);
      setConfig(updated);
      setConfigDraft(updated);
      toast.success("Config Updated", "AI agent settings have been saved.");
    } catch (error) {
      toast.error(
        "Save Failed",
        getApiErrorMessage(error, "Unable to update AI config"),
      );
    } finally {
      setConfigSaving(false);
    }
  }, [configDraft, toast]);

  const updateConfigDraft = useCallback(
    <K extends keyof AiAgentConfig>(key: K, value: AiAgentConfig[K]) => {
      setConfigDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  if (isLoading) {
    return <LoadingLogo fullScreen size="lg" />;
  }

  return (
    <div className="space-y-10 pb-20 pl-0 md:pl-8">
      <DashboardCard className="p-8">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">
              AI Market Command Center
            </h1>
            <p className="mt-2 text-sm text-neutral-600 max-w-2xl">
              Review AI-created markets, trigger discovery & resolution runs,
              and monitor the Kenya source pipeline with confidence.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700">
              {isAdmin ? "Admin" : isModerator ? "Moderator" : "Staff"}
            </span>
            <span
              className={cn(
                "px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full border",
                config?.slackConfigured
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-neutral-100 text-neutral-600 border-neutral-200",
              )}
            >
              Slack {config?.slackConfigured ? "Connected" : "Not Configured"}
            </span>
            <span
              className={cn(
                "px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full border",
                health?.status === "ok"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-red-50 text-red-600 border-red-200",
              )}
            >
              Agent {health?.status === "ok" ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </DashboardCard>

      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search AI markets, sources, or notes..."
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          { id: "approvals", label: `Approvals (${approvals.length})` },
          { id: "resolution", label: `Resolution (${resolutionQueue.length})` },
          { id: "flagged", label: `Flagged (${flaggedQueue.length})` },
          { id: "all", label: `All (${aiMarkets.length})` },
        ]}
        sticky={false}
        rightElement={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => void loadAll(false)}
              disabled={isRefreshing}
              className="flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 disabled:opacity-60 cursor-pointer"
            >
              {isRefreshing ? (
                <IconLoader3 className="h-4 w-4 animate-spin" />
              ) : (
                <IconRefresh className="h-4 w-4" />
              )}
              Refresh
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => void handleTrigger("discovery")}
              disabled={actionLoading === "discovery"}
              className="flex h-10 items-center gap-2 rounded-xl bg-black px-4 text-sm font-medium text-white shadow-md transition-all hover:bg-black/90 disabled:opacity-60 cursor-pointer"
            >
              {actionLoading === "discovery" ? (
                <IconLoader3 className="h-4 w-4 animate-spin" />
              ) : (
                <IconAccessPoint className="h-4 w-4" />
              )}
              Run Discovery
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => void handleTrigger("resolution")}
              disabled={actionLoading === "resolution"}
              className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white shadow-md transition-all hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
            >
              {actionLoading === "resolution" ? (
                <IconLoader3 className="h-4 w-4 animate-spin" />
              ) : (
                <IconShield className="h-4 w-4" />
              )}
              Run Resolution
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => void handleTrigger("daily-report")}
              disabled={actionLoading === "daily-report"}
              className="flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-900 px-4 text-sm font-medium text-white shadow-md transition-all hover:bg-neutral-800 disabled:opacity-60 cursor-pointer"
            >
              {actionLoading === "daily-report" ? (
                <IconLoader3 className="h-4 w-4 animate-spin" />
              ) : (
                <IconCalendar className="h-4 w-4" />
              )}
              Daily Report
            </motion.button>
          </div>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className={cn(
              "relative overflow-hidden border-none shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] hover:shadow-lg transition-all cursor-pointer group",
              stat.tone === "blue" && "bg-gradient-to-br from-blue-50 via-white to-white",
              stat.tone === "amber" && "bg-gradient-to-br from-amber-50 via-white to-white",
              stat.tone === "red" && "bg-gradient-to-br from-red-50 via-white to-white",
              stat.tone === "green" && "bg-gradient-to-br from-green-50 via-white to-white",
              stat.tone === "purple" && "bg-gradient-to-br from-purple-50 via-white to-white",
              stat.tone === "neutral" && "bg-gradient-to-br from-neutral-50 via-white to-white",
            )}
          >
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/50 blur-2xl transition-all group-hover:bg-white/70" />
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-600">{stat.label}</p>
                  <p className="mt-2 text-2xl font-medium font-mono text-neutral-900">{stat.value}</p>
                </div>
                <div className="rounded-xl bg-white/80 p-3 shadow-sm backdrop-blur-sm">
                  <stat.icon className="h-6 w-6 text-neutral-700" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-6">
        <DashboardCard className="p-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-neutral-100 border border-neutral-200">
                <IconAccessPoint className="h-5 w-5 text-neutral-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">Agent Status</h2>
                <p className="text-xs text-neutral-500">
                  Updated {lastSyncAt ? lastSyncAt.toLocaleTimeString() : "just now"}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full border",
                health?.status === "ok"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-red-50 text-red-600 border-red-200",
              )}
            >
              {health?.status === "ok" ? "Healthy" : "Unavailable"}
            </span>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-2xl border border-neutral-100 bg-white/70">
              <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Uptime</p>
              <p className="mt-2 text-lg font-medium text-neutral-900 font-mono">
                {formatDuration(health?.uptimeSeconds)}
              </p>
            </div>
            <div className="p-4 rounded-2xl border border-neutral-100 bg-white/70">
              <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Discovery</p>
              <p className="mt-2 text-lg font-medium text-neutral-900 font-mono">
                {config?.discoveryEnabled ? "Enabled" : "Paused"}
              </p>
              <p className="text-xs text-neutral-500 mt-1">{config?.discoveryCron || "Cron unavailable"}</p>
            </div>
            <div className="p-4 rounded-2xl border border-neutral-100 bg-white/70">
              <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">Resolution</p>
              <p className="mt-2 text-lg font-medium text-neutral-900 font-mono">
                {config?.resolutionEnabled ? "Enabled" : "Paused"}
              </p>
              <p className="text-xs text-neutral-500 mt-1">{config?.resolutionCron || "Cron unavailable"}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                label: "Events Fetched",
                value: metrics?.metrics?.eventsFetched ?? 0,
              },
              {
                label: "Markets Created",
                value: metrics?.metrics?.marketsCreated ?? 0,
              },
              {
                label: "Drafted Markets",
                value: metrics?.metrics?.marketsDrafted ?? 0,
              },
              {
                label: "Resolution Settled",
                value: metrics?.metrics?.resolutionSettled ?? 0,
              },
              {
                label: "Resolution Flagged",
                value: metrics?.metrics?.resolutionFlagged ?? 0,
              },
              {
                label: "Estimated Cost",
                value: `$${(metrics?.metrics?.estimatedCostUsd ?? 0).toFixed(2)}`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="p-4 rounded-2xl border border-neutral-100 bg-neutral-50/70"
              >
                <p className="text-xs uppercase tracking-wider text-neutral-500 font-medium">{item.label}</p>
                <p className="mt-2 text-lg font-semibold text-neutral-900 font-mono">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
            <span className={cn(
              "px-3 py-1 rounded-full border",
              config?.hasAnthropicKey ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200",
            )}>
              Anthropic {config?.hasAnthropicKey ? "Ready" : "Missing"}
            </span>
            <span className={cn(
              "px-3 py-1 rounded-full border",
              config?.hasNewsApiKey ? "bg-green-50 text-green-700 border-green-200" : "bg-neutral-100 text-neutral-600 border-neutral-200",
            )}>
              News API {config?.hasNewsApiKey ? "Ready" : "Not Set"}
            </span>
            <span className={cn(
              "px-3 py-1 rounded-full border",
              config?.hasApifyToken ? "bg-green-50 text-green-700 border-green-200" : "bg-neutral-100 text-neutral-600 border-neutral-200",
            )}>
              Apify {config?.hasApifyToken ? "Ready" : "Not Set"}
            </span>
            <span className={cn(
              "px-3 py-1 rounded-full border",
              config?.hasFacebookToken ? "bg-green-50 text-green-700 border-green-200" : "bg-neutral-100 text-neutral-600 border-neutral-200",
            )}>
              Facebook {config?.hasFacebookToken ? "Ready" : "Not Set"}
            </span>
            <span className={cn(
              "px-3 py-1 rounded-full border",
              config?.hasSportRadarKey ? "bg-green-50 text-green-700 border-green-200" : "bg-neutral-100 text-neutral-600 border-neutral-200",
            )}>
              SportRadar {config?.hasSportRadarKey ? "Ready" : "Not Set"}
            </span>
            <span className={cn(
              "px-3 py-1 rounded-full border",
              config?.redisConfigured ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200",
            )}>
              Redis {config?.redisConfigured ? "Connected" : "Fallback"}
            </span>
          </div>
        </DashboardCard>

        <DashboardCard className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-neutral-100 border border-neutral-200">
              <IconSettings className="h-5 w-5 text-neutral-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">AI Configuration</h2>
              <p className="text-xs text-neutral-500">
                {isAdmin ? "Admin controls" : "Read-only for moderators"}
              </p>
            </div>
          </div>

          {configDraft ? (
            <div className="space-y-4">
              <div className="grid gap-3">
                {[
                  {
                    key: "discoveryEnabled",
                    label: "Discovery Engine",
                    description: "Enable or pause new market discovery runs.",
                  },
                  {
                    key: "resolutionEnabled",
                    label: "Resolution Engine",
                    description: "Allow AI to auto-resolve closed markets.",
                  },
                  {
                    key: "resolvePolymarket",
                    label: "Resolve Polymarket",
                    description: "Settle Polymarket-synced markets when winners are published.",
                  },
                  {
                    key: "enableRss",
                    label: "News Feeds",
                    description: "RSS + web scraping (Nation, Standard, Citizen, Tuko).",
                  },
                  {
                    key: "enableNewsApi",
                    label: "News API",
                    description: "NewsAPI monitoring for Kenya queries.",
                  },
                  {
                    key: "enableSportRadar",
                    label: "SportRadar",
                    description: "Fixture + sports API sources.",
                  },
                  {
                    key: "enableApify",
                    label: "Twitter / Apify",
                    description: "Apify Twitter actor for breaking signals.",
                  },
                  {
                    key: "enableReddit",
                    label: "Reddit",
                    description: "Kenya subreddit monitoring.",
                  },
                  {
                    key: "enableFacebook",
                    label: "Facebook",
                    description: "Graph API feed for Kenya news pages.",
                  },
                  {
                    key: "enableOfficialSources",
                    label: "Official Sources",
                    description: "IEBC, CBK, NSE, KNBS, Gazette, KRA, CMA, EPRA.",
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{item.label}</p>
                      <p className="text-xs text-neutral-500">{item.description}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={() =>
                        updateConfigDraft(
                          item.key as keyof AiAgentConfig,
                          !configDraft[item.key as keyof AiAgentConfig] as AiAgentConfig[keyof AiAgentConfig],
                        )
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
                        configDraft[item.key as keyof AiAgentConfig]
                          ? "bg-black"
                          : "bg-neutral-200",
                        !isAdmin && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                          configDraft[item.key as keyof AiAgentConfig]
                            ? "translate-x-5"
                            : "translate-x-0",
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid gap-4">
                {[
                  {
                    key: "minConfidenceToPost",
                    label: "Min Confidence to Post",
                    min: 0,
                    max: 100,
                    step: 1,
                  },
                  {
                    key: "minConfidenceToSettle",
                    label: "Min Confidence to Settle",
                    min: 0,
                    max: 100,
                    step: 1,
                  },
                  {
                    key: "maxMarketsPerRun",
                    label: "Max Markets per Run",
                    min: 1,
                    max: 50,
                    step: 1,
                  },
                  {
                    key: "defaultBuyIn",
                    label: "Default Buy-in (KSH)",
                    min: 0,
                    max: 100000,
                    step: 50,
                  },
                  {
                    key: "highValuePoolThreshold",
                    label: "High Value Pool Threshold (KES)",
                    min: 0,
                    max: 100000000,
                    step: 10000,
                  },
                  {
                    key: "monthlyBudgetUsd",
                    label: "Monthly AI Budget (USD)",
                    min: 0,
                    max: 10000,
                    step: 10,
                  },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-4">
                    <label className="text-sm font-medium text-neutral-700">
                      {item.label}
                    </label>
                    <input
                      type="number"
                      min={item.min}
                      max={item.max}
                      step={item.step}
                      disabled={!isAdmin}
                      value={configDraft[item.key as keyof AiAgentConfig] as number}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        updateConfigDraft(
                          item.key as keyof AiAgentConfig,
                          (Number.isFinite(value) ? value : 0) as AiAgentConfig[keyof AiAgentConfig],
                        );
                      }}
                      className={cn(
                        "w-36 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-mono text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:border-transparent",
                        !isAdmin && "cursor-not-allowed opacity-60",
                      )}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-2">
                {isAdmin ? (
                  <>
                    <button
                      onClick={() => config && setConfigDraft(config)}
                      disabled={!configDirty || configSaving}
                      className="px-4 py-2 text-sm font-medium rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 cursor-pointer"
                    >
                      Reset
                    </button>
                    <button
                      onClick={() => void handleSaveConfig()}
                      disabled={!configDirty || configSaving}
                      className="px-4 py-2 text-sm font-medium rounded-xl bg-black text-white hover:bg-black/90 disabled:opacity-50 cursor-pointer flex items-center gap-2"
                    >
                      {configSaving ? <IconLoader3 className="h-4 w-4 animate-spin" /> : null}
                      Save Changes
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <IconAlertTriangle className="h-4 w-4 text-amber-500" />
                    Config changes require an admin role.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
              AI agent configuration is not available.
            </div>
          )}
        </DashboardCard>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-neutral-200 to-transparent" />
          <h2 className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
            AI Markets ({filteredMarkets.length})
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-neutral-200 to-transparent" />
        </div>

        <div className="space-y-6">
          <AnimatePresence>
            {filteredMarkets.map((market, index) => (
              <motion.div
                key={market.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ delay: index * 0.03 }}
              >
                <DashboardCard className="p-0">
                  <div className="flex flex-col md:flex-row gap-6 p-6 border-b border-neutral-100">
                    {market.mediaUrl && (
                      <div className="w-full md:w-32 h-32 rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100 shrink-0">
                        <img 
                          src={market.mediaUrl} 
                          alt={market.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {market.isFeatured && (
                          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-bold flex items-center gap-1">
                            <IconTrendingUp className="w-3 h-3" /> FEATURED
                          </span>
                        )}
                        <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200 uppercase tracking-wider font-semibold">
                          AI
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 font-medium">
                          {market.category}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-neutral-50 text-neutral-600 border border-neutral-200 font-medium">
                          {market.externalSource || "ai-agent"}
                        </span>
                        {market.betType && (
                          <span className="px-2.5 py-1 rounded-full bg-neutral-50 text-neutral-600 border border-neutral-200 font-medium">
                            {market.betType}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold text-neutral-900">{market.title}</h3>
                      <p className="text-sm text-neutral-600 leading-relaxed max-w-3xl">
                        {market.description || "No description provided."}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={cn(
                          "px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full border",
                          getStatusBadge(market.status),
                        )}
                      >
                        {STATUS_LABELS[market.status] || market.status}
                      </span>
                      <p className="text-xs text-neutral-500">
                        Created {formatDate(market.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="px-6 py-5 space-y-5">
                    {market.adminReport && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
                        <div className="flex items-center gap-2 font-semibold mb-1">
                          <IconAlertTriangle className="h-4 w-4" />
                          Admin Report
                        </div>
                        <p className="text-xs text-amber-800 whitespace-pre-line">
                          {market.adminReport}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                        <div className="w-8 h-8 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                          <IconCurrencyDollar className="w-4 h-4 text-neutral-600" />
                        </div>
                        <div>
                          <p className="text-xs text-neutral-600 font-medium">Buy-in</p>
                          <p className="text-sm font-medium text-neutral-900 font-mono">
                            {formatCurrency(
                              market.buyInAmount,
                              ensureCurrencyType(market.buyInCurrency),
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                        <div className="w-8 h-8 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                          <IconUsers className="w-4 h-4 text-neutral-600" />
                        </div>
                        <div>
                          <p className="text-xs text-neutral-600 font-medium">Participants</p>
                          <p className="text-sm font-medium text-neutral-900 font-mono">
                            {market.participantCount}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                        <div className="w-8 h-8 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                          <IconTrendingUp className="w-4 h-4 text-neutral-600" />
                        </div>
                        <div>
                          <p className="text-xs text-neutral-600 font-medium">Pool</p>
                          <p className="text-sm font-medium text-neutral-900 font-mono">
                            {formatCurrency(
                              market.totalPool,
                              ensureCurrencyType(market.buyInCurrency),
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                        <div className="w-8 h-8 rounded-lg bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                          <IconClock className="w-4 h-4 text-neutral-600" />
                        </div>
                        <div>
                          <p className="text-xs text-neutral-600 font-medium">Closes</p>
                          <p className="text-sm font-medium text-neutral-900 font-mono">
                            {formatDateTime(market.closeTime)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {(market.tags || []).map((tag) => (
                        <span
                          key={`${market.id}-${tag}`}
                          className="px-2.5 py-1 text-xs font-medium rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <Link href={`/dashboard/admin/markets/${market.id}`}>
                        <button className="px-3 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer">
                          <IconEye className="w-3.5 h-3.5" />
                          View
                        </button>
                      </Link>
                      <Link href={`/dashboard/admin/markets/${market.id}/edit`}>
                        <button className="px-3 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer">
                          <IconEdit className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      </Link>

                      {["draft", "scheduled"].includes(market.status) && (
                        <>
                          <button
                            disabled={actionLoading === market.id}
                            onClick={() => void handleApprove(market)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            {actionLoading === market.id ? (
                              <IconLoader3 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <IconCheck className="w-3.5 h-3.5" />
                            )}
                            Approve
                          </button>
                          <button
                            disabled={actionLoading === market.id}
                            onClick={() => setConfirmReject({ open: true, market })}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            <IconX className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </>
                      )}

                      {market.status === "closed" && (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          Awaiting Resolution
                        </span>
                      )}

                      {market.scheduledPublishTime && market.status === "scheduled" && (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                          Publishes {formatDateTime(market.scheduledPublishTime)}
                        </span>
                      )}
                    </div>
                  </div>
                </DashboardCard>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredMarkets.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50 p-12 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-white border border-neutral-200 flex items-center justify-center mb-4">
                <IconTool className="h-6 w-6 text-neutral-400" />
              </div>
              <h3 className="text-lg font-medium text-neutral-700">No AI markets found</h3>
              <p className="text-sm text-neutral-500 mt-2">
                Try switching tabs or triggering a new discovery run.
              </p>
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmReject.open}
        onClose={() => setConfirmReject({ open: false })}
        onConfirm={() => {
          if (confirmReject.market) {
            void handleReject(confirmReject.market);
          }
        }}
        isLoading={actionLoading === confirmReject.market?.id}
        title="Reject AI Market"
        message="Rejecting will cancel this market and remove it from approvals. You can still inspect it from the markets list later."
        confirmLabel="Reject Market"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}
