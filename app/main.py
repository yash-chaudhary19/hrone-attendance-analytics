"""
Employee Attendance & Analytics API

Single-file FastAPI backend adhering strictly to openapi.yaml,
DATA_MODEL.md, and PROBLEM_STATEMENT.docx requirements.
"""

import calendar
import json
import os
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Any, Dict, List, Optional

from bson import json_util
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Path, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
from pymongo import MongoClient, ASCENDING, DESCENDING, ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

# --------------------------------------------------------------------------- #
# 1. Environment & Database Configuration
# --------------------------------------------------------------------------- #
# Real environment variables take priority over .env
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "attendance_db")

client = MongoClient(MONGO_URI, tz_aware=True, serverSelectionTimeoutMS=5000)
db = client[MONGO_DB]

IST = timezone(timedelta(hours=5, minutes=30))
UTC = timezone.utc


# --------------------------------------------------------------------------- #
# 2. Lifecycle & Startup Indexes
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    Creates all required indexes idempotently at startup.
    Ensures safe resource cleanup on shutdown.
    """
    # 1. employees indexes
    db.employees.create_index([("emp_code", ASCENDING)], unique=True)
    db.employees.create_index([("department", ASCENDING), ("joined_on", ASCENDING), ("emp_code", ASCENDING)])
    db.employees.create_index([("joined_on", ASCENDING), ("department", ASCENDING), ("emp_code", ASCENDING)])

    # 2. attendance_logs indexes
    # Compound unique index prevents punch-in race conditions (E11000 -> 409)
    db.attendance_logs.create_index([("emp_code", ASCENDING), ("date", ASCENDING)], unique=True)
    # Compound index for list_attendance sort (date DESC, emp_code ASC) and range filter
    db.attendance_logs.create_index([("date", DESCENDING), ("emp_code", ASCENDING)])
    # Index for fast punch-out lookup (most recent punch_in for an employee)
    db.attendance_logs.create_index([("emp_code", ASCENDING), ("punch_in", DESCENDING)])
    # Index for date range analytics
    db.attendance_logs.create_index([("date", ASCENDING), ("status", ASCENDING)])
    db.attendance_logs.create_index([("date", ASCENDING), ("late_minutes", ASCENDING)])

    yield

    # Shutdown
    client.close()


app = FastAPI(
    title="Employee Attendance & Analytics API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# 3. Reusable Helpers & Domain Calculators
# --------------------------------------------------------------------------- #
def truncate_to_seconds(dt: datetime) -> datetime:
    """R1: Instants are truncated to whole seconds (microsecond/ms part dropped)."""
    return dt.replace(microsecond=0)


def epoch_ms_to_datetime(epoch_ms: int) -> datetime:
    """
    Converts epoch milliseconds to a UTC datetime truncated to whole seconds.
    R1: Instants are truncated to whole seconds before any calculation.
    """
    seconds = epoch_ms // 1000
    return datetime.fromtimestamp(seconds, tz=timezone.utc)


def datetime_to_epoch_ms(dt: Optional[datetime]) -> Optional[int]:
    """Converts a BSON or Python datetime to integer epoch milliseconds."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def current_epoch_ms() -> int:
    """Returns the current server UTC time as whole-second epoch milliseconds."""
    now = datetime.now(timezone.utc)
    return int(now.timestamp()) * 1000


def round_half_up_2(val: Optional[float | Decimal]) -> Optional[float]:
    """R4, R8: Rounds a number to 2 decimal places using standard half-up rounding."""
    if val is None:
        return None
    d = Decimal(str(val))
    return float(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def round_half_up_4(val: Optional[float | Decimal]) -> Optional[float]:
    """R8: Rounds a rate to 4 decimal places using standard half-up rounding."""
    if val is None:
        return None
    d = Decimal(str(val))
    return float(d.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))


def compute_attendance_date(punch_in_dt: datetime, shift_start: str, shift_end: str) -> str:
    """
    R1: Computes the record's attendance date (YYYY-MM-DD in IST).
    Overnight shifts (shift_end <= shift_start):
    A punch-in whose IST time of day is strictly earlier than shift_end belongs
    to the shift that started the previous calendar day.
    """
    punch_ist = punch_in_dt.astimezone(IST)
    cal_date = punch_ist.date()
    punch_time_str = punch_ist.strftime("%H:%M")

    is_overnight = shift_end <= shift_start
    if is_overnight and punch_time_str < shift_end:
        attendance_date = cal_date - timedelta(days=1)
    else:
        attendance_date = cal_date

    return attendance_date.isoformat()


