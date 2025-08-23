import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Clock, Image, Flag, ArrowRight } from "lucide-react";
import StatsCard from "../dashboard/stats-card";

export default function MessageManagement() {
  const { data: messages, isLoading } = useQuery({
    queryKey: ["/api/messages"],
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
  });

  if (isLoading) {
    return <div>Loading messages...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <p className="text-gray-600">Monitor platform messaging activity</p>
      </div>

      {/* Message Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Total Messages"
          value={stats?.totalMessages || 0}
          icon={MessageSquare}
          iconColor="bg-blue-100 text-blue-500"
        />
        <StatsCard
          title="Today"
          value={stats?.todayMessages || 0}
          icon={Clock}
          iconColor="bg-green-100 text-green-500"
        />
        <StatsCard
          title="Flagged"
          value={stats?.flaggedMessages || 0}
          icon={Flag}
          iconColor="bg-red-100 text-red-500"
        />
        <StatsCard
          title="Images"
          value={stats?.imageMessages || 0}
          icon={Image}
          iconColor="bg-purple-100 text-purple-500"
        />
      </div>

      {/* Recent Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Recent Messages</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-gray-200">
          {messages?.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">No messages found.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Mock message data since we don't have real messages */}
              <div className="pt-6">
                <div className="flex items-start space-x-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">S</span>
                    </div>
                    <ArrowRight className="text-gray-400 h-4 w-4" />
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">M</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-medium text-gray-900">Sarah Johnson</span>
                        <span className="text-sm text-gray-500 mx-2">→</span>
                        <span className="text-sm font-medium text-gray-900">Mike Chen</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">2:30 PM</span>
                        <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600">
                          <Flag className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                      Hey! I really enjoyed our conversation yesterday. Would you like to meet for coffee sometime this week?
                    </p>
                    <div className="flex items-center mt-2 space-x-4">
                      <Badge variant="outline">Text</Badge>
                      <span className="text-xs text-gray-500">Channel: #ch-abc123</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="pt-6">
                <div className="flex items-start space-x-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">E</span>
                    </div>
                    <ArrowRight className="text-gray-400 h-4 w-4" />
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">J</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-medium text-gray-900">Emma Davis</span>
                        <span className="text-sm text-gray-500 mx-2">→</span>
                        <span className="text-sm font-medium text-gray-900">Jessica Wilson</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">1:45 PM</span>
                        <Badge variant="destructive" className="text-xs">Flagged</Badge>
                      </div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <Image className="text-gray-400 h-4 w-4" />
                        <span className="text-sm text-gray-600">Image message</span>
                      </div>
                      <p className="text-sm text-gray-600">Check out this photo from my weekend trip!</p>
                    </div>
                    <div className="flex items-center mt-2 space-x-4">
                      <Badge variant="outline" className="bg-purple-100 text-purple-600">Image</Badge>
                      <span className="text-xs text-gray-500">Channel: #ch-def456</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
