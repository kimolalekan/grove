import { useState } from "react";
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

// API Functions for Active Alerts
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
    throw new Error("Failed to fetch alerts");
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

// API Functions for Alert Rules
const fetchAlertRules = async (): Promise<AlertRule[]> => {
  const response = await fetch("/api/alert-rules", {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
    },
  });
  if (!response.ok) {
    throw new Error("Failed to fetch alert rules");
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

  // State for UI
  const [showAddRule, setShowAddRule] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<
    "all" | "critical" | "warning" | "info"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "acknowledged"
  >("all");
  const [activeTab, setActiveTab] = useState("alerts");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const [newRule, setNewRule] = useState({
    name: "",
    condition: "greater than",
    threshold: "",
    metric: "error_rate",
    notify: "",
    channel: "email" as "email" | "sms",
  });

  // Fetch alerts with filters
  const {
    data: alertsData,
    isLoading: isLoadingAlerts,
    error: alertsError,
    refetch: refetchAlerts,
  } = useQuery({
    queryKey: [
      "alerts",
      {
        search: searchQuery,
        severity: severityFilter !== "all" ? severityFilter : undefined,
        acknowledged:
          statusFilter !== "all"
            ? (statusFilter === "acknowledged").toString()
            : undefined,
        page: currentPage,
        limit: itemsPerPage,
      },
    ],
    queryFn: () =>
      fetchAlerts({
        search: searchQuery || undefined,
        severity: severityFilter !== "all" ? severityFilter : undefined,
        acknowledged:
          statusFilter !== "all"
            ? (statusFilter === "acknowledged").toString()
            : undefined,
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
      }),
  });

  // Fetch alert rules
  const {
    data: alertRules = [],
    isLoading: isLoadingRules,
    error: rulesError,
    refetch: refetchRules,
  } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: fetchAlertRules,
  });

  // Mutations for alerts
  const acknowledgeAlertMutation = useMutation({
    mutationFn: (id: number) => updateAlert({ id, acknowledged: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast({
        title: "Success",
        description: "Alert acknowledged successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAlertMutation = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast({
        title: "Success",
        description: "Alert deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Pagination calculations
  const totalPages = alertsData
    ? Math.ceil(alertsData.total / itemsPerPage)
    : 0;
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, alertsData?.total || 0);

  // Reset to page 1 when filters change
  const resetPagination = () => {
    setCurrentPage(1);
  };

  // Mutations for alert rules
  const createRuleMutation = useMutation({
    mutationFn: createAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
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
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: updateAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
      toast({
        title: "Success",
        description: "Alert rule updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: deleteAlertRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
      toast({
        title: "Success",
        description: "Alert rule deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
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
    }
  };

  const handleDeleteRule = (id: number) => {
    deleteRuleMutation.mutate(id);
  };

  const toggleRuleStatus = (id: number, enabled: boolean) => {
    updateRuleMutation.mutate({ id, enabled: !enabled });
  };

  const acknowledgeAlert = (id: number) => {
    acknowledgeAlertMutation.mutate(id);
  };

  const handleDeleteAlert = (id: number) => {
    deleteAlertMutation.mutate(id);
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
        return <Bell className="h-4 w-4 text-blue-500" />;
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

  return (
    <AdminLayout title="Alerts">
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
            <p className="text-muted-foreground mt-1">
              Monitor and manage your system alerts and notification rules
            </p>
          </div>
          <Button onClick={() => setShowAddRule(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Alert Rule
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
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
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search alerts..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      resetPagination();
                    }}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select
                value={severityFilter}
                onValueChange={(value) => {
                  setSeverityFilter(
                    value as "all" | "critical" | "warning" | "info",
                  );
                  resetPagination();
                }}
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
                onValueChange={(value) => {
                  setStatusFilter(value as "all" | "active" | "acknowledged");
                  resetPagination();
                }}
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
                        <TableRow key={alert.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getSeverityIcon(alert.severity)}
                              <Badge
                                variant={
                                  alert.severity === "critical"
                                    ? "destructive"
                                    : alert.severity === "warning"
                                      ? "default"
                                      : "secondary"
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
                              <Badge variant="secondary">Active</Badge>
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
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteAlert(alert.id)}
                                disabled={deleteAlertMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
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
                <div className="mt-6 flex flex-col items-center gap-4">
                  <div className="text-sm text-gray-600">
                    Showing {startItem} to {endItem} of {alertsData.total}{" "}
                    results
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={
                            currentPage > 1 ? goToPreviousPage : undefined
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
                                onClick={() => goToPage(pageNum)}
                                isActive={currentPage === pageNum}
                                className="cursor-pointer"
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
                            currentPage < totalPages ? goToNextPage : undefined
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
                        <TableRow key={rule.id}>
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
                                disabled={deleteRuleMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
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
