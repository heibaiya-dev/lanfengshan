package com.heibai.hyw.zaoxueji

import android.os.Bundle
import android.os.Build
import android.webkit.WebView
import android.appwidget.AppWidgetManager
import androidx.activity.enableEdgeToEdge
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

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
  }
}