def compute_late_minutes(punch_in_dt: datetime, shift_start: str, attendance_date_str: str) -> int:
    """
    R2: Grace period 10 minutes.
    Late only if the punch-in is strictly more than 10:00 after shift_start;
    then late_minutes = whole minutes (floor) since shift_start, not since grace period ended.
    """
    punch_ist = punch_in_dt.astimezone(IST)
    sh, sm = map(int, shift_start.split(":"))
    y, m, d = map(int, attendance_date_str.split("-"))
    start_ist = datetime(y, m, d, sh, sm, 0, tzinfo=IST)

    diff_seconds = (punch_ist - start_ist).total_seconds()
    if diff_seconds > 600:  # strictly more than 10 minutes
        return int(diff_seconds // 60)
    return 0


def compute_overtime_minutes(punch_out_dt: datetime, shift_start: str, shift_end: str, attendance_date_str: str) -> int:
    """
    R3: Whole minutes (floor) from shift_end to punch_out, counted only if >= 30; otherwise 0.
    For overnight shifts, shift_end is on the calendar day after attendance_date.
    """
    punch_ist = punch_out_dt.astimezone(IST)
    eh, em = map(int, shift_end.split(":"))
    y, m, d = map(int, attendance_date_str.split("-"))
    end_date = date(y, m, d)

    if shift_end <= shift_start:  # overnight shift ends on next calendar day
        end_date += timedelta(days=1)

    end_ist = datetime(end_date.year, end_date.month, end_date.day, eh, em, 0, tzinfo=IST)
    diff_seconds = (punch_ist - end_ist).total_seconds()

    if diff_seconds >= 30 * 60:  # threshold of 30 minutes
        return int(diff_seconds // 60)
    return 0


def compute_work_hours(punch_in_dt: datetime, punch_out_dt: datetime) -> float:
    """
    R4: (punch_out - punch_in) in seconds / 3600, rounded to 2 decimals half-up.
    """
    seconds = (punch_out_dt - punch_in_dt).total_seconds()
    hours = Decimal(str(seconds)) / Decimal("3600")
    return float(hours.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def compute_half_day(work_hours: Optional[float]) -> bool:
    """
    R5: After punch-out, half_day is true when the rounded work_hours < 4.50.
    """
    if work_hours is None:
        return False
    return work_hours < 4.50


def count_working_days(start_date: date, end_date: date) -> int:
    """
    R7: Count Monday - Friday days in the given date range inclusive.
    """
    if start_date > end_date:
        return 0
    cur = start_date
    working_days = 0
    while cur <= end_date:
        if cur.weekday() < 5:  # Monday=0, Friday=4
            working_days += 1
        cur += timedelta(days=1)
    return working_days


def format_employee_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Formats an employee document from MongoDB to match the Employee schema."""
    created_at = doc.get("created_at")
    return {
        "emp_code": doc["emp_code"],
        "name": doc["name"],
        "email": doc["email"],
        "department": doc["department"],
        "shift_start": doc["shift_start"],
        "shift_end": doc["shift_end"],
        "joined_on": doc["joined_on"],
        "created_at": datetime_to_epoch_ms(created_at) if isinstance(created_at, datetime) else created_at,
    }


def format_attendance_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Formats an attendance document from MongoDB to match the AttendanceRecord schema."""
    punch_in = doc.get("punch_in")
    punch_out = doc.get("punch_out")

    history_formatted = []
    for h in doc.get("history", []):
        h_at = h.get("at")
        h_entry = {
            "at": datetime_to_epoch_ms(h_at) if isinstance(h_at, datetime) else h_at,
            "by": h.get("by"),
            "reason": h.get("reason"),
            "changes": {},
        }
        for k, change in h.get("changes", {}).items():
            from_val = change.get("from")
            to_val = change.get("to")
            if k in ("punch_in", "punch_out"):
                if isinstance(from_val, datetime):
                    from_val = datetime_to_epoch_ms(from_val)
                if isinstance(to_val, datetime):
                    to_val = datetime_to_epoch_ms(to_val)
            h_entry["changes"][k] = {"from": from_val, "to": to_val}
        history_formatted.append(h_entry)

    return {
        "emp_code": doc["emp_code"],
        "date": doc["date"],
        "status": doc["status"],
        "punch_in": datetime_to_epoch_ms(punch_in) if isinstance(punch_in, datetime) else punch_in,
        "punch_out": datetime_to_epoch_ms(punch_out) if isinstance(punch_out, datetime) else punch_out,
        "work_hours": doc.get("work_hours"),
        "late_minutes": doc.get("late_minutes", 0),
        "overtime_minutes": doc.get("overtime_minutes", 0),
        "half_day": doc.get("half_day", False),
        "history": history_formatted,
    }


# --------------------------------------------------------------------------- #
# 4. Strict Pydantic Schemas (Matching openapi.yaml)
# --------------------------------------------------------------------------- #
class Status(str, Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    LEAVE = "LEAVE"
    WFH = "WFH"
    ON_DUTY = "ON_DUTY"


class PresenceStatus(str, Enum):
    PRESENT = "PRESENT"
    WFH = "WFH"
    ON_DUTY = "ON_DUTY"


class EmployeeCreate(BaseModel):
    emp_code: str = Field(pattern=r"^EMP\d{4,6}$")
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    department: str = Field(min_length=1, max_length=50)
    shift_start: str = Field(default="09:30", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    shift_end: str = Field(default="18:30", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    joined_on: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")

    @model_validator(mode="after")
    def validate_shift_times(self) -> "EmployeeCreate":
        if self.shift_start == self.shift_end:
            raise ValueError("shift_start must differ from shift_end")
        return self


class Employee(BaseModel):
    emp_code: str
    name: str
    email: str
    department: str
    shift_start: str
    shift_end: str
    joined_on: str
    created_at: int = Field(ge=100000000000, le=4102444800000)


class EmployeePage(BaseModel):
    items: List[Employee]
    total: int
    page: int
    page_size: int


class PunchInRequest(BaseModel):
    emp_code: str
    punched_at: Optional[int] = Field(default=None, ge=100000000000, le=4102444800000)
    status: PresenceStatus = PresenceStatus.PRESENT


class PunchOutRequest(BaseModel):
    emp_code: str
    punched_at: Optional[int] = Field(default=None, ge=100000000000, le=4102444800000)


class RegularizeRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=200)
    regularized_by: str = Field(min_length=1, max_length=50)
    status: Optional[Status] = None
    punch_in: Optional[int] = Field(default=None, ge=100000000000, le=4102444800000)
    punch_out: Optional[int] = Field(default=None, ge=100000000000, le=4102444800000)


class HistoryEntry(BaseModel):
    at: int = Field(ge=100000000000, le=4102444800000)
    by: str
    reason: str
    changes: Dict[str, Dict[str, Any]]


class AttendanceRecord(BaseModel):
    emp_code: str
    date: str
    status: Status
    punch_in: Optional[int] = Field(default=None, ge=100000000000, le=4102444800000)
    punch_out: Optional[int] = Field(default=None, ge=100000000000, le=4102444800000)
    work_hours: Optional[float] = None
    late_minutes: int = 0
    overtime_minutes: int = 0
    half_day: bool = False
    history: List[HistoryEntry] = []


class AttendancePage(BaseModel):
    items: List[AttendanceRecord]
    total: int
    page: int
    page_size: int


class EmployeeMonthly(BaseModel):
    emp_code: str
    month: str
    working_days: int
    present_days: float
    leave_days: int
    late_count: int
    total_late_minutes: int
    total_overtime_minutes: int
    attendance_pct: Optional[float] = None


class DepartmentSummaryItem(BaseModel):
    department: str
    headcount: int
    present_days: float
    avg_work_hours: Optional[float] = None
    late_count: int
    total_late_minutes: int
    leave_count: int
    on_duty_count: int


class DepartmentSummary(BaseModel):
    month: str
    items: List[DepartmentSummaryItem]


class LeaderboardItem(BaseModel):
    rank: int = Field(ge=1)
    emp_code: str
    name: str
    department: str
    total_late_minutes: int
    late_count: int


class Leaderboard(BaseModel):
    month: str
    items: List[LeaderboardItem]


class TrendItem(BaseModel):
    date: str
    is_working_day: bool
    headcount: int
    present_count: float
    late_count: int
    attendance_rate: Optional[float] = None
    moving_avg_7d: Optional[float] = None


class Trend(BaseModel):
    department: str
    items: List[TrendItem]


class ExplainTarget(str, Enum):
    attendance_list = "attendance_list"
    employee_monthly = "employee_monthly"
    department_summary = "department_summary"
    late_leaderboard = "late_leaderboard"
    department_trend = "department_trend"


class ExplainResponse(BaseModel):
    endpoint: str
    collection: str
    explain: Dict[str, Any]


# --------------------------------------------------------------------------- #
# 5. Core Endpoints (Health, Employees, Attendance Starter)
# --------------------------------------------------------------------------- #
@app.get("/health", response_model=Dict[str, str], tags=["system"])
def health():
    """Returns 200 only if MongoDB answers a ping; otherwise 503."""
    try:
        client.admin.command("ping")
        return {"status": "ok"}
    except PyMongoError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        )


@app.post(
    "/employees",
    response_model=Employee,
    status_code=status.HTTP_201_CREATED,
    tags=["employees"],
)
def create_employee(body: EmployeeCreate):
    """
    Creates an employee. Unique emp_code is enforced by database unique index.
    Concurrent duplicate creates yield exactly one 201 and the rest 409.
    """
    doc = body.model_dump()
    created_at_dt = datetime.now(timezone.utc).replace(microsecond=0)
    doc["created_at"] = created_at_dt

    try:
        db.employees.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Employee with emp_code '{body.emp_code}' already exists",
        )

    return format_employee_doc(doc)


@app.get("/employees", response_model=EmployeePage, tags=["employees"])
def list_employees(
    department: Optional[str] = Query(default=None, description="Exact, case-sensitive match"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """
    List employees sorted by emp_code ascending.
    total reflects the filtered count, not the whole collection.
    """
    q: Dict[str, Any] = {}
    if department:
        q["department"] = department

    total = db.employees.count_documents(q)
    skip = (page - 1) * page_size
    cursor = db.employees.find(q).sort("emp_code", ASCENDING).skip(skip).limit(page_size)

    items = [format_employee_doc(d) for d in cursor]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post(
    "/attendance/punch-in",
    response_model=AttendanceRecord,
    status_code=status.HTTP_201_CREATED,
    tags=["attendance"],
)
def punch_in(body: PunchInRequest):
    """
    Creates the day's record (R1, R2).
    Race-safe: enforced by compound unique index on (emp_code, date).
    """
    emp = db.employees.find_one({"emp_code": body.emp_code})
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{body.emp_code}' not found",
        )

    # Determine punch-in instant truncated to whole seconds
    if body.punched_at is not None:
        punch_in_dt = epoch_ms_to_datetime(body.punched_at)
    else:
        punch_in_dt = truncate_to_seconds(datetime.now(timezone.utc))

    # Calculate attendance date per R1 (accounting for overnight shifts)
    attendance_date = compute_attendance_date(punch_in_dt, emp["shift_start"], emp["shift_end"])

    # Compute late minutes per R2
    late_mins = compute_late_minutes(punch_in_dt, emp["shift_start"], attendance_date)

    doc = {
        "emp_code": body.emp_code,
        "date": attendance_date,
        "status": body.status.value,
        "punch_in": punch_in_dt,
        "punch_out": None,
        "work_hours": None,
        "late_minutes": late_mins,
        "overtime_minutes": 0,
        "half_day": False,
        "history": [],
    }

    try:
        db.attendance_logs.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance record already exists for '{body.emp_code}' on '{attendance_date}'",
        )

    return format_attendance_doc(doc)


@app.get("/attendance", response_model=AttendancePage, tags=["attendance"])
def list_attendance(
    emp_code: Optional[str] = Query(default=None),
    date_from: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    status_filter: Optional[Status] = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """
    List attendance records sorted by date DESC, then emp_code ASC.
    Indexed query backed by compound index on (date, emp_code).
    """
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from must not be greater than date_to",
        )

    q: Dict[str, Any] = {}
    if emp_code:
        q["emp_code"] = emp_code
    if date_from or date_to:
        date_q: Dict[str, Any] = {}
        if date_from:
            date_q["$gte"] = date_from
        if date_to:
            date_q["$lte"] = date_to
        q["date"] = date_q
    if status_filter:
        q["status"] = status_filter.value

    total = db.attendance_logs.count_documents(q)
    skip = (page - 1) * page_size
    cursor = (
        db.attendance_logs.find(q)
        .sort([("date", DESCENDING), ("emp_code", ASCENDING)])
        .skip(skip)
        .limit(page_size)
    )

    items = [format_attendance_doc(d) for d in cursor]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post(
    "/attendance/punch-out",
    response_model=AttendanceRecord,
    status_code=status.HTTP_200_OK,
    tags=["attendance"],
)
def punch_out(body: PunchOutRequest):
    """
    Closes the employee's most recent record whose punch_in is at or before punched_at
    (this must work across midnight for overnight shifts). Computes work_hours (R4),
    overtime_minutes (R3) and half_day (R5).
    Errors: 404 unknown employee, or no punch-in found; 409 that record is already punched out
    (two simultaneous punch-outs must yield exactly one 200); 422 if punched_at <= punch_in
    or more than 24 hours after it.
    """
    emp = db.employees.find_one({"emp_code": body.emp_code})
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{body.emp_code}' not found",
        )

    if body.punched_at is not None:
        punch_out_dt = epoch_ms_to_datetime(body.punched_at)
    else:
        punch_out_dt = truncate_to_seconds(datetime.now(timezone.utc))

    # Find open record or most recent record to evaluate
    open_record = db.attendance_logs.find_one(
        {"emp_code": body.emp_code, "punch_out": None, "punch_in": {"$ne": None}},
        sort=[("punch_in", DESCENDING)],
    )

    if open_record:
        record = open_record
    else:
        record = db.attendance_logs.find_one(
            {"emp_code": body.emp_code, "punch_in": {"$ne": None}},
            sort=[("punch_in", DESCENDING)],
        )
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No punch-in found for employee '{body.emp_code}'",
            )
        punch_in_dt = record["punch_in"]
        if punch_in_dt.tzinfo is None:
            punch_in_dt = punch_in_dt.replace(tzinfo=timezone.utc)
        if punch_out_dt <= punch_in_dt:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="punched_at must be strictly greater than punch_in",
            )
        if punch_out_dt <= punch_in_dt + timedelta(hours=24):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Record for '{body.emp_code}' on '{record['date']}' is already punched out",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No punch-in found for employee '{body.emp_code}'",
            )

    punch_in_dt = record["punch_in"]
    if punch_in_dt.tzinfo is None:
        punch_in_dt = punch_in_dt.replace(tzinfo=timezone.utc)

    # 422 if punched_at <= punch_in or more than 24 hours after it
    if punch_out_dt <= punch_in_dt:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="punched_at must be strictly greater than punch_in",
        )

    if punch_out_dt > punch_in_dt + timedelta(hours=24):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="punched_at must not be more than 24 hours after punch_in",
        )

    # Compute R3 overtime, R4 work hours, R5 half-day
    work_hours = compute_work_hours(punch_in_dt, punch_out_dt)
    overtime_minutes = compute_overtime_minutes(punch_out_dt, emp["shift_start"], emp["shift_end"], record["date"])
    half_day = compute_half_day(work_hours)

    # Atomic update to ensure race-safety (two simultaneous punch-outs yield exactly one 200)
    updated_record = db.attendance_logs.find_one_and_update(
        {
            "_id": record["_id"],
            "punch_out": None,
        },
        {
            "$set": {
                "punch_out": punch_out_dt,
                "work_hours": work_hours,
                "overtime_minutes": overtime_minutes,
                "half_day": half_day,
            }
        },
        return_document=ReturnDocument.AFTER,
    )

    if not updated_record:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Record for '{body.emp_code}' on '{record['date']}' was already punched out",
        )

    return format_attendance_doc(updated_record)


