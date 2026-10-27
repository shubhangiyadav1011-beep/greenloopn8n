export function createUploadModel(db) {
  return {
    ownerId(id) {
      return db.prepare('SELECT user_id FROM uploads WHERE id=?').get(id)?.user_id;
    },
    totalBytesForUser(userId) {
      return db.prepare('SELECT coalesce(sum(length(content)),0) AS total FROM uploads WHERE user_id=?').get(userId).total;
    },
    create({ id, userId, name, mime, content }) {
      db.prepare('INSERT INTO uploads VALUES (?, ?, ?, ?, ?)').run(id, userId, name, mime, content);
    },
    findById(id) {
      return db.prepare('SELECT * FROM uploads WHERE id=?').get(id);
    },
  };
}
