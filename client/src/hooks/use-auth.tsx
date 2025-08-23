import { createContext, useContext, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Admin {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  admin: Admin | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      
      if (!response.ok) {
        throw new Error("Invalid credentials");
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      setAdmin(data.admin);
      localStorage.setItem("admin_token", data.token);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/logout", { method: "POST" });
    },
    onSuccess: () => {
      setAdmin(null);
      localStorage.removeItem("admin_token");
    },
  });

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token) {
      setAdmin({
        id: "1",
        name: "John Admin",
        email: "admin@loveadmin.com",
        role: "admin",
      });
    }
  }, []);

  const login = async (email: string, password: string) => {
    return await loginMutation.mutateAsync({ email, password });
  };

  const logout = async () => {
    return await logoutMutation.mutateAsync();
  };

  const value = {
    admin,
    login,
    logout,
    isLoading: loginMutation.isPending || logoutMutation.isPending,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
