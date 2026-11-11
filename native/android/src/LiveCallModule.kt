package __PACKAGE_NAME__

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class LiveCallModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "LiveCallModule"

  init {
    LiveCallService.onAction = { action ->
      if (context.hasActiveReactInstance()) {
        context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("LIVE_CALL_ACTION", action)
      }
    }
  }

  @ReactMethod
  fun start(title: String, text: String, hangUpLabel: String, muteLabel: String) {
    val intent = Intent(context, LiveCallService::class.java)
      .setAction(LiveCallService.ACTION_START)
      .putExtra(LiveCallService.EXTRA_TITLE, title)
      .putExtra(LiveCallService.EXTRA_TEXT, text)
      .putExtra(LiveCallService.EXTRA_HANG_UP, hangUpLabel)
      .putExtra(LiveCallService.EXTRA_MUTE, muteLabel)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
  }

  @ReactMethod
  fun stop() {
    context.stopService(Intent(context, LiveCallService::class.java))
  }

  //required by the event emitter
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}
}
