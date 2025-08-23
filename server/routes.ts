import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { UserCreateSchema, UserUpdateSchema, ReportUpdateSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Dashboard stats
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Users
  app.get("/api/users", async (req, res) => {
    try {
      const { status, verification, subscription } = req.query;
      const users = await storage.getUsersWithFilters({
        status: status as string,
        verification: verification as string,
        subscription: subscription as string,
      });
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    try {
      const validation = UserUpdateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      
      const user = await storage.updateUser(req.params.id, validation.data);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Reports
  app.get("/api/reports", async (req, res) => {
    try {
      const reports = await storage.getAllReports();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.put("/api/reports/:id", async (req, res) => {
    try {
      const { status } = req.body;
      await storage.updateReportStatus(req.params.id, status);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update report" });
    }
  });

  // Verifications
  app.get("/api/verifications", async (req, res) => {
    try {
      const verifications = await storage.getAllVerifications();
      res.json(verifications);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch verifications" });
    }
  });

  app.put("/api/verifications/:id", async (req, res) => {
    try {
      const { status } = req.body;
      await storage.updateVerificationStatus(req.params.id, status);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update verification" });
    }
  });

  // Transactions
  app.get("/api/transactions", async (req, res) => {
    try {
      const transactions = await storage.getAllTransactions();
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Events
  app.get("/api/events", async (req, res) => {
    try {
      const events = await storage.getAllEvents();
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.put("/api/events/:id", async (req, res) => {
    try {
      const { status } = req.body;
      await storage.updateEventStatus(req.params.id, status);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update event" });
    }
  });

  // Messages
  app.get("/api/messages", async (req, res) => {
    try {
      const messages = await storage.getAllMessages();
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // API Logs
  app.get("/api/logs", async (req, res) => {
    try {
      const logs = await storage.getAllApiLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch API logs" });
    }
  });

  // Admin auth
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const admin = await storage.getAdminByEmail(email);
      
      if (!admin) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // In real app, verify password hash
      if (password !== "admin123") {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      res.json({ 
        admin: { 
          id: admin.id, 
          name: admin.name, 
          email: admin.email, 
          role: admin.role 
        },
        token: "mock_jwt_token" 
      });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    res.json({ success: true });
  });

  const httpServer = createServer(app);
  return httpServer;
}
