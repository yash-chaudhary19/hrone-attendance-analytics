# REVIEW.md

Starter codebase review and defect audit for `app/main.py`.

### Identified Starter Defects & Implemented Fixes

| # | Where (function / line) | What is wrong | How you'd notice it (test, input, or symptom) | How you fixed it |
|---|---|---|---|---|
| 1 | `compute_attendance_date` | Overnight shifts (`shift_end <= shift_start`): punch-ins before `shift_end` were assigned to the current calendar date instead of the previous day's shift date (violating R1). | Punching in at `01:30` for a `22:00`–`06:00` shift assigned the record to today rather than yesterday. | Checked if `shift_end <= shift_start` and punch-in time is strictly earlier than `shift_end`; if so, subtracted 1 day from the attendance date. |
| 2 | `compute_late_minutes` | Late minutes were calculated from the end of the 10-minute grace window (`diff - 10`) instead of from `shift_start` (violating R2). | A punch-in at 09:45:00 for a 09:30 shift returned 5 minutes instead of 15 minutes. | If `(punch_ist - start_ist).total_seconds() > 600`, return floor minutes from `shift_start`: `int(diff_seconds // 60)`. |
| 3 | `POST /attendance/punch-in` | No database-level unique constraint on `(emp_code, date)`; concurrent requests bypassed the application-level `find_one` check, creating duplicate attendance records. | Sending two simultaneous punch-in requests resulted in two records for the same employee on the same date. | Created a compound unique index on `(emp_code, date)` and caught PyMongo `DuplicateKeyError` to return HTTP `409 Conflict`. |
| 4 | `POST /employees` | Duplicate `emp_code` inserts caused unhandled database driver exceptions resulting in an unhandled HTTP 500 error instead of HTTP 409. | Creating an employee with an existing `emp_code` returned 500 Internal Server Error. | Enforced unique index on `emp_code` and caught `DuplicateKeyError`, returning HTTP `409 Conflict` with clear detail. |
| 5 | `GET /health` | On MongoDB connection failure, endpoint raised an uncaught exception (HTTP 500) instead of returning HTTP 503 Service Unavailable. | Stopping MongoDB or passing an unreachable URI produced HTTP 500 rather than the contract-specified 503. | Wrapped `client.admin.command("ping")` in try-except block catching `PyMongoError` and raised `HTTPException(status_code=503, detail="Database unavailable")`. |
| 6 | `compute_work_hours` | Used standard Python binary float division and `round()`, which performs round-half-to-even (banker's rounding) instead of standard half-up rounding (R4/R8). | `4.225` hours rounded down to `4.22` instead of `4.23`. | Implemented `Decimal` arithmetic using `quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)`. |
| 7 | `compute_overtime_minutes` | Threshold logic was missing or counted overtime below 30 minutes; did not account for overnight shifts where `shift_end` is on the next calendar day. | Punch-out 15 minutes past shift end counted as 15 minutes overtime instead of 0 (threshold is >= 30 mins). | Set `end_date += timedelta(days=1)` for overnight shifts, and enforced `diff_seconds >= 30 * 60` before computing floor overtime minutes. |
| 8 | `EmployeeCreate` schema | Allowed identical `shift_start` and `shift_end` (e.g., `09:00` to `09:00`), which represents an invalid zero-hour shift and breaks overnight shift detection. | Creating an employee with `shift_start == shift_end` succeeded with HTTP 201. | Added `@model_validator(mode="after")` verifying `shift_start != shift_end`, raising HTTP 422 if equal. |
| 9 | `truncate_to_seconds` / Instants | Sub-second microsecond/millisecond fractions were preserved in calculations instead of being truncated to whole seconds (violating R1). | Punch-in at `09:40:00.800` was flagged as late because milliseconds made it > 10:00 past shift start. | Explicitly truncated all incoming instants to whole seconds (`dt.replace(microsecond=0)`) before any calculation or storage. |
| 10 | `GET /attendance` | Missing validation for inverted date ranges (`date_from > date_to`); pagination count did not reflect filtered query. | Querying `?date_from=2026-03-31&date_to=2026-03-01` returned an empty 200 list instead of HTTP 422. | Added validation raising HTTP 422 when `date_from > date_to`, and backed pagination with `count_documents(q)`. |
| 11 | Startup & Lifespan handler | Starter lacked index definitions and resource management, causing slow collection scans on queries. | List attendance and analytics performed unindexed collection scans (`COLLSCAN`). | Implemented FastAPI `lifespan` context manager that idempotently creates all required compound and unique indexes at application startup. |

---

### Examined and Verified as Non-Defects

1. **Storage of instants as BSON `Date` objects in MongoDB**:
   - `DATA_MODEL.md` confirms `punch_in` and `punch_out` are stored natively as BSON Dates in MongoDB documents while the external API contract accepts and emits integer epoch milliseconds. Converting between BSON Date and epoch milliseconds in application serializers is correct and adheres to specifications.
2. **String representation for shift times (`"HH:MM"`)**:
   - Storing `shift_start` and `shift_end` as 24-hour ISO time strings (e.g., `"09:30"`, `"18:30"`) aligns with both the OpenAPI schema and sample dataset without requiring timestamp conversion.
3. **Empty history array on punch-in creation**:
   - New attendance records initialize with `history: []`. The spec requires audit records to be appended only when records are modified via `PATCH /attendance/{emp_code}/{date}`, so an empty list on creation is intentional.
