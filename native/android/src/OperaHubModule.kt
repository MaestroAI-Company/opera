package __PACKAGE_NAME__

import android.content.Context
import android.net.wifi.WifiManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import uniffi.opera_hub_client.HubClient
import uniffi.opera_hub_client.HubException
import uniffi.opera_hub_client.HubSettings
import uniffi.opera_hub_client.McpGrant
import uniffi.opera_hub_client.PairedHub
import uniffi.opera_hub_client.SyncRecord

//bridges the rust hub client to js
class OperaHubModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var clientKey: String? = null
  private var client: HubClient? = null

  override fun getName(): String = "OperaHubModule"

  @ReactMethod
  fun deviceId(deviceKey: String, promise: Promise) =
    launchPromise(promise) { client(deviceKey).deviceId() }

  @ReactMethod
  fun pair(deviceKey: String, link: String, deviceName: String, kind: String, promise: Promise) =
    launchPromise(promise) { hubToMap(client(deviceKey).pair(link, deviceName, kind, machineId())) }

  @ReactMethod
  fun status(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      val status = client(deviceKey).status(hubFromMap(hub))
      Arguments.createMap().apply {
        putString("name", status.name)
        putString("version", status.version)
        putBoolean("direct", status.direct)
        putString("update", status.update)
      }
    }

  @ReactMethod
  fun updateHub(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) { client(deviceKey).updateHub(hubFromMap(hub)) }

  @ReactMethod
  fun pairWithCode(deviceKey: String, code: String, deviceName: String, kind: String, promise: Promise) =
    launchPromise(promise) { hubToMap(client(deviceKey).pairWithCode(code, deviceName, kind, machineId())) }

  @ReactMethod
  fun invite(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      val invite = client(deviceKey).invite(hubFromMap(hub))
      Arguments.createMap().apply {
        putString("code", invite.code)
        putString("link", invite.link)
      }
    }

  @ReactMethod
  fun hubSettings(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) { settingsToMap(client(deviceKey).hubSettings(hubFromMap(hub))) }

  @ReactMethod
  fun setHubSettings(deviceKey: String, hub: ReadableMap, settings: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      val wanted = HubSettings(settings.getBoolean("lanDiscovery"), settings.getBoolean("shareProviders"))
      settingsToMap(client(deviceKey).setHubSettings(hubFromMap(hub), wanted))
    }

  //android drops multicast without a lock
  @ReactMethod
  fun nearbyHubs(deviceKey: String, waitMs: Double, promise: Promise) =
    launchPromise(promise) {
      val wifi = reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      val lock = wifi.createMulticastLock("opera-hub").apply {
        setReferenceCounted(false)
        acquire()
      }
      try {
        Arguments.createArray().apply {
          for (hub in client(deviceKey).nearbyHubs(waitMs.toLong().toULong())) {
            pushMap(Arguments.createMap().apply {
              putString("id", hub.id)
              putString("name", hub.name)
              putArray("addrs", Arguments.fromList(hub.addrs))
            })
          }
        }
      } finally {
        lock.release()
      }
    }

  @ReactMethod
  fun qrSvg(text: String, dark: String, light: String, promise: Promise) =
    launchPromise(promise) { uniffi.opera_hub_client.qrSvg(text, dark, light) }

  @ReactMethod
  fun unpair(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).unpair(hubFromMap(hub))
      null
    }

  @ReactMethod
  fun renameDevice(deviceKey: String, hub: ReadableMap, id: String, name: String, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).renameDevice(hubFromMap(hub), id, name)
      null
    }

  @ReactMethod
  fun removeDevice(deviceKey: String, hub: ReadableMap, id: String, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).removeDevice(hubFromMap(hub), id)
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

  @ReactMethod
  fun push(deviceKey: String, hub: ReadableMap, collection: String, records: ReadableArray, promise: Promise) =
    launchPromise(promise) {
      val list = (0 until records.size()).map { i ->
        val record = records.getMap(i)!!
        SyncRecord(
          record.getString("id") ?: "",
          record.getDouble("updatedAt").toULong(),
          record.getBoolean("deleted"),
          if (record.isNull("payload")) null else record.getString("payload"),
        )
      }
      client(deviceKey).push(hubFromMap(hub), collection, list)
      null
    }

  @ReactMethod
  fun pull(deviceKey: String, hub: ReadableMap, collection: String, since: Double, promise: Promise) =
    launchPromise(promise) {
      val page = client(deviceKey).pull(hubFromMap(hub), collection, since.toULong())
      Arguments.createMap().apply {
        putArray("records", Arguments.createArray().apply {
          for (record in page.records) {
            pushMap(Arguments.createMap().apply {
              putString("id", record.id)
              //unix millis fit a js number
              putDouble("updatedAt", record.updatedAt.toDouble())
              putBoolean("deleted", record.deleted)
              putString("payload", record.payload)
            })
          }
        })
        putDouble("cursor", page.cursor.toDouble())
        putBoolean("more", page.more)
      }
    }

  //resolves once the hub has newer data
  @ReactMethod
  fun watch(deviceKey: String, hub: ReadableMap, since: Double, promise: Promise) =
    launchPromise(promise) { client(deviceKey).watch(hubFromMap(hub), since.toULong()).toDouble() }

  @ReactMethod
  fun putGrant(deviceKey: String, hub: ReadableMap, grant: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).putGrant(
        hubFromMap(hub),
        McpGrant(
          grant.getString("serverId") ?: "",
          grant.getString("tokenEndpoint") ?: "",
          grant.getString("clientId") ?: "",
          grant.getString("refreshToken") ?: "",
          if (grant.isNull("accessToken")) null else grant.getString("accessToken"),
          grant.getDouble("expiresAt").toULong(),
        ),
      )
      null
    }

  @ReactMethod
  fun accessToken(deviceKey: String, hub: ReadableMap, serverId: String, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).accessToken(hubFromMap(hub), serverId)?.let { token ->
        Arguments.createMap().apply {
          putString("accessToken", token.accessToken)
          putDouble("expiresAt", token.expiresAt.toDouble())
        }
      }
    }

  @ReactMethod
  fun dropGrant(deviceKey: String, hub: ReadableMap, serverId: String, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).dropGrant(hubFromMap(hub), serverId)
      null
    }

  @ReactMethod
  fun providers(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      Arguments.createArray().apply {
        for (provider in client(deviceKey).providers(hubFromMap(hub))) {
          pushMap(Arguments.createMap().apply {
            putString("id", provider.id)
            putString("name", provider.name)
            putString("kind", provider.kind)
          })
        }
      }
    }

  @ReactMethod
  fun startProxy(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      val proxy = client(deviceKey).startProxy(hubFromMap(hub))
      Arguments.createMap().apply {
        putInt("port", proxy.port.toInt())
        putString("token", proxy.token)
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

  //stable across reinstalls of this app, hashed by the client
  private fun machineId(): String? =
    Settings.Secure.getString(reactApplicationContext.contentResolver, Settings.Secure.ANDROID_ID)

  private fun settingsToMap(settings: HubSettings): WritableMap =
    Arguments.createMap().apply {
      putBoolean("lanDiscovery", settings.lanDiscovery)
      putBoolean("shareProviders", settings.shareProviders)
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
