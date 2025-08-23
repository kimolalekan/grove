import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Ban, AlertTriangle, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ReportManagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: reports, isLoading } = useQuery({
    queryKey: ["/api/reports"],
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PUT", `/api/reports/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      toast({
        title: "Report Updated",
        description: "Report status has been updated successfully.",
      });
    },
  });

  const handleReportAction = (id: string, status: string) => {
    updateReportMutation.mutate({ id, status });
  };

  if (isLoading) {
    return <div>Loading reports...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports Management</h1>
        <p className="text-gray-600">Review and resolve user reports</p>
      </div>

      <div className="space-y-6">
        {reports?.map((report: any) => (
          <Card key={report.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <span className="text-lg font-semibold text-gray-900">{report.reason}</span>
                      <Badge
                        variant={report.reason.includes("Inappropriate") ? "destructive" : "secondary"}
                        className="ml-3"
                      >
                        {report.reason.includes("Inappropriate") ? "High Priority" : "Medium Priority"}
                      </Badge>
                    </div>
                    <span className="text-sm text-gray-500">#{report.id.slice(0, 8)}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Reporter</h4>
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-600">R</span>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">Reporter User</p>
                          <p className="text-xs text-gray-500">ID: {report.userId}</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Reported User</h4>
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                          <span className="text-sm font-medium text-gray-600">V</span>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">Violator User</p>
                          <p className="text-xs text-gray-500">ID: {report.violatorId}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                    <p className="text-sm text-gray-600">{report.description}</p>
                  </div>

                  <div className="flex items-center text-xs text-gray-500 mb-4">
                    <span>Reported: {new Date(report.created_at).toLocaleDateString()}</span>
                    <span className="mx-2">•</span>
                    <span>Category: {report.reason}</span>
                    <span className="mx-2">•</span>
                    <Badge variant="outline">{report.status}</Badge>
                  </div>

                  {report.status === "pending" && (
                    <div className="flex space-x-3">
                      <Button
                        className="bg-green-500 hover:bg-green-600"
                        onClick={() => handleReportAction(report.id, "resolved")}
                      >
                        <Check className="mr-2 h-4 w-4" />
                        Resolve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleReportAction(report.id, "banned")}
                      >
                        <Ban className="mr-2 h-4 w-4" />
                        Ban User
                      </Button>
                      <Button
                        className="bg-yellow-500 hover:bg-yellow-600"
                        onClick={() => handleReportAction(report.id, "warned")}
                      >
                        <AlertTriangle className="mr-2 h-4 w-4" />
                        Warn User
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleReportAction(report.id, "dismissed")}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {reports?.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">No reports found.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
