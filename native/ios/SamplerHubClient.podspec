#vendor is filled by scripts/build-hub-client.mjs ios
Pod::Spec.new do |s|
  s.name = 'SamplerHubClient'
  s.version = '1.0.0'
  s.summary = 'Sampler Hub rust client bridged to React Native'
  s.homepage = 'https://github.com/MaestroAI-Company/sampler-hub'
  s.license = 'AGPL-3.0-only'
  s.author = 'MaestroAI'
  s.source = { :path => '.' }
  s.platforms = { :ios => '17.0' }
  s.swift_version = '5.9'

  #ffi header goes in the umbrella so the bindings skip their module import
  s.source_files = 'SamplerHubModule.{swift,m}', 'vendor/sampler_hub_client.swift', 'vendor/sampler_hub_clientFFI.h'
  s.public_header_files = 'vendor/sampler_hub_clientFFI.h'
  s.vendored_frameworks = 'vendor/SamplerHubClient.xcframework'
  #iroh reads network state through these
  s.frameworks = 'Security', 'SystemConfiguration'

  s.dependency 'React-Core'
end
