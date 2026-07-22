package __PACKAGE_NAME__

import android.graphics.Bitmap

object ScreenshotHolder {
    @Volatile
    private var bitmap: Bitmap? = null

    @Volatile
    private var currentAppPackage: String? = null

    @Volatile
    private var screenText: String? = null

    @JvmStatic
    fun set(b: Bitmap) {
        bitmap?.recycle()
        bitmap = b
    }

    @JvmStatic
    fun get(): Bitmap? = bitmap

    @JvmStatic
    fun consume(): Bitmap? {
        val b = bitmap
        bitmap = null
        return b
    }

    @JvmStatic
    fun setAppPackage(pkg: String?) {
        currentAppPackage = pkg
    }

    @JvmStatic
    fun getAppPackage(): String? = currentAppPackage

    @JvmStatic
    fun setScreenText(text: String?) {
        screenText = text
    }

    @JvmStatic
    fun getScreenText(): String? = screenText

    @JvmStatic
    fun clear() {
        bitmap?.recycle()
        bitmap = null
        currentAppPackage = null
        screenText = null
    }
}
