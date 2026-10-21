'use strict';
/* Small IndexedDB data-access layer. Stores: peptides, logs, weights, meta. */
const STORES = ['peptides', 'logs', 'weights', 'meta'];
const DB = {
  _db: null,
  open() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB is not available in this browser.'));
      const r = indexedDB.open('private-tracker', 2);
      r.onupgradeneeded = e => {
        const d = r.result;
        if (e.oldVersion < 1) {
          d.createObjectStore('peptides', { keyPath: 'id', autoIncrement: true });
          d.createObjectStore('logs', { keyPath: 'id', autoIncrement: true }).createIndex('ts', 'ts');
          d.createObjectStore('weights', { keyPath: 'id', autoIncrement: true }).createIndex('ts', 'ts');
          d.createObjectStore('meta', { keyPath: 'key' });
        }
        if (e.oldVersion < 2) { // v2: every existing entry gets a category
          r.transaction.objectStore('peptides').openCursor().onsuccess = ev => {
            const c = ev.target.result;
            if (c) { if (!c.value.category) c.update({ ...c.value, category: 'peptide' }); c.continue(); }
          };
        }
        // Future migrations: if (e.oldVersion < 3) { ... }  (bump the version number above)
      };
      r.onsuccess = () => { this._db = r.result; resolve(); };
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('Database is blocked by another tab.'));
    });
  },
  run(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = this._db.transaction(store, mode);
      const rq = fn(t.objectStore(store));
      t.oncomplete = () => resolve(rq && rq.result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  },
  all: function (s) { return this.run(s, 'readonly', st => st.getAll()); },
  put: function (s, o) { return this.run(s, 'readwrite', st => st.put(o)); },
  del: function (s, id) { return this.run(s, 'readwrite', st => st.delete(id)); },
  /** Replace everything in one atomic transaction (used by import and delete-all). */
  replaceAll(data) {
    return new Promise((resolve, reject) => {
      const t = this._db.transaction(STORES, 'readwrite');
      for (const s of STORES) {
        const st = t.objectStore(s);
        st.clear();
        (data[s] || []).forEach(o => st.put(o));
      }
      t.oncomplete = resolve;
      t.onerror = t.onabort = () => reject(t.error);
    });
  }
};
