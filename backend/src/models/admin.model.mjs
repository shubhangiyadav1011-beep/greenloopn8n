import { randomUUID } from 'node:crypto';

const roleValues = new Set(['super_admin', 'support_admin', 'operations_admin']);
const safeJson = value => value == null ? null : JSON.stringify(value);

export function createAdminModel(db) {
  const roleFor = userId => db.prepare('SELECT role FROM admin_roles WHERE user_id=?').get(userId)?.role;
  const statusFor = userId => db.prepare("SELECT status FROM account_controls WHERE user_id=?").get(userId)?.status ?? 'active';
  return {
    roleFor,
    statusFor,
    assignRole(userId, role, actorId, at) {
      if (!roleValues.has(role)) throw new Error('Invalid system role.');
      db.prepare(`INSERT INTO admin_roles (user_id, role, assigned_by, assigned_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET role=excluded.role, assigned_by=excluded.assigned_by, assigned_at=excluded.assigned_at`).run(userId, role, actorId, at);
    },
    revokeRole(userId) { db.prepare('DELETE FROM admin_roles WHERE user_id=?').run(userId); },
    listRoles() { return db.prepare(`SELECT ar.user_id AS userId, ar.role, ar.assigned_at AS assignedAt, u.email, json_extract(u.profile, '$.name') AS name
      FROM admin_roles ar JOIN users u ON u.id=ar.user_id ORDER BY ar.role, u.email`).all(); },
    userCount() { return Number(db.prepare('SELECT COUNT(*) AS total FROM users').get().total); },
    listUsers(query = '', limit = 50, offset = 0) {
      const term = `%${query.trim().toLowerCase()}%`;
      return db.prepare(`SELECT u.id, u.email, u.profile, COALESCE(ac.status, 'active') AS status, ac.updated_at AS statusUpdatedAt,
        ac.reason AS statusReason, ar.role AS systemRole
        FROM users u LEFT JOIN account_controls ac ON ac.user_id=u.id LEFT JOIN admin_roles ar ON ar.user_id=u.id
        WHERE lower(u.email) LIKE ? OR lower(COALESCE(json_extract(u.profile, '$.name'), '')) LIKE ? OR lower(COALESCE(json_extract(u.profile, '$.organization'), '')) LIKE ?
        ORDER BY lower(u.email) LIMIT ? OFFSET ?`).all(term, term, term, limit, offset).map(row => ({ id: row.id, email: row.email,
          name: JSON.parse(row.profile).name ?? '', organization: JSON.parse(row.profile).organization ?? '',
          workspaces: JSON.parse(row.profile).workspaces ?? [], status: row.status, statusUpdatedAt: row.statusUpdatedAt,
          statusReason: row.statusReason, systemRole: row.systemRole }));
    },
    setAccountStatus({ userId, status, updatedAt, actorId, reason }) {
      db.prepare(`INSERT INTO account_controls (user_id, status, updated_at, updated_by, reason) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at, updated_by=excluded.updated_by, reason=excluded.reason`).run(userId, status, updatedAt, actorId, reason);
    },
    appendAudit({ actorUserId, actorRole, action, targetType, targetId, occurredAt, reason, before, after }) {
      db.prepare(`INSERT INTO admin_audit_log (actor_user_id, actor_role, action, target_type, target_id, occurred_at, reason, before_json, after_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(actorUserId, actorRole, action, targetType, targetId, occurredAt, reason, safeJson(before), safeJson(after));
    },
    listAudit(limit = 100) {
      return db.prepare(`SELECT l.id, l.actor_user_id AS actorUserId, l.actor_role AS actorRole, u.email AS actorEmail,
        l.action, l.target_type AS targetType, l.target_id AS targetId, l.occurred_at AS occurredAt,
        l.reason, l.before_json AS beforeJson, l.after_json AS afterJson
        FROM admin_audit_log l JOIN users u ON u.id=l.actor_user_id ORDER BY l.id DESC LIMIT ?`).all(limit).map(row => ({
          ...row, before: row.beforeJson ? JSON.parse(row.beforeJson) : undefined, after: row.afterJson ? JSON.parse(row.afterJson) : undefined,
          beforeJson: undefined, afterJson: undefined,
        }));
    },
    addIncident({ requestId, occurredAt, method, route, category, statusCode }) {
      const id = `INC-${randomUUID()}`;
      db.prepare('INSERT INTO admin_incidents (id, request_id, occurred_at, method, route, category, status_code) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, requestId, occurredAt, method, route, category, statusCode);
      return id;
    },
    listIncidents(limit = 25) {
      return db.prepare('SELECT id, request_id AS requestId, occurred_at AS occurredAt, method, route, category, status_code AS statusCode FROM admin_incidents ORDER BY occurred_at DESC LIMIT ?').all(limit);
    },
    databaseReady() { db.prepare('SELECT 1').get(); return true; },
  };
}
