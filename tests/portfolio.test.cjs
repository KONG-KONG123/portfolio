const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inlineScript = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
  .find(match => match[2].includes('const works='))[2];

// DOM-only tests: no browser, network, video decoding, layout engine or WebGL.
function boot({mobile = false, reduced = false} = {}) {
  const dom = new JSDOM(html, {runScripts:'outside-only', pretendToBeVisual:true, url:'https://portfolio.test/'});
  const {window} = dom;
  const {document} = window;
  const frames = new Map(), observers = [], mediaQueries = new Map(), idle = [];
  let frameId = 0, time = 0;
  Object.defineProperty(window.HTMLElement.prototype, 'inert', {
    get() { return this.hasAttribute('inert'); },
    set(value) { this.toggleAttribute('inert', !!value); }
  });
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return {x:0, y:0, left:0, top:0, right:1200, bottom:600, width:1200, height:600};
  };
  window.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };
  window.HTMLElement.prototype.setPointerCapture = function (id) { this._pointer = id; };
  window.HTMLElement.prototype.hasPointerCapture = function (id) { return this._pointer === id; };
  window.HTMLElement.prototype.releasePointerCapture = function () { this._pointer = null; };
  window.HTMLMediaElement.prototype.pause = function () { this._paused = true; };
  window.HTMLMediaElement.prototype.load = function () { this._released = !this.hasAttribute('src'); };
  window.requestAnimationFrame = fn => { const id = ++frameId; frames.set(id, fn); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.requestIdleCallback = fn => { idle.push(fn); return idle.length; };
  window.scrollTo = () => {};
  window.matchMedia = query => {
    if (!mediaQueries.has(query)) {
      const target = new window.EventTarget();
      target.matches = query.includes('640') ? mobile : reduced;
      mediaQueries.set(query, target);
    }
    return mediaQueries.get(query);
  };
  window.IntersectionObserver = class {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
    emit(target, visible) { this.callback([{target, isIntersecting:visible}]); }
  };
  window.ResizeObserver = class { observe() {} disconnect() {} };
  const context = dom.getInternalVMContext();
  for (const file of ['assets/media-info.js', 'assets/runtime.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
  }
  vm.runInContext(inlineScript, context, {filename:'index.html'});
  const evaluate = code => vm.runInContext(code, context);
  const tick = () => {
    time += 16;
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(fn => fn(time));
  };
  const visible = (target, value) => {
    for (const observer of [...observers]) if (observer.targets.has(target)) observer.emit(target, value);
  };
  const key = (value, shiftKey = false) => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', {key:value, shiftKey, bubbles:true, cancelable:true}));
  return {dom, window, document, frames, observers, mediaQueries, idle, evaluate, tick, visible, key};
}

test('all work cards render, with posters and no initial video elements', () => {
  const app = boot();
  assert.equal(app.document.querySelectorAll('.work').length, app.evaluate('works.length'));
  assert.equal(app.evaluate('works.length'), 34);
  assert.equal(app.document.querySelectorAll('video').length, 0);
  const videos = app.evaluate('works.filter(w=>isVideo(w.cover))');
  assert.equal(videos.length, 13);
  for (const work of videos) {
    const image = app.document.querySelector(`.work[data-id="${work.id}"] img`);
    assert.match(image.getAttribute('src'), /^_posters\//);
    assert.ok(Number(image.getAttribute('width')) > 0);
    assert.equal(image.loading || image.getAttribute('loading'), 'lazy');
  }
  app.dom.window.close();
});

test('every gallery image has dimensions and local media exists', () => {
  const app = boot();
  const works = app.evaluate('works');
  for (const work of works) {
    app.document.querySelector(`.work[data-id="${work.id}"]`).click();
    for (const image of app.document.querySelectorAll('.gallery img')) {
      assert.ok(Number(image.getAttribute('width')) > 0);
      assert.ok(Number(image.getAttribute('height')) > 0);
    }
    app.window.closeModal();
  }
  for (const [src, info] of Object.entries(app.window.PORTFOLIO_MEDIA)) {
    assert.ok(fs.existsSync(path.join(root, src)), src);
    if (info.poster) assert.ok(fs.existsSync(path.join(root, info.poster)), info.poster);
  }
  for (const image of app.evaluate('domeImagePool()')) {
    assert.ok(fs.existsSync(path.join(root, decodeURIComponent(image.src))), image.src);
    assert.ok(fs.existsSync(path.join(root, decodeURIComponent(image.thumb))), image.thumb);
  }
  app.dom.window.close();
});

test('closing a project pauses and releases its video; reopening recreates it', () => {
  const app = boot();
  const button = app.document.querySelector('.work[data-id="23"]');
  button.focus(); button.click();
  const video = app.document.querySelector('#modal video');
  assert.equal(video.preload, 'none');
  assert.ok(video.poster);
  assert.ok(video.controls);
  app.key('Escape');
  assert.ok(video._paused);
  assert.ok(video._released);
  assert.equal(app.document.querySelector('#modal').children.length, 0);
  assert.equal(app.document.activeElement, button);
  button.click();
  assert.ok(app.document.querySelector('#modal video').getAttribute('src'));
  app.dom.window.close();
});

test('seven new Motion works open local compressed videos without preloading', () => {
  const app = boot();
  const added = app.evaluate('works.filter(work=>work.id>=28)');
  assert.equal(added.length, 7);
  assert.equal(new Set(added.map(work => work.cover)).size, 7);
  for (const work of added) {
    assert.equal(work.category, 'Motion');
    assert.match(work.cover, /^media\/motion\/[a-z-]+\.mp4$/);
    assert.ok(fs.statSync(path.join(root, work.cover)).size < 24_000_000);
    const button = app.document.querySelector(`#motion .work[data-id="${work.id}"]`);
    assert.ok(button);
    const preview = button.querySelector('img');
    assert.match(preview.getAttribute('src'), /^_posters\//);
    assert.equal(preview.getAttribute('loading'), 'lazy');
    assert.ok(fs.statSync(path.join(root, preview.getAttribute('src'))).size < 150_000);
    button.focus(); button.click();
    const video = app.document.querySelector('#modal video');
    assert.equal(video.getAttribute('src'), work.cover);
    assert.equal(video.preload, 'none');
    assert.ok(video.controls);
    assert.equal(video.autoplay, false);
    assert.equal(video.getAttribute('poster'), preview.getAttribute('src'));
    app.key('Escape');
    assert.ok(video._paused && video._released);
    assert.equal(app.document.activeElement, button);
  }
  app.dom.window.close();
});

test('nested dialogs trap focus, retain lightbox controls, and restore the opener', () => {
  const app = boot();
  const {document} = app;
  const card = document.querySelector('.work'); card.focus(); card.click();
  assert.equal(document.querySelector('#app').inert, true);
  const gallery = document.querySelector('[data-lightbox-src]'); gallery.focus(); gallery.click();
  const lightbox = document.querySelector('#lightbox');
  assert.equal(lightbox.getAttribute('role'), 'dialog');
  const next = lightbox.querySelector('.lightbox-next'); next.focus();
  const before = lightbox.querySelector('img').src;
  app.key('ArrowRight');
  assert.notEqual(lightbox.querySelector('img').src, before);
  assert.equal(document.activeElement, next);
  app.key('Tab');
  assert.equal(document.activeElement, lightbox.querySelector('.close'));
  app.key('Tab', true);
  assert.equal(document.activeElement, next);
  app.key('Escape');
  assert.equal(document.activeElement, gallery);
  assert.equal(document.querySelector('#modal').inert, false);
  assert.equal(document.body.style.getPropertyValue('overflow-y'), 'hidden');
  app.key('Escape');
  assert.equal(document.activeElement, card);
  assert.equal(document.querySelector('#app').inert, false);
  assert.equal(document.body.style.getPropertyValue('overflow-y'), '');
  app.dom.window.close();
});

test('mobile and reduced motion skip heavy effects; contact dialogs remain usable', () => {
  for (const options of [{mobile:true}, {reduced:true}]) {
    const app = boot(options);
    assert.equal(app.idle.length, 0);
    assert.equal(app.document.querySelectorAll('.dome-gallery,.lanyard-wrapper,.char').length, 0);
    const button = app.document.querySelector('#heroWechat'); button.focus(); button.click();
    assert.ok(app.document.querySelector('.wechat-close'));
    assert.equal(app.document.documentElement.style.getPropertyPriority('overflow-y'), 'important');
    app.key('Escape');
    assert.equal(app.document.activeElement, button);
    assert.equal(app.document.body.style.getPropertyValue('overflow-y'), options.mobile ? 'auto' : '');
    app.dom.window.close();
  }
});

test('visibility lifecycle stops on scroll, hidden tab, dialog and reduced-motion change', () => {
  const app = boot(), target = app.document.createElement('div'), changes = [];
  app.document.body.append(target);
  const watcher = app.window.PortfolioRuntime.watchVisibility(target, active => changes.push(active));
  app.visible(target, true); app.visible(target, true);
  assert.deepEqual(changes, [true]);
  app.visible(target, false); app.visible(target, true);
  Object.defineProperty(app.document, 'hidden', {configurable:true, value:true});
  app.document.dispatchEvent(new app.window.Event('visibilitychange'));
  assert.equal(watcher.active, false);
  Object.defineProperty(app.document, 'hidden', {configurable:true, value:false});
  app.document.dispatchEvent(new app.window.Event('visibilitychange'));
  app.window.openWechat(); assert.equal(watcher.active, false);
  app.window.closeWechat(); assert.equal(watcher.active, true);
  const motion = app.window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.matches = true; motion.dispatchEvent(new app.window.Event('change'));
  assert.equal(watcher.active, false);
  motion.matches = false; motion.dispatchEvent(new app.window.Event('change'));
  watcher.destroy(); assert.equal(watcher.active, false);
  app.dom.window.close();
});

test('title settles with no queued frames and restarts only for pointer input', () => {
  const app = boot(), title = app.document.querySelector('[data-text-pressure]');
  app.tick(); app.visible(title, true); app.tick();
  assert.equal(app.frames.size, 0);
  app.window.dispatchEvent(new app.window.MouseEvent('pointermove', {clientX:50, clientY:50}));
  assert.equal(app.frames.size, 1);
  for (let i = 0; i < 160 && app.frames.size; i++) app.tick();
  assert.equal(app.frames.size, 0);
  app.visible(title, false);
  app.window.dispatchEvent(new app.window.MouseEvent('pointermove', {clientX:100, clientY:100}));
  assert.equal(app.frames.size, 0);
  app.dom.window.close();
});

test('dome uses thumbnails, pauses its RAF loop offscreen and opens originals by keyboard', () => {
  const app = boot(); app.tick();
  const dome = app.document.querySelector('.dome-gallery');
  app.visible(dome, true); app.visible(dome, true);
  assert.equal(dome.querySelectorAll('.dome-item').length, 192);
  assert.ok(app.frames.size > 0);
  app.tick();
  const button = dome.querySelector('.dome-item:not(.is-back) button');
  assert.match(button.querySelector('img').getAttribute('src'), /^_thumbs\//);
  app.visible(dome, false); assert.equal(app.frames.size, 0);
  app.visible(dome, true);
  button.focus(); button.click();
  assert.equal(app.document.querySelector('#lightbox img').getAttribute('src'), button.closest('.dome-item').dataset.src);
  assert.equal(app.frames.size, 0);
  app.key('Escape'); assert.ok(app.frames.size > 0);
  assert.equal(app.document.activeElement, button);
  app.dom.window.close();
});

test('dome pointer drag does not open a lightbox, but a single tap does', () => {
  const app = boot(); app.tick();
  const dome = app.document.querySelector('.dome-gallery');
  app.visible(dome, true); app.visible(dome, true);
  const button = dome.querySelector('.dome-item:not(.is-back) button');
  function pointer(type, x) {
    const event = new app.window.MouseEvent(type, {button:0, clientX:x, clientY:100, bubbles:true});
    Object.defineProperties(event, {pointerId:{value:1}, movementX:{value:10}});
    button.dispatchEvent(event);
  }
  pointer('pointerdown', 100); pointer('pointermove', 150); pointer('pointerup', 150);
  assert.equal(app.document.querySelector('#lightbox').classList.contains('open'), false);
  pointer('pointerdown', 150); pointer('pointerup', 150);
  assert.equal(app.document.querySelector('#lightbox').classList.contains('open'), true);
  assert.equal(app.frames.size, 0);
  app.dom.window.close();
});

test('lanyard RAF is cancelled and physics time resets after a long pause', () => {
  const start = inlineScript.indexOf('      let lastTime=performance.now(),accumulator=0,animationRAF=0;');
  const end = inlineScript.indexOf('      function resize()', start);
  assert.ok(start > 0 && end > start);
  let change, now = 0, next = 0, steps = 0, rendered = 0;
  const frames = new Map();
  const context = {
    performance:{now:() => now}, wrap:{},
    requestAnimationFrame:fn => { const id = ++next; frames.set(id, fn); return id; },
    cancelAnimationFrame:id => frames.delete(id),
    watchVisibility:(_, callback) => { change = callback; },
    MAX_FRAME_DT:0.04, FIXED_DT:1/60, MAX_STEPS_PER_FRAME:4,
    simulate:() => steps++, updateBandGeometry:() => {}, bandGeo:{},
    cardGroup:{position:{copy:() => {}}, rotation:{set:() => {}}},
    cardPos:{}, cardRot:{x:0, y:0, z:0},
    renderer:{render:() => rendered++}, scene:{}, camera:{},
    cardDragged:false
  };
  vm.runInNewContext(inlineScript.slice(start, end), context);
  change(true); assert.equal(frames.size, 1);
  const frame = [...frames.values()][0]; frames.clear(); now = 20; frame(now);
  assert.equal(rendered, 1); assert.equal(steps, 1);
  change(false); assert.equal(frames.size, 0);
  now = 100000; change(true);
  const resumed = [...frames.values()][0]; frames.clear(); now += 16; resumed(now);
  assert.equal(rendered, 2); assert.equal(steps, 1);
  change(false); assert.equal(frames.size, 0);
});

test('external stylesheet parses and all first-page menu previews use local thumbnails', () => {
  const css = require('rrweb-cssom');
  const sheet = fs.readFileSync(path.join(root, 'assets/site.css'), 'utf8');
  assert.ok(css.parse(sheet).cssRules.length > 0);
  const app = boot();
  for (const image of app.document.querySelectorAll('.flowing-img')) {
    const match = image.style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/);
    assert.ok(match, image.outerHTML);
    const src = match[1];
    assert.match(src, /^_thumbs\//);
    assert.ok(fs.existsSync(path.join(root, decodeURIComponent(src))));
  }
  for (const node of app.document.querySelectorAll('script[src],link[href]')) {
    const src = node.getAttribute('src') || node.getAttribute('href');
    assert.ok(fs.existsSync(path.join(root, src)), src);
  }
  app.dom.window.close();
});
