# Dating Platform Admin Dashboard

## Overview

This is a full-stack web application for managing a dating platform. The system provides an administrative dashboard to monitor and manage users, reports, transactions, verification requests, events, messages, and API access. Built with modern web technologies, it features a React-based frontend with shadcn/ui components and an Express.js backend with PostgreSQL database integration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and developer experience
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management and caching
- **UI Framework**: shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **Build Tool**: Vite for fast development and optimized production builds
- **Component Structure**: Organized into feature-based modules (dashboard, users, reports, etc.)

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript for type safety across the full stack
- **API Design**: RESTful API endpoints following conventional patterns
- **Authentication**: Session-based authentication with admin roles
- **Error Handling**: Centralized error handling middleware
- **Logging**: Custom request/response logging for API endpoints

### Database Design
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Connection**: Neon Database serverless PostgreSQL for cloud hosting
- **Key Entities**: Users, admins, reports, transactions, events, messages, verification requests
- **Data Types**: JSONB for flexible data storage (images, interests, location)

### Styling and Design System
- **CSS Framework**: Tailwind CSS with custom design tokens
- **Component Library**: shadcn/ui for consistent, accessible components
- **Theme System**: CSS custom properties for light/dark mode support
- **Responsive Design**: Mobile-first approach with breakpoint-based layouts
- **Icons**: Lucide React for consistent iconography

### Development Workflow
- **Monorepo Structure**: Shared schema between client and server
- **Hot Reload**: Vite development server with HMR
- **Type Checking**: Shared TypeScript configuration across frontend and backend
- **Build Process**: Separate build steps for client (Vite) and server (esbuild)

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting for production data storage
- **Drizzle ORM**: Type-safe database toolkit for schema management and queries

### UI and Styling
- **Radix UI**: Headless, accessible component primitives for complex UI elements
- **Tailwind CSS**: Utility-first CSS framework for rapid styling
- **Lucide React**: Icon library for consistent visual elements

### Development Tools
- **TanStack Query**: Server state management with caching and synchronization
- **React Hook Form**: Form handling with validation support
- **Wouter**: Lightweight routing solution for single-page application navigation
- **date-fns**: Date manipulation and formatting utilities

### Build and Development
- **Vite**: Build tool and development server for frontend assets
- **esbuild**: Fast JavaScript bundler for server-side code
- **TypeScript**: Static type checking across the entire application

### Runtime Dependencies
- **Express.js**: Web application framework for the backend API
- **React**: Frontend library for building user interfaces
- **Node.js**: JavaScript runtime for server-side execution

The architecture emphasizes type safety, developer experience, and maintainability while providing a scalable foundation for a dating platform administration system.