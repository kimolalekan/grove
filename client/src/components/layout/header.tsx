import { Menu, Search, Bell, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";

interface HeaderProps {
  onMenuClick: () => void;
  admin: any;
}

export default function Header({ onMenuClick, admin }: HeaderProps) {
  const { logout } = useAuth();
  const isMobile = useIsMobile();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6">
        <div className="flex items-center">
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMenuClick}
              className="text-gray-400 hover:text-gray-600 mr-3"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <div className="relative">
            <Input
              type="text"
              placeholder="Search users, reports, transactions..."
              className="w-80 pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-admin-blue focus:border-transparent"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" className="relative text-gray-400 hover:text-gray-600">
            <Bell className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
              3
            </span>
          </Button>
          <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-600">
            <Settings className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => logout()}
            className="text-gray-700 hover:text-gray-900"
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
