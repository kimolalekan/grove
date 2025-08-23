import {
  Heart,
  X,
  Menu,
  TrendingUp,
  Users,
  CheckCircle,
  Flag,
  CreditCard,
  Calendar,
  MessageSquare,
  Key,
  Bell,
  ScrollText,
  TreeDeciduous,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  admin: any;
}

const navItems = [
  { id: "dashboard", label: "Metrics", icon: TrendingUp },
  { id: "users", label: "Logs", icon: ScrollText },
  {
    id: "alerts",
    label: "Alerts",
    icon: Bell,
    badge: "23",
    badgeVariant: "red",
  },
  { id: "users", label: "Users", icon: Users },
  { id: "api", label: "Apikeys", icon: Key },
];

export default function Sidebar({
  activeSection,
  setActiveSection,
  isOpen,
  setIsOpen,
  admin,
}: SidebarProps) {
  const isMobile = useIsMobile();

  return (
    <aside
      className={cn(
        "w-280 bg-white shadow-lg border-r border-gray-200 fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out",
        isMobile && !isOpen && "-translate-x-full",
        !isMobile && "lg:translate-x-0 lg:static lg:inset-0",
      )}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
              <TreeDeciduous className="text-white text-sm" />
            </div>
            <span className="ml-3 text-xl font-bold text-gray-900">Grove</span>
          </div>
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;

            return (
              <Button
                key={item.id}
                variant="ghost"
                className={cn(
                  "w-full justify-start px-4 py-3 text-sm font-medium rounded-lg",
                  isActive
                    ? "text-admin-blue bg-blue-50"
                    : "text-gray-700 hover:bg-gray-100",
                )}
                onClick={() => {
                  setActiveSection(item.id);
                  if (isMobile) setIsOpen(false);
                }}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.label}
                {item.badge && (
                  <span
                    className={cn(
                      "ml-auto text-xs px-2 py-1 rounded-full",
                      item.badgeVariant === "red"
                        ? "bg-red-100 text-red-600"
                        : item.badgeVariant === "yellow"
                          ? "bg-yellow-100 text-yellow-600"
                          : "bg-gray-200 text-gray-600",
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Button>
            );
          })}
        </nav>

        {/* Admin Info */}
        <div className="px-4 py-4 border-t border-gray-200">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
              <Users className="w-5 h-5 text-gray-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">{admin.name}</p>
              <p className="text-xs text-gray-500">{admin.role}</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
