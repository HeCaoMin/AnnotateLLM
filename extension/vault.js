(() => {
  'use strict';
  const C = globalThis.DN;
  class Vault {
    constructor(storage) { this.storage = storage; this.queue = Promise.resolve(); }
    run(fn) { const next = this.queue.then(fn); this.queue = next.catch(() => {}); return next; }
    async read() {
      const saved = await this.storage.get(['active', 'slot0', 'slot1']);
      if (saved.active === undefined) {
        if (saved.slot0 || saved.slot1) throw new Error('保存指针缺失，请在管理页导出恢复快照。');
        return {lib: C.empty(), slot: 1};
      }
      C.assert(saved.active === 0 || saved.active === 1, '保存指针损坏');
      const raw = saved['slot' + saved.active];
      C.assert(typeof raw === 'string', '当前文档缺失，请导出恢复快照。');
      return {lib: await C.parse(raw), slot: saved.active};
    }
    async commit(lib, oldSlot) {
      const markdown = await C.serialize(lib), slot = oldSlot === 0 ? 1 : 0, key = 'slot' + slot;
      await this.storage.set({[key]: markdown});
      const readback = (await this.storage.get(key))[key];
      C.assert(readback === markdown, '保存校验失败，原文档仍保留'); await C.parse(readback);
      await this.storage.set({active: slot}); return lib;
    }
    mutate(fn) { return this.run(async () => { const {lib, slot} = await this.read(); const updated = await fn(C.clone(lib)); C.validate(updated); return this.commit(updated, slot); }); }
    readQueued() { return this.run(() => this.read()); }
  }
  globalThis.DNVault = Vault;
})();