@app.patch(
    "/attendance/{emp_code}/{date}",
    response_model=AttendanceRecord,
    status_code=status.HTTP_200_OK,
    tags=["attendance"],
)
def regularize_attendance(
    emp_code: str = Path(...),
    date_str: str = Path(..., alias="date", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    body: RegularizeRequest = ...,
):
    """
    Regularize (manually correct) one day's record.
    Recomputes late_minutes, work_hours, overtime_minutes and half_day.
    Appends exactly one entry to history containing only fields that actually changed.
    """
    emp = db.employees.find_one({"emp_code": emp_code})
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{emp_code}' not found",
        )

    record = db.attendance_logs.find_one({"emp_code": emp_code, "date": date_str})
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Attendance record for '{emp_code}' on '{date_str}' not found",
        )

    # Determine target status
    target_status_val = body.status.value if body.status is not None else record["status"]

    # Rule: Setting status ABSENT or LEAVE clears both punch times;
    # supplying punch_in or punch_out with it is 422
    if target_status_val in ("ABSENT", "LEAVE"):
        if body.punch_in is not None or body.punch_out is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cannot supply punch_in or punch_out when status is {target_status_val}",
            )
        target_punch_in = None
        target_punch_out = None
    else:
        # Presence status (PRESENT, WFH, ON_DUTY)
        if body.punch_in is not None:
            target_punch_in = epoch_ms_to_datetime(body.punch_in)
        else:
            target_punch_in = record.get("punch_in")

        if target_punch_in is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"A presence status ({target_status_val}) requires a punch_in (supplied or already stored)",
            )

        # Rule: punch_in must stay on the record's attendance date (R1)
        calc_date = compute_attendance_date(target_punch_in, emp["shift_start"], emp["shift_end"])
        if calc_date != date_str:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"punch_in falls on attendance date '{calc_date}', but record is for date '{date_str}'",
            )

        if body.punch_out is not None:
            target_punch_out = epoch_ms_to_datetime(body.punch_out)
        else:
            target_punch_out = record.get("punch_out")

        # Rule: punch_out must be after punch_in and within 24 hours
        if target_punch_out is not None:
            in_dt = target_punch_in
            if in_dt.tzinfo is None:
                in_dt = in_dt.replace(tzinfo=timezone.utc)
            out_dt = target_punch_out
            if out_dt.tzinfo is None:
                out_dt = out_dt.replace(tzinfo=timezone.utc)

            if out_dt <= in_dt:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="punch_out must be strictly after punch_in",
                )
            if out_dt > in_dt + timedelta(hours=24):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="punch_out must be within 24 hours of punch_in",
                )

    # Recompute derived fields based on final state
    if target_status_val in ("ABSENT", "LEAVE"):
        new_work_hours = None
        new_late_minutes = 0
        new_overtime_minutes = 0
        new_half_day = False
    else:
        new_late_minutes = compute_late_minutes(target_punch_in, emp["shift_start"], date_str)
        if target_punch_out is not None:
            new_work_hours = compute_work_hours(target_punch_in, target_punch_out)
            new_overtime_minutes = compute_overtime_minutes(
                target_punch_out, emp["shift_start"], emp["shift_end"], date_str
            )
            new_half_day = compute_half_day(new_work_hours)
        else:
            new_work_hours = None
            new_overtime_minutes = 0
            new_half_day = False

    # Compare fields to detect changes
    changes: Dict[str, Dict[str, Any]] = {}

    def compare_field(field_name: str, old_val: Any, new_val: Any):
        # Normalize datetimes for comparison
        old_comp = old_val
        new_comp = new_val
        if isinstance(old_comp, datetime) and old_comp.tzinfo is None:
            old_comp = old_comp.replace(tzinfo=timezone.utc)
        if isinstance(new_comp, datetime) and new_comp.tzinfo is None:
            new_comp = new_comp.replace(tzinfo=timezone.utc)

        if old_comp != new_comp:
            changes[field_name] = {"from": old_val, "to": new_val}

    compare_field("status", record.get("status"), target_status_val)
    compare_field("punch_in", record.get("punch_in"), target_punch_in)
    compare_field("punch_out", record.get("punch_out"), target_punch_out)
    compare_field("work_hours", record.get("work_hours"), new_work_hours)
    compare_field("late_minutes", record.get("late_minutes", 0), new_late_minutes)
    compare_field("overtime_minutes", record.get("overtime_minutes", 0), new_overtime_minutes)
    compare_field("half_day", record.get("half_day", False), new_half_day)

    # Rule: a request that changes nothing is 422
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Request made no changes to the attendance record",
        )

    now_dt = truncate_to_seconds(datetime.now(timezone.utc))
    history_entry = {
        "at": now_dt,
        "by": body.regularized_by,
        "reason": body.reason,
        "changes": changes,
    }

    # Atomic update to avoid concurrent lost updates to history
    # Match record by ID and previous history length
    existing_history_len = len(record.get("history", []))
    updated_record = db.attendance_logs.find_one_and_update(
        {
            "_id": record["_id"],
            "history": {"$size": existing_history_len},
        },
        {
            "$set": {
                "status": target_status_val,
                "punch_in": target_punch_in,
                "punch_out": target_punch_out,
                "work_hours": new_work_hours,
                "late_minutes": new_late_minutes,
                "overtime_minutes": new_overtime_minutes,
                "half_day": new_half_day,
            },
            "$push": {"history": history_entry},
        },
        return_document=ReturnDocument.AFTER,
    )

    if not updated_record:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Concurrent modification conflict: record history was changed by another request",
        )

    return format_attendance_doc(updated_record)


