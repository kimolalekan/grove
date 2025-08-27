// components/admin-layout.tsx
import React, { useState, useEffect } from "react";
import Sidebar from "./sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  // Track active section for sidebar highlighting
  const [activeSection, setActiveSection] = useState("metrics");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    // if (!isLoading && !user) {
    //   setLocation("/login");
    // }
  }, [user, isLoading, setLocation]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  // if (!user) {
  //   return null;
  // }

  const admin = {
    name: user.name,
    role: user.role.charAt(0).toUpperCase() + user.role.slice(1),
    email: user.email,
  };

  return (
    <div className="bg-gray-50 min-h-screen w-full flex">
      <head>
        <title>{title}</title>
      </head>
      {/* Sidebar: fixed, does not scroll */}
      <div className="fixed inset-y-0 left-0 z-50 w-[280px]">
        <Sidebar
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          admin={admin}
        />
      </div>
      {/* Main content: scrollable, with left margin for sidebar */}
      <main className="flex-1 ml-0 lg:ml-[280px] transition-all overflow-y-auto h-screen px-0">
        <div className="max-w-6xl mx-auto px-4 ">{children}</div>
      </main>
    </div>
  );
}
