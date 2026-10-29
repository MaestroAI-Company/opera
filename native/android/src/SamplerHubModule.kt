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
import uniffi.sampler_hub_client.HubClient
import uniffi.sampler_hub_client.HubException
import uniffi.sampler_hub_client.HubProfile
import uniffi.sampler_hub_client.HubSettings
import uniffi.sampler_hub_client.LlamaStatus
import uniffi.sampler_hub_client.ModelFile
import uniffi.sampler_hub_client.PairedHub
import uniffi.sampler_hub_client.ProfileLock
//aliased so the bridge methods keep their js names
import uniffi.sampler_hub_client.openLockedKey as reopenLockedKey
import uniffi.sampler_hub_client.profileBackupKey as deriveBackupKey
import uniffi.sampler_hub_client.UnlockedProfile
import uniffi.sampler_hub_client.SyncRecord

//bridges the rust hub client to js
class SamplerHubModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var clientKey: String? = null
  private var client: HubClient? = null

  override fun getName(): String = "SamplerHubModule"

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
        status.cpu?.let { putDouble("cpu", it.toDouble()) }
        status.memory?.let { putDouble("memory", it.toDouble()) }
        status.ctxSize?.let { putDouble("ctxSize", it.toDouble()) }
        status.keepAlive?.let { putDouble("keepAlive", it.toDouble()) }
        status.parallel?.let { putDouble("parallel", it.toDouble()) }
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
      val wanted = HubSettings(
        settings.getBoolean("lanDiscovery"),
        settings.getBoolean("shareProviders"),
        settings.getBoolean("mcpServers"),
        settings.getBoolean("models"),
        settings.getBoolean("modelsNightly"),
        settings.getInt("ctxSize").toUInt(),
        settings.getInt("keepAlive").toUInt(),
        settings.getInt("parallel").toUInt(),
      )
      settingsToMap(client(deviceKey).setHubSettings(hubFromMap(hub), wanted))
    }

  //android drops multicast without a lock
  @ReactMethod
  fun nearbyHubs(deviceKey: String, waitMs: Double, promise: Promise) =
    launchPromise(promise) {
      val wifi = reactApplicationContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      val lock = wifi.createMulticastLock("sampler-hub").apply {
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
  fun modelsCatalog(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      Arguments.createArray().apply {
        for (model in client(deviceKey).modelsCatalog(hubFromMap(hub))) {
          pushMap(Arguments.createMap().apply {
            putString("repo", model.repo)
            putString("file", model.file)
            putString("name", model.name)
            putDouble("size", model.size.toDouble())
          })
        }
      }
    }

  @ReactMethod
  fun modelsSearch(deviceKey: String, hub: ReadableMap, query: String, promise: Promise) =
    launchPromise(promise) {
      Arguments.createArray().apply {
        for (repo in client(deviceKey).modelsSearch(hubFromMap(hub), query)) {
          pushMap(Arguments.createMap().apply {
            putString("repo", repo.repo)
            putDouble("downloads", repo.downloads.toDouble())
          })
        }
      }
    }

  @ReactMethod
  fun modelsFiles(deviceKey: String, hub: ReadableMap, repo: String, promise: Promise) =
    launchPromise(promise) {
      Arguments.createArray().apply {
        for (file in client(deviceKey).modelsFiles(hubFromMap(hub), repo)) pushMap(fileToMap(file))
      }
    }

  @ReactMethod
  fun modelsDownload(deviceKey: String, hub: ReadableMap, repo: String, file: String, promise: Promise) =
    launchPromise(promise) { statusToMap(client(deviceKey).modelsDownload(hubFromMap(hub), repo, file)) }

  @ReactMethod
  fun modelsCancel(deviceKey: String, hub: ReadableMap, file: String, promise: Promise) =
    launchPromise(promise) { statusToMap(client(deviceKey).modelsCancel(hubFromMap(hub), file)) }

  @ReactMethod
  fun modelsDelete(deviceKey: String, hub: ReadableMap, file: String, promise: Promise) =
    launchPromise(promise) { statusToMap(client(deviceKey).modelsDelete(hubFromMap(hub), file)) }

  @ReactMethod
  fun modelsStatus(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) { statusToMap(client(deviceKey).modelsStatus(hubFromMap(hub))) }

  //opera/mcp/1 json both ways
  @ReactMethod
  fun mcpJson(deviceKey: String, hub: ReadableMap, request: String, promise: Promise) =
    launchPromise(promise) { client(deviceKey).mcpJson(hubFromMap(hub), request) }

  @ReactMethod
  fun qrSvg(text: String, dark: String, light: String, promise: Promise) =
    launchPromise(promise) { uniffi.sampler_hub_client.qrSvg(text, dark, light) }

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
            putString("profile", device.profile)
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

  //the key comes from the secure store
  @ReactMethod
  fun setProfile(deviceKey: String, profileId: String, key: String, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).setProfile(profileId, key)
      null
    }

  @ReactMethod
  fun clearProfile(deviceKey: String, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).clearProfile()
      null
    }

  @ReactMethod
  fun profiles(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      Arguments.createArray().apply {
        for (profile in client(deviceKey).profiles(hubFromMap(hub))) pushMap(profileToMap(profile))
      }
    }

  @ReactMethod
  fun createProfile(deviceKey: String, hub: ReadableMap, name: String, password: String, promise: Promise) =
    launchPromise(promise) { unlockedToMap(client(deviceKey).createProfile(hubFromMap(hub), name, password)) }

  @ReactMethod
  fun unlockProfile(deviceKey: String, hub: ReadableMap, profileId: String, password: String, promise: Promise) =
    launchPromise(promise) { unlockedToMap(client(deviceKey).unlockProfile(hubFromMap(hub), profileId, password)) }

  @ReactMethod
  fun changePassword(deviceKey: String, hub: ReadableMap, current: String, next: String, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).changePassword(hubFromMap(hub), current, next)
      null
    }

  @ReactMethod
  fun lockedKey(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      val lock = client(deviceKey).lockedKey(hubFromMap(hub))
      Arguments.createMap().apply {
        putString("salt", lock.salt)
        putDouble("memoryKib", lock.memoryKib.toDouble())
        putDouble("passes", lock.passes.toDouble())
        putString("wrapped", lock.wrapped)
      }
    }

  //a cloud restore reopens the key without a hub
  @ReactMethod
  fun openLockedKey(lock: ReadableMap, password: String, promise: Promise) =
    launchPromise(promise) {
      reopenLockedKey(
        ProfileLock(
          lock.getString("salt") ?: "",
          lock.getDouble("memoryKib").toUInt(),
          lock.getDouble("passes").toUInt(),
          lock.getString("wrapped") ?: "",
        ),
        password,
      )
    }

  @ReactMethod
  fun profileBackupKey(key: String, promise: Promise) =
    launchPromise(promise) { deriveBackupKey(key) }

  @ReactMethod
  fun linkStart(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      val invite = client(deviceKey).linkStart(hubFromMap(hub))
      Arguments.createMap().apply {
        putString("code", invite.code)
        putString("link", invite.link)
      }
    }

  //null until a device typed the code
  @ReactMethod
  fun linkWatch(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).linkWatch(hubFromMap(hub))?.let { joining ->
        Arguments.createMap().apply {
          putString("device", joining.device)
          putString("digits", joining.digits)
        }
      }
    }

  @ReactMethod
  fun linkApprove(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).linkApprove(hubFromMap(hub))
      null
    }

  @ReactMethod
  fun linkDeny(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).linkDeny(hubFromMap(hub))
      null
    }

  @ReactMethod
  fun linkJoin(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).linkJoin(hubFromMap(hub))
      null
    }

  @ReactMethod
  fun linkFetch(deviceKey: String, hub: ReadableMap, promise: Promise) =
    launchPromise(promise) {
      val progress = client(deviceKey).linkFetch(hubFromMap(hub))
      Arguments.createMap().apply {
        putString("digits", progress.digits)
        progress.profile?.let { putMap("profile", unlockedToMap(it)) } ?: putNull("profile")
        putBoolean("denied", progress.denied)
      }
    }

  //one device of the profile refreshes a token at a time
  @ReactMethod
  fun lease(deviceKey: String, hub: ReadableMap, name: String, promise: Promise) =
    launchPromise(promise) { client(deviceKey).lease(hubFromMap(hub), name) }

  @ReactMethod
  fun release(deviceKey: String, hub: ReadableMap, name: String, promise: Promise) =
    launchPromise(promise) {
      client(deviceKey).release(hubFromMap(hub), name)
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

  private fun fileToMap(file: ModelFile): WritableMap =
    Arguments.createMap().apply {
      putString("file", file.file)
      putDouble("size", file.size.toDouble())
    }

  private fun statusToMap(status: LlamaStatus): WritableMap =
    Arguments.createMap().apply {
      putString("state", status.state)
      putString("backend", status.backend)
      putString("message", status.message)
      putArray("installed", Arguments.createArray().apply {
        for (model in status.installed) {
          pushMap(Arguments.createMap().apply {
            putString("file", model.file)
            putDouble("size", model.size.toDouble())
            putString("repo", model.repo)
          })
        }
      })
      putArray("downloads", Arguments.createArray().apply {
        for (download in status.downloads) {
          pushMap(Arguments.createMap().apply {
            putString("repo", download.repo)
            putString("file", download.file)
            putDouble("received", download.received.toDouble())
            putDouble("total", download.total.toDouble())
            putString("error", download.error)
          })
        }
      })
    }

  private fun profileToMap(profile: HubProfile): WritableMap =
    Arguments.createMap().apply {
      putString("id", profile.id)
      putString("name", profile.name)
      putString("role", profile.role)
      putDouble("createdAt", profile.createdAt.toDouble())
    }

  private fun unlockedToMap(unlocked: UnlockedProfile): WritableMap =
    Arguments.createMap().apply {
      putMap("profile", profileToMap(unlocked.profile))
      putString("key", unlocked.key)
      unlocked.lock?.let { lock ->
        putMap("lock", Arguments.createMap().apply {
          putString("salt", lock.salt)
          putDouble("memoryKib", lock.memoryKib.toDouble())
          putDouble("passes", lock.passes.toDouble())
          putString("wrapped", lock.wrapped)
        })
      }
    }

  private fun settingsToMap(settings: HubSettings): WritableMap =
    Arguments.createMap().apply {
      putBoolean("lanDiscovery", settings.lanDiscovery)
      putBoolean("shareProviders", settings.shareProviders)
      putBoolean("mcpServers", settings.mcpServers)
      putBoolean("models", settings.models)
      putBoolean("modelsNightly", settings.modelsNightly)
      putDouble("ctxSize", settings.ctxSize.toDouble())
      putDouble("keepAlive", settings.keepAlive.toDouble())
      putDouble("parallel", settings.parallel.toDouble())
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
