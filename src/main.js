var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => BronoisPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/engine.ts
var WORKLET_SRC = `
class BrownNoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.state = [0, 0];
  }
  gauss() {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }
  process(inputs, outputs) {
    const out = outputs[0];
    for (let ch = 0; ch < out.length; ch++) {
      const data = out[ch];
      let s = this.state[ch] || 0;
      for (let i = 0; i < data.length; i++) {
        s = (s + this.gauss() * 0.1) * 0.98;
        data[i] = s * 0.15;
      }
      this.state[ch] = s;
    }
    return true;
  }
}
registerProcessor('bronois-brown-noise', BrownNoiseProcessor);
`;
function gauss() {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
var BrownNoiseEngine = class {
  constructor(tone) {
    this.ctx = null;
    this.source = null;
    this.lowpass = null;
    this.shelf = null;
    this.master = null;
    this.stopTimeout = null;
    /** Multiplier applied on top of volume (used by sleep-timer fade). 0..1 */
    this.fadeFactor = 1;
    this.tone = { ...tone };
  }
  get playing() {
    return this.ctx !== null;
  }
  async start(fadeInSeconds) {
    if (this.ctx) return;
    if (this.stopTimeout !== null) {
      window.clearTimeout(this.stopTimeout);
      this.stopTimeout = null;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.fadeFactor = 1;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.shelf = ctx.createBiquadFilter();
    this.shelf.type = "lowshelf";
    this.shelf.frequency.value = 200;
    this.shelf.gain.value = this.tone.bassBoost;
    this.shelf.connect(this.master);
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.Q.value = 1;
    this.lowpass.frequency.value = this.tone.lowPassFreq;
    this.lowpass.connect(this.shelf);
    this.source = await this.createSource(ctx);
    if (this.ctx !== ctx) return;
    this.source.connect(this.lowpass);
    if (ctx.state === "suspended") await ctx.resume();
    const now = ctx.currentTime;
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(
      this.targetGain(),
      now + Math.max(0.05, fadeInSeconds)
    );
  }
  stop(fadeOutSeconds) {
    return new Promise((resolve) => {
      const ctx = this.ctx;
      if (!ctx || !this.master) {
        this.teardown();
        resolve();
        return;
      }
      const dur = Math.max(0.05, fadeOutSeconds);
      const g = this.master.gain;
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + dur);
      this.stopTimeout = window.setTimeout(() => {
        this.stopTimeout = null;
        this.teardown();
        resolve();
      }, dur * 1e3 + 50);
    });
  }
  /** Immediately kill audio (used on plugin unload). */
  teardown() {
    var _a;
    try {
      (_a = this.source) == null ? void 0 : _a.disconnect();
    } catch (_) {
    }
    if (this.source && "port" in this.source) {
      try {
        this.source.port.close();
      } catch (_) {
      }
    }
    if (this.source && "onaudioprocess" in this.source) {
      this.source.onaudioprocess = null;
    }
    this.source = null;
    this.lowpass = null;
    this.shelf = null;
    this.master = null;
    if (this.ctx) {
      this.ctx.close().catch(() => {
      });
      this.ctx = null;
    }
  }
  setTone(tone) {
    this.tone = { ...this.tone, ...tone };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (tone.lowPassFreq !== void 0 && this.lowpass) {
      this.lowpass.frequency.setTargetAtTime(tone.lowPassFreq, now, 0.05);
    }
    if (tone.bassBoost !== void 0 && this.shelf) {
      this.shelf.gain.setTargetAtTime(tone.bassBoost, now, 0.05);
    }
    if (tone.volume !== void 0) this.applyGain();
  }
  /** Set sleep-timer fade multiplier (0..1). */
  setFadeFactor(f) {
    this.fadeFactor = Math.min(1, Math.max(0, f));
    this.applyGain();
  }
  targetGain() {
    return this.tone.volume / 100 * this.fadeFactor;
  }
  applyGain() {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(this.targetGain(), now, 0.08);
  }
  async createSource(ctx) {
    if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
      const url = URL.createObjectURL(
        new Blob([WORKLET_SRC], { type: "application/javascript" })
      );
      try {
        await ctx.audioWorklet.addModule(url);
        return new AudioWorkletNode(ctx, "bronois-brown-noise", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2]
        });
      } catch (e) {
        console.warn("Bronois: AudioWorklet unavailable, falling back.", e);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    const sp = ctx.createScriptProcessor(4096, 0, 2);
    const state = [0, 0];
    sp.onaudioprocess = (e) => {
      for (let ch = 0; ch < 2; ch++) {
        const data = e.outputBuffer.getChannelData(ch);
        let s = state[ch];
        for (let i = 0; i < data.length; i++) {
          s = (s + gauss() * 0.1) * 0.98;
          data[i] = s * 0.15;
        }
        state[ch] = s;
      }
    };
    return sp;
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  volume: 70,
  lowPassFreq: 120,
  bassBoost: 9,
  timer: 0,
  fadeInSeconds: 2,
  fadeOutSeconds: 2,
  showStatusBar: true
};
var TIMER_PRESETS = [
  { minutes: 15, label: "15m" },
  { minutes: 30, label: "30m" },
  { minutes: 60, label: "60m" },
  { minutes: 240, label: "4H" },
  { minutes: 480, label: "8H" }
];
var VIEW_TYPE = "bronois-view";
var ICON = "audio-waveform";
function fmt(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s % 3600 / 60);
  const sec = s % 60;
  const pad = (n) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
var BronoisPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.statusEl = null;
    this.listeners = /* @__PURE__ */ new Set();
    /** Sleep timer state (only active while playing). */
    this.timerEndsAt = 0;
    // epoch ms, 0 = no timer running
    this.timerTotalSec = 0;
    this.busy = false;
  }
  // guards against double start/stop
  async onload() {
    await this.loadSettings();
    this.engine = new BrownNoiseEngine(this.settings);
    this.registerView(VIEW_TYPE, (leaf) => new BronoisView(leaf, this));
    this.addRibbonIcon(ICON, "Bronois: toggle brown noise", () => this.toggle());
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("bronois-status", "mod-clickable");
    this.statusEl.setAttribute("aria-label", "Toggle brown noise");
    this.statusEl.addEventListener("click", () => this.toggle());
    this.addCommand({
      id: "toggle",
      name: "Toggle brown noise",
      callback: () => this.toggle()
    });
    this.addCommand({
      id: "open-panel",
      name: "Open Bronois panel",
      callback: () => this.activateView()
    });
    this.addCommand({
      id: "volume-up",
      name: "Volume up",
      callback: () => this.nudgeVolume(5)
    });
    this.addCommand({
      id: "volume-down",
      name: "Volume down",
      callback: () => this.nudgeVolume(-5)
    });
    for (const p of TIMER_PRESETS) {
      this.addCommand({
        id: `play-timer-${p.minutes}`,
        name: `Play with ${p.label} sleep timer`,
        callback: () => this.playWithTimer(p.minutes)
      });
    }
    this.addCommand({
      id: "cancel-timer",
      name: "Cancel sleep timer",
      callback: () => {
        this.clearTimer();
        new import_obsidian.Notice("Bronois: sleep timer cancelled");
      }
    });
    this.addSettingTab(new BronoisSettingTab(this.app, this));
    this.registerInterval(window.setInterval(() => this.tick(), 1e3));
    this.refresh();
  }
  onunload() {
    var _a;
    (_a = this.engine) == null ? void 0 : _a.teardown();
  }
  // --- Playback -------------------------------------------------------------
  get isPlaying() {
    return this.engine.playing;
  }
  get timeRemaining() {
    return this.timerEndsAt ? (this.timerEndsAt - Date.now()) / 1e3 : 0;
  }
  async toggle() {
    if (this.isPlaying) await this.stop();
    else await this.play();
  }
  async play() {
    if (this.busy || this.isPlaying) return;
    this.busy = true;
    try {
      await this.engine.start(this.settings.fadeInSeconds);
      if (this.settings.timer > 0) this.startTimer(this.settings.timer);
    } catch (e) {
      console.error("Bronois: failed to start audio", e);
      new import_obsidian.Notice("Bronois: couldn't start audio \u2014 see console.");
      this.engine.teardown();
    } finally {
      this.busy = false;
      this.refresh();
    }
  }
  async stop() {
    if (this.busy || !this.isPlaying) return;
    this.busy = true;
    this.clearTimer(false);
    this.refresh();
    try {
      await this.engine.stop(this.settings.fadeOutSeconds);
    } finally {
      this.busy = false;
      this.refresh();
    }
  }
  async playWithTimer(minutes) {
    this.settings.timer = minutes;
    await this.saveSettings();
    if (this.isPlaying) this.startTimer(minutes);
    else await this.play();
    this.refresh();
  }
  /** Select/deselect a timer preset (same behaviour as the PWA buttons). */
  async selectTimer(minutes) {
    this.settings.timer = this.settings.timer === minutes ? 0 : minutes;
    await this.saveSettings();
    if (this.isPlaying) {
      if (this.settings.timer > 0) this.startTimer(this.settings.timer);
      else this.clearTimer();
    }
    this.refresh();
  }
  startTimer(minutes) {
    this.timerTotalSec = minutes * 60;
    this.timerEndsAt = Date.now() + this.timerTotalSec * 1e3;
    this.engine.setFadeFactor(1);
  }
  clearTimer(restoreVolume = true) {
    this.timerEndsAt = 0;
    this.timerTotalSec = 0;
    if (restoreVolume) this.engine.setFadeFactor(1);
    this.refresh();
  }
  tick() {
    if (this.timerEndsAt && this.isPlaying) {
      const remaining = this.timeRemaining;
      const fadeDur = Math.min(
        this.timerTotalSec,
        Math.max(this.timerTotalSec * 0.1, 30)
      );
      if (remaining <= 0) {
        this.timerEndsAt = 0;
        this.stop();
        return;
      }
      if (remaining <= fadeDur) this.engine.setFadeFactor(remaining / fadeDur);
    }
    if (this.timerEndsAt || this.isPlaying) this.refresh();
  }
  // --- Tone controls --------------------------------------------------------
  async setVolume(v) {
    this.settings.volume = Math.round(Math.min(100, Math.max(0, v)));
    this.engine.setTone({ volume: this.settings.volume });
    await this.saveSettings();
    this.refresh();
  }
  async setLowPass(hz) {
    this.settings.lowPassFreq = hz;
    this.engine.setTone({ lowPassFreq: hz });
    await this.saveSettings();
    this.refresh();
  }
  async setBass(db) {
    this.settings.bassBoost = db;
    this.engine.setTone({ bassBoost: db });
    await this.saveSettings();
    this.refresh();
  }
  async nudgeVolume(delta) {
    await this.setVolume(this.settings.volume + delta);
    new import_obsidian.Notice(`Bronois volume: ${this.settings.volume}%`, 1200);
  }
  // --- UI plumbing ----------------------------------------------------------
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  refresh() {
    this.updateStatusBar();
    this.listeners.forEach((fn) => fn());
  }
  updateStatusBar() {
    const el = this.statusEl;
    if (!el) return;
    el.toggle(this.settings.showStatusBar);
    el.empty();
    const icon = el.createSpan({ cls: "bronois-status-icon" });
    (0, import_obsidian.setIcon)(icon, this.isPlaying ? "pause" : ICON);
    let text = this.isPlaying ? "Brown noise" : "Bronois";
    if (this.isPlaying && this.timerEndsAt) text = fmt(this.timeRemaining);
    el.createSpan({ text });
    el.toggleClass("is-playing", this.isPlaying);
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      const right = workspace.getRightLeaf(false);
      if (!right) return;
      leaf = right;
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var BronoisView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.unsub = null;
    this.timerBtns = /* @__PURE__ */ new Map();
    this.sliders = [];
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Bronois";
  }
  getIcon() {
    return ICON;
  }
  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("bronois-view");
    const card = root.createDiv({ cls: "bronois-card" });
    card.createEl("h2", { cls: "bronois-title", text: "Bronois" });
    card.createEl("p", { cls: "bronois-subtitle", text: "Deep, soothing sound for focus & sleep" });
    this.playBtn = card.createEl("button", { cls: "bronois-play" });
    this.playBtn.addEventListener("click", () => this.plugin.toggle());
    this.countdownEl = card.createDiv({ cls: "bronois-countdown" });
    this.countdownTime = this.countdownEl.createDiv({ cls: "bronois-countdown-time" });
    this.countdownEl.createDiv({ cls: "bronois-countdown-label", text: "remaining" });
    const s = this.plugin.settings;
    this.addSlider(
      card,
      "Volume",
      0,
      100,
      1,
      () => s.volume,
      (n) => `${n}%`,
      (n) => this.plugin.setVolume(n)
    );
    this.addSlider(
      card,
      "Low-pass filter",
      100,
      1200,
      10,
      () => s.lowPassFreq,
      (n) => `${n} Hz`,
      (n) => this.plugin.setLowPass(n)
    );
    this.addSlider(
      card,
      "Bass boost",
      0,
      12,
      0.5,
      () => s.bassBoost,
      (n) => `+${n} dB`,
      (n) => this.plugin.setBass(n)
    );
    const tg = card.createDiv({ cls: "bronois-group" });
    tg.createDiv({ cls: "bronois-label", text: "Sleep timer" });
    const grid = tg.createDiv({ cls: "bronois-timer-grid" });
    for (const p of TIMER_PRESETS) {
      const b = grid.createEl("button", { cls: "bronois-timer-btn", text: p.label });
      b.addEventListener("click", () => this.plugin.selectTimer(p.minutes));
      this.timerBtns.set(p.minutes, b);
    }
    tg.createEl("p", {
      cls: "bronois-hint",
      text: "Audio fades out during the last 10% of the timer."
    });
    card.createEl("p", { cls: "bronois-footer", text: "Stereo: independent left/right channels \xB7 use headphones" });
    this.unsub = this.plugin.onChange(() => this.render());
    this.render();
  }
  async onClose() {
    var _a;
    (_a = this.unsub) == null ? void 0 : _a.call(this);
    this.unsub = null;
  }
  addSlider(parent, label, min, max, step, read, fmtFn, write) {
    const g = parent.createDiv({ cls: "bronois-group" });
    const head = g.createDiv({ cls: "bronois-head" });
    head.createSpan({ cls: "bronois-label", text: label });
    const value = head.createSpan({ cls: "bronois-value" });
    const input = g.createEl("input", { cls: "bronois-slider", type: "range" });
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(read());
    input.addEventListener("input", () => {
      const n = parseFloat(input.value);
      value.setText(fmtFn(n));
      this.paintSlider(input);
      write(n);
    });
    this.sliders.push({ input, value, read, fmt: fmtFn });
  }
  paintSlider(input) {
    const min = parseFloat(input.min), max = parseFloat(input.max);
    const pct = (parseFloat(input.value) - min) / (max - min) * 100;
    input.style.setProperty("--bronois-fill", `${pct}%`);
  }
  render() {
    const playing = this.plugin.isPlaying;
    this.playBtn.empty();
    (0, import_obsidian.setIcon)(this.playBtn, playing ? "pause" : "play");
    this.playBtn.toggleClass("is-playing", playing);
    this.playBtn.setAttribute("aria-label", playing ? "Stop" : "Play");
    const remaining = this.plugin.timeRemaining;
    const showCountdown = playing && remaining > 0;
    this.countdownEl.toggle(showCountdown);
    if (showCountdown) this.countdownTime.setText(fmt(remaining));
    for (const [mins, b] of this.timerBtns) {
      b.toggleClass("is-active", this.plugin.settings.timer === mins);
    }
    for (const s of this.sliders) {
      const v = s.read();
      if (document.activeElement !== s.input) s.input.value = String(v);
      s.value.setText(s.fmt(v));
      this.paintSlider(s.input);
    }
  }
};
var BronoisSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const p = this.plugin;
    new import_obsidian.Setting(containerEl).setName("Volume").addSlider((s) => s.setLimits(0, 100, 1).setValue(p.settings.volume).setDynamicTooltip().onChange((v) => p.setVolume(v)));
    new import_obsidian.Setting(containerEl).setName("Low-pass filter (Hz)").setDesc("Lower = deeper, darker rumble.").addSlider((s) => s.setLimits(100, 1200, 10).setValue(p.settings.lowPassFreq).setDynamicTooltip().onChange((v) => p.setLowPass(v)));
    new import_obsidian.Setting(containerEl).setName("Bass boost (dB)").addSlider((s) => s.setLimits(0, 12, 0.5).setValue(p.settings.bassBoost).setDynamicTooltip().onChange((v) => p.setBass(v)));
    new import_obsidian.Setting(containerEl).setName("Default sleep timer").setDesc("Applied each time playback starts.").addDropdown((d) => {
      d.addOption("0", "Off");
      for (const t of TIMER_PRESETS) d.addOption(String(t.minutes), t.label);
      d.setValue(String(p.settings.timer)).onChange(async (v) => {
        p.settings.timer = parseInt(v);
        await p.saveSettings();
        p.refresh();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Fade-in (seconds)").addSlider((s) => s.setLimits(0, 10, 0.5).setValue(p.settings.fadeInSeconds).setDynamicTooltip().onChange(async (v) => {
      p.settings.fadeInSeconds = v;
      await p.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Fade-out (seconds)").addSlider((s) => s.setLimits(0, 10, 0.5).setValue(p.settings.fadeOutSeconds).setDynamicTooltip().onChange(async (v) => {
      p.settings.fadeOutSeconds = v;
      await p.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Show in status bar").setDesc("Click the status bar item to toggle playback.").addToggle((t) => t.setValue(p.settings.showStatusBar).onChange(async (v) => {
      p.settings.showStatusBar = v;
      await p.saveSettings();
      p.refresh();
    }));
  }
};
