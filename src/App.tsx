import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  GitBranch,
  Info,
  MoveHorizontal,
  Power,
  Settings,
  Timer,
  Volume2,
  VolumeX,
  Wind,
} from "lucide-react";
import { MaterialMenu } from "./MaterialMenu";
import { AUDIO_OPTIONS, audioBrandLabel, audioUrl, BLADE_OPTIONS, type FanBrand } from "./mediaCatalog";
import { useFanAudio } from "./useFanAudio";
import { useFanMotor } from "./useFanMotor";
import { requestPinWidget, type WidgetKind } from "./androidWidgets";
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

type Screen = "fan" | "settings" | "about" | "widgets";

const APP_NAME = "造雪机";
const SNOW_BLADE_OPTIONS = BLADE_OPTIONS.filter((option) => option.id.startsWith("xuelang-"));
const SNOW_AUDIO_OPTIONS = AUDIO_OPTIONS.filter((option) => option.brand === "xuelang");

const SPEEDS: { value: Speed; label: string; rpm: number }[] = [
  { value: 1, label: "柔和", rpm: 90 },
  { value: 2, label: "舒适", rpm: 210 },
  { value: 3, label: "强劲", rpm: 380 },
];
const TIMER_OPTIONS = [0, 15, 30, 60, 120];
const rawWidgetMode = new URLSearchParams(window.location.search).get("widget");
const widgetKind: WidgetKind | null = rawWidgetMode === "1" || rawWidgetMode === "duet"
  ? "duet"
  : rawWidgetMode === "lanfeng" || rawWidgetMode === "xuelang" ? rawWidgetMode : null;
const isWidgetMode = widgetKind !== null;
const STORAGE_KEY = `zaoxueji-settings${widgetKind ? `-${widgetKind}` : ""}`;
const isMobilePlatform = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const WIDGET_KINDS: WidgetKind[] = ["lanfeng", "xuelang", "duet"];
const WIDGET_LABELS: Record<WidgetKind, string> = {
  lanfeng: "岚峰牌电风扇",
  xuelang: "雪狼牌电风扇",
  duet: "岚峰牌 + 雪狼牌双风扇",
};
const WIDGET_WINDOW_LABELS: Record<WidgetKind, string> = {
  lanfeng: "snow-widget-lanfeng",
  xuelang: "snow-widget-xuelang",
  duet: "snow-widget-duet",
};
const availableAudioOptions = widgetKind
  ? AUDIO_OPTIONS.filter((option) => option.brand === (widgetKind === "duet" ? "chorus" : widgetKind))
  : SNOW_AUDIO_OPTIONS;
const availableBladeOptions = isWidgetMode ? BLADE_OPTIONS : SNOW_BLADE_OPTIONS;

function defaultAudioForWidget(): string {
  return availableAudioOptions[0]?.id ?? "xuelang-01";
}

