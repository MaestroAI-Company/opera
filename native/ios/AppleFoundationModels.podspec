Pod::Spec.new do |s|
  s.name = 'AppleFoundationModels'
  s.version = '1.0.0'
  s.summary = 'Apple Foundation Models bridged to React Native'
  s.homepage = 'https://github.com/MaestroAI-Company/opera'
  s.license = 'AGPL-3.0-only'
  s.author = 'MaestroAI'
  s.source = { :path => '.' }
  s.platforms = { :ios => '17.0' }
  s.swift_version = '5.9'

  s.source_files = 'AppleFMModule.{swift,m}'
  #the framework only exists on ios 26
  s.weak_frameworks = 'FoundationModels'

  s.dependency 'React-Core'
end
