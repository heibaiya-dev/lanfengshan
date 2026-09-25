import { useEffect, useState, type CSSProperties } from "react";
import { MaterialMenu } from "./MaterialMenu";
import { AUDIO_OPTIONS, audioUrl, BLADE_OPTIONS } from "./mediaCatalog";
import { useFanAudio } from "./useFanAudio";
import { useFanMotor } from "./useFanMotor";
import "./App.css";

type Speed = 1 | 2 | 3;

type FanSettings = {
  isOn: boolean;
  speed: Speed;
  oscillating: boolean;
  muted: boolean;
  bladeId: string;
  audioId: string;
  timerEnd: number | null;
  timerMinutes: number;
};

type Screen = "fan" | "settings" | "about";

const STORAGE_KEY = "dianfengshan-settings";
const SPEEDS: { value: Speed; label: string; rpm: number }[] = [
  { value: 1, label: "柔和", rpm: 90 },
  { value: 2, label: "舒适", rpm: 210 },
  { value: 3, label: "强劲", rpm: 380 },
];
const TIMER_OPTIONS = [0, 15, 30, 60, 120];

function readSettings(): FanSettings {
  const defaults: FanSettings = {
    isOn: false,
    speed: 2,
    oscillating: false,
    muted: false,
    bladeId: "blade-1",
    audioId: "running",
    timerEnd: null,
    timerMinutes: 0,
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return defaults;

    const timerEnd =
      typeof saved.timerEnd === "number" && saved.timerEnd > Date.now()
        ? saved.timerEnd
        : null;
    return {
      isOn: Boolean(saved.isOn) && (saved.timerEnd == null || timerEnd != null),
      speed: [1, 2, 3].includes(saved.speed) ? saved.speed : 2,
      oscillating: Boolean(saved.oscillating),
      muted: Boolean(saved.muted),
      bladeId: BLADE_OPTIONS.some((option) => option.id === saved.bladeId) ? saved.bladeId : defaults.bladeId,
      audioId: AUDIO_OPTIONS.some((option) => option.id === saved.audioId) ? saved.audioId : defaults.audioId,
      timerEnd,
      timerMinutes: timerEnd && TIMER_OPTIONS.includes(saved.timerMinutes) ? saved.timerMinutes : 0,
    };
  } catch {
    return defaults;
  }
}

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function App() {
  const [settings, setSettings] = useState<FanSettings>(readSettings);
  const [screen, setScreen] = useState<Screen>("fan");
  const [now, setNow] = useState(Date.now());
  const selectedSpeed = SPEEDS.find((option) => option.value === settings.speed)!;
  const selectedBlade = BLADE_OPTIONS.find((option) => option.id === settings.bladeId) ?? BLADE_OPTIONS[0];
  const selectedAudio = AUDIO_OPTIONS.find((option) => option.id === settings.audioId) ?? AUDIO_OPTIONS[0];
  const remaining = settings.timerEnd ? Math.max(0, settings.timerEnd - now) : 0;
  const rotorRef = useFanMotor(settings.isOn, selectedSpeed.rpm);
  const audio = useFanAudio(settings.isOn, settings.muted, audioUrl(selectedAudio.file));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Controls still work when storage is unavailable in the webview.
    }
  }, [settings]);

  useEffect(() => {
    if (settings.timerEnd === null) return;

    const timerEnd = settings.timerEnd;
    const tick = () => {
      setNow(Date.now());
      if (Date.now() >= timerEnd) {
        setSettings((current) =>
          current.timerEnd === timerEnd
            ? { ...current, isOn: false, timerEnd: null, timerMinutes: 0 }
            : current,
        );
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [settings.timerEnd]);

  function togglePower() {
    if (settings.isOn) audio.playPowerOff();
    else audio.playPowerOn();
    setSettings((current) => ({
      ...current,
      isOn: !current.isOn,
      timerEnd: current.isOn ? null : current.timerEnd,
      timerMinutes: current.isOn ? 0 : current.timerMinutes,
    }));
  }

  function setTimer(minutes: number) {
    const deadline = minutes > 0 ? Date.now() + minutes * 60_000 : null;
    setNow(Date.now());
    setSettings((current) => ({
      ...current,
      isOn: minutes > 0 ? true : current.isOn,
      timerEnd: deadline,
      timerMinutes: minutes,
    }));
  }

  function updatePreference<K extends "bladeId" | "audioId">(key: K, value: FanSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function renderUtilityBar() {
    return (
      <div className="utility-bar">
        <span className="utility-spacer" />
        <div className="utility-actions">
          <button type="button" className="utility-button" onClick={() => setScreen("settings")}>设置</button>
          <button type="button" className="utility-button" onClick={() => setScreen("about")}>关于</button>
        </div>
      </div>
    );
  }

  function renderPageHeader(title: string) {
    return (
      <div className="subpage-header">
        <button type="button" className="back-button" onClick={() => setScreen("fan")} aria-label="返回风扇">返回</button>
        <h1>{title}</h1>
        <span className="header-spacer" />
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="subpage settings-page">
        {renderPageHeader("设置")}
        <section className="settings-card" aria-labelledby="audio-setting-title">
          <div className="settings-heading">
            <div>
              <h2 id="audio-setting-title">运行音频</h2>
              <p>风扇开启时循环播放的声音</p>
            </div>
          </div>
          <div className="choice-list">
            {AUDIO_OPTIONS.map((option) => (
              <button
                type="button"
                className={`choice-row ${settings.audioId === option.id ? "is-selected" : ""}`}
                aria-pressed={settings.audioId === option.id}
                onClick={() => updatePreference("audioId", option.id)}
                key={option.id}
              >
                <span className="choice-copy"><strong>{option.label}</strong><small>{option.note}</small></span>
                {settings.audioId === option.id && <span className="choice-selected">已选</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-card" aria-labelledby="blade-setting-title">
          <div className="settings-heading">
            <div>
              <h2 id="blade-setting-title">扇叶</h2>
              <p>选择风扇旋转时使用的图片</p>
            </div>
          </div>
          <div className="blade-grid">
            {BLADE_OPTIONS.map((option) => (
              <button
                type="button"
                className={`blade-choice blade-choice-${option.id} ${settings.bladeId === option.id ? "is-selected" : ""}`}
                aria-pressed={settings.bladeId === option.id}
                onClick={() => updatePreference("bladeId", option.id)}
                key={option.id}
              >
                <span className="blade-thumb"><img src={`/assets/${option.file}`} alt="" /></span>
                <strong>{option.label}</strong>
                <small>{option.note}</small>
              </button>
            ))}
          </div>
        </section>

        <button type="button" className="about-list-button" onClick={() => setScreen("about")}>
          <span>关于电峰扇</span>
        </button>
      </div>
    );
  }

  function renderAbout() {
    return (
      <div className="subpage about-page">
        {renderPageHeader("关于")}
        <div className="about-hero">
          <div className="about-logo-wrap"><img src="/assets/hub-new.png" alt="电峰扇图标" /></div>
          <h2>电峰扇</h2>
          <span className="version-badge">VERSION 1.0</span>
        </div>
        <div className="credits-card">
          <p>由 <strong>Heibai</strong>（程序）</p>
          <p><strong>岚峰</strong>（立绘与美术和音乐）</p>
          <p>各位群友（测试和音乐）</p>
        </div>
        <a className="github-card" href="https://github.com/heibaiya-dev/lanfengshan.git" target="_blank" rel="noreferrer">
          <span><strong>GitHub 仓库</strong><small>heibaiya-dev/lanfengshan</small></span>
        </a>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main aria-label="电峰扇">
        {screen === "fan" && renderUtilityBar()}
        {screen === "settings" && renderSettings()}
        {screen === "about" && renderAbout()}
        {screen === "fan" && <section className="fan-stage" aria-label="电峰扇">
          <div className={`fan-assembly ${settings.isOn ? "is-on" : ""} ${settings.isOn && settings.oscillating ? "is-oscillating" : ""}`}>
            <div className="fan-head">
              <div className="guard-back" aria-hidden="true" />
              <div className="fan-rotor" ref={rotorRef} aria-hidden="true">
                {[0, 120, 240].map((angle) => (
                  <div
                    className="fan-blade"
                    style={{ "--blade-angle": `${angle}deg` } as CSSProperties}
                    key={angle}
                  >
                    <img className={`blade-image blade-image-${selectedBlade.id}`} src={`/assets/${selectedBlade.file}`} alt="" draggable={false} />
                  </div>
                ))}
              </div>
              <div className="guard-front" aria-hidden="true" />
              <img className="fan-hub" src="/assets/hub-new.png" alt="" draggable={false} />
            </div>
            <div className="fan-neck" aria-hidden="true" />
            <div className="fan-stem" aria-hidden="true" />
            <div className="fan-base" aria-hidden="true" />
          </div>
        </section>}

        {screen === "fan" && <div className="controls">
          <div className="fan-toolbar" role="group" aria-label="风扇控制">
            <button
              type="button"
              className={`toolbar-button power-button ${settings.isOn ? "is-active" : ""}`}
              onClick={togglePower}
              aria-label={settings.isOn ? "关闭电峰扇" : "开启电峰扇"}
              aria-pressed={settings.isOn}
              title={settings.isOn ? "关闭电峰扇" : "开启电峰扇"}
            >
              <span>{settings.isOn ? "关闭" : "开启"}</span>
            </button>
            <MaterialMenu
              label="风速"
              value={String(settings.speed)}
              options={SPEEDS.map((option) => ({ value: String(option.value), label: `${option.value} 档`, detail: option.label }))}
              onChange={(value) => setSettings((current) => ({ ...current, speed: Number(value) as Speed }))}
            >
              <button
                type="button"
                className="toolbar-button toolbar-speed"
                aria-label={`风速，当前 ${settings.speed} 档`}
              >
                <span className="speed-label">风速 · {settings.speed} 档</span>
              </button>
            </MaterialMenu>
            <button
              type="button"
              role="switch"
              className={`toolbar-button oscillation-button ${settings.oscillating ? "is-active" : ""}`}
              aria-label="左右摇头"
              aria-checked={settings.oscillating}
              onClick={() => setSettings((current) => ({ ...current, oscillating: !current.oscillating }))}
            >
              <span>摇头{settings.oscillating ? "开" : "关"}</span>
            </button>
            <button
              type="button"
              className={`toolbar-button mute-button ${settings.muted ? "is-active" : ""}`}
              onClick={() => setSettings((current) => ({ ...current, muted: !current.muted }))}
              aria-label={settings.muted ? "取消静音" : "静音"}
              aria-pressed={settings.muted}
            >
              <span>{settings.muted ? "静音" : "声音"}</span>
            </button>
          </div>

          <div className="timer-control">
            <span>{settings.timerEnd ? `剩余 ${formatRemaining(remaining)}` : "定时关闭"}</span>
            <MaterialMenu
              label="定时关闭"
              value={String(settings.timerMinutes)}
              options={TIMER_OPTIONS.map((minutes) => ({
                value: String(minutes),
                label: minutes === 0 ? "未设置" : minutes < 60 ? `${minutes} 分钟` : `${minutes / 60} 小时`,
              }))}
              onChange={(value) => setTimer(Number(value))}
            >
              <button
                type="button"
                className="timer-menu-trigger"
                aria-label="定时关闭时间"
              >
                {settings.timerMinutes === 0 ? "未设置" : settings.timerMinutes < 60 ? `${settings.timerMinutes} 分钟` : `${settings.timerMinutes / 60} 小时`}
              </button>
            </MaterialMenu>
          </div>
        </div>}
      </main>
    </div>
  );
}

export default App;
