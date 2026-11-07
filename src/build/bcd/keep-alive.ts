export const forceKeepAlive: Record<string, string[]> = {
  // Things that are incorrectly reported as unsupported.
  // These should be filed to https://github.com/mdn/browser-compat-data/issues
  ContactAddress: [
    "country",
    "addressLine",
    "region",
    "city",
    "dependentLocality",
    "postalCode",
    "sortingCode",
    "organization",
    "recipient",
    "phone",
    "toJSON",
  ],
  CSSStyleProperties: [
    // https://github.com/mdn/browser-compat-data/commit/ebabd27460a306d6de80107b7e3c62be99ecd13c#r135144607
    "webkitMaskComposite",
  ],
  GlobalEventHandlers: [
    "onwebkitanimationend",
    "onwebkitanimationiteration",
    "onwebkitanimationstart",
  ],
  GPUBufferUsage: [],
  GPUMapMode: [],
  GPUTextureUsage: [],
  GPUShaderStage: [],
  GPUColorWrite: [],
  IDBDatabase: [
    // BCD unexpectedly is removing valid event data
    // https://github.com/mdn/browser-compat-data/issues/15345
    "onerror",
  ],
  ShadowRoot: [
    // BCD unexpectedly is removing valid event data
    // https://github.com/mdn/browser-compat-data/issues/15345
    "onslotchange",
  ],
  XMLHttpRequestEventTarget: [
    // BCD unexpectedly is removing valid event data
    // https://github.com/mdn/browser-compat-data/issues/15345
    "onabort",
    "onerror",
    "onload",
    "onloadend",
    "onloadstart",
    "onprogress",
    "ontimeout",
  ],
};

/**
 * Like `forceKeepAlive`, but for the full lib only -- a Baseline cut ignores
 * these. They patch over BCD inconsistencies that leave a kept API referencing
 * an interface the 2-engine rule drops. A cut doesn't need them (its reference
 * closure already resurrects any removed interface a surviving API still
 * references, as a type-only shell), and forcing them there would leak
 * non-Baseline interfaces into every cut.
 */
export const forceKeepAliveFullLibOnly: Record<string, string[]> = {
  // Chrome ships the interface object only as `webkitSpeechGrammar`, so BCD
  // gives SpeechGrammar a single unprefixed engine (Firefox 160+), while
  // SpeechGrammarList (unprefixed in both) is kept and its item() returns
  // SpeechGrammar. The members pass the 2-engine bar on their own.
  SpeechGrammar: [],
};
