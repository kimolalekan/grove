import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative";
  icon: LucideIcon;
  iconColor: string;
}

export default function StatsCard({ title, value, change, changeType, icon: Icon, iconColor }: StatsCardProps) {
  return (
    <Card className="bg-white border border-gray-200">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
          </div>
          <div className={`w-12 h-12 ${iconColor} rounded-lg flex items-center justify-center`}>
            <Icon className="text-xl" />
          </div>
        </div>
        {change && (
          <div className="mt-4 flex items-center">
            <span className={`text-sm font-medium ${
              changeType === "positive" ? "text-green-500" : "text-red-500"
            }`}>
              {change}
            </span>
            <span className="text-gray-500 text-sm ml-1">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
