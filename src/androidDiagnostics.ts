import { formatRuntimeLogs } from "./diagnostics";

type WebMessage = { data: string };

type AndroidDiagnosticsBridge = {
  postMessage: (message: string) => void;
  onmessage: ((event: WebMessage) => void) | null;
};

export type DiagnosticsReport = {
  device: Record<string, string | number>;
  webView: Record<string, string>;
  nativeLogs: string;
  frontendLogs: string;
  capturedAt: string;
};

export type DiagnosticsExportResult = {
  ok: boolean;
  message: string;
};

declare global {
  interface Window {
    AndroidDiagnostics?: AndroidDiagnosticsBridge;
  }
}

let nextRequestId = 0;

function browserFallback(): DiagnosticsReport {
  return {
    device: {
      platform: navigator.platform || "unknown",
      userAgent: navigator.userAgent,
      language: navigator.language || "unknown",
      screen: `${window.screen.width} x ${window.screen.height}`,
      viewport: `${window.innerWidth} x ${window.innerHeight}`,
    },
    webView: {
      packageName: "浏览器模式",
      versionName: navigator.userAgent,
    },
    nativeLogs: "Android 原生日志桥接不可用。",
    frontendLogs: formatRuntimeLogs(),
    capturedAt: new Date().toISOString(),
  };
}

function asStringMap(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, typeof item === "number" ? item : String(item ?? "unknown")]),
  );
}

export function formatDiagnosticsReport(report: DiagnosticsReport): string {
  return [
    "电峰扇调试日志",
    `读取时间: ${report.capturedAt}`,
    "",
    "[设备信息]",
    ...Object.entries(report.device).map(([key, value]) => `${key}: ${String(value)}`),
    "",
    "[WebView]",
    ...Object.entries(report.webView).map(([key, value]) => `${key}: ${String(value)}`),
    "",
    "[Android 原生日志]",
    report.nativeLogs,
    "",
    "[前端日志]",
    report.frontendLogs || "暂无前端日志",
    "",
  ].join("\n");
}

export function requestDiagnostics(): Promise<DiagnosticsReport> {
  const bridge = window.AndroidDiagnostics;
  if (!bridge) return Promise.resolve(browserFallback());

  const requestId = `diagnostics-${Date.now()}-${++nextRequestId}`;
  return new Promise((resolve, reject) => {
    const previousHandler = bridge.onmessage;
    const cleanup = () => {
      window.clearTimeout(timeout);
      bridge.onmessage = previousHandler;
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("设备信息读取超时，请重试。"));
    }, 12000);

    bridge.onmessage = (event) => {
      let result: Record<string, unknown>;
      try {
        result = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        return;
      }
      if (result.requestId !== requestId) {
        previousHandler?.(event);
        return;
      }
      cleanup();
      if (result.ok !== true) {
        reject(new Error(typeof result.error === "string" ? result.error : "设备信息读取失败。"));
        return;
      }
      resolve({
        device: asStringMap(result.device),
        webView: Object.fromEntries(Object.entries(asStringMap(result.webView)).map(([key, value]) => [key, String(value)])),
        nativeLogs: typeof result.logs === "string" ? result.logs : "Android 原生日志为空。",
        frontendLogs: formatRuntimeLogs(),
        capturedAt: new Date().toISOString(),
      });
    };

    try {
      bridge.postMessage(JSON.stringify({ action: "diagnostics", requestId }));
    } catch {
      cleanup();
      reject(new Error("无法连接 Android 诊断接口。"));
    }
  });
}

export function exportDiagnostics(report: DiagnosticsReport): Promise<DiagnosticsExportResult> {
  const bridge = window.AndroidDiagnostics;
  if (!bridge) {
    const blob = new Blob([formatDiagnosticsReport(report)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dianfengshan-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return Promise.resolve({ ok: true, message: "当前平台没有 Android 分享接口，已下载日志文本。" });
  }

  const requestId = `diagnostics-export-${Date.now()}-${++nextRequestId}`;
  return new Promise((resolve, reject) => {
    const previousHandler = bridge.onmessage;
    const cleanup = () => {
      window.clearTimeout(timeout);
      bridge.onmessage = previousHandler;
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("导出日志超时，请重试。"));
    }, 15000);

    bridge.onmessage = (event) => {
      let result: Record<string, unknown>;
      try {
        result = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        return;
      }
      if (result.requestId !== requestId) {
        previousHandler?.(event);
        return;
      }
      cleanup();
      if (result.ok !== true) {
        reject(new Error(typeof result.error === "string" ? result.error : "日志导出失败。"));
        return;
      }
      resolve({ ok: true, message: typeof result.message === "string" ? result.message : "已打开系统分享面板。" });
    };

    try {
      bridge.postMessage(JSON.stringify({
        action: "exportDiagnostics",
        requestId,
        payload: {
          capturedAt: report.capturedAt,
          device: report.device,
          webView: report.webView,
          nativeLogs: report.nativeLogs,
          frontendLogs: report.frontendLogs,
        },
      }));
    } catch {
      cleanup();
      reject(new Error("无法连接 Android 导出接口。"));
    }
  });
}