@app.get(
    "/analytics/employees/{emp_code}/monthly",
    response_model=EmployeeMonthly,
    tags=["analytics"],
)
def employee_monthly(
    emp_code: str = Path(...),
    month: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
):
    """
    Monthly attendance summary for one employee backed by MongoDB aggregation.
    working_days per R7. present_days per R5-R7 (half day = 0.5, Mon-Fri only).
    attendance_pct = present_days / working_days * 100, R8 rounding (2 decimals half-up).
    """
    emp = db.employees.find_one({"emp_code": emp_code})
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Employee '{emp_code}' not found",
        )

    year, mon = map(int, month.split("-"))
    last_day = calendar.monthrange(year, mon)[1]
    month_start = date(year, mon, 1)
    month_end = date(year, mon, last_day)

    # R7 Working days: Mon-Fri, counted from joined_on for mid-month joiners
    joined_on_dt = date.fromisoformat(emp["joined_on"])
    if joined_on_dt > month_end:
        working_days = 0
    else:
        eff_start = max(month_start, joined_on_dt)
        working_days = count_working_days(eff_start, month_end)

    start_str = f"{month}-01"
    end_str = f"{month}-{last_day:02d}"

    pipeline = [
        {"$match": {"emp_code": emp_code, "date": {"$gte": start_str, "$lte": end_str}}},
        {
            "$project": {
                "status": 1,
                "late_minutes": {"$ifNull": ["$late_minutes", 0]},
                "overtime_minutes": {"$ifNull": ["$overtime_minutes", 0]},
                "half_day": {"$ifNull": ["$half_day", False]},
                "iso_dow": {
                    "$isoDayOfWeek": {
                        "$dateFromString": {
                            "dateString": "$date",
                        }
                    }
                },
            }
        },
        {
            "$group": {
                "_id": None,
                "present_days": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$lte": ["$iso_dow", 5]},
                                    {"$in": ["$status", ["PRESENT", "WFH", "ON_DUTY"]]},
                                ]
                            },
                            {"$cond": [{"$eq": ["$half_day", True]}, 0.5, 1.0]},
                            0.0,
                        ]
                    }
                },
                "leave_days": {
                    "$sum": {"$cond": [{"$eq": ["$status", "LEAVE"]}, 1, 0]}
                },
                "late_count": {
                    "$sum": {"$cond": [{"$gt": ["$late_minutes", 0]}, 1, 0]}
                },
                "total_late_minutes": {"$sum": "$late_minutes"},
                "total_overtime_minutes": {"$sum": "$overtime_minutes"},
            }
        },
    ]

    res = list(db.attendance_logs.aggregate(pipeline))
    if res:
        data = res[0]
        present_days = float(data.get("present_days", 0.0))
        leave_days = int(data.get("leave_days", 0))
        late_count = int(data.get("late_count", 0))
        total_late_minutes = int(data.get("total_late_minutes", 0))
        total_overtime_minutes = int(data.get("total_overtime_minutes", 0))
    else:
        present_days = 0.0
        leave_days = 0
        late_count = 0
        total_late_minutes = 0
        total_overtime_minutes = 0

    if working_days == 0:
        attendance_pct = None
    else:
        raw_pct = (present_days / working_days) * 100.0
        attendance_pct = round_half_up_2(raw_pct)

    return {
        "emp_code": emp_code,
        "month": month,
        "working_days": working_days,
        "present_days": present_days,
        "leave_days": leave_days,
        "late_count": late_count,
        "total_late_minutes": total_late_minutes,
        "total_overtime_minutes": total_overtime_minutes,
        "attendance_pct": attendance_pct,
    }


