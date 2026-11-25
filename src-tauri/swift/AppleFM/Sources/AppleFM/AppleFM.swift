import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

//kind is chunk done or error
public typealias AppleFMCallback = @convention(c) (UnsafePointer<CChar>, Int32, UnsafePointer<CChar>) -> Void

private let lock = NSLock()
private var tasks: [String: Task<Void, Never>] = [:]

private func send(_ callback: AppleFMCallback, _ id: String, _ kind: Int32, _ text: String) {
  id.withCString { i in text.withCString { t in callback(i, kind, t) } }
}

private func finish(_ id: String) {
  lock.lock()
  tasks[id] = nil
  lock.unlock()
}

//same codes as the js provider
@_cdecl("opera_afm_status")
public func operaAfmStatus() -> Int32 {
  #if canImport(FoundationModels)
  guard #available(macOS 26.0, *) else { return 0 }
  switch SystemLanguageModel.default.availability {
  case .available: return 3
  case .unavailable(.appleIntelligenceNotEnabled): return 1
  case .unavailable(.modelNotReady): return 2
  default: return 0
  }
  #else
  return 0
  #endif
}

@_cdecl("opera_afm_generate")
public func operaAfmGenerate(
  _ id: UnsafePointer<CChar>,
  _ system: UnsafePointer<CChar>,
  _ prompt: UnsafePointer<CChar>,
  _ callback: AppleFMCallback
) {
  //rust frees its strings after return
  let requestId = String(cString: id)
  let instructions = String(cString: system)
  let text = String(cString: prompt)
  #if canImport(FoundationModels)
  guard #available(macOS 26.0, *) else {
    send(callback, requestId, 2, "Apple Foundation Models needs macOS 26")
    return
  }
  //store the task before it can finish
  lock.lock()
  tasks[requestId] = Task {
    do {
      let session = LanguageModelSession(instructions: instructions)
      var sent = ""
      for try await snapshot in session.streamResponse(to: text) {
        let content = snapshot.content
        //snapshots are cumulative
        let chunk = content.hasPrefix(sent) ? String(content.dropFirst(sent.count)) : content
        sent = content
        if !chunk.isEmpty { send(callback, requestId, 0, chunk) }
      }
      send(callback, requestId, 1, "")
    } catch {
      if error is CancellationError || Task.isCancelled {
        send(callback, requestId, 1, "")
      } else {
        send(callback, requestId, 2, error.localizedDescription)
      }
    }
    finish(requestId)
  }
  lock.unlock()
  #else
  send(callback, requestId, 2, "Apple Foundation Models missing from this build")
  #endif
}

@_cdecl("opera_afm_abort")
public func operaAfmAbort(_ id: UnsafePointer<CChar>) {
  let requestId = String(cString: id)
  lock.lock()
  let task = tasks[requestId]
  lock.unlock()
  task?.cancel()
}
