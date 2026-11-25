import Foundation
import FoundationModels
import React

//bridges apple foundation models to js
@objc(AppleFMModule)
class AppleFMModule: RCTEventEmitter {
  private let lock = NSLock()
  private var tasks: [String: Task<Void, Never>] = [:]

  @objc override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! { ["AppleFMToken"] }

  //status codes match the js provider
  @objc func info(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 26.0, *) else {
      resolve(["status": 0])
      return
    }
    let model = SystemLanguageModel.default
    switch model.availability {
    case .available:
      var result: [String: Any] = ["status": 3, "variant": variantName()]
      //docs say it may throw
      if let size = try? model.contextSize { result["contextSize"] = size }
      resolve(result)
    case .unavailable(.appleIntelligenceNotEnabled): resolve(["status": 1])
    case .unavailable(.modelNotReady): resolve(["status": 2])
    default: resolve(["status": 0])
    }
  }

  //variant api only exists from ios 27
  @available(iOS 26.0, *)
  private func variantName() -> String {
    #if compiler(>=6.4)
    if #available(iOS 27.0, *) { return SystemLanguageModel.default.variant.displayName }
    #endif
    if #available(iOS 26.4, *) { return "AFM 2.1 Core" }
    return "AFM 2 Core"
  }

  @objc func generate(_ requestId: String, system: String, prompt: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 26.0, *) else {
      reject("apple_fm_unavailable", "Apple Foundation Models needs iOS 26", nil)
      return
    }
    //store the task before it can finish
    lock.lock()
    tasks[requestId] = Task {
      do {
        let session = LanguageModelSession(instructions: system)
        var sent = ""
        for try await snapshot in session.streamResponse(to: prompt) {
          let text = snapshot.content
          //snapshots are cumulative
          let chunk = text.hasPrefix(sent) ? String(text.dropFirst(sent.count)) : text
          sent = text
          if !chunk.isEmpty {
            self.sendEvent(withName: "AppleFMToken", body: ["requestId": requestId, "chunk": chunk])
          }
        }
        resolve(nil)
      } catch {
        if error is CancellationError || Task.isCancelled {
          resolve(nil)
        } else {
          reject("apple_fm_error", error.localizedDescription, error)
        }
      }
      self.finish(requestId)
    }
    lock.unlock()
  }

  @objc func abort(_ requestId: String) {
    lock.lock()
    let task = tasks[requestId]
    lock.unlock()
    task?.cancel()
  }

  private func finish(_ requestId: String) {
    lock.lock()
    tasks[requestId] = nil
    lock.unlock()
  }
}
