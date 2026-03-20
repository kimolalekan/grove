import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  Filter,
  Bell,
  AlertTriangle,
  CheckCircle,
  Trash2,
  Edit,
  Mail,
  MessageSquare,
  Settings,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

interface AlertRule {
  id: number;
  name: string;
  condition: string;
  threshold: string;
  metric: string;
  notify: string;
  channel: "email" | "sms";
  enabled: boolean;
}

interface ActiveAlert {
  id: number;
  message: string;
  timestamp: string;
  severity: "critical" | "warning" | "info";
  source: string;
  acknowledged: boolean;
}

const fetchAlerts = async (params?: {
  search?: string;
  severity?: string;
  acknowledged?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: ActiveAlert[]; total: number }> => {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.append("search", params.search);
  if (params?.severity) searchParams.append("severity", params.severity);
  if (params?.acknowledged)
    searchParams.append("acknowledged", params.acknowledged);
  if (params?.limit) searchParams.append("limit", params.limit.toString());
  if (params?.offset) searchParams.append("offset", params.offset.toString());

  const response = await fetch(`/api/alerts?${searchParams}`, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message || `HTTP ${response.status}: Failed to fetch alerts`,
    );
  }
  const result = await response.json();
  return { data: result.data, total: result.total };
};

const createAlert = async (
  alertData: Omit<ActiveAlert, "id" | "timestamp">,
): Promise<ActiveAlert> => {
  const response = await fetch("/api/alerts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
    body: JSON.stringify(alertData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create alert");
  }
  const data = await response.json();
  return data.data;
};

const updateAlert = async ({
  id,
  ...alertData
}: Partial<ActiveAlert> & { id: number }): Promise<ActiveAlert> => {
  const response = await fetch(`/api/alerts/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
    body: JSON.stringify(alertData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update alert");
  }
  const data = await response.json();
  return data.data;
};

const deleteAlert = async (id: number): Promise<void> => {
  const response = await fetch(`/api/alerts/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete alert");
  }
};

const fetchAlertRules = async (): Promise<AlertRule[]> => {
  const response = await fetch("/api/alert-rules", {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.message ||
        `HTTP ${response.status}: Failed to fetch alert rules`,
    );
  }
  const data = await response.json();
  return data.data;
};

const createAlertRule = async (
  ruleData: Omit<AlertRule, "id">,
): Promise<AlertRule> => {
  const response = await fetch("/api/alert-rules", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
    body: JSON.stringify(ruleData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create alert rule");
  }
  const data = await response.json();
  return data.data;
};

const updateAlertRule = async ({
  id,
  ...ruleData
}: Partial<AlertRule> & { id: number }): Promise<AlertRule> => {
  const response = await fetch(`/api/alert-rules/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
    body: JSON.stringify(ruleData),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update alert rule");
  }
  const data = await response.json();
  return data.data;
};

const deleteAlertRule = async (id: number): Promise<void> => {
  const response = await fetch(`/api/alert-rules/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete alert rule");
  }
};

export default function Alerts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showAddRule, setShowAddRule] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<
    "all" | "critical" | "warning" | "info"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "acknowledged"
  >("all");
  const [activeTab, setActiveTab] = useState("alerts");
  const [isEagerLoadingEnabled, setIsEagerLoadingEnabled] = useState(true);
  const [realTimeUpdatesEnabled, setRealTimeUpdatesEnabled] = useState(true);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [deletingAlertId, setDeletingAlertId] = useState<number | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<number | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [preloadedPages, setPreloadedPages] = useState(new Set<number>());

  const [newRule, setNewRule] = useState({
    name: "",
    condition: "greater than",
    threshold: "",
    metric: "error_rate",
    notify: "",
    channel: "email" as "email" | "sms",
  });

  const updateLastActivity = useCallback(() => {
    setLastActivity(Date.now());
  }, []);

  const alertsQueryKey = useMemo(
    () => [
      "alerts",
      {
        search: debouncedSearchQuery,
        severity: severityFilter !== "all" ? severityFilter : undefined,
        acknowledged:
          statusFilter !== "all"
            ? (statusFilter === "acknowledged").toString()
            : undefined,
        page: currentPage,
        limit: itemsPerPage,
      },
    ],
    [
      debouncedSearchQuery,
      severityFilter,
      statusFilter,
      currentPage,
      itemsPerPage,
    ],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const resetPaginationCallback = useCallback(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [currentPage]);

  useEffect(() => {
    resetPaginationCallback();
  }, [debouncedSearchQuery, severityFilter, statusFilter]);

  const {
    data: alertsData,
    isLoading: isLoadingAlerts,
    error: alertsError,
    refetch: refetchAlerts,
    isFetching: isFetchingAlerts,
    isRefetching: isRefetchingAlerts,
  } = useQuery({
    queryKey: alertsQueryKey,
    queryFn: () =>
      fetchAlerts({
        search: debouncedSearchQuery || undefined,
        severity: severityFilter !== "all" ? severityFilter : undefined,
        acknowledged:
          statusFilter !== "all"
            ? (statusFilter === "acknowledged").toString()
            : undefined,
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
      }),
    enabled: true,
    staleTime: realTimeUpdatesEnabled ? 15 * 1000 : 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchInterval:
      activeTab === "alerts" && realTimeUpdatesEnabled
        ? Date.now() - lastActivity < 5 * 60 * 1000
          ? 30 * 1000
          : 2 * 60 * 1000
        : false,
    refetchIntervalInBackground: realTimeUpdatesEnabled,
    notifyOnChangeProps: ["data", "error"],
  });

  useEffect(() => {
    if (!isEagerLoadingEnabled || !alertsData) return;

    const totalPages = Math.ceil(alertsData.total / itemsPerPage);
    const pagesToPreload = [];

    if (currentPage < totalPages && !preloadedPages.has(currentPage + 1)) {
      pagesToPreload.push(currentPage + 1);
    }

    if (currentPage > 1 && !preloadedPages.has(currentPage - 1)) {
      pagesToPreload.push(currentPage - 1);
    }

    pagesToPreload.forEach((pageToPreload) => {
      queryClient.prefetchQuery({
        queryKey: [
          "alerts",
          {
            search: debouncedSearchQuery,
            severity: severityFilter !== "all" ? severityFilter : undefined,
            acknowledged:
              statusFilter !== "all"
                ? (statusFilter === "acknowledged").toString()
                : undefined,
            page: pageToPreload,
            limit: itemsPerPage,
          },
        ],
        queryFn: () =>
          fetchAlerts({
            search: debouncedSearchQuery || undefined,
            severity: severityFilter !== "all" ? severityFilter : undefined,
            acknowledged:
              statusFilter !== "all"
                ? (statusFilter === "acknowledged").toString()
                : undefined,
            limit: itemsPerPage,
            offset: (pageToPreload - 1) * itemsPerPage,
          }),
        staleTime: 60 * 1000,
      });

      setPreloadedPages((prev) => new Set(prev).add(pageToPreload));
    });
  }, [
    currentPage,
    alertsData,
    debouncedSearchQuery,
    severityFilter,
    statusFilter,
    itemsPerPage,
    isEagerLoadingEnabled,
    preloadedPages,
    queryClient,
  ]);

  useEffect(() => {
    setPreloadedPages(new Set());
  }, [debouncedSearchQuery, severityFilter, statusFilter]);

  const {
    data: alertRules = [],
    isLoading: isLoadingRules,
    error: rulesError,
    refetch: refetchRules,
    isFetching: isFetchingRules,
    isRefetching: isRefetchingRules,
  } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: fetchAlertRules,
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: activeTab === "rules",
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    notifyOnChangeProps: ["data", "error"],
  });

  useEffect(() => {
    if (activeTab === "rules" && isEagerLoadingEnabled) {
      queryClient.prefetchQuery({
        queryKey: ["alert-rules"],
        queryFn: fetchAlertRules,
        staleTime: 0,
      });
    }
  }, [activeTab, isEagerLoadingEnabled, queryClient]);

  const acknowledgeAlertMutation = useMutation({
    mutationFn: (id: number) => updateAlert({ id, acknowledged: true }),
    onMutate: async (id: number) => {
      updateLastActivity();

      await queryClient.cancelQueries({ queryKey: ["alerts"] });

      const previousData = new Map();
      queryClient
        .getQueriesData({ queryKey: ["alerts"] })
        .forEach(([key, data]) => {
          previousData.set(JSON.stringify(key), data);
        });

      queryClient.setQueriesData({ queryKey: ["alerts"] }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((alert: ActiveAlert) =>
            alert.id === id ? { ...alert, acknowledged: true } : alert,
          ),
        };
      });

      return { previousData };
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Alert acknowledged successfully",
      });

      queryClient.invalidateQueries({
        queryKey: ["alerts"],
        exact: false,
        refetchType: "active",
      });

      if (isEagerLoadingEnabled) {
        queryClient.prefetchQuery({
          queryKey: alertsQueryKey,
          queryFn: () =>
            fetchAlerts({
              search: debouncedSearchQuery || undefined,
              severity: severityFilter !== "all" ? severityFilter : undefined,
              acknowledged:
                statusFilter !== "all"
                  ? (statusFilter === "acknowledged").toString()
                  : undefined,
              limit: itemsPerPage,
              offset: (currentPage - 1) * itemsPerPage,
            }),
          staleTime: 0,
        });

        // Also prefetch the "acknowledged" filter view if we're not already there
        if (statusFilter !== "acknowledged") {
          queryClient.prefetchQuery({
            queryKey: [
              "alerts",
              {
                search: debouncedSearchQuery,
                severity: severityFilter !== "all" ? severityFilter : undefined,
                acknowledged: "true",
                page: 1,
                limit: itemsPerPage,
              },
            ],
            queryFn: () =>
              fetchAlerts({
                search: debouncedSearchQuery || undefined,
                severity: severityFilter !== "all" ? severityFilter : undefined,
                acknowledged: "true",
                limit: itemsPerPage,
                offset: 0,
              }),
            staleTime: 30 * 1000,
          });
        }
      }
    },
    onError: (error: Error, id, context) => {
      if (context?.previousData) {
        context.previousData.forEach((data, key) => {
          queryClient.setQueryData(JSON.parse(key), data);
        });
      }

      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: deleteAlert,
    onMutate: async (id: number) => {
      updateLastActivity();

      setDeletingAlertId(id);
      const optimisticToast = toast({
        title: "Deleting Alert...",
        description: "Removing alert from the system",
      });

      await queryClient.cancelQueries({ queryKey: ["alerts"] });

      const previousData = new Map();
      queryClient
        .getQueriesData({ queryKey: ["alerts"] })
        .forEach(([key, data]) => {
          previousData.set(JSON.stringify(key), data);
        });

      const alertToDelete = queryClient
        .getQueryData<{ data: ActiveAlert[]; total: number }>(alertsQueryKey)
        ?.data.find((alert) => alert.id === id);

      queryClient.setQueriesData({ queryKey: ["alerts"] }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter((alert: ActiveAlert) => alert.id !== id),
          total: Math.max(0, old.total - 1),
        };
      });

      return { previousData, alertToDelete, optimisticToast };
    },
    onSuccess: (data, id, context) => {
      setDeletingAlertId(null);
      if (context?.optimisticToast) {
        context.optimisticToast.dismiss();
      }

      toast({
        title: "Alert Deleted",
        description: `Alert has been permanently removed from the system`,
        duration: 3000,
      });

      queryClient.invalidateQueries({
        queryKey: ["alerts"],
        exact: false,
        refetchType: "active",
      });

      if (isEagerLoadingEnabled) {
        queryClient.prefetchQuery({
          queryKey: alertsQueryKey,
          queryFn: () =>
            fetchAlerts({
              search: debouncedSearchQuery || undefined,
              severity: severityFilter !== "all" ? severityFilter : undefined,
              acknowledged:
                statusFilter !== "all"
                  ? (statusFilter === "acknowledged").toString()
                  : undefined,
              limit: itemsPerPage,
              offset: (currentPage - 1) * itemsPerPage,
            }),
          staleTime: 0,
        });
      }
    },
    onError: (error: Error, id, context) => {
      setDeletingAlertId(null);
      if (context?.optimisticToast) {
        context.optimisticToast.dismiss();
      }

      if (context?.previousData) {
        context.previousData.forEach((data, key) => {
          queryClient.setQueryData(JSON.parse(key), data);
        });
      }

      toast({
        title: "Failed to Delete Alert",
        description: `Could not delete alert: ${error.message}`,
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  const totalPages = alertsData
    ? Math.ceil(alertsData.total / itemsPerPage)
    : 0;
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, alertsData?.total || 0);

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage >= 1 && newPage <= totalPages) {
        setCurrentPage(newPage);
      }
    },
    [totalPages],
  );

  // Auto-adjust current page if it exceeds total pages
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [totalPages, currentPage]);

  const createRuleMutation = useMutation({
    mutationFn: createAlertRule,
    onMutate: async (newRule) => {
      updateLastActivity();

      await queryClient.cancelQueries({ queryKey: ["alert-rules"] });

      const previousData = queryClient.getQueryData<AlertRule[]>([
        "alert-rules",
      ]);

      const tempRule: AlertRule = {
        id: Date.now() + Math.random(),
        ...newRule,
        enabled: newRule.enabled ?? true,
      };

      queryClient.setQueryData<AlertRule[]>(["alert-rules"], (old) =>
        old ? [tempRule, ...old] : [tempRule],
      );

      return { previousData };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<AlertRule[]>(["alert-rules"], (old) => {
        if (!old) return [data];
        return old.map((rule) =>
          typeof rule.id === "number" && rule.id > Date.now() - 1000
            ? data
            : rule,
        );
      });

      toast({
        title: "Success",
        description: "Alert rule created successfully",
      });

      setNewRule({
        name: "",
        condition: "greater than",
        threshold: "",
        metric: "error_rate",
        notify: "",
        channel: "email",
      });
      setShowAddRule(false);

      if (isEagerLoadingEnabled) {
        queryClient.prefetchQuery({
          queryKey: ["alert-rules"],
          queryFn: fetchAlertRules,
          staleTime: 0,
        });

        queryClient.prefetchQuery({
          queryKey: alertsQueryKey,
          queryFn: () =>
            fetchAlerts({
              search: debouncedSearchQuery || undefined,
              severity: severityFilter !== "all" ? severityFilter : undefined,
              acknowledged:
                statusFilter !== "all"
                  ? (statusFilter === "acknowledged").toString()
                  : undefined,
              limit: itemsPerPage,
              offset: (currentPage - 1) * itemsPerPage,
            }),
          staleTime: 30 * 1000,
        });
      }
    },
    onError: (error: Error, newRule, context) => {
      queryClient.setQueryData(["alert-rules"], context?.previousData);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: updateAlertRule,
    onMutate: async (updatedRule) => {
      await queryClient.cancelQueries({ queryKey: ["alert-rules"] });

      const previousData = queryClient.getQueryData<AlertRule[]>([
        "alert-rules",
      ]);

      queryClient.setQueryData<AlertRule[]>(["alert-rules"], (old) => {
        if (!old) return [];
        return old.map((rule) =>
          rule.id === updatedRule.id ? { ...rule, ...updatedRule } : rule,
        );
      });

      return { previousData };
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Alert rule updated successfully",
      });
      queryClient.prefetchQuery({
        queryKey: ["alert-rules"],
        queryFn: fetchAlertRules,
        staleTime: 0,
      });
    },
    onError: (error: Error, updatedRule, context) => {
      // Roll back on error
      queryClient.setQueryData(["alert-rules"], context?.previousData);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: deleteAlertRule,
    onMutate: async (id: number) => {
      updateLastActivity();

      // Show immediate feedback toast and track the deleting item
      setDeletingRuleId(id);
      const optimisticToast = toast({
        title: "Deleting Rule...",
        description: "Removing alert rule from configuration",
      });

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["alert-rules"] });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<AlertRule[]>([
        "alert-rules",
      ]);

      // Find the rule being deleted for better messaging
      const ruleToDelete = previousData?.find((rule) => rule.id === id);

      queryClient.setQueryData<AlertRule[]>(["alert-rules"], (old) =>
        old ? old.filter((rule) => rule.id !== id) : [],
      );

      return { previousData, ruleToDelete, optimisticToast };
    },
    onSuccess: (data, id, context) => {
      // Clear loading state and dismiss the optimistic toast
      setDeletingRuleId(null);
      if (context?.optimisticToast) {
        context.optimisticToast.dismiss();
      }

      const ruleName = context?.ruleToDelete?.name || "Rule";
      toast({
        title: "Rule Deleted",
        description: `"${ruleName}" has been permanently removed`,
        duration: 3000,
      });

      // Prefetch to ensure data consistency
      if (isEagerLoadingEnabled) {
        queryClient.prefetchQuery({
          queryKey: ["alert-rules"],
          queryFn: fetchAlertRules,
          staleTime: 0,
        });
      }
    },
    onError: (error: Error, id, context) => {
      // Clear loading state and dismiss optimistic toast
      setDeletingRuleId(null);
      if (context?.optimisticToast) {
        context.optimisticToast.dismiss();
      }

      // Roll back on error
      if (context?.previousData) {
        queryClient.setQueryData(["alert-rules"], context.previousData);
      }

      const ruleName = context?.ruleToDelete?.name || "rule";
      toast({
        title: "Failed to Delete Rule",
        description: `Could not delete "${ruleName}": ${error.message}`,
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  // Event handlers
  const handleAddRule = () => {
    if (newRule.name && newRule.threshold && newRule.notify) {
      createRuleMutation.mutate({
        ...newRule,
        enabled: true,
      });
    } else {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
    }
  };

  const handleDeleteRule = (id: number) => {
    // Find the rule name for confirmation
    const rule = alertRules.find((r) => r.id === id);
    const ruleName = rule?.name || "this rule";

    // Show confirmation dialog for important actions
    if (
      window.confirm(
        `Are you sure you want to delete "${ruleName}"? This action cannot be undone.`,
      )
    ) {
      deleteRuleMutation.mutate(id);
    }
  };

  const toggleRuleStatus = (id: number, enabled: boolean) => {
    updateRuleMutation.mutate({ id, enabled: !enabled });
  };

  const acknowledgeAlert = (id: number) => {
    acknowledgeAlertMutation.mutate(id);
  };

  const handleDeleteAlert = (id: number) => {
    // Find the alert for confirmation
    const alert = alerts.find((a) => a.id === id);
    const alertMessage = alert?.message || "this alert";

    // Show confirmation dialog for important actions
    if (
      window.confirm(
        `Are you sure you want to delete "${alertMessage}"? This action cannot be undone.`,
      )
    ) {
      deleteAlertMutation.mutate(id);
    }
  };

  // Handle pagination
  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "info":
        return <Bell className="h-4 w-4 text-gray" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "email":
        return <Mail className="h-4 w-4" />;
      case "sms":
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const alerts = alertsData?.data || [];

  // Enhanced performance monitoring and state change detection
  const performanceMetrics = useMemo(
    () => ({
      totalAlerts: alertsData?.total || 0,
      criticalAlerts: alerts.filter((alert) => alert.severity === "critical")
        .length,
      unacknowledgedAlerts: alerts.filter((alert) => !alert.acknowledged)
        .length,
      loadingState: isLoadingAlerts
        ? "loading"
        : isFetchingAlerts
          ? "fetching"
          : "idle",
    }),
    [alerts, alertsData?.total, isLoadingAlerts, isFetchingAlerts, queryClient],
  );

  // Enhanced handlers with state change tracking
  const handleTabChange = useCallback(
    (newTab: string) => {
      updateLastActivity();
      setActiveTab(newTab);

      // Eager load data for the new tab
      if (newTab === "rules" && isEagerLoadingEnabled) {
        queryClient.prefetchQuery({
          queryKey: ["alert-rules"],
          queryFn: fetchAlertRules,
          staleTime: 30 * 1000,
        });
      }
    },
    [isEagerLoadingEnabled, queryClient, updateLastActivity],
  );

  const handleFilterChange = useCallback(
    (filterType: string, value: any) => {
      updateLastActivity();
      setPreloadedPages(new Set()); // Clear preloaded pages when filters change

      switch (filterType) {
        case "severity":
          setSeverityFilter(value);
          break;
        case "status":
          setStatusFilter(value);
          break;
        case "search":
          setSearchQuery(value);
          break;
      }
    },
    [updateLastActivity],
  );

  // Smart page change with preloading
  const handlePageChangeEnhanced = useCallback(
    (newPage: number) => {
      updateLastActivity();
      handlePageChange(newPage);

      // Preload adjacent pages
      if (isEagerLoadingEnabled && alertsData) {
        const totalPages = Math.ceil(alertsData.total / itemsPerPage);
        const pagesToPreload = [];

        if (newPage < totalPages) pagesToPreload.push(newPage + 1);
        if (newPage > 1) pagesToPreload.push(newPage - 1);

        pagesToPreload.forEach((pageToPreload) => {
          queryClient.prefetchQuery({
            queryKey: [
              "alerts",
              {
                search: debouncedSearchQuery,
                severity: severityFilter !== "all" ? severityFilter : undefined,
                acknowledged:
                  statusFilter !== "all"
                    ? (statusFilter === "acknowledged").toString()
                    : undefined,
                page: pageToPreload,
                limit: itemsPerPage,
              },
            ],
            queryFn: () =>
              fetchAlerts({
                search: debouncedSearchQuery || undefined,
                severity: severityFilter !== "all" ? severityFilter : undefined,
                acknowledged:
                  statusFilter !== "all"
                    ? (statusFilter === "acknowledged").toString()
                    : undefined,
                limit: itemsPerPage,
                offset: (pageToPreload - 1) * itemsPerPage,
              }),
            staleTime: 60 * 1000,
          });
        });
      }
    },
    [
      updateLastActivity,
      handlePageChange,
      isEagerLoadingEnabled,
      alertsData,
      itemsPerPage,
      debouncedSearchQuery,
      severityFilter,
      statusFilter,
      queryClient,
    ],
  );

  // Enhanced settings controls
  const toggleEagerLoading = useCallback(() => {
    updateLastActivity();
    setIsEagerLoadingEnabled((prev) => !prev);
    toast({
      title: `Eager Loading ${!isEagerLoadingEnabled ? "Enabled" : "Disabled"}`,
      description: `Background data preloading is now ${!isEagerLoadingEnabled ? "on" : "off"}`,
    });
  }, [isEagerLoadingEnabled, updateLastActivity, toast]);

  const toggleRealTimeUpdates = useCallback(() => {
    updateLastActivity();
    setRealTimeUpdatesEnabled((prev) => !prev);
    toast({
      title: `Real-time Updates ${!realTimeUpdatesEnabled ? "Enabled" : "Disabled"}`,
      description: `Automatic data refreshing is now ${!realTimeUpdatesEnabled ? "on" : "off"}`,
    });
  }, [realTimeUpdatesEnabled, updateLastActivity, toast]);

  return (
    <AdminLayout title="Alerts">
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
              {((isFetchingAlerts && !isLoadingAlerts) ||
                (isFetchingRules && !isLoadingRules)) && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              Monitor and manage your system alerts and notification rules
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowAddRule(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Alert Rule
            </Button>
          </div>
        </div>

        {/* Performance Metrics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Alerts</p>
                <p className="text-2xl font-bold">
                  {performanceMetrics.totalAlerts}
                </p>
              </div>
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical Alerts</p>
                <p className="text-2xl font-bold text-red-500">
                  {performanceMetrics.criticalAlerts}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </div>
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unacknowledged</p>
                <p className="text-2xl font-bold text-yellow-500">
                  {performanceMetrics.unacknowledgedAlerts}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            </div>
          </div>
        </div>

        {/* Settings Panel */}
        {/*<div className="bg-card rounded-lg border p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Settings & Controls</h3>
            <Badge variant="outline" className="text-xs">
              {isEagerLoadingEnabled ? "Optimized" : "Basic"} Mode
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Eager Loading</Label>
                <p className="text-xs text-muted-foreground">
                  Preload adjacent pages
                </p>
              </div>
              <Switch
                checked={isEagerLoadingEnabled}
                onCheckedChange={toggleEagerLoading}
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Real-time Updates</Label>
                <p className="text-xs text-muted-foreground">
                  Auto-refresh data
                </p>
              </div>
              <Switch
                checked={realTimeUpdatesEnabled}
                onCheckedChange={toggleRealTimeUpdates}
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Cache Status</Label>
                <p className="text-xs text-muted-foreground">
                  {queryClient.getQueryCache().getAll().length} cached queries
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  queryClient.clear();
                  toast({
                    title: "Cache Cleared",
                    description: "All cached data has been cleared",
                  });
                }}
              >
                Clear Cache
              </Button>
            </div>
          </div>
        </div>*/}

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="alerts" className="gap-2">
              <Bell className="h-4 w-4" />
              Active Alerts
              {alerts.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {alerts.filter((alert) => !alert.acknowledged).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-2">
              <Settings className="h-4 w-4" />
              Alert Rules
              {alertRules.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {alertRules.filter((rule) => rule.enabled).length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="alerts" className="space-y-4">
            <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 mb-4 border-b -mx-6 px-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search alerts..."
                      value={searchQuery}
                      onChange={(e) =>
                        handleFilterChange("search", e.target.value)
                      }
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select
                  value={severityFilter}
                  onValueChange={(value) =>
                    handleFilterChange("severity", value)
                  }
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Severities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => handleFilterChange("status", value)}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border">
              {isLoadingAlerts ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading alerts...
                </div>
              ) : alertsError ? (
                <div className="text-center p-8">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <p className="text-red-500 mb-4">Failed to load alerts</p>
                  <Button onClick={() => refetchAlerts()}>Retry</Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">
                            No alerts found
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      alerts.map((alert) => (
                        <TableRow
                          key={alert.id}
                          className={`${
                            deletingAlertId === alert.id
                              ? "opacity-50 bg-red-50 animate-pulse"
                              : "hover:bg-muted/50"
                          } transition-all duration-300`}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getSeverityIcon(alert.severity)}
                              <Badge
                                className={`${alert.severity === "info" ? "bg-black" : ""}`}
                                variant={
                                  alert.severity === "critical"
                                    ? "destructive"
                                    : alert.severity === "warning"
                                      ? "secondary"
                                      : "default"
                                }
                              >
                                {alert.severity}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-md">
                            <div className="font-medium">{alert.message}</div>
                          </TableCell>
                          <TableCell>{alert.source}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(alert.timestamp).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {alert.acknowledged ? (
                              <Badge variant="outline" className="gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Acknowledged
                              </Badge>
                            ) : (
                              <Badge
                                className="text-admin-green"
                                variant="outline"
                              >
                                Active
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {!alert.acknowledged && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => acknowledgeAlert(alert.id)}
                                  disabled={acknowledgeAlertMutation.isPending}
                                >
                                  {acknowledgeAlertMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteAlert(alert.id)}
                                disabled={deletingAlertId === alert.id}
                                className={`transition-all duration-200 ${
                                  deletingAlertId === alert.id
                                    ? "opacity-50 cursor-not-allowed bg-red-100 border-red-300"
                                    : "hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                                }`}
                                title={
                                  deletingAlertId === alert.id
                                    ? "Deleting..."
                                    : "Delete alert"
                                }
                              >
                                {deletingAlertId === alert.id ? (
                                  <div className="flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin text-red-600" />
                                    <span className="text-xs text-red-600">
                                      Removing...
                                    </span>
                                  </div>
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Pagination */}
            {!isLoadingAlerts &&
              alertsData &&
              alertsData.total > itemsPerPage && (
                <div className="mt-6 flex flex-row gap-4 justify-between">
                  <div className="text-sm text-gray-600 mt-2">
                    Showing {startItem} to {endItem} of {alertsData.total}{" "}
                    results
                  </div>
                  <div className="flex-item">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={
                              currentPage > 1
                                ? () =>
                                    handlePageChangeEnhanced(currentPage - 1)
                                : undefined
                            }
                            className={
                              currentPage <= 1
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>

                        {/* Page numbers */}
                        {Array.from(
                          { length: Math.min(5, totalPages) },
                          (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }

                            return (
                              <PaginationItem key={pageNum}>
                                <PaginationLink
                                  onClick={() =>
                                    handlePageChangeEnhanced(pageNum)
                                  }
                                  isActive={currentPage === pageNum}
                                  className={`cursor-pointer ${
                                    preloadedPages.has(pageNum)
                                      ? "bg-muted/30"
                                      : ""
                                  }`}
                                >
                                  {pageNum}
                                </PaginationLink>
                              </PaginationItem>
                            );
                          },
                        )}

                        {totalPages > 5 && currentPage < totalPages - 2 && (
                          <PaginationItem>
                            <PaginationEllipsis />
                          </PaginationItem>
                        )}

                        <PaginationItem>
                          <PaginationNext
                            onClick={
                              currentPage < totalPages
                                ? () =>
                                    handlePageChangeEnhanced(currentPage + 1)
                                : undefined
                            }
                            className={
                              currentPage >= totalPages
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer"
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                </div>
              )}
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            <div className="rounded-md border">
              {isLoadingRules ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading alert rules...
                </div>
              ) : rulesError ? (
                <div className="text-center p-8">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <p className="text-red-500 mb-4">
                    Failed to load alert rules
                  </p>
                  <Button onClick={() => refetchRules()}>Retry</Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Metric</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Threshold</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertRules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8">
                          <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">
                            No alert rules configured
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      alertRules.map((rule) => (
                        <TableRow
                          key={rule.id}
                          className={`${
                            deletingRuleId === rule.id
                              ? "opacity-50 bg-red-50 animate-pulse"
                              : "hover:bg-muted/50"
                          } transition-all duration-300`}
                        >
                          <TableCell className="font-medium">
                            {rule.name}
                          </TableCell>
                          <TableCell>{rule.metric}</TableCell>
                          <TableCell>{rule.condition}</TableCell>
                          <TableCell>{rule.threshold}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getChannelIcon(rule.channel)}
                              <span className="capitalize">{rule.channel}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={rule.enabled}
                                onCheckedChange={() =>
                                  toggleRuleStatus(rule.id, rule.enabled)
                                }
                                disabled={updateRuleMutation.isPending}
                              />
                              <span className="text-sm text-muted-foreground">
                                {rule.enabled ? "Enabled" : "Disabled"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteRule(rule.id)}
                                disabled={deletingRuleId === rule.id}
                                className={`transition-all duration-200 ${
                                  deletingRuleId === rule.id
                                    ? "opacity-50 cursor-not-allowed bg-red-100 border-red-300"
                                    : "hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                                }`}
                                title={
                                  deletingRuleId === rule.id
                                    ? "Deleting..."
                                    : "Delete rule"
                                }
                              >
                                {deletingRuleId === rule.id ? (
                                  <div className="flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin text-red-600" />
                                    <span className="text-xs text-red-600">
                                      Removing...
                                    </span>
                                  </div>
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Add Alert Rule Modal */}
        <Dialog open={showAddRule} onOpenChange={setShowAddRule}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Alert Rule</DialogTitle>
              <DialogDescription>
                Create a new alert rule to monitor your system metrics.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="rule-name">Rule Name</Label>
                <Input
                  id="rule-name"
                  placeholder="Enter rule name"
                  value={newRule.name}
                  onChange={(e) =>
                    setNewRule({ ...newRule, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="rule-metric">Metric</Label>
                <Select
                  value={newRule.metric}
                  onValueChange={(value) =>
                    setNewRule({ ...newRule, metric: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="error_rate">Error Rate</SelectItem>
                    <SelectItem value="response_time">Response Time</SelectItem>
                    <SelectItem value="cpu_usage">CPU Usage</SelectItem>
                    <SelectItem value="memory_usage">Memory Usage</SelectItem>
                    <SelectItem value="disk_usage">Disk Usage</SelectItem>
                    <SelectItem value="nginx_5xx">Nginx 5xx Errors</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rule-condition">Condition</Label>
                  <Select
                    value={newRule.condition}
                    onValueChange={(value) =>
                      setNewRule({ ...newRule, condition: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="greater than">Greater than</SelectItem>
                      <SelectItem value="less than">Less than</SelectItem>
                      <SelectItem value="equals">Equals</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="rule-threshold">Threshold</Label>
                  <Input
                    id="rule-threshold"
                    placeholder="e.g., 1%, 500ms, 80"
                    value={newRule.threshold}
                    onChange={(e) =>
                      setNewRule({ ...newRule, threshold: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="rule-channel">Notification Channel</Label>
                <Select
                  value={newRule.channel}
                  onValueChange={(value: "email" | "sms") =>
                    setNewRule({ ...newRule, channel: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rule-notify">Notification Target</Label>
                <Input
                  id="rule-notify"
                  placeholder={
                    newRule.channel === "email"
                      ? "admin@example.com"
                      : "+1234567890"
                  }
                  value={newRule.notify}
                  onChange={(e) =>
                    setNewRule({ ...newRule, notify: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddRule(false)}
                disabled={createRuleMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddRule}
                disabled={
                  !newRule.name ||
                  !newRule.threshold ||
                  !newRule.notify ||
                  createRuleMutation.isPending
                }
              >
                {createRuleMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Create Rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
