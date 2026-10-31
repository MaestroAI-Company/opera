import Foundation
import React
import UIKit

//bridges the rust hub client to js
@objc(SamplerHubModule)
class SamplerHubModule: NSObject {
  private let lock = NSLock()
  private var clientKey: String?
  private var client: HubClient?

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func deviceId(_ deviceKey: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try self.client(deviceKey).deviceId() }
  }

  @objc func pair(_ deviceKey: String, link: String, deviceName: String, kind: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      self.hubToMap(try await self.client(deviceKey).pair(link: link, deviceName: deviceName, kind: kind, machine: await self.machineId()))
    }
  }

  @objc func status(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      let status = try await self.client(deviceKey).status(hub: self.hubFromMap(hub))
      var map: [String: Any] = [
        "name": status.name,
        "version": status.version,
        "direct": status.direct,
        "update": self.opt(status.update),
      ]
      if let cpu = status.cpu { map["cpu"] = Double(cpu) }
      if let memory = status.memory { map["memory"] = Double(memory) }
      if let ctxSize = status.ctxSize { map["ctxSize"] = Double(ctxSize) }
      if let keepAlive = status.keepAlive { map["keepAlive"] = Double(keepAlive) }
      if let parallel = status.parallel { map["parallel"] = Double(parallel) }
      return map
    }
  }

  @objc func updateHub(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try await self.client(deviceKey).updateHub(hub: self.hubFromMap(hub)) }
  }

  @objc func pairWithCode(_ deviceKey: String, code: String, deviceName: String, kind: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      self.hubToMap(try await self.client(deviceKey).pairWithCode(code: code, deviceName: deviceName, kind: kind, machine: await self.machineId()))
    }
  }

  @objc func invite(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      let invite = try await self.client(deviceKey).invite(hub: self.hubFromMap(hub))
      return ["code": invite.code, "link": invite.link]
    }
  }

  @objc func hubSettings(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { self.settingsToMap(try await self.client(deviceKey).hubSettings(hub: self.hubFromMap(hub))) }
  }

  @objc func setHubSettings(_ deviceKey: String, hub: [String: Any], settings: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      let wanted = HubSettings(
        lanDiscovery: settings["lanDiscovery"] as? Bool ?? false,
        shareProviders: settings["shareProviders"] as? Bool ?? false,
        mcpServers: settings["mcpServers"] as? Bool ?? false,
        models: settings["models"] as? Bool ?? false,
        modelsNightly: settings["modelsNightly"] as? Bool ?? false,
        ctxSize: UInt32(settings["ctxSize"] as? Double ?? 0),
        keepAlive: UInt32(settings["keepAlive"] as? Double ?? 0),
        parallel: UInt32(settings["parallel"] as? Double ?? 0)
      )
      return self.settingsToMap(try await self.client(deviceKey).setHubSettings(hub: self.hubFromMap(hub), settings: wanted))
    }
  }

  @objc func modelsCatalog(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).modelsCatalog(hub: self.hubFromMap(hub)).map { model in
        ["repo": model.repo, "file": model.file, "name": model.name, "size": Double(model.size)] as [String: Any]
      }
    }
  }

  @objc func modelsSearch(_ deviceKey: String, hub: [String: Any], query: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).modelsSearch(hub: self.hubFromMap(hub), query: query).map { repo in
        ["repo": repo.repo, "downloads": Double(repo.downloads)] as [String: Any]
      }
    }
  }

  @objc func modelsFiles(_ deviceKey: String, hub: [String: Any], repo: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).modelsFiles(hub: self.hubFromMap(hub), repo: repo).map(self.fileToMap)
    }
  }

  @objc func modelsDownload(_ deviceKey: String, hub: [String: Any], repo: String, file: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { self.statusToMap(try await self.client(deviceKey).modelsDownload(hub: self.hubFromMap(hub), repo: repo, file: file)) }
  }

  @objc func modelsCancel(_ deviceKey: String, hub: [String: Any], file: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { self.statusToMap(try await self.client(deviceKey).modelsCancel(hub: self.hubFromMap(hub), file: file)) }
  }

  @objc func modelsDelete(_ deviceKey: String, hub: [String: Any], file: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { self.statusToMap(try await self.client(deviceKey).modelsDelete(hub: self.hubFromMap(hub), file: file)) }
  }

  @objc func modelsStatus(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { self.statusToMap(try await self.client(deviceKey).modelsStatus(hub: self.hubFromMap(hub))) }
  }

  //opera/mcp/1 json both ways
  @objc func mcpJson(_ deviceKey: String, hub: [String: Any], request: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try await self.client(deviceKey).mcpJson(hub: self.hubFromMap(hub), request: request) }
  }

  @objc func qrSvg(_ text: String, dark: String, light: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try SamplerHubClient.qrSvg(text: text, dark: dark, light: light) }
  }

  @objc func unpair(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).unpair(hub: self.hubFromMap(hub))
      return nil
    }
  }

  @objc func renameDevice(_ deviceKey: String, hub: [String: Any], id: String, name: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).renameDevice(hub: self.hubFromMap(hub), id: id, name: name)
      return nil
    }
  }

  @objc func removeDevice(_ deviceKey: String, hub: [String: Any], id: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).removeDevice(hub: self.hubFromMap(hub), id: id)
      return nil
    }
  }

  @objc func devices(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).devices(hub: self.hubFromMap(hub)).map { device in
        var map: [String: Any] = [
          "id": device.id,
          "name": device.name,
          "kind": device.kind,
          "scopes": device.scopes,
          //unix seconds fit a js number
          "pairedAt": Double(device.pairedAt),
          "pairedBy": self.opt(device.pairedBy),
          "profile": self.opt(device.profile),
        ]
        if let lastSeen = device.lastSeen { map["lastSeen"] = Double(lastSeen) }
        return map
      }
    }
  }

  @objc func push(_ deviceKey: String, hub: [String: Any], collection: String, records: [[String: Any]], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      let list = records.map { record in
        SyncRecord(
          id: record["id"] as? String ?? "",
          updatedAt: UInt64(record["updatedAt"] as? Double ?? 0),
          deleted: record["deleted"] as? Bool ?? false,
          payload: record["payload"] as? String
        )
      }
      try await self.client(deviceKey).push(hub: self.hubFromMap(hub), collection: collection, records: list)
      return nil
    }
  }

  @objc func pull(_ deviceKey: String, hub: [String: Any], collection: String, since: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      let page = try await self.client(deviceKey).pull(hub: self.hubFromMap(hub), collection: collection, since: UInt64(since))
      return [
        "records": page.records.map { record in
          [
            "id": record.id,
            //unix millis fit a js number
            "updatedAt": Double(record.updatedAt),
            "deleted": record.deleted,
            "payload": self.opt(record.payload),
          ] as [String: Any]
        },
        "cursor": Double(page.cursor),
        "more": page.more,
      ] as [String: Any]
    }
  }

  //resolves once the hub has newer data
  @objc func watch(_ deviceKey: String, hub: [String: Any], since: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { Double(try await self.client(deviceKey).watch(hub: self.hubFromMap(hub), since: UInt64(since))) }
  }

  //the key comes from the secure store
  @objc func setProfile(_ deviceKey: String, profileId: String, key: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try self.client(deviceKey).setProfile(profileId: profileId, key: key)
      return nil
    }
  }

  @objc func clearProfile(_ deviceKey: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try self.client(deviceKey).clearProfile()
      return nil
    }
  }

  @objc func profiles(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try await self.client(deviceKey).profiles(hub: self.hubFromMap(hub)).map(self.profileToMap) }
  }

  @objc func createProfile(_ deviceKey: String, hub: [String: Any], name: String, password: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      self.unlockedToMap(try await self.client(deviceKey).createProfile(hub: self.hubFromMap(hub), name: name, password: password))
    }
  }

  @objc func unlockProfile(_ deviceKey: String, hub: [String: Any], profileId: String, password: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      self.unlockedToMap(try await self.client(deviceKey).unlockProfile(hub: self.hubFromMap(hub), profileId: profileId, password: password))
    }
  }

  @objc func changePassword(_ deviceKey: String, hub: [String: Any], current: String, next: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).changePassword(hub: self.hubFromMap(hub), current: current, new: next)
      return nil
    }
  }

  @objc func renameProfile(_ deviceKey: String, hub: [String: Any], name: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { self.profileToMap(try await self.client(deviceKey).renameProfile(hub: self.hubFromMap(hub), name: name)) }
  }

  @objc func lockedKey(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { self.lockToMap(try await self.client(deviceKey).lockedKey(hub: self.hubFromMap(hub))) }
  }

  //a cloud restore reopens the key without a hub
  @objc func openLockedKey(_ lock: [String: Any], password: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      let profileLock = ProfileLock(
        salt: lock["salt"] as? String ?? "",
        memoryKib: UInt32(lock["memoryKib"] as? Double ?? 0),
        passes: UInt32(lock["passes"] as? Double ?? 0),
        wrapped: lock["wrapped"] as? String ?? ""
      )
      return try SamplerHubClient.openLockedKey(lock: profileLock, password: password)
    }
  }

  @objc func profileBackupKey(_ key: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try SamplerHubClient.profileBackupKey(key: key) }
  }

  @objc func linkStart(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      let invite = try await self.client(deviceKey).linkStart(hub: self.hubFromMap(hub))
      return ["code": invite.code, "link": invite.link]
    }
  }

  //null until a device typed the code
  @objc func linkWatch(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      guard let joining = try await self.client(deviceKey).linkWatch(hub: self.hubFromMap(hub)) else { return nil }
      return ["device": joining.device, "digits": joining.digits]
    }
  }

  @objc func linkApprove(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).linkApprove(hub: self.hubFromMap(hub))
      return nil
    }
  }

  @objc func linkDeny(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).linkDeny(hub: self.hubFromMap(hub))
      return nil
    }
  }

  @objc func linkJoin(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).linkJoin(hub: self.hubFromMap(hub))
      return nil
    }
  }

  @objc func linkFetch(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      let progress = try await self.client(deviceKey).linkFetch(hub: self.hubFromMap(hub))
      return [
        "digits": self.opt(progress.digits),
        "profile": self.opt(progress.profile.map(self.unlockedToMap)),
        "denied": progress.denied,
      ] as [String: Any]
    }
  }

  //one device of the profile refreshes a token at a time
  @objc func lease(_ deviceKey: String, hub: [String: Any], name: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try await self.client(deviceKey).lease(hub: self.hubFromMap(hub), name: name) }
  }

  @objc func release(_ deviceKey: String, hub: [String: Any], name: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).release(hub: self.hubFromMap(hub), name: name)
      return nil
    }
  }

  @objc func providers(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      try await self.client(deviceKey).providers(hub: self.hubFromMap(hub)).map { provider in
        ["id": provider.id, "name": provider.name, "kind": provider.kind]
      }
    }
  }

  @objc func startProxy(_ deviceKey: String, hub: [String: Any], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) {
      let proxy = try await self.client(deviceKey).startProxy(hub: self.hubFromMap(hub))
      return ["port": Int(proxy.port), "token": proxy.token] as [String: Any]
    }
  }

  //one client owns the iroh endpoint
  private func client(_ deviceKey: String) throws -> HubClient {
    lock.lock()
    defer { lock.unlock() }
    if let client, clientKey == deviceKey { return client }
    let secret = Data(stride(from: 0, to: deviceKey.count, by: 2).map { offset -> UInt8 in
      let start = deviceKey.index(deviceKey.startIndex, offsetBy: offset)
      let end = deviceKey.index(start, offsetBy: 2, limitedBy: deviceKey.endIndex) ?? deviceKey.endIndex
      return UInt8(deviceKey[start..<end], radix: 16) ?? 0
    })
    let created = try HubClient(secretKey: secret)
    clientKey = deviceKey
    client = created
    return created
  }

  //js matches on the error code
  private func run(_ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock, _ block: @escaping () async throws -> Any?) {
    Task {
      do {
        resolve(try await block())
      } catch {
        reject(errorCode(error), String(describing: error), error)
      }
    }
  }

  //case name like the kotlin class name
  private func errorCode(_ error: Error) -> String {
    guard error is HubError, let label = Mirror(reflecting: error).children.first?.label else { return "Internal" }
    return label.prefix(1).uppercased() + label.dropFirst()
  }

  //stable per vendor, hashed by the client
  private func machineId() async -> String? {
    await MainActor.run { UIDevice.current.identifierForVendor?.uuidString }
  }

  private func opt(_ value: Any?) -> Any { value ?? NSNull() }

  private func fileToMap(_ file: ModelFile) -> [String: Any] {
    ["file": file.file, "size": Double(file.size)]
  }

  private func statusToMap(_ status: LlamaStatus) -> [String: Any] {
    [
      "state": status.state,
      "backend": opt(status.backend),
      "build": opt(status.build),
      "latest": opt(status.latest),
      "channel": opt(status.channel),
      "message": opt(status.message),
      "installed": status.installed.map { model in
        ["file": model.file, "size": Double(model.size), "repo": opt(model.repo)] as [String: Any]
      },
      "downloads": status.downloads.map { download in
        [
          "repo": download.repo,
          "file": download.file,
          "received": Double(download.received),
          "total": Double(download.total),
          "error": opt(download.error),
        ] as [String: Any]
      },
    ]
  }

  private func profileToMap(_ profile: HubProfile) -> [String: Any] {
    ["id": profile.id, "name": profile.name, "role": profile.role, "createdAt": Double(profile.createdAt)]
  }

  private func lockToMap(_ lock: ProfileLock) -> [String: Any] {
    ["salt": lock.salt, "memoryKib": Double(lock.memoryKib), "passes": Double(lock.passes), "wrapped": lock.wrapped]
  }

  private func unlockedToMap(_ unlocked: UnlockedProfile) -> [String: Any] {
    var map: [String: Any] = ["profile": profileToMap(unlocked.profile), "key": unlocked.key]
    if let lock = unlocked.lock { map["lock"] = lockToMap(lock) }
    return map
  }

  private func settingsToMap(_ settings: HubSettings) -> [String: Any] {
    [
      "lanDiscovery": settings.lanDiscovery,
      "shareProviders": settings.shareProviders,
      "mcpServers": settings.mcpServers,
      "models": settings.models,
      "modelsNightly": settings.modelsNightly,
      "ctxSize": Double(settings.ctxSize),
      "keepAlive": Double(settings.keepAlive),
      "parallel": Double(settings.parallel),
    ]
  }

  private func hubToMap(_ hub: PairedHub) -> [String: Any] {
    ["id": hub.id, "name": hub.name, "relays": hub.relays]
  }

  private func hubFromMap(_ map: [String: Any]) -> PairedHub {
    PairedHub(
      id: map["id"] as? String ?? "",
      name: map["name"] as? String ?? "",
      relays: (map["relays"] as? [Any] ?? []).map { "\($0)" }
    )
  }
}
