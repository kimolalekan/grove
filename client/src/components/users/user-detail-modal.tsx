import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, AlertTriangle, Trash2 } from "lucide-react";

interface UserDetailModalProps {
  user: any;
  open: boolean;
  onClose: () => void;
}

export default function UserDetailModal({ user, open, onClose }: UserDetailModalProps) {
  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Details</DialogTitle>
        </DialogHeader>
        
        <div className="p-6">
          <div className="flex items-start space-x-6">
            <div className="w-24 h-24 rounded-xl bg-gray-200 flex items-center justify-center">
              <span className="text-2xl font-semibold text-gray-600">
                {user.name.charAt(0)}
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-4">
                <h4 className="text-xl font-semibold text-gray-900">{user.name}</h4>
                <Badge variant={user.isActive ? "default" : "destructive"}>
                  {user.isActive ? "Active" : "Inactive"}
                </Badge>
                <Badge variant={user.isVerified ? "default" : "secondary"}>
                  {user.isVerified ? "Verified" : "Unverified"}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Email:</span>
                  <span className="text-gray-600 ml-2">{user.email}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Phone:</span>
                  <span className="text-gray-600 ml-2">{user.phone || "Not provided"}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Age:</span>
                  <span className="text-gray-600 ml-2">
                    {user.dob ? new Date().getFullYear() - new Date(user.dob).getFullYear() : "N/A"}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Location:</span>
                  <span className="text-gray-600 ml-2">
                    {user.location?.city ? `${user.location.city}, ${user.location.country}` : "Not provided"}
                  </span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Joined:</span>
                  <span className="text-gray-600 ml-2">{user.created_at}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Plan:</span>
                  <span className="text-gray-600 ml-2">Premium</span>
                </div>
              </div>
            </div>
          </div>
          
          {user.bio && (
            <div className="mt-6">
              <h5 className="font-semibold text-gray-900 mb-2">Bio</h5>
              <p className="text-gray-600 text-sm">{user.bio}</p>
            </div>
          )}

          {user.interests && user.interests.length > 0 && (
            <div className="mt-6">
              <h5 className="font-semibold text-gray-900 mb-2">Interests</h5>
              <div className="flex flex-wrap gap-2">
                {user.interests.map((interest: string, index: number) => (
                  <Badge key={index} variant="outline">
                    {interest}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex space-x-3">
            <Button className="flex-1 bg-admin-blue hover:bg-blue-600">
              <Edit className="mr-2 h-4 w-4" />
              Edit User
            </Button>
            <Button variant="outline" className="flex-1 border-yellow-300 text-yellow-600 hover:bg-yellow-50">
              <AlertTriangle className="mr-2 h-4 w-4" />
              Suspend
            </Button>
            <Button variant="destructive" className="flex-1">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
