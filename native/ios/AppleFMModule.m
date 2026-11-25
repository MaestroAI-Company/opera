#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

//exposes the swift bridge to js
@interface RCT_EXTERN_MODULE(AppleFMModule, RCTEventEmitter)

RCT_EXTERN_METHOD(info:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(generate:(NSString *)requestId system:(NSString *)system prompt:(NSString *)prompt resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(abort:(NSString *)requestId)

@end
