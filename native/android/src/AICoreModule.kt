package __PACKAGE_NAME__

import android.graphics.BitmapFactory
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.common.GenAiException
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerationConfig
import com.google.mlkit.genai.prompt.ImagePart
import com.google.mlkit.genai.prompt.ModelConfig
import com.google.mlkit.genai.prompt.ModelPreference
import com.google.mlkit.genai.prompt.ModelReleaseStage
import com.google.mlkit.genai.prompt.SystemInstruction
import com.google.mlkit.genai.prompt.TextPart
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class AICoreModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "AICoreModule"
    private val AVAILABLE_MODELS = listOf(
      "aicore-nano-full-stable",
      "aicore-nano-fast-stable",
      "aicore-nano-full-preview",
      "aicore-nano-fast-preview",
    )
  }

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val activeJobs = HashMap<String, Job>()
  private val modelCache = HashMap<String, GenerativeModel>()

  override fun getName(): String = "AICoreModule"

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  //check if gemini nano is usable on this device
  @ReactMethod
  fun isAvailable(promise: Promise) {
    scope.launch {
      try {
        val status = getModel(AVAILABLE_MODELS[0]).checkStatus()
        promise.resolve(status == FeatureStatus.AVAILABLE || status == FeatureStatus.DOWNLOADABLE)
      } catch (e: Exception) {
        promise.reject("ERROR", e.message ?: "error")
      }
    }
  }

  @ReactMethod
  fun getAvailableModels(promise: Promise) {    promise.resolve(Arguments.makeNativeArray(AVAILABLE_MODELS))
  }

  @ReactMethod
  fun checkStatus(modelName: String, promise: Promise) {
    scope.launch {
      try {
        promise.resolve(getModel(modelName).checkStatus())
      } catch (e: Exception) {
        promise.reject("ERROR", e.message ?: "error")
      }
    }
  }

  //resolve the on-device base model name (nano-v2 / nano-v3)
  @ReactMethod
  fun getBaseModelName(promise: Promise) {
    scope.launch {
      try {
        promise.resolve(getModel(AVAILABLE_MODELS[0]).getBaseModelName())
      } catch (e: Exception) {
        promise.reject("ERROR", e.message ?: "error")
      }
    }
  }

  //facts the sdk reports for one variant, missing keys are unknown
  @ReactMethod
  fun getModelInfo(modelName: String, promise: Promise) {
    scope.launch {
      val model = getModel(modelName)
      val info = Arguments.createMap()
      runCatching { model.checkStatus() }.onSuccess { info.putInt("status", it) }
      runCatching { model.getBaseModelName() }.onSuccess { info.putString("baseModelName", it) }
      runCatching { model.getTokenLimit() }.onSuccess { info.putInt("tokenLimit", it) }
      runCatching { model.isThinkingModeAvailable() }.onSuccess { info.putBoolean("thinking", it) }
      promise.resolve(info)
    }
  }

  //whether the on-device gemini nano supports thinking mode
  @ReactMethod
  fun isThinkingModeAvailable(modelName: String, promise: Promise) {
    scope.launch {
      try {
        promise.resolve(getModel(modelName).isThinkingModeAvailable())
      } catch (e: Exception) {
        promise.reject("ERROR", e.message ?: "error")
      }
    }
  }

  //stream chat completion, emits AICoreToken events
  @ReactMethod
  fun generateContentStream(
    modelName: String,
    systemPrompt: String?,
    prompt: String,
    imageBase64: String?,
    think: Boolean,
    requestId: String,
    promise: Promise
  ) {
    val job = scope.launch {
      var fullText = ""
      try {
        val model = getModel(modelName)
        val status = model.checkStatus()
        if (status != FeatureStatus.AVAILABLE && status != FeatureStatus.DOWNLOADABLE) {
          promise.reject("NOT_AVAILABLE", "Model not available on this device (status $status)")
          return@launch
        }

        val request = if (imageBase64.isNullOrEmpty()) {
          GenerateContentRequest.builder(TextPart(prompt))
        } else {
          val decoded = Base64.decode(imageBase64, Base64.DEFAULT)
          val bitmap = BitmapFactory.decodeByteArray(decoded, 0, decoded.size)
          if (bitmap == null) {
            promise.reject("INVALID_IMAGE", "Could not decode image")
            return@launch
          }
          GenerateContentRequest.builder(ImagePart(bitmap), TextPart(prompt))
        }.apply {
          if (!systemPrompt.isNullOrEmpty()) this.systemInstruction = SystemInstruction(systemPrompt)
          if (think) this.enableThinking = true
        }.build()

        if (think) {
          fullText = generateThinking(model, request, requestId)
        } else {
          model.generateContentStream(request).collect { response ->
            val text = response.candidates.firstOrNull()?.text ?: return@collect
            if (text.isNotEmpty()) {
              fullText += text
              emit("AICoreToken", mapOf("requestId" to requestId, "chunk" to text))
            }
          }
        }
        emit("AICoreDone", mapOf("requestId" to requestId, "text" to fullText))
        promise.resolve(fullText)
      } catch (e: CancellationException) {
        emit("AICoreAborted", mapOf("requestId" to requestId))
        promise.reject("ABORTED", "Generation aborted")
      } catch (e: GenAiException) {
        emit("AICoreError", mapOf("requestId" to requestId, "message" to (e.message ?: "genai error"), "code" to e.errorCode))
        promise.reject("GENAI_ERROR", e.message ?: "genai error")
      } catch (e: Exception) {
        emit("AICoreError", mapOf("requestId" to requestId, "message" to (e.message ?: "error")))
        promise.reject("ERROR", e.message ?: "error")
      }
    }
    activeJobs[requestId] = job
  }

  //stream thinking, wrapped in <think> like ollama
  private suspend fun generateThinking(
    model: GenerativeModel,
    request: GenerateContentRequest,
    requestId: String
  ): String {
    var fullText = ""
    var seenThought = ""
    var thinkOpened = false
    model.generateContentStream(request).collect { response ->
      val thought = response.thoughtProcess.joinToString("") { it.text ?: "" }
      if (thought != seenThought) {
        val delta = if (thought.startsWith(seenThought)) thought.removePrefix(seenThought) else thought
        seenThought = thought
        if (delta.isNotEmpty()) {
          if (!thinkOpened) {
            fullText += "<think>\n"
            emit("AICoreToken", mapOf("requestId" to requestId, "chunk" to "<think>\n"))
            thinkOpened = true
          }
          fullText += delta
          emit("AICoreToken", mapOf("requestId" to requestId, "chunk" to delta))
        }
      }
      val text = response.candidates.firstOrNull()?.text ?: ""
      if (text.isNotEmpty()) {
        if (thinkOpened) {
          fullText += "\n</think>\n"
          emit("AICoreToken", mapOf("requestId" to requestId, "chunk" to "\n</think>\n"))
          thinkOpened = false
        }
        fullText += text
        emit("AICoreToken", mapOf("requestId" to requestId, "chunk" to text))
      }
    }
    if (thinkOpened) {
      fullText += "\n</think>\n"
      emit("AICoreToken", mapOf("requestId" to requestId, "chunk" to "\n</think>\n"))
    }
    return fullText
  }

  @ReactMethod
  fun abortGeneration(requestId: String) {
    activeJobs.remove(requestId)?.cancel()
  }

  //create or reuse a model client for the given variant
  private fun getModel(modelName: String): GenerativeModel {
    return modelCache.getOrPut(modelName) {
      var preference = ModelPreference.FULL
      var stage = ModelReleaseStage.STABLE
      if (modelName.contains("fast")) preference = ModelPreference.FAST
      if (modelName.contains("preview")) stage = ModelReleaseStage.PREVIEW
      Generation.getClient(
        GenerationConfig.builder().apply {
          this.modelConfig = ModelConfig.builder().apply {
            this.preference = preference
            this.releaseStage = stage
          }.build()
        }.build()
      )
    }
  }

  private fun emit(eventName: String, data: Map<String, Any>) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, Arguments.makeNativeMap(data))
  }
}
