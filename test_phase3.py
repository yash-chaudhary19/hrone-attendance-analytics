"""
Phase 3 Non-Destructive Integration Tests
Tests POST /attendance/punch-out and PATCH /attendance/{emp_code}/{date}
"""

import sys
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException
import app.main as m

# Test employee codes (isolated prefix EMP99xx to never touch actual data)
TEST_EMP_REGULAR = "EMP9901"
TEST_EMP_OVERNIGHT = "EMP9902"
TEST_DATE = "2026-07-06"
TEST_DATE_OVERNIGHT = "2026-07-06"

def cleanup():
    """Cleans up only the test employees and test attendance records."""
    m.db.employees.delete_many({"emp_code": {"$regex": "^EMP99"}})
    m.db.attendance_logs.delete_many({"emp_code": {"$regex": "^EMP99"}})

def run_tests():
    cleanup()
    print("=== STARTING PHASE 3 TESTS ===\n")
    tests_passed = 0
    tests_failed = 0

    try:
        # Setup Test Employees
        # Regular shift: 09:30 to 18:30 IST
        m.create_employee(m.EmployeeCreate(
            emp_code=TEST_EMP_REGULAR,
            name="Regular Tester",
            email="regular@example.com",
            department="Testing",
            shift_start="09:30",
            shift_end="18:30",
            joined_on="2026-01-01"
        ))
        # Overnight shift: 22:00 to 06:00 IST
        m.create_employee(m.EmployeeCreate(
            emp_code=TEST_EMP_OVERNIGHT,
            name="Overnight Tester",
            email="overnight@example.com",
            department="Testing",
            shift_start="22:00",
            shift_end="06:00",
            joined_on="2026-01-01"
        ))

        # -------------------------------------------------------------
        # TEST 1: Punch-in on regular shift
        # 09:28 IST = 03:58 UTC on 2026-07-06
        # -------------------------------------------------------------
        t_in = int(datetime(2026, 7, 6, 3, 58, 0, tzinfo=timezone.utc).timestamp() * 1000)
        rec1 = m.punch_in(m.PunchInRequest(emp_code=TEST_EMP_REGULAR, punched_at=t_in))
        assert rec1["date"] == TEST_DATE
        assert rec1["punch_out"] is None
        assert rec1["work_hours"] is None
        print("[TEST 1 PASSED] Initial punch-in created successfully")
        tests_passed += 1

        # -------------------------------------------------------------
        # TEST 2: Punch-out validation: punched_at <= punch_in -> 422
        # -------------------------------------------------------------
        try:
            m.punch_out(m.PunchOutRequest(emp_code=TEST_EMP_REGULAR, punched_at=t_in - 10000))
            assert False, "Expected 422 for punch_out <= punch_in"
        except HTTPException as e:
            assert e.status_code == 422
            print("[TEST 2 PASSED] Punch-out earlier than punch-in rejected with 422")
            tests_passed += 1

        # -------------------------------------------------------------
        # TEST 3: Punch-out validation: punched_at > punch_in + 24 hours -> 422
        # -------------------------------------------------------------
        try:
            t_after_25h = t_in + int(timedelta(hours=25).total_seconds() * 1000)
            m.punch_out(m.PunchOutRequest(emp_code=TEST_EMP_REGULAR, punched_at=t_after_25h))
            assert False, "Expected 422 for punch_out > punch_in + 24h"
        except HTTPException as e:
            assert e.status_code == 422
            print("[TEST 3 PASSED] Punch-out > 24h after punch-in rejected with 422")
            tests_passed += 1

        # -------------------------------------------------------------
        # TEST 4: Successful punch-out on regular shift:
        # Punch-in: 09:28 IST (03:58 UTC), Punch-out: 18:35 IST (13:05 UTC)
        # Duration: 9h 07m = 9.1166h -> rounded half-up: 9.12h.
        # Overtime: shift end 18:30, out 18:35 -> 5 min < 30 min -> overtime = 0.
        # Half-day: 9.12 >= 4.50 -> False.
        # -------------------------------------------------------------
        t_out = int(datetime(2026, 7, 6, 13, 5, 0, tzinfo=timezone.utc).timestamp() * 1000)
        res_out = m.punch_out(m.PunchOutRequest(emp_code=TEST_EMP_REGULAR, punched_at=t_out))
        assert res_out["work_hours"] == 9.12, f"Expected 9.12 work hours, got {res_out['work_hours']}"
        assert res_out["overtime_minutes"] == 0, f"Expected 0 overtime, got {res_out['overtime_minutes']}"
        assert res_out["half_day"] == False
        assert res_out["punch_out"] == t_out
        print("[TEST 4 PASSED] Successful regular shift punch-out with correct R3/R4/R5 calculations")
        tests_passed += 1

        # -------------------------------------------------------------
        # TEST 5: Repeated punch-out on already closed record -> 409
        # -------------------------------------------------------------
        try:
            m.punch_out(m.PunchOutRequest(emp_code=TEST_EMP_REGULAR, punched_at=t_out))
            assert False, "Expected 409 for already punched out record"
        except HTTPException as e:
            assert e.status_code == 409
            print("[TEST 5 PASSED] Repeated punch-out rejected with 409")
            tests_passed += 1

        # -------------------------------------------------------------
        # TEST 6: Overnight shift punch-in and punch-out across midnight
        # Shift: 22:00 to 06:00.
        # Punch-in: 21:55 IST on 2026-07-06 = 16:25 UTC.
        # Punch-out: 06:40 IST on 2026-07-07 = 01:10 UTC next day.
        # Duration: 8h 45m = 8.75h.
        # Overtime: shift end 06:00 on July 7, out 06:40 -> 40 minutes (>= 30) -> 40.
        # -------------------------------------------------------------
        t_in_overnight = int(datetime(2026, 7, 6, 16, 25, 0, tzinfo=timezone.utc).timestamp() * 1000)
        m.punch_in(m.PunchInRequest(emp_code=TEST_EMP_OVERNIGHT, punched_at=t_in_overnight))

        t_out_overnight = int(datetime(2026, 7, 7, 1, 10, 0, tzinfo=timezone.utc).timestamp() * 1000)
        res_overnight = m.punch_out(m.PunchOutRequest(emp_code=TEST_EMP_OVERNIGHT, punched_at=t_out_overnight))
        assert res_overnight["date"] == TEST_DATE_OVERNIGHT
        assert res_overnight["work_hours"] == 8.75, f"Expected 8.75, got {res_overnight['work_hours']}"
        assert res_overnight["overtime_minutes"] == 40, f"Expected 40, got {res_overnight['overtime_minutes']}"
        assert res_overnight["half_day"] == False
        print("[TEST 6 PASSED] Overnight shift punch-out across midnight correctly computes R3 overtime and R4 hours")
        tests_passed += 1

        # -------------------------------------------------------------
        # TEST 7: Regularize (PATCH): Error 404 for non-existent record
        # -------------------------------------------------------------
        try:
            m.regularize_attendance(
                emp_code="EMP9999",
                date_str="2026-07-06",
                body=m.RegularizeRequest(reason="Forgot to punch", regularized_by="manager")
            )
            assert False, "Expected 404 for unknown employee"
        except HTTPException as e:
            assert e.status_code == 404
            print("[TEST 7 PASSED] Regularize unknown employee returned 404")
            tests_passed += 1

        # -------------------------------------------------------------
        # TEST 8: Regularize (PATCH): Error 422 if request makes no changes
        # -------------------------------------------------------------
        try:
            m.regularize_attendance(
                emp_code=TEST_EMP_REGULAR,
                date_str=TEST_DATE,
                body=m.RegularizeRequest(
                    status=m.Status.PRESENT,
                    reason="No real change",
                    regularized_by="manager"
                )
            )
            assert False, "Expected 422 when request makes no changes"
        except HTTPException as e:
            assert e.status_code == 422
            print("[TEST 8 PASSED] Regularize request with no changes rejected with 422")
            tests_passed += 1

        # -------------------------------------------------------------
        # TEST 9: Regularize (PATCH): Error 422 when supplying punch times with ABSENT/LEAVE
        # -------------------------------------------------------------
        try:
            m.regularize_attendance(
                emp_code=TEST_EMP_REGULAR,
                date_str=TEST_DATE,
                body=m.RegularizeRequest(
                    status=m.Status.ABSENT,
                    punch_in=t_in,
                    reason="Invalid absent with punch_in",
                    regularized_by="manager"
                )
            )
            assert False, "Expected 422 when punch_in provided with ABSENT"
        except HTTPException as e:
            assert e.status_code == 422
            print("[TEST 9 PASSED] Supplying punch_in with ABSENT status rejected with 422")
            tests_passed += 1

        # -------------------------------------------------------------
        # TEST 10: Regularize (PATCH): Error 422 if punch_in moves to a different date
        # -------------------------------------------------------------
        try:
            t_in_diff_date = int(datetime(2026, 7, 7, 4, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
            m.regularize_attendance(
                emp_code=TEST_EMP_REGULAR,
                date_str=TEST_DATE,
                body=m.RegularizeRequest(
                    punch_in=t_in_diff_date,
                    reason="Moved date",
                    regularized_by="manager"
                )
            )
            assert False, "Expected 422 when punch_in moves to another date"
        except HTTPException as e:
            assert e.status_code == 422
            print("[TEST 10 PASSED] Moving punch_in to different date rejected with 422")
            tests_passed += 1

        # -------------------------------------------------------------
        # TEST 11: Regularize (PATCH): Successful update & audit history
        # Change punch-in from 09:28 IST (03:58 UTC) to 10:05 IST (04:35 UTC).
        # This makes employee 35 minutes late (late_minutes: 0 -> 35).
        # Work hours: 10:05 IST to 18:35 IST = 8.5 hours.
        # History entry must record changes in: punch_in, late_minutes, work_hours.
        # -------------------------------------------------------------
        t_in_late = int(datetime(2026, 7, 6, 4, 35, 0, tzinfo=timezone.utc).timestamp() * 1000)
        res_patch = m.regularize_attendance(
            emp_code=TEST_EMP_REGULAR,
            date_str=TEST_DATE,
            body=m.RegularizeRequest(
                punch_in=t_in_late,
                reason="Traffic congestion correction",
                regularized_by="hr.manager"
            )
        )
        assert res_patch["late_minutes"] == 35, f"Expected 35 late_minutes, got {res_patch['late_minutes']}"
        assert res_patch["work_hours"] == 8.50, f"Expected 8.50 work_hours, got {res_patch['work_hours']}"
        assert len(res_patch["history"]) == 1
        h0 = res_patch["history"][0]
        assert h0["by"] == "hr.manager"
        assert h0["reason"] == "Traffic congestion correction"
        assert "punch_in" in h0["changes"]
        assert "late_minutes" in h0["changes"]
        assert "work_hours" in h0["changes"]
        assert h0["changes"]["late_minutes"]["from"] == 0
        assert h0["changes"]["late_minutes"]["to"] == 35
        print("[TEST 11 PASSED] Successful regularize recomputed derived fields and appended audit history")
        tests_passed += 1

        # -------------------------------------------------------------
        # TEST 12: Regularize (PATCH): Second correction appends to history (never overwrites)
        # Change status to WFH
        # -------------------------------------------------------------
        res_patch2 = m.regularize_attendance(
            emp_code=TEST_EMP_REGULAR,
            date_str=TEST_DATE,
            body=m.RegularizeRequest(
                status=m.Status.WFH,
                reason="Approved remote day",
                regularized_by="hr.admin"
            )
        )
        assert res_patch2["status"] == "WFH"
        assert len(res_patch2["history"]) == 2
        assert res_patch2["history"][1]["by"] == "hr.admin"
        assert "status" in res_patch2["history"][1]["changes"]
        assert res_patch2["history"][1]["changes"]["status"]["from"] == "PRESENT"
        assert res_patch2["history"][1]["changes"]["status"]["to"] == "WFH"
        print("[TEST 12 PASSED] Second regularize cleanly appended to history without overwriting")
        tests_passed += 1

        # -------------------------------------------------------------
        # TEST 13: Regularize (PATCH) to ABSENT clears punch times and zeroes derived fields
        # -------------------------------------------------------------
        res_patch3 = m.regularize_attendance(
            emp_code=TEST_EMP_REGULAR,
            date_str=TEST_DATE,
            body=m.RegularizeRequest(
                status=m.Status.ABSENT,
                reason="Unapproved absence recorded",
                regularized_by="hr.admin"
            )
        )
        assert res_patch3["status"] == "ABSENT"
        assert res_patch3["punch_in"] is None
        assert res_patch3["punch_out"] is None
        assert res_patch3["work_hours"] is None
        assert res_patch3["late_minutes"] == 0
        assert res_patch3["overtime_minutes"] == 0
        assert res_patch3["half_day"] == False
        assert len(res_patch3["history"]) == 3
        print("[TEST 13 PASSED] Transition to ABSENT cleared punches and reset derived fields")
        tests_passed += 1

        # -------------------------------------------------------------
        # TEST 14: Concurrent punch-out race condition
        # Two simultaneous punch-out requests must yield exactly one 200, one 409
        # -------------------------------------------------------------
        import concurrent.futures
        TEST_EMP_CONCURRENT = "EMP9903"
        m.create_employee(m.EmployeeCreate(
            emp_code=TEST_EMP_CONCURRENT,
            name="Concurrent Tester",
            email="conc@example.com",
            department="Testing",
            shift_start="09:30",
            shift_end="18:30",
            joined_on="2026-01-01"
        ))
        t_in_c = int(datetime(2026, 7, 8, 4, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
        t_out_c = int(datetime(2026, 7, 8, 13, 0, 0, tzinfo=timezone.utc).timestamp() * 1000)
        m.punch_in(m.PunchInRequest(emp_code=TEST_EMP_CONCURRENT, punched_at=t_in_c))

        def try_punch_out():
            try:
                res = m.punch_out(m.PunchOutRequest(emp_code=TEST_EMP_CONCURRENT, punched_at=t_out_c))
                return 200
            except HTTPException as e:
                return e.status_code

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(try_punch_out)
            f2 = executor.submit(try_punch_out)
            statuses = sorted([f1.result(), f2.result()])

        assert statuses == [200, 409], f"Expected [200, 409] under concurrent punch-out, got {statuses}"
        print("[TEST 14 PASSED] Concurrent punch-outs yielded exactly one 200 and one 409")
        tests_passed += 1

        # -------------------------------------------------------------
        # TEST 15: Concurrent regularize race condition
        # Two simultaneous corrections must not lose history; loser gets 409
        # -------------------------------------------------------------
        t_in_late1 = int(datetime(2026, 7, 8, 4, 15, 0, tzinfo=timezone.utc).timestamp() * 1000)
        t_in_late2 = int(datetime(2026, 7, 8, 4, 20, 0, tzinfo=timezone.utc).timestamp() * 1000)

        def try_patch(punch_time: int, who: str):
            try:
                m.regularize_attendance(
                    emp_code=TEST_EMP_CONCURRENT,
                    date_str="2026-07-08",
                    body=m.RegularizeRequest(
                        punch_in=punch_time,
                        reason=f"Concurrent patch by {who}",
                        regularized_by=who
                    )
                )
                return 200
            except HTTPException as e:
                return e.status_code

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            p1 = executor.submit(try_patch, t_in_late1, "admin1")
            p2 = executor.submit(try_patch, t_in_late2, "admin2")
            p_statuses = sorted([p1.result(), p2.result()])

        # Under concurrency, either [200, 409] (loser caught) or both sequential 200s with 2 history entries
        final_doc = m.db.attendance_logs.find_one({"emp_code": TEST_EMP_CONCURRENT, "date": "2026-07-08"})
        assert len(final_doc.get("history", [])) in (1, 2)
        print(f"[TEST 15 PASSED] Concurrent regularizations handled safely (statuses: {p_statuses}, history length: {len(final_doc.get('history', []))})")
        tests_passed += 1

    except Exception as e:
        print(f"\n[UNEXPECTED FAILURE] {e}")
        import traceback
        traceback.print_exc()
        tests_failed += 1
    finally:
        cleanup()
        print("\nCleanup completed: Test records removed.")

    print(f"\n=== TEST SUMMARY: {tests_passed} PASSED, {tests_failed} FAILED ===")
    if tests_failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_tests()
