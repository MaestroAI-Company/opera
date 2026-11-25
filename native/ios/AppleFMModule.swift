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

  //same codes as the js provider
  @objc func status(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 26.0, *) else {
      resolve(0)
      return
    }
    switch SystemLanguageModel.default.availability {
    case .available: resolve(3)
    case .unavailable(.appleIntelligenceNotEnabled): resolve(1)
    case .unavailable(.modelNotReady): resolve(2)
    default: resolve(0)
    }
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
