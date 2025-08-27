import {
  X,
  TrendingUp,
  Users,
  Bell,
  ScrollText,
  Key,
  TreeDeciduous,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  admin: {
    name: string;
    role: string;
    email?: string;
  };
  activeSection: string;
  setActiveSection: (section: string) => void;
}

export default function Sidebar({
  isOpen,
  setIsOpen,
  admin,
  activeSection,
  setActiveSection,
}: SidebarProps) {
  const isMobile = useIsMobile();
  const [location, navigate] = useLocation();
  const { id } = useParams();
  const { logout } = useAuth();
  const { toast } = useToast();

  const user = [
    { id: "metrics", label: "Metrics", icon: TrendingUp, path: "/metrics" },
    { id: "logs", label: "Logs", icon: ScrollText, path: "/logs" },
    {
      id: "alerts",
      label: "Alerts",
      icon: Bell,
      path: "/alerts",
    },
  ];

  const moderator = [
    { id: "metrics", label: "Metrics", icon: TrendingUp, path: "/metrics" },
    { id: "logs", label: "Logs", icon: ScrollText, path: "/logs" },
    {
      id: "alerts",
      label: "Alerts",
      icon: Bell,
      path: "/alerts",
    },
    { id: "users", label: "Users", icon: Users, path: "/users" },
  ];
  const admins = [
    { id: "metrics", label: "Metrics", icon: TrendingUp, path: "/metrics" },
    { id: "logs", label: "Logs", icon: ScrollText, path: "/logs" },
    {
      id: "alerts",
      label: "Alerts",
      icon: Bell,
      path: "/alerts",
    },
    { id: "users", label: "Users", icon: Users, path: "/users" },
    { id: "apikeys", label: "API Keys", icon: Key, path: "/apikeys" },
  ];

  const navItems =
    admin.role === "Admin"
      ? admins
      : admin.role === "Moderator"
        ? moderator
        : user;

  // Determine active section based on current route
  const getActiveSection = () => {
    const currentPath = location;

    // Check if we're on a detail page with an ID parameter
    if (id) {
      // Extract the base path before the ID
      const basePath = currentPath.split("/").slice(0, -1).join("/");

      // Find the matching nav item
      const matchingItem = navItems.find(
        (item) =>
          basePath === item.path || currentPath.startsWith(item.path + "/"),
      );

      return matchingItem?.id || "";
    }

    // For regular paths without IDs
    return navItems.find((item) => item.path === currentPath)?.id || "";
  };

  const currentActiveSection = getActiveSection();

  const handleNavigation = (path: string, sectionId: string) => {
    navigate(path);
    setActiveSection(sectionId);
    if (isMobile) setIsOpen(false);
  };

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged out successfully",
      description: "You have been logged out of your account",
    });
    navigate("/login");
  };

  return (
    <aside
      className={cn(
        "w-280 bg-white shadow-lg border-r border-gray-200 fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out h-full flex flex-col",
        isMobile && !isOpen && "-translate-x-full",
        !isMobile && "translate-x-0",
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
            const isActive = currentActiveSection === item.id;

            return (
              <Button
                key={item.id}
                variant="ghost"
                className={cn(
                  "w-full justify-start px-4 py-3 text-sm font-medium rounded-lg",
                  isActive
                    ? "text-green-700 bg-green-50"
                    : "text-gray-700 hover:bg-gray-100 hover:text-green-700",
                )}
                onClick={() => handleNavigation(item.path, item.id)}
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

        {/* Admin Info and Logout */}
        <div className="px-4 py-4 border-t border-gray-200 space-y-4">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
              <Users className="w-5 h-5 text-gray-600" />
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium text-gray-900">{admin.name}</p>
              <p className="text-xs text-gray-500">{admin.role}</p>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full justify-start text-sm text-gray-600 hover:text-red-600 hover:border-red-200"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </aside>
  );
}