@app.get(
    "/analytics/departments/summary",
    response_model=DepartmentSummary,
    tags=["analytics"],
)
def department_summary(
    month: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    department: Optional[str] = Query(default=None),
):
    """
    Department summary for a month via MongoDB aggregation across both collections.
    Headcount includes people with zero logs and excludes future joiners.
    Average work hours is computed over records (not employee averages).
    """
    year, mon = map(int, month.split("-"))
    last_day = calendar.monthrange(year, mon)[1]
    month_end_str = f"{month}-{last_day:02d}"
    month_start_str = f"{month}-01"

    dep_val = department if isinstance(department, str) else None
    match_emp: Dict[str, Any] = {"joined_on": {"$lte": month_end_str}}
    if dep_val:
        match_emp["department"] = dep_val

    pipeline = [
        {"$match": match_emp},
        {
            "$group": {
                "_id": "$department",
                "headcount": {"$sum": 1},
                "emp_codes": {"$push": "$emp_code"},
            }
        },
        {
            "$lookup": {
                "from": "attendance_logs",
                "let": {"emps": "$emp_codes"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    {"$in": ["$emp_code", "$$emps"]},
                                    {"$gte": ["$date", month_start_str]},
                                    {"$lte": ["$date", month_end_str]},
                                ]
                            }
                        }
                    }
                ],
                "as": "logs",
            }
        },
        {"$unwind": {"path": "$logs", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": "$_id",
                "headcount": {"$first": "$headcount"},
                "present_days": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$ne": ["$logs", None]},
                                    {
                                        "$lte": [
                                            {
                                                "$isoDayOfWeek": {
                                                    "$dateFromString": {
                                                        "dateString": "$logs.date",
                                                    }
                                                }
                                            },
                                            5,
                                        ]
                                    },
                                    {"$in": ["$logs.status", ["PRESENT", "WFH", "ON_DUTY"]]},
                                ]
                            },
                            {"$cond": [{"$eq": ["$logs.half_day", True]}, 0.5, 1.0]},
                            0.0,
                        ]
                    }
                },
                "raw_avg_hours": {
                    "$avg": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$ne": ["$logs", None]},
                                    {"$in": ["$logs.status", ["PRESENT", "WFH", "ON_DUTY"]]},
                                    {"$ne": ["$logs.work_hours", None]},
                                ]
                            },
                            "$logs.work_hours",
                            None,
                        ]
                    }
                },
                "late_count": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$ne": ["$logs", None]},
                                    {"$gt": ["$logs.late_minutes", 0]},
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
                "total_late_minutes": {
                    "$sum": {
                        "$cond": [
                            {"$ne": ["$logs", None]},
                            {"$ifNull": ["$logs.late_minutes", 0]},
                            0,
                        ]
                    }
                },
                "leave_count": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$ne": ["$logs", None]},
                                    {"$eq": ["$logs.status", "LEAVE"]},
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
                "on_duty_count": {
                    "$sum": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$ne": ["$logs", None]},
                                    {"$eq": ["$logs.status", "ON_DUTY"]},
                                ]
                            },
                            1,
                            0,
                        ]
                    }
                },
            }
        },
        {"$sort": {"_id": ASCENDING}},
    ]

    cursor = db.employees.aggregate(pipeline)
    items = []
    for doc in cursor:
        raw_avg = doc.get("raw_avg_hours")
        items.append({
            "department": doc["_id"],
            "headcount": int(doc["headcount"]),
            "present_days": float(doc.get("present_days", 0.0)),
            "avg_work_hours": round_half_up_2(raw_avg) if raw_avg is not None else None,
            "late_count": int(doc.get("late_count", 0)),
            "total_late_minutes": int(doc.get("total_late_minutes", 0)),
            "leave_count": int(doc.get("leave_count", 0)),
            "on_duty_count": int(doc.get("on_duty_count", 0)),
        })

    return {"month": month, "items": items}


