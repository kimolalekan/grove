// hooks/use-auth.tsx
import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
} from "react";
import Cookies from "js-cookie";
import { useLocation } from "wouter";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [location, setLocation] = useLocation();

  // Load user from cookie on mount
  useEffect(() => {
    const userCookie = Cookies.get("user");
    const tokenCookie = Cookies.get("token");

    // If no token or user cookie, redirect to login
    if (!tokenCookie || !userCookie) {
      setIsLoading(false);
      setLocation("/login");
      return;
    }

    if (userCookie) {
      try {
        const userData = JSON.parse(userCookie);
        setUserState(userData);
      } catch (error) {
        // Clear invalid cookie and redirect to login
        Cookies.remove("user");
        Cookies.remove("token");
        setLocation("/login");
      }
    }
    setIsLoading(false);
  }, [setLocation]);

  // Update cookie when user changes
  const setUser = useCallback((newUser: User | null) => {
    setUserState(newUser);
    if (newUser) {
      Cookies.set("user", JSON.stringify(newUser), {
        expires: 4 / 24,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
    } else {
      Cookies.remove("user");
      Cookies.remove("token");
    }
  }, []);

  // Logout function
  const logout = useCallback(() => {
    setUserState(null);
    Cookies.remove("user");
    Cookies.remove("token");
    setLocation("/login");
  }, [setLocation]);

  const value = {
    user,
    setUser,
    isLoading,
    logout,
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
