package __PACKAGE_NAME__

import androidx.activity.BackEventCompat
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule

//streams the system back gesture to js
class PredictiveBackModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName(): String = "PredictiveBackModule"

  private val callback = object : OnBackPressedCallback(false) {
    override fun handleOnBackStarted(backEvent: BackEventCompat) = emit("PredictiveBackStarted")

    override fun handleOnBackProgressed(backEvent: BackEventCompat) =
      emit("PredictiveBackProgress", backEvent.progress)

    override fun handleOnBackCancelled() = emit("PredictiveBackCancelled")

    override fun handleOnBackPressed() = emit("PredictiveBackInvoked")
  }

  @ReactMethod
  fun setEnabled(enabled: Boolean) {
    UiThreadUtil.runOnUiThread {
      if (!enabled) {
        callback.isEnabled = false
        return@runOnUiThread
      }
      val activity = reactApplicationContext.currentActivity as? ComponentActivity ?: return@runOnUiThread
      //re-added so it runs before react's own callback
      callback.remove()
      activity.onBackPressedDispatcher.addCallback(activity, callback)
      callback.isEnabled = true
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  //a reloaded bundle must not keep swallowing back
  override fun invalidate() {
    UiThreadUtil.runOnUiThread { callback.remove() }
    super.invalidate()
  }

  private fun emit(eventName: String, progress: Float? = null) {
    val data = Arguments.createMap()
    if (progress != null) data.putDouble("progress", progress.toDouble())
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, data)
  }
}
