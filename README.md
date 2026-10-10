# Employee Attendance & Analytics API

A high-performance Employee Attendance & Analytics backend built with **FastAPI** (Python 3.11+) and **MongoDB 6.0+**, implementing complete business rules (R1–R10), cross-collection aggregation pipelines, concurrency safety, and query explainability.

---

## 1. Prerequisites

- **Python**: `3.11` or newer
- **MongoDB**: `6.0` or newer (MongoDB 7.0 or MongoDB Atlas M0 cluster supported)

---

## 2. Environment Setup

### 2.1 Clone and Create Virtual Environment

```bash
# Create local Python 3.11 virtual environment
python3.11 -m venv .venv

# Activate virtual environment
# macOS / Linux:
source .venv/bin/activate
# Windows:
# .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2.2 Configure Environment Variables

Create a `.env` file in the project root (using placeholders):

```env
MONGO_URI="mongodb+srv://<username>:<password>@<cluster-host>/?appName=<app-name>"
MONGO_DB="hrone_attendance_dev"
```

> **Security Note:** Never commit `.env` or expose database credentials. The `.gitignore` file includes `.env`, `.venv/`, and `__pycache__/`.

---

## 3. Running the Application

Start the FastAPI application using Uvicorn:

```bash
uvicorn app.main:app --port 8000 --reload
```

- **API Base URL**: `http://127.0.0.1:8000`
- **Interactive OpenAPI Docs (Swagger UI)**: `http://127.0.0.1:8000/docs`
- **Alternative ReDoc**: `http://127.0.0.1:8000/redoc`

All required indexes are created idempotently on application startup via the FastAPI `lifespan` handler. No manual database configuration steps are required.

---

## 4. Running Integration Tests

The project includes non-destructive test suites verifying all core logic, error handling, analytics pipelines, and explain plans:

```bash
# Run Phase 3 tests (Punch-out, regularization, R3-R5 rules, concurrency safety)
python test_phase3.py

# Run Phase 4 tests (Analytics aggregations: monthly, department summary, leaderboard with ties, department trend)
python test_phase4.py

# Run Phase 5 tests (Explain endpoints, executionStats, IXSCAN verification)
python test_phase5.py
```

All test suites use isolated employee codes (e.g. `EMP99xx`, `EMP88xx`, `EMP77xx`) and perform self-cleanup without modifying existing or seeded records.

---

## 5. API Overview & Key Endpoints

| Category | Method | Path | Description |
| :--- | :--- | :--- | :--- |
| **System** | `GET` | `/health` | Returns `200` if MongoDB answers ping; `503` if unavailable. |
| **Employees** | `POST` | `/employees` | Registers an employee; `409` on duplicate `emp_code`, `422` on invalid input. |
| **Employees** | `GET` | `/employees` | Paginated listing of employees sorted by `emp_code`. Optional `department` filter. |
| **Attendance** | `POST` | `/attendance/punch-in` | Creates day's record (R1, R2); `409` on duplicate punch-in (race-safe). |
| **Attendance** | `GET` | `/attendance` | Indexed list of attendance records sorted by `date DESC, emp_code ASC`. |
| **Attendance** | `POST` | `/attendance/punch-out` | Computes work hours, overtime, and half day (R3–R5); supports overnight shifts. |
| **Attendance** | `PATCH` | `/attendance/{emp_code}/{date}` | Regularizes attendance, recomputes derived fields, appends immutable audit entry. |
| **Analytics** | `GET` | `/analytics/employees/{emp_code}/monthly` | Monthly attendance aggregation for an employee (R7 working days, R8 rounding). |
| **Analytics** | `GET` | `/analytics/departments/summary` | Department summary aggregation; includes employees with zero logs (R9 headcount). |
| **Analytics** | `GET` | `/analytics/leaderboard/late` | Late leaderboard with standard competition ranking (`$rank`) and tie handling. |
| **Analytics** | `GET` | `/analytics/departments/{department}/trend` | Daily attendance trend with calendar gap-filling (`$densify`) and 7-day moving average. |
| **Admin** | `GET` | `/admin/explain/{endpoint}` | Raw MongoDB `explain` with `executionStats` for the 5 key endpoints. |

---

## 6. Business Rules & Architecture Highlights

- **R1 (IST & Overnight Shifts)**: All shift times and attendance dates operate in Indian Standard Time (`UTC+05:30`). For overnight shifts (`shift_end <= shift_start`), punch-ins before `shift_end` belong to the previous calendar day.
- **R2 (Late Minutes)**: 10-minute grace period. If punch-in is strictly > 10 minutes past shift start, `late_minutes` is the whole floor minutes from `shift_start` (not from grace cutoff).
- **R3 (Overtime)**: Counted only if punch-out is at least 30 minutes after shift end.
- **R4 & R8 (Rounding)**: Work hours and rates use strict half-up rounding (`ROUND_HALF_UP`) via Python's `Decimal` module.
- **R5 (Half Day)**: Records with rounded work hours `< 4.50` are marked `half_day = True` and count as `0.5` present days.
- **R7 & R9 (Working Days & Headcount)**: Working days count Monday–Friday. Mid-month joiners count from `joined_on`. Headcount includes all employees joined on or before month end, even if they have 0 attendance records.
- **Concurrency**: Punch-in races are prevented by a compound unique index on `(emp_code, date)`. Punch-out and regularization use atomic `find_one_and_update` operations with optimistic versioning.
- **Indexes & Explainability**: All list and analytics endpoints use index scans (`IXSCAN`) backed by dedicated compound indexes, ensuring zero collection scans (`COLLSCAN`) at scale.

---

## 7. Frontend Dashboard (React + Vite + Tailwind CSS)

The repository includes a modern SaaS HR Attendance & Analytics frontend dashboard in the `frontend/` directory.

### 7.1 Features
- **Overview Dashboard**: High-level KPIs, department attendance distribution chart (Recharts), and quick action controls.
- **Employee Directory**: Paginated list of registered staff, department filters, and employee registration modal (`POST /employees`).
- **Live Attendance & Punch Records**: Filterable attendance logs, punch-in (`POST /attendance/punch-in`), punch-out (`POST /attendance/punch-out`), and audit history modal.
- **Attendance Regularization**: Form to edit records (`PATCH /attendance/{emp_code}/{date}`) with validation and audit history tracking.
- **Employee Monthly Analytics**: Monthly summary viewer (`GET /analytics/employees/{emp_code}/monthly`).
- **Department Analytics & Trends**: Summary comparisons and daily moving average trends (`GET /analytics/departments/{department}/trend`).
- **Late Arrivals Leaderboard**: Standard competition ranking (`GET /analytics/leaderboard/late`) with tie detection.
- **System Diagnostics**: Real-time MongoDB health ping and query explainability explorer (`GET /admin/explain/{endpoint}`).

### 7.2 Running the Frontend
```bash
# Navigate to frontend folder
cd frontend

# Install frontend dependencies (if not already installed)
npm install

# Start Vite dev server
npm run dev
```

Open your browser at:
`http://localhost:5173`
