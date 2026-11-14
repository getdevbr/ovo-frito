'use strict';

class ServiceManager {
  constructor() {
    this.services = new Map();
  }

  register(name, service) {
    if (!name || typeof service?.stop !== 'function') {
      throw new Error(`Serviço inválido: ${name}`);
    }
    this.services.set(name, service);
  }

  get(name) {
    return this.services.get(name) || null;
  }

  statusAll() {
    const result = {};
    for (const [name, svc] of this.services.entries()) {
      result[name] = typeof svc.status === 'function' ? svc.status() : { running: false };
    }
    return result;
  }

  async stopAll(timeoutMs = 3000) {
    const entries = Array.from(this.services.entries());
    await Promise.allSettled(
      entries.map(async ([name, svc]) => {
        let timer = null;
        try {
          await Promise.race([
            Promise.resolve(svc.stop()),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error(`Timeout ao parar ${name}`)), timeoutMs);
              timer.unref?.();
            })
          ]);
        } catch (err) {
          console.error(`[ServiceManager] Erro ao parar ${name}:`, err.message);
        } finally {
          if (timer) clearTimeout(timer);
        }
      })
    );
  }
}

module.exports = {
  ServiceManager
};
