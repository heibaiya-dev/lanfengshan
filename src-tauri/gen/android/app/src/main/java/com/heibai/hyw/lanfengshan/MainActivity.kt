package com.heibai.hyw.lanfengshan

import android.os.Bundle
import android.os.Build
import android.os.Process
import android.util.DisplayMetrics
import android.webkit.WebView
import android.content.Intent
import android.appwidget.AppWidgetManager
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
    WebViewCompat.addWebMessageListener(
      webView,
      "AndroidWidget",
      setOf("https://tauri.localhost", "http://tauri.localhost"),
    ) { _, message, sourceOrigin, isMainFrame, reply ->
      if (!isMainFrame || sourceOrigin.host != "tauri.localhost" ||
        sourceOrigin.scheme !in setOf("https", "http") || sourceOrigin.port !in setOf(-1, 80, 443)) {
        return@addWebMessageListener
      }
      val response = JSONObject()
      try {
        val request = JSONObject(message.data ?: "{}")
        response.put("requestId", request.optString("requestId"))
        val kind = request.optString("kind")
        require(request.optString("action") == "pin" && kind in FanWidgetStore.kinds) {
          "无效的小组件类型"
        }
        val manager = AppWidgetManager.getInstance(this)
        val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.isRequestPinAppWidgetSupported
        response.put("supported", supported)
        response.put("ok", if (supported) manager.requestPinAppWidget(FanWidgetStore.provider(this, kind), null, null) else false)
      } catch (error: Exception) {
        response.put("ok", false)
        response.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
        response.put("error", error.message ?: "无法请求添加小组件")
      }
      reply.postMessage(response.toString())
    }
    WebViewCompat.addWebMessageListener(
      webView,
      "AndroidDiagnostics",
      setOf("https://tauri.localhost", "http://tauri.localhost"),
    ) { _, message, sourceOrigin, isMainFrame, reply ->
      if (!isMainFrame || sourceOrigin.host != "tauri.localhost" ||
        sourceOrigin.scheme !in setOf("https", "http") || sourceOrigin.port !in setOf(-1, 80, 443)) {
        return@addWebMessageListener
      }
      val response = JSONObject()
      try {
        val request = JSONObject(message.data ?: "{}")
        response.put("requestId", request.optString("requestId"))
        when (request.optString("action")) {
          "diagnostics" -> {
            val metrics: DisplayMetrics = resources.displayMetrics
            val webViewPackage = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WebView.getCurrentWebViewPackage() else null
            response.put("device", JSONObject().apply {
              put("manufacturer", Build.MANUFACTURER)
              put("model", Build.MODEL)
              put("androidVersion", Build.VERSION.RELEASE ?: "unknown")
              put("apiLevel", Build.VERSION.SDK_INT)
              put("abis", Build.SUPPORTED_ABIS.joinToString(", "))
              put("screen", "${metrics.widthPixels} x ${metrics.heightPixels}")
              put("density", metrics.density)
            })
            response.put("webView", JSONObject().apply {
              put("packageName", webViewPackage?.packageName ?: "unknown")
              put("versionName", webViewPackage?.versionName ?: "API < 26 or unavailable")
              put("userAgent", webView.settings.userAgentString)
            })
            response.put("logs", readProcessLogs())
            response.put("ok", true)
          }
          "exportDiagnostics" -> {
            response.put("message", exportAndShare(request.optJSONObject("payload") ?: JSONObject()))
            response.put("ok", true)
          }
          else -> error("无效的诊断请求")
        }
      } catch (error: Exception) {
        response.put("ok", false)
        response.put("error", error.message ?: "无法读取设备信息")
      }
      reply.postMessage(response.toString())
    }
  }

  private fun readProcessLogs(): String {
    return try {
      val process = Runtime.getRuntime().exec(arrayOf("logcat", "-d", "--pid=${Process.myPid()}", "-t", "200"))
      val output = process.inputStream.bufferedReader().use { it.readText() }
      process.waitFor()
      output.takeLast(24000).ifBlank { "当前进程没有可用的 logcat 日志。" }
    } catch (error: Exception) {
      "无法读取 logcat：${error.message ?: "未知错误"}"
    }
  }

  private fun exportAndShare(payload: JSONObject): String {
    val timestamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
    val archive = File(cacheDir, "dianfengshan-diagnostics-$timestamp.zip")
    ZipOutputStream(BufferedOutputStream(FileOutputStream(archive))).use { zip ->
      addZipEntry(zip, "diagnostics.txt", formatPayload(payload))
      addZipEntry(zip, "device.json", payload.optJSONObject("device")?.toString(2) ?: "{}")
      addZipEntry(zip, "webview.json", payload.optJSONObject("webView")?.toString(2) ?: "{}")
    }
    val uri = FileProvider.getUriForFile(this, "${BuildConfig.APPLICATION_ID}.fileprovider", archive)
    val share = Intent(Intent.ACTION_SEND).apply {
      type = "application/zip"
      putExtra(Intent.EXTRA_STREAM, uri)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    startActivity(Intent.createChooser(share, "分享电峰扇调试日志"))
    return "已生成压缩包并打开系统分享面板。"
  }

  private fun formatPayload(payload: JSONObject): String = buildString {
    appendLine("电峰扇调试日志")
    appendLine("读取时间: ${payload.optString("capturedAt", "unknown")}")
    appendLine()
    appendLine("[Android 原生日志]")
    appendLine(payload.optString("nativeLogs", "暂无原生日志"))
    appendLine()
    appendLine("[前端日志]")
    appendLine(payload.optString("frontendLogs", "暂无前端日志"))
  }

  private fun addZipEntry(zip: ZipOutputStream, name: String, content: String) {
    zip.putNextEntry(ZipEntry(name))
    zip.write(content.toByteArray(Charsets.UTF_8))
    zip.closeEntry()
  }
}
