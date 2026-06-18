/**
 * rbac.controller.js — CrowdPulse RBAC Controllers  (Phase 14A)
 *
 * GET  /api/rbac/role/:address  →  { address, role }           (authenticated)
 * GET  /api/rbac/roles          →  { roles: {...} }            (ADMIN only)
 * POST /api/rbac/assign         →  { address, role, success }  (ADMIN only)
 *   body: { address: string, role: string }
 */

import { getRole, setRole, getAllRoles, VALID_ROLES } from '../services/rbac.service.js';
import { setUserDepartment, getDepartmentForUser, DEPARTMENTS } from '../services/department.service.js';

/**
 * GET /api/rbac/role/:address
 * Returns the role for a given address.
 */
export function getRoleController(req, res) {
  try {
    const { address } = req.params;
    if (!address || address.length !== 40) {
      return res.status(400).json({ error: 'Invalid address.' });
    }
    const role = getRole(address.toLowerCase());
    return res.json({ address: address.toLowerCase(), role });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/**
 * GET /api/rbac/roles
 * Returns all role assignments. ADMIN only.
 */
export function getRolesController(req, res) {
  try {
    const roles = getAllRoles();
    return res.json({ roles, count: Object.keys(roles).length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

/**
 * POST /api/rbac/assign
 * Assigns a role to an address. ADMIN only.
 * body: { address: string, role: string }
 */
export function assignRoleController(req, res) {
  try {
    const { address, role, department } = req.body || {};

    if (!address || typeof address !== 'string') {
      return res.status(400).json({ error: 'address is required.' });
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
      });
    }

    setRole(address.toLowerCase(), role);

    // Phase 14B: optionally assign department at the same time
    let assignedDept = null;
    if (department) {
      if (!DEPARTMENTS.includes(department)) {
        return res.status(400).json({ error: `Invalid department: "${department}"` });
      }
      setUserDepartment(address.toLowerCase(), department);
      assignedDept = department;
    }

    console.log(`[RBAC] Admin ${req.user?.address} assigned ${role}${assignedDept ? ' + ' + assignedDept : ''} → ${address}`);

    return res.json({
      success:    true,
      address:    address.toLowerCase(),
      role,
      department: assignedDept,
      assignedBy: req.user?.address,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
