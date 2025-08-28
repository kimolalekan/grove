import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/layout/admin-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Server,
  Cpu,
  Database,
  Clock,
  RefreshCw,
  BarChart3,
  Activity,
  Loader2,
  AlertCircle,
  Info,
  AlertTriangle,
  XCircle,
  FileText,
} from "lucide-react";
import {
  LineChart as RechartsLineChart,
  Line,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// API Functions
const fetchOverviewMetrics = async (timeRange: string, project?: string) => {
  const params = new URLSearchParams({ timeRange });
  if (project && project !== "all") {
    params.append("project", project);
  }
  const response = await fetch(`/api/metrics/overview?${params}`, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error("Failed to fetch overview metrics");
  }
  const data = await response.json();
  return data.data;
};

const fetchPerformanceMetrics = async (timeRange: string, project?: string) => {
  const params = new URLSearchParams({ timeRange });
  if (project && project !== "all") {
    params.append("project", project);
  }
  const response = await fetch(`/api/metrics/performance?${params}`, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error("Failed to fetch performance metrics");
  }
  const data = await response.json();
  return data.data;
};

const fetchResourceMetrics = async (
  timeRange: string,
  project?: string,
  server?: string,
) => {
  const params = new URLSearchParams({ timeRange });
  if (project && project !== "all") {
    params.append("project", project);
  }
  if (server) {
    params.append("server", server);
  }
  const response = await fetch(`/api/metrics/resources?${params}`, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error("Failed to fetch resource metrics");
  }
  const data = await response.json();
  return data.data;
};

const fetchLogCounts = async (timeRange: string, project?: string) => {
  try {
    const params = new URLSearchParams({ timeRange });
    if (project && project !== "all") {
      params.append("project", project);
    }
    const response = await fetch(`/api/logs/stats?${params}`, {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
      },
    });
    if (!response.ok) {
      throw new Error("Failed to fetch log counts");
    }
    const data = await response.json();
    return data.data || { info: 0, warning: 0, error: 0, total: 0 };
  } catch (error) {
    console.error("Failed to fetch log counts:", error);
    return { info: 0, warning: 0, error: 0, total: 0 };
  }
};

const fetchActiveAlerts = async (timeRange: string, project?: string) => {
  try {
    const params = new URLSearchParams({ timeRange });
    if (project && project !== "all") {
      params.append("project", project);
    }
    const response = await fetch(`/api/metrics/alerts?${params}`, {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
      },
    });
    if (!response.ok) {
      throw new Error("Failed to fetch active alerts");
    }
    const data = await response.json();
    return data.data || { totalActiveAlerts: 0 };
  } catch (error) {
    console.error("Failed to fetch active alerts:", error);
    return { totalActiveAlerts: 0 };
  }
};

// Format time range for display
const formatTimeRange = (timeRange: string) => {
  const timeRangeMap: { [key: string]: string } = {
    "1h": "Last hour",
    "24h": "Last 24 hours",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "60d": "Last 60 days",
    "90d": "Last 90 days",
    "180d": "Last 180 days",
    "365d": "Last 365 days",
  };
  return timeRangeMap[timeRange] || timeRange;
};

// Chart Components
const LineChart = ({
  data,
  color = "blue",
}: {
  data: number[];
  color?: string;
}) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="w-full h-[200px] flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg">
        <div className="text-center p-4">
          <div className="text-gray-500 mb-2">No data available</div>
          <div className="text-sm text-gray-400">
            {!data
              ? "Data not loaded"
              : !Array.isArray(data)
                ? "Invalid data format"
                : "No data points to display"}
          </div>
        </div>
      </div>
    );
  }
  const chartData = data.map((value, index) => ({
    index,
    time: `${index + 1}`,
    value: typeof value === "number" && !isNaN(value) ? value : 0,
  }));
  const colorMap = {
    blue: "#3b82f6",
    red: "#ef4444",
    purple: "#8b5cf6",
    orange: "#f97316",
    green: "#10b981",
  };
  return (
    <div className="w-full h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => value.toLocaleString()}
          />
          <Tooltip
            labelFormatter={(label) => `Interval: ${label}`}
            formatter={(value: any) => [
              typeof value === "number" ? value.toLocaleString() : value,
              "Value",
            ]}
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={colorMap[color as keyof typeof colorMap] || colorMap.blue}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
};

