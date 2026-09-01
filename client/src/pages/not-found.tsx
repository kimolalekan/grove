import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      <title>Page Not Found</title>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <h1 className="text-3xl font-bold">404</h1>
          </div>
          <h2 className="text-xl font-semibold text-center">Page Not Found</h2>
        </div>
        <div className="flex flex-col items-center gap-4 pt-2 mt-10">
          <p className="text-center text-xl">
            Oops! The page you are looking for doesn’t exist or has been moved.
          </p>
          <Button
            variant="default"
            className="bg-admin-green hover:bg-green-700 mt-10"
          >
            <a href="/" className="flex">
              <Home className="h-6 w-6 mr-2" /> Go Home
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
