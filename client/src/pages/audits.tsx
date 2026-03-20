import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/layout/admin-layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchIcon,
  FilterIcon,
  RefreshCwIcon,
  EyeIcon,
  HistoryIcon,
  UserIcon,
  TagIcon,
  ActivityIcon,
  CalendarIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import dayjs from "dayjs";

interface AuditLog {
  id: number;
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  details?: any;
  ipAddress?: string;
  timestamp: string;
}

export default function Audits() {
  const { toast } = useToast();
  const [selectedAction, setSelectedAction] = useState("all");
  const [selectedEntityType, setSelectedEntityType] = useState("all");
  const [selectedUser, setSelectedUser] = useState("all");
  const [selectedProject, setSelectedProject] = useState("all");
  const [selectedTimeRange, setSelectedTimeRange] = useState("24");
  const [dateRange, setDateRange] = useState({
    from: null as Date | null,
    to: null as Date | null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState<AuditLog | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);

  // Fetch dynamic list of actions
  const {
    data: actionsResponse,
    isLoading: actionsLoading,
    error: actionsError,
  } = useQuery({
    queryKey: ["audit-actions"],
    queryFn: async () => {
      const response = await fetch("/api/audits/actions", {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
        },
      });
      if (!response.ok) return { success: false, data: [] };
      return await response.json();
    },
    staleTime: 60 * 1000,
  });

  // Fetch dynamic list of projects
  const {
    data: projectsResponse,
    isLoading: projectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ["audit-projects"],
    queryFn: async () => {
      const response = await fetch("/api/audits/projects", {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
        },
      });
      if (!response.ok) return { success: false, data: [] };
      return await response.json();
    },
    staleTime: 60 * 1000,
  });

  const { data: auditData, refetch } = useQuery<{
    success: boolean;
    data: AuditLog[];
    total: number;
  }>({
    queryKey: [
      "audits",
      selectedAction,
      selectedEntityType,
      selectedUser,
      selectedProject,
      selectedTimeRange,
      dateRange.from,
      dateRange.to,
      currentPage,
    ],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (selectedAction !== "all")
        searchParams.append("action", selectedAction);
      if (selectedEntityType !== "all")
        searchParams.append("entityType", selectedEntityType);
      if (selectedUser !== "all") searchParams.append("userId", selectedUser);
      if (selectedProject !== "all")
        searchParams.append("project", selectedProject);

      if (selectedTimeRange) {
        searchParams.append("timeRange", selectedTimeRange);
      }

      if (selectedTimeRange === "custom") {
        if (dateRange.from) {
          searchParams.append("from", dateRange.from.toISOString());
        }
        if (dateRange.to) {
          searchParams.append("to", dateRange.to.toISOString());
        }
      }

      searchParams.append("limit", itemsPerPage.toString());
      searchParams.append(
        "offset",
        ((currentPage - 1) * itemsPerPage).toString(),
      );

      const response = await fetch(`/api/audits?${searchParams}`, {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
        },
      });
      const data = await response.json();
      return data as { success: boolean; data: AuditLog[]; total: number };
    },
  });

  const handleRefresh = () => {
    setIsLoading(true);
    refetch().finally(() => setIsLoading(false));
  };

  const totalPages = auditData ? Math.ceil(auditData.total / itemsPerPage) : 0;
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, auditData?.total || 0);

  const viewAuditDetails = (audit: AuditLog) => {
    setSelectedAudit(audit);
    setIsDetailModalOpen(true);
  };

  const getActionBadgeVariant = (action: string) => {
    if (action.includes("CREATE") || action.includes("INITIALIZED"))
      return "default";
    if (
      action.includes("UPDATE") ||
      action.includes("RESOLVED") ||
      action.includes("ACKNOWLEDGED")
    )
      return "secondary";
    if (action.includes("DELETE") || action.includes("REVOKED"))
      return "destructive";
    return "outline";
  };

  return (
    <AdminLayout title="Audit Trails">
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Audit Trails</h1>
            <p className="text-muted-foreground mt-1">
              Track administrative actions and system-wide changes for
              compliance and security.
            </p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={isLoading}
            variant="outline"
            className="gap-2"
          >
            <RefreshCwIcon
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 mb-6 border-b -mx-6 px-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium mb-4">
            <FilterIcon className="h-4 w-4 text-primary" />
            Filters
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {/* Project */}
            <Select
              value={selectedProject}
              onValueChange={(v) => {
                setSelectedProject(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Project" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projectsResponse?.data && projectsResponse.data.length > 0 ? (
                  projectsResponse.data.map((proj: string) => (
                    <SelectItem key={proj} value={proj}>
                      {proj}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="loading" disabled>
                    {projectsLoading ? "Loading projects..." : "No projects"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {/* Actions */}
            <Select
              value={selectedAction}
              onValueChange={(v) => {
                setSelectedAction(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <ActivityIcon className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Action" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actionsResponse?.data && actionsResponse.data.length > 0 ? (
                  actionsResponse.data.map((action: string) => (
                    <SelectItem key={action} value={action}>
                      {action.replace(/_/g, " ")}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="loading" disabled>
                    {actionsLoading ? "Loading actions..." : "No actions"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>

            {/* Entity Type */}
            <Select
              value={selectedEntityType}
              onValueChange={(v) => {
                setSelectedEntityType(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <TagIcon className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Entity Type" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                <SelectItem value="api_key">API Key</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="alert">Alert</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>

            {/* Time range / custom */}
            <Select
              value={selectedTimeRange}
              onValueChange={(v) => {
                setSelectedTimeRange(v);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last hour</SelectItem>
                <SelectItem value="6">Last 6 hours</SelectItem>
                <SelectItem value="12">Last 12 hours</SelectItem>
                <SelectItem value="24">Last 24 hours</SelectItem>
                <SelectItem value="72">Last 3 days</SelectItem>
                <SelectItem value="168">Last 7 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>

            {selectedTimeRange === "custom" && (
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full sm:w-48 justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        format(dateRange.from, "MMM dd, yyyy")
                      ) : (
                        <span>Start date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.from || undefined}
                      onSelect={(date) =>
                        setDateRange({ ...dateRange, from: date || null })
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full sm:w-48 justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.to ? (
                        format(dateRange.to, "MMM dd, yyyy")
                      ) : (
                        <span>End date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateRange.to || undefined}
                      onSelect={(date) =>
                        setDateRange({ ...dateRange, to: date || null })
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="relative col-span-1 sm:col-span-2">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by User ID..."
                className="pl-10"
                value={selectedUser === "all" ? "" : selectedUser}
                onChange={(e) => {
                  setSelectedUser(e.target.value || "all");
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-card shadow-sm overflow-hidden">
          <div className="relative w-full overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                    Timestamp
                  </th>
                  <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                    Action
                  </th>
                  <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                    User
                  </th>
                  <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                    IP Address
                  </th>
                  <th className="h-12 px-4 text-right font-medium text-muted-foreground">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {auditData?.data?.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No audit logs found.
                    </td>
                  </tr>
                ) : (
                  auditData?.data?.map((audit: AuditLog) => (
                    <tr
                      key={audit.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-4 whitespace-nowrap">
                        {dayjs(audit.timestamp).format("MMM DD, YYYY HH:mm:ss")}
                      </td>
                      <td className="p-4">
                        <Badge variant={getActionBadgeVariant(audit.action)}>
                          {audit.action.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center">
                            <UserIcon className="h-3 w-3 text-slate-600" />
                          </div>
                          <span>{audit.userId || "System"}</span>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-xs text-muted-foreground">
                        {audit.ipAddress || "--"}
                      </td>
                      <td className="p-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewAuditDetails(audit)}
                        >
                          <EyeIcon className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium">{startItem}</span> to{" "}
            <span className="font-medium">{endItem}</span> of{" "}
            <span className="font-medium">{auditData?.total || 0}</span> entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium">
              Page {currentPage} of {totalPages || 1}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HistoryIcon className="h-5 w-5 text-primary" />
              Audit Log Details
            </DialogTitle>
          </DialogHeader>
          {selectedAudit && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Timestamp
                  </p>
                  <p className="text-sm">
                    {dayjs(selectedAudit.timestamp).format(
                      "MMMM DD, YYYY [at] HH:mm:ss",
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Action
                  </p>
                  <Badge variant={getActionBadgeVariant(selectedAudit.action)}>
                    {selectedAudit.action}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    User
                  </p>
                  <p className="text-sm">
                    {selectedAudit.userId || "System Integrated Action"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    IP Address
                  </p>
                  <p className="text-sm font-mono">
                    {selectedAudit.ipAddress || "Internal"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Audit Context
                </p>
                <div className="bg-muted p-4 rounded-md border text-xs font-mono overflow-auto max-h-60">
                  <pre>{JSON.stringify(selectedAudit.details, null, 2)}</pre>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Entity Type:
                  </span>
                  <Badge variant="outline" className="capitalize">
                    {selectedAudit.entityType}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Entity ID:
                  </span>
                  <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                    {selectedAudit.entityId || "N/A"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
