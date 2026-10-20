package __PACKAGE_NAME__

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import java.nio.FloatBuffer

//incremental livekit predict on 2 s
class WakeWordDetector(context: Context) : AutoCloseable {

  companion object {
    //80 ms adds 8 frames
    const val HOP = 1280
    private const val BINS = 32
    //2 s window gives 197 frames
    private const val WINDOW_FRAMES = 197
    private const val EMB_FRAMES = 76
    private const val EMB_STRIDE = 8
    private const val EMB_COUNT = 16
    private const val EMB_SIZE = 96
    private const val WARMUP_HOPS = 25
    //top_db of power_to_db
    private const val TOP_DB = 80f
    //stft kernel 512 hop 160
    private const val TAIL = 480
    private const val FRESH = HOP - 128
  }

  private val env = OrtEnvironment.getEnvironment()
  private val options = OrtSession.SessionOptions().apply {
    setIntraOpNumThreads(1)
    //idle spinning keeps a core busy
    addConfigEntry("session.intra_op.allow_spinning", "0")
  }
  //cut before the global max
  private val mel = load(context, "melspectrogram_raw.onnx")
  private val embedding = load(context, "embedding_model.onnx")
  private val classifier = load(context, "maestro.onnx")

  private val tail = FloatArray(TAIL)
  private var hops = 0
  private val frames = ArrayDeque<FloatArray>()
  //index of the oldest frame
  private var firstFrame = 0
  //window start to floor and embedding
  private val cache = HashMap<Int, Pair<Float, FloatArray>>()
  private val embInput = FloatArray(EMB_FRAMES * BINS)
  private val clfInput = FloatArray(EMB_COUNT * EMB_SIZE)

  private fun load(context: Context, name: String): OrtSession =
    env.createSession(context.assets.open("wakeword/$name").use { it.readBytes() }, options)

  fun reset() {
    hops = 0
    frames.clear()
    firstFrame = 0
    cache.clear()
  }

  //null until 2 s of audio
  fun process(pcm: ShortArray): Float? {
    hops++
    //first hop has no previous samples
    val offset = if (hops == 1) 0 else TAIL
    val input = FloatArray(offset + FRESH)
    tail.copyInto(input, 0, 0, offset)
    for (i in 0 until FRESH) input[offset + i] = pcm[i] / 32768f
    for (i in 0 until TAIL) tail[i] = pcm[HOP - TAIL + i] / 32768f

    val raw = run(mel, input, longArrayOf(1, input.size.toLong()))
    for (f in 0 until raw.size / BINS) frames.addLast(raw.copyOfRange(f * BINS, (f + 1) * BINS))
    while (frames.size > WINDOW_FRAMES) {
      frames.removeFirst()
      firstFrame++
    }
    if (hops < WARMUP_HOPS) return null

    var peak = Float.NEGATIVE_INFINITY
    for (frame in frames) for (v in frame) if (v > peak) peak = v
    val floor = peak - TOP_DB

    for (e in 0 until EMB_COUNT) {
      val start = firstFrame + e * EMB_STRIDE
      var low = Float.POSITIVE_INFINITY
      for (f in 0 until EMB_FRAMES) for (v in frames[e * EMB_STRIDE + f]) if (v < low) low = v
      val cached = cache[start]
      //floor clips nothing either way
      val emb = if (cached != null && (cached.first == floor || (low >= cached.first && low >= floor))) {
        cached.second
      } else {
        for (f in 0 until EMB_FRAMES) {
          val frame = frames[e * EMB_STRIDE + f]
          for (b in 0 until BINS) embInput[f * BINS + b] = maxOf(frame[b], floor) / 10f + 2f
        }
        run(embedding, embInput, longArrayOf(1, EMB_FRAMES.toLong(), BINS.toLong(), 1)).also {
          cache[start] = floor to it
        }
      }
      emb.copyInto(clfInput, e * EMB_SIZE)
    }
    cache.keys.removeAll { it < firstFrame }

    return run(classifier, clfInput, longArrayOf(1, EMB_COUNT.toLong(), EMB_SIZE.toLong()))[0]
  }

  private fun run(session: OrtSession, data: FloatArray, shape: LongArray): FloatArray =
    OnnxTensor.createTensor(env, FloatBuffer.wrap(data), shape).use { tensor ->
      session.run(mapOf(session.inputNames.first() to tensor)).use { result ->
        val out = (result[0] as OnnxTensor).floatBuffer
        FloatArray(out.remaining()).also { out.get(it) }
      }
    }

  override fun close() {
    mel.close()
    embedding.close()
    classifier.close()
    options.close()
  }
}