@app.get(
    "/analytics/leaderboard/late",
    response_model=Leaderboard,
    tags=["analytics"],
)
def late_leaderboard(
    month: str = Query(..., pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    limit: int = Query(default=10, ge=1, le=50),
    department: Optional[str] = Query(default=None),
):
    """
    Late-comers leaderboard for a month. Standard competition ranking (1, 2, 2, 4).
    limit is applied after ranking; tied employees at cutoff are all returned.
    Sorted by total_late_minutes descending, then emp_code ascending.
    """
    year, mon = map(int, month.split("-"))
    last_day = calendar.monthrange(year, mon)[1]
    start_str = f"{month}-01"
    end_str = f"{month}-{last_day:02d}"

    limit_val = limit if isinstance(limit, int) else 10
    dep_val = department if isinstance(department, str) else None

    pipeline = [
        {
            "$match": {
                "date": {"$gte": start_str, "$lte": end_str},
                "late_minutes": {"$gt": 0},
            }
        },
        {
            "$group": {
                "_id": "$emp_code",
                "total_late_minutes": {"$sum": "$late_minutes"},
                "late_count": {"$sum": 1},
            }
        },
        {"$match": {"total_late_minutes": {"$gt": 0}}},
        {
            "$lookup": {
                "from": "employees",
                "localField": "_id",
                "foreignField": "emp_code",
                "as": "emp",
            }
        },
        {"$unwind": "$emp"},
    ]

    if dep_val:
        pipeline.append({"$match": {"emp.department": dep_val}})

    # Window function: standard competition ranking ($rank)
    pipeline.extend([
        {
            "$setWindowFields": {
                "sortBy": {"total_late_minutes": DESCENDING},
                "output": {
                    "rank": {"$rank": {}},
                },
            }
        },
        {"$match": {"rank": {"$lte": limit_val}}},
        {"$sort": {"total_late_minutes": DESCENDING, "_id": ASCENDING}},
        {
            "$project": {
                "rank": 1,
                "emp_code": "$_id",
                "name": "$emp.name",
                "department": "$emp.department",
                "total_late_minutes": 1,
                "late_count": 1,
            }
        },
    ])

    cursor = db.attendance_logs.aggregate(pipeline)
    items = [
        {
            "rank": int(doc["rank"]),
            "emp_code": doc["emp_code"],
            "name": doc["name"],
            "department": doc["department"],
            "total_late_minutes": int(doc["total_late_minutes"]),
            "late_count": int(doc["late_count"]),
        }
        for doc in cursor
    ]

    return {"month": month, "items": items}


@app.get(
    "/analytics/departments/{department}/trend",
    response_model=Trend,
    tags=["analytics"],
)
def department_trend(
    department: str = Path(...),
    date_from: str = Query(..., alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: str = Query(..., alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
):
    """
    Daily attendance trend for a department with database gap filling ($densify)
    and 7-day moving average ($setWindowFields).
    Exactly one row per calendar day from 'from' to 'to' inclusive.
    """
    emp_exists = db.employees.find_one({"department": department})
    if not emp_exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department '{department}' not found",
        )

    try:
        d_from = date.fromisoformat(date_from)
        d_to = date.fromisoformat(date_to)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid date format",
        )

    if d_to < d_from:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="'to' date must not be earlier than 'from' date",
        )

    num_days = (d_to - d_from).days + 1
    if num_days > 92:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date range exceeds 92 days",
        )

    dt_from_ist = datetime(d_from.year, d_from.month, d_from.day, 0, 0, 0, tzinfo=IST)
    dt_to_bound_ist = datetime(d_to.year, d_to.month, d_to.day, 0, 0, 0, tzinfo=IST) + timedelta(days=1)

    pipeline = [
        {"$match": {"department": department}},
        {"$limit": 1},
        {"$project": {"date_dt": {"$literal": dt_from_ist}}},
        {
            "$densify": {
                "field": "date_dt",
                "range": {
                    "step": 1,
                    "unit": "day",
                    "bounds": [dt_from_ist, dt_to_bound_ist],
                },
            }
        },
        {
            "$project": {
                "date": {
                    "$dateToString": {
                        "format": "%Y-%m-%d",
                        "date": "$date_dt",
                        "timezone": "+05:30",
                    }
                },
                "iso_dow": {
                    "$isoDayOfWeek": {
                        "date": "$date_dt",
                        "timezone": "+05:30",
                    }
                },
            }
        },
        {
            "$lookup": {
                "from": "employees",
                "let": {"cur_date": "$date"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    {"$eq": ["$department", department]},
                                    {"$lte": ["$joined_on", "$$cur_date"]},
                                ]
                            }
                        }
                    }
                ],
                "as": "active_emps",
            }
        },
        {
            "$lookup": {
                "from": "attendance_logs",
                "let": {"cur_date": "$date", "active_codes": "$active_emps.emp_code"},
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    {"$eq": ["$date", "$$cur_date"]},
                                    {"$in": ["$emp_code", "$$active_codes"]},
                                ]
                            }
                        }
                    }
                ],
                "as": "logs",
            }
        },
        {
            "$project": {
                "date": 1,
                "is_working_day": {"$lte": ["$iso_dow", 5]},
                "headcount": {"$size": "$active_emps"},
                "present_count": {
                    "$sum": {
                        "$map": {
                            "input": "$logs",
                            "as": "l",
                            "in": {
                                "$cond": [
                                    {"$in": ["$$l.status", ["PRESENT", "WFH", "ON_DUTY"]]},
                                    {"$cond": [{"$eq": ["$$l.half_day", True]}, 0.5, 1.0]},
                                    0.0,
                                ]
                            },
                        }
                    }
                },
                "late_count": {
                    "$sum": {
                        "$map": {
                            "input": "$logs",
                            "as": "l",
                            "in": {"$cond": [{"$gt": ["$$l.late_minutes", 0]}, 1, 0]},
                        }
                    }
                },
            }
        },
        {
            "$addFields": {
                "attendance_rate": {
                    "$cond": [
                        {
                            "$and": [
                                "$is_working_day",
                                {"$gt": ["$headcount", 0]},
                            ]
                        },
                        {"$divide": ["$present_count", "$headcount"]},
                        None,
                    ]
                }
            }
        },
        {
            "$setWindowFields": {
                "sortBy": {"date": 1},
                "output": {
                    "moving_avg_7d": {
                        "$avg": "$attendance_rate",
                        "window": {"documents": [-6, 0]},
                    }
                },
            }
        },
    ]

    cursor = db.employees.aggregate(pipeline)
    items = []
    for r in cursor:
        rate = r.get("attendance_rate")
        m_avg = r.get("moving_avg_7d")
        items.append({
            "date": r["date"],
            "is_working_day": bool(r["is_working_day"]),
            "headcount": int(r["headcount"]),
            "present_count": float(r["present_count"]),
            "late_count": int(r["late_count"]),
            "attendance_rate": round_half_up_4(rate) if rate is not None else None,
            "moving_avg_7d": round_half_up_4(m_avg) if m_avg is not None else None,
        })

    return {"department": department, "items": items}


