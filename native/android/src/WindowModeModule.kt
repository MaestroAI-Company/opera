package __PACKAGE_NAME__

import android.content.pm.PackageManager
import android.os.Build
import android.view.Display
import android.view.WindowInsets
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

//flags pc class devices for js
class WindowModeModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName(): String = "WindowModeModule"

  //chromebooks and android laptops
  override fun getConstants(): Map<String, Any> {
    val pm = reactApplicationContext.packageManager
    val pc = pm.hasSystemFeature("org.chromium.arc") || pm.hasSystemFeature(PackageManager.FEATURE_PC)
    return mapOf("isPcDevice" to pc)
  }

  //read by js after each resize
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun isDesktopWindow(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false
    val view = reactApplicationContext.currentActivity?.window?.decorView ?: return false
    //desktop windows have a caption bar
    if (view.rootWindowInsets?.isVisible(WindowInsets.Type.captionBar()) == true) return true
    return (view.display?.displayId ?: Display.DEFAULT_DISPLAY) != Display.DEFAULT_DISPLAY
  }
}
