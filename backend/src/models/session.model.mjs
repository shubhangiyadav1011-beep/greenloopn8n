export function createSessionModel(db) {
  return {
    removeExpired(now) {
      db.prepare('DELETE FROM sessions WHERE expires<?').run(now);
    },
    create(tokenHash, userId, expires) {
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(tokenHash, userId, expires);
    },
    findUser(tokenHash, now) {
      return db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(tokenHash, now);
    },
    delete(tokenHash) {
      db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash);
    },
    deleteForUser(userId) {
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    },
    createReset(tokenHash, userId, expires) {
      db.prepare('DELETE FROM resets WHERE user_id=?').run(userId);
      db.prepare('INSERT INTO resets VALUES (?, ?, ?)').run(tokenHash, userId, expires);
    },
    findReset(tokenHash, now) {
      return db.prepare('SELECT * FROM resets WHERE token=? AND expires>?').get(tokenHash, now);
    },
    deleteResetsForUser(userId) {
      db.prepare('DELETE FROM resets WHERE user_id=?').run(userId);
    },
    createOAuthState(stateHash, verifier, expires) {
      db.prepare('DELETE FROM oauth_states WHERE expires<?').run(Date.now());
      db.prepare('INSERT INTO oauth_states VALUES (?, ?, ?)').run(stateHash, verifier, expires);
    },
    findOAuthState(stateHash, now) {
      return db.prepare('SELECT * FROM oauth_states WHERE state=? AND expires>?').get(stateHash, now);
    },
    deleteOAuthState(stateHash) {
      db.prepare('DELETE FROM oauth_states WHERE state=?').run(stateHash);
    },
  };
}
