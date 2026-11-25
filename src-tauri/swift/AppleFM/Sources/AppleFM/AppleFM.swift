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

//variant api only exists from macos 27
#if canImport(FoundationModels)
@available(macOS 26.0, *)
private func variantName() -> String {
  #if compiler(>=6.4)
  if #available(macOS 27.0, *) { return SystemLanguageModel.default.variant.displayName }
  #endif
  if #available(macOS 26.4, *) { return "AFM 2.1 Core" }
  return "AFM 2 Core"
}
#endif

//json with status like the js provider
@_cdecl("opera_afm_info")
public func operaAfmInfo() -> UnsafeMutablePointer<CChar> {
  var info: [String: Any] = ["status": 0]
  #if canImport(FoundationModels)
  if #available(macOS 26.0, *) {
    let model = SystemLanguageModel.default
    switch model.availability {
    case .available:
      info = ["status": 3, "variant": variantName()]
      //docs say it may throw
      if let size = try? model.contextSize { info["contextSize"] = size }
    case .unavailable(.appleIntelligenceNotEnabled): info = ["status": 1]
    case .unavailable(.modelNotReady): info = ["status": 2]
    default: break
    }
  }
  #endif
  let data = (try? JSONSerialization.data(withJSONObject: info)) ?? Data("{\"status\":0}".utf8)
  return strdup(String(decoding: data, as: UTF8.self))!
}

//rust frees the info string
@_cdecl("opera_afm_free")
public func operaAfmFree(_ ptr: UnsafeMutablePointer<CChar>) {
  free(ptr)
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
