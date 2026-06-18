/**
 * department.controller.js — CrowdPulse Department Controllers  (Phase 14B)
 *
 * GET  /api/departments                →  listDepartmentsController
 * GET  /api/departments/me             →  getMyDepartmentController
 * GET  /api/departments/me/reports     →  getMyReportsController
 * GET  /api/departments/users          →  getUserDepartmentsController  (ADMIN)
 * POST /api/departments/assign-user    →  assignUserController          (ADMIN)
 * GET  /api/departments/analytics      →  deptAnalyticsController
 * GET  /api/assignments                →  listAssignmentsController     (ADMIN)
 * GET  /api/assignments/:reportId      →  getAssignmentController
 * POST /api/assignments/assign         →  manualAssignController        (ADMIN)
 */

import {
  DEPARTMENTS, DEPARTMENT_DISPLAY,
  getDepartmentForUser, setUserDepartment, getAllUserDepartments,
} from '../services/department.service.js';
import {
  getAssignments, getAssignment, assignReport,
  enrichReports, getReportsByDepartment,
} from '../services/assignment.service.js';
import { getReports } from '../services/reportCache.js';

// ─── 1. List Departments ───────────────────────────────────────────────────────

/**
 * GET /api/departments
 * Public. Returns all departments with display names, report counts, user counts.
 */
export function listDepartmentsController(_req, res) {
  try {
    const allReports  = enrichReports(getReports());
    const userDepts   = getAllUserDepartments();

    const departments = DEPARTMENTS.map(dept => {
      const deptReports = allReports.filter(r => r.department === dept);
      const userCount   = Object.values(userDepts).filter(d => d === dept).length;
      return {
        code:          dept,
        displayName:   DEPARTMENT_DISPLAY[dept] || dept,
        reportCount:   deptReports.length,
        openCount:     deptReports.filter(r => r.status === 'OPEN').length,
        resolvedCount: deptReports.filter(r => r.status === 'RESOLVED').length,
        userCount,
      };
    });

    return res.json({ departments });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 2. My Department ─────────────────────────────────────────────────────────

/**
 * GET /api/departments/me
 * Authenticated. Returns calling user's department assignment.
 */
export function getMyDepartmentController(req, res) {
  try {
    const { address, role } = req.user;
    const department = getDepartmentForUser(address);
    return res.json({
      address,
      role,
      department:  department || null,
      displayName: department ? (DEPARTMENT_DISPLAY[department] || department) : null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 3. My Department Reports ────────────────────────────────────────────────

/**
 * GET /api/departments/me/reports
 * Authenticated. Returns reports filtered to caller's department.
 *
 * Rule (Phase 14B):
 *   - ADMIN           → sees ALL reports (no dept filter)
 *   - AUTHORITY / MUNICIPAL_TEAM with dept → only dept reports
 *   - AUTHORITY / MUNICIPAL_TEAM without dept → empty + noDepartment flag
 */
export function getMyReportsController(req, res) {
  try {
    const { address, role } = req.user;

    // ADMIN: full visibility
    if (role === 'ADMIN') {
      const all = enrichReports(getReports());
      return res.json({ reports: all, total: all.length, department: null, isAdmin: true });
    }

    const department = getDepartmentForUser(address);

    // No department assigned → strict empty response (Phase 14B requirement)
    if (!department) {
      return res.json({
        reports:       [],
        total:         0,
        department:    null,
        noDepartment:  true,
        message:       'No department assigned to your account. Contact your administrator to be assigned to a department.',
      });
    }

    const allReports  = enrichReports(getReports());
    const deptReports = getReportsByDepartment(department, allReports);

    return res.json({
      reports:     deptReports,
      total:       deptReports.length,
      department,
      displayName: DEPARTMENT_DISPLAY[department] || department,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 4. List User Departments ────────────────────────────────────────────────

/**
 * GET /api/departments/users
 * ADMIN only. Returns all user → department assignments.
 */
export function getUserDepartmentsController(_req, res) {
  try {
    const userDepts = getAllUserDepartments();
    return res.json({ userDepartments: userDepts, count: Object.keys(userDepts).length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 5. Assign User to Department ────────────────────────────────────────────

/**
 * POST /api/departments/assign-user
 * ADMIN only. Assigns (or reassigns) a department to a user.
 * body: { address: string, department: string }
 */
export function assignUserController(req, res) {
  try {
    const { address, department } = req.body || {};
    if (!address)    return res.status(400).json({ error: 'address is required.' });
    if (!department) return res.status(400).json({ error: 'department is required.' });

    setUserDepartment(address.toLowerCase(), department);
    console.log(`[DEPT] Admin ${req.user?.address} assigned ${department} → ${address}`);

    return res.json({
      success:     true,
      address:     address.toLowerCase(),
      department,
      displayName: DEPARTMENT_DISPLAY[department] || department,
      assignedBy:  req.user?.address,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}

// ─── 6. Department Analytics ─────────────────────────────────────────────────

/**
 * GET /api/departments/analytics
 * Public. Per-department report counts by status (TC-14B.6).
 */
export function deptAnalyticsController(_req, res) {
  try {
    const allReports = enrichReports(getReports());

    const analytics = {};
    for (const dept of DEPARTMENTS) {
      const dr = allReports.filter(r => r.department === dept);
      analytics[dept] = {
        department:  dept,
        displayName: DEPARTMENT_DISPLAY[dept] || dept,
        total:       dr.length,
        open:        dr.filter(r => r.status === 'OPEN').length,
        verified:    dr.filter(r => r.status === 'VERIFIED').length,
        inProgress:  dr.filter(r => r.status === 'IN_PROGRESS').length,
        resolved:    dr.filter(r => r.status === 'RESOLVED').length,
      };
    }

    return res.json({ analytics });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 7. List All Assignments ─────────────────────────────────────────────────

/**
 * GET /api/assignments
 * ADMIN only. Returns all report-department assignments.
 */
export function listAssignmentsController(_req, res) {
  try {
    const all = getAssignments();
    return res.json({ assignments: all, count: Object.keys(all).length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 8. Get Single Assignment ────────────────────────────────────────────────

/**
 * GET /api/assignments/:reportId
 * Authenticated.
 */
export function getAssignmentController(req, res) {
  try {
    const { reportId } = req.params;
    const assignment = getAssignment(reportId);
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found for this report.' });
    }
    return res.json(assignment);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── 9. Manual Override ──────────────────────────────────────────────────────

/**
 * POST /api/assignments/assign
 * ADMIN only. Manually override a report's department assignment.
 * body: { reportId: string, department: string }
 */
export function manualAssignController(req, res) {
  try {
    const { reportId, department } = req.body || {};
    if (!reportId)   return res.status(400).json({ error: 'reportId is required.' });
    if (!department) return res.status(400).json({ error: 'department is required.' });

    const result = assignReport(reportId, department, req.user?.address);
    console.log(`[ASSIGN] Manual override by ${req.user?.address}: ${reportId.slice(0,12)}… → ${department}`);
    return res.json({ success: true, assignment: result });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
