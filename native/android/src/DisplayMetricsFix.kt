package __PACKAGE_NAME__

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import android.view.WindowManager
import java.lang.ref.WeakReference
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Proxy

//react native uses phone display metrics
object DisplayMetricsFix : Application.ActivityLifecycleCallbacks {
  private var current: WeakReference<Activity>? = null

  fun install(app: Application) = app.registerActivityLifecycleCallbacks(this)

  //app context defaults to phone display
  fun wrap(name: String, service: Any?): Any? {
    if (name != Context.WINDOW_SERVICE || service !is WindowManager) return service
    val activityDisplay = current?.get()?.windowManager?.defaultDisplay ?: return service
    //phone display keeps the untouched service
    if (activityDisplay.displayId == service.defaultDisplay.displayId) return service
    return Proxy.newProxyInstance(
      WindowManager::class.java.classLoader,
      arrayOf(WindowManager::class.java),
    ) { _, method, args ->
      if (method.name == "getDefaultDisplay") {
        activityDisplay
      } else {
        try {
          method.invoke(service, *(args ?: emptyArray()))
        } catch (e: InvocationTargetException) {
          throw e.targetException
        }
      }
    }
  }

  //before react view creation
  override fun onActivityPreCreated(activity: Activity, savedInstanceState: Bundle?) {
    current = WeakReference(activity)
  }

  override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
    current = WeakReference(activity)
  }

  override fun onActivityResumed(activity: Activity) {
    current = WeakReference(activity)
  }

  override fun onActivityStarted(activity: Activity) {}
  override fun onActivityPaused(activity: Activity) {}
  override fun onActivityStopped(activity: Activity) {}
  override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
  override fun onActivityDestroyed(activity: Activity) {}
}
