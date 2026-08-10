package __PACKAGE_NAME__

import android.graphics.Bitmap
import android.util.Log

//passes capture to the overlay
object ScreenshotHolder {
    private const val TAG = "ScreenshotHolder"

    //never recycle under active readers
    @Volatile
    private var capture: Bitmap? = null

    @Volatile
    private var appPackage: String? = null

    @Volatile
    private var screenText: String? = null

    @JvmStatic
    fun set(bitmap: Bitmap) {
        Log.i(TAG, "capture ${bitmap.width}x${bitmap.height}")
        capture = bitmap
    }

    //recycled bitmap still answers getWidth
    @JvmStatic
    fun getUsable(): Bitmap? {
        val bitmap = capture ?: return null
        if (bitmap.isRecycled) {
            Log.w(TAG, "capture was recycled before it could be read")
            return null
        }
        return bitmap
    }

    @JvmStatic
    fun setAppPackage(pkg: String?) {
        appPackage = pkg
    }

    @JvmStatic
    fun getAppPackage(): String? = appPackage

    @JvmStatic
    fun setScreenText(text: String?) {
        screenText = text
    }

    @JvmStatic
    fun getScreenText(): String? = screenText

    //new session never shows stale screen
    @JvmStatic
    fun clear() {
        capture = null
        appPackage = null
        screenText = null
    }
}
