// รวมจุด log ของทั้งแอปไว้ที่เดียว — ใส่ prefix ให้กรองดูใน DevTools Console ได้ง่าย
const LOG_PREFIX = '[CondoApp]';

export const DebugModule = {
  log(level, context, error) {
    const message = `${LOG_PREFIX} [${level.toUpperCase()}] ${context}`;

    if (level === 'error') {
      console.error(message, error ?? '');
    } else if (level === 'warn') {
      console.warn(message, error ?? '');
    } else {
      console.log(message, error ?? '');
    }
  },
};
