export interface Admin {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const getStoredAuth = (): Admin | null => {
  const token = localStorage.getItem("admin_token");
  if (!token) return null;
  
  // In a real app, decode JWT token
  return {
    id: "1",
    name: "John Admin",
    email: "admin@loveadmin.com",
    role: "admin",
  };
};

export const storeAuth = (admin: Admin, token: string) => {
  localStorage.setItem("admin_token", token);
  localStorage.setItem("admin_data", JSON.stringify(admin));
};

export const clearAuth = () => {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_data");
};
