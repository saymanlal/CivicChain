/**
 * assignment.service.js — CrowdPulse Report-Department Assignment  (Phase 14B)
 *
 * Auto-assigns reports to departments based on category.
 * Persists assignments to backend/data/assignments.json.
 *
 * Assignment record shape:
 * {
 *   reportId:     string,
 *   department:   string,   // e.g. "ROAD_DEPARTMENT"
 *   category:     string,   // e.g. "ROAD_DAMAGE"
 *   reporter:     string,   // wallet address
 *   assignedAt:   number,   // ms timestamp
 *   status:       "ASSIGNED",
 *   overriddenBy: string | null  // admin address if manually overridden
 * }
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDepartmentForCategory } from './department.service.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const ASSIGN_PATH  = path.join(__dirname, '..', 'data', 'assignments.json');
const LOG          = '[ASSIGN]';

// ─── In-Memory Store ──────────────────────────────────────────────────────────
let assignments = {}; // reportId → assignment record

function loadAssignments() {
  try {
    if (fs.existsSync(ASSIGN_PATH)) {
      assignments = JSON.parse(fs.readFileSync(ASSIGN_PATH, 'utf8'));
      console.log(`${LOG} Loaded ${Object.keys(assignments).length} report assignments from disk`);
    }
  } catch (e) {
    console.warn(`${LOG} Failed to load assignments.json:`, e.message);
    assignments = {};
  }
}

function saveAssignments() {
  try {
    const dir = path.dirname(ASSIGN_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ASSIGN_PATH, JSON.stringify(assignments, null, 2), 'utf8');
  } catch (e) {
    console.error(`${LOG} Failed to save assignments.json:`, e.message);
  }
}

// ─── Core Operations ─────────────────────────────────────────────────────────

/**
 * Auto-assign every report in the array that doesn't yet have an assignment.
 * Idempotent — already-assigned reports are skipped.
 *
 * @param {Array} reports — array of report objects from reportCache
 */
export function ensureAssigned(reports) {
  let changed = false;
  for (const r of reports) {
    if (!r?.id || assignments[r.id]) continue;
    const department = getDepartmentForCategory(r.category);
    assignments[r.id] = {
      reportId:     r.id,
      department,
      category:     r.category  || 'OTHER',
      reporter:     r.reporter  || null,
      assignedAt:   Date.now(),
      status:       'ASSIGNED',       // Phase 14B requirement
      overriddenBy: null,
    };
    console.log(`${LOG} Auto-assigned ${r.id.slice(0, 12)}… [${r.category}] → ${department}`);
    changed = true;
  }
  if (changed) saveAssignments();
}

/**
 * Manually override a report's department assignment (Admin action).
 *
 * @param {string} reportId
 * @param {string} department
 * @param {string|null} overriddenBy — admin wallet address
 */
export function assignReport(reportId, department, overriddenBy = null) {
  const existing = assignments[reportId] || {};
  assignments[reportId] = {
    ...existing,
    reportId,
    department,
    overriddenBy,
    assignedAt: Date.now(),
    status:     'ASSIGNED',
  };
  saveAssignments();
  console.log(`${LOG} Manually assigned ${reportId.slice(0, 12)}… → ${department} (by ${overriddenBy})`);
  return { ...assignments[reportId] };
}

/**
 * Get the assignment record for a specific report.
 * Returns null if not assigned.
 */
export function getAssignment(reportId) {
  return assignments[reportId] ? { ...assignments[reportId] } : null;
}

/**
 * Get all assignment records.
 */
export function getAssignments() {
  return { ...assignments };
}

/**
 * Enrich an array of reports with a department field.
 * Falls back to getDepartmentForCategory if no explicit assignment exists.
 *
 * @param {Array} reports
 * @returns {Array} reports with .department added
 */
export function enrichReports(reports) {
  return reports.map(r => ({
    ...r,
    department: assignments[r.id]?.department ?? getDepartmentForCategory(r.category),
  }));
}

/**
 * Filter a (pre-enriched) report array by department.
 */
export function getReportsByDepartment(department, reports) {
  return reports.filter(r => r.department === department);
}

// ─── Init ────────────────────────────────────────────────────────────────────
loadAssignments();
