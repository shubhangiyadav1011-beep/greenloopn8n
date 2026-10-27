export function createUserModel(db) {
  const toProfile = row => row && ({ id: row.id, email: row.email, ...JSON.parse(row.profile) });

  return {
    findById(id) {
      return db.prepare('SELECT * FROM users WHERE id=?').get(id);
    },
    findByEmail(email) {
      return db.prepare('SELECT * FROM users WHERE email=?').get(email);
    },
    findProfileById(id) {
      return toProfile(this.findById(id));
    },
    findProfileByEmail(email) {
      return toProfile(this.findByEmail(email));
    },
    hasEmail(email) {
      return Boolean(db.prepare('SELECT id FROM users WHERE email=?').get(email));
    },
    create({ id, email, password, profile }) {
      db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(id, email, password, JSON.stringify(profile));
    },
    createGoogleIdentity(subject, { id, email, profile }) {
      db.prepare('INSERT INTO users VALUES (?, ?, NULL, ?)').run(id, email, JSON.stringify(profile));
      db.prepare('INSERT INTO google_identities VALUES (?, ?)').run(subject, id);
    },
    findByGoogleSubject(subject) {
      return db.prepare('SELECT users.* FROM google_identities JOIN users ON users.id=google_identities.user_id WHERE subject=?').get(subject);
    },
    updateProfile(user) {
      const { id, email, ...fields } = user;
      db.prepare('UPDATE users SET profile=? WHERE id=?').run(JSON.stringify(fields), id);
    },
    updatePassword(id, password) {
      db.prepare('UPDATE users SET password=? WHERE id=?').run(password, id);
    },
    publicContact(id) {
      const row = db.prepare('SELECT email, profile FROM users WHERE id=?').get(id);
      return row && { email: row.email, profile: JSON.parse(row.profile) };
    },
    toProfile,
  };
}
