# 🌌 Aurora Shopping Platform

Aurora is a full-featured, AI-powered e-commerce platform and business intelligence dashboard running on a single Node.js Express server with Firebase Authentication.

---

## ✨ Features

- **🛍️ Storefront**:
  - Browse and filter products across categories.
  - Cart management with persistent storage and checkout flow.
  - Search and filter by category, price, and rating.
  - Real-time customer reviews and ratings.
- **🛡️ Authentication**:
  - Unified Firebase Authentication for both regular customers and administrators.
  - Support for Email/Password sign-up/login, Google Sign-In popup, and Password Reset.
  - **Admin Registration via Secret Code**: Users can register with administrator privileges by providing the secret admin access code (`AURORA-ADMIN-2026`).
  - Backend Firebase ID token verification and automatic user profile sync with SQLite database.
- **⚙️ Admin Dashboard (`/admin`)**:
  - Real-time analytics, revenue, order tracking, and product inventory metrics.
  - AI Decision Engine for automated dynamic pricing and inventory reorder recommendations.
  - Access-controlled: redirects non-admin users to the storefront login with notifications.

---

## 🚀 Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- npm

### 2. Installation

```bash
cd backend
npm install
```

### 3. Running the Server

```bash
node server.js
```

The unified server will start on `http://localhost:3000`:
- **Shop**: [http://localhost:3000/](http://localhost:3000/)
- **Admin**: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 🔑 Default Credentials & Keys

- **Default Admin Account**: `admin@aurora.com` / `admin123`
- **Default Customer Account**: `sarah@example.com` / `user123`
- **Admin Access Code (for new admin registrations)**: `AURORA-ADMIN-2026`

---

## 📂 Project Structure

```
aurora/
├── backend/
│   ├── ai-agent.js       # AI business analytics & decision engine
│   ├── database.js       # SQLite database configuration & initial seed
│   ├── package.json      # Backend dependencies (express, firebase-admin, etc.)
│   └── server.js         # Unified Express server & API endpoints
├── frontend/
│   ├── admin.html        # Admin Dashboard page
│   ├── index.html        # Storefront & Unified Auth Modal
│   ├── css/
│   │   ├── admin.css     # Admin dashboard styles
│   │   └── style.css     # Storefront design system & auth styling
│   └── js/
│       ├── admin.js      # Admin dashboard logic & auth verification
│       └── app.js        # Storefront application logic & Firebase auth flow
├── .gitignore
├── LICENSE
└── README.md
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
