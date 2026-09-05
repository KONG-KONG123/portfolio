(function () {
  'use strict';

  function watchVisibility(element, onChange) {
    let visible = false;
    let active = false;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      const next = visible && !document.hidden && !motion.matches &&
        !document.body.classList.contains('modal-open');
      if (next === active) return;
      active = next;
      element.classList.toggle('effects-running', active);
      onChange(active);
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries[entries.length - 1].isIntersecting;
      sync();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('portfolio:overlaychange', sync);
    motion.addEventListener('change', sync);
    return {
      get active() { return active; },
      destroy() {
        observer.disconnect();
        document.removeEventListener('visibilitychange', sync);
        document.removeEventListener('portfolio:overlaychange', sync);
        motion.removeEventListener('change', sync);
        element.classList.remove('effects-running');
        if (active) { active = false; onChange(false); }
      }
    };
  }

  function createDialogs() {
    const stack = [];
    const background = new Map();
    const scrollStyles = [];
    const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),video[controls],[tabindex]:not([tabindex="-1"])';
    const focusable = element => [...element.querySelectorAll(focusableSelector)]
      .filter(node => !node.closest('[inert]') && node.getClientRects().length);
    const focusFirst = element => (focusable(element)[0] || element).focus({preventScroll:true});

    function sync() {
      const top = stack.at(-1)?.element;
      document.body.classList.toggle('modal-open', !!top);
      if (top) {
        if (!background.size) {
          for (const child of document.body.children) {
            if (!['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName)) background.set(child, child.inert);
          }
          for (const element of [document.documentElement, document.body]) {
            scrollStyles.push([element, element.style.getPropertyValue('overflow-y'), element.style.getPropertyPriority('overflow-y')]);
            element.style.setProperty('overflow-y', 'hidden', 'important');
          }
        }
        for (const child of background.keys()) child.inert = child !== top;
      } else {
        for (const [child, inert] of background) child.inert = inert;
        background.clear();
        for (const [element, value, priority] of scrollStyles) {
          if (value) element.style.setProperty('overflow-y', value, priority);
          else element.style.removeProperty('overflow-y');
        }
        scrollStyles.length = 0;
      }
      document.dispatchEvent(new CustomEvent('portfolio:overlaychange'));
    }

    function show(element, label, onKey) {
      if (stack.some(entry => entry.element === element)) return;
      stack.push({element, opener:document.activeElement, onKey});
      element.setAttribute('role', 'dialog');
      element.setAttribute('aria-modal', 'true');
      element.setAttribute('aria-label', label);
      element.removeAttribute('aria-hidden');
      element.tabIndex = -1;
      element.classList.add('open');
      sync();
      focusFirst(element);
    }

    function close(element) {
      const index = stack.findIndex(entry => entry.element === element);
      if (index < 0) return;
      const removed = stack.splice(index);
      for (const entry of removed.reverse()) {
        entry.element.querySelectorAll('video').forEach(video => {
          video.pause();
          video.removeAttribute('src');
          video.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
          video.load();
        });
        entry.element.classList.remove('open');
        entry.element.setAttribute('aria-hidden', 'true');
        entry.element.replaceChildren();
      }
      sync();
      const opener = removed.at(-1).opener;
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({preventScroll:true});
      else if (stack.length) focusFirst(stack.at(-1).element);
    }

    document.addEventListener('keydown', event => {
      const top = stack.at(-1);
      if (!top) return;
      if (event.key === 'Escape' && !document.fullscreenElement) {
        event.preventDefault();
        close(top.element);
      } else if (event.key === 'Tab') {
        const nodes = focusable(top.element);
        const current = nodes.indexOf(document.activeElement);
        if (!nodes.length) { event.preventDefault(); focusFirst(top.element); }
        else if (event.shiftKey && current <= 0) { event.preventDefault(); nodes.at(-1).focus(); }
        else if (!event.shiftKey && (current < 0 || current === nodes.length - 1)) { event.preventDefault(); nodes[0].focus(); }
      } else if (!event.target.closest('input,textarea,select,video,[contenteditable="true"]')) {
        top.onKey?.(event);
      }
    });
    document.addEventListener('focusin', event => {
      const top = stack.at(-1);
      if (top && !top.element.contains(event.target)) focusFirst(top.element);
    });
    return {show, close};
  }

  const mediaKey = src => {
    try { return decodeURIComponent(src).replace(/\\/g, '/').replace(/^\.\//, ''); }
    catch { return src; }
  };
  window.PortfolioRuntime = {watchVisibility, createDialogs, mediaKey};
}());
