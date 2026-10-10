"""
Phase 5 Non-Destructive Integration Tests
Tests GET /admin/explain/{endpoint} for all 5 required endpoints:
1. attendance_list
2. employee_monthly
3. department_summary
4. late_leaderboard
5. department_trend

Verifies:
- Endpoint allowlist & response schema (endpoint, collection, explain)
- Query parameters parsing & validation (missing parameters -> 422)
- MongoDB explain execution with executionStats
- Index scan presence (IXSCAN) and absence of collection scans (COLLSCAN)
- JSON serializability of raw explain documents (no BSON serialization issues)
"""

import json
import sys
from datetime import datetime, timezone, timedelta, date
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
import app.main as m

# Isolated test employee prefix to ensure non-destructive testing
TEST_PREFIX = "EMP77"
DEPT_TEST = "Phase5Dept"


def cleanup():
    """Cleans up only Phase 5 test records."""
    m.db.employees.delete_many({"emp_code": {"$regex": f"^{TEST_PREFIX}"}})
    m.db.attendance_logs.delete_many({"emp_code": {"$regex": f"^{TEST_PREFIX}"}})


def extract_stages(obj):
    """Recursively extracts all query execution stages from an explain document."""
    stages = set()
    if isinstance(obj, dict):
        if "stage" in obj:
            stages.add(obj["stage"])
        for v in obj.values():
            stages.update(extract_stages(v))
    elif isinstance(obj, list):
        for item in obj:
            stages.update(extract_stages(item))
    return stages


def verify_explain_plan(resp, expected_endpoint, expected_collection):
    """Verifies response structure, schema, and IXSCAN / COLLSCAN rules."""
    # 1. Pydantic validation
    validated = m.ExplainResponse.model_validate(resp)
    assert validated.endpoint == expected_endpoint, f"Expected endpoint {expected_endpoint}, got {validated.endpoint}"
    assert validated.collection == expected_collection, f"Expected collection {expected_collection}, got {validated.collection}"

    # 2. JSON serializability
    encoded = jsonable_encoder(resp)
    dumped = json.dumps(encoded)
    assert len(dumped) > 0, "Serialized JSON should not be empty"

    # 3. Execution stats & plan inspection
    explain_data = resp["explain"]
    stages = extract_stages(explain_data)
    
    # Check for IXSCAN
    has_ixscan = any("IXSCAN" in s or s == "ixseek" or "ixscan" in s.lower() for s in stages)
    # Check for COLLSCAN
    has_collscan = any("COLLSCAN" in s for s in stages)

    return stages, has_ixscan, has_collscan


