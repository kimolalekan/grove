import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Check, X, Ban, Calendar, MapPin } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function EventManagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: events, isLoading } = useQuery({
    queryKey: ["/api/events"],
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PUT", `/api/events/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Event Updated",
        description: "Event status has been updated successfully.",
      });
    },
  });

  const handleEventAction = (id: string, status: string) => {
    updateEventMutation.mutate({ id, status });
  };

  if (isLoading) {
    return <div>Loading events...</div>;
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "planned":
        return "default";
      case "pending":
        return "secondary";
      case "canceled":
        return "destructive";
      case "declined":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "planned":
        return "bg-blue-100 text-blue-600";
      case "pending":
        return "bg-green-100 text-green-600";
      case "canceled":
        return "bg-red-100 text-red-600";
      case "declined":
        return "bg-gray-100 text-gray-600";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <p className="text-gray-600">Manage user-created dating events</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {events?.map((event: any) => (
          <Card key={event.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(event.status)}`}>
                  {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                </span>
                <span className="text-xs text-gray-500">#{event.id.slice(0, 8)}</span>
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {event.title || "Untitled Event"}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {event.description || "No description provided"}
              </p>
              
              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-gray-500">
                  <Calendar className="mr-2 w-4 h-4" />
                  <span>{new Date(event.start_time).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center text-sm text-gray-500">
                  <MapPin className="mr-2 w-4 h-4" />
                  <span>{event.location?.address || "Location not specified"}</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                    <span className="text-xs font-medium text-gray-600">C</span>
                  </div>
                  <div className="ml-2">
                    <p className="text-xs font-medium text-gray-900">Creator</p>
                    <p className="text-xs text-gray-500">ID: {event.creator_id.slice(0, 8)}</p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button variant="ghost" size="sm" className="text-admin-blue hover:text-blue-600">
                    <Eye className="h-4 w-4" />
                  </Button>
                  {event.status === "pending" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-green-400 hover:text-green-600"
                        onClick={() => handleEventAction(event.id, "planned")}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-600"
                        onClick={() => handleEventAction(event.id, "declined")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {event.status === "planned" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-600"
                      onClick={() => handleEventAction(event.id, "canceled")}
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {events?.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">No events found.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
