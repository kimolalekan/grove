import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Crown, AlertTriangle, Download } from "lucide-react";
import StatsCard from "../dashboard/stats-card";

export default function TransactionManagement() {
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["/api/transactions"],
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
  });

  if (isLoading) {
    return <div>Loading transactions...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
            <p className="text-gray-600">Monitor subscriptions and payments</p>
          </div>
          <div className="mt-4 sm:mt-0">
            <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50">
              <Download className="mr-2 h-4 w-4" />
              Export Report
            </Button>
          </div>
        </div>
      </div>

      {/* Transaction Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatsCard
          title="Total Revenue"
          value={`$${stats?.totalRevenue?.toLocaleString() || 0}`}
          change="+15%"
          changeType="positive"
          icon={DollarSign}
          iconColor="bg-green-100 text-green-500"
        />
        <StatsCard
          title="Premium Subscribers"
          value={stats?.premiumSubscribers || 0}
          change="+8%"
          changeType="positive"
          icon={Crown}
          iconColor="bg-blue-100 text-blue-500"
        />
        <StatsCard
          title="Failed Payments"
          value={stats?.failedPayments || 0}
          change="-3%"
          changeType="positive"
          icon={AlertTriangle}
          iconColor="bg-red-100 text-red-500"
        />
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transaction ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions?.map((transaction: any) => (
                  <tr key={transaction.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{transaction.referenceId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                          <span className="text-xs font-medium text-gray-600">U</span>
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">User #{transaction.userId.slice(0, 8)}</div>
                          <div className="text-sm text-gray-500">ID: {transaction.userId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.plan || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${transaction.amount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={transaction.subscribed ? "default" : "destructive"}>
                        {transaction.subscribed ? "Completed" : "Failed"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {transaction.created_at}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {transactions?.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-gray-500">No transactions found.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
