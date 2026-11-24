#onnxruntime-c from nuget while download.onnxruntime.ai is down
Pod::Spec.new do |s|
  s.name = 'onnxruntime-c'
  s.version = '1.24.3'
  s.summary = 'ONNX Runtime C/C++ Pod'
  s.homepage = 'https://github.com/microsoft/onnxruntime'
  s.license = { :type => 'MIT' }
  s.authors = { 'ONNX Runtime' => 'onnxruntime@microsoft.com' }
  s.source = {
    :http => 'https://api.nuget.org/v3-flatcontainer/microsoft.ml.onnxruntime/1.24.3/microsoft.ml.onnxruntime.1.24.3.nupkg',
    :type => :zip,
    :sha256 => 'e4ab3b236c1b803e1e7167fe9a75caa1b82a2fd4ae82abbd130937c07517bcdb'
  }
  s.platforms = { :ios => '15.1', :osx => '14.0' }
  #the nupkg nests the xcframework zip, the headers live inside the device slice
  s.prepare_command = <<-CMD
    unzip -q runtimes/ios/native/onnxruntime.xcframework.zip
    mkdir -p Headers
    cp onnxruntime.xcframework/ios-arm64/onnxruntime.framework/Headers/*.h Headers/
  CMD
  s.vendored_frameworks = 'onnxruntime.xcframework'
  s.static_framework = true
  s.weak_frameworks = ['CoreML']
  s.source_files = 'Headers/*.h'
  s.libraries = 'c++'
  s.pod_target_xcconfig = { 'OTHER_CPLUSPLUSFLAGS' => '-fvisibility=hidden -fvisibility-inlines-hidden' }
end
