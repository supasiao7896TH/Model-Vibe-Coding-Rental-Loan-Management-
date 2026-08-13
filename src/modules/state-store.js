// ตัวแปรพวกนี้อยู่ใน module scope — ไฟล์อื่น "แตะตรงๆ" ไม่ได้ ต้องผ่าน StateStore.get/.set เท่านั้น
const state = {};
const listeners = {}; // { key: Set(callback, callback, ...) }

function _notify(key, value) {
  const callbacks = listeners[key];
  if (!callbacks) return;
  callbacks.forEach((callback) => callback(value));
}

export const StateStore = {
  get(key) {
    return state[key];
  },

  set(key, value) {
    state[key] = value;
    _notify(key, value);
  },

  // สมัครฟังการเปลี่ยนแปลงของ key นี้ — พอ set ถูกเรียก callback จะทำงานอัตโนมัติ
  on(key, callback) {
    if (!listeners[key]) {
      listeners[key] = new Set();
    }
    listeners[key].add(callback);
  },

  // เลิกฟัง (สำคัญตอน component ถูกทำลาย ป้องกัน memory leak)
  off(key, callback) {
    listeners[key]?.delete(callback);
  },
};
