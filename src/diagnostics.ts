export type RuntimeLogLevel = "log" | "info" | "warn" | "error";

export type RuntimeLogEntry = {
  timestamp: string;
  level: RuntimeLogLevel;
  message: string;
};

const MAX_RUNTIME_LOGS = 300;
const runtimeLogs: RuntimeLogEntry[] = [];

function formatValue(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `\n${value.stack}` : ""}`;
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function recordRuntimeLog(level: RuntimeLogLevel, values: unknown[]) {
  runtimeLogs.push({
    timestamp: new Date().toISOString(),
    level,
    message: values.map(formatValue).join(" "),
  });
  if (runtimeLogs.length > MAX_RUNTIME_LOGS) runtimeLogs.splice(0, runtimeLogs.length - MAX_RUNTIME_LOGS);
}

export function getRuntimeLogs(): RuntimeLogEntry[] {
  return runtimeLogs.slice();
}

export function formatRuntimeLogs(): string {
  return runtimeLogs
    .map((entry) => `[${entry.timestamp}] [${entry.level}] ${entry.message}`)
    .join("\n");
}

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

console.log = (...values: unknown[]) => {
  recordRuntimeLog("log", values);
  originalConsole.log(...values);
};
console.info = (...values: unknown[]) => {
  recordRuntimeLog("info", values);
  originalConsole.info(...values);
};
console.warn = (...values: unknown[]) => {
  recordRuntimeLog("warn", values);
  originalConsole.warn(...values);
};
console.error = (...values: unknown[]) => {
  recordRuntimeLog("error", values);
  originalConsole.error(...values);
};

window.addEventListener("error", (event) => {
  recordRuntimeLog("error", [`未捕获异常: ${event.message}`, `${event.filename}:${event.lineno}:${event.colno}`]);
});
window.addEventListener("unhandledrejection", (event) => {
  recordRuntimeLog("error", ["未处理 Promise 异常:", event.reason]);
});
