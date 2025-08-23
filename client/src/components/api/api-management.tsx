import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Key, Clock, AlertTriangle } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import StatsCard from "../dashboard/stats-card";

const apiUsageData = [
  { name: "Mon", requests: 4500 },
  { name: "Tue", requests: 5200 },
  { name: "Wed", requests: 4800 },
  { name: "Thu", requests: 6100 },
  { name: "Fri", requests: 5900 },
  { name: "Sat", requests: 3200 },
  { name: "Sun", requests: 2800 },
];

export default function APIManagement() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["/api/logs"],
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
  });

  if (isLoading) {
    return <div>Loading API data...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">API Management</h1>
        <p className="text-gray-600">Manage API access and monitor usage</p>
      </div>

      {/* API Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Total Requests"
          value={stats?.totalApiRequests || 45678}
          icon={TrendingUp}
          iconColor="bg-blue-100 text-blue-500"
        />
        <StatsCard
          title="Active Keys"
          value={stats?.activeApiKeys || 12}
          icon={Key}
          iconColor="bg-green-100 text-green-500"
        />
        <StatsCard
          title="Avg Response"
          value="145ms"
          icon={Clock}
          iconColor="bg-yellow-100 text-yellow-500"
        />
        <StatsCard
          title="Error Rate"
          value="0.2%"
          icon={AlertTriangle}
          iconColor="bg-red-100 text-red-500"
        />
      </div>

      {/* API Usage Chart */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900">API Usage</CardTitle>
          <select className="text-sm border border-gray-300 rounded-lg px-3 py-1">
            <option>Last 7 days</option>
            <option>Last 30 days</option>
            <option>Last 3 months</option>
          </select>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={apiUsageData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.05)" />
              <XAxis dataKey="name" axisLine={false} />
              <YAxis axisLine={false} />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="requests" 
                stroke="#8B5CF6" 
                strokeWidth={2}
                dot={{ fill: "#8B5CF6", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recent API Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Recent API Logs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Endpoint
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IP
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {/* Mock API log data */}
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    2024-01-15 14:30:45
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    /api/users
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="outline" className="bg-blue-100 text-blue-800">GET</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="default" className="bg-green-100 text-green-800">200</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">143ms</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">192.168.1.100</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">New York, US</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    2024-01-15 14:29:32
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    /api/matches
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="outline" className="bg-green-100 text-green-800">POST</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="default" className="bg-green-100 text-green-800">201</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">267ms</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">10.0.0.45</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">London, UK</td>
                </tr>
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    2024-01-15 14:28:15
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    /api/messages
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="outline" className="bg-red-100 text-red-800">DELETE</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge variant="destructive" className="bg-red-100 text-red-800">404</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">45ms</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">172.16.0.12</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Tokyo, JP</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {logs?.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">No API logs found.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
