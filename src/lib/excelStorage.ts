/**
 * Sparar och hämtar den uppladdade artikel-Excel-filen i IndexedDB
 * så att användaren inte behöver ladda upp igen.
 */

const DB_NAME = 'PlockbotExcel';
const DB_VERSION = 1;
const STORE = 'file';
const KEY = 'article_excel';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export interface SavedExcel {
  fileName: string;
  blob: Blob;
}

export function saveExcelFile(file: File): Promise<void> {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.put(
        { fileName: file.name, blob: file },
        KEY
      );
      req.onsuccess = () => { db.close(); resolve(); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  });
}

export function loadExcelFile(): Promise<SavedExcel | null> {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        db.close();
        const v = req.result;
        if (v && v.fileName && v.blob instanceof Blob) {
          resolve({ fileName: v.fileName, blob: v.blob });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  });
}

export function clearExcelFile(): Promise<void> {
  return openDb().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(KEY);
      req.onsuccess = () => { db.close(); resolve(); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  });
}
