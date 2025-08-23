import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, X, Play } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function VerificationManagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: verifications, isLoading } = useQuery({
    queryKey: ["/api/verifications"],
  });

  const updateVerificationMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PUT", `/api/verifications/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/verifications"] });
      toast({
        title: "Verification Updated",
        description: "Verification status has been updated successfully.",
      });
    },
  });

  const handleVerificationAction = (id: string, status: string) => {
    updateVerificationMutation.mutate({ id, status });
  };

  if (isLoading) {
    return <div>Loading verification requests...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Verification Requests</h1>
        <p className="text-gray-600">Review and approve user verification requests</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {verifications?.map((verification: any) => (
          <Card key={verification.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center">
                    <span className="text-lg font-semibold text-gray-600">
                      U
                    </span>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-lg font-semibold text-gray-900">User #{verification.userId.slice(0, 8)}</h3>
                    <p className="text-sm text-gray-500">ID: {verification.id.slice(0, 8)}</p>
                  </div>
                </div>
                <Badge variant={verification.status === "pending" ? "secondary" : "default"}>
                  {verification.status}
                </Badge>
              </div>

              {/* Verification Video/Image */}
              <div className="mb-4">
                <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center mb-2">
                  <div className="text-center">
                    <Play className="text-gray-400 text-2xl mb-2 mx-auto" />
                    <p className="text-sm text-gray-500">Verification Video</p>
                    <Button variant="link" className="text-admin-blue text-sm hover:underline mt-1">
                      Play Video
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Submitted: {new Date(verification.created_at).toLocaleDateString()}
                </p>
              </div>

              {verification.status === "pending" && (
                <div className="flex space-x-3">
                  <Button
                    className="flex-1 bg-green-500 hover:bg-green-600"
                    onClick={() => handleVerificationAction(verification.id, "approved")}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => handleVerificationAction(verification.id, "rejected")}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {verifications?.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">No verification requests found.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
