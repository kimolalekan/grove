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
  const [, setLocation] = useLocation();

  useEffect(() => {
    const userCookie = Cookies.get("user");

    if (userCookie) {
      try {
        const userData = JSON.parse(userCookie);
        setUserState(userData);
        console.log("User data restored:", userData);
      } catch (error) {
        console.error("Failed to parse user cookie:", error);
        Cookies.remove("user");
      }
    } else {
      console.log("No user cookie found");
    }
    setIsLoading(false);
  }, []);

  const setUser = useCallback((newUser: User | null) => {
    setUserState(newUser);
    if (newUser) {
      Cookies.set("user", JSON.stringify(newUser), {
        expires: 4 / 24, // 4 hours
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
    } else {
      Cookies.remove("user");
    }
  }, []);

  const logout = useCallback(() => {
    setUserState(null);
    Cookies.remove("user");
    // Navigate to login after logout
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
