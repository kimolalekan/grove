import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TreeDeciduous, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Cookies from "js-cookie";

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  data: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    lastLogin: string;
    createdAt: string;
    updatedAt: string;
  };
}

// API function for login
const loginUser = async (credentials: LoginRequest): Promise<LoginResponse> => {
  const response = await fetch("/api/users/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Login failed");
  }

  return response.json();
};

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const { setUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // React Query mutation for login
  const loginMutation = useMutation({
    mutationFn: loginUser,
    onSuccess: (data) => {
      // Store user data in auth context
      setUser(data.data);

      // Store user data in cookie with 1-hour expiration
      Cookies.set("user", JSON.stringify(data.data), {
        expires: 1 / 24, // 1 hour (1/24 of a day)
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      // Store session token if your API returns one
      if (data.token) {
        Cookies.set("token", data.token, {
          expires: 1 / 24,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
        });
      }

      // Show success toast
      toast({
        title: "Login Successful",
        description: `Welcome back, ${data.data.name}!`,
      });

      // Navigate to home page
      navigate("/metrics");
    },
    onError: (error: Error) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    },
  });

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    if (!validateEmail(newEmail) && newEmail.length > 0) {
      setEmailError("Please enter a valid email address");
    } else {
      setEmailError(null);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    if (!password) {
      toast({
        title: "Error",
        description: "Please enter your password",
        variant: "destructive",
      });
      return;
    }

    // Trigger the login mutation
    loginMutation.mutate({ email, password });
  };

  // Check if user is already logged in via cookie
  useEffect(() => {
    const userCookie = Cookies.get("user");
    if (userCookie) {
      try {
        const userData = JSON.parse(userCookie);
        setUser(userData);
        navigate("/metrics");
      } catch (error) {
        // Clear invalid cookie
        Cookies.remove("user");
        Cookies.remove("token");
      }
    }
  }, [setUser, navigate]);

  return (
    <div className="min-h-screen bg-admin-gray flex items-center justify-center p-4">
      <title>Login</title>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12  rounded-lg flex items-center justify-center">
              <img src="/logo.png" alt="Grove Logo" className="w-12 h-12" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Grove
          </CardTitle>
          <p className="text-gray-600">Sign in to your admin account</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="Your email address"
                required
                disabled={loginMutation.isPending}
              />
              {emailError && (
                <p className="text-red-500 text-sm mt-1">{emailError}</p>
              )}
            </div>
            <div className="relative">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={loginMutation.isPending}
              />
              <button
                type="button"
                className="absolute right-3 top-9 text-gray-500"
                onClick={togglePasswordVisibility}
                disabled={loginMutation.isPending}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending || !email || !password}
            >
              {loginMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