def run_tests():
    cleanup()
    print("=== STARTING PHASE 5 EXPLAIN TESTS ===\n")
    tests_passed = 0
    tests_failed = 0

    try:
        # Create minimal test data for testing queries
        emp_code = f"{TEST_PREFIX}01"
        m.create_employee(m.EmployeeCreate(
            emp_code=emp_code,
            name="Charlie Phase5",
            email="charlie@phase5.com",
            department=DEPT_TEST,
            shift_start="09:30",
            shift_end="18:30",
            joined_on="2026-01-01"
        ))

        # Insert test attendance record
        m.db.attendance_logs.insert_one({
            "emp_code": emp_code,
            "date": "2026-03-10",
            "status": "PRESENT",
            "punch_in": datetime(2026, 3, 10, 4, 0, 0, tzinfo=timezone.utc),
            "punch_out": datetime(2026, 3, 10, 13, 0, 0, tzinfo=timezone.utc),
            "work_hours": 9.0,
            "late_minutes": 15,
            "overtime_minutes": 0,
            "half_day": False,
            "history": []
        })

        # ---------------------------------------------------------------------
        # TEST 1: attendance_list explain
        # ---------------------------------------------------------------------
        print("Test 1.1: attendance_list default query explain")
        resp = m.explain_endpoint(m.ExplainTarget.attendance_list)
        stages, has_ixscan, has_collscan = verify_explain_plan(resp, "attendance_list", "attendance_logs")
        assert has_ixscan, f"attendance_list should use IXSCAN. Stages found: {stages}"
        assert not has_collscan, f"attendance_list must NOT contain COLLSCAN. Stages found: {stages}"
        tests_passed += 1
        print(f"  PASS: IXSCAN={has_ixscan}, COLLSCAN={has_collscan}, stages={sorted(stages)}")

        print("Test 1.2: attendance_list with filters (emp_code, date range, status, page, page_size)")
        resp = m.explain_endpoint(
            m.ExplainTarget.attendance_list,
            emp_code=emp_code,
            date_from="2026-03-01",
            date_to="2026-03-31",
            status_filter=m.Status.PRESENT,
            page=1,
            page_size=10
        )
        stages, has_ixscan, has_collscan = verify_explain_plan(resp, "attendance_list", "attendance_logs")
        assert has_ixscan, f"Filtered attendance_list should use IXSCAN. Stages: {stages}"
        assert not has_collscan, f"Filtered attendance_list must NOT contain COLLSCAN. Stages: {stages}"
        tests_passed += 1
        print(f"  PASS: IXSCAN={has_ixscan}, COLLSCAN={has_collscan}")

        print("Test 1.3: attendance_list validation error (date_from > date_to -> 422)")
        try:
            m.explain_endpoint(
                m.ExplainTarget.attendance_list,
                date_from="2026-03-31",
                date_to="2026-03-01"
            )
            assert False, "Should have raised 422"
        except HTTPException as e:
            assert e.status_code == 422, f"Expected 422, got {e.status_code}"
            tests_passed += 1
            print("  PASS: 422 raised on invalid date range")

        # ---------------------------------------------------------------------
        # TEST 2: employee_monthly explain
        # ---------------------------------------------------------------------
        print("\nTest 2.1: employee_monthly valid explain")
        resp = m.explain_endpoint(
            m.ExplainTarget.employee_monthly,
            emp_code=emp_code,
            month="2026-03"
        )
        stages, has_ixscan, has_collscan = verify_explain_plan(resp, "employee_monthly", "attendance_logs")
        assert has_ixscan, f"employee_monthly should use IXSCAN. Stages: {stages}"
        assert not has_collscan, f"employee_monthly must NOT contain COLLSCAN. Stages: {stages}"
        tests_passed += 1
        print(f"  PASS: IXSCAN={has_ixscan}, COLLSCAN={has_collscan}, stages={sorted(stages)}")

        print("Test 2.2: employee_monthly missing required parameter emp_code -> 422")
        try:
            m.explain_endpoint(m.ExplainTarget.employee_monthly, month="2026-03")
            assert False, "Should have raised 422"
        except HTTPException as e:
            assert e.status_code == 422, f"Expected 422, got {e.status_code}"
            tests_passed += 1
            print("  PASS: 422 raised on missing emp_code")

        print("Test 2.3: employee_monthly missing required parameter month -> 422")
        try:
            m.explain_endpoint(m.ExplainTarget.employee_monthly, emp_code=emp_code)
            assert False, "Should have raised 422"
        except HTTPException as e:
            assert e.status_code == 422, f"Expected 422, got {e.status_code}"
            tests_passed += 1
            print("  PASS: 422 raised on missing month")

        # ---------------------------------------------------------------------
        # TEST 3: department_summary explain
        # ---------------------------------------------------------------------
        print("\nTest 3.1: department_summary valid explain (all departments)")
        resp = m.explain_endpoint(
            m.ExplainTarget.department_summary,
            month="2026-03"
        )
        stages, has_ixscan, has_collscan = verify_explain_plan(resp, "department_summary", "employees")
        assert has_ixscan, f"department_summary should use IXSCAN. Stages: {stages}"
        assert not has_collscan, f"department_summary must NOT contain COLLSCAN. Stages: {stages}"
        tests_passed += 1
        print(f"  PASS: IXSCAN={has_ixscan}, COLLSCAN={has_collscan}, stages={sorted(stages)}")

        print("Test 3.2: department_summary valid explain (specific department)")
        resp = m.explain_endpoint(
            m.ExplainTarget.department_summary,
            month="2026-03",
            department=DEPT_TEST
        )
        stages, has_ixscan, has_collscan = verify_explain_plan(resp, "department_summary", "employees")
        assert has_ixscan, f"department_summary with dept should use IXSCAN. Stages: {stages}"
        assert not has_collscan, f"department_summary with dept must NOT contain COLLSCAN. Stages: {stages}"
        tests_passed += 1
        print(f"  PASS: IXSCAN={has_ixscan}, COLLSCAN={has_collscan}")

        print("Test 3.3: department_summary missing required parameter month -> 422")
        try:
            m.explain_endpoint(m.ExplainTarget.department_summary)
            assert False, "Should have raised 422"
        except HTTPException as e:
            assert e.status_code == 422, f"Expected 422, got {e.status_code}"
            tests_passed += 1
            print("  PASS: 422 raised on missing month")

        # ---------------------------------------------------------------------
        # TEST 4: late_leaderboard explain
        # ---------------------------------------------------------------------
        print("\nTest 4.1: late_leaderboard valid explain")
        resp = m.explain_endpoint(
            m.ExplainTarget.late_leaderboard,
            month="2026-03",
            limit=5
        )
        stages, has_ixscan, has_collscan = verify_explain_plan(resp, "late_leaderboard", "attendance_logs")
        assert has_ixscan, f"late_leaderboard should use IXSCAN. Stages: {stages}"
        assert not has_collscan, f"late_leaderboard must NOT contain COLLSCAN. Stages: {stages}"
        tests_passed += 1
        print(f"  PASS: IXSCAN={has_ixscan}, COLLSCAN={has_collscan}, stages={sorted(stages)}")

        print("Test 4.2: late_leaderboard with department filter")
        resp = m.explain_endpoint(
            m.ExplainTarget.late_leaderboard,
            month="2026-03",
            limit=5,
            department=DEPT_TEST
        )
        stages, has_ixscan, has_collscan = verify_explain_plan(resp, "late_leaderboard", "attendance_logs")
        assert has_ixscan, f"late_leaderboard with dept should use IXSCAN. Stages: {stages}"
        assert not has_collscan, f"late_leaderboard with dept must NOT contain COLLSCAN. Stages: {stages}"
        tests_passed += 1
        print(f"  PASS: IXSCAN={has_ixscan}, COLLSCAN={has_collscan}")

        print("Test 4.3: late_leaderboard missing required parameter month -> 422")
        try:
            m.explain_endpoint(m.ExplainTarget.late_leaderboard)
            assert False, "Should have raised 422"
        except HTTPException as e:
            assert e.status_code == 422, f"Expected 422, got {e.status_code}"
            tests_passed += 1
            print("  PASS: 422 raised on missing month")

        # ---------------------------------------------------------------------
        # TEST 5: department_trend explain
        # ---------------------------------------------------------------------
        print("\nTest 5.1: department_trend valid explain")
        resp = m.explain_endpoint(
            m.ExplainTarget.department_trend,
            department=DEPT_TEST,
            from_param="2026-03-01",
            to_param="2026-03-07"
        )
        stages, has_ixscan, has_collscan = verify_explain_plan(resp, "department_trend", "employees")
        assert has_ixscan, f"department_trend should use IXSCAN. Stages: {stages}"
        assert not has_collscan, f"department_trend must NOT contain COLLSCAN. Stages: {stages}"
        tests_passed += 1
        print(f"  PASS: IXSCAN={has_ixscan}, COLLSCAN={has_collscan}, stages={sorted(stages)}")

        print("Test 5.2: department_trend missing department -> 422")
        try:
            m.explain_endpoint(m.ExplainTarget.department_trend, from_param="2026-03-01", to_param="2026-03-07")
            assert False, "Should have raised 422"
        except HTTPException as e:
            assert e.status_code == 422, f"Expected 422, got {e.status_code}"
            tests_passed += 1
            print("  PASS: 422 raised on missing department")

        print("Test 5.3: department_trend missing date range -> 422")
        try:
            m.explain_endpoint(m.ExplainTarget.department_trend, department=DEPT_TEST)
            assert False, "Should have raised 422"
        except HTTPException as e:
            assert e.status_code == 422, f"Expected 422, got {e.status_code}"
            tests_passed += 1
            print("  PASS: 422 raised on missing from/to")

        print("Test 5.4: department_trend to < from -> 422")
        try:
            m.explain_endpoint(
                m.ExplainTarget.department_trend,
                department=DEPT_TEST,
                from_param="2026-03-07",
                to_param="2026-03-01"
            )
            assert False, "Should have raised 422"
        except HTTPException as e:
            assert e.status_code == 422, f"Expected 422, got {e.status_code}"
            tests_passed += 1
            print("  PASS: 422 raised on to < from")

        print("Test 5.5: department_trend range > 92 days -> 422")
        try:
            m.explain_endpoint(
                m.ExplainTarget.department_trend,
                department=DEPT_TEST,
                from_param="2026-01-01",
                to_param="2026-05-01"
            )
            assert False, "Should have raised 422"
        except HTTPException as e:
            assert e.status_code == 422, f"Expected 422, got {e.status_code}"
            tests_passed += 1
            print("  PASS: 422 raised on range > 92 days")

        # ---------------------------------------------------------------------
        # TEST 6: Response document structure & raw explain stats
        # ---------------------------------------------------------------------
        print("\nTest 6.1: Raw explain contains executionStats and ok=1")
        resp = m.explain_endpoint(m.ExplainTarget.attendance_list)
        exp_raw = resp["explain"]
        assert "executionStats" in exp_raw, "explain must contain executionStats"
        assert exp_raw.get("ok") == 1.0 or exp_raw.get("ok") == 1, "explain ok must be 1"
        tests_passed += 1
        print("  PASS: executionStats and ok status verified")

    except Exception as exc:
        print(f"\nTEST FAILED WITH EXCEPTION: {exc}")
        import traceback
        traceback.print_exc()
        tests_failed += 1
    finally:
        cleanup()

    print(f"\n=== SUMMARY: {tests_passed} PASSED, {tests_failed} FAILED ===")
    return tests_failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
