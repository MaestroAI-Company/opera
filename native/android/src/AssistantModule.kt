package __PACKAGE_NAME__

import android.app.role.RoleManager
import android.content.Context
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

//reports assistant role to js
class AssistantModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  override fun getName(): String = "AssistantModule"

  @ReactMethod
  fun isDefaultAssistant(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val roles = reactApplicationContext.getSystemService(Context.ROLE_SERVICE) as RoleManager
        promise.resolve(roles.isRoleHeld(RoleManager.ROLE_ASSISTANT))
        return
      }
      //older androids expose raw setting
      val current = Settings.Secure.getString(reactApplicationContext.contentResolver, "assistant")
      promise.resolve(current?.contains(reactApplicationContext.packageName) == true)
    } catch (e: Exception) {
      promise.reject("ASSISTANT_ROLE_FAILED", e)
    }
  }
}
