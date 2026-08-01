package __PACKAGE_NAME__

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.ParcelFileDescriptor
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mlkit.genai.common.DownloadStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.common.audio.AudioSource
import com.google.mlkit.genai.speechrecognition.SpeechRecognition
import com.google.mlkit.genai.speechrecognition.SpeechRecognizer
import com.google.mlkit.genai.speechrecognition.SpeechRecognizerOptions
import com.google.mlkit.genai.speechrecognition.SpeechRecognizerRequest
import com.google.mlkit.genai.speechrecognition.SpeechRecognizerResponse
import java.io.IOException
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class AICoreSpeechModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "AICoreSpeechModule"
    private const val SAMPLE_RATE = 16000
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var recognizer: SpeechRecognizer? = null
  private var recognitionJob: Job? = null
  private var captureJob: Job? = null
  private var audioRecord: AudioRecord? = null
  private var pipeOut: OutputStream? = null
  private var readFd: ParcelFileDescriptor? = null

  override fun getName(): String = "AICoreSpeechModule"

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  @ReactMethod
  fun checkStatus(localeTag: String, promise: Promise) {
    scope.launch {
      try {
        promise.resolve(getRecognizer(localeTag).checkStatus())
      } catch (e: Exception) {
        promise.reject("ERROR", e.message ?: "error")
      }
    }
  }

  //download model, emits progress events
  @ReactMethod
  fun download(localeTag: String, promise: Promise) {
    scope.launch {
      try {
        getRecognizer(localeTag).download().collect { status ->
          when (status) {
            is DownloadStatus.DownloadStarted -> emit("AICoreDownloadStarted", mapOf("bytes" to 0L))
            is DownloadStatus.DownloadProgress -> emit("AICoreDownloadProgress", mapOf("bytes" to status.totalBytesDownloaded))
            is DownloadStatus.DownloadFailed -> throw status.e
            is DownloadStatus.DownloadCompleted -> emit("AICoreDownloadCompleted", mapOf())
          }
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ERROR", e.message ?: "error")
      }
    }
  }

  //start streaming, emits partial/final/error/done/volume
  //mic captured once, fed to aicore pipe, rms to js
  @ReactMethod
  fun startRecognition(localeTag: String, requestId: String, promise: Promise) {
    scope.launch {
      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
          promise.reject("UNSUPPORTED", "Mic audio source requires Android 12+")
          return@launch
        }
        val recognizer = getRecognizer(localeTag)
        val readEnd = setupMicCapture(requestId)

        val request = SpeechRecognizerRequest.Builder().apply {
          audioSource = AudioSource.fromPfd(
            readEnd,
            AudioSource.Mode.STREAMING,
            AudioFormat.Builder()
              .setSampleRate(SAMPLE_RATE)
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
              .build()
          )
        }.build()
        readFd = readEnd

        recognitionJob?.cancel()
        recognitionJob = scope.launch {
          try {
            recognizer.startRecognition(request).collect { response ->
              when (response) {
                is SpeechRecognizerResponse.PartialTextResponse -> emit("AICorePartial", mapOf("requestId" to requestId, "text" to response.text))
                is SpeechRecognizerResponse.FinalTextResponse -> emit("AICoreFinal", mapOf("requestId" to requestId, "text" to response.text))
                is SpeechRecognizerResponse.ErrorResponse -> emit("AICoreSpeechError", mapOf("requestId" to requestId, "message" to (response.e.message ?: "recognition error")))
                is SpeechRecognizerResponse.CompletedResponse -> emit("AICoreSpeechDone", mapOf("requestId" to requestId))
              }
            }
          } catch (e: GenAiException) {
            emit("AICoreSpeechError", mapOf("requestId" to requestId, "message" to (e.message ?: "recognition error")))
          } catch (e: CancellationException) {
            emit("AICoreSpeechDone", mapOf("requestId" to requestId))
          } catch (e: Exception) {
            emit("AICoreSpeechError", mapOf("requestId" to requestId, "message" to (e.message ?: "recognition error")))
          }
        }
        promise.resolve(true)
      } catch (e: Exception) {
        cleanupCapture()
        promise.reject("ERROR", e.message ?: "error")
      }
    }
  }

  @ReactMethod
  fun stopRecognition(promise: Promise) {
    scope.launch {
      try {
        recognitionJob?.cancel()
        recognitionJob = null
        recognizer?.let {
          it.stopRecognition()
          it.close()
        }
        recognizer = null
        cleanupCapture()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("ERROR", e.message ?: "error")
      }
    }
  }

  //open 16khz mic record, pipe to aicore, emit rms
  private fun setupMicCapture(requestId: String): ParcelFileDescriptor {
    val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val recorder = AudioRecord(
      MediaRecorder.AudioSource.MIC,
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
      maxOf(minBuf, SAMPLE_RATE * 2 * 2)
    )
    if (recorder.state != AudioRecord.STATE_INITIALIZED) {
      recorder.release()
      throw IllegalStateException("Failed to initialize AudioRecord")
    }
    audioRecord = recorder
    recorder.startRecording()

    val pipe = ParcelFileDescriptor.createPipe()
    val writeEnd = pipe[1]
    pipeOut = ParcelFileDescriptor.AutoCloseOutputStream(writeEnd)

    captureJob = scope.launch {
      val buf = ShortArray(SAMPLE_RATE / 10)
      val byteBuf = ByteBuffer.allocate(buf.size * 2).order(ByteOrder.nativeOrder())
      while (isActive) {
        val read = recorder.read(buf, 0, buf.size, AudioRecord.READ_BLOCKING)
        if (read > 0) {
          byteBuf.clear()
          byteBuf.asShortBuffer().put(buf, 0, read)
          try {
            pipeOut?.write(byteBuf.array(), 0, read * 2)
          } catch (e: IOException) {
            break
          }
          var sum = 0.0
          for (i in 0 until read) {
            val v = buf[i] / 32768.0
            sum += v * v
          }
          emit("AICoreVolume", mapOf("requestId" to requestId, "volume" to Math.sqrt(sum / read)))
        }
      }
    }
    return pipe[0]
  }

  private fun cleanupCapture() {
    captureJob?.cancel()
    captureJob = null
    try {
      audioRecord?.stop()
    } catch (e: IllegalStateException) {
    }
    audioRecord?.release()
    audioRecord = null
    try {
      pipeOut?.close()
    } catch (e: IOException) {
    }
    pipeOut = null
    try {
      readFd?.close()
    } catch (e: IOException) {
    }
    readFd = null
  }

  //create or reuse the advanced recognizer
  private fun getRecognizer(localeTag: String): SpeechRecognizer {
    if (recognizer == null) {
      val locale = try {
        Locale.forLanguageTag(localeTag)
      } catch (e: Exception) {
        Locale.US
      }
      recognizer = SpeechRecognition.getClient(
        SpeechRecognizerOptions.builder().apply {
          this.locale = locale
          this.preferredMode = SpeechRecognizerOptions.Mode.MODE_ADVANCED
        }.build()
      )
    }
    return recognizer!!
  }

  private fun emit(eventName: String, data: Map<String, Any>) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, Arguments.makeNativeMap(data))
  }
}
