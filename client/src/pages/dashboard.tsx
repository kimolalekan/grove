import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import DashboardOverview from "@/components/dashboard/overview";
import UserManagement from "@/components/users/user-management";
import VerificationManagement from "@/components/verification/verification-management";
import ReportManagement from "@/components/reports/report-management";
import TransactionManagement from "@/components/transactions/transaction-management";
import EventManagement from "@/components/events/event-management";
import MessageManagement from "@/components/messages/message-management";
import APIManagement from "@/components/api/api-management";
import { useIsMobile } from "@/hooks/use-mobile";

export default function Dashboard() {
  const { admin } = useAuth();
  const [, navigate] = useLocation();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  // Redirect if not logged in
  if (!admin) {
    navigate("/login");
    return null;
  }

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <DashboardOverview />;
      case "users":
        return <UserManagement />;
      case "verification":
        return <VerificationManagement />;
      case "reports":
        return <ReportManagement />;
      case "transactions":
        return <TransactionManagement />;
      case "events":
        return <EventManagement />;
      case "messages":
        return <MessageManagement />;
      case "api":
        return <APIManagement />;
      default:
        return <DashboardOverview />;
    }
  };

  return (
    <div className="min-h-screen flex bg-admin-gray">
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        admin={admin}
      />

      {/* Overlay for mobile */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex-1 lg:ml-0">
        <Header onMenuClick={() => setSidebarOpen(true)} admin={admin} />
        <main className="p-4 sm:p-6">{renderContent()}</main>
      </div>
    </div>
  );
}
