import {
  pgTable,
  varchar,
  uuid,
  date,
  boolean,
  text,
  pgEnum,
  decimal,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const genderEnum = pgEnum("genders", ["male", "female"]);
export const adminEnum = pgEnum("roles", ["admin", "operation", "finance"]);
export const eventEnum = pgEnum("event_status", [
  "pending",
  "planned",
  "declined",
  "canceled",
]);
export const messageEnum = pgEnum("types", [
  "text",
  "image",
  "file",
  "audio",
  "video",
  "event",
]);

export const user = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  username: varchar("username", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 255 }),
  dob: date("dob").notNull(),
  location: jsonb("location").$type<any>().default({}),
  isActive: boolean("is_active").default(true),
  isVerified: boolean("is_verified").default(false),
  bio: text("bio"),
  images: jsonb("images").$type<string[]>().default([]),
  interests: jsonb("interests").$type<string[]>().default([]),
  occupation: varchar("occupation"),
  education: varchar("education"),
  height: varchar("height"),
  herefor: varchar("herefor"),
  date: varchar("date"),
  relationship: varchar("relationship"),
  children: varchar("children"),
  drinking: varchar("drinking"),
  smoking: varchar("smoking"),
  language: jsonb("language").$type<string[]>().default([]),
  religion: varchar("religion"),
  created_at: date("created_at").defaultNow(),
  updated_at: date("updated_at").defaultNow(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title"),
  description: text("description"),
  start_time: timestamp("start_time", { withTimezone: true }).notNull(),
  location: jsonb("location").$type<any>().default({}),
  creator_id: uuid("creator_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  partner_id: uuid("partner_id").references(() => user.id, {
    onDelete: "set null",
  }),
  status: eventEnum().notNull(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const apiKey = pgTable("apikeys", {
  apikey: varchar({ length: 255 }).primaryKey(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  active: boolean().default(true),
  created_at: date("created_at").defaultNow(),
  updated_at: date("updated_at").defaultNow(),
});

export const apiLog = pgTable("apilogs", {
  id: uuid().primaryKey().defaultRandom(),
  apikey: text(),
  url: text(),
  type: varchar({ length: 255 }).notNull(),
  ip: varchar({ length: 255 }).notNull(),
  duration: varchar({ length: 255 }).notNull(),
  location: text().notNull(),
  by: varchar({ length: 255 }),
  created_at: date("created_at").defaultNow(),
  updated_at: date("updated_at").defaultNow(),
});

export const admin = pgTable("admins", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  password: text().notNull(),
  active: boolean().default(true),
  role: adminEnum(),
  created_at: date("created_at").defaultNow(),
  updated_at: date("updated_at").defaultNow(),
});

export const message = pgTable("messages", {
  id: uuid().primaryKey().defaultRandom(),
  channel: varchar({ length: 255 }).unique(),
  content: text().notNull(),
  type: messageEnum(),
  sender: uuid()
    .notNull()
    .references(() => user.id),
  recipient: uuid()
    .notNull()
    .references(() => user.id),
  read: boolean().default(false),
  deleted: boolean().default(false),
  created_at: date("created_at").defaultNow(),
  updated_at: date("updated_at").defaultNow(),
});

export const transaction = pgTable("transactions", {
  id: varchar({ length: 255 }).primaryKey(),
  amount: decimal().notNull(),
  referenceId: varchar({ length: 255 }).notNull(),
  narration: text().notNull(),
  plan: varchar({ length: 255 }),
  subscribed: boolean().default(false),
  userId: uuid()
    .notNull()
    .references(() => user.id),
  approved_by: varchar().notNull(),
  created_at: date("created_at").defaultNow(),
  updated_at: date("updated_at").defaultNow(),
});

export const report = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  violatorId: uuid("violator_id").references(() => user.id),
  userId: uuid("user_id").references(() => user.id),
  reason: text("reason").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  video: text("video"),
  userId: uuid("user_id").references(() => user.id),
  status: text("status").notNull().default("pending"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const blockLists = pgTable("block_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  blockerId: uuid("blocker_id")
    .references(() => user.id, { onDelete: "cascade" })
    .notNull(),
  blockedId: uuid("blocked_id")
    .references(() => user.id, { onDelete: "cascade" })
    .notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(user).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertAdminSchema = createInsertSchema(admin).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertTransactionSchema = createInsertSchema(transaction).omit({
  created_at: true,
  updated_at: true,
});

export const insertReportSchema = createInsertSchema(report).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const insertVerificationSchema = createInsertSchema(verification).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

// Types
export type User = typeof user.$inferSelect;
export type NewUser = z.infer<typeof insertUserSchema>;
export type Admin = typeof admin.$inferSelect;
export type NewAdmin = z.infer<typeof insertAdminSchema>;
export type Transaction = typeof transaction.$inferSelect;
export type NewTransaction = z.infer<typeof insertTransactionSchema>;
export type Report = typeof report.$inferSelect;
export type NewReport = z.infer<typeof insertReportSchema>;
export type Verification = typeof verification.$inferSelect;
export type NewVerification = z.infer<typeof insertVerificationSchema>;
export type Event = typeof events.$inferSelect;
export type Message = typeof message.$inferSelect;
export type ApiKey = typeof apiKey.$inferSelect;
export type ApiLog = typeof apiLog.$inferSelect;

// Legacy validation schemas for backward compatibility
export const createDobSchema = (minAge: number, maxAge?: number) => {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .refine((val) => !isNaN(new Date(val).getTime()), "Invalid date")
    .refine(
      (val) => {
        const dob = new Date(val);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();

        const monthDiff = today.getMonth() - dob.getMonth();
        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < dob.getDate())
        ) {
          age--;
        }

        return age >= minAge && (maxAge === undefined || age <= maxAge);
      },
      `Age must be between ${minAge}${maxAge ? ` and ${maxAge}` : "+"} years`,
    );
};

export const UserCreateSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  dob: createDobSchema(18, 70),
  location: z
    .object({
      coordinates: z.object({ latitude: z.number(), longitude: z.number() }),
      city: z.string(),
      country: z.string(),
    })
    .optional(),
  isActive: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  bio: z.string().optional(),
  images: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  occupation: z.string().max(100).optional(),
  education: z.string().max(100).optional(),
  height: z.string().optional(),
  herefor: z.string().optional(),
  date: z.string().optional(),
  relationship: z.string().optional(),
  children: z.string().optional(),
  drinking: z.string().optional(),
  smoking: z.string().optional(),
  language: z.array(z.string()).optional(),
  religion: z.string().optional(),
});

export const UserUpdateSchema = UserCreateSchema.partial();

export const ReportCreateSchema = z.object({
  violatorId: z.string().min(10).max(100),
  userId: z.string().min(10).max(100),
  reason: z.string().min(5).max(100),
  description: z.string().min(10).max(1000).optional(),
});

export const ReportUpdateSchema = z.object({
  status: z.enum(["pending", "reviewed", "resolved", "dismissed"]),
  reviewedNotes: z.string().min(5).max(500).optional(),
});

export type ReportCreateInput = z.infer<typeof ReportCreateSchema>;
export type ReportUpdateInput = z.infer<typeof ReportUpdateSchema>;

export const BlockListSchema = z.object({
  id: z.string().uuid(),
  blockerId: z.string().uuid(),
  blockedId: z.string().uuid(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const CreateBlockListSchema = BlockListSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const VerificationSchema = z.object({
  video: z.string(),
  user_id: z.string().uuid(),
  status: z.enum(["pending", "reviewed", "resolved", "dismissed"]),
});
