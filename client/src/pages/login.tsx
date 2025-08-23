import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, isLoading, admin } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Redirect if already logged in
  useEffect(() => {
    if (admin) {
      navigate("/");
    }
  }, [admin, navigate]);

  if (admin) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate("/");
    } catch (error) {
      toast({
        title: "Login Failed",
        description:
          "Invalid email or password. Try admin@loveadmin.com / admin123",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-admin-gray flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-admin-blue rounded-lg flex items-center justify-center">
              <Heart className="text-white text-xl" />
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
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email address"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-admin-blue hover:bg-blue-600"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-gray-500">
            Demo credentials: admin@loveadmin.com / admin123
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
