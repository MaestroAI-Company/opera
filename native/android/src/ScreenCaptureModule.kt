package __PACKAGE_NAME__

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

//exposes capture size thumbnails and context
class ScreenCaptureModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  companion object {
    private const val NAME = "ScreenCaptureModule"

    private const val MAX_THUMB_DIM = 1280
    private const val JPEG_QUALITY = 85
    private const val ICON_SIZE = 128
    private const val MAX_SCREEN_TEXT = 4000

    //letterbox padding the detector ignores
    private const val PAD_COLOR = 0xFF727272.toInt()

    //sentinel means capture not landed
    private const val NOT_READY = "NO_SCREENSHOT"
    private const val NOT_READY_MESSAGE = "no screenshot available"

    @Volatile
    private var instance: ScreenCaptureModule? = null

    //signal overlay was reused not recreated
    @JvmStatic
    fun emitOverlayReopened() {
      instance?.reactApplicationContext
        ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit("OVERLAY_REOPENED", Arguments.createMap())
    }
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  init {
    instance = this
  }

  override fun getName(): String = NAME

  override fun invalidate() {
    if (instance === this) instance = null
    scope.cancel()
    super.invalidate()
  }

  //shared not ready contract and errors
  private fun readCapture(promise: Promise, work: (Bitmap) -> Unit) {
    val capture = ScreenshotHolder.getUsable()
    if (capture == null) {
      promise.reject(NOT_READY, NOT_READY_MESSAGE)
      return
    }
    //holder never recycles reference stays valid
    scope.launch {
      try {
        work(capture)
      } catch (e: Exception) {
        promise.reject("ERROR", e.message ?: "error")
      }
    }
  }

  @ReactMethod
  fun getScreenshotInfo(promise: Promise) {
    val capture = ScreenshotHolder.getUsable()
    if (capture == null) {
      promise.reject(NOT_READY, NOT_READY_MESSAGE)
      return
    }
    promise.resolve(Arguments.createMap().apply {
      putInt("width", capture.width)
      putInt("height", capture.height)
    })
  }