const BarChart = ({
  data,
  color = "blue",
}: {
  data: number[];
  color?: string;
}) => {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="w-full h-[200px] flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg">
        <div className="text-center p-4">
          <div className="text-gray-500 mb-2">No data available</div>
          <div className="text-sm text-gray-400">
            {!data
              ? "Data not loaded"
              : !Array.isArray(data)
                ? "Invalid data format"
                : "No data points to display"}
          </div>
        </div>
      </div>
    );
  }
  const chartData = data.map((value, index) => ({
    index,
    time: `${index + 1}`,
    value: typeof value === "number" && !isNaN(value) ? value : 0,
  }));
  const colorMap = {
    blue: "#3b82f6",
    green: "#10b981",
    purple: "#8b5cf6",
    orange: "#f97316",
    red: "#ef4444",
  };
  return (
    <div className="w-full h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => value.toLocaleString()}
          />
          <Tooltip
            labelFormatter={(label) => `Interval: ${label}`}
            formatter={(value: any) => [
              typeof value === "number" ? value.toLocaleString() : value,
              "Value",
            ]}
            contentStyle={{
              backgroundColor: "rgba(255, 255, 255, 0.95)",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
          <Bar
            dataKey="value"
            fill={colorMap[color as keyof typeof colorMap] || colorMap.blue}
            radius={[2, 2, 0, 0]}
          />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default function Metrics() {
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState("24h");
  const [selectedProject, setSelectedProject] = useState("all");

  // Fetch projects
  const {
    data: projectsData,
    isLoading: projectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["metrics-projects"],
    queryFn: async () => {
      const response = await fetch("/api/logs/projects", {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }
      const data = await response.json();
      return data.data || [];
    },
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch servers
  const {
    data: serversData,
    isLoading: serversLoading,
    error: serversError,
  } = useQuery({
    queryKey: ["metrics-servers"],
    queryFn: async () => {
      const response = await fetch("/api/logs/servers", {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch servers");
      }
      const data = await response.json();
      return data.data || [];
    },
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch overview metrics
  const {
    data: overviewData,
    isLoading: isLoadingOverview,
    error: overviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ["metrics", "overview", timeRange, selectedProject],
    queryFn: () => fetchOverviewMetrics(timeRange, selectedProject),
  });

  // Fetch performance metrics
  const {
    data: performanceData,
    isLoading: isLoadingPerformance,
    error: performanceError,
    refetch: refetchPerformance,
  } = useQuery({
    queryKey: ["metrics", "performance", timeRange, selectedProject],
    queryFn: () => fetchPerformanceMetrics(timeRange, selectedProject),
  });

  // Fetch resource metrics
  const {
    data: resourceData,
    isLoading: isLoadingResources,
    error: resourceError,
    refetch: refetchResources,
  } = useQuery({
    queryKey: ["metrics", "resources", timeRange, selectedProject],
    queryFn: () => fetchResourceMetrics(timeRange, selectedProject),
  });

  // Fetch log counts
  const {
    data: logCountsData,
    isLoading: isLoadingLogCounts,
    error: logCountsError,
    refetch: refetchLogCounts,
  } = useQuery({
    queryKey: ["metrics", "logCounts", timeRange, selectedProject],
    queryFn: () => fetchLogCounts(timeRange, selectedProject),
  });

  // Fetch active alerts
  const {
    data: alertsData,
    isLoading: isLoadingAlerts,
    error: alertsError,
    refetch: refetchAlerts,
  } = useQuery({
    queryKey: ["metrics", "activeAlerts", timeRange, selectedProject],
    queryFn: () => fetchActiveAlerts(timeRange, selectedProject),
  });

  const refreshAllData = () => {
    refetchOverview();
    refetchPerformance();
    refetchResources();
    refetchLogCounts();
    refetchAlerts();
  };

  // Show errors in toast if any
  React.useEffect(() => {
    if (projectsError) {
      toast({
        title: "Failed to load projects",
        description:
          projectsError instanceof Error
            ? projectsError.message
            : "Unknown error",
        variant: "destructive",
      });
    }

    if (logCountsError) {
      toast({
        title: "Failed to load log counts",
        description:
          logCountsError instanceof Error
            ? logCountsError.message
            : "Unknown error",
        variant: "destructive",
      });
    }
    if (alertsError) {
      toast({
        title: "Failed to load active alerts",
        description:
          alertsError instanceof Error ? alertsError.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [projectsError, logCountsError, alertsError, toast]);

  const isLoading =
    isLoadingOverview ||
    isLoadingPerformance ||
    isLoadingResources ||
    isLoadingLogCounts ||
    isLoadingAlerts;

  const ErrorDisplay = ({
    error,
    retry,
  }: {
    error: any;
    retry: () => void;
  }) => (
    <div className="text-center p-8">
      <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
      <p className="text-red-500 mb-4">Failed to load metrics</p>
      <Button onClick={retry}>Retry</Button>
    </div>
  );

  const LoadingDisplay = () => (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin mr-2" />
      Loading metrics...
    </div>
  );

  return (
    <AdminLayout title="Metrics">
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Metrics Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Monitor your system performance and key metrics
            </p>
          </div>
          <div className="flex gap-2">
            <Select
              value={selectedProject}
              onValueChange={setSelectedProject}
              disabled={projectsLoading}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue
                  placeholder={projectsLoading ? "Loading..." : "Project"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projectsError ? (
                  <SelectItem value="error" disabled>
                    Error loading projects
                  </SelectItem>
                ) : projectsData?.length === 0 ? (
                  <SelectItem value="empty" disabled>
                    No projects found
                  </SelectItem>
                ) : (
                  projectsData?.map((project: string) => (
                    <SelectItem key={project} value={project}>
                      {project}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last hour</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="60d">Last 60 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="180d">Last 180 days</SelectItem>
                <SelectItem value="365d">Last 365 days</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={refreshAllData} disabled={isLoading}>
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="performance"
              className="flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="resources" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              Resources
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            {isLoadingOverview ? (
              <LoadingDisplay />
            ) : overviewError ? (
              <ErrorDisplay error={overviewError} retry={refetchOverview} />
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  {/* Requests/Min Card */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Requests/Min
                      </CardTitle>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {overviewData?.requestsPerMinute?.toLocaleString() ||
                          "0"}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRange(timeRange)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Error Rate Card */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Error Rate
                      </CardTitle>
                      <Server className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-500">
                        {overviewData?.errorRate?.toFixed(1) || "0"}%
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRange(timeRange)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Avg. Response Card */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Avg. Response
                      </CardTitle>
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {overviewData?.avgResponseTime || 0}ms
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRange(timeRange)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Active Alerts Card */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Active Alerts
                      </CardTitle>
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-yellow-600">
                        {isLoadingAlerts ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : alertsError ? (
                          <button
                            onClick={() => refetchAlerts()}
                            className="flex items-center gap-2 text-red-500 hover:text-red-700 transition-colors"
                            title="Click to retry loading active alerts"
                          >
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-sm">Retry</span>
                          </button>
                        ) : (
                          alertsData?.totalActiveAlerts?.toLocaleString() || "0"
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRange(timeRange)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Info Logs Card */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Info Logs
                      </CardTitle>
                      <Info className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-600">
                        {isLoadingLogCounts ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : logCountsError ? (
                          <button
                            onClick={() => refetchLogCounts()}
                            className="flex items-center gap-2 text-red-500 hover:text-red-700 transition-colors"
                            title="Click to retry loading log counts"
                          >
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-sm">Retry</span>
                          </button>
                        ) : (
                          logCountsData?.info?.toLocaleString() || "0"
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRange(timeRange)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Warning Logs Card */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Warning Logs
                      </CardTitle>
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-yellow-600">
                        {isLoadingLogCounts ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : logCountsError ? (
                          <button
                            onClick={() => refetchLogCounts()}
                            className="flex items-center gap-2 text-red-500 hover:text-red-700 transition-colors"
                            title="Click to retry loading log counts"
                          >
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-sm">Retry</span>
                          </button>
                        ) : (
                          logCountsData?.warning?.toLocaleString() || "0"
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRange(timeRange)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Error Logs Card */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Error Logs
                      </CardTitle>
                      <XCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">
                        {isLoadingLogCounts ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : logCountsError ? (
                          <button
                            onClick={() => refetchLogCounts()}
                            className="flex items-center gap-2 text-red-500 hover:text-red-700 transition-colors"
                            title="Click to retry loading log counts"
                          >
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-sm">Retry</span>
                          </button>
                        ) : (
                          logCountsData?.error?.toLocaleString() || "0"
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRange(timeRange)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Total Logs Card */}
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        Total Logs
                      </CardTitle>
                      <FileText className="h-4 w-4 text-gray-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-gray-700">
                        {isLoadingLogCounts ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : logCountsError ? (
                          <button
                            onClick={() => refetchLogCounts()}
                            className="flex items-center gap-2 text-red-500 hover:text-red-700 transition-colors"
                            title="Click to retry loading log counts"
                          >
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-sm">Retry</span>
                          </button>
                        ) : (
                          logCountsData?.total?.toLocaleString() || "0"
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatTimeRange(timeRange)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Requests per Minute
                      </CardTitle>
                      <CardDescription>
                        Traffic patterns over the selected time period
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <LineChart
                        data={overviewData?.requestData || []}
                        color="blue"
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingDown className="h-5 w-5" />
                        Error Rate
                      </CardTitle>
                      <CardDescription>
                        Percentage of failed requests over time
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <LineChart
                        data={overviewData?.errorRateData || []}
                        color="red"
                      />
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance">
            {isLoadingPerformance ? (
              <LoadingDisplay />
            ) : performanceError ? (
              <ErrorDisplay
                error={performanceError}
                retry={refetchPerformance}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Response Time
                    </CardTitle>
                    <CardDescription>
                      Average response time in milliseconds
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <LineChart
                      data={performanceData?.responseTimeData || []}
                      color="purple"
                    />
                    <div className="flex justify-between items-center mt-4">
                      <div>
                        <div className="text-2xl font-bold">
                          {performanceData?.avgResponseTime || 0}ms
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Current avg.
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          Peak
                        </div>
                        <div className="font-medium">
                          {performanceData?.maxResponseTime || 0}ms
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Min</div>
                        <div className="font-medium">
                          {performanceData?.minResponseTime || 0}ms
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Throughput
                    </CardTitle>
                    <CardDescription>
                      Requests processed per interval
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BarChart
                      data={performanceData?.throughputData || []}
                      color="green"
                    />
                    <div className="flex justify-between items-center mt-4">
                      <div>
                        <div className="text-2xl font-bold">
                          {performanceData?.totalRequests?.toLocaleString() ||
                            "0"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Total Requests
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          Peak
                        </div>
                        <div className="font-medium">
                          {Math.max(
                            ...(performanceData?.throughputData || [0]),
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          Avg.
                        </div>
                        <div className="font-medium">
                          {performanceData?.throughputData?.length > 0
                            ? Math.round(
                                performanceData.throughputData.reduce(
                                  (sum: number, val: number) => sum + val,
                                  0,
                                ) / performanceData.throughputData.length,
                              )
                            : 0}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Resources Tab */}
          <TabsContent value="resources">
            {isLoadingResources ? (
              <LoadingDisplay />
            ) : resourceError ? (
              <ErrorDisplay error={resourceError} retry={refetchResources} />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-5 w-5" />
                      CPU Usage
                    </CardTitle>
                    <CardDescription>
                      {resourceData?.hasRealData
                        ? "Server CPU utilization over time"
                        : "No system metrics data available"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {resourceData?.hasRealData ? (
                      <>
                        <LineChart
                          data={resourceData?.cpuUsageData || []}
                          color="orange"
                        />
                        <div className="flex justify-between items-center mt-4">
                          <div>
                            <div className="text-2xl font-bold">
                              {resourceData?.currentCpuUsage || 0}%
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Current usage
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">
                              Peak
                            </div>
                            <div className="font-medium">
                              {resourceData?.maxCpuUsage || 0}%
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">
                              Avg.
                            </div>
                            <div className="font-medium">
                              {resourceData?.avgCpuUsage || 0}%
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No system metrics data available. Install the system
                        metrics collector to monitor server resources.
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Memory Usage
                    </CardTitle>
                    <CardDescription>
                      {resourceData?.hasRealData
                        ? "Server memory utilization over time"
                        : "No system metrics data available"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {resourceData?.hasRealData ? (
                      <>
                        <LineChart
                          data={resourceData?.memoryUsageData || []}
                          color="indigo"
                        />
                        <div className="flex justify-between items-center mt-4">
                          <div>
                            <div className="text-2xl font-bold">
                              {resourceData?.currentMemoryUsage || 0}%
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Current usage
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">
                              Peak
                            </div>
                            <div className="font-medium">
                              {resourceData?.maxMemoryUsage || 0}%
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">
                              Avg.
                            </div>
                            <div className="font-medium">
                              {resourceData?.avgMemoryUsage || 0}%
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No system metrics data available. Install the system
                        metrics collector to monitor server resources.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
