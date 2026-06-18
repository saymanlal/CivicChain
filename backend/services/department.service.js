/**
 * department.service.js — CrowdPulse Department Management  (Phase 14B)
 *
 * - Maintains category → department routing table
 * - Manages user → department assignments (persisted to user-departments.json)
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname       = path.dirname(fileURLToPath(import.meta.url));
const USER_DEPT_PATH  = path.join(__dirname, '..', 'data', 'user-departments.json');
const LOG             = '[DEPT]';

// ─── Department Registry ───────────────────────────────────────────────────────

export const DEPARTMENTS = [
  'ROAD_DEPARTMENT',
  'SANITATION_DEPARTMENT',
  'ELECTRICITY_DEPARTMENT',
  'DRAINAGE_DEPARTMENT',
  'FIRE_DEPARTMENT',
  'WATER_DEPARTMENT',
  'URBAN_DEPARTMENT',
  'GENERAL_DEPARTMENT',
];

export const DEPARTMENT_DISPLAY = {
  ROAD_DEPARTMENT:        'Road Department',
  SANITATION_DEPARTMENT:  'Sanitation Department',
  ELECTRICITY_DEPARTMENT: 'Electricity Department',
  DRAINAGE_DEPARTMENT:    'Drainage Department',
  FIRE_DEPARTMENT:        'Fire Department',
  WATER_DEPARTMENT:       'Water Supply Department',
  URBAN_DEPARTMENT:       'Urban Planning Department',
  GENERAL_DEPARTMENT:     'General Affairs',
};

// ─── Category → Department Mapping ────────────────────────────────────────────

export const CATEGORY_TO_DEPARTMENT = {
  ROAD_DAMAGE:      'ROAD_DEPARTMENT',
  GARBAGE:          'SANITATION_DEPARTMENT',
  STREETLIGHT:      'ELECTRICITY_DEPARTMENT',
  WATER_LOGGING:    'DRAINAGE_DEPARTMENT',
  FLOOD:            'DRAINAGE_DEPARTMENT',
  FIRE:             'FIRE_DEPARTMENT',
  WATER_LEAK:       'WATER_DEPARTMENT',
  UNSAFE_BUILDING:  'URBAN_DEPARTMENT',
  OTHER:            'GENERAL_DEPARTMENT',
};

export function getDepartmentForCategory(category) {
  return CATEGORY_TO_DEPARTMENT[category] || 'GENERAL_DEPARTMENT';
}

// ─── User → Department Store ───────────────────────────────────────────────────
// Persisted separately from roles.json to keep concerns isolated.

let userDepts = {}; // address (lowercase) → department

function loadUserDepts() {
  try {
    if (fs.existsSync(USER_DEPT_PATH)) {
      userDepts = JSON.parse(fs.readFileSync(USER_DEPT_PATH, 'utf8'));
      console.log(`${LOG} Loaded ${Object.keys(userDepts).length} user-department assignments`);
    }
  } catch (e) {
    console.warn(`${LOG} Failed to load user-departments.json:`, e.message);
    userDepts = {};
  }
}

function saveUserDepts() {
  try {
    const dir = path.dirname(USER_DEPT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USER_DEPT_PATH, JSON.stringify(userDepts, null, 2), 'utf8');
  } catch (e) {
    console.error(`${LOG} Failed to save user-departments.json:`, e.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the department assigned to a user address.
 * Returns null if not assigned.
 */
export function getDepartmentForUser(address) {
  if (!address) return null;
  return userDepts[address.toLowerCase()] || null;
}

/**
 * Assign a department to a user. Overwrites any previous assignment (reassignment).
 */
export function setUserDepartment(address, department) {
  if (!DEPARTMENTS.includes(department)) {
    throw new Error(`Invalid department: "${department}". Valid: ${DEPARTMENTS.join(', ')}`);
  }
  const prev = userDepts[address.toLowerCase()] || null;
  userDepts[address.toLowerCase()] = department;
  saveUserDepts();
  if (prev && prev !== department) {
    console.log(`${LOG} Reassigned ${address.slice(0, 10)}… ${prev} → ${department}`);
  } else {
    console.log(`${LOG} Assigned ${address.slice(0, 10)}… → ${department}`);
  }
}

/**
 * Remove a user's department assignment.
 */
export function removeUserDepartment(address) {
  delete userDepts[address.toLowerCase()];
  saveUserDepts();
  console.log(`${LOG} Removed department for ${address.slice(0, 10)}…`);
}

/**
 * Get all user → department assignments.
 */
export function getAllUserDepartments() {
  return { ...userDepts };
}

// ─── Init ────────────────────────────────────────────────────────────────────
loadUserDepts();