  //region as jpeg data uri
  @ReactMethod
  fun cropRegion(x: Double, y: Double, w: Double, h: Double, promise: Promise) {
    readCapture(promise) { capture ->
      val left = (x * capture.width).toInt().coerceIn(0, capture.width)
      val top = (y * capture.height).toInt().coerceIn(0, capture.height)
      val width = (w * capture.width).toInt().coerceIn(0, capture.width - left)
      val height = (h * capture.height).toInt().coerceIn(0, capture.height - top)
      if (width <= 0 || height <= 0) throw IllegalStateException("empty region")

      //models never need larger thumbs
      val scale = minOf(1f, MAX_THUMB_DIM.toFloat() / maxOf(width, height))
      val outWidth = maxOf(1, (width * scale).toInt())
      val outHeight = maxOf(1, (height * scale).toInt())

      //single blit crops and downscales
      val thumb = Bitmap.createBitmap(outWidth, outHeight, Bitmap.Config.ARGB_8888)
      Canvas(thumb).drawBitmap(
        capture,
        Rect(left, top, left + width, top + height),
        Rect(0, 0, outWidth, outHeight),
        Paint(Paint.FILTER_BITMAP_FLAG)
      )

      val jpeg = ByteArrayOutputStream()
      thumb.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, jpeg)
      thumb.recycle()
      promise.resolve("data:image/jpeg;base64," + encode(jpeg))
    }
  }

  //square rgb bytes model reads directly
  @ReactMethod
  fun getDetectionInput(size: Int, promise: Promise) {
    readCapture(promise) { capture ->
      val scale = minOf(size.toFloat() / capture.width, size.toFloat() / capture.height)
      val contentWidth = maxOf(1, (capture.width * scale).toInt()).coerceAtMost(size)
      val contentHeight = maxOf(1, (capture.height * scale).toInt()).coerceAtMost(size)
      val offsetX = (size - contentWidth) / 2
      val offsetY = (size - contentHeight) / 2

      val square = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val canvas = Canvas(square)
      canvas.drawColor(PAD_COLOR)
      canvas.drawBitmap(
        capture,
        null,
        Rect(offsetX, offsetY, offsetX + contentWidth, offsetY + contentHeight),
        Paint(Paint.FILTER_BITMAP_FLAG)
      )

      val pixels = IntArray(size * size)
      square.getPixels(pixels, 0, size, 0, 0, size, size)
      square.recycle()

      //model reads channels in nchw order
      val plane = size * size
      val planes = ByteArray(3 * plane)
      for (i in 0 until plane) {
        val pixel = pixels[i]
        planes[i] = ((pixel shr 16) and 0xFF).toByte()
        planes[plane + i] = ((pixel shr 8) and 0xFF).toByte()
        planes[2 * plane + i] = (pixel and 0xFF).toByte()
      }

      promise.resolve(Arguments.createMap().apply {
        putString("data", Base64.encodeToString(planes, Base64.NO_WRAP))
        putInt("offsetX", offsetX)
        putInt("offsetY", offsetY)
        putInt("contentWidth", contentWidth)
        putInt("contentHeight", contentHeight)
      })
    }
  }

  @ReactMethod
  fun showTextLayer(promise: Promise) {
    val capture = ScreenshotHolder.getUsable()
    if (capture == null) {
      promise.reject(NOT_READY, NOT_READY_MESSAGE)
      return
    }

    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    recognizer.process(InputImage.fromBitmap(capture, 0))
      .addOnSuccessListener { text ->
        //each block keeps its own paragraph
        val blocks = text.textBlocks.mapNotNull { block ->
          val bounds = block.boundingBox ?: return@mapNotNull null
          val value = block.text?.trim() ?: return@mapNotNull null
          if (value.isEmpty()) return@mapNotNull null
          TextSelectionLayer.Block(
            bounds.left, bounds.top, bounds.width(), bounds.height(),
            value, block.lines.size
          )
        }
        recognizer.close()
        //overlay views mutate on ui thread
        Handler(Looper.getMainLooper()).post {
          reactApplicationContext.currentActivity?.let { activity ->
            TextSelectionLayer.show(activity, blocks)
          }
        }
        promise.resolve(null)
      }
      .addOnFailureListener { e ->
        recognizer.close()
        promise.reject("OCR_FAILED", e.message ?: "ocr failed")
      }
  }

  @ReactMethod
  fun clearTextLayer() {
    Handler(Looper.getMainLooper()).post { TextSelectionLayer.hide() }
  }

  @ReactMethod
  fun scanCodes(promise: Promise) {
    val capture = ScreenshotHolder.getUsable()
    if (capture == null) {
      promise.reject(NOT_READY, NOT_READY_MESSAGE)
      return
    }

    val scanner = BarcodeScanning.getClient(
      BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
    )
    scanner.process(InputImage.fromBitmap(capture, 0))
      .addOnSuccessListener { codes ->
        val found = Arguments.createArray()
        for (code in codes) {
          val value = code.rawValue ?: continue
          //whole qr from its corner points
          val corners = code.cornerPoints ?: continue
          var left = Int.MAX_VALUE
          var top = Int.MAX_VALUE
          var right = Int.MIN_VALUE
          var bottom = Int.MIN_VALUE
          for (point in corners) {
            left = minOf(left, point.x)
            top = minOf(top, point.y)
            right = maxOf(right, point.x)
            bottom = maxOf(bottom, point.y)
          }
          val bounds = Rect(left, top, right, bottom)
          found.pushMap(region(bounds, capture).apply { putString("value", value) })
        }
        scanner.close()
        promise.resolve(found)
      }
      .addOnFailureListener { e ->
        scanner.close()
        promise.reject("SCAN_FAILED", e.message ?: "scan failed")
      }
  }

  private fun region(bounds: Rect, capture: Bitmap): WritableMap = Arguments.createMap().apply {
    putDouble("x", bounds.left.toDouble() / capture.width)
    putDouble("y", bounds.top.toDouble() / capture.height)
    putDouble("w", bounds.width().toDouble() / capture.width)
    putDouble("h", bounds.height().toDouble() / capture.height)
  }

  //foreground package and assist screen text
  @ReactMethod
  fun getAppContext(promise: Promise) {
    promise.resolve(Arguments.createMap().apply {
      putStringOrNull("appPackage", ScreenshotHolder.getAppPackage())
      //cap screen text for prompt budget
      putStringOrNull("screenText", ScreenshotHolder.getScreenText()?.take(MAX_SCREEN_TEXT))
    })
  }

  //circular icon png and display label
  @ReactMethod
  fun getAppIcon(pkg: String, promise: Promise) {
    scope.launch {
      try {
        val packages = reactApplicationContext.packageManager
        val label = runCatching {
          packages.getApplicationLabel(packages.getApplicationInfo(pkg, 0)).toString()
        }.getOrDefault(pkg)

        val icon = circleCrop(rasterize(packages.getApplicationIcon(pkg)))
        val png = ByteArrayOutputStream()
        icon.compress(Bitmap.CompressFormat.PNG, 100, png)
        icon.recycle()

        promise.resolve(Arguments.createMap().apply {
          putString("icon", "data:image/png;base64," + encode(png))
          putString("label", label)
        })
      } catch (e: Exception) {
        promise.reject("NO_ICON", e.message ?: "no icon")
      }
    }
  }

  //drawable never owns the fresh bitmap
  private fun rasterize(drawable: Drawable): Bitmap {
    val bitmap = Bitmap.createBitmap(ICON_SIZE, ICON_SIZE, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val source = (drawable as? BitmapDrawable)?.bitmap
    if (source != null) {
      canvas.drawBitmap(source, null, Rect(0, 0, ICON_SIZE, ICON_SIZE), Paint(Paint.FILTER_BITMAP_FLAG))
    } else {
      drawable.setBounds(0, 0, ICON_SIZE, ICON_SIZE)
      drawable.draw(canvas)
    }
    return bitmap
  }

  //circle mask keeps icons consistent
  private fun circleCrop(source: Bitmap): Bitmap {
    val size = minOf(source.width, source.height)
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      shader = BitmapShader(source, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
    }
    Canvas(out).drawCircle(size / 2f, size / 2f, size / 2f, paint)
    source.recycle()
    return out
  }

  //close overlay keep the app alive
  @ReactMethod
  fun closeOverlay() {
    OverlayActivity.finishOverlay()
  }

  private fun encode(stream: ByteArrayOutputStream): String =
    Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)

  private fun WritableMap.putStringOrNull(key: String, value: String?) {
    if (value != null) putString(key, value) else putNull(key)
  }
}
