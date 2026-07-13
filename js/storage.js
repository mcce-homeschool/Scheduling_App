/* Module: storage.js — managementAppDB schema, open/seed.
 * Per TDS_Slice_M4_Management_App_Rev3.md §2. */

const Storage = (() => {
  const DB_NAME = 'managementAppDB';
  const DB_VERSION = 1;

  const ACTIVITY_TYPE_SEED = [
    { activityTypeKey: 'quiz', label: 'Quiz', capturePattern: 'grade-optional', structurePattern: 'count' },
    { activityTypeKey: 'test', label: 'Test', capturePattern: 'grade-optional', structurePattern: 'count' },
    { activityTypeKey: 'project', label: 'Project', capturePattern: 'grade-optional', structurePattern: 'count' },
    { activityTypeKey: 'report', label: 'Report', capturePattern: 'grade-optional', structurePattern: 'count' },
    { activityTypeKey: 'pdf', label: 'PDF', capturePattern: 'grade-optional', structurePattern: 'page-range' },
    { activityTypeKey: 'drill', label: 'Drill', capturePattern: 'grade-optional', structurePattern: 'count' },
    { activityTypeKey: 'workbook', label: 'Workbook', capturePattern: 'grade-optional', structurePattern: 'count' },
    { activityTypeKey: 'video', label: 'Video', capturePattern: 'no-capture', structurePattern: 'count' },
    { activityTypeKey: 'practice-level', label: 'Practice Level', capturePattern: 'no-capture', structurePattern: 'count' },
    { activityTypeKey: 'reading-pages', label: 'Reading Pages', capturePattern: 'no-capture', structurePattern: 'page-range' },
  ];

  const TIER_SEED = [
    { tierId: 'D01', label: 'Easy', order: 0, rewardCategoryId: 'R01' },
    { tierId: 'D02', label: 'Medium', order: 1, rewardCategoryId: 'R02' },
    { tierId: 'D03', label: 'Hard', order: 2, rewardCategoryId: 'R03' },
  ];

  const REWARD_CATEGORY_SEED = [
    { categoryId: 'R01', internalLabel: 'Easy' },
    { categoryId: 'R02', internalLabel: 'Medium' },
    { categoryId: 'R03', internalLabel: 'Hard' },
  ];

  // Declared now, empty until their owning milestone (Q6 — TDS §1/§2), so no
  // future milestone needs an IndexedDB version bump.
  const EMPTY_STORES = [
    'courses', 'lessons', 'activities', 'children', 'pacingProfiles',
    'chores', 'familyEvents', 'generationLog', 'importedCompletions', 'unmatchedRows',
  ];

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;

        db.createObjectStore('appSettings');
        const meta = db.createObjectStore('meta');
        const curricula = db.createObjectStore('curricula', { keyPath: 'id' });
        const tiers = db.createObjectStore('tiers', { keyPath: 'tierId' });
        const rewardCategories = db.createObjectStore('rewardCategories', { keyPath: 'categoryId' });
        const activityTypes = db.createObjectStore('activityTypes', { keyPath: 'activityTypeKey' });
        for (const storeName of EMPTY_STORES) db.createObjectStore(storeName, { keyPath: 'id' });

        // Seed — inside this same onupgradeneeded transaction, atomic with
        // store creation, and never re-runs (v1 seeds exactly once).
        meta.put({ nextSeq: 4 }, 'idCounters');
        for (const tier of TIER_SEED) tiers.put(tier);
        for (const cat of REWARD_CATEGORY_SEED) rewardCategories.put(cat);
        for (const type of ACTIVITY_TYPE_SEED) activityTypes.put(type);
        void curricula; // no seed data; store exists for FR-1 create/read
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function get(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(storeName, value, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value, key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function del(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // For multi-store atomic writes (e.g. minting a tier + category + counter
  // in one transaction). `worker(tx)` must issue all its requests
  // synchronously against `tx.objectStore(...)` before returning — do not
  // await inside it, or the IDB transaction auto-commits early.
  async function runTransaction(storeNames, mode, worker) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeNames, mode);
      let result;
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
      try {
        result = worker(t);
      } catch (err) {
        reject(err);
      }
    });
  }

  return { openDB, get, getAll, put, del, runTransaction };
})();
