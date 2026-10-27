const emptyDataset = () => ({
  projects: [],
  materials: [],
  receivers: [],
  slots: [],
  allocations: [],
  bookings: [],
  verifications: [],
  demands: [],
  offers: [],
  events: [],
  supportRequests: [],
});

export function createDatasetModel(db) {
  const initialize = () => db.prepare('INSERT OR IGNORE INTO state VALUES (1, ?)').run(JSON.stringify(emptyDataset()));

  return {
    initialize,
    load() {
      const dataset = JSON.parse(db.prepare('SELECT document FROM state WHERE id=1').get().document);
      let nextId = dataset.events.reduce((highest, event) => Math.max(highest, Number(/^EV-(\d+)$/.exec(event.id)?.[1] ?? 0)), 0) + 1;
      const seen = new Set();
      dataset.events = dataset.events.map(event => {
        const repaired = seen.has(event.id) ? { ...event, id: `EV-${String(nextId++).padStart(3, '0')}` } : event;
        seen.add(repaired.id);
        return repaired;
      });
      return dataset;
    },
    save(dataset) {
      return db.prepare('UPDATE state SET document=? WHERE id=1').run(JSON.stringify(dataset));
    },
    ownerId(entityId) {
      return db.prepare('SELECT user_id FROM owners WHERE entity_id=?').get(entityId)?.user_id;
    },
    assignOwner(entityId, userId) {
      return db.prepare('INSERT INTO owners VALUES (?, ?)').run(entityId, userId);
    },
    deleteOwner(entityId) {
      return db.prepare('DELETE FROM owners WHERE entity_id=?').run(entityId);
    },
    transaction(operation) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = operation();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