function readSettings(): FanSettings {
  const defaults: FanSettings = {
    isOn: false,
    speed: 2,
    oscillating: false,
    muted: false,
    bladeId: widgetKind === "lanfeng" ? "blade-1" : "xuelang-1",
    audioId: defaultAudioForWidget(),
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
      bladeId: availableBladeOptions.some((option) => option.id === saved.bladeId) ? saved.bladeId : defaults.bladeId,
      audioId: availableAudioOptions.some((option) => option.id === saved.audioId)
        ? saved.audioId
        : defaults.audioId,
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

type FanDisplayProps = {
  brand: Exclude<FanBrand, "chorus">;
  isOn: boolean;
  rpm: number;
  oscillating: boolean;
  bladeFile: string;
  hubFile: string;
};

function FanDisplay({ brand, isOn, rpm, oscillating, bladeFile, hubFile }: FanDisplayProps) {
  const rotorRef = useFanMotor(isOn, rpm);
  const bladeClass = bladeFile.startsWith("blade-") ? `blade-image-${bladeFile.replace(".png", "")}` : "";
  return (
    <div className={`fan-assembly fan-assembly-${brand} ${isOn ? "is-on" : ""} ${isOn && oscillating ? "is-oscillating" : ""}`}>
      <div className="fan-head">
        <div className="guard-back" aria-hidden="true" />
        <div className="fan-rotor" ref={rotorRef} aria-hidden="true">
          {[0, 120, 240].map((angle) => (
            <div className="fan-blade" style={{ "--blade-angle": `${angle}deg` } as CSSProperties} key={angle}>
              <img className={`blade-image ${bladeClass}`} src={`/assets/${bladeFile}`} alt="" draggable={false} />
            </div>
          ))}
        </div>
        <div className="guard-front" aria-hidden="true" />
        <img className="fan-hub" src={`/assets/${hubFile}`} alt="" draggable={false} />
      </div>
      <div className="fan-neck" aria-hidden="true" />
      <div className="fan-stem" aria-hidden="true" />
      <div className="fan-base" aria-hidden="true" />
    </div>
  );
}

function App() {
  const [settings, setSettings] = useState<FanSettings>(readSettings);
  const [screen, setScreen] = useState<Screen>("fan");
  const [now, setNow] = useState(Date.now());
  const [widgetStates, setWidgetStates] = useState<Record<WidgetKind, boolean>>({ lanfeng: false, xuelang: false, duet: false });
  const [widgetBusy, setWidgetBusy] = useState<WidgetKind | null>(null);
  const [widgetMessage, setWidgetMessage] = useState("");
  const [widgetMessageKind, setWidgetMessageKind] = useState<WidgetKind | null>(null);
  const selectedSpeed = SPEEDS.find((option) => option.value === settings.speed) ?? SPEEDS[1];
  const selectedBlade = availableBladeOptions.find((option) => option.id === settings.bladeId) ?? availableBladeOptions[0];
  const selectedAudio = availableAudioOptions.find((option) => option.id === settings.audioId) ?? availableAudioOptions[0];
  const snowBladeFiles = selectedBlade.id === "xuelang-2"
    ? ["xuelang-blade-2.png", "xuelang-blade-1.png"]
    : ["xuelang-blade-1.png", "xuelang-blade-2.png"];
  const widgetAudioOptions = availableAudioOptions;
  const remaining = settings.timerEnd ? Math.max(0, settings.timerEnd - now) : 0;
  const audio = useFanAudio(settings.isOn, settings.muted, audioUrl(selectedAudio.file), selectedAudio.brand);

  useEffect(() => {
    document.documentElement.classList.add("snow-document");
    document.body.classList.add("snow-body");
    return () => {
      document.documentElement.classList.remove("snow-document");
      document.body.classList.remove("snow-body");
    };
  }, []);

  useEffect(() => {
    if (!isWidgetMode) return;
    document.documentElement.classList.add("widget-document");
    document.body.classList.add("widget-body");
    return () => {
      document.documentElement.classList.remove("widget-document");
      document.body.classList.remove("widget-body");
    };
  }, []);

  useEffect(() => {
    if (isMobilePlatform || !("__TAURI_INTERNALS__" in window)) return;
    let disposed = false;

    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!update || disposed) return;
        await update.downloadAndInstall();
        if (disposed) return;
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } catch {
        // Update checks stay silent when offline or when no release manifest exists.
      }
    })();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (isMobilePlatform || isWidgetMode || !("__TAURI_INTERNALS__" in window)) return;
    let disposed = false;

    void (async () => {
      try {
        const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const legacy = await WebviewWindow.getByLabel("fan-widget");
        if (legacy) await legacy.close();
        for (const kind of WIDGET_KINDS) {
          const existing = await WebviewWindow.getByLabel(WIDGET_WINDOW_LABELS[kind]);
          if (existing && !disposed && await existing.isVisible()) {
            setWidgetStates((current) => ({ ...current, [kind]: true }));
          }
        }
      } catch {
        // The switch stays off when the app is running in a normal browser preview.
      }
    })();

    return () => {
      disposed = true;
    };
  }, []);

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

  async function toggleDesktopWidget(kind: WidgetKind) {
    if (isMobilePlatform || widgetBusy) return;
    setWidgetBusy(kind);
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const label = WIDGET_WINDOW_LABELS[kind];
      const existing = await WebviewWindow.getByLabel(label);
      if (widgetStates[kind]) {
        if (existing) await existing.close();
        setWidgetStates((current) => ({ ...current, [kind]: false }));
        return;
      }

      if (existing) {
        await existing.show();
        await existing.setFocus();
        setWidgetStates((current) => ({ ...current, [kind]: true }));
        return;
      }

      const widget = new WebviewWindow(label, {
        url: `index.html?widget=${kind}`,
        title: WIDGET_LABELS[kind],
        width: kind === "duet" ? 520 : 360,
        height: kind === "duet" ? 760 : 620,
        minWidth: kind === "duet" ? 460 : 320,
        minHeight: kind === "duet" ? 680 : 500,
        resizable: true,
        alwaysOnTop: true,
        decorations: false,
        shadow: false,
        transparent: true,
        center: true,
      });
      void widget.once("tauri://error", () => setWidgetStates((current) => ({ ...current, [kind]: false })));
      void widget.once("tauri://destroyed", () => setWidgetStates((current) => ({ ...current, [kind]: false })));
      setWidgetStates((current) => ({ ...current, [kind]: true }));
    } catch {
      setWidgetStates((current) => ({ ...current, [kind]: false }));
    } finally {
      setWidgetBusy(null);
    }
  }

  async function startWidgetDrag() {
    if (!isWidgetMode) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
    } catch {
      // Dragging is only available in a Tauri window.
    }
  }

  async function addWidget(kind: WidgetKind) {
    if (widgetBusy) return;
    setWidgetMessageKind(kind);
    setWidgetMessage("");
    if (!isMobilePlatform) {
      if (!("__TAURI_INTERNALS__" in window)) {
        setWidgetMessage("请在造雪机软件内添加桌面小组件。");
        return;
      }
      await toggleDesktopWidget(kind);
      return;
    }

    setWidgetBusy(kind);
    try {
      const result = await requestPinWidget(kind);
      if (!result.supported) {
        setWidgetMessage("当前桌面不支持直接添加。请长按桌面空白处，打开“小组件”，找到“造雪机”后拖动添加。");
      } else if (result.ok) {
        setWidgetMessage("请在系统弹窗中确认添加。若未显示弹窗，可长按桌面空白处，从“小组件”中添加造雪机。");
      } else {
        setWidgetMessage(result.error || "系统未能打开添加界面，请从桌面的小组件列表添加。");
      }
    } catch (error) {
      setWidgetMessage(error instanceof Error ? error.message : "添加失败，请重试。");
    } finally {
      setWidgetBusy(null);
    }
  }

  function renderUtilityBar() {
    return (
      <div className="utility-bar">
        <span className="utility-spacer" />
        <div className="utility-actions">
          <button type="button" className="utility-button" aria-label="设置" onClick={() => setScreen("settings")}>
            <Settings size={19} strokeWidth={2} />
          </button>
          <button type="button" className="utility-button" aria-label="关于" onClick={() => setScreen("about")}>
            <Info size={19} strokeWidth={2} />
          </button>
        </div>
      </div>
    );
  }

  function renderPageHeader(title: string, showBackIcon = true, backTo: Screen = "fan") {
    return (
      <div className="subpage-header">
        <button type="button" className="back-button" onClick={() => setScreen(backTo)} aria-label={backTo === "settings" ? "返回设置" : "返回造雪机"}>
          {showBackIcon && <ArrowLeft size={21} />}
          <span>返回</span>
        </button>
        <h1>{title}</h1>
        <span className="header-spacer" />
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="subpage settings-page">
        {renderPageHeader("设置", false)}
        <button type="button" className="widget-library-entry" onClick={() => setScreen("widgets")}>
          <span><strong>小组件库</strong><small>岚峰、雪狼与双风扇，添加到桌面独立控制</small></span>
          <span className="widget-library-link">打开</span>
        </button>
        <section className="settings-card" aria-labelledby="audio-setting-title">
          <div className="settings-heading">
            <div>
              <h2 id="audio-setting-title">运行音频</h2>
              <p>造雪机开启时循环播放的声音</p>
            </div>
          </div>
          <div className="choice-list">
            {(["xuelang"] as FanBrand[]).map((brand) => (
              <div className="audio-group" key={brand}>
                <p className="audio-group-label">{audioBrandLabel[brand]}</p>
                {SNOW_AUDIO_OPTIONS.filter((option) => option.brand === brand).map((option) => (
                  <button
                    type="button"
                    className={`choice-row ${settings.audioId === option.id ? "is-selected" : ""}`}
                    aria-pressed={settings.audioId === option.id}
                    onClick={() => updatePreference("audioId", option.id)}
                    key={option.id}
                  >
                    <span className="choice-copy"><strong>{option.label}</strong><small>{option.note}</small></span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="settings-card" aria-labelledby="blade-setting-title">
          <div className="settings-heading">
            <div>
              <h2 id="blade-setting-title">扇叶</h2>
              <p>选择歌姬旋转时使用的图片</p>
            </div>
          </div>
          <div className="blade-grid">
            {SNOW_BLADE_OPTIONS.map((option) => (
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

        {!isMobilePlatform && <div className="widget-switch-list">
          {WIDGET_KINDS.map((kind) => (
            <div className="widget-switch-row" key={kind}>
              <div>
                <strong>{WIDGET_LABELS[kind]}</strong>
                <p>{kind === "duet" ? "播放合唱歌曲" : "播放对应的独占音频"}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={widgetStates[kind]}
                aria-label={WIDGET_LABELS[kind]}
                className={`widget-switch ${widgetStates[kind] ? "is-on" : ""}`}
                onClick={() => void toggleDesktopWidget(kind)}
                disabled={widgetBusy !== null}
              >
                <span aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>}

        <button type="button" className="about-list-button" onClick={() => setScreen("about")}>
          <Info size={18} /><span>关于造雪机</span><ChevronDown size={17} className="about-chevron" />
        </button>
      </div>
    );
  }

  function renderAbout() {
    return (
      <div className="subpage about-page">
        {renderPageHeader("关于")}
        <div className="about-hero">
          <div className="about-logo-wrap"><img src="/assets/xuelang-hub.png" alt="造雪机图标" /></div>
          <h2>造雪机</h2>
          <span className="version-badge">VERSION 1.0</span>
        </div>
        <div className="credits-card">
          <p>由 <strong>Heibai</strong>（程序）</p>
          <p><strong>雪狼</strong>（立绘与美术和音乐）</p>
          <p>各位群友（测试和音乐）</p>
        </div>
        <a className="github-card" href="https://github.com/heibaiya-dev/lanfengshan.git" target="_blank" rel="noreferrer">
          <GitBranch size={20} />
          <span><strong>GitHub 仓库</strong><small>heibaiya-dev/lanfengshan</small></span>
          <ExternalLink size={17} />
        </a>
      </div>
    );
  }

  function renderWidgetLibrary() {
    return (
      <div className="subpage widget-library-page">
        {renderPageHeader("小组件库", false, "settings")}
        <p className="widget-library-description">
          {isMobilePlatform ? "选择一种风扇，添加到手机桌面。每个小组件的开关和音频独立设置。" : "选择一种风扇，在桌面独立控制开关和音频。"}
        </p>
        <div className="widget-library-list">
          {WIDGET_KINDS.map((kind) => (
            <section className="widget-library-item" aria-labelledby={`widget-title-${kind}`} key={kind}>
              <div className="widget-preview" aria-hidden="true">
                <div className="widget-preview-fans">
                  {kind !== "xuelang" && <FanDisplay brand="lanfeng" isOn={false} rpm={0} oscillating={false} bladeFile="blade-1.png" hubFile="hub-new.png" />}
                  {kind !== "lanfeng" && <FanDisplay brand="xuelang" isOn={false} rpm={0} oscillating={false} bladeFile="xuelang-blade-1.png" hubFile="xuelang-hub.png" />}
                </div>
                <div className="widget-preview-controls">开关 · 风速 · 摇头 · 静音</div>
              </div>
              <h2 id={`widget-title-${kind}`}>{WIDGET_LABELS[kind]}</h2>
              <p>{kind === "duet" ? "两个小风扇，共同播放合唱歌曲" : kind === "lanfeng" ? "播放岚峰独占音频" : "播放雪狼独占音频"}</p>
              <button
                type="button"
                className="widget-add-button"
                aria-label={`${!isMobilePlatform && widgetStates[kind] ? "关闭" : "添加"}${WIDGET_LABELS[kind]}小组件`}
                disabled={widgetBusy !== null}
                onClick={() => void addWidget(kind)}
              >
                {widgetBusy === kind ? "正在打开…" : !isMobilePlatform && widgetStates[kind] ? "关闭小组件" : "添加到桌面"}
              </button>
              <p className="widget-library-message" role="status">{widgetMessageKind === kind ? widgetMessage : ""}</p>
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
      <div className={`app-shell snow-app ${isWidgetMode ? "widget-shell" : ""}`}>
        <main aria-label={APP_NAME}>
        {!isWidgetMode && screen === "fan" && renderUtilityBar()}
        {!isWidgetMode && screen === "settings" && renderSettings()}
        {!isWidgetMode && screen === "about" && renderAbout()}
        {!isWidgetMode && screen === "widgets" && renderWidgetLibrary()}
        {(isWidgetMode || screen === "fan") && <>
          {isWidgetMode && <div
            className="widget-drag-strip"
            data-tauri-drag-region
            role="presentation"
            onPointerDown={() => void startWidgetDrag()}
          />}
          <section className={`fan-stage ${!widgetKind || widgetKind === "duet" ? "is-dual" : ""}`} aria-label={widgetKind ? WIDGET_LABELS[widgetKind] : "造雪机双歌姬"}>
          {!widgetKind ? <><FanDisplay
            brand="xuelang"
            isOn={settings.isOn}
            rpm={selectedSpeed.rpm}
            oscillating={settings.oscillating}
            bladeFile={snowBladeFiles[0]}
            hubFile="xuelang-hub.png"
          />
          <FanDisplay
            brand="xuelang"
            isOn={settings.isOn}
            rpm={selectedSpeed.rpm}
            oscillating={settings.oscillating}
            bladeFile={snowBladeFiles[1]}
            hubFile="xuelang-hub.png"
          /></> : <>
          {widgetKind !== "xuelang" && <FanDisplay
            brand="lanfeng"
            isOn={settings.isOn}
            rpm={selectedSpeed.rpm}
            oscillating={settings.oscillating}
            bladeFile={selectedBlade.id.startsWith("xuelang-") ? "blade-1.png" : selectedBlade.file}
            hubFile="hub-new.png"
          />}
          {widgetKind !== "lanfeng" && <FanDisplay
            brand="xuelang"
            isOn={settings.isOn}
            rpm={selectedSpeed.rpm}
            oscillating={settings.oscillating}
            bladeFile={selectedBlade.id.startsWith("xuelang-") ? selectedBlade.file : "xuelang-blade-1.png"}
            hubFile="xuelang-hub.png"
          />}
          </>}
          </section>

        <div className="controls">
          <div className="fan-toolbar" role="group" aria-label="造雪机控制">
            <button
              type="button"
              className={`toolbar-button power-button ${settings.isOn ? "is-active" : ""}`}
              onClick={togglePower}
              aria-label={settings.isOn ? "关闭造雪机" : "开启造雪机"}
              aria-pressed={settings.isOn}
              title={settings.isOn ? "关闭造雪机" : "开启造雪机"}
            >
              <Power size={24} strokeWidth={2.1} aria-hidden="true" />
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
                <Wind size={24} strokeWidth={2.1} aria-hidden="true" />
                <span className="speed-label">
                  风速 · {settings.speed} 档
                  <ChevronDown className="menu-chevron" size={13} aria-hidden="true" />
                </span>
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
              <MoveHorizontal size={24} strokeWidth={2.1} aria-hidden="true" />
              <span>摇头{settings.oscillating ? "开" : "关"}</span>
            </button>
            <button
              type="button"
              className={`toolbar-button mute-button ${settings.muted ? "is-active" : ""}`}
              onClick={() => setSettings((current) => ({ ...current, muted: !current.muted }))}
              aria-label={settings.muted ? "取消静音" : "静音"}
              aria-pressed={settings.muted}
            >
              {settings.muted ? <VolumeX size={24} strokeWidth={2.1} aria-hidden="true" /> : <Volume2 size={24} strokeWidth={2.1} aria-hidden="true" />}
              <span>{settings.muted ? "静音" : "声音"}</span>
            </button>
          </div>

          {isWidgetMode && widgetAudioOptions.length > 0 && <div className="widget-audio-control">
            <span>播放音频</span>
            <MaterialMenu
              label="选择播放音频"
              value={selectedAudio.id}
              options={widgetAudioOptions.map((option) => ({ value: option.id, label: option.label, detail: option.note }))}
              onChange={(value) => setSettings((current) => ({ ...current, audioId: value }))}
            >
              <button type="button" className="widget-audio-trigger" aria-label="选择播放音频">
                <span>{selectedAudio.label}</span>
                <ChevronDown className="menu-chevron" size={14} aria-hidden="true" />
              </button>
            </MaterialMenu>
          </div>}

          <div className="timer-control">
            <Timer size={17} strokeWidth={1.8} aria-hidden="true" />
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
                <ChevronDown className="menu-chevron" size={14} aria-hidden="true" />
              </button>
            </MaterialMenu>
          </div>
        </div></>}
      </main>
    </div>
  );
}

export default App;
