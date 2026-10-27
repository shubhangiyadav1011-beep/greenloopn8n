import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/database/openDatabase.mjs';
import { createUserModel } from '../src/models/user.model.mjs';
import { createAdminModel } from '../src/models/admin.model.mjs';
import { emailAddress } from '../src/validation.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const email = emailAddress(process.argv[2]);
const db = openDatabase(resolve(projectRoot, 'server/data'));

try {
  const userModel = createUserModel(db);
  const adminModel = createAdminModel(db);
  const user = userModel.findByEmail(email);
  if (!user) throw new Error('Create and onboard this account normally before running the admin bootstrap command.');
  if (adminModel.roleFor(user.id)) throw new Error('This account already has a system role; bootstrap was not applied.');
  const at = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    adminModel.assignRole(user.id, 'super_admin', null, at);
    adminModel.appendAudit({ actorUserId: user.id, actorRole: 'super_admin', action: 'bootstrap_super_admin', targetType: 'user', targetId: user.id,
      occurredAt: at, reason: 'Initial Super Admin provisioned by the controlled local bootstrap command.', before: { systemRole: null }, after: { systemRole: 'super_admin' } });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  process.stdout.write(`Super Admin access granted to ${email}. Restart the API and sign in again.\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Admin bootstrap failed.'}\n`);
  process.exitCode = 1;
} finally {
  db.close();
}