# --------------------------------------------------------------------------- #
# 8. Admin & Explainability Endpoint (Phase 5)
# --------------------------------------------------------------------------- #
@app.get(
    "/admin/explain/{endpoint}",
    response_model=ExplainResponse,
    tags=["admin"],
)
def explain_endpoint(
    endpoint: ExplainTarget = Path(...),
    emp_code: Optional[str] = Query(default=None),
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    department: Optional[str] = Query(default=None),
    limit: Optional[int] = Query(default=10, ge=1, le=50),
    date_from: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    date_to: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    status_filter: Optional[Status] = Query(default=None, alias="status"),
    from_param: Optional[str] = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    to_param: Optional[str] = Query(default=None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """
    Runs explain with executionStats verbosity for the main query or aggregation
    of the named endpoint, built exactly as that endpoint builds it.
    """
    emp_code_val = emp_code if isinstance(emp_code, str) else None
    month_val = month if isinstance(month, str) else None
    dep_val = department if isinstance(department, str) else None
    limit_val = limit if isinstance(limit, int) else 10
    date_from_val = date_from if isinstance(date_from, str) else None
    date_to_val = date_to if isinstance(date_to, str) else None
    status_val = status_filter if isinstance(status_filter, Status) else None
    from_val = from_param if isinstance(from_param, str) else None
    to_val = to_param if isinstance(to_param, str) else None
    page_val = page if isinstance(page, int) else 1
    page_size_val = page_size if isinstance(page_size, int) else 20

    endpoint_name = endpoint.value if hasattr(endpoint, "value") else str(endpoint)

    if endpoint == ExplainTarget.attendance_list:
        coll_name = "attendance_logs"
        if date_from_val and date_to_val and date_from_val > date_to_val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="date_from must not be greater than date_to",
            )
        q: Dict[str, Any] = {}
        if emp_code_val:
            q["emp_code"] = emp_code_val
        if date_from_val or date_to_val:
            date_q: Dict[str, Any] = {}
            if date_from_val:
                date_q["$gte"] = date_from_val
            if date_to_val:
                date_q["$lte"] = date_to_val
            q["date"] = date_q
        if status_val:
            q["status"] = status_val.value

        skip = (page_val - 1) * page_size_val
        cmd = {
            "find": coll_name,
            "filter": q,
            "sort": {"date": -1, "emp_code": 1},
            "skip": skip,
            "limit": page_size_val,
        }
        raw_explain = db.command("explain", cmd, verbosity="executionStats")

    elif endpoint == ExplainTarget.employee_monthly:
        coll_name = "attendance_logs"
        if not emp_code_val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Missing required query parameter: 'emp_code'",
            )
        if not month_val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Missing required query parameter: 'month'",
            )
        try:
            year, mon = map(int, month_val.split("-"))
            last_day = calendar.monthrange(year, mon)[1]
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid month format: '{month_val}'. Expected YYYY-MM",
            )
        start_str = f"{month_val}-01"
        end_str = f"{month_val}-{last_day:02d}"

        pipeline = [
            {"$match": {"emp_code": emp_code_val, "date": {"$gte": start_str, "$lte": end_str}}},
            {
                "$project": {
                    "status": 1,
                    "late_minutes": {"$ifNull": ["$late_minutes", 0]},
                    "overtime_minutes": {"$ifNull": ["$overtime_minutes", 0]},
                    "half_day": {"$ifNull": ["$half_day", False]},
                    "iso_dow": {
                        "$isoDayOfWeek": {
                            "$dateFromString": {
                                "dateString": "$date",
                            }
                        }
                    },
                }
            },
            {
                "$group": {
                    "_id": None,
                    "present_days": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$and": [
                                        {"$lte": ["$iso_dow", 5]},
                                        {"$in": ["$status", ["PRESENT", "WFH", "ON_DUTY"]]},
                                    ]
                                },
                                {"$cond": [{"$eq": ["$half_day", True]}, 0.5, 1.0]},
                                0.0,
                            ]
                        }
                    },
                    "leave_days": {
                        "$sum": {"$cond": [{"$eq": ["$status", "LEAVE"]}, 1, 0]}
                    },
                    "late_count": {
                        "$sum": {"$cond": [{"$gt": ["$late_minutes", 0]}, 1, 0]}
                    },
                    "total_late_minutes": {"$sum": "$late_minutes"},
                    "total_overtime_minutes": {"$sum": "$overtime_minutes"},
                }
            },
        ]
        cmd = {
            "aggregate": coll_name,
            "pipeline": pipeline,
            "cursor": {},
        }
        raw_explain = db.command("explain", cmd, verbosity="executionStats")

    elif endpoint == ExplainTarget.department_summary:
        coll_name = "employees"
        if not month_val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Missing required query parameter: 'month'",
            )
        try:
            year, mon = map(int, month_val.split("-"))
            last_day = calendar.monthrange(year, mon)[1]
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid month format: '{month_val}'. Expected YYYY-MM",
            )
        month_end_str = f"{month_val}-{last_day:02d}"
        month_start_str = f"{month_val}-01"

        match_emp: Dict[str, Any] = {"joined_on": {"$lte": month_end_str}}
        if dep_val:
            match_emp["department"] = dep_val

        pipeline = [
            {"$match": match_emp},
            {
                "$group": {
                    "_id": "$department",
                    "headcount": {"$sum": 1},
                    "emp_codes": {"$push": "$emp_code"},
                }
            },
            {
                "$lookup": {
                    "from": "attendance_logs",
                    "let": {"emps": "$emp_codes"},
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {
                                    "$and": [
                                        {"$in": ["$emp_code", "$$emps"]},
                                        {"$gte": ["$date", month_start_str]},
                                        {"$lte": ["$date", month_end_str]},
                                    ]
                                }
                            }
                        }
                    ],
                    "as": "logs",
                }
            },
            {"$unwind": {"path": "$logs", "preserveNullAndEmptyArrays": True}},
            {
                "$group": {
                    "_id": "$_id",
                    "headcount": {"$first": "$headcount"},
                    "present_days": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$and": [
                                        {"$ne": ["$logs", None]},
                                        {
                                            "$lte": [
                                                {
                                                    "$isoDayOfWeek": {
                                                        "$dateFromString": {
                                                            "dateString": "$logs.date",
                                                        }
                                                    }
                                                },
                                                5,
                                            ]
                                        },
                                        {"$in": ["$logs.status", ["PRESENT", "WFH", "ON_DUTY"]]},
                                    ]
                                },
                                {"$cond": [{"$eq": ["$logs.half_day", True]}, 0.5, 1.0]},
                                0.0,
                            ]
                        }
                    },
                    "raw_avg_hours": {
                        "$avg": {
                            "$cond": [
                                {
                                    "$and": [
                                        {"$ne": ["$logs", None]},
                                        {"$ne": ["$logs.work_hours", None]},
                                    ]
                                },
                                "$logs.work_hours",
                                None,
                            ]
                        }
                    },
                    "late_count": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$and": [
                                        {"$ne": ["$logs", None]},
                                        {"$gt": ["$logs.late_minutes", 0]},
                                    ]
                                },
                                1,
                                0,
                            ]
                        }
                    },
                    "total_late_minutes": {
                        "$sum": {
                            "$cond": [
                                {"$ne": ["$logs", None]},
                                "$logs.late_minutes",
                                0,
                            ]
                        }
                    },
                    "leave_count": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$and": [
                                        {"$ne": ["$logs", None]},
                                        {"$eq": ["$logs.status", "LEAVE"]},
                                    ]
                                },
                                1,
                                0,
                            ]
                        }
                    },
                    "on_duty_count": {
                        "$sum": {
                            "$cond": [
                                {
                                    "$and": [
                                        {"$ne": ["$logs", None]},
                                        {"$eq": ["$logs.status", "ON_DUTY"]},
                                    ]
                                },
                                1,
                                0,
                            ]
                        }
                    },
                }
            },
            {"$sort": {"_id": ASCENDING}},
        ]
        cmd = {
            "aggregate": coll_name,
            "pipeline": pipeline,
            "cursor": {},
        }
        raw_explain = db.command("explain", cmd, verbosity="executionStats")

    elif endpoint == ExplainTarget.late_leaderboard:
        coll_name = "attendance_logs"
        if not month_val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Missing required query parameter: 'month'",
            )
        try:
            year, mon = map(int, month_val.split("-"))
            last_day = calendar.monthrange(year, mon)[1]
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid month format: '{month_val}'. Expected YYYY-MM",
            )
        start_str = f"{month_val}-01"
        end_str = f"{month_val}-{last_day:02d}"

        pipeline = [
            {
                "$match": {
                    "date": {"$gte": start_str, "$lte": end_str},
                    "late_minutes": {"$gt": 0},
                }
            },
            {
                "$group": {
                    "_id": "$emp_code",
                    "total_late_minutes": {"$sum": "$late_minutes"},
                    "late_count": {"$sum": 1},
                }
            },
            {"$match": {"total_late_minutes": {"$gt": 0}}},
            {
                "$lookup": {
                    "from": "employees",
                    "localField": "_id",
                    "foreignField": "emp_code",
                    "as": "emp",
                }
            },
            {"$unwind": "$emp"},
        ]
        if dep_val:
            pipeline.append({"$match": {"emp.department": dep_val}})

        pipeline.extend([
            {
                "$setWindowFields": {
                    "sortBy": {"total_late_minutes": DESCENDING},
                    "output": {
                        "rank": {"$rank": {}},
                    },
                }
            },
            {"$match": {"rank": {"$lte": limit_val}}},
            {"$sort": {"total_late_minutes": DESCENDING, "_id": ASCENDING}},
            {
                "$project": {
                    "rank": 1,
                    "emp_code": "$_id",
                    "name": "$emp.name",
                    "department": "$emp.department",
                    "total_late_minutes": 1,
                    "late_count": 1,
                }
            },
        ])
        cmd = {
            "aggregate": coll_name,
            "pipeline": pipeline,
            "cursor": {},
        }
        raw_explain = db.command("explain", cmd, verbosity="executionStats")

    elif endpoint == ExplainTarget.department_trend:
        coll_name = "employees"
        if not dep_val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Missing required query parameter: 'department'",
            )
        if not from_val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Missing required query parameter: 'from'",
            )
        if not to_val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Missing required query parameter: 'to'",
            )
        try:
            d_from = date.fromisoformat(from_val)
            d_to = date.fromisoformat(to_val)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid date format",
            )
        if d_to < d_from:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="'to' date must not be earlier than 'from' date",
            )
        num_days = (d_to - d_from).days + 1
        if num_days > 92:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Date range exceeds 92 days",
            )

        dt_from_ist = datetime(d_from.year, d_from.month, d_from.day, 0, 0, 0, tzinfo=IST)
        dt_to_bound_ist = datetime(d_to.year, d_to.month, d_to.day, 0, 0, 0, tzinfo=IST) + timedelta(days=1)

        pipeline = [
            {"$match": {"department": dep_val}},
            {"$limit": 1},
            {"$project": {"date_dt": {"$literal": dt_from_ist}}},
            {
                "$densify": {
                    "field": "date_dt",
                    "range": {
                        "step": 1,
                        "unit": "day",
                        "bounds": [dt_from_ist, dt_to_bound_ist],
                    },
                }
            },
            {
                "$project": {
                    "date": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$date_dt",
                            "timezone": "+05:30",
                        }
                    },
                    "iso_dow": {
                        "$isoDayOfWeek": {
                            "date": "$date_dt",
                            "timezone": "+05:30",
                        }
                    },
                }
            },
            {
                "$lookup": {
                    "from": "employees",
                    "let": {"cur_date": "$date"},
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {
                                    "$and": [
                                        {"$eq": ["$department", dep_val]},
                                        {"$lte": ["$joined_on", "$$cur_date"]},
                                    ]
                                }
                            }
                        }
                    ],
                    "as": "active_emps",
                }
            },
            {
                "$lookup": {
                    "from": "attendance_logs",
                    "let": {"cur_date": "$date", "active_codes": "$active_emps.emp_code"},
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {
                                    "$and": [
                                        {"$eq": ["$date", "$$cur_date"]},
                                        {"$in": ["$emp_code", "$$active_codes"]},
                                    ]
                                }
                            }
                        }
                    ],
                    "as": "logs",
                }
            },
            {
                "$project": {
                    "date": 1,
                    "is_working_day": {"$lte": ["$iso_dow", 5]},
                    "headcount": {"$size": "$active_emps"},
                    "present_count": {
                        "$sum": {
                            "$map": {
                                "input": "$logs",
                                "as": "l",
                                "in": {
                                    "$cond": [
                                        {"$in": ["$$l.status", ["PRESENT", "WFH", "ON_DUTY"]]},
                                        {"$cond": [{"$eq": ["$$l.half_day", True]}, 0.5, 1.0]},
                                        0.0,
                                    ]
                                },
                            }
                        }
                    },
                    "late_count": {
                        "$sum": {
                            "$map": {
                                "input": "$logs",
                                "as": "l",
                                "in": {"$cond": [{"$gt": ["$$l.late_minutes", 0]}, 1, 0]},
                            }
                        }
                    },
                }
            },
            {
                "$addFields": {
                    "attendance_rate": {
                        "$cond": [
                            {
                                "$and": [
                                    "$is_working_day",
                                    {"$gt": ["$headcount", 0]},
                                ]
                            },
                            {"$divide": ["$present_count", "$headcount"]},
                            None,
                        ]
                    }
                }
            },
            {
                "$setWindowFields": {
                    "sortBy": {"date": 1},
                    "output": {
                        "moving_avg_7d": {
                            "$avg": "$attendance_rate",
                            "window": {
                                "documents": [-6, "current"],
                            },
                        }
                    },
                }
            },
            {"$sort": {"date": 1}},
        ]
        cmd = {
            "aggregate": coll_name,
            "pipeline": pipeline,
            "cursor": {},
        }
        raw_explain = db.command("explain", cmd, verbosity="executionStats")
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported endpoint: '{endpoint}'",
        )

    clean_explain = json.loads(json_util.dumps(raw_explain, json_options=json_util.RELAXED_JSON_OPTIONS))

    return {
        "endpoint": endpoint_name,
        "collection": coll_name,
        "explain": clean_explain,
    }
