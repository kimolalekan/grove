import {
  User,
  NewUser,
  user,
  events,
  admin,
  message,
  transaction,
  report,
  verification,
  blockLists,
  apiKey,
  apiLog,
  Admin,
  Transaction,
  Report,
  Verification,
  Event,
  Message,
  ApiKey,
  ApiLog
} from "@shared/schema";
import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: NewUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUsersWithFilters(filters: {
    status?: string;
    verification?: string;
    subscription?: string;
  }): Promise<User[]>;

  // Admin
  getAdmin(id: string): Promise<Admin | undefined>;
  getAdminByEmail(email: string): Promise<Admin | undefined>;
  createAdmin(adminData: Partial<Admin>): Promise<Admin>;

  // Events
  getAllEvents(): Promise<Event[]>;
  getEvent(id: string): Promise<Event | undefined>;
  updateEventStatus(id: string, status: string): Promise<void>;

  // Messages
  getAllMessages(): Promise<Message[]>;
  flagMessage(id: string): Promise<void>;

  // Transactions
  getAllTransactions(): Promise<Transaction[]>;

  // Reports
  getAllReports(): Promise<Report[]>;
  updateReportStatus(id: string, status: string): Promise<void>;

  // Verification
  getAllVerifications(): Promise<Verification[]>;
  updateVerificationStatus(id: string, status: string): Promise<void>;

  // API Logs
  getAllApiLogs(): Promise<ApiLog[]>;
  createApiLog(logData: Partial<ApiLog>): Promise<void>;

  // API Keys
  getAllApiKeys(): Promise<ApiKey[]>;

  // Block Lists
  getAllBlockLists(): Promise<(typeof blockLists.$inferSelect)[]>;

  // Dashboard Stats
  getDashboardStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalRevenue: number;
    pendingReports: number;
    premiumSubscribers: number;
    failedPayments: number;
    totalMessages: number;
    todayMessages: number;
    flaggedMessages: number;
    imageMessages: number;
    totalApiRequests: number;
    activeApiKeys: number;
  }>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private admins: Map<string, Admin> = new Map();
  private events: Map<string, Event> = new Map();
  private messages: Map<string, Message> = new Map();
  private transactions: Map<string, Transaction> = new Map();
  private reports: Map<string, Report> = new Map();
  private verifications: Map<string, Verification> = new Map();
  private apiLogs: Map<string, ApiLog> = new Map();
  private apiKeys: Map<string, ApiKey> = new Map();
  private blockLists: Map<string, typeof blockLists.$inferSelect> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData() {
    const today = new Date().toISOString().split("T")[0];

    // Create default admin
    const adminId = randomUUID();
    this.admins.set(adminId, {
      id: adminId,
      name: "John Admin",
      email: "admin@loveadmin.com",
      password: "admin123", // Simple password for demo
      active: true,
      role: "admin",
      created_at: today,
      updated_at: today,
    });

    // Create sample users with diverse profiles
    const sampleUsers = [
      {
        id: randomUUID(),
        name: "Sarah Johnson",
        username: "sarah_j",
        email: "sarah@example.com",
        phone: "+1-555-123-4567",
        dob: "1995-06-15",
        location: {
          city: "New York",
          country: "US",
          coordinates: { latitude: 40.7128, longitude: -74.006 },
        },
        isActive: true,
        isVerified: true,
        bio: "Looking for genuine connections and someone who shares my love for adventure!",
        images: ["https://picsum.photos/400/400?random=1"],
        interests: ["Photography", "Hiking", "Travel", "Coffee", "Art"],
        occupation: "Marketing Manager",
        education: "Bachelor's Degree",
        height: "5'6\"",
        herefor: "Long-term relationship",
        relationship: "Single",
        children: "Don't have kids",
        drinking: "Socially",
        smoking: "Never",
        language: ["English", "Spanish"],
        religion: "Christian",
        date: null,
        created_at: "2024-01-15",
        updated_at: "2024-01-15",
      },
      {
        id: randomUUID(),
        name: "Mike Chen",
        username: "mike_chen",
        email: "mike@example.com",
        phone: "+1-555-234-5678",
        dob: "1990-03-22",
        location: {
          city: "San Francisco",
          country: "US",
          coordinates: { latitude: 37.7749, longitude: -122.4194 },
        },
        isActive: true,
        isVerified: false,
        bio: "Software engineer who loves outdoor activities and trying new restaurants.",
        images: ["https://picsum.photos/400/400?random=2"],
        interests: ["Hiking", "Coding", "Movies", "Food", "Gaming"],
        occupation: "Software Engineer",
        education: "Master's Degree",
        height: "5'10\"",
        herefor: "Dating",
        relationship: "Single",
        children: "Want kids",
        drinking: "Occasionally",
        smoking: "Never",
        language: ["English", "Mandarin"],
        religion: "Agnostic",
        date: null,
        created_at: "2024-01-14",
        updated_at: "2024-01-14",
      },
      {
        id: randomUUID(),
        name: "Emma Davis",
        username: "emma_d",
        email: "emma@example.com",
        phone: "+1-555-345-6789",
        dob: "1993-09-08",
        location: {
          city: "Los Angeles",
          country: "US",
          coordinates: { latitude: 34.0522, longitude: -118.2437 },
        },
        isActive: true,
        isVerified: true,
        bio: "Yoga instructor and wellness enthusiast. Looking for someone who values health and mindfulness.",
        images: ["https://picsum.photos/400/400?random=3"],
        interests: ["Yoga", "Meditation", "Healthy Cooking", "Beach", "Music"],
        occupation: "Yoga Instructor",
        education: "Bachelor's Degree",
        height: "5'4\"",
        herefor: "Serious relationship",
        relationship: "Single",
        children: "Don't have kids",
        drinking: "Rarely",
        smoking: "Never",
        language: ["English"],
        religion: "Buddhist",
        date: null,
        created_at: "2024-01-13",
        updated_at: "2024-01-13",
      },
      {
        id: randomUUID(),
        name: "David Wilson",
        username: "david_w",
        email: "david@example.com",
        phone: "+1-555-456-7890",
        dob: "1988-12-03",
        location: {
          city: "Chicago",
          country: "US",
          coordinates: { latitude: 41.8781, longitude: -87.6298 },
        },
        isActive: false,
        isVerified: true,
        bio: "Teacher who loves books, board games, and meaningful conversations.",
        images: ["https://picsum.photos/400/400?random=4"],
        interests: ["Reading", "Teaching", "Board Games", "History", "Writing"],
        occupation: "High School Teacher",
        education: "Master's Degree",
        height: "6'0\"",
        herefor: "Long-term relationship",
        relationship: "Single",
        children: "Have kids",
        drinking: "Socially",
        smoking: "Never",
        language: ["English", "French"],
        religion: "Catholic",
        date: null,
        created_at: "2024-01-12",
        updated_at: "2024-01-12",
      },
      {
        id: randomUUID(),
        name: "Jessica Martinez",
        username: "jess_m",
        email: "jessica@example.com",
        phone: "+1-555-567-8901",
        dob: "1996-04-18",
        location: {
          city: "Miami",
          country: "US",
          coordinates: { latitude: 25.7617, longitude: -80.1918 },
        },
        isActive: true,
        isVerified: false,
        bio: "Graphic designer who loves art, music festivals, and weekend adventures.",
        images: ["https://picsum.photos/400/400?random=5"],
        interests: ["Design", "Art", "Music", "Festivals", "Dancing"],
        occupation: "Graphic Designer",
        education: "Bachelor's Degree",
        height: "5'5\"",
        herefor: "Casual dating",
        relationship: "Single",
        children: "Don't want kids",
        drinking: "Regularly",
        smoking: "Socially",
        language: ["English", "Spanish"],
        religion: "Non-religious",
        date: null,
        created_at: "2024-01-11",
        updated_at: "2024-01-11",
      },
    ];

    sampleUsers.forEach((user) => this.users.set(user.id, user as User));

    // Create sample reports
    const reports = [
      {
        id: randomUUID(),
        violatorId: sampleUsers[1].id,
        userId: sampleUsers[0].id,
        reason: "Inappropriate Content",
        description: "User posted inappropriate photos in their profile",
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        violatorId: sampleUsers[4].id,
        userId: sampleUsers[2].id,
        reason: "Harassment",
        description:
          "User sent multiple unwanted messages after being asked to stop",
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        violatorId: sampleUsers[3].id,
        userId: sampleUsers[1].id,
        reason: "Fake Profile",
        description: "Profile appears to be using fake photos and information",
        status: "resolved",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    reports.forEach((report) => this.reports.set(report.id, report as Report));

    // Create sample verifications
    const verifications = [
      {
        id: randomUUID(),
        video: "https://example.com/verification1.mp4",
        userId: sampleUsers[1].id,
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        video: "https://example.com/verification2.mp4",
        userId: sampleUsers[4].id,
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        video: "https://example.com/verification3.mp4",
        userId: sampleUsers[2].id,
        status: "approved",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    verifications.forEach((verification) =>
      this.verifications.set(verification.id, verification as Verification),
    );

    // Create sample transactions
    const transactions = [
      {
        id: "TXN-001",
        amount: "29.99",
        referenceId: "REF-001",
        narration: "Premium Monthly Subscription",
        plan: "Premium Monthly",
        subscribed: true,
        userId: sampleUsers[0].id,
        approved_by: "admin",
        created_at: "2024-01-15",
        updated_at: "2024-01-15",
      },
      {
        id: "TXN-002",
        amount: "99.99",
        referenceId: "REF-002",
        narration: "Premium Annual Subscription",
        plan: "Premium Annual",
        subscribed: true,
        userId: sampleUsers[2].id,
        approved_by: "admin",
        created_at: "2024-01-14",
        updated_at: "2024-01-14",
      },
      {
        id: "TXN-003",
        amount: "19.99",
        referenceId: "REF-003",
        narration: "Premium Plus Monthly",
        plan: "Premium Plus",
        subscribed: false,
        userId: sampleUsers[3].id,
        approved_by: "admin",
        created_at: "2024-01-13",
        updated_at: "2024-01-13",
      },
      {
        id: "TXN-004",
        amount: "29.99",
        referenceId: "REF-004",
        narration: "Premium Monthly Subscription",
        plan: "Premium Monthly",
        subscribed: true,
        userId: sampleUsers[4].id,
        approved_by: "admin",
        created_at: "2024-01-12",
        updated_at: "2024-01-12",
      },
    ];

    transactions.forEach((transaction) =>
      this.transactions.set(transaction.id, transaction as Transaction),
    );

    // Create sample events
    const events = [
      {
        id: randomUUID(),
        title: "Coffee Date",
        description: "Let's grab coffee and get to know each other better",
        start_time: new Date("2024-01-20T15:00:00Z"),
        location: {
          address: "Starbucks, 123 Main St, New York, NY",
          coordinates: { lat: 40.7589, lng: -73.9851 },
        },
        creator_id: sampleUsers[0].id,
        partner_id: sampleUsers[1].id,
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        title: "Museum Visit",
        description: "Explore the art museum together this weekend",
        start_time: new Date("2024-01-21T14:00:00Z"),
        location: {
          address: "Metropolitan Museum, New York, NY",
          coordinates: { lat: 40.7794, lng: -73.9632 },
        },
        creator_id: sampleUsers[2].id,
        partner_id: null,
        status: "planned",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    events.forEach((event) => this.events.set(event.id, event as Event));

    // Create sample messages
    const messages = [
      {
        id: randomUUID(),
        channel: "ch-" + randomUUID().slice(0, 8),
        content:
          "Hey! I really enjoyed our conversation yesterday. Would you like to meet for coffee sometime this week?",
        type: "text",
        sender: sampleUsers[0].id,
        recipient: sampleUsers[1].id,
        read: false,
        deleted: false,
        created_at: today,
        updated_at: today,
      },
      {
        id: randomUUID(),
        channel: "ch-" + randomUUID().slice(0, 8),
        content: "Check out this photo from my weekend trip!",
        type: "image",
        sender: sampleUsers[2].id,
        recipient: sampleUsers[4].id,
        read: true,
        deleted: false,
        created_at: today,
        updated_at: today,
      },
    ];

    messages.forEach((message) =>
      this.messages.set(message.id, message as Message),
    );

    // Create sample API keys
    const apiKeys = [
      {
        apikey: "loveapp_" + randomUUID().replace(/-/g, "").slice(0, 32),
        name: "Mobile App Production",
        email: "dev@loveapp.com",
        active: true,
        created_at: today,
        updated_at: today,
      },
      {
        apikey: "loveapp_" + randomUUID().replace(/-/g, "").slice(0, 32),
        name: "Analytics Dashboard",
        email: "analytics@loveapp.com",
        active: true,
        created_at: today,
        updated_at: today,
      },
      {
        apikey: "loveapp_" + randomUUID().replace(/-/g, "").slice(0, 32),
        name: "Testing Environment",
        email: "test@loveapp.com",
        active: false,
        created_at: today,
        updated_at: today,
      },
    ];

    apiKeys.forEach((apiKey) =>
      this.apiKeys.set(apiKey.apikey, apiKey as ApiKey),
    );

    // Create sample API logs
    const apiLogs = [
      {
        id: randomUUID(),
        apikey: apiKeys[0].apikey,
        url: "/api/users",
        type: "GET",
        ip: "192.168.1.100",
        duration: "143ms",
        location: "New York, US",
        by: "mobile_app",
        created_at: today,
        updated_at: today,
      },
      {
        id: randomUUID(),
        apikey: apiKeys[0].apikey,
        url: "/api/matches",
        type: "POST",
        ip: "10.0.0.45",
        duration: "267ms",
        location: "London, UK",
        by: "mobile_app",
        created_at: today,
        updated_at: today,
      },
      {
        id: randomUUID(),
        apikey: apiKeys[1].apikey,
        url: "/api/analytics",
        type: "GET",
        ip: "172.16.0.12",
        duration: "89ms",
        location: "Tokyo, JP",
        by: "analytics_dashboard",
        created_at: today,
        updated_at: today,
      },
    ];

    apiLogs.forEach((apiLog) => this.apiLogs.set(apiLog.id, apiLog as ApiLog));
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.email === email);
  }

  async createUser(userData: NewUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...userData,
      id,
      created_at: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString().split("T")[0],
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(
    id: string,
    updates: Partial<User>,
  ): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser = {
      ...user,
      ...updates,
      updated_at: new Date().toISOString().split("T")[0],
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getUsersWithFilters(filters: {
    status?: string;
    verification?: string;
    subscription?: string;
  }): Promise<User[]> {
    let users = Array.from(this.users.values());

    if (filters.status && filters.status !== "All Users") {
      users = users.filter((user) => {
        if (filters.status === "Active") return user.isActive;
        if (filters.status === "Inactive") return !user.isActive;
        return true;
      });
    }

    if (filters.verification && filters.verification !== "All") {
      users = users.filter((user) => {
        if (filters.verification === "Verified") return user.isVerified;
        if (filters.verification === "Unverified") return !user.isVerified;
        return true;
      });
    }

    return users;
  }

  async getAdmin(id: string): Promise<Admin | undefined> {
    return this.admins.get(id);
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    return Array.from(this.admins.values()).find(
      (admin) => admin.email === email,
    );
  }

  async createAdmin(adminData: Partial<Admin>): Promise<Admin> {
    const id = randomUUID();
    const today = new Date().toISOString().split("T")[0];
    const newAdmin = {
      ...adminData,
      id,
      created_at: today,
      updated_at: today,
    } as Admin;
    this.admins.set(id, newAdmin);
    return newAdmin;
  }

  async getAllEvents(): Promise<Event[]> {
    return Array.from(this.events.values());
  }

  async getEvent(id: string): Promise<Event | undefined> {
    return this.events.get(id);
  }

  async updateEventStatus(id: string, status: string): Promise<void> {
    const event = this.events.get(id);
    if (event) {
      this.events.set(id, {
        ...event,
        status: status as any,
        updated_at: new Date(),
      });
    }
  }

  async getAllMessages(): Promise<Message[]> {
    return Array.from(this.messages.values());
  }

  async flagMessage(id: string): Promise<void> {
    // Implementation for flagging messages
  }

  async getAllTransactions(): Promise<Transaction[]> {
    return Array.from(this.transactions.values());
  }

  async getAllReports(): Promise<Report[]> {
    return Array.from(this.reports.values());
  }

  async updateReportStatus(id: string, status: string): Promise<void> {
    const report = this.reports.get(id);
    if (report) {
      this.reports.set(id, { ...report, status, updated_at: new Date() });
    }
  }

  async getAllVerifications(): Promise<Verification[]> {
    return Array.from(this.verifications.values());
  }

  async updateVerificationStatus(id: string, status: string): Promise<void> {
    const verification = this.verifications.get(id);
    if (verification) {
      this.verifications.set(id, {
        ...verification,
        status,
        updated_at: new Date(),
      });
    }
  }

  async getAllApiLogs(): Promise<ApiLog[]> {
    return Array.from(this.apiLogs.values());
  }

  async createApiLog(logData: Partial<ApiLog>): Promise<void> {
    const id = randomUUID();
    const today = new Date().toISOString().split("T")[0];
    this.apiLogs.set(id, {
      ...logData,
      id,
      created_at: today,
      updated_at: today,
    } as ApiLog);
  }

  async getAllApiKeys(): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values());
  }

  async getAllBlockLists(): Promise<(typeof blockLists.$inferSelect)[]> {
    return Array.from(this.blockLists.values());
  }

  async getDashboardStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalRevenue: number;
    pendingReports: number;
    premiumSubscribers: number;
    failedPayments: number;
    totalMessages: number;
    todayMessages: number;
    flaggedMessages: number;
    imageMessages: number;
    totalApiRequests: number;
    activeApiKeys: number;
  }> {
    const users = Array.from(this.users.values());
    const reports = Array.from(this.reports.values());
    const transactions = Array.from(this.transactions.values());
    const messages = Array.from(this.messages.values());
    const apiKeys = Array.from(this.apiKeys.values());
    const apiLogs = Array.from(this.apiLogs.values());

    return {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.isActive).length,
      totalRevenue:
        Math.round(
          transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0) * 100,
        ) / 100,
      pendingReports: reports.filter((r) => r.status === "pending").length,
      premiumSubscribers: transactions.filter(
        (t) => t.subscribed && t.plan?.includes("Premium"),
      ).length,
      failedPayments: transactions.filter((t) => !t.subscribed).length,
      totalMessages: messages.length,
      todayMessages: messages.filter(
        (m) => m.created_at === new Date().toISOString().split("T")[0],
      ).length,
      flaggedMessages: reports.filter(
        (r) => r.reason === "Inappropriate Content",
      ).length,
      imageMessages: messages.filter((m) => m.type === "image").length,
      totalApiRequests: apiLogs.length,
      activeApiKeys: apiKeys.filter((k) => k.active).length,
    };
  }
}

export const storage = new MemStorage();
