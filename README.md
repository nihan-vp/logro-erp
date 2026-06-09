# 🏢 LOGRO ERP: Construction Enterprise Resource Planning System

LOGRO ERP is a modern, high-performance, and visually premium Enterprise Resource Planning system specifically engineered for construction project management, budget control, and site monitoring. 

Built using a React 19 SPA frontend with a responsive Tailwind CSS v4 design system, the system is backed by an Express/TypeScript backend that supports dual-persistence layers: a local `db.json` filesystem store for instant server startups, and automatic synchronization to a MongoDB database if a connection string is provided in the configuration.

---

## 📂 Complete Directory Structure

The repository is organized as a monorepo-style setup containing both the Express backend server and the Vite + React frontend application. Below is the complete directory structure:

```text
logro/
├── assets/
│   └── .aistudio/
│       └── .gitignore            # AI Studio workspace-specific ignore rules
├── dist/                         # Production build output (client bundles and server bundle)
├── server/
│   └── db.ts                     # MongoDB client connection & local JSON file database fallback
├── src/                          # Frontend React Application
│   ├── api/
│   │   └── client.ts             # REST client with JWT header injects and offline/online storage syncing
│   ├── context/
│   │   └── ConnectivityContext.tsx # React Context provider monitoring internet & API connection status
│   ├── pages/
│   │   ├── Attendance.tsx        # Crew management, daily worker logs, bulk markings, wage & overtime calculators
│   │   ├── Dashboard.tsx         # Overview dashboard containing overall profit/loss stats and financial KPIs
│   │   ├── Expenses.tsx          # Expense logs with categorization, payment details, and base64 bill attachments
│   │   ├── Login.tsx             # Authentication interface for Administrators and Site Managers
│   │   ├── OfflineScreen.tsx     # Fullscreen overlay alerting user when the application drops offline
│   │   ├── Payments.tsx          # Tracking payout stages (Worker/Company/Supplier) and billing status
│   │   ├── Projects.tsx          # Project details panel, list filters, and subtabs layout
│   │   ├── Reports.tsx           # Advanced audit widgets with graphical profit percentage gauges
│   │   └── Tasks.tsx             # Task scheduler with percentage progress sliders and status filters
│   ├── App.tsx                   # Main SPA container, responsive layout navigation & profile manager
│   ├── index.css                 # Global stylesheets and Tailwind CSS custom theme utilities
│   ├── main.tsx                  # Vite React hydration entrypoint
│   └── types.ts                  # Shared TypeScript interfaces & types (Project, Task, Expense, etc.)
├── .dockerignore                 # Excluded directories/files in Docker builds
├── .env                          # Configuration containing PORT and MongoDB connection strings
├── .env.example                  # Template configuration structure for local environment setup
├── .gitignore                    # Version control ignore lists
├── db.json                       # Local file-based mock databases seeded on launch
├── docker-compose.yml            # Multi-container service orchestrator configurations
├── Dockerfile                    # Containerization instructions for Node.js image
├── index.html                    # Single Page Application HTML shell template
├── metadata.json                 # Project properties and environment metadata
├── package.json                  # Scripts, dependency libraries, and metadata definition
├── package-lock.json             # Precise dependency resolution tree
├── README.md                     # Project documentation (this file)
├── server.ts                     # Express.js core API, JWT crypto signing, endpoints, and route controllers
├── tsconfig.json                 # TypeScript compiler specifications
└── vite.config.ts                # Vite bundler configurations & plugin bindings
```

---

## 🔧 Component Explanations

### 1. Server Core (`server.ts` & `server/`)
* **`server.ts`**: Implements the REST API endpoints using Express. It contains cryptography-based stateless JWT token authentication (without external libraries) and handles database actions, including cascading deletes across projects, tasks, expenses, attendance, and payments.
* **`server/db.ts`**: Provides transparent data persistence. It checks for a `MONGODB_URI` environment variable. If available, it automatically connects to a MongoDB database; otherwise, it falls back to reading/writing from a local, human-readable `db.json` database.

### 2. Frontend Source (`src/`)
* **`src/types.ts`**: Formulates strict TypeScript models representing database entities like `User`, `Project`, `Task`, `Expense`, `Attendance`, and `Payment`.
* **`src/api/client.ts`**: Manages HTTP transactions with the server. Attaches authentication headers and parses return bodies.
* **`src/context/ConnectivityContext.tsx`**: Keeps track of whether the application is currently connected to the server. Displays warnings when connection status changes.
* **`src/pages/`**: Holds specific business domain views:
  * **`Dashboard.tsx`**: Renders dynamic metric cards (Active Tasks, Total Budget, Direct Expenses, Profit/Loss, and Payout Stats) for high-level executives.
  * **`Projects.tsx`**: Central station. Allows admins to manage projects. Includes sub-tabs to inspect Tasks, Expenses, and Payments associated with each project.
  * **`Tasks.tsx`**: Coordinates sub-tasks, schedules, assigned staff, and progress gauges.
  * **`Expenses.tsx`**: Logs invoices, materials, tools, transport, and company bills. Supports base64 bill image uploads.
  * **`Attendance.tsx`**: Features bulk-attendance mark grids, wages calculations, and overtime tracking.
  * **`Payments.tsx`**: Oversees financial payouts to subcontractors, suppliers, and crew.
  * **`Reports.tsx`**: Houses comprehensive financial reviews and analytics.

---

## 🛠️ Technology Stack

* **Frontend**:
  * [React 19](https://react.dev/) — User interface rendering.
  * [Vite](https://vite.dev/) — Next-generation frontend build tooling.
  * [Tailwind CSS v4](https://tailwindcss.com/) — Modern, utility-first styling with high performance.
  * [Motion](https://motion.dev/) — Smooth micro-animations.
  * [Lucide React](https://lucide.dev/) — Premium design icons.
* **Backend**:
  * [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/) — Fast API web framework.
  * [MongoDB Node Driver](https://mongodb.github.io/node-mongodb-native/) — Native client for MongoDB database operations.
  * [tsx](https://github.com/privatenumber/tsx) — Execute TypeScript directly in development.
  * [esbuild](https://esbuild.github.io/) — Ultra-fast JS/TS compiler and bundler.

---

## 🚀 Getting Started

### 📋 Prerequisites
* [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
* Optional: A running instance of MongoDB (otherwise, local `db.json` fallback is active)

### ⚙️ Setup Instructions

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/construct_erp
   ```
   *(Note: If `MONGODB_URI` is omitted, the server will default to saving details to `./db.json`)*.

3. **Start the development server:**
   ```bash
   npm run dev
   ```
   This will run the backend Express API server and bundle the frontend SPA simultaneously. The application will be accessible at `http://localhost:3000`.

4. **Build and run for production:**
   To package the React frontend and compile the TypeScript Express server into a optimized production bundle:
   ```bash
   npm run build
   npm run start
   ```

### 🐳 Running with Docker

You can build and run the application inside a Docker container:

1. **Build the Docker image manually:**
   ```bash
   docker build -t logro-app .
   ```

2. **Run the container manually:**
   ```bash
   docker run -d -p 9098:5000 --env-file .env --name logro-app logro-app
   ```

3. **Or spin up using Docker Compose:**
   ```bash
   docker compose up -d
   ```
   The container will load configurations from `.env` and map the application to port `9098` on your host machine.

---

## 👤 Initial Access Credentials

On first run, the database is pre-seeded with a default Administrator user:
* **Email**: `admin@construction.com`
* **Password**: `password123`
