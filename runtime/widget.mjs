import { mountWidget } from './widget-mount.mjs';
import { resolveWidgetSource, widgetSize } from './widget-contract.mjs';
import { runtimeIdentity, assertRuntimeIdentity } from './runtime-identity.mjs';
export { mountWidget };
export { runtimeIdentity };
export { sharedRuntimeInfo } from './shared-runtime.mjs';

/** Custom Element adapter: visibility, fixed geometry and connection lifecycle only. */
const elementKey = Symbol.for('isle.widget.element/3');
export function defineWidget(tag = runtimeIdentity.mode === 'standalone' ? 'isle-widget-standalone' : 'isle-widget') {
  const registered = customElements.get(tag);
  if (registered) { assertRuntimeIdentity(registered[elementKey], runtimeIdentity); return; }
  class IsleWidget extends HTMLElement {
    #abort; #observer; #started = false;
    constructor() { super(); this.attachShadow({ mode: 'open' }); }
    connectedCallback() {
      if (this.#started) return;
      this.#started = true;
      this.setAttribute('data-widget-status', 'idle');
      if (this.getAttribute('loading') === 'lazy') {
        this.#observer = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) { this.#observer.disconnect(); this.#load(); }
        }, { rootMargin: '200px' });
        this.#observer.observe(this);
      } else this.#load();
    }
    disconnectedCallback() {
      // Preserve state for synchronous DOM moves; release resources after actual removal.
      queueMicrotask(() => {
        if (this.isConnected) return;
        this.#observer?.disconnect(); this.#abort?.abort();
        this.#started = false; this.shadowRoot.replaceChildren();
      });
    }
    connectedMoveCallback() {}
    async #load() {
      if (!this.isConnected || this.getAttribute('data-widget-status') !== 'idle') return;
      const abort = this.#abort = new AbortController();
      const alive = () => this.isConnected && this.#abort === abort && !abort.signal.aborted;
      this.setAttribute('data-widget-status', 'loading');
      try {
        for (const key of ['width', 'height']) {
          const value = this.getAttribute(key);
          if (!/^\d+$/.test(value ?? '')) throw new Error(`Explicit ${key} in pixels is required`);
        }
        widgetSize(+this.getAttribute('width'), +this.getAttribute('height'));
        const descriptorURL = resolveWidgetSource({ ...(this.hasAttribute('src') ? { src: this.getAttribute('src') } : {}),
          ...(this.hasAttribute('descriptor') ? { descriptorURL: this.getAttribute('descriptor') } : {}) }, this.baseURI);
        await mountWidget(this.shadowRoot, descriptorURL, {
          signal: abort.signal,
          onError: error => this.dispatchEvent(new CustomEvent('isle:error', { detail: error.message, bubbles: true, composed: true })),
        });
        if (!alive()) return;
        this.setAttribute('data-widget-status', 'ready');
        this.dispatchEvent(new CustomEvent('isle:ready', { bubbles: true, composed: true }));
      } catch (error) {
        if (!alive()) return;
        this.setAttribute('data-widget-status', 'error');
        const message = document.createElement('p'); message.setAttribute('role', 'alert'); message.textContent = 'Widget is unavailable. Reload to try again.';
        this.shadowRoot.replaceChildren(message);
        this.dispatchEvent(new CustomEvent('isle:error', { detail: error.message, bubbles: true, composed: true }));
      }
    }
  }
  Object.defineProperty(IsleWidget, elementKey, { value: runtimeIdentity });
  customElements.define(tag, IsleWidget);
}
