# DECISIONS.md

1. **Indexes.**
   On `employees`, we created unique `emp_code` for identity lookups and uniqueness, plus compound `(department, joined_on, emp_code)` and `(joined_on, department, emp_code)` to cover department filtering, trend seeding, and department summary aggregations.
   On `attendance_logs`, we created unique compound `(emp_code, date)` to enforce one record per employee-day and eliminate race conditions. We added `(date: -1, emp_code: 1)` to back sorted pagination without in-memory sorting, `(emp_code, punch_in: -1)` for fast punch-out open-shift lookups, `(date, status)` for status-filtered attendance range queries, and `(date, late_minutes)` to accelerate leaderboard matching. We considered an index on `{ status: 1 }` alone but rejected it due to low cardinality (5 statuses across 100k records) which causes write overhead with negligible selectivity.

2. **Punch-in race.**
   When two identical punch-in requests arrive simultaneously, both compute the same attendance date in parallel and issue `insert_one`. The unique compound index on `(emp_code, date)` acts as our database concurrency lock: exactly one insert succeeds (returning 201), while the duplicate triggers a MongoDB `DuplicateKeyError` (code 11000). Our handler catches this and returns HTTP 409 Conflict. Zero duplicates or partial states are created.

3. **Ties.**
   Our leaderboard aggregation uses MongoDB's `$setWindowFields` with standard competition ranking (`$rank: {}`), assigning tied employees the exact same rank (e.g., 1, 2, 2, 4). The `limit` parameter filters on rank (`rank <= limit`), not raw document count or array index. Therefore, all employees tied at the cutoff boundary are returned, sorted deterministically by total late minutes descending, then employee code ascending.

4. **Headcount.**
   The department summary pipeline initiates from the `employees` collection matching active joiners (`joined_on <= month_end`). We group by department to establish true headcount, then perform a `$lookup` into `attendance_logs` and `$unwind` with `preserveNullAndEmptyArrays: true`. This ensures employees with zero attendance records are preserved and counted in department headcount.

5. **One thing you would change for 100x data.**
   At 100x scale (~10 million records), cross-collection `$lookup` and `$densify` pipelines will exhaust memory and cache limits. We would shard `attendance_logs` on `{ emp_code: 1, date: 1 }` and replace dynamic aggregations with asynchronous out-of-band pre-aggregation (via MongoDB Change Streams or daily rollups) into a dedicated `daily_department_metrics` collection, serving analytics queries in constant time.
