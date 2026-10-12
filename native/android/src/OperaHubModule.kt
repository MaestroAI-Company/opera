package __PACKAGE_NAME__

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import uniffi.opera_hub_client.HubClient
import uniffi.opera_hub_client.HubException
import uniffi.opera_hub_client.PairedHub

//bridges the rust hub client to js
class OperaHubModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var clientKey: String? = null
  private var client: HubClient? = null

  override fun getName(): String = "OperaHubModule"

  @ReactMethod
  fun pair(deviceKey: String, link: String, deviceName: String, kind: String, promise: Promise) =
    launchPromise(promise) { hubToMap(client(deviceKey).pair(link, deviceName, kind)) }

  @ReactMethod
  fun status(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      val status = client(deviceKey).status(hubFromMap(hub))
      Arguments.createMap().apply {
        putString("name", status.name)
        putString("version", status.version)
        putBoolean("direct", status.direct)
      }
    }

  @ReactMethod
  fun unpair(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).unpair(hubFromMap(hub))
      null
    }

  @ReactMethod
  fun devices(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      Arguments.createArray().apply {
        for (device in client(deviceKey).devices(hubFromMap(hub))) {
          pushMap(Arguments.createMap().apply {
            putString("id", device.id)
            putString("name", device.name)
            putString("kind", device.kind)
            putArray("scopes", Arguments.fromList(device.scopes))
            //unix seconds fit a js number
            putDouble("pairedAt", device.pairedAt.toDouble())
            putString("pairedBy", device.pairedBy)
            device.lastSeen?.let { putDouble("lastSeen", it.toDouble()) }
          })
        }
      }
    }

  //one client owns the iroh endpoint
  @Synchronized
  private fun client(deviceKey: String): HubClient {
    client?.let { if (clientKey == deviceKey) return it }
    client?.close()
    val created = HubClient(deviceKey.chunked(2).map { it.toInt(16).toByte() }.toByteArray())
    clientKey = deviceKey
    client = created
    return created
  }

  //js matches on the error code
  private fun launchPromise(promise: Promise, block: suspend () -> Any?) {
    scope.launch {
      try {
        promise.resolve(block())
      } catch (e: HubException) {
        promise.reject(e.javaClass.simpleName, e.message, e)
      } catch (e: Exception) {
        promise.reject("Internal", e.message, e)
      }
    }
  }

  private fun hubToMap(hub: PairedHub): WritableMap =
    Arguments.createMap().apply {
      putString("id", hub.id)
      putString("name", hub.name)
      putArray("relays", Arguments.fromList(hub.relays))
    }

  private fun hubFromMap(map: ReadableMap): PairedHub {
    val relays = map.getArray("relays")?.toArrayList()?.map { it.toString() } ?: emptyList()
    return PairedHub(map.getString("id") ?: "", map.getString("name") ?: "", relays)
  }

  override fun invalidate() {
    scope.cancel()
    client?.close()
    client = null
    clientKey = null
    super.invalidate()
  }
}
