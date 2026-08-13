import { AppConfig } from './app-config.js';
import { DebugModule } from './debug-module.js';

// เก็บ connection ของ database ไว้ใช้ซ้ำ — เปิดครั้งเดียวพอ ไม่ต้องเปิดใหม่ทุกครั้งที่อ่าน/เขียน
let dbInstance = null;

function _openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  // IndexedDB เป็น API รุ่นเก่าที่ยังใช้ event (onsuccess/onerror) แทน Promise
  // เราเลย "ห่อ" มันด้วย `new Promise(...)` เพื่อให้โค้ดส่วนอื่นเรียกด้วย await ได้สบายๆ
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AppConfig.DB_NAME, AppConfig.DB_VERSION);

    // เหตุการณ์นี้เกิดแค่ตอน "สร้าง DB ครั้งแรก" หรือ "DB_VERSION เปลี่ยน" เท่านั้น
    // เป็นที่เดียวที่อนุญาตให้สร้าง/แก้โครงสร้าง object store ได้
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(AppConfig.STORES.ROOMS)) {
        db.createObjectStore(AppConfig.STORES.ROOMS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(AppConfig.STORES.TRANSACTIONS)) {
        const txStore = db.createObjectStore(AppConfig.STORES.TRANSACTIONS, { keyPath: 'id' });
        // index = ทางลัดค้นข้อมูล เช่น "เอาธุรกรรมทั้งหมดของห้องนี้" โดยไม่ต้องไล่สแกนทีละแถว
        txStore.createIndex('roomId', 'roomId', { unique: false });
        txStore.createIndex('month', 'month', { unique: false });
      }

      if (!db.objectStoreNames.contains(AppConfig.STORES.DOCUMENTS)) {
        const docStore = db.createObjectStore(AppConfig.STORES.DOCUMENTS, { keyPath: 'id' });
        docStore.createIndex('roomId', 'roomId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      DebugModule.log('error', 'StorageEngine._openDB', request.error);
      reject(request.error);
    };
  });
}

async function _getStore(storeName, mode = 'readonly') {
  const db = await _openDB();
  // "transaction" ของ IndexedDB ตรงนี้ไม่ใช่ transaction ค่าเช่า/ผ่อนแบงก์ของเรานะคะ!
  // มันคือคำศัพท์เทคนิคของ IndexedDB เอง แปลว่า "กลุ่มคำสั่งอ่าน/เขียนที่ต้องสำเร็จพร้อมกันทั้งหมด"
  return db.transaction(storeName, mode).objectStore(storeName);
}

export const StorageEngine = {
  async getAll(storeName) {
    const store = await _getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async get(storeName, id) {
    const store = await _getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async put(storeName, item) {
    const store = await _getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(request.error);
    });
  },

  async delete(storeName, id) {
    const store = await _getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async getByIndex(storeName, indexName, value) {
    const store = await _getStore(storeName);
    return new Promise((resolve, reject) => {
      const request = store.index(indexName).getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // ล้างข้อมูลทั้ง store — ใช้ตอน Import DB (ทับของเดิม) และ Reset ข้อมูลทั้งหมด
  async clear(storeName) {
    const store = await _getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
};
