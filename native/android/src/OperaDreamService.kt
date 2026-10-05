package __PACKAGE_NAME__

import android.service.dreams.DreamService
import android.view.ContextThemeWrapper
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.interfaces.fabric.ReactSurface

//screensaver rendered by the shared react host
class OperaDreamService : DreamService() {

  private var surface: ReactSurface? = null

  private val reactHost: ReactHost?
    get() = (application as? ReactApplication)?.reactHost

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    //buttons take touches instead of waking
    isInteractive = true
    isFullscreen = true
    val host = reactHost ?: return
    //views need the app theme
    val next = host.createSurface(ContextThemeWrapper(this, R.style.AppTheme), "OperaDream", null)
    setContentView(next.view)
    next.start()
    surface = next
    //timers and animations only run while resumed
    host.onHostResume(null)
  }

  override fun onDreamingStopped() {
    val host = reactHost
    //an activity may own the host
    if (host != null && host.currentReactContext?.currentActivity == null) host.onHostPause()
    super.onDreamingStopped()
  }

  override fun onDetachedFromWindow() {
    surface?.stop()
    surface?.detach()
    surface = null
    super.onDetachedFromWindow()
  }
}
