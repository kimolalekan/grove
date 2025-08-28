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
  ChevronDownIcon,
  SearchIcon,
  FilterIcon,
  RefreshCwIcon,
  CalendarIcon,
  EyeIcon,
  GlobeIcon,
  UserIcon,
  CodeIcon,
  ServerIcon,
  ClockIcon,
  FileTextIcon,
  CopyIcon,
  CheckIcon,
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
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import dayjs from "dayjs";

interface LogEntry {
  id: number;
  project: string;
  timestamp: string;
  source: string;
  message: string;
  level: "info" | "warning" | "error";
  details?: {
    ip?: string;
    userAgent?: string;
    userId?: string;
    duration?: number;
    statusCode?: number;
    method?: string;
    path?: string;
    size?: string;
  };
}

export default function Logs() {
  const { toast } = useToast();
  const [selectedHost, setSelectedHost] = useState("Arya Web");
  const [selectedSource, setSelectedSource] = useState("all");
  const [selectedLevel, setSelectedLevel] = useState("all");
  const [selectedProject, setSelectedProject] = useState("all");
  const [selectedTimeRange, setSelectedTimeRange] = useState("24");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState({
    from: null as Date | null,
    to: null as Date | null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
  const [messageCopied, setMessageCopied] = useState(false);
  const [userAgentCopied, setUserAgentCopied] = useState(false);
  const [messageExpanded, setMessageExpanded] = useState(false);
  const [jsonFormatted, setJsonFormatted] = useState(false);

  // Fetch projects
  const {
    data: projectsData,
    isLoading: projectsLoading,
    error: projectsError,
    refetch: refetchProjects,
  } = useQuery({
    queryKey: ["logs-projects"],
    queryFn: async () => {
      const apiKey = import.meta.env.VITE_PUBLIC_API_KEY;
      if (!apiKey) {
        console.error("API key is missing");
        throw new Error("API key is required");
      }

      const response = await fetch("/api/logs/projects", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Projects API error:", errorData);
        throw new Error(
          `Failed to fetch projects: ${errorData.message || response.statusText}`,
        );
      }

      const data = await response.json();

      return data.data || [];
    },
    retry: (failureCount, error) => {
      console.log(`Projects API retry attempt ${failureCount}:`, error.message);
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Fetch sources
  const {
    data: sourcesData,
    isLoading: sourcesLoading,
    error: sourcesError,
    refetch: refetchSources,
  } = useQuery({
    queryKey: ["logs-sources"],
    queryFn: async () => {
      const apiKey = import.meta.env.VITE_PUBLIC_API_KEY;
      if (!apiKey) {
        console.error("API key is missing");
        throw new Error("API key is required");
      }

      const response = await fetch("/api/logs/sources", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        throw new Error(
          `Failed to fetch sources: ${errorData.message || response.statusText}`,
        );
      }

      const data = await response.json();
      return data.data || [];
    },
    retry: (failureCount, error) => {
      console.log(`Sources API retry attempt ${failureCount}:`, error.message);
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  // Show errors in toast if any and provide retry options
  React.useEffect(() => {
    if (projectsError) {
      toast({
        title: "Failed to load projects",
        description: (
          <div className="space-y-2">
            <div>
              {projectsError instanceof Error
                ? projectsError.message
                : "Unknown error"}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchProjects()}
            >
              Retry
            </Button>
          </div>
        ),
        variant: "destructive",
        duration: 10000,
      });
    }
    if (sourcesError) {
      toast({
        title: "Failed to load sources",
        description: (
          <div className="space-y-2">
            <div>
              {sourcesError instanceof Error
                ? sourcesError.message
                : "Unknown error"}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetchSources()}
            >
              Retry
            </Button>
          </div>
        ),
        variant: "destructive",
        duration: 10000,
      });
    }
  }, [projectsError, sourcesError, toast, refetchProjects, refetchSources]);

  // Reset pagination when date range changes
  React.useEffect(() => {
    resetPagination();
  }, [dateRange.from, dateRange.to]);

  const { data: logData, refetch } = useQuery({
    queryKey: [
      "logs",
      searchQuery,
      selectedSource,
      selectedLevel,
      selectedProject,
      selectedTimeRange,
      dateRange.from,
      dateRange.to,
      currentPage,
    ],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (searchQuery) searchParams.append("search", searchQuery);
      if (selectedSource !== "all")
        searchParams.append("source", selectedSource);
      if (selectedLevel !== "all") searchParams.append("level", selectedLevel);
      if (selectedProject !== "all")
        searchParams.append("project", selectedProject);

      // Add time range parameters
      if (selectedTimeRange) {
        searchParams.append("timeRange", selectedTimeRange);
      }

      // Add custom date range if selected
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

      const response = await fetch(`/api/logs?${searchParams}`, {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_PUBLIC_API_KEY}`,
        },
      });
      const data = await response.json();
      return data;
    },
  });

  const handleRefresh = () => {
    setIsLoading(true);
    refetchProjects();
    refetchSources();
    refetch().then(() => setIsLoading(false));
  };

  const resetPagination = () => {
    setCurrentPage(1);
  };

  const totalPages = logData ? Math.ceil(logData.total / itemsPerPage) : 0;
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, logData?.total || 0);

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

  const getLevelBadgeVariant = (level: string) => {
    switch (level) {
      case "error":
        return "destructive";
      case "warning":
        return "secondary";
      case "info":
        return "outline";
      default:
        return "outline";
    }
  };

  const viewLogDetails = (log: LogEntry) => {
    setSelectedLog(log);
    setIsDetailModalOpen(true);
  };

  const closeLogDetails = () => {
    setIsDetailModalOpen(false);
    setSelectedLog(null);
    setMessageCopied(false);
    setUserAgentCopied(false);
    setMessageExpanded(false);
    setJsonFormatted(false);
  };

  const copyToClipboard = async (
    text: string,
    type: "message" | "userAgent",
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "message") {
        setMessageCopied(true);
        setTimeout(() => setMessageCopied(false), 2000);
      } else {
        setUserAgentCopied(true);
        setTimeout(() => setUserAgentCopied(false), 2000);
      }
      toast({
        title: "Copied to clipboard",
        description: `${type === "message" ? "Log message" : "User agent"} copied successfully`,
      });
    } catch (err) {
      console.error("Failed to copy text:", err);
      toast({
        title: "Copy failed",
        description:
          "Failed to copy to clipboard. Please try selecting and copying manually.",
        variant: "destructive",
      });
    }
  };

  const isJsonString = (str: string): boolean => {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  };

  const formatJson = (str: string): string => {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  };

  const getDisplayMessage = (message: string): string => {
    if (jsonFormatted && isJsonString(message)) {
      return formatJson(message);
    }
    return message;
  };

  const DetailItem = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: React.ElementType;
    label: string;
    value: string | number | undefined;
  }) => {
    if (!value) return null;
    return (
      <div className="flex items-center gap-3 py-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-muted-foreground">
            {label}
          </div>
          <div className="text-sm truncate">{value}</div>
        </div>
      </div>
    );
  };

  return (
    <AdminLayout title="Logs">
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Logs</h1>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleRefresh}
              disabled={isLoading}
              className="gap-1"
            >
              <RefreshCwIcon
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        <div className="bg-muted/40 p-4 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FilterIcon className="h-4 w-4" />
              <h2 className="font-semibold">Filters</h2>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <Select
              value={selectedSource}
              onValueChange={(value) => {
                setSelectedSource(value);
                resetPagination();
              }}
              disabled={sourcesLoading}
            >
              <SelectTrigger className="w-full sm:w-48">
                {sourcesLoading && (
                  <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                )}
                <SelectValue
                  placeholder={sourcesLoading ? "Loading sources..." : "Source"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {sourcesLoading ? (
                  <SelectItem value="loading" disabled>
                    <div className="flex items-center gap-2">
                      <RefreshCwIcon className="h-3 w-3 animate-spin" />
                      Loading sources...
                    </div>
                  </SelectItem>
                ) : sourcesError ? (
                  <>
                    <SelectItem value="error" disabled>
                      ❌ Error loading sources
                    </SelectItem>
                    <SelectItem
                      value="retry"
                      className="text-blue-600 hover:bg-blue-50"
                      onSelect={() => {
                        refetchSources();
                        return false;
                      }}
                    >
                      🔄 Retry loading sources
                    </SelectItem>
                  </>
                ) : sourcesData?.length === 0 ? (
                  <SelectItem value="empty" disabled>
                    📭 No sources found
                  </SelectItem>
                ) : (
                  sourcesData?.map((source: string) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Select
              value={selectedLevel}
              onValueChange={(value) => {
                setSelectedLevel(value);
                resetPagination();
              }}
            >
              <SelectTrigger className="w-full sm:w-48">
                <FilterIcon className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={selectedProject}
              onValueChange={(value) => {
                setSelectedProject(value);
                resetPagination();
              }}
              disabled={projectsLoading}
            >
              <SelectTrigger className="w-full sm:w-48">
                {projectsLoading ? (
                  <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FilterIcon className="h-4 w-4 mr-2" />
                )}
                <SelectValue
                  placeholder={
                    projectsLoading
                      ? "Loading projects..."
                      : "Filter by project"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projectsLoading ? (
                  <SelectItem value="loading" disabled>
                    <div className="flex items-center gap-2">
                      <RefreshCwIcon className="h-3 w-3 animate-spin" />
                      Loading projects...
                    </div>
                  </SelectItem>
                ) : projectsError ? (
                  <>
                    <SelectItem value="error" disabled>
                      ❌ Error loading projects
                    </SelectItem>
                    <SelectItem
                      value="retry"
                      className="text-blue-600 hover:bg-blue-50"
                      onSelect={() => {
                        refetchProjects();
                        return false;
                      }}
                    >
                      🔄 Retry loading projects
                    </SelectItem>
                  </>
                ) : projectsData?.length === 0 ? (
                  <SelectItem value="empty" disabled>
                    📭 No projects found
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
            <Select
              value={selectedTimeRange}
              onValueChange={(value) => {
                setSelectedTimeRange(value);
                resetPagination();
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
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  resetPagination();
                }}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="rounded-md border">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                    Timestamp
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                    Project
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                    Source
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                    Level
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                    Message
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {logData?.data?.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No logs found matching the current filters.
                    </td>
                  </tr>
                ) : (
                  logData?.data?.map((log: LogEntry) => (
                    <tr
                      key={log.id}
                      className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                    >
                      <td className="p-4 align-middle font-medium">
                        {dayjs(log.timestamp).format("MMM DD, YYYY hh:mm:ss A")}
                      </td>
                      <td className="p-4 align-middle">{log.project}</td>
                      <td className="p-4 align-middle">{log.source}</td>
                      <td className="p-4 align-middle">
                        <Badge variant={getLevelBadgeVariant(log.level)}>
                          {log.level}
                        </Badge>
                      </td>
                      <td className="p-4 align-middle">{log.message}</td>
                      <td className="p-4 align-middle">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewLogDetails(log)}
                          className="h-8 w-8 p-0"
                        >
                          <EyeIcon className="h-4 w-4" />
                          <span className="sr-only">View details</span>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination and Stats */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {logData?.data?.length === 0 ? (
              "No entries found"
            ) : logData ? (
              <>
                Showing <span className="font-medium">{startItem}</span> to{" "}
                <span className="font-medium">{endItem}</span> of{" "}
                <span className="font-medium">{logData.total}</span> entries
                {(searchQuery ||
                  selectedSource !== "all" ||
                  selectedLevel !== "all" ||
                  selectedProject !== "all") && (
                  <span className="text-blue-600 ml-1">(filtered)</span>
                )}
              </>
            ) : (
              "Loading..."
            )}
          </div>

          {logData && logData.total > itemsPerPage && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={goToPreviousPage}
                className="gap-1"
              >
                <ChevronDownIcon className="h-4 w-4 rotate-90" />
                Previous
              </Button>

              {/* Show page numbers */}
              {totalPages <= 7 ? (
                // Show all pages if 7 or fewer
                Array.from({ length: totalPages }, (_, i) => (
                  <Button
                    key={i + 1}
                    variant={currentPage === i + 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => goToPage(i + 1)}
                    className="min-w-[36px]"
                  >
                    {i + 1}
                  </Button>
                ))
              ) : (
                // Show condensed pagination for more than 7 pages
                <>
                  {/* Always show first page */}
                  <Button
                    variant={currentPage === 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => goToPage(1)}
                    className="min-w-[36px]"
                  >
                    1
                  </Button>

                  {/* Show ellipsis if current page is far from start */}
                  {currentPage > 4 && (
                    <span className="px-2 text-muted-foreground">...</span>
                  )}

                  {/* Show pages around current page */}
                  {Array.from({ length: 3 }, (_, i) => {
                    const pageNum = currentPage - 1 + i;
                    if (pageNum > 1 && pageNum < totalPages) {
                      return (
                        <Button
                          key={pageNum}
                          variant={
                            currentPage === pageNum ? "default" : "outline"
                          }
                          size="sm"
                          onClick={() => goToPage(pageNum)}
                          className="min-w-[36px]"
                        >
                          {pageNum}
                        </Button>
                      );
                    }
                    return null;
                  })}

                  {/* Show ellipsis if current page is far from end */}
                  {currentPage < totalPages - 3 && (
                    <span className="px-2 text-muted-foreground">...</span>
                  )}

                  {/* Always show last page */}
                  {totalPages > 1 && (
                    <Button
                      variant={
                        currentPage === totalPages ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => goToPage(totalPages)}
                      className="min-w-[36px]"
                    >
                      {totalPages}
                    </Button>
                  )}
                </>
              )}

              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={goToNextPage}
                className="gap-1"
              >
                Next
                <ChevronDownIcon className="h-4 w-4 -rotate-90" />
              </Button>
            </div>
          )}
        </div>

        <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <EyeIcon className="h-5 w-5" />
                Log Details
              </DialogTitle>
              <DialogDescription>
                Detailed information about the selected log entry
              </DialogDescription>
            </DialogHeader>
            {selectedLog && (
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-muted-foreground">
                        Timestamp
                      </div>
                      <div className="text-sm">
                        {dayjs(selectedLog.timestamp).format(
                          "MMM DD, YYYY @ hh:mm:ss A",
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-muted-foreground">
                        Project
                      </div>
                      <div className="text-sm">{selectedLog.project}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-muted-foreground">
                        Source
                      </div>
                      <div className="text-sm">{selectedLog.source}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-muted-foreground">
                        Level
                      </div>
                      <div className="text-sm">
                        <Badge
                          variant={getLevelBadgeVariant(selectedLog.level)}
                        >
                          {selectedLog.level}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Message in code container */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-muted-foreground">
                        Message
                      </div>
                      <div className="flex gap-2">
                        {isJsonString(selectedLog.message) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setJsonFormatted(!jsonFormatted)}
                            className="h-8 px-2 gap-1"
                          >
                            {jsonFormatted ? (
                              <>
                                <CodeIcon className="h-3 w-3" />
                                Raw
                              </>
                            ) : (
                              <>
                                <CodeIcon className="h-3 w-3" />
                                Format JSON
                              </>
                            )}
                          </Button>
                        )}
                        {selectedLog.message.length > 200 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMessageExpanded(!messageExpanded)}
                            className="h-8 px-2 gap-1"
                          >
                            {messageExpanded ? (
                              <>
                                <ChevronDownIcon className="h-3 w-3" />
                                Collapse
                              </>
                            ) : (
                              <>
                                <ChevronDownIcon className="h-3 w-3 rotate-180" />
                                Expand
                              </>
                            )}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(
                              getDisplayMessage(selectedLog.message),
                              "message",
                            )
                          }
                          className="h-8 px-2 gap-1"
                        >
                          {messageCopied ? (
                            <>
                              <CheckIcon className="h-3 w-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <CopyIcon className="h-3 w-3" />
                              Copy
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <div className="relative">
                      <pre
                        className={`bg-slate-100 dark:bg-slate-800 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap break-words border border-slate-200 dark:border-slate-700 font-mono ${
                          messageExpanded || selectedLog.message.length <= 200
                            ? "max-h-96"
                            : "max-h-32"
                        } overflow-y-auto transition-all duration-200`}
                      >
                        <code className="text-slate-800 dark:text-slate-200">
                          {getDisplayMessage(selectedLog.message)}
                        </code>
                      </pre>
                      {!messageExpanded && selectedLog.message.length > 200 && (
                        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-100 dark:from-slate-800 to-transparent rounded-b-lg pointer-events-none" />
                      )}
                    </div>
                  </div>
                  {selectedLog.details && (
                    <div className="border-t pt-4 mt-4">
                      <h3 className="font-medium mb-3">Additional Details</h3>
                      <div className="space-y-1">
                        <DetailItem
                          icon={GlobeIcon}
                          label="IP Address"
                          value={selectedLog.details.ip}
                        />
                        <DetailItem
                          icon={UserIcon}
                          label="User ID"
                          value={selectedLog.details.userId}
                        />
                        <DetailItem
                          icon={CodeIcon}
                          label="HTTP Method"
                          value={selectedLog.details.method}
                        />
                        <DetailItem
                          icon={ServerIcon}
                          label="Path"
                          value={selectedLog.details.path}
                        />
                        <DetailItem
                          icon={CodeIcon}
                          label="Status Code"
                          value={selectedLog.details.statusCode}
                        />
                        <DetailItem
                          icon={ClockIcon}
                          label="Duration"
                          value={
                            selectedLog.details.duration
                              ? `${selectedLog.details.duration}ms`
                              : undefined
                          }
                        />
                        <DetailItem
                          icon={FileTextIcon}
                          label="Size"
                          value={selectedLog.details.size}
                        />
                        {selectedLog.details.userAgent && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                <CodeIcon className="h-4 w-4" />
                                User Agent
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  copyToClipboard(
                                    selectedLog.details?.userAgent || "",
                                    "userAgent",
                                  )
                                }
                                className="h-8 px-2 gap-1"
                              >
                                {userAgentCopied ? (
                                  <>
                                    <CheckIcon className="h-3 w-3" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <CopyIcon className="h-3 w-3" />
                                    Copy
                                  </>
                                )}
                              </Button>
                            </div>
                            <div className="relative">
                              <pre className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-24 overflow-y-auto border border-slate-200 dark:border-slate-700 font-mono">
                                <code className="text-slate-800 dark:text-slate-200">
                                  {selectedLog.details.userAgent}
                                </code>
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
