# CAFTERIA SYSTEM

A full-stack application with React/TailwindCSS frontend and Express/PostgreSQL backend.

## Project Structure

```
CAFTERIA-SYSTEM/
├── frontend/          # React + Vite + TailwindCSS
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
└── backend/           # Express + PostgreSQL
    ├── package.json
    └── node_modules/
```

## Tech Stack

### Frontend
- React 19
- Vite 7
- TailwindCSS 4
- Axios
- React Router DOM

### Backend
- Express.js 5
- PostgreSQL (pg)
- Cors
- Dotenv
- Bcryptjs
- Jsonwebtoken
- Nodemon (dev)

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm

## Getting Started

### 1. Database Setup

Make sure PostgreSQL is running and create a database:

```bash
createdb cafteria
# or
psql -c "CREATE DATABASE cafteria;"
```

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials

npm start        # Production
npm run dev      # Development (with nodemon)
```

### 3. Frontend Setup

```bash
cd frontend
npm run dev
```

## Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=5000
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cafteria
JWT_SECRET=your_secret_key
```

## Available Scripts

### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

### Backend
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon

