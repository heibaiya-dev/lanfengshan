export type WidgetKind = "lanfeng" | "xuelang" | "duet";

type PinWidgetResult = {
  ok: boolean;
  supported: boolean;
  error?: string;
};

type WidgetMessage = { data: string };
type AndroidWidgetBridge = {
  postMessage: (message: string) => void;
  onmessage: ((event: WidgetMessage) => void) | null;
};

declare global {
  interface Window {
    AndroidWidget?: AndroidWidgetBridge;
  }
}

let nextRequestId = 0;

export function requestPinWidget(kind: WidgetKind): Promise<PinWidgetResult> {
  const bridge = window.AndroidWidget;
  if (!bridge) return Promise.resolve({ ok: false, supported: false });

  const requestId = `widget-${Date.now()}-${++nextRequestId}`;
  return new Promise((resolve, reject) => {
    const previousHandler = bridge.onmessage;
    const cleanup = () => {
      window.clearTimeout(timeout);
      bridge.onmessage = previousHandler;
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("系统暂未响应，请重试，或从桌面的小组件列表添加。"));
    }, 8000);

    bridge.onmessage = (event) => {
      let result;
      try {
        result = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!result || typeof result !== "object") return;
      if (result.requestId !== requestId) {
        previousHandler?.(event);
        return;
      }
      cleanup();
      resolve({ ok: result.ok === true, supported: result.supported === true, error: typeof result.error === "string" ? result.error : undefined });
    };

    try {
      bridge.postMessage(JSON.stringify({ action: "pin", kind, requestId }));
    } catch {
      cleanup();
      reject(new Error("无法打开系统添加界面，请从桌面的小组件列表添加。"));
    }
  });
}
