package __PACKAGE_NAME__

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlin.concurrent.thread

//listens for maestro until detection
class WakeWordModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  companion object {
    private const val NAME = "WakeWordModule"
    private const val TAG = "WakeWord"
    private const val SAMPLE_RATE = 16000

    @Volatile
    private var instance: WakeWordModule? = null

    //dream end must free the mic
    @JvmStatic
    fun stopListening() {
      instance?.running = false
    }
  }

  @Volatile
  private var running = false
  private var worker: Thread? = null
  private var detector: WakeWordDetector? = null

  init {
    instance = this
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun start(threshold: Double, promise: Promise) {
    if (worker?.isAlive == true) {
      promise.resolve(true)
      return
    }
    //dream cannot show the prompt
    val granted = reactApplicationContext.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    if (!granted) {
      promise.resolve(false)
      return
    }
    running = true
    worker = thread(name = "wakeword") { listen(threshold.toFloat()) }
    promise.resolve(true)
  }

  //resolves once the mic is released
  @ReactMethod
  fun stop(promise: Promise) {
    halt()
    promise.resolve(null)
  }

  private fun halt() {
    running = false
    worker?.join()
    worker = null
  }

  private fun listen(threshold: Float) {
    var score = 0f
    try {
      //models load once per process
      val det = detector ?: WakeWordDetector(reactApplicationContext).also { detector = it }
      det.reset()
      val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
      //closest to the unprocessed training audio
      val record = AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        maxOf(minBuffer * 4, WakeWordDetector.HOP * 8),
      )
      try {
        record.startRecording()
        val pcm = ShortArray(WakeWordDetector.HOP)
        while (running) {
          var read = 0
          while (read < pcm.size && running) {
            val n = record.read(pcm, read, pcm.size - read)
            if (n < 0) throw IllegalStateException("audio read failed $n")
            read += n
          }
          if (!running) break
          val s = det.process(pcm) ?: continue
          if (BuildConfig.DEBUG && s >= 0.1f) Log.d(TAG, "score %.3f".format(s))
          if (s >= threshold) {
            Log.i(TAG, "detected %.3f".format(s))
            score = s
            running = false
          }
        }
      } finally {
        record.stop()
        record.release()
      }
    } catch (e: Exception) {
      Log.w(TAG, "listening stopped", e)
      running = false
    }
    //free the mic before stt
    if (score > 0f) emit(score)
  }

  private fun emit(score: Float) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit("WAKEWORD_DETECTED", Arguments.createMap().apply { putDouble("score", score.toDouble()) })
  }

  override fun invalidate() {
    if (instance === this) instance = null
    halt()
    detector?.close()
    detector = null
    super.invalidate()
  }
}
