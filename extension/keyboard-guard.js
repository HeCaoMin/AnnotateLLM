(() => {
  'use strict';
  let root = null;
  globalThis.DNProtectInput = shadowRoot => { root = shadowRoot; };
  // Install at document_start, before page shortcuts. Outside a closed shadow
  // tree, event.target is the host, so site handlers cannot see the editor.
  // Keep the native default action (typing/IME/Tab), but route keyboard handlers
  // inside the editor tree with a non-composed event. Merely stopping bubbling
  // in the editor is too late for document/window capture listeners.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    window.addEventListener(type, event => {
      const target = root?.activeElement;
      if (!event.composed || document.activeElement !== root?.host || !target?.closest('.floating-editor')) return;
      event.stopImmediatePropagation();
      const local = new KeyboardEvent(type, {
        key: event.key, code: event.code, location: event.location,
        ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey,
        repeat: event.repeat, isComposing: event.isComposing,
        keyCode: event.keyCode, charCode: event.charCode, which: event.which,
        modifierAltGraph: event.getModifierState('AltGraph'),
        bubbles: true, cancelable: event.cancelable, composed: false
      });
      if (!target.dispatchEvent(local)) event.preventDefault();
    }, true);
  }
})();
