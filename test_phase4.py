"""
Phase 4 Non-Destructive Integration Tests
Tests all 4 Analytics Endpoints:
1. GET /analytics/employees/{emp_code}/monthly
2. GET /analytics/departments/summary
3. GET /analytics/leaderboard/late
4. GET /analytics/departments/{department}/trend
"""

import sys
from datetime import datetime, timezone, timedelta, date
from fastapi import HTTPException
import app.main as m

# Isolated test employee prefix
TEST_PREFIX = "EMP88"
DEPT_A = "Phase4DeptA"
DEPT_B = "Phase4DeptB"

def cleanup():
    """Cleans up only Phase 4 test records."""
    m.db.employees.delete_many({"emp_code": {"$regex": f"^{TEST_PREFIX}"}})
    m.db.attendance_logs.delete_many({"emp_code": {"$regex": f"^{TEST_PREFIX}"}})

def run_tests():
    cleanup()
    print("=== STARTING PHASE 4 ANALYTICS TESTS ===\n")
    tests_passed = 0
    tests_failed = 0

    try:
        # Setup Test Employees
        # E1: Dept A, joined 2026-07-06 (mid-month joiner)
        e1_code = f"{TEST_PREFIX}01"
        m.create_employee(m.EmployeeCreate(
            emp_code=e1_code,
            name="Alice",
            email="alice@phase4.com",
            department=DEPT_A,
            shift_start="09:30",
            shift_end="18:30",
            joined_on="2026-07-06"
        ))

        # E2: Dept A, joined 2026-01-01 (full month, has 0 logs)
        e2_code = f"{TEST_PREFIX}02"
        m.create_employee(m.EmployeeCreate(
            emp_code=e2_code,
            name="Bob",
            email="bob@phase4.com",
            department=DEPT_A,
            shift_start="09:30",
            shift_end="18:30",
            joined_on="2026-01-01"
        ))

        # E3: Dept A, joined 2026-08-01 (future joiner for July 2026)
        e3_code = f"{TEST_PREFIX}03"
        m.create_employee(m.EmployeeCreate(
            emp_code=e3_code,
            name="Charlie",
            email="charlie@phase4.com",
            department=DEPT_A,
            shift_start="09:30",
            shift_end="18:30",
            joined_on="2026-08-01"
        ))

        # E4 & E5: Dept B (for leaderboard & summary)
        e4_code = f"{TEST_PREFIX}04"
        m.create_employee(m.EmployeeCreate(
            emp_code=e4_code,
            name="Diana",
            email="diana@phase4.com",
            department=DEPT_B,
            shift_start="09:30",
            shift_end="18:30",
            joined_on="2026-01-01"
        ))
        e5_code = f"{TEST_PREFIX}05"
        m.create_employee(m.EmployeeCreate(
            emp_code=e5_code,
            name="Evan",
            email="evan@phase4.com",
            department=DEPT_B,
            shift_start="09:30",
            shift_end="18:30",
            joined_on="2026-01-01"
        ))

        # Seed attendance records for E1 in July 2026:
        # Day 1: 2026-07-06 (Mon) - Full day present, on-time, 9.0 hrs
        m.db.attendance_logs.insert_one({
            "emp_code": e1_code,
            "date": "2026-07-06",
            "status": "PRESENT",
            "punch_in": datetime(2026, 7, 6, 4, 0, 0, tzinfo=timezone.utc),
            "punch_out": datetime(2026, 7, 6, 13, 0, 0, tzinfo=timezone.utc),
            "work_hours": 9.0,
            "late_minutes": 0,
            "overtime_minutes": 0,
            "half_day": False,
            "history": []
        })

        # Day 2: 2026-07-07 (Tue) - Half day WFH (3.5h), 35 min late
        m.db.attendance_logs.insert_one({
            "emp_code": e1_code,
            "date": "2026-07-07",
            "status": "WFH",
            "punch_in": datetime(2026, 7, 7, 4, 35, 0, tzinfo=timezone.utc),
            "punch_out": datetime(2026, 7, 7, 8, 5, 0, tzinfo=timezone.utc),
            "work_hours": 3.5,
            "late_minutes": 35,
            "overtime_minutes": 0,
            "half_day": True,
            "history": []
        })

        # Day 3: 2026-07-08 (Wed) - LEAVE
        m.db.attendance_logs.insert_one({
            "emp_code": e1_code,
            "date": "2026-07-08",
            "status": "LEAVE",
            "punch_in": None,
            "punch_out": None,
            "work_hours": None,
            "late_minutes": 0,
            "overtime_minutes": 0,
            "half_day": False,
            "history": []
        })

        # Day 4: 2026-07-11 (Saturday - Weekend!)
        # Per R7: Weekend records add to late_minutes & overtime, but DO NOT count in present_days!
        m.db.attendance_logs.insert_one({
            "emp_code": e1_code,
            "date": "2026-07-11",
            "status": "PRESENT",
            "punch_in": datetime(2026, 7, 11, 4, 15, 0, tzinfo=timezone.utc),
            "punch_out": datetime(2026, 7, 11, 14, 0, 0, tzinfo=timezone.utc),
            "work_hours": 9.75,
            "late_minutes": 15,
            "overtime_minutes": 60,
            "half_day": False,
            "history": []
        })

        # Leaderboard late minute setups for Dept B:
        # E4: 50 late minutes
        m.db.attendance_logs.insert_one({
            "emp_code": e4_code,
            "date": "2026-07-06",
            "status": "PRESENT",
            "punch_in": datetime(2026, 7, 6, 4, 50, 0, tzinfo=timezone.utc),
            "punch_out": datetime(2026, 7, 6, 13, 0, 0, tzinfo=timezone.utc),
            "work_hours": 8.17,
            "late_minutes": 50,
            "overtime_minutes": 0,
            "half_day": False,
            "history": []
        })
        # E5: 35 late minutes (tied with E1 on late minutes!)
        m.db.attendance_logs.insert_one({
            "emp_code": e5_code,
            "date": "2026-07-06",
            "status": "PRESENT",
            "punch_in": datetime(2026, 7, 6, 4, 35, 0, tzinfo=timezone.utc),
            "punch_out": datetime(2026, 7, 6, 13, 0, 0, tzinfo=timezone.utc),
            "work_hours": 8.42,
            "late_minutes": 35,
            "overtime_minutes": 0,
            "half_day": False,
            "history": []
        })

        # -------------------------------------------------------------
        # 1. TEST EMPLOYEE MONTHLY SUMMARY
        # -------------------------------------------------------------
        print("--- Testing GET /analytics/employees/{emp_code}/monthly ---")

        # 1.1 Valid monthly summary for E1
        # Joined 2026-07-06 (Monday). Month ends 2026-07-31 (Friday).
        # Weekdays between 2026-07-06 and 2026-07-31 = 20 working days!
        # present_days: Day 1 (1.0) + Day 2 (0.5) + Weekend Day 4 (0.0) = 1.5 present days!
        # leave_days: 1
        # late_count: Day 2 (35m) + Weekend Day 4 (15m) = 2
        # total_late_minutes: 35 + 15 = 50
        # total_overtime_minutes: 60
        # attendance_pct: 1.5 / 20 * 100 = 7.50%
        res_m1 = m.employee_monthly(emp_code=e1_code, month="2026-07")
        assert res_m1["working_days"] == 20, f"Expected 20 working days, got {res_m1['working_days']}"
        assert res_m1["present_days"] == 1.5, f"Expected 1.5 present days, got {res_m1['present_days']}"
        assert res_m1["leave_days"] == 1, f"Expected 1 leave day, got {res_m1['leave_days']}"
        assert res_m1["late_count"] == 2, f"Expected late_count 2, got {res_m1['late_count']}"
        assert res_m1["total_late_minutes"] == 50, f"Expected 50 late minutes, got {res_m1['total_late_minutes']}"
        assert res_m1["total_overtime_minutes"] == 60, f"Expected 60 overtime minutes, got {res_m1['total_overtime_minutes']}"
        assert res_m1["attendance_pct"] == 7.5, f"Expected 7.50 attendance_pct, got {res_m1['attendance_pct']}"
        print("[TEST 1.1 PASSED] Monthly summary matches all R5-R7 rules and weekend exclusions")
        tests_passed += 1

        # 1.2 Employee with 0 logs (E2)
        # Full month July 2026 (July 1 to July 31) has 23 working days.
        # Has 0 logs -> present_days=0.0, attendance_pct=0.0
        res_m2 = m.employee_monthly(emp_code=e2_code, month="2026-07")
        assert res_m2["working_days"] == 23
        assert res_m2["present_days"] == 0.0
        assert res_m2["attendance_pct"] == 0.0
        print("[TEST 1.2 PASSED] Employee with zero logs handled with 0.0% attendance")
        tests_passed += 1

        # 1.3 Future joiner (E3 joined August 2026)
        # For July 2026: working_days = 0, attendance_pct = None
        res_m3 = m.employee_monthly(emp_code=e3_code, month="2026-07")
        assert res_m3["working_days"] == 0
        assert res_m3["attendance_pct"] is None
        print("[TEST 1.3 PASSED] Future joiner has 0 working days and null attendance_pct")
        tests_passed += 1

        # 1.4 Unknown employee returns 404
        try:
            m.employee_monthly(emp_code=f"{TEST_PREFIX}99", month="2026-07")
            assert False, "Expected 404 for unknown employee"
        except HTTPException as e:
            assert e.status_code == 404
            print("[TEST 1.4 PASSED] Unknown employee returned 404")
            tests_passed += 1

        # -------------------------------------------------------------
        # 2. TEST DEPARTMENT SUMMARY
        # -------------------------------------------------------------
        print("\n--- Testing GET /analytics/departments/summary ---")

        # In July 2026:
        # Dept A headcount: E1 (joined July 6) + E2 (joined Jan 1) = 2 (E3 joined August 1 -> excluded per R9!)
        # Dept A present_days: 1.5
        # Dept A avg_work_hours: mean of records with work_hours: (9.0 + 3.5 + 9.75) / 3 = 22.25 / 3 = 7.4166 -> 7.42!
        # Dept A late_count: 2, total_late_minutes: 50, leave_count: 1
        res_ds = m.department_summary(month="2026-07")
        items = {d["department"]: d for d in res_ds["items"] if d["department"].startswith("Phase4")}
        assert DEPT_A in items, "Dept A should be present"
        d_a = items[DEPT_A]
        assert d_a["headcount"] == 2, f"Expected headcount 2 (E1, E2), got {d_a['headcount']}"
        assert d_a["present_days"] == 1.5, f"Expected present_days 1.5, got {d_a['present_days']}"
        assert d_a["avg_work_hours"] == 7.42, f"Expected avg_work_hours 7.42, got {d_a['avg_work_hours']}"
        assert d_a["late_count"] == 2
        assert d_a["total_late_minutes"] == 50
        assert d_a["leave_count"] == 1
        print("[TEST 2.1 PASSED] Department summary correctly computes headcount (R9) and average work hours")
        tests_passed += 1

        # 2.2 Filter by department query parameter
        res_filtered = m.department_summary(month="2026-07", department=DEPT_A)
        filtered_items = res_filtered["items"]
        assert len(filtered_items) == 1
        assert filtered_items[0]["department"] == DEPT_A
        print("[TEST 2.2 PASSED] Filter by department query param works")
        tests_passed += 1

        # -------------------------------------------------------------
        # 3. TEST LATE LEADERBOARD (WITH COMPETITION RANKING TIES)
        # -------------------------------------------------------------
        print("\n--- Testing GET /analytics/leaderboard/late ---")

        # Month: 2026-07 across all departments:
        # Late totals:
        # E1: 50 min
        # E4: 50 min (tied with E1!)
        # E5: 35 min
        # Competition ranking:
        # Rank 1: E1 (50 min) & E4 (50 min) [tied, share rank 1]
        # Next rank skipped: Rank 3: E5 (35 min)! (1, 1, 3 ranking)
        res_lb = m.late_leaderboard(month="2026-07", limit=10)
        lb_items = [item for item in res_lb["items"] if item["emp_code"].startswith(TEST_PREFIX)]
        assert len(lb_items) >= 3
        # Check ranks
        rank_map = {item["emp_code"]: item["rank"] for item in lb_items}
        assert rank_map[e1_code] == 1, f"Expected rank 1 for E1, got {rank_map[e1_code]}"
        assert rank_map[e4_code] == 1, f"Expected rank 1 for E4, got {rank_map[e4_code]}"
        assert rank_map[e5_code] == 3, f"Expected rank 3 for E5 (skipped rank 2), got {rank_map[e5_code]}"
        print("[TEST 3.1 PASSED] Standard competition ranking ($rank) correctly handles ties and skips next rank (1, 1, 3)")
        tests_passed += 1

        # 3.2 Limit cutoff tie test:
        # With limit=1, both E1 and E4 (rank 1) must be returned! (Total items returned = 2 > limit=1)
        res_lb_lim1 = m.late_leaderboard(month="2026-07", limit=1)
        lim1_items = [item for item in res_lb_lim1["items"] if item["emp_code"].startswith(TEST_PREFIX)]
        assert len(lim1_items) == 2, f"Expected 2 tied items returned for limit 1, got {len(lim1_items)}"
        assert all(item["rank"] <= 1 for item in lim1_items)
        print("[TEST 3.2 PASSED] Limit applied after ranking correctly returns all tied rows at cutoff")
        tests_passed += 1

        # 3.3 Filter by department
        res_lb_dept = m.late_leaderboard(month="2026-07", limit=10, department=DEPT_B)
        dept_b_items = [item for item in res_lb_dept["items"] if item["emp_code"].startswith(TEST_PREFIX)]
        assert all(item["department"] == DEPT_B for item in dept_b_items)
        assert len(dept_b_items) == 2  # E4 (50 min, rank 1), E5 (35 min, rank 2)
        assert dept_b_items[0]["rank"] == 1
        assert dept_b_items[1]["rank"] == 2
        print("[TEST 3.3 PASSED] Ranking inside department works")
        tests_passed += 1

        # -------------------------------------------------------------
        # 4. TEST DEPARTMENT TREND (GAP FILLING & 7-DAY MOVING AVERAGE)
        # -------------------------------------------------------------
        print("\n--- Testing GET /analytics/departments/{department}/trend ---")

        # Date range: 2026-07-06 (Mon) to 2026-07-12 (Sun) -> 7 consecutive calendar days
        # Dept A has logs on July 6 (1.0), July 7 (0.5), July 8 (LEAVE=0.0), July 11 (weekend=1.0)
        # Days with 0 logs (July 9, July 10, July 12) MUST be present via gap filling ($densify)!
        res_trend = m.department_trend(department=DEPT_A, date_from="2026-07-06", date_to="2026-07-12")
        trend_items = res_trend["items"]
        assert len(trend_items) == 7, f"Expected exactly 7 calendar days, got {len(trend_items)}"

        dates_present = [item["date"] for item in trend_items]
        expected_dates = ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-12"]
        assert dates_present == expected_dates, f"Gap filling failed: {dates_present}"

        # Working day flags: July 6..10 are working days (Mon-Fri); July 11..12 are False (Sat-Sun)
        assert [item["is_working_day"] for item in trend_items] == [True, True, True, True, True, False, False]

        # Headcount on each day:
        # On July 6: E1 joined on July 6, E2 joined Jan 1 -> Headcount = 2!
        # Headcount is 2 for all days July 6..12
        assert all(item["headcount"] == 2 for item in trend_items)

        # Rates:
        # July 6 (Mon): present_count = 1.0, headcount = 2 -> attendance_rate = 1.0 / 2 = 0.5000
        # July 7 (Tue): present_count = 0.5, headcount = 2 -> attendance_rate = 0.5 / 2 = 0.2500
        # July 8 (Wed): present_count = 0.0 (LEAVE), headcount = 2 -> attendance_rate = 0.0000
        # July 9 (Thu): 0 logs -> attendance_rate = 0.0000
        # July 10 (Fri): 0 logs -> attendance_rate = 0.0000
        # July 11 (Sat - weekend): attendance_rate = None (null on weekends per spec!)
        # July 12 (Sun - weekend): attendance_rate = None
        rates = [item["attendance_rate"] for item in trend_items]
        assert rates[0] == 0.5000, f"Expected 0.5000, got {rates[0]}"
        assert rates[1] == 0.2500, f"Expected 0.2500, got {rates[1]}"
        assert rates[2] == 0.0000, f"Expected 0.0000, got {rates[2]}"
        assert rates[3] == 0.0000, f"Expected 0.0000, got {rates[3]}"
        assert rates[4] == 0.0000, f"Expected 0.0000, got {rates[4]}"
        assert rates[5] is None, f"Expected None on Saturday, got {rates[5]}"
        assert rates[6] is None, f"Expected None on Sunday, got {rates[6]}"

        # 7-day Moving average verification:
        # Day 1 (July 6): window holds [0.5000] -> avg = 0.5000
        # Day 2 (July 7): window holds [0.5000, 0.2500] -> avg = 0.3750
        # Day 3 (July 8): window holds [0.5000, 0.2500, 0.0000] -> avg = 0.2500
        # Day 4 (July 9): window holds [0.5, 0.25, 0.0, 0.0] -> avg = 0.1875
        # Day 5 (July 10): window holds [0.5, 0.25, 0.0, 0.0, 0.0] -> avg = 0.1500
        # Day 6 (July 11 - Sat): window holds non-null rates -> mean of [0.5, 0.25, 0.0, 0.0, 0.0] = 0.1500
        # Day 7 (July 12 - Sun): mean of [0.5, 0.25, 0.0, 0.0, 0.0] = 0.1500
        mov_avgs = [item["moving_avg_7d"] for item in trend_items]
        assert mov_avgs[0] == 0.5000, f"Expected 0.5000, got {mov_avgs[0]}"
        assert mov_avgs[1] == 0.3750, f"Expected 0.3750, got {mov_avgs[1]}"
        assert mov_avgs[2] == 0.2500, f"Expected 0.2500, got {mov_avgs[2]}"
        assert mov_avgs[3] == 0.1875, f"Expected 0.1875, got {mov_avgs[3]}"
        assert mov_avgs[4] == 0.1500, f"Expected 0.1500, got {mov_avgs[4]}"
        print("[TEST 4.1 PASSED] Trend gap-filling ($densify), rate calculation, and moving average ($setWindowFields) verified")
        tests_passed += 1

        # 4.2 Error 404 on unknown department
        try:
            m.department_trend(department="NonExistentDept", date_from="2026-07-01", date_to="2026-07-05")
            assert False, "Expected 404 for unknown department"
        except HTTPException as e:
            assert e.status_code == 404
            print("[TEST 4.2 PASSED] Unknown department returned 404")
            tests_passed += 1

        # 4.3 Error 422 if date_to < date_from
        try:
            m.department_trend(department=DEPT_A, date_from="2026-07-10", date_to="2026-07-01")
            assert False, "Expected 422 for to < from"
        except HTTPException as e:
            assert e.status_code == 422
            print("[TEST 4.3 PASSED] to < from returned 422")
            tests_passed += 1

        # 4.4 Error 422 if date range > 92 days
        try:
            m.department_trend(department=DEPT_A, date_from="2026-01-01", date_to="2026-04-10")
            assert False, "Expected 422 for range > 92 days"
        except HTTPException as e:
            assert e.status_code == 422
            print("[TEST 4.4 PASSED] Range > 92 days returned 422")
            tests_passed += 1

    except Exception as e:
        print(f"\n[UNEXPECTED FAILURE] {e}")
        import traceback
        traceback.print_exc()
        tests_failed += 1
    finally:
        cleanup()
        print("\nCleanup completed: Test records removed.")

    print(f"\n=== PHASE 4 TEST SUMMARY: {tests_passed} PASSED, {tests_failed} FAILED ===")
    if tests_failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
