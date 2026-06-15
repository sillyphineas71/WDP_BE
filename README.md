# Smart Edu — Learning Management System (LMS)

A full-stack Learning Management System for schools: manage classes, assignments,
quizzes (with **AI-generated questions**), grading and **AI-assisted feedback**,
with role-based access for **Admins, Teachers and Students**.

🌐 **Live demo:** https://smart-edu.xyz

---

## 🔑 Test Accounts

Use these accounts to explore the live demo at **https://smart-edu.xyz**:

| Role        | Email                           | Password    |
| ----------- | ------------------------------- | ----------- |
| **Admin**   | `admin@gmail.com`               | `123456`    |
| **Teacher** | `phuc.tm@thptnguyendu.edu.vn`   | `1234567`   |
| **Student** | `nguyenductaibmkc@gmail.com`    | `1234567`   |

> ⚠️ These are **shared demo accounts** on a test environment. Please don't change
> their passwords so others can keep trying the demo.

---

## Overview

Smart Edu is a web-based LMS that connects three types of users:

- **Admins** manage the platform and user accounts.
- **Teachers** create classes, build quizzes, and review student work.
- **Students** join classes, take quizzes, and receive feedback.

The project integrates AI to help teachers generate quiz questions automatically and
to provide students with AI-assisted feedback, on top of a standard LMS workflow.

## Features

- **Authentication** — email/password login + **Google OAuth**, JWT-based sessions,
  password change / reset / forgot-password flows.
- **Role-Based Access Control (RBAC)** — Admin / Teacher / Student permissions.
- **User administration** — admins can create, search, edit, lock/unlock and
  reset user accounts.
- **Classes & courses** — teachers manage classes and enrolled students.
- **Quizzes** — online quiz creation, including **AI-generated questions**.
- **Grading & feedback** — results tracking plus **AI-assisted feedback** for students.
- **Real-time** — live notifications and class chat via Socket.IO.
- **Background jobs** — scheduled tasks and reminders via Redis queue + cron.

## Tech Stack

| Layer            | Technology                                          |
| ---------------- | --------------------------------------------------- |
| Runtime          | Node.js 20 (ESM)                                    |
| Web framework    | Express                                             |
| Database / ORM   | PostgreSQL (AWS RDS) · Sequelize                    |
| Cache & queues   | Redis · BullMQ                                       |
| Real-time        | Socket.IO                                           |
| Auth             | JWT · Google OAuth                                  |
| AI               | LLM API (quiz generation & feedback)               |
| Scheduling       | node-cron                                            |
| Frontend         | React (CRA) · Tailwind CSS *(separate repository)*  |

## Architecture & Deployment

```
                ┌──────────────────────────────┐
   Browser ───▶ │   Cloudflare (Frontend, SSL)  │
                └──────────────┬───────────────┘
                               │  HTTPS
                ┌──────────────▼───────────────┐
                │  AWS EC2 (Ubuntu)             │
                │  Nginx reverse proxy → PM2    │
                │  Node.js / Express API        │
                │  Redis + BullMQ + node-cron   │
                └──────┬────────────────┬───────┘
                       │                │
              ┌────────▼──────┐  ┌──────▼───────┐
              │ PostgreSQL     │  │  LLM / AI API │
              │ (AWS RDS)      │  │               │
              └────────────────┘  └──────────────┘
```

- **Back-end** runs on an **AWS EC2** instance behind an **Nginx** reverse proxy and
  is kept alive with **PM2**.
- **PostgreSQL** is hosted on **AWS RDS**; **Redis** runs on the instance for caching
  and background queues.
- **HTTPS** is provisioned with **Let's Encrypt (Certbot)**.
- The **front-end** is built and served on **Cloudflare**, calling the API over HTTPS.

## My Contribution

This is a **team project**. My responsibilities were:

- **Authentication & user-administration module (RBAC):** login/logout,
  password change/reset/forgot, profile management, and full admin user management
  (create, search, edit, lock/unlock, reset accounts).
- **AI features:** online quiz creation with AI-generated questions and
  AI-assisted feedback for students.
- **Production deployment & DevOps:** AWS EC2 setup, Nginx, PM2, PostgreSQL/RDS,
  Redis, HTTPS, and front-end deployment on Cloudflare.

## Getting Started (Local Development)

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/sillyphineas71/WDP_BE.git
cd WDP_BE

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# then edit .env with your own values

# 4. Run in development
npm run dev
```

### Environment variables (example)

```env
PORT=9999
DATABASE_URL=postgres://user:password@host:5432/smartedu
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_google_client_id
AI_API_KEY=your_llm_api_key
```

> Variable names may differ slightly from the actual codebase — check `.env.example`
> in the repository for the exact set.

## Repository

- **Back-end:** https://github.com/sillyphineas71/WDP_BE
- **Live demo:** https://smart-edu.xyz

---

*Built as a university team project. Back-end, AI features and deployment by Trần Đức Hải.*
