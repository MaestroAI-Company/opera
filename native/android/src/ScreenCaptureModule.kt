package __PACKAGE_NAME__

import android.graphics.Bitmap
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class ScreenCaptureModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "ScreenCaptureModule"
    private const val YOLO_SIZE = 640
    //chat attachment thumbnail cap, not a full-res export
    private const val MAX_THUMB_DIM = 1280
    private var instance: ScreenCaptureModule? = null

    //notify js overlay of activity reuse
    @JvmStatic
    fun emitOverlayReopened() {
      instance?.reactApplicationContext
        ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("OVERLAY_REOPENED", Arguments.createMap())
    }
  }

  init {
    instance = this
  }

  //close overlay only
  @ReactMethod
  fun closeOverlay() {
    OverlayActivity.finishOverlay()
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  override fun getName(): String = TAG

  @ReactMethod
  fun hasScreenshot(promise: Promise) {
    promise.resolve(ScreenshotHolder.get() != null)
  }

  @ReactMethod
  fun getScreenshotInfo(promise: Promise) {
    val bmp = ScreenshotHolder.get()
    if (bmp == null) {
      promise.reject("NO_SCREENSHOT", "no screenshot available")
      return
    }
    promise.resolve(Arguments.createMap().apply {
      putInt("width", bmp.width)
      putInt("height", bmp.height)
    })
  }

  //crop normalized region (0..1) to a jpeg base64 data uri for chat attachment
  @ReactMethod
  fun cropRegion(x: Double, y: Double, w: Double, h: Double, promise: Promise) {
    val bmp = ScreenshotHolder.get()
    if (bmp == null || bmp.isRecycled) {
      promise.reject("NO_SCREENSHOT", "no screenshot available")
      return
    }
    scope.launch {
      try {
        if (bmp.isRecycled) throw IllegalStateException("screenshot recycled")
        val sx = (x * bmp.width).toInt().coerceIn(0, bmp.width)
        val sy = (y * bmp.height).toInt().coerceIn(0, bmp.height)
        val sw = (w * bmp.width).toInt().coerceIn(0, bmp.width - sx)
        val sh = (h * bmp.height).toInt().coerceIn(0, bmp.height - sy)
        if (sw <= 0 || sh <= 0) throw IllegalStateException("empty region")
        var crop = Bitmap.createBitmap(bmp, sx, sy, sw, sh)
        //downscale before encoding, a full-screen crop at full res is slow to compress and bridge over
        val maxDim = maxOf(crop.width, crop.height)
        if (maxDim > MAX_THUMB_DIM) {
          val scale = MAX_THUMB_DIM.toFloat() / maxDim
          val scaled = Bitmap.createScaledBitmap(crop, (crop.width * scale).toInt(), (crop.height * scale).toInt(), true)
          crop.recycle()
          crop = scaled
        }
        val out = ByteArrayOutputStream()
        crop.compress(Bitmap.CompressFormat.JPEG, 85, out)
        crop.recycle()
        val data = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        promise.resolve("data:image/jpeg;base64,$data")
      } catch (e: Exception) {
        promise.reject("ERROR", e.message ?: "error")
      }
    }
  }

  //letterboxed rgb chw float32 written to a cache file, returns the absolute path
  //avoids sending ~6.5MB base64 across the bridge and doing a slow atob loop in js
  @ReactMethod
  fun getYoloInputTensor(promise: Promise) {
    val bmp = ScreenshotHolder.get()
    if (bmp == null || bmp.isRecycled) {
      promise.reject("NO_SCREENSHOT", "no screenshot available")
      return
    }
    scope.launch {
      try {
        if (bmp.isRecycled) throw IllegalStateException("screenshot recycled")
        val tensor = preprocess(bmp)
        val bytes = ByteBuffer.allocate(tensor.size * 4).order(ByteOrder.LITTLE_ENDIAN)
        bytes.asFloatBuffer().put(tensor)
        val file = File(reactApplicationContext.cacheDir, "yolo_tensor.bin")
        FileOutputStream(file).use { it.write(bytes.array()) }
        promise.resolve(file.absolutePath)
      } catch (e: Exception) {
        promise.reject("ERROR", e.message ?: "error")
      }
    }
  }

  private fun preprocess(bmp: Bitmap): FloatArray {
    val w = bmp.width
    val h = bmp.height
    val scale = minOf(YOLO_SIZE.toFloat() / w, YOLO_SIZE.toFloat() / h)
    val nw = (w * scale).toInt()
    val nh = (h * scale).toInt()
    val padX = (YOLO_SIZE - nw) / 2
    val padY = (YOLO_SIZE - nh) / 2

    val scaled = Bitmap.createScaledBitmap(bmp, nw, nh, true)
    val src = IntArray(nw * nh)
    scaled.getPixels(src, 0, nw, 0, 0, nw, nh)
    scaled.recycle()

    val ch = YOLO_SIZE * YOLO_SIZE
    val out = FloatArray(3 * ch)
    //fill letterbox border with 114/255 like ultralytics
    java.util.Arrays.fill(out, 114f / 255f)
    for (y in 0 until nh) {
      for (x in 0 until nw) {
        val p = src[y * nw + x]
        val r = ((p shr 16) and 0xFF) / 255f
        val g = ((p shr 8) and 0xFF) / 255f
        val b = (p and 0xFF) / 255f
        val ix = (y + padY) * YOLO_SIZE + (x + padX)
        out[ix] = r
        out[ch + ix] = g
        out[2 * ch + ix] = b
      }
    }
    return out
  }
}
