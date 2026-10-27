import { randomUUID } from 'node:crypto';

export function createSupportModel(db) {
  const ensure = request => {
    const requesterUserId = db.prepare('SELECT id FROM users WHERE email=?').get(request.email)?.id;
    if (!requesterUserId) return;
    db.prepare(`INSERT OR IGNORE INTO support_ticket_meta
      (ticket_id, requester_user_id, status, created_at, updated_at) VALUES (?, ?, 'open', ?, ?)`)
      .run(request.id, requesterUserId, request.submittedAt, request.submittedAt);
  };
  return {
    ensureRequests(requests) { for (const request of requests ?? []) ensure(request); },
    ensureRequest: ensure,
    publicStatuses(requestIds) {
      if (!requestIds.length) return new Map();
      const params = requestIds.map(() => '?').join(',');
      return new Map(db.prepare(`SELECT ticket_id AS ticketId, status, updated_at AS updatedAt, resolved_at AS resolvedAt
        FROM support_ticket_meta WHERE ticket_id IN (${params})`).all(...requestIds).map(row => [row.ticketId, row]));
    },
    list() {
      return db.prepare(`SELECT m.ticket_id AS ticketId, m.requester_user_id AS requesterUserId, m.status,
        m.assigned_admin_user_id AS assignedAdminUserId, m.created_at AS createdAt, m.updated_at AS updatedAt,
        m.resolved_at AS resolvedAt, u.email AS requesterEmail, json_extract(u.profile, '$.name') AS requesterName
        FROM support_ticket_meta m JOIN users u ON u.id=m.requester_user_id ORDER BY
        CASE m.status WHEN 'open' THEN 0 WHEN 'in_review' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END, m.updated_at DESC`).all();
    },
    get(ticketId) {
      const ticket = db.prepare(`SELECT m.ticket_id AS ticketId, m.requester_user_id AS requesterUserId, m.status,
        m.assigned_admin_user_id AS assignedAdminUserId, m.created_at AS createdAt, m.updated_at AS updatedAt,
        m.resolved_at AS resolvedAt, u.email AS requesterEmail, json_extract(u.profile, '$.name') AS requesterName,
        json_extract(u.profile, '$.organization') AS requesterOrganization, COALESCE(ac.status, 'active') AS accountStatus
        FROM support_ticket_meta m JOIN users u ON u.id=m.requester_user_id LEFT JOIN account_controls ac ON ac.user_id=u.id
        WHERE m.ticket_id=?`).get(ticketId);
      if (!ticket) return undefined;
      const notes = db.prepare(`SELECT n.id, n.author_user_id AS authorUserId, u.email AS authorEmail, n.body, n.created_at AS createdAt
        FROM support_internal_notes n JOIN users u ON u.id=n.author_user_id WHERE n.ticket_id=? ORDER BY n.created_at, n.id`).all(ticketId);
      return { ...ticket, notes };
    },
    update({ ticketId, status, assignedAdminUserId, at }) {
      const current = db.prepare('SELECT * FROM support_ticket_meta WHERE ticket_id=?').get(ticketId);
      if (!current) return undefined;
      const nextStatus = status ?? current.status;
      const nextAssignee = assignedAdminUserId === undefined ? current.assigned_admin_user_id : assignedAdminUserId;
      const resolvedAt = nextStatus === 'resolved' ? current.resolved_at ?? at : null;
      db.prepare('UPDATE support_ticket_meta SET status=?, assigned_admin_user_id=?, updated_at=?, resolved_at=? WHERE ticket_id=?')
        .run(nextStatus, nextAssignee, at, resolvedAt, ticketId);
      return this.get(ticketId);
    },
    addNote({ ticketId, authorUserId, body, createdAt }) {
      const id = randomUUID();
      db.prepare('INSERT INTO support_internal_notes VALUES (?, ?, ?, ?, ?)').run(id, ticketId, authorUserId, body, createdAt);
      return { id, authorUserId, body, createdAt };
    },
  };
}
