"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const electron = require("electron");
const path$1 = require("node:path");
const fs$2 = require("node:fs");
const require$$0$1 = require("child_process");
const require$$1 = require("crypto");
const require$$0$2 = require("os");
const node_crypto = require("node:crypto");
const path$2 = require("path");
const fs$3 = require("fs");
const require$$1$2 = require("tty");
const require$$5 = require("fs/promises");
const require$$1$1 = require("util");
const require$$7 = require("async_hooks");
const require$$8 = require("events");
const Store = require("electron-store");
const require$$0$3 = require("stream");
const require$$3 = require("http");
const require$$4 = require("https");
const require$$5$1 = require("url");
const fetch$1 = require("node-fetch");
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0);
  const buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers) {
    buf.set(buffer, i);
    i += buffer.length;
  }
  return buf;
}
function encode(string) {
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code > 127) {
      throw new TypeError("non-ASCII string encountered in encode()");
    }
    bytes[i] = code;
  }
  return bytes;
}
function decodeBase64$1(encoded) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(encoded);
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
function decode(input) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(typeof input === "string" ? input : decoder.decode(input), {
      alphabet: "base64url"
    });
  }
  let encoded = input;
  if (encoded instanceof Uint8Array) {
    encoded = decoder.decode(encoded);
  }
  encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeBase64$1(encoded);
  } catch {
    throw new TypeError("The input to be decoded is not correctly encoded.");
  }
}
class JOSEError extends Error {
  constructor(message2, options) {
    var _a2;
    super(message2, options);
    __publicField(this, "code", "ERR_JOSE_GENERIC");
    this.name = this.constructor.name;
    (_a2 = Error.captureStackTrace) == null ? void 0 : _a2.call(Error, this, this.constructor);
  }
}
__publicField(JOSEError, "code", "ERR_JOSE_GENERIC");
class JWTClaimValidationFailed extends JOSEError {
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } });
    __publicField(this, "code", "ERR_JWT_CLAIM_VALIDATION_FAILED");
    __publicField(this, "claim");
    __publicField(this, "reason");
    __publicField(this, "payload");
    this.claim = claim;
    this.reason = reason;
    this.payload = payload;
  }
}
__publicField(JWTClaimValidationFailed, "code", "ERR_JWT_CLAIM_VALIDATION_FAILED");
class JWTExpired extends JOSEError {
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } });
    __publicField(this, "code", "ERR_JWT_EXPIRED");
    __publicField(this, "claim");
    __publicField(this, "reason");
    __publicField(this, "payload");
    this.claim = claim;
    this.reason = reason;
    this.payload = payload;
  }
}
__publicField(JWTExpired, "code", "ERR_JWT_EXPIRED");
class JOSENotSupported extends JOSEError {
  constructor() {
    super(...arguments);
    __publicField(this, "code", "ERR_JOSE_NOT_SUPPORTED");
  }
}
__publicField(JOSENotSupported, "code", "ERR_JOSE_NOT_SUPPORTED");
class JWSInvalid extends JOSEError {
  constructor() {
    super(...arguments);
    __publicField(this, "code", "ERR_JWS_INVALID");
  }
}
__publicField(JWSInvalid, "code", "ERR_JWS_INVALID");
class JWTInvalid extends JOSEError {
  constructor() {
    super(...arguments);
    __publicField(this, "code", "ERR_JWT_INVALID");
  }
}
__publicField(JWTInvalid, "code", "ERR_JWT_INVALID");
class JWSSignatureVerificationFailed extends JOSEError {
  constructor(message2 = "signature verification failed", options) {
    super(message2, options);
    __publicField(this, "code", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED");
  }
}
__publicField(JWSSignatureVerificationFailed, "code", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED");
const unusable = (name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
const isAlgorithm = (algorithm, name) => algorithm.name === name;
function getHashLength(hash2) {
  return parseInt(hash2.name.slice(4), 10);
}
function getNamedCurve(alg) {
  switch (alg) {
    case "ES256":
      return "P-256";
    case "ES384":
      return "P-384";
    case "ES512":
      return "P-521";
    default:
      throw new Error("unreachable");
  }
}
function checkUsage(key, usage) {
  if (!key.usages.includes(usage)) {
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
  }
}
function checkSigCryptoKey(key, alg, usage) {
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512": {
      if (!isAlgorithm(key.algorithm, "HMAC"))
        throw unusable("HMAC");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "RS256":
    case "RS384":
    case "RS512": {
      if (!isAlgorithm(key.algorithm, "RSASSA-PKCS1-v1_5"))
        throw unusable("RSASSA-PKCS1-v1_5");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "PS256":
    case "PS384":
    case "PS512": {
      if (!isAlgorithm(key.algorithm, "RSA-PSS"))
        throw unusable("RSA-PSS");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "Ed25519":
    case "EdDSA": {
      if (!isAlgorithm(key.algorithm, "Ed25519"))
        throw unusable("Ed25519");
      break;
    }
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87": {
      if (!isAlgorithm(key.algorithm, alg))
        throw unusable(alg);
      break;
    }
    case "ES256":
    case "ES384":
    case "ES512": {
      if (!isAlgorithm(key.algorithm, "ECDSA"))
        throw unusable("ECDSA");
      const expected = getNamedCurve(alg);
      const actual = key.algorithm.namedCurve;
      if (actual !== expected)
        throw unusable(expected, "algorithm.namedCurve");
      break;
    }
    default:
      throw new TypeError("CryptoKey does not support this operation");
  }
  checkUsage(key, usage);
}
function message(msg, actual, ...types) {
  var _a2;
  types = types.filter(Boolean);
  if (types.length > 2) {
    const last = types.pop();
    msg += `one of type ${types.join(", ")}, or ${last}.`;
  } else if (types.length === 2) {
    msg += `one of type ${types[0]} or ${types[1]}.`;
  } else {
    msg += `of type ${types[0]}.`;
  }
  if (actual == null) {
    msg += ` Received ${actual}`;
  } else if (typeof actual === "function" && actual.name) {
    msg += ` Received function ${actual.name}`;
  } else if (typeof actual === "object" && actual != null) {
    if ((_a2 = actual.constructor) == null ? void 0 : _a2.name) {
      msg += ` Received an instance of ${actual.constructor.name}`;
    }
  }
  return msg;
}
const invalidKeyInput = (actual, ...types) => message("Key must be ", actual, ...types);
const withAlg = (alg, actual, ...types) => message(`Key for the ${alg} algorithm must be `, actual, ...types);
const isCryptoKey = (key) => {
  if ((key == null ? void 0 : key[Symbol.toStringTag]) === "CryptoKey")
    return true;
  try {
    return key instanceof CryptoKey;
  } catch {
    return false;
  }
};
const isKeyObject = (key) => (key == null ? void 0 : key[Symbol.toStringTag]) === "KeyObject";
const isKeyLike = (key) => isCryptoKey(key) || isKeyObject(key);
function isDisjoint(...headers) {
  const sources = headers.filter(Boolean);
  if (sources.length === 0 || sources.length === 1) {
    return true;
  }
  let acc;
  for (const header of sources) {
    const parameters = Object.keys(header);
    if (!acc || acc.size === 0) {
      acc = new Set(parameters);
      continue;
    }
    for (const parameter of parameters) {
      if (acc.has(parameter)) {
        return false;
      }
      acc.add(parameter);
    }
  }
  return true;
}
const isObjectLike = (value) => typeof value === "object" && value !== null;
function isObject(input) {
  if (!isObjectLike(input) || Object.prototype.toString.call(input) !== "[object Object]") {
    return false;
  }
  if (Object.getPrototypeOf(input) === null) {
    return true;
  }
  let proto = input;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }
  return Object.getPrototypeOf(input) === proto;
}
function checkKeyLength(alg, key) {
  if (alg.startsWith("RS") || alg.startsWith("PS")) {
    const { modulusLength } = key.algorithm;
    if (typeof modulusLength !== "number" || modulusLength < 2048) {
      throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
    }
  }
}
const bytesEqual = (a, b2) => {
  if (a.byteLength !== b2.length)
    return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b2[i])
      return false;
  }
  return true;
};
const createASN1State = (data) => ({ data, pos: 0 });
const parseLength = (state2) => {
  const first = state2.data[state2.pos++];
  if (first & 128) {
    const lengthOfLen = first & 127;
    let length = 0;
    for (let i = 0; i < lengthOfLen; i++) {
      length = length << 8 | state2.data[state2.pos++];
    }
    return length;
  }
  return first;
};
const expectTag = (state2, expectedTag, errorMessage) => {
  if (state2.data[state2.pos++] !== expectedTag) {
    throw new Error(errorMessage);
  }
};
const getSubarray = (state2, length) => {
  const result = state2.data.subarray(state2.pos, state2.pos + length);
  state2.pos += length;
  return result;
};
const parseAlgorithmOID = (state2) => {
  expectTag(state2, 6, "Expected algorithm OID");
  const oidLen = parseLength(state2);
  return getSubarray(state2, oidLen);
};
function parseSPKIHeader(state2) {
  expectTag(state2, 48, "Invalid SPKI structure");
  parseLength(state2);
  expectTag(state2, 48, "Expected algorithm identifier");
  const algIdLen = parseLength(state2);
  const algIdStart = state2.pos;
  return { algIdStart, algIdLength: algIdLen };
}
const parseECAlgorithmIdentifier = (state2) => {
  const algOid = parseAlgorithmOID(state2);
  if (bytesEqual(algOid, [43, 101, 110])) {
    return "X25519";
  }
  if (!bytesEqual(algOid, [42, 134, 72, 206, 61, 2, 1])) {
    throw new Error("Unsupported key algorithm");
  }
  expectTag(state2, 6, "Expected curve OID");
  const curveOidLen = parseLength(state2);
  const curveOid = getSubarray(state2, curveOidLen);
  for (const { name, oid } of [
    { name: "P-256", oid: [42, 134, 72, 206, 61, 3, 1, 7] },
    { name: "P-384", oid: [43, 129, 4, 0, 34] },
    { name: "P-521", oid: [43, 129, 4, 0, 35] }
  ]) {
    if (bytesEqual(curveOid, oid)) {
      return name;
    }
  }
  throw new Error("Unsupported named curve");
};
const genericImport = async (keyFormat, keyData, alg, options) => {
  let algorithm;
  let keyUsages;
  const getSigUsages = () => ["verify"];
  const getEncUsages = () => ["encrypt", "wrapKey"];
  switch (alg) {
    case "PS256":
    case "PS384":
    case "PS512":
      algorithm = { name: "RSA-PSS", hash: `SHA-${alg.slice(-3)}` };
      keyUsages = getSigUsages();
      break;
    case "RS256":
    case "RS384":
    case "RS512":
      algorithm = { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${alg.slice(-3)}` };
      keyUsages = getSigUsages();
      break;
    case "RSA-OAEP":
    case "RSA-OAEP-256":
    case "RSA-OAEP-384":
    case "RSA-OAEP-512":
      algorithm = {
        name: "RSA-OAEP",
        hash: `SHA-${parseInt(alg.slice(-3), 10) || 1}`
      };
      keyUsages = getEncUsages();
      break;
    case "ES256":
    case "ES384":
    case "ES512": {
      const curveMap = { ES256: "P-256", ES384: "P-384", ES512: "P-521" };
      algorithm = { name: "ECDSA", namedCurve: curveMap[alg] };
      keyUsages = getSigUsages();
      break;
    }
    case "ECDH-ES":
    case "ECDH-ES+A128KW":
    case "ECDH-ES+A192KW":
    case "ECDH-ES+A256KW": {
      try {
        const namedCurve = options.getNamedCurve(keyData);
        algorithm = namedCurve === "X25519" ? { name: "X25519" } : { name: "ECDH", namedCurve };
      } catch (cause) {
        throw new JOSENotSupported("Invalid or unsupported key format");
      }
      keyUsages = [];
      break;
    }
    case "Ed25519":
    case "EdDSA":
      algorithm = { name: "Ed25519" };
      keyUsages = getSigUsages();
      break;
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87":
      algorithm = { name: alg };
      keyUsages = getSigUsages();
      break;
    default:
      throw new JOSENotSupported('Invalid or unsupported "alg" (Algorithm) value');
  }
  return crypto.subtle.importKey(keyFormat, keyData, algorithm, (options == null ? void 0 : options.extractable) ?? true, keyUsages);
};
const processPEMData = (pem, pattern) => {
  return decodeBase64$1(pem.replace(pattern, ""));
};
const fromSPKI = (pem, alg, options) => {
  var _a2;
  const keyData = processPEMData(pem, /(?:-----(?:BEGIN|END) PUBLIC KEY-----|\s)/g);
  let opts = options;
  if ((_a2 = alg == null ? void 0 : alg.startsWith) == null ? void 0 : _a2.call(alg, "ECDH-ES")) {
    opts || (opts = {});
    opts.getNamedCurve = (keyData2) => {
      const state2 = createASN1State(keyData2);
      parseSPKIHeader(state2);
      return parseECAlgorithmIdentifier(state2);
    };
  }
  return genericImport("spki", keyData, alg, opts);
};
function subtleMapping(jwk) {
  let algorithm;
  let keyUsages;
  switch (jwk.kty) {
    case "AKP": {
      switch (jwk.alg) {
        case "ML-DSA-44":
        case "ML-DSA-65":
        case "ML-DSA-87":
          algorithm = { name: jwk.alg };
          keyUsages = jwk.priv ? ["sign"] : ["verify"];
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    case "RSA": {
      switch (jwk.alg) {
        case "PS256":
        case "PS384":
        case "PS512":
          algorithm = { name: "RSA-PSS", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RS256":
        case "RS384":
        case "RS512":
          algorithm = { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RSA-OAEP":
        case "RSA-OAEP-256":
        case "RSA-OAEP-384":
        case "RSA-OAEP-512":
          algorithm = {
            name: "RSA-OAEP",
            hash: `SHA-${parseInt(jwk.alg.slice(-3), 10) || 1}`
          };
          keyUsages = jwk.d ? ["decrypt", "unwrapKey"] : ["encrypt", "wrapKey"];
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    case "EC": {
      switch (jwk.alg) {
        case "ES256":
          algorithm = { name: "ECDSA", namedCurve: "P-256" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ES384":
          algorithm = { name: "ECDSA", namedCurve: "P-384" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ES512":
          algorithm = { name: "ECDSA", namedCurve: "P-521" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: "ECDH", namedCurve: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    case "OKP": {
      switch (jwk.alg) {
        case "Ed25519":
        case "EdDSA":
          algorithm = { name: "Ed25519" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported JWK "alg" (Algorithm) Parameter value');
      }
      break;
    }
    default:
      throw new JOSENotSupported('Invalid or unsupported JWK "kty" (Key Type) Parameter value');
  }
  return { algorithm, keyUsages };
}
async function jwkToKey(jwk) {
  if (!jwk.alg) {
    throw new TypeError('"alg" argument is required when "jwk.alg" is not present');
  }
  const { algorithm, keyUsages } = subtleMapping(jwk);
  const keyData = { ...jwk };
  if (keyData.kty !== "AKP") {
    delete keyData.alg;
  }
  delete keyData.use;
  return crypto.subtle.importKey("jwk", keyData, algorithm, jwk.ext ?? (jwk.d || jwk.priv ? false : true), jwk.key_ops ?? keyUsages);
}
async function importSPKI(spki, alg, options) {
  if (typeof spki !== "string" || spki.indexOf("-----BEGIN PUBLIC KEY-----") !== 0) {
    throw new TypeError('"spki" must be SPKI formatted string');
  }
  return fromSPKI(spki, alg, options);
}
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && (protectedHeader == null ? void 0 : protectedHeader.crit) === void 0) {
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  }
  if (!protectedHeader || protectedHeader.crit === void 0) {
    return /* @__PURE__ */ new Set();
  }
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input !== "string" || input.length === 0)) {
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  }
  let recognized;
  {
    recognized = recognizedDefault;
  }
  for (const parameter of protectedHeader.crit) {
    if (!recognized.has(parameter)) {
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    }
    if (joseHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    }
    if (recognized.get(parameter) && protectedHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
    }
  }
  return new Set(protectedHeader.crit);
}
const isJWK = (key) => isObject(key) && typeof key.kty === "string";
const isPrivateJWK = (key) => key.kty !== "oct" && (key.kty === "AKP" && typeof key.priv === "string" || typeof key.d === "string");
const isPublicJWK = (key) => key.kty !== "oct" && key.d === void 0 && key.priv === void 0;
const isSecretJWK = (key) => key.kty === "oct" && typeof key.k === "string";
let cache;
const handleJWK = async (key, jwk, alg, freeze = false) => {
  cache || (cache = /* @__PURE__ */ new WeakMap());
  let cached = cache.get(key);
  if (cached == null ? void 0 : cached[alg]) {
    return cached[alg];
  }
  const cryptoKey = await jwkToKey({ ...jwk, alg });
  if (freeze)
    Object.freeze(key);
  if (!cached) {
    cache.set(key, { [alg]: cryptoKey });
  } else {
    cached[alg] = cryptoKey;
  }
  return cryptoKey;
};
const handleKeyObject = (keyObject, alg) => {
  var _a2;
  cache || (cache = /* @__PURE__ */ new WeakMap());
  let cached = cache.get(keyObject);
  if (cached == null ? void 0 : cached[alg]) {
    return cached[alg];
  }
  const isPublic = keyObject.type === "public";
  const extractable = isPublic ? true : false;
  let cryptoKey;
  if (keyObject.asymmetricKeyType === "x25519") {
    switch (alg) {
      case "ECDH-ES":
      case "ECDH-ES+A128KW":
      case "ECDH-ES+A192KW":
      case "ECDH-ES+A256KW":
        break;
      default:
        throw new TypeError("given KeyObject instance cannot be used for this algorithm");
    }
    cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, isPublic ? [] : ["deriveBits"]);
  }
  if (keyObject.asymmetricKeyType === "ed25519") {
    if (alg !== "EdDSA" && alg !== "Ed25519") {
      throw new TypeError("given KeyObject instance cannot be used for this algorithm");
    }
    cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, [
      isPublic ? "verify" : "sign"
    ]);
  }
  switch (keyObject.asymmetricKeyType) {
    case "ml-dsa-44":
    case "ml-dsa-65":
    case "ml-dsa-87": {
      if (alg !== keyObject.asymmetricKeyType.toUpperCase()) {
        throw new TypeError("given KeyObject instance cannot be used for this algorithm");
      }
      cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, [
        isPublic ? "verify" : "sign"
      ]);
    }
  }
  if (keyObject.asymmetricKeyType === "rsa") {
    let hash2;
    switch (alg) {
      case "RSA-OAEP":
        hash2 = "SHA-1";
        break;
      case "RS256":
      case "PS256":
      case "RSA-OAEP-256":
        hash2 = "SHA-256";
        break;
      case "RS384":
      case "PS384":
      case "RSA-OAEP-384":
        hash2 = "SHA-384";
        break;
      case "RS512":
      case "PS512":
      case "RSA-OAEP-512":
        hash2 = "SHA-512";
        break;
      default:
        throw new TypeError("given KeyObject instance cannot be used for this algorithm");
    }
    if (alg.startsWith("RSA-OAEP")) {
      return keyObject.toCryptoKey({
        name: "RSA-OAEP",
        hash: hash2
      }, extractable, isPublic ? ["encrypt"] : ["decrypt"]);
    }
    cryptoKey = keyObject.toCryptoKey({
      name: alg.startsWith("PS") ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
      hash: hash2
    }, extractable, [isPublic ? "verify" : "sign"]);
  }
  if (keyObject.asymmetricKeyType === "ec") {
    const nist = /* @__PURE__ */ new Map([
      ["prime256v1", "P-256"],
      ["secp384r1", "P-384"],
      ["secp521r1", "P-521"]
    ]);
    const namedCurve = nist.get((_a2 = keyObject.asymmetricKeyDetails) == null ? void 0 : _a2.namedCurve);
    if (!namedCurve) {
      throw new TypeError("given KeyObject instance cannot be used for this algorithm");
    }
    if (alg === "ES256" && namedCurve === "P-256") {
      cryptoKey = keyObject.toCryptoKey({
        name: "ECDSA",
        namedCurve
      }, extractable, [isPublic ? "verify" : "sign"]);
    }
    if (alg === "ES384" && namedCurve === "P-384") {
      cryptoKey = keyObject.toCryptoKey({
        name: "ECDSA",
        namedCurve
      }, extractable, [isPublic ? "verify" : "sign"]);
    }
    if (alg === "ES512" && namedCurve === "P-521") {
      cryptoKey = keyObject.toCryptoKey({
        name: "ECDSA",
        namedCurve
      }, extractable, [isPublic ? "verify" : "sign"]);
    }
    if (alg.startsWith("ECDH-ES")) {
      cryptoKey = keyObject.toCryptoKey({
        name: "ECDH",
        namedCurve
      }, extractable, isPublic ? [] : ["deriveBits"]);
    }
  }
  if (!cryptoKey) {
    throw new TypeError("given KeyObject instance cannot be used for this algorithm");
  }
  if (!cached) {
    cache.set(keyObject, { [alg]: cryptoKey });
  } else {
    cached[alg] = cryptoKey;
  }
  return cryptoKey;
};
async function normalizeKey(key, alg) {
  if (key instanceof Uint8Array) {
    return key;
  }
  if (isCryptoKey(key)) {
    return key;
  }
  if (isKeyObject(key)) {
    if (key.type === "secret") {
      return key.export();
    }
    if ("toCryptoKey" in key && typeof key.toCryptoKey === "function") {
      try {
        return handleKeyObject(key, alg);
      } catch (err) {
        if (err instanceof TypeError) {
          throw err;
        }
      }
    }
    let jwk = key.export({ format: "jwk" });
    return handleJWK(key, jwk, alg);
  }
  if (isJWK(key)) {
    if (key.k) {
      return decode(key.k);
    }
    return handleJWK(key, key, alg, true);
  }
  throw new Error("unreachable");
}
const tag = (key) => key == null ? void 0 : key[Symbol.toStringTag];
const jwkMatchesOp = (alg, key, usage) => {
  var _a2, _b;
  if (key.use !== void 0) {
    let expected;
    switch (usage) {
      case "sign":
      case "verify":
        expected = "sig";
        break;
      case "encrypt":
      case "decrypt":
        expected = "enc";
        break;
    }
    if (key.use !== expected) {
      throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
    }
  }
  if (key.alg !== void 0 && key.alg !== alg) {
    throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
  }
  if (Array.isArray(key.key_ops)) {
    let expectedKeyOp;
    switch (true) {
      case usage === "verify":
      case alg === "dir":
      case alg.includes("CBC-HS"):
        expectedKeyOp = usage;
        break;
      case alg.startsWith("PBES2"):
        expectedKeyOp = "deriveBits";
        break;
      case /^A\d{3}(?:GCM)?(?:KW)?$/.test(alg):
        if (!alg.includes("GCM") && alg.endsWith("KW")) {
          expectedKeyOp = "unwrapKey";
        } else {
          expectedKeyOp = usage;
        }
        break;
      case usage === "encrypt":
        expectedKeyOp = "wrapKey";
        break;
      case usage === "decrypt":
        expectedKeyOp = alg.startsWith("RSA") ? "unwrapKey" : "deriveBits";
        break;
    }
    if (expectedKeyOp && ((_b = (_a2 = key.key_ops) == null ? void 0 : _a2.includes) == null ? void 0 : _b.call(_a2, expectedKeyOp)) === false) {
      throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
    }
  }
  return true;
};
const symmetricTypeCheck = (alg, key, usage) => {
  if (key instanceof Uint8Array)
    return;
  if (isJWK(key)) {
    if (isSecretJWK(key) && jwkMatchesOp(alg, key, usage))
      return;
    throw new TypeError(`JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present`);
  }
  if (!isKeyLike(key)) {
    throw new TypeError(withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key", "Uint8Array"));
  }
  if (key.type !== "secret") {
    throw new TypeError(`${tag(key)} instances for symmetric algorithms must be of type "secret"`);
  }
};
const asymmetricTypeCheck = (alg, key, usage) => {
  if (isJWK(key)) {
    switch (usage) {
      case "decrypt":
      case "sign":
        if (isPrivateJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation must be a private JWK`);
      case "encrypt":
      case "verify":
        if (isPublicJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation must be a public JWK`);
    }
  }
  if (!isKeyLike(key)) {
    throw new TypeError(withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key"));
  }
  if (key.type === "secret") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithms must not be of type "secret"`);
  }
  if (key.type === "public") {
    switch (usage) {
      case "sign":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm signing must be of type "private"`);
      case "decrypt":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm decryption must be of type "private"`);
    }
  }
  if (key.type === "private") {
    switch (usage) {
      case "verify":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm verifying must be of type "public"`);
      case "encrypt":
        throw new TypeError(`${tag(key)} instances for asymmetric algorithm encryption must be of type "public"`);
    }
  }
};
function checkKeyType(alg, key, usage) {
  switch (alg.substring(0, 2)) {
    case "A1":
    case "A2":
    case "di":
    case "HS":
    case "PB":
      symmetricTypeCheck(alg, key, usage);
      break;
    default:
      asymmetricTypeCheck(alg, key, usage);
  }
}
function subtleAlgorithm(alg, algorithm) {
  const hash2 = `SHA-${alg.slice(-3)}`;
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512":
      return { hash: hash2, name: "HMAC" };
    case "PS256":
    case "PS384":
    case "PS512":
      return { hash: hash2, name: "RSA-PSS", saltLength: parseInt(alg.slice(-3), 10) >> 3 };
    case "RS256":
    case "RS384":
    case "RS512":
      return { hash: hash2, name: "RSASSA-PKCS1-v1_5" };
    case "ES256":
    case "ES384":
    case "ES512":
      return { hash: hash2, name: "ECDSA", namedCurve: algorithm.namedCurve };
    case "Ed25519":
    case "EdDSA":
      return { name: "Ed25519" };
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87":
      return { name: alg };
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
}
async function getSigKey(alg, key, usage) {
  if (key instanceof Uint8Array) {
    if (!alg.startsWith("HS")) {
      throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "JSON Web Key"));
    }
    return crypto.subtle.importKey("raw", key, { hash: `SHA-${alg.slice(-3)}`, name: "HMAC" }, false, [usage]);
  }
  checkSigCryptoKey(key, alg, usage);
  return key;
}
async function verify(alg, key, signature, data) {
  const cryptoKey = await getSigKey(alg, key, "verify");
  checkKeyLength(alg, cryptoKey);
  const algorithm = subtleAlgorithm(alg, cryptoKey.algorithm);
  try {
    return await crypto.subtle.verify(algorithm, cryptoKey, signature, data);
  } catch {
    return false;
  }
}
async function flattenedVerify(jws, key, options) {
  if (!isObject(jws)) {
    throw new JWSInvalid("Flattened JWS must be an object");
  }
  if (jws.protected === void 0 && jws.header === void 0) {
    throw new JWSInvalid('Flattened JWS must have either of the "protected" or "header" members');
  }
  if (jws.protected !== void 0 && typeof jws.protected !== "string") {
    throw new JWSInvalid("JWS Protected Header incorrect type");
  }
  if (jws.payload === void 0) {
    throw new JWSInvalid("JWS Payload missing");
  }
  if (typeof jws.signature !== "string") {
    throw new JWSInvalid("JWS Signature missing or incorrect type");
  }
  if (jws.header !== void 0 && !isObject(jws.header)) {
    throw new JWSInvalid("JWS Unprotected Header incorrect type");
  }
  let parsedProt = {};
  if (jws.protected) {
    try {
      const protectedHeader = decode(jws.protected);
      parsedProt = JSON.parse(decoder.decode(protectedHeader));
    } catch {
      throw new JWSInvalid("JWS Protected Header is invalid");
    }
  }
  if (!isDisjoint(parsedProt, jws.header)) {
    throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  }
  const joseHeader = {
    ...parsedProt,
    ...jws.header
  };
  const extensions = validateCrit(JWSInvalid, /* @__PURE__ */ new Map([["b64", true]]), options == null ? void 0 : options.crit, parsedProt, joseHeader);
  let b64 = true;
  if (extensions.has("b64")) {
    b64 = parsedProt.b64;
    if (typeof b64 !== "boolean") {
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    }
  }
  const { alg } = joseHeader;
  if (typeof alg !== "string" || !alg) {
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  }
  if (b64) {
    if (typeof jws.payload !== "string") {
      throw new JWSInvalid("JWS Payload must be a string");
    }
  } else if (typeof jws.payload !== "string" && !(jws.payload instanceof Uint8Array)) {
    throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
  }
  let resolvedKey = false;
  if (typeof key === "function") {
    key = await key(parsedProt, jws);
    resolvedKey = true;
  }
  checkKeyType(alg, key, "verify");
  const data = concat(jws.protected !== void 0 ? encode(jws.protected) : new Uint8Array(), encode("."), typeof jws.payload === "string" ? b64 ? encode(jws.payload) : encoder.encode(jws.payload) : jws.payload);
  let signature;
  try {
    signature = decode(jws.signature);
  } catch {
    throw new JWSInvalid("Failed to base64url decode the signature");
  }
  const k2 = await normalizeKey(key, alg);
  const verified = await verify(alg, k2, signature, data);
  if (!verified) {
    throw new JWSSignatureVerificationFailed();
  }
  let payload;
  if (b64) {
    try {
      payload = decode(jws.payload);
    } catch {
      throw new JWSInvalid("Failed to base64url decode the payload");
    }
  } else if (typeof jws.payload === "string") {
    payload = encoder.encode(jws.payload);
  } else {
    payload = jws.payload;
  }
  const result = { payload };
  if (jws.protected !== void 0) {
    result.protectedHeader = parsedProt;
  }
  if (jws.header !== void 0) {
    result.unprotectedHeader = jws.header;
  }
  if (resolvedKey) {
    return { ...result, key: k2 };
  }
  return result;
}
async function compactVerify(jws, key, options) {
  if (jws instanceof Uint8Array) {
    jws = decoder.decode(jws);
  }
  if (typeof jws !== "string") {
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  }
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3) {
    throw new JWSInvalid("Invalid Compact JWS");
  }
  const verified = await flattenedVerify({ payload, protected: protectedHeader, signature }, key, options);
  const result = { payload: verified.payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
const epoch = (date) => Math.floor(date.getTime() / 1e3);
const minute = 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;
const year = day * 365.25;
const REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
function secs(str) {
  const matched = REGEX.exec(str);
  if (!matched || matched[4] && matched[1]) {
    throw new TypeError("Invalid time period format");
  }
  const value = parseFloat(matched[2]);
  const unit = matched[3].toLowerCase();
  let numericDate;
  switch (unit) {
    case "sec":
    case "secs":
    case "second":
    case "seconds":
    case "s":
      numericDate = Math.round(value);
      break;
    case "minute":
    case "minutes":
    case "min":
    case "mins":
    case "m":
      numericDate = Math.round(value * minute);
      break;
    case "hour":
    case "hours":
    case "hr":
    case "hrs":
    case "h":
      numericDate = Math.round(value * hour);
      break;
    case "day":
    case "days":
    case "d":
      numericDate = Math.round(value * day);
      break;
    case "week":
    case "weeks":
    case "w":
      numericDate = Math.round(value * week);
      break;
    default:
      numericDate = Math.round(value * year);
      break;
  }
  if (matched[1] === "-" || matched[4] === "ago") {
    return -numericDate;
  }
  return numericDate;
}
const normalizeTyp = (value) => {
  if (value.includes("/")) {
    return value.toLowerCase();
  }
  return `application/${value.toLowerCase()}`;
};
const checkAudiencePresence = (audPayload, audOption) => {
  if (typeof audPayload === "string") {
    return audOption.includes(audPayload);
  }
  if (Array.isArray(audPayload)) {
    return audOption.some(Set.prototype.has.bind(new Set(audPayload)));
  }
  return false;
};
function validateClaimsSet(protectedHeader, encodedPayload, options = {}) {
  let payload;
  try {
    payload = JSON.parse(decoder.decode(encodedPayload));
  } catch {
  }
  if (!isObject(payload)) {
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
  }
  const { typ } = options;
  if (typ && (typeof protectedHeader.typ !== "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) {
    throw new JWTClaimValidationFailed('unexpected "typ" JWT header value', payload, "typ", "check_failed");
  }
  const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options;
  const presenceCheck = [...requiredClaims];
  if (maxTokenAge !== void 0)
    presenceCheck.push("iat");
  if (audience !== void 0)
    presenceCheck.push("aud");
  if (subject !== void 0)
    presenceCheck.push("sub");
  if (issuer !== void 0)
    presenceCheck.push("iss");
  for (const claim of new Set(presenceCheck.reverse())) {
    if (!(claim in payload)) {
      throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, payload, claim, "missing");
    }
  }
  if (issuer && !(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss)) {
    throw new JWTClaimValidationFailed('unexpected "iss" claim value', payload, "iss", "check_failed");
  }
  if (subject && payload.sub !== subject) {
    throw new JWTClaimValidationFailed('unexpected "sub" claim value', payload, "sub", "check_failed");
  }
  if (audience && !checkAudiencePresence(payload.aud, typeof audience === "string" ? [audience] : audience)) {
    throw new JWTClaimValidationFailed('unexpected "aud" claim value', payload, "aud", "check_failed");
  }
  let tolerance;
  switch (typeof options.clockTolerance) {
    case "string":
      tolerance = secs(options.clockTolerance);
      break;
    case "number":
      tolerance = options.clockTolerance;
      break;
    case "undefined":
      tolerance = 0;
      break;
    default:
      throw new TypeError("Invalid clockTolerance option type");
  }
  const { currentDate } = options;
  const now = epoch(currentDate || /* @__PURE__ */ new Date());
  if ((payload.iat !== void 0 || maxTokenAge) && typeof payload.iat !== "number") {
    throw new JWTClaimValidationFailed('"iat" claim must be a number', payload, "iat", "invalid");
  }
  if (payload.nbf !== void 0) {
    if (typeof payload.nbf !== "number") {
      throw new JWTClaimValidationFailed('"nbf" claim must be a number', payload, "nbf", "invalid");
    }
    if (payload.nbf > now + tolerance) {
      throw new JWTClaimValidationFailed('"nbf" claim timestamp check failed', payload, "nbf", "check_failed");
    }
  }
  if (payload.exp !== void 0) {
    if (typeof payload.exp !== "number") {
      throw new JWTClaimValidationFailed('"exp" claim must be a number', payload, "exp", "invalid");
    }
    if (payload.exp <= now - tolerance) {
      throw new JWTExpired('"exp" claim timestamp check failed', payload, "exp", "check_failed");
    }
  }
  if (maxTokenAge) {
    const age = now - payload.iat;
    const max2 = typeof maxTokenAge === "number" ? maxTokenAge : secs(maxTokenAge);
    if (age - tolerance > max2) {
      throw new JWTExpired('"iat" claim timestamp check failed (too far in the past)', payload, "iat", "check_failed");
    }
    if (age < 0 - tolerance) {
      throw new JWTClaimValidationFailed('"iat" claim timestamp check failed (it should be in the past)', payload, "iat", "check_failed");
    }
  }
  return payload;
}
async function jwtVerify(jwt, key, options) {
  var _a2;
  const verified = await compactVerify(jwt, key, options);
  if (((_a2 = verified.protectedHeader.crit) == null ? void 0 : _a2.includes("b64")) && verified.protectedHeader.b64 === false) {
    throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
  }
  const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
  const result = { payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
const TOKEN_FILE_NAME = "offline-token.jwt";
function getTokenPath() {
  return path$1.join(electron.app.getPath("userData"), TOKEN_FILE_NAME);
}
function storeOfflineToken(token) {
  try {
    fs$2.writeFileSync(getTokenPath(), token, "utf-8");
  } catch (err) {
    console.error("[OfflineToken] Failed to store token:", err);
  }
}
function loadOfflineToken() {
  try {
    const tokenPath = getTokenPath();
    if (!fs$2.existsSync(tokenPath)) return null;
    const raw = fs$2.readFileSync(tokenPath, "utf-8").trim();
    return raw || null;
  } catch {
    return null;
  }
}
async function verifyAndDecodeToken(token, publicKeyPem) {
  try {
    const publicKey = await importSPKI(publicKeyPem, "RS256");
    const { payload } = await jwtVerify(token, publicKey);
    return payload;
  } catch (err) {
    console.warn("[OfflineToken] Token verification failed:", err);
    return null;
  }
}
function evaluateSubscriptionState(payload, lastSeenAt) {
  const now = Date.now();
  const issuedAt = new Date(payload.issuedAt).getTime();
  if (now < issuedAt) {
    return "clock-tampered";
  }
  if (lastSeenAt && now < lastSeenAt.getTime()) {
    return "clock-tampered";
  }
  const msOffline = now - issuedAt;
  const maxOfflineMs = payload.maxOfflineDays * 24 * 60 * 60 * 1e3;
  if (msOffline > maxOfflineMs) {
    return "offline-limit-exceeded";
  }
  if (payload.isSuspended) {
    return "suspended";
  }
  if (payload.gracePeriodEndsAt) {
    const graceEnd = new Date(payload.gracePeriodEndsAt).getTime();
    if (now > graceEnd) {
      return "suspended";
    }
  }
  if (payload.subscriptionEndsAt) {
    const subEnd = new Date(payload.subscriptionEndsAt).getTime();
    if (now > subEnd) {
      return "grace";
    }
  }
  return "active";
}
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x2) {
  return x2 && x2.__esModule && Object.prototype.hasOwnProperty.call(x2, "default") ? x2["default"] : x2;
}
var dist = { exports: {} };
(function(module2, exports$1) {
  !function(t, n) {
    module2.exports = n(require$$0$1, require$$1);
  }(commonjsGlobal, function(t, n) {
    return function(t2) {
      function n2(e10) {
        if (r[e10]) return r[e10].exports;
        var o = r[e10] = { exports: {}, id: e10, loaded: false };
        return t2[e10].call(o.exports, o, o.exports, n2), o.loaded = true, o.exports;
      }
      var r = {};
      return n2.m = t2, n2.c = r, n2.p = "", n2(0);
    }([function(t2, n2, r) {
      t2.exports = r(34);
    }, function(t2, n2, r) {
      var e10 = r(29)("wks"), o = r(33), i = r(2).Symbol, c = "function" == typeof i, u = t2.exports = function(t3) {
        return e10[t3] || (e10[t3] = c && i[t3] || (c ? i : o)("Symbol." + t3));
      };
      u.store = e10;
    }, function(t2, n2) {
      var r = t2.exports = "undefined" != typeof window && window.Math == Math ? window : "undefined" != typeof self && self.Math == Math ? self : Function("return this")();
      "number" == typeof __g && (__g = r);
    }, function(t2, n2, r) {
      var e10 = r(9);
      t2.exports = function(t3) {
        if (!e10(t3)) throw TypeError(t3 + " is not an object!");
        return t3;
      };
    }, function(t2, n2, r) {
      t2.exports = !r(24)(function() {
        return 7 != Object.defineProperty({}, "a", { get: function() {
          return 7;
        } }).a;
      });
    }, function(t2, n2, r) {
      var e10 = r(12), o = r(17);
      t2.exports = r(4) ? function(t3, n3, r2) {
        return e10.f(t3, n3, o(1, r2));
      } : function(t3, n3, r2) {
        return t3[n3] = r2, t3;
      };
    }, function(t2, n2) {
      var r = t2.exports = { version: "2.4.0" };
      "number" == typeof __e && (__e = r);
    }, function(t2, n2, r) {
      var e10 = r(14);
      t2.exports = function(t3, n3, r2) {
        if (e10(t3), void 0 === n3) return t3;
        switch (r2) {
          case 1:
            return function(r3) {
              return t3.call(n3, r3);
            };
          case 2:
            return function(r3, e22) {
              return t3.call(n3, r3, e22);
            };
          case 3:
            return function(r3, e22, o) {
              return t3.call(n3, r3, e22, o);
            };
        }
        return function() {
          return t3.apply(n3, arguments);
        };
      };
    }, function(t2, n2) {
      var r = {}.hasOwnProperty;
      t2.exports = function(t3, n3) {
        return r.call(t3, n3);
      };
    }, function(t2, n2) {
      t2.exports = function(t3) {
        return "object" == typeof t3 ? null !== t3 : "function" == typeof t3;
      };
    }, function(t2, n2) {
      t2.exports = {};
    }, function(t2, n2) {
      var r = {}.toString;
      t2.exports = function(t3) {
        return r.call(t3).slice(8, -1);
      };
    }, function(t2, n2, r) {
      var e10 = r(3), o = r(26), i = r(32), c = Object.defineProperty;
      n2.f = r(4) ? Object.defineProperty : function(t3, n3, r2) {
        if (e10(t3), n3 = i(n3, true), e10(r2), o) try {
          return c(t3, n3, r2);
        } catch (t4) {
        }
        if ("get" in r2 || "set" in r2) throw TypeError("Accessors not supported!");
        return "value" in r2 && (t3[n3] = r2.value), t3;
      };
    }, function(t2, n2, r) {
      var e10 = r(42), o = r(15);
      t2.exports = function(t3) {
        return e10(o(t3));
      };
    }, function(t2, n2) {
      t2.exports = function(t3) {
        if ("function" != typeof t3) throw TypeError(t3 + " is not a function!");
        return t3;
      };
    }, function(t2, n2) {
      t2.exports = function(t3) {
        if (void 0 == t3) throw TypeError("Can't call method on  " + t3);
        return t3;
      };
    }, function(t2, n2, r) {
      var e10 = r(9), o = r(2).document, i = e10(o) && e10(o.createElement);
      t2.exports = function(t3) {
        return i ? o.createElement(t3) : {};
      };
    }, function(t2, n2) {
      t2.exports = function(t3, n3) {
        return { enumerable: !(1 & t3), configurable: !(2 & t3), writable: !(4 & t3), value: n3 };
      };
    }, function(t2, n2, r) {
      var e10 = r(12).f, o = r(8), i = r(1)("toStringTag");
      t2.exports = function(t3, n3, r2) {
        t3 && !o(t3 = r2 ? t3 : t3.prototype, i) && e10(t3, i, { configurable: true, value: n3 });
      };
    }, function(t2, n2, r) {
      var e10 = r(29)("keys"), o = r(33);
      t2.exports = function(t3) {
        return e10[t3] || (e10[t3] = o(t3));
      };
    }, function(t2, n2) {
      var r = Math.ceil, e10 = Math.floor;
      t2.exports = function(t3) {
        return isNaN(t3 = +t3) ? 0 : (t3 > 0 ? e10 : r)(t3);
      };
    }, function(t2, n2, r) {
      var e10 = r(11), o = r(1)("toStringTag"), i = "Arguments" == e10(/* @__PURE__ */ function() {
        return arguments;
      }()), c = function(t3, n3) {
        try {
          return t3[n3];
        } catch (t4) {
        }
      };
      t2.exports = function(t3) {
        var n3, r2, u;
        return void 0 === t3 ? "Undefined" : null === t3 ? "Null" : "string" == typeof (r2 = c(n3 = Object(t3), o)) ? r2 : i ? e10(n3) : "Object" == (u = e10(n3)) && "function" == typeof n3.callee ? "Arguments" : u;
      };
    }, function(t2, n2) {
      t2.exports = "constructor,hasOwnProperty,isPrototypeOf,propertyIsEnumerable,toLocaleString,toString,valueOf".split(",");
    }, function(t2, n2, r) {
      var e10 = r(2), o = r(6), i = r(7), c = r(5), u = "prototype", s = function(t3, n3, r2) {
        var f, a, p, l = t3 & s.F, v = t3 & s.G, h = t3 & s.S, d = t3 & s.P, y2 = t3 & s.B, _ = t3 & s.W, x2 = v ? o : o[n3] || (o[n3] = {}), m2 = x2[u], w2 = v ? e10 : h ? e10[n3] : (e10[n3] || {})[u];
        v && (r2 = n3);
        for (f in r2) a = !l && w2 && void 0 !== w2[f], a && f in x2 || (p = a ? w2[f] : r2[f], x2[f] = v && "function" != typeof w2[f] ? r2[f] : y2 && a ? i(p, e10) : _ && w2[f] == p ? function(t4) {
          var n4 = function(n5, r3, e22) {
            if (this instanceof t4) {
              switch (arguments.length) {
                case 0:
                  return new t4();
                case 1:
                  return new t4(n5);
                case 2:
                  return new t4(n5, r3);
              }
              return new t4(n5, r3, e22);
            }
            return t4.apply(this, arguments);
          };
          return n4[u] = t4[u], n4;
        }(p) : d && "function" == typeof p ? i(Function.call, p) : p, d && ((x2.virtual || (x2.virtual = {}))[f] = p, t3 & s.R && m2 && !m2[f] && c(m2, f, p)));
      };
      s.F = 1, s.G = 2, s.S = 4, s.P = 8, s.B = 16, s.W = 32, s.U = 64, s.R = 128, t2.exports = s;
    }, function(t2, n2) {
      t2.exports = function(t3) {
        try {
          return !!t3();
        } catch (t4) {
          return true;
        }
      };
    }, function(t2, n2, r) {
      t2.exports = r(2).document && document.documentElement;
    }, function(t2, n2, r) {
      t2.exports = !r(4) && !r(24)(function() {
        return 7 != Object.defineProperty(r(16)("div"), "a", { get: function() {
          return 7;
        } }).a;
      });
    }, function(t2, n2, r) {
      var e10 = r(28), o = r(23), i = r(57), c = r(5), u = r(8), s = r(10), f = r(45), a = r(18), p = r(52), l = r(1)("iterator"), v = !([].keys && "next" in [].keys()), h = "@@iterator", d = "keys", y2 = "values", _ = function() {
        return this;
      };
      t2.exports = function(t3, n3, r2, x2, m2, w2, g) {
        f(r2, n3, x2);
        var b2, O, j2, S = function(t4) {
          if (!v && t4 in T) return T[t4];
          switch (t4) {
            case d:
              return function() {
                return new r2(this, t4);
              };
            case y2:
              return function() {
                return new r2(this, t4);
              };
          }
          return function() {
            return new r2(this, t4);
          };
        }, E = n3 + " Iterator", P2 = m2 == y2, M2 = false, T = t3.prototype, A2 = T[l] || T[h] || m2 && T[m2], k2 = A2 || S(m2), C = m2 ? P2 ? S("entries") : k2 : void 0, I2 = "Array" == n3 ? T.entries || A2 : A2;
        if (I2 && (j2 = p(I2.call(new t3())), j2 !== Object.prototype && (a(j2, E, true), e10 || u(j2, l) || c(j2, l, _))), P2 && A2 && A2.name !== y2 && (M2 = true, k2 = function() {
          return A2.call(this);
        }), e10 && !g || !v && !M2 && T[l] || c(T, l, k2), s[n3] = k2, s[E] = _, m2) if (b2 = { values: P2 ? k2 : S(y2), keys: w2 ? k2 : S(d), entries: C }, g) for (O in b2) O in T || i(T, O, b2[O]);
        else o(o.P + o.F * (v || M2), n3, b2);
        return b2;
      };
    }, function(t2, n2) {
      t2.exports = true;
    }, function(t2, n2, r) {
      var e10 = r(2), o = "__core-js_shared__", i = e10[o] || (e10[o] = {});
      t2.exports = function(t3) {
        return i[t3] || (i[t3] = {});
      };
    }, function(t2, n2, r) {
      var e10, o, i, c = r(7), u = r(41), s = r(25), f = r(16), a = r(2), p = a.process, l = a.setImmediate, v = a.clearImmediate, h = a.MessageChannel, d = 0, y2 = {}, _ = "onreadystatechange", x2 = function() {
        var t3 = +this;
        if (y2.hasOwnProperty(t3)) {
          var n3 = y2[t3];
          delete y2[t3], n3();
        }
      }, m2 = function(t3) {
        x2.call(t3.data);
      };
      l && v || (l = function(t3) {
        for (var n3 = [], r2 = 1; arguments.length > r2; ) n3.push(arguments[r2++]);
        return y2[++d] = function() {
          u("function" == typeof t3 ? t3 : Function(t3), n3);
        }, e10(d), d;
      }, v = function(t3) {
        delete y2[t3];
      }, "process" == r(11)(p) ? e10 = function(t3) {
        p.nextTick(c(x2, t3, 1));
      } : h ? (o = new h(), i = o.port2, o.port1.onmessage = m2, e10 = c(i.postMessage, i, 1)) : a.addEventListener && "function" == typeof postMessage && !a.importScripts ? (e10 = function(t3) {
        a.postMessage(t3 + "", "*");
      }, a.addEventListener("message", m2, false)) : e10 = _ in f("script") ? function(t3) {
        s.appendChild(f("script"))[_] = function() {
          s.removeChild(this), x2.call(t3);
        };
      } : function(t3) {
        setTimeout(c(x2, t3, 1), 0);
      }), t2.exports = { set: l, clear: v };
    }, function(t2, n2, r) {
      var e10 = r(20), o = Math.min;
      t2.exports = function(t3) {
        return t3 > 0 ? o(e10(t3), 9007199254740991) : 0;
      };
    }, function(t2, n2, r) {
      var e10 = r(9);
      t2.exports = function(t3, n3) {
        if (!e10(t3)) return t3;
        var r2, o;
        if (n3 && "function" == typeof (r2 = t3.toString) && !e10(o = r2.call(t3))) return o;
        if ("function" == typeof (r2 = t3.valueOf) && !e10(o = r2.call(t3))) return o;
        if (!n3 && "function" == typeof (r2 = t3.toString) && !e10(o = r2.call(t3))) return o;
        throw TypeError("Can't convert object to primitive value");
      };
    }, function(t2, n2) {
      var r = 0, e10 = Math.random();
      t2.exports = function(t3) {
        return "Symbol(".concat(void 0 === t3 ? "" : t3, ")_", (++r + e10).toString(36));
      };
    }, function(t2, n2, r) {
      function e10(t3) {
        return t3 && t3.__esModule ? t3 : { default: t3 };
      }
      function o() {
        return "win32" !== process.platform ? "" : "ia32" === process.arch && process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432") ? "mixed" : "native";
      }
      function i(t3) {
        return (0, l.createHash)("sha256").update(t3).digest("hex");
      }
      function c(t3) {
        switch (h) {
          case "darwin":
            return t3.split("IOPlatformUUID")[1].split("\n")[0].replace(/\=|\s+|\"/gi, "").toLowerCase();
          case "win32":
            return t3.toString().split("REG_SZ")[1].replace(/\r+|\n+|\s+/gi, "").toLowerCase();
          case "linux":
            return t3.toString().replace(/\r+|\n+|\s+/gi, "").toLowerCase();
          case "freebsd":
            return t3.toString().replace(/\r+|\n+|\s+/gi, "").toLowerCase();
          default:
            throw new Error("Unsupported platform: " + process.platform);
        }
      }
      function u(t3) {
        var n3 = c((0, p.execSync)(y2[h]).toString());
        return t3 ? n3 : i(n3);
      }
      function s(t3) {
        return new a.default(function(n3, r2) {
          return (0, p.exec)(y2[h], {}, function(e22, o2, u2) {
            if (e22) return r2(new Error("Error while obtaining machine id: " + e22.stack));
            var s2 = c(o2.toString());
            return n3(t3 ? s2 : i(s2));
          });
        });
      }
      Object.defineProperty(n2, "__esModule", { value: true });
      var f = r(35), a = e10(f);
      n2.machineIdSync = u, n2.machineId = s;
      var p = r(70), l = r(71), v = process, h = v.platform, d = { native: "%windir%\\System32", mixed: "%windir%\\sysnative\\cmd.exe /c %windir%\\System32" }, y2 = { darwin: "ioreg -rd1 -c IOPlatformExpertDevice", win32: d[o()] + "\\REG.exe QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid", linux: "( cat /var/lib/dbus/machine-id /etc/machine-id 2> /dev/null || hostname ) | head -n 1 || :", freebsd: "kenv -q smbios.system.uuid || sysctl -n kern.hostuuid" };
    }, function(t2, n2, r) {
      t2.exports = { default: r(36), __esModule: true };
    }, function(t2, n2, r) {
      r(66), r(68), r(69), r(67), t2.exports = r(6).Promise;
    }, function(t2, n2) {
      t2.exports = function() {
      };
    }, function(t2, n2) {
      t2.exports = function(t3, n3, r, e10) {
        if (!(t3 instanceof n3) || void 0 !== e10 && e10 in t3) throw TypeError(r + ": incorrect invocation!");
        return t3;
      };
    }, function(t2, n2, r) {
      var e10 = r(13), o = r(31), i = r(62);
      t2.exports = function(t3) {
        return function(n3, r2, c) {
          var u, s = e10(n3), f = o(s.length), a = i(c, f);
          if (t3 && r2 != r2) {
            for (; f > a; ) if (u = s[a++], u != u) return true;
          } else for (; f > a; a++) if ((t3 || a in s) && s[a] === r2) return t3 || a || 0;
          return !t3 && -1;
        };
      };
    }, function(t2, n2, r) {
      var e10 = r(7), o = r(44), i = r(43), c = r(3), u = r(31), s = r(64), f = {}, a = {}, n2 = t2.exports = function(t3, n3, r2, p, l) {
        var v, h, d, y2, _ = l ? function() {
          return t3;
        } : s(t3), x2 = e10(r2, p, n3 ? 2 : 1), m2 = 0;
        if ("function" != typeof _) throw TypeError(t3 + " is not iterable!");
        if (i(_)) {
          for (v = u(t3.length); v > m2; m2++) if (y2 = n3 ? x2(c(h = t3[m2])[0], h[1]) : x2(t3[m2]), y2 === f || y2 === a) return y2;
        } else for (d = _.call(t3); !(h = d.next()).done; ) if (y2 = o(d, x2, h.value, n3), y2 === f || y2 === a) return y2;
      };
      n2.BREAK = f, n2.RETURN = a;
    }, function(t2, n2) {
      t2.exports = function(t3, n3, r) {
        var e10 = void 0 === r;
        switch (n3.length) {
          case 0:
            return e10 ? t3() : t3.call(r);
          case 1:
            return e10 ? t3(n3[0]) : t3.call(r, n3[0]);
          case 2:
            return e10 ? t3(n3[0], n3[1]) : t3.call(r, n3[0], n3[1]);
          case 3:
            return e10 ? t3(n3[0], n3[1], n3[2]) : t3.call(r, n3[0], n3[1], n3[2]);
          case 4:
            return e10 ? t3(n3[0], n3[1], n3[2], n3[3]) : t3.call(r, n3[0], n3[1], n3[2], n3[3]);
        }
        return t3.apply(r, n3);
      };
    }, function(t2, n2, r) {
      var e10 = r(11);
      t2.exports = Object("z").propertyIsEnumerable(0) ? Object : function(t3) {
        return "String" == e10(t3) ? t3.split("") : Object(t3);
      };
    }, function(t2, n2, r) {
      var e10 = r(10), o = r(1)("iterator"), i = Array.prototype;
      t2.exports = function(t3) {
        return void 0 !== t3 && (e10.Array === t3 || i[o] === t3);
      };
    }, function(t2, n2, r) {
      var e10 = r(3);
      t2.exports = function(t3, n3, r2, o) {
        try {
          return o ? n3(e10(r2)[0], r2[1]) : n3(r2);
        } catch (n4) {
          var i = t3.return;
          throw void 0 !== i && e10(i.call(t3)), n4;
        }
      };
    }, function(t2, n2, r) {
      var e10 = r(49), o = r(17), i = r(18), c = {};
      r(5)(c, r(1)("iterator"), function() {
        return this;
      }), t2.exports = function(t3, n3, r2) {
        t3.prototype = e10(c, { next: o(1, r2) }), i(t3, n3 + " Iterator");
      };
    }, function(t2, n2, r) {
      var e10 = r(1)("iterator"), o = false;
      try {
        var i = [7][e10]();
        i.return = function() {
          o = true;
        }, Array.from(i, function() {
          throw 2;
        });
      } catch (t3) {
      }
      t2.exports = function(t3, n3) {
        if (!n3 && !o) return false;
        var r2 = false;
        try {
          var i2 = [7], c = i2[e10]();
          c.next = function() {
            return { done: r2 = true };
          }, i2[e10] = function() {
            return c;
          }, t3(i2);
        } catch (t4) {
        }
        return r2;
      };
    }, function(t2, n2) {
      t2.exports = function(t3, n3) {
        return { value: n3, done: !!t3 };
      };
    }, function(t2, n2, r) {
      var e10 = r(2), o = r(30).set, i = e10.MutationObserver || e10.WebKitMutationObserver, c = e10.process, u = e10.Promise, s = "process" == r(11)(c);
      t2.exports = function() {
        var t3, n3, r2, f = function() {
          var e22, o2;
          for (s && (e22 = c.domain) && e22.exit(); t3; ) {
            o2 = t3.fn, t3 = t3.next;
            try {
              o2();
            } catch (e32) {
              throw t3 ? r2() : n3 = void 0, e32;
            }
          }
          n3 = void 0, e22 && e22.enter();
        };
        if (s) r2 = function() {
          c.nextTick(f);
        };
        else if (i) {
          var a = true, p = document.createTextNode("");
          new i(f).observe(p, { characterData: true }), r2 = function() {
            p.data = a = !a;
          };
        } else if (u && u.resolve) {
          var l = u.resolve();
          r2 = function() {
            l.then(f);
          };
        } else r2 = function() {
          o.call(e10, f);
        };
        return function(e22) {
          var o2 = { fn: e22, next: void 0 };
          n3 && (n3.next = o2), t3 || (t3 = o2, r2()), n3 = o2;
        };
      };
    }, function(t2, n2, r) {
      var e10 = r(3), o = r(50), i = r(22), c = r(19)("IE_PROTO"), u = function() {
      }, s = "prototype", f = function() {
        var t3, n3 = r(16)("iframe"), e22 = i.length, o2 = ">";
        for (n3.style.display = "none", r(25).appendChild(n3), n3.src = "javascript:", t3 = n3.contentWindow.document, t3.open(), t3.write("<script>document.F=Object<\/script" + o2), t3.close(), f = t3.F; e22--; ) delete f[s][i[e22]];
        return f();
      };
      t2.exports = Object.create || function(t3, n3) {
        var r2;
        return null !== t3 ? (u[s] = e10(t3), r2 = new u(), u[s] = null, r2[c] = t3) : r2 = f(), void 0 === n3 ? r2 : o(r2, n3);
      };
    }, function(t2, n2, r) {
      var e10 = r(12), o = r(3), i = r(54);
      t2.exports = r(4) ? Object.defineProperties : function(t3, n3) {
        o(t3);
        for (var r2, c = i(n3), u = c.length, s = 0; u > s; ) e10.f(t3, r2 = c[s++], n3[r2]);
        return t3;
      };
    }, function(t2, n2, r) {
      var e10 = r(55), o = r(17), i = r(13), c = r(32), u = r(8), s = r(26), f = Object.getOwnPropertyDescriptor;
      n2.f = r(4) ? f : function(t3, n3) {
        if (t3 = i(t3), n3 = c(n3, true), s) try {
          return f(t3, n3);
        } catch (t4) {
        }
        if (u(t3, n3)) return o(!e10.f.call(t3, n3), t3[n3]);
      };
    }, function(t2, n2, r) {
      var e10 = r(8), o = r(63), i = r(19)("IE_PROTO"), c = Object.prototype;
      t2.exports = Object.getPrototypeOf || function(t3) {
        return t3 = o(t3), e10(t3, i) ? t3[i] : "function" == typeof t3.constructor && t3 instanceof t3.constructor ? t3.constructor.prototype : t3 instanceof Object ? c : null;
      };
    }, function(t2, n2, r) {
      var e10 = r(8), o = r(13), i = r(39)(false), c = r(19)("IE_PROTO");
      t2.exports = function(t3, n3) {
        var r2, u = o(t3), s = 0, f = [];
        for (r2 in u) r2 != c && e10(u, r2) && f.push(r2);
        for (; n3.length > s; ) e10(u, r2 = n3[s++]) && (~i(f, r2) || f.push(r2));
        return f;
      };
    }, function(t2, n2, r) {
      var e10 = r(53), o = r(22);
      t2.exports = Object.keys || function(t3) {
        return e10(t3, o);
      };
    }, function(t2, n2) {
      n2.f = {}.propertyIsEnumerable;
    }, function(t2, n2, r) {
      var e10 = r(5);
      t2.exports = function(t3, n3, r2) {
        for (var o in n3) r2 && t3[o] ? t3[o] = n3[o] : e10(t3, o, n3[o]);
        return t3;
      };
    }, function(t2, n2, r) {
      t2.exports = r(5);
    }, function(t2, n2, r) {
      var e10 = r(9), o = r(3), i = function(t3, n3) {
        if (o(t3), !e10(n3) && null !== n3) throw TypeError(n3 + ": can't set as prototype!");
      };
      t2.exports = { set: Object.setPrototypeOf || ("__proto__" in {} ? function(t3, n3, e22) {
        try {
          e22 = r(7)(Function.call, r(51).f(Object.prototype, "__proto__").set, 2), e22(t3, []), n3 = !(t3 instanceof Array);
        } catch (t4) {
          n3 = true;
        }
        return function(t4, r2) {
          return i(t4, r2), n3 ? t4.__proto__ = r2 : e22(t4, r2), t4;
        };
      }({}, false) : void 0), check: i };
    }, function(t2, n2, r) {
      var e10 = r(2), o = r(6), i = r(12), c = r(4), u = r(1)("species");
      t2.exports = function(t3) {
        var n3 = "function" == typeof o[t3] ? o[t3] : e10[t3];
        c && n3 && !n3[u] && i.f(n3, u, { configurable: true, get: function() {
          return this;
        } });
      };
    }, function(t2, n2, r) {
      var e10 = r(3), o = r(14), i = r(1)("species");
      t2.exports = function(t3, n3) {
        var r2, c = e10(t3).constructor;
        return void 0 === c || void 0 == (r2 = e10(c)[i]) ? n3 : o(r2);
      };
    }, function(t2, n2, r) {
      var e10 = r(20), o = r(15);
      t2.exports = function(t3) {
        return function(n3, r2) {
          var i, c, u = String(o(n3)), s = e10(r2), f = u.length;
          return s < 0 || s >= f ? t3 ? "" : void 0 : (i = u.charCodeAt(s), i < 55296 || i > 56319 || s + 1 === f || (c = u.charCodeAt(s + 1)) < 56320 || c > 57343 ? t3 ? u.charAt(s) : i : t3 ? u.slice(s, s + 2) : (i - 55296 << 10) + (c - 56320) + 65536);
        };
      };
    }, function(t2, n2, r) {
      var e10 = r(20), o = Math.max, i = Math.min;
      t2.exports = function(t3, n3) {
        return t3 = e10(t3), t3 < 0 ? o(t3 + n3, 0) : i(t3, n3);
      };
    }, function(t2, n2, r) {
      var e10 = r(15);
      t2.exports = function(t3) {
        return Object(e10(t3));
      };
    }, function(t2, n2, r) {
      var e10 = r(21), o = r(1)("iterator"), i = r(10);
      t2.exports = r(6).getIteratorMethod = function(t3) {
        if (void 0 != t3) return t3[o] || t3["@@iterator"] || i[e10(t3)];
      };
    }, function(t2, n2, r) {
      var e10 = r(37), o = r(47), i = r(10), c = r(13);
      t2.exports = r(27)(Array, "Array", function(t3, n3) {
        this._t = c(t3), this._i = 0, this._k = n3;
      }, function() {
        var t3 = this._t, n3 = this._k, r2 = this._i++;
        return !t3 || r2 >= t3.length ? (this._t = void 0, o(1)) : "keys" == n3 ? o(0, r2) : "values" == n3 ? o(0, t3[r2]) : o(0, [r2, t3[r2]]);
      }, "values"), i.Arguments = i.Array, e10("keys"), e10("values"), e10("entries");
    }, function(t2, n2) {
    }, function(t2, n2, r) {
      var e10, o, i, c = r(28), u = r(2), s = r(7), f = r(21), a = r(23), p = r(9), l = (r(3), r(14)), v = r(38), h = r(40), d = (r(58).set, r(60)), y2 = r(30).set, _ = r(48)(), x2 = "Promise", m2 = u.TypeError, w2 = u.process, g = u[x2], w2 = u.process, b2 = "process" == f(w2), O = function() {
      }, j2 = !!function() {
        try {
          var t3 = g.resolve(1), n3 = (t3.constructor = {})[r(1)("species")] = function(t4) {
            t4(O, O);
          };
          return (b2 || "function" == typeof PromiseRejectionEvent) && t3.then(O) instanceof n3;
        } catch (t4) {
        }
      }(), S = function(t3, n3) {
        return t3 === n3 || t3 === g && n3 === i;
      }, E = function(t3) {
        var n3;
        return !(!p(t3) || "function" != typeof (n3 = t3.then)) && n3;
      }, P2 = function(t3) {
        return S(g, t3) ? new M2(t3) : new o(t3);
      }, M2 = o = function(t3) {
        var n3, r2;
        this.promise = new t3(function(t4, e22) {
          if (void 0 !== n3 || void 0 !== r2) throw m2("Bad Promise constructor");
          n3 = t4, r2 = e22;
        }), this.resolve = l(n3), this.reject = l(r2);
      }, T = function(t3) {
        try {
          t3();
        } catch (t4) {
          return { error: t4 };
        }
      }, A2 = function(t3, n3) {
        if (!t3._n) {
          t3._n = true;
          var r2 = t3._c;
          _(function() {
            for (var e22 = t3._v, o2 = 1 == t3._s, i2 = 0, c2 = function(n4) {
              var r3, i3, c3 = o2 ? n4.ok : n4.fail, u2 = n4.resolve, s2 = n4.reject, f2 = n4.domain;
              try {
                c3 ? (o2 || (2 == t3._h && I2(t3), t3._h = 1), c3 === true ? r3 = e22 : (f2 && f2.enter(), r3 = c3(e22), f2 && f2.exit()), r3 === n4.promise ? s2(m2("Promise-chain cycle")) : (i3 = E(r3)) ? i3.call(r3, u2, s2) : u2(r3)) : s2(e22);
              } catch (t4) {
                s2(t4);
              }
            }; r2.length > i2; ) c2(r2[i2++]);
            t3._c = [], t3._n = false, n3 && !t3._h && k2(t3);
          });
        }
      }, k2 = function(t3) {
        y2.call(u, function() {
          var n3, r2, e22, o2 = t3._v;
          if (C(t3) && (n3 = T(function() {
            b2 ? w2.emit("unhandledRejection", o2, t3) : (r2 = u.onunhandledrejection) ? r2({ promise: t3, reason: o2 }) : (e22 = u.console) && e22.error && e22.error("Unhandled promise rejection", o2);
          }), t3._h = b2 || C(t3) ? 2 : 1), t3._a = void 0, n3) throw n3.error;
        });
      }, C = function(t3) {
        if (1 == t3._h) return false;
        for (var n3, r2 = t3._a || t3._c, e22 = 0; r2.length > e22; ) if (n3 = r2[e22++], n3.fail || !C(n3.promise)) return false;
        return true;
      }, I2 = function(t3) {
        y2.call(u, function() {
          var n3;
          b2 ? w2.emit("rejectionHandled", t3) : (n3 = u.onrejectionhandled) && n3({ promise: t3, reason: t3._v });
        });
      }, R2 = function(t3) {
        var n3 = this;
        n3._d || (n3._d = true, n3 = n3._w || n3, n3._v = t3, n3._s = 2, n3._a || (n3._a = n3._c.slice()), A2(n3, true));
      }, F2 = function(t3) {
        var n3, r2 = this;
        if (!r2._d) {
          r2._d = true, r2 = r2._w || r2;
          try {
            if (r2 === t3) throw m2("Promise can't be resolved itself");
            (n3 = E(t3)) ? _(function() {
              var e22 = { _w: r2, _d: false };
              try {
                n3.call(t3, s(F2, e22, 1), s(R2, e22, 1));
              } catch (t4) {
                R2.call(e22, t4);
              }
            }) : (r2._v = t3, r2._s = 1, A2(r2, false));
          } catch (t4) {
            R2.call({ _w: r2, _d: false }, t4);
          }
        }
      };
      j2 || (g = function(t3) {
        v(this, g, x2, "_h"), l(t3), e10.call(this);
        try {
          t3(s(F2, this, 1), s(R2, this, 1));
        } catch (t4) {
          R2.call(this, t4);
        }
      }, e10 = function(t3) {
        this._c = [], this._a = void 0, this._s = 0, this._d = false, this._v = void 0, this._h = 0, this._n = false;
      }, e10.prototype = r(56)(g.prototype, { then: function(t3, n3) {
        var r2 = P2(d(this, g));
        return r2.ok = "function" != typeof t3 || t3, r2.fail = "function" == typeof n3 && n3, r2.domain = b2 ? w2.domain : void 0, this._c.push(r2), this._a && this._a.push(r2), this._s && A2(this, false), r2.promise;
      }, catch: function(t3) {
        return this.then(void 0, t3);
      } }), M2 = function() {
        var t3 = new e10();
        this.promise = t3, this.resolve = s(F2, t3, 1), this.reject = s(R2, t3, 1);
      }), a(a.G + a.W + a.F * !j2, { Promise: g }), r(18)(g, x2), r(59)(x2), i = r(6)[x2], a(a.S + a.F * !j2, x2, { reject: function(t3) {
        var n3 = P2(this), r2 = n3.reject;
        return r2(t3), n3.promise;
      } }), a(a.S + a.F * (c || !j2), x2, { resolve: function(t3) {
        if (t3 instanceof g && S(t3.constructor, this)) return t3;
        var n3 = P2(this), r2 = n3.resolve;
        return r2(t3), n3.promise;
      } }), a(a.S + a.F * !(j2 && r(46)(function(t3) {
        g.all(t3).catch(O);
      })), x2, { all: function(t3) {
        var n3 = this, r2 = P2(n3), e22 = r2.resolve, o2 = r2.reject, i2 = T(function() {
          var r3 = [], i3 = 0, c2 = 1;
          h(t3, false, function(t4) {
            var u2 = i3++, s2 = false;
            r3.push(void 0), c2++, n3.resolve(t4).then(function(t5) {
              s2 || (s2 = true, r3[u2] = t5, --c2 || e22(r3));
            }, o2);
          }), --c2 || e22(r3);
        });
        return i2 && o2(i2.error), r2.promise;
      }, race: function(t3) {
        var n3 = this, r2 = P2(n3), e22 = r2.reject, o2 = T(function() {
          h(t3, false, function(t4) {
            n3.resolve(t4).then(r2.resolve, e22);
          });
        });
        return o2 && e22(o2.error), r2.promise;
      } });
    }, function(t2, n2, r) {
      var e10 = r(61)(true);
      r(27)(String, "String", function(t3) {
        this._t = String(t3), this._i = 0;
      }, function() {
        var t3, n3 = this._t, r2 = this._i;
        return r2 >= n3.length ? { value: void 0, done: true } : (t3 = e10(n3, r2), this._i += t3.length, { value: t3, done: false });
      });
    }, function(t2, n2, r) {
      r(65);
      for (var e10 = r(2), o = r(5), i = r(10), c = r(1)("toStringTag"), u = ["NodeList", "DOMTokenList", "MediaList", "StyleSheetList", "CSSRuleList"], s = 0; s < 5; s++) {
        var f = u[s], a = e10[f], p = a && a.prototype;
        p && !p[c] && o(p, c, f), i[f] = i.Array;
      }
    }, function(t2, n2) {
      t2.exports = require$$0$1;
    }, function(t2, n2) {
      t2.exports = require$$1;
    }]);
  });
})(dist);
var distExports = dist.exports;
function getDeviceIdentity() {
  try {
    const hardwareId = distExports.machineIdSync();
    const deviceName = require$$0$2.hostname();
    return {
      hardwareId,
      deviceName,
      success: true
    };
  } catch (error) {
    console.error("Failed to get hardware device identity:", error);
    return {
      hardwareId: null,
      deviceName: require$$0$2.hostname(),
      success: false,
      error
    };
  }
}
var desktopClient = {};
function commonjsRequire(path2) {
  throw new Error('Could not dynamically require "' + path2 + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
}
var eu = Object.create;
var Nr = Object.defineProperty;
var tu = Object.getOwnPropertyDescriptor;
var ru = Object.getOwnPropertyNames;
var nu = Object.getPrototypeOf, iu = Object.prototype.hasOwnProperty;
var Z = (e10, t) => () => (t || e10((t = { exports: {} }).exports, t), t.exports), Ut = (e10, t) => {
  for (var r in t) Nr(e10, r, { get: t[r], enumerable: true });
}, ho = (e10, t, r, n) => {
  if (t && typeof t == "object" || typeof t == "function") for (let i of ru(t)) !iu.call(e10, i) && i !== r && Nr(e10, i, { get: () => t[i], enumerable: !(n = tu(t, i)) || n.enumerable });
  return e10;
};
var k = (e10, t, r) => (r = e10 != null ? eu(nu(e10)) : {}, ho(!e10 || !e10.__esModule ? Nr(r, "default", { value: e10, enumerable: true }) : r, e10)), ou = (e10) => ho(Nr({}, "__esModule", { value: true }), e10);
var jo = Z((pf, Zn) => {
  var v = Zn.exports;
  Zn.exports.default = v;
  var D = "\x1B[", Ht = "\x1B]", ft = "\x07", Jr = ";", qo = process.env.TERM_PROGRAM === "Apple_Terminal";
  v.cursorTo = (e10, t) => {
    if (typeof e10 != "number") throw new TypeError("The `x` argument is required");
    return typeof t != "number" ? D + (e10 + 1) + "G" : D + (t + 1) + ";" + (e10 + 1) + "H";
  };
  v.cursorMove = (e10, t) => {
    if (typeof e10 != "number") throw new TypeError("The `x` argument is required");
    let r = "";
    return e10 < 0 ? r += D + -e10 + "D" : e10 > 0 && (r += D + e10 + "C"), t < 0 ? r += D + -t + "A" : t > 0 && (r += D + t + "B"), r;
  };
  v.cursorUp = (e10 = 1) => D + e10 + "A";
  v.cursorDown = (e10 = 1) => D + e10 + "B";
  v.cursorForward = (e10 = 1) => D + e10 + "C";
  v.cursorBackward = (e10 = 1) => D + e10 + "D";
  v.cursorLeft = D + "G";
  v.cursorSavePosition = qo ? "\x1B7" : D + "s";
  v.cursorRestorePosition = qo ? "\x1B8" : D + "u";
  v.cursorGetPosition = D + "6n";
  v.cursorNextLine = D + "E";
  v.cursorPrevLine = D + "F";
  v.cursorHide = D + "?25l";
  v.cursorShow = D + "?25h";
  v.eraseLines = (e10) => {
    let t = "";
    for (let r = 0; r < e10; r++) t += v.eraseLine + (r < e10 - 1 ? v.cursorUp() : "");
    return e10 && (t += v.cursorLeft), t;
  };
  v.eraseEndLine = D + "K";
  v.eraseStartLine = D + "1K";
  v.eraseLine = D + "2K";
  v.eraseDown = D + "J";
  v.eraseUp = D + "1J";
  v.eraseScreen = D + "2J";
  v.scrollUp = D + "S";
  v.scrollDown = D + "T";
  v.clearScreen = "\x1Bc";
  v.clearTerminal = process.platform === "win32" ? `${v.eraseScreen}${D}0f` : `${v.eraseScreen}${D}3J${D}H`;
  v.beep = ft;
  v.link = (e10, t) => [Ht, "8", Jr, Jr, t, ft, e10, Ht, "8", Jr, Jr, ft].join("");
  v.image = (e10, t = {}) => {
    let r = `${Ht}1337;File=inline=1`;
    return t.width && (r += `;width=${t.width}`), t.height && (r += `;height=${t.height}`), t.preserveAspectRatio === false && (r += ";preserveAspectRatio=0"), r + ":" + e10.toString("base64") + ft;
  };
  v.iTerm = { setCwd: (e10 = process.cwd()) => `${Ht}50;CurrentDir=${e10}${ft}`, annotation: (e10, t = {}) => {
    let r = `${Ht}1337;`, n = typeof t.x < "u", i = typeof t.y < "u";
    if ((n || i) && !(n && i && typeof t.length < "u")) throw new Error("`x`, `y` and `length` must be defined when `x` or `y` is defined");
    return e10 = e10.replace(/\|/g, ""), r += t.isHidden ? "AddHiddenAnnotation=" : "AddAnnotation=", t.length > 0 ? r += (n ? [e10, t.length, t.x, t.y] : [t.length, e10]).join("|") : r += e10, r + ft;
  } };
});
var Xn = Z((df, Vo) => {
  Vo.exports = (e10, t = process.argv) => {
    let r = e10.startsWith("-") ? "" : e10.length === 1 ? "-" : "--", n = t.indexOf(r + e10), i = t.indexOf("--");
    return n !== -1 && (i === -1 || n < i);
  };
});
var Go = Z((mf, Uo) => {
  var Gu = require$$0$2, Bo = require$$1$2, de = Xn(), { env: Q } = process, Qe;
  de("no-color") || de("no-colors") || de("color=false") || de("color=never") ? Qe = 0 : (de("color") || de("colors") || de("color=true") || de("color=always")) && (Qe = 1);
  "FORCE_COLOR" in Q && (Q.FORCE_COLOR === "true" ? Qe = 1 : Q.FORCE_COLOR === "false" ? Qe = 0 : Qe = Q.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(Q.FORCE_COLOR, 10), 3));
  function ei(e10) {
    return e10 === 0 ? false : { level: e10, hasBasic: true, has256: e10 >= 2, has16m: e10 >= 3 };
  }
  function ti(e10, t) {
    if (Qe === 0) return 0;
    if (de("color=16m") || de("color=full") || de("color=truecolor")) return 3;
    if (de("color=256")) return 2;
    if (e10 && !t && Qe === void 0) return 0;
    let r = Qe || 0;
    if (Q.TERM === "dumb") return r;
    if (process.platform === "win32") {
      let n = Gu.release().split(".");
      return Number(n[0]) >= 10 && Number(n[2]) >= 10586 ? Number(n[2]) >= 14931 ? 3 : 2 : 1;
    }
    if ("CI" in Q) return ["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((n) => n in Q) || Q.CI_NAME === "codeship" ? 1 : r;
    if ("TEAMCITY_VERSION" in Q) return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(Q.TEAMCITY_VERSION) ? 1 : 0;
    if (Q.COLORTERM === "truecolor") return 3;
    if ("TERM_PROGRAM" in Q) {
      let n = parseInt((Q.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
      switch (Q.TERM_PROGRAM) {
        case "iTerm.app":
          return n >= 3 ? 3 : 2;
        case "Apple_Terminal":
          return 2;
      }
    }
    return /-256(color)?$/i.test(Q.TERM) ? 2 : /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(Q.TERM) || "COLORTERM" in Q ? 1 : r;
  }
  function Qu(e10) {
    let t = ti(e10, e10 && e10.isTTY);
    return ei(t);
  }
  Uo.exports = { supportsColor: Qu, stdout: ei(ti(true, Bo.isatty(1))), stderr: ei(ti(true, Bo.isatty(2))) };
});
var Wo = Z((ff, Jo) => {
  var Ju = Go(), gt = Xn();
  function Qo(e10) {
    if (/^\d{3,4}$/.test(e10)) {
      let r = /(\d{1,2})(\d{2})/.exec(e10);
      return { major: 0, minor: parseInt(r[1], 10), patch: parseInt(r[2], 10) };
    }
    let t = (e10 || "").split(".").map((r) => parseInt(r, 10));
    return { major: t[0], minor: t[1], patch: t[2] };
  }
  function ri(e10) {
    let { env: t } = process;
    if ("FORCE_HYPERLINK" in t) return !(t.FORCE_HYPERLINK.length > 0 && parseInt(t.FORCE_HYPERLINK, 10) === 0);
    if (gt("no-hyperlink") || gt("no-hyperlinks") || gt("hyperlink=false") || gt("hyperlink=never")) return false;
    if (gt("hyperlink=true") || gt("hyperlink=always") || "NETLIFY" in t) return true;
    if (!Ju.supportsColor(e10) || e10 && !e10.isTTY || process.platform === "win32" || "CI" in t || "TEAMCITY_VERSION" in t) return false;
    if ("TERM_PROGRAM" in t) {
      let r = Qo(t.TERM_PROGRAM_VERSION);
      switch (t.TERM_PROGRAM) {
        case "iTerm.app":
          return r.major === 3 ? r.minor >= 1 : r.major > 3;
        case "WezTerm":
          return r.major >= 20200620;
        case "vscode":
          return r.major > 1 || r.major === 1 && r.minor >= 72;
      }
    }
    if ("VTE_VERSION" in t) {
      if (t.VTE_VERSION === "0.50.0") return false;
      let r = Qo(t.VTE_VERSION);
      return r.major > 0 || r.minor >= 50;
    }
    return false;
  }
  Jo.exports = { supportsHyperlink: ri, stdout: ri(process.stdout), stderr: ri(process.stderr) };
});
var Ko = Z((gf, Kt) => {
  var Wu = jo(), ni = Wo(), Ho = (e10, t, { target: r = "stdout", ...n } = {}) => ni[r] ? Wu.link(e10, t) : n.fallback === false ? e10 : typeof n.fallback == "function" ? n.fallback(e10, t) : `${e10} (​${t}​)`;
  Kt.exports = (e10, t, r = {}) => Ho(e10, t, r);
  Kt.exports.stderr = (e10, t, r = {}) => Ho(e10, t, { target: "stderr", ...r });
  Kt.exports.isSupported = ni.stdout;
  Kt.exports.stderr.isSupported = ni.stderr;
});
var oi = Z((Rf, Hu) => {
  Hu.exports = { name: "@prisma/engines-version", version: "5.22.0-44.605197351a3c8bdd595af2d2a9bc3025bca48ea2", main: "index.js", types: "index.d.ts", license: "Apache-2.0", author: "Tim Suchanek <suchanek@prisma.io>", prisma: { enginesVersion: "605197351a3c8bdd595af2d2a9bc3025bca48ea2" }, repository: { type: "git", url: "https://github.com/prisma/engines-wrapper.git", directory: "packages/engines-version" }, devDependencies: { "@types/node": "18.19.34", typescript: "4.9.5" }, files: ["index.js", "index.d.ts"], scripts: { build: "tsc -d" } };
});
var si = Z((Wr) => {
  Object.defineProperty(Wr, "__esModule", { value: true });
  Wr.enginesVersion = void 0;
  Wr.enginesVersion = oi().prisma.enginesVersion;
});
var Xo = Z((Gf, Yu) => {
  Yu.exports = { name: "dotenv", version: "16.0.3", description: "Loads environment variables from .env file", main: "lib/main.js", types: "lib/main.d.ts", exports: { ".": { require: "./lib/main.js", types: "./lib/main.d.ts", default: "./lib/main.js" }, "./config": "./config.js", "./config.js": "./config.js", "./lib/env-options": "./lib/env-options.js", "./lib/env-options.js": "./lib/env-options.js", "./lib/cli-options": "./lib/cli-options.js", "./lib/cli-options.js": "./lib/cli-options.js", "./package.json": "./package.json" }, scripts: { "dts-check": "tsc --project tests/types/tsconfig.json", lint: "standard", "lint-readme": "standard-markdown", pretest: "npm run lint && npm run dts-check", test: "tap tests/*.js --100 -Rspec", prerelease: "npm test", release: "standard-version" }, repository: { type: "git", url: "git://github.com/motdotla/dotenv.git" }, keywords: ["dotenv", "env", ".env", "environment", "variables", "config", "settings"], readmeFilename: "README.md", license: "BSD-2-Clause", devDependencies: { "@types/node": "^17.0.9", decache: "^4.6.1", dtslint: "^3.7.0", sinon: "^12.0.1", standard: "^16.0.4", "standard-markdown": "^7.1.0", "standard-version": "^9.3.2", tap: "^15.1.6", tar: "^6.1.11", typescript: "^4.5.4" }, engines: { node: ">=12" } };
});
var ts = Z((Qf, Kr) => {
  var Zu = fs$3, es = path$2, Xu = require$$0$2, ec = Xo(), tc = ec.version, rc = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
  function nc(e10) {
    let t = {}, r = e10.toString();
    r = r.replace(/\r\n?/mg, `
`);
    let n;
    for (; (n = rc.exec(r)) != null; ) {
      let i = n[1], o = n[2] || "";
      o = o.trim();
      let s = o[0];
      o = o.replace(/^(['"`])([\s\S]*)\1$/mg, "$2"), s === '"' && (o = o.replace(/\\n/g, `
`), o = o.replace(/\\r/g, "\r")), t[i] = o;
    }
    return t;
  }
  function ci(e10) {
    console.log(`[dotenv@${tc}][DEBUG] ${e10}`);
  }
  function ic(e10) {
    return e10[0] === "~" ? es.join(Xu.homedir(), e10.slice(1)) : e10;
  }
  function oc(e10) {
    let t = es.resolve(process.cwd(), ".env"), r = "utf8", n = !!(e10 && e10.debug), i = !!(e10 && e10.override);
    e10 && (e10.path != null && (t = ic(e10.path)), e10.encoding != null && (r = e10.encoding));
    try {
      let o = Hr.parse(Zu.readFileSync(t, { encoding: r }));
      return Object.keys(o).forEach(function(s) {
        Object.prototype.hasOwnProperty.call(process.env, s) ? (i === true && (process.env[s] = o[s]), n && ci(i === true ? `"${s}" is already defined in \`process.env\` and WAS overwritten` : `"${s}" is already defined in \`process.env\` and was NOT overwritten`)) : process.env[s] = o[s];
      }), { parsed: o };
    } catch (o) {
      return n && ci(`Failed to load ${t} ${o.message}`), { error: o };
    }
  }
  var Hr = { config: oc, parse: nc };
  Kr.exports.config = Hr.config;
  Kr.exports.parse = Hr.parse;
  Kr.exports = Hr;
});
var as = Z((Zf, ss) => {
  ss.exports = (e10) => {
    let t = e10.match(/^[ \t]*(?=\S)/gm);
    return t ? t.reduce((r, n) => Math.min(r, n.length), 1 / 0) : 0;
  };
});
var us = Z((Xf, ls) => {
  var uc = as();
  ls.exports = (e10) => {
    let t = uc(e10);
    if (t === 0) return e10;
    let r = new RegExp(`^[ \\t]{${t}}`, "gm");
    return e10.replace(r, "");
  };
});
var fi = Z((og, cs) => {
  cs.exports = (e10, t = 1, r) => {
    if (r = { indent: " ", includeEmptyLines: false, ...r }, typeof e10 != "string") throw new TypeError(`Expected \`input\` to be a \`string\`, got \`${typeof e10}\``);
    if (typeof t != "number") throw new TypeError(`Expected \`count\` to be a \`number\`, got \`${typeof t}\``);
    if (typeof r.indent != "string") throw new TypeError(`Expected \`options.indent\` to be a \`string\`, got \`${typeof r.indent}\``);
    if (t === 0) return e10;
    let n = r.includeEmptyLines ? /^/gm : /^(?!\s*$)/gm;
    return e10.replace(n, r.indent.repeat(t));
  };
});
var fs$1 = Z((lg, ms) => {
  ms.exports = ({ onlyFirst: e10 = false } = {}) => {
    let t = ["[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)", "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))"].join("|");
    return new RegExp(t, e10 ? void 0 : "g");
  };
});
var bi = Z((ug, gs) => {
  var yc = fs$1();
  gs.exports = (e10) => typeof e10 == "string" ? e10.replace(yc(), "") : e10;
});
var hs = Z((dg, Zr) => {
  Zr.exports = (e10 = {}) => {
    let t;
    if (e10.repoUrl) t = e10.repoUrl;
    else if (e10.user && e10.repo) t = `https://github.com/${e10.user}/${e10.repo}`;
    else throw new Error("You need to specify either the `repoUrl` option or both the `user` and `repo` options");
    let r = new URL(`${t}/issues/new`), n = ["body", "title", "labels", "template", "milestone", "assignee", "projects"];
    for (let i of n) {
      let o = e10[i];
      if (o !== void 0) {
        if (i === "labels" || i === "projects") {
          if (!Array.isArray(o)) throw new TypeError(`The \`${i}\` option should be an array`);
          o = o.join(",");
        }
        r.searchParams.set(i, o);
      }
    }
    return r.toString();
  };
  Zr.exports.default = Zr.exports;
});
var Ai = Z((Th, $s) => {
  $s.exports = /* @__PURE__ */ function() {
    function e10(t, r, n, i, o) {
      return t < r || n < r ? t > n ? n + 1 : t + 1 : i === o ? r : r + 1;
    }
    return function(t, r) {
      if (t === r) return 0;
      if (t.length > r.length) {
        var n = t;
        t = r, r = n;
      }
      for (var i = t.length, o = r.length; i > 0 && t.charCodeAt(i - 1) === r.charCodeAt(o - 1); ) i--, o--;
      for (var s = 0; s < i && t.charCodeAt(s) === r.charCodeAt(s); ) s++;
      if (i -= s, o -= s, i === 0 || o < 3) return o;
      var a = 0, l, u, c, p, d, f, g, h, O, T, S, C, E = [];
      for (l = 0; l < i; l++) E.push(l + 1), E.push(t.charCodeAt(s + l));
      for (var me = E.length - 1; a < o - 3; ) for (O = r.charCodeAt(s + (u = a)), T = r.charCodeAt(s + (c = a + 1)), S = r.charCodeAt(s + (p = a + 2)), C = r.charCodeAt(s + (d = a + 3)), f = a += 4, l = 0; l < me; l += 2) g = E[l], h = E[l + 1], u = e10(g, u, c, O, h), c = e10(u, c, p, T, h), p = e10(c, p, d, S, h), f = e10(p, d, f, C, h), E[l] = f, d = p, p = c, c = u, u = g;
      for (; a < o; ) for (O = r.charCodeAt(s + (u = a)), f = ++a, l = 0; l < me; l += 2) g = E[l], E[l] = f = e10(g, u, f, O, E[l + 1]), u = g;
      return f;
    };
  }();
});
var Nm = {};
Ut(Nm, { Debug: () => Gn, Decimal: () => xe, Extensions: () => jn, MetricsClient: () => Dt, NotFoundError: () => Le, PrismaClientInitializationError: () => R, PrismaClientKnownRequestError: () => V, PrismaClientRustPanicError: () => le, PrismaClientUnknownRequestError: () => B, PrismaClientValidationError: () => J, Public: () => Vn, Sql: () => oe, defineDmmfProperty: () => ua, deserializeJsonResponse: () => wt, dmmfToRuntimeDataModel: () => la, empty: () => ma, getPrismaClient: () => Yl, getRuntime: () => In, join: () => da, makeStrictEnum: () => Zl, makeTypedQueryFactory: () => ca, objectEnumValues: () => yn, raw: () => ji, serializeJsonQuery: () => vn, skip: () => Pn, sqltag: () => Vi, warnEnvConflicts: () => Xl, warnOnce: () => tr });
var library = ou(Nm);
var jn = {};
Ut(jn, { defineExtension: () => yo, getExtensionContext: () => bo });
function yo(e10) {
  return typeof e10 == "function" ? e10 : (t) => t.$extends(e10);
}
function bo(e10) {
  return e10;
}
var Vn = {};
Ut(Vn, { validator: () => Eo });
function Eo(...e10) {
  return (t) => t;
}
var Mr = {};
Ut(Mr, { $: () => To, bgBlack: () => gu, bgBlue: () => Eu, bgCyan: () => xu, bgGreen: () => yu, bgMagenta: () => wu, bgRed: () => hu, bgWhite: () => Pu, bgYellow: () => bu, black: () => pu, blue: () => rt, bold: () => H, cyan: () => De, dim: () => Oe, gray: () => Gt, green: () => qe, grey: () => fu, hidden: () => uu, inverse: () => lu, italic: () => au, magenta: () => du, red: () => ce, reset: () => su, strikethrough: () => cu, underline: () => X, white: () => mu, yellow: () => ke });
var Bn, wo, xo, Po, vo = true;
typeof process < "u" && ({ FORCE_COLOR: Bn, NODE_DISABLE_COLORS: wo, NO_COLOR: xo, TERM: Po } = process.env || {}, vo = process.stdout && process.stdout.isTTY);
var To = { enabled: !wo && xo == null && Po !== "dumb" && (Bn != null && Bn !== "0" || vo) };
function M(e10, t) {
  let r = new RegExp(`\\x1b\\[${t}m`, "g"), n = `\x1B[${e10}m`, i = `\x1B[${t}m`;
  return function(o) {
    return !To.enabled || o == null ? o : n + (~("" + o).indexOf(i) ? o.replace(r, i + n) : o) + i;
  };
}
var su = M(0, 0), H = M(1, 22), Oe = M(2, 22), au = M(3, 23), X = M(4, 24), lu = M(7, 27), uu = M(8, 28), cu = M(9, 29), pu = M(30, 39), ce = M(31, 39), qe = M(32, 39), ke = M(33, 39), rt = M(34, 39), du = M(35, 39), De = M(36, 39), mu = M(37, 39), Gt = M(90, 39), fu = M(90, 39), gu = M(40, 49), hu = M(41, 49), yu = M(42, 49), bu = M(43, 49), Eu = M(44, 49), wu = M(45, 49), xu = M(46, 49), Pu = M(47, 49);
var vu = 100, Ro = ["green", "yellow", "blue", "magenta", "cyan", "red"], Qt = [], Co = Date.now(), Tu = 0, Un = typeof process < "u" ? process.env : {};
globalThis.DEBUG ?? (globalThis.DEBUG = Un.DEBUG ?? "");
globalThis.DEBUG_COLORS ?? (globalThis.DEBUG_COLORS = Un.DEBUG_COLORS ? Un.DEBUG_COLORS === "true" : true);
var Jt = { enable(e10) {
  typeof e10 == "string" && (globalThis.DEBUG = e10);
}, disable() {
  let e10 = globalThis.DEBUG;
  return globalThis.DEBUG = "", e10;
}, enabled(e10) {
  let t = globalThis.DEBUG.split(",").map((i) => i.replace(/[.+?^${}()|[\]\\]/g, "\\$&")), r = t.some((i) => i === "" || i[0] === "-" ? false : e10.match(RegExp(i.split("*").join(".*") + "$"))), n = t.some((i) => i === "" || i[0] !== "-" ? false : e10.match(RegExp(i.slice(1).split("*").join(".*") + "$")));
  return r && !n;
}, log: (...e10) => {
  let [t, r, ...n] = e10;
  (console.warn ?? console.log)(`${t} ${r}`, ...n);
}, formatters: {} };
function Ru(e10) {
  let t = { color: Ro[Tu++ % Ro.length], enabled: Jt.enabled(e10), namespace: e10, log: Jt.log, extend: () => {
  } }, r = (...n) => {
    let { enabled: i, namespace: o, color: s, log: a } = t;
    if (n.length !== 0 && Qt.push([o, ...n]), Qt.length > vu && Qt.shift(), Jt.enabled(o) || i) {
      let l = n.map((c) => typeof c == "string" ? c : Cu(c)), u = `+${Date.now() - Co}ms`;
      Co = Date.now(), globalThis.DEBUG_COLORS ? a(Mr[s](H(o)), ...l, Mr[s](u)) : a(o, ...l, u);
    }
  };
  return new Proxy(r, { get: (n, i) => t[i], set: (n, i, o) => t[i] = o });
}
var Gn = new Proxy(Ru, { get: (e10, t) => Jt[t], set: (e10, t, r) => Jt[t] = r });
function Cu(e10, t = 2) {
  let r = /* @__PURE__ */ new Set();
  return JSON.stringify(e10, (n, i) => {
    if (typeof i == "object" && i !== null) {
      if (r.has(i)) return "[Circular *]";
      r.add(i);
    } else if (typeof i == "bigint") return i.toString();
    return i;
  }, t);
}
function So(e10 = 7500) {
  let t = Qt.map(([r, ...n]) => `${r} ${n.map((i) => typeof i == "string" ? i : JSON.stringify(i)).join(" ")}`).join(`
`);
  return t.length < e10 ? t : t.slice(-e10);
}
function Ao() {
  Qt.length = 0;
}
var L = Gn;
var Io = k(fs$3);
function Qn() {
  let e10 = process.env.PRISMA_QUERY_ENGINE_LIBRARY;
  if (!(e10 && Io.default.existsSync(e10)) && process.arch === "ia32") throw new Error('The default query engine type (Node-API, "library") is currently not supported for 32bit Node. Please set `engineType = "binary"` in the "generator" block of your "schema.prisma" file (or use the environment variables "PRISMA_CLIENT_ENGINE_TYPE=binary" and/or "PRISMA_CLI_QUERY_ENGINE_TYPE=binary".)');
}
var Jn = ["darwin", "darwin-arm64", "debian-openssl-1.0.x", "debian-openssl-1.1.x", "debian-openssl-3.0.x", "rhel-openssl-1.0.x", "rhel-openssl-1.1.x", "rhel-openssl-3.0.x", "linux-arm64-openssl-1.1.x", "linux-arm64-openssl-1.0.x", "linux-arm64-openssl-3.0.x", "linux-arm-openssl-1.1.x", "linux-arm-openssl-1.0.x", "linux-arm-openssl-3.0.x", "linux-musl", "linux-musl-openssl-3.0.x", "linux-musl-arm64-openssl-1.1.x", "linux-musl-arm64-openssl-3.0.x", "linux-nixos", "linux-static-x64", "linux-static-arm64", "windows", "freebsd11", "freebsd12", "freebsd13", "freebsd14", "freebsd15", "openbsd", "netbsd", "arm"];
var $r = "libquery_engine";
function qr(e10, t) {
  return e10.includes("windows") ? `query_engine-${e10}.dll.node` : e10.includes("darwin") ? `${$r}-${e10}.dylib.node` : `${$r}-${e10}.so.node`;
}
var _o = k(require$$0$1), zn = k(require$$5), Gr = k(require$$0$2);
var _e = Symbol.for("@ts-pattern/matcher"), Su = Symbol.for("@ts-pattern/isVariadic"), Vr = "@ts-pattern/anonymous-select-key", Wn = (e10) => !!(e10 && typeof e10 == "object"), jr = (e10) => e10 && !!e10[_e], Ee = (e10, t, r) => {
  if (jr(e10)) {
    let n = e10[_e](), { matched: i, selections: o } = n.match(t);
    return i && o && Object.keys(o).forEach((s) => r(s, o[s])), i;
  }
  if (Wn(e10)) {
    if (!Wn(t)) return false;
    if (Array.isArray(e10)) {
      if (!Array.isArray(t)) return false;
      let n = [], i = [], o = [];
      for (let s of e10.keys()) {
        let a = e10[s];
        jr(a) && a[Su] ? o.push(a) : o.length ? i.push(a) : n.push(a);
      }
      if (o.length) {
        if (o.length > 1) throw new Error("Pattern error: Using `...P.array(...)` several times in a single pattern is not allowed.");
        if (t.length < n.length + i.length) return false;
        let s = t.slice(0, n.length), a = i.length === 0 ? [] : t.slice(-i.length), l = t.slice(n.length, i.length === 0 ? 1 / 0 : -i.length);
        return n.every((u, c) => Ee(u, s[c], r)) && i.every((u, c) => Ee(u, a[c], r)) && (o.length === 0 || Ee(o[0], l, r));
      }
      return e10.length === t.length && e10.every((s, a) => Ee(s, t[a], r));
    }
    return Object.keys(e10).every((n) => {
      let i = e10[n];
      return (n in t || jr(o = i) && o[_e]().matcherType === "optional") && Ee(i, t[n], r);
      var o;
    });
  }
  return Object.is(t, e10);
}, Ge = (e10) => {
  var t, r, n;
  return Wn(e10) ? jr(e10) ? (t = (r = (n = e10[_e]()).getSelectionKeys) == null ? void 0 : r.call(n)) != null ? t : [] : Array.isArray(e10) ? Wt(e10, Ge) : Wt(Object.values(e10), Ge) : [];
}, Wt = (e10, t) => e10.reduce((r, n) => r.concat(t(n)), []);
function pe(e10) {
  return Object.assign(e10, { optional: () => Au(e10), and: (t) => j(e10, t), or: (t) => Iu(e10, t), select: (t) => t === void 0 ? Oo(e10) : Oo(t, e10) });
}
function Au(e10) {
  return pe({ [_e]: () => ({ match: (t) => {
    let r = {}, n = (i, o) => {
      r[i] = o;
    };
    return t === void 0 ? (Ge(e10).forEach((i) => n(i, void 0)), { matched: true, selections: r }) : { matched: Ee(e10, t, n), selections: r };
  }, getSelectionKeys: () => Ge(e10), matcherType: "optional" }) });
}
function j(...e10) {
  return pe({ [_e]: () => ({ match: (t) => {
    let r = {}, n = (i, o) => {
      r[i] = o;
    };
    return { matched: e10.every((i) => Ee(i, t, n)), selections: r };
  }, getSelectionKeys: () => Wt(e10, Ge), matcherType: "and" }) });
}
function Iu(...e10) {
  return pe({ [_e]: () => ({ match: (t) => {
    let r = {}, n = (i, o) => {
      r[i] = o;
    };
    return Wt(e10, Ge).forEach((i) => n(i, void 0)), { matched: e10.some((i) => Ee(i, t, n)), selections: r };
  }, getSelectionKeys: () => Wt(e10, Ge), matcherType: "or" }) });
}
function I(e10) {
  return { [_e]: () => ({ match: (t) => ({ matched: !!e10(t) }) }) };
}
function Oo(...e10) {
  let t = typeof e10[0] == "string" ? e10[0] : void 0, r = e10.length === 2 ? e10[1] : typeof e10[0] == "string" ? void 0 : e10[0];
  return pe({ [_e]: () => ({ match: (n) => {
    let i = { [t ?? Vr]: n };
    return { matched: r === void 0 || Ee(r, n, (o, s) => {
      i[o] = s;
    }), selections: i };
  }, getSelectionKeys: () => [t ?? Vr].concat(r === void 0 ? [] : Ge(r)) }) });
}
function ye(e10) {
  return typeof e10 == "number";
}
function je(e10) {
  return typeof e10 == "string";
}
function Ve(e10) {
  return typeof e10 == "bigint";
}
pe(I(function(e10) {
  return true;
}));
var Be = (e10) => Object.assign(pe(e10), { startsWith: (t) => {
  return Be(j(e10, (r = t, I((n) => je(n) && n.startsWith(r)))));
  var r;
}, endsWith: (t) => {
  return Be(j(e10, (r = t, I((n) => je(n) && n.endsWith(r)))));
  var r;
}, minLength: (t) => Be(j(e10, ((r) => I((n) => je(n) && n.length >= r))(t))), length: (t) => Be(j(e10, ((r) => I((n) => je(n) && n.length === r))(t))), maxLength: (t) => Be(j(e10, ((r) => I((n) => je(n) && n.length <= r))(t))), includes: (t) => {
  return Be(j(e10, (r = t, I((n) => je(n) && n.includes(r)))));
  var r;
}, regex: (t) => {
  return Be(j(e10, (r = t, I((n) => je(n) && !!n.match(r)))));
  var r;
} });
Be(I(je));
var be = (e10) => Object.assign(pe(e10), { between: (t, r) => be(j(e10, ((n, i) => I((o) => ye(o) && n <= o && i >= o))(t, r))), lt: (t) => be(j(e10, ((r) => I((n) => ye(n) && n < r))(t))), gt: (t) => be(j(e10, ((r) => I((n) => ye(n) && n > r))(t))), lte: (t) => be(j(e10, ((r) => I((n) => ye(n) && n <= r))(t))), gte: (t) => be(j(e10, ((r) => I((n) => ye(n) && n >= r))(t))), int: () => be(j(e10, I((t) => ye(t) && Number.isInteger(t)))), finite: () => be(j(e10, I((t) => ye(t) && Number.isFinite(t)))), positive: () => be(j(e10, I((t) => ye(t) && t > 0))), negative: () => be(j(e10, I((t) => ye(t) && t < 0))) });
be(I(ye));
var Ue = (e10) => Object.assign(pe(e10), { between: (t, r) => Ue(j(e10, ((n, i) => I((o) => Ve(o) && n <= o && i >= o))(t, r))), lt: (t) => Ue(j(e10, ((r) => I((n) => Ve(n) && n < r))(t))), gt: (t) => Ue(j(e10, ((r) => I((n) => Ve(n) && n > r))(t))), lte: (t) => Ue(j(e10, ((r) => I((n) => Ve(n) && n <= r))(t))), gte: (t) => Ue(j(e10, ((r) => I((n) => Ve(n) && n >= r))(t))), positive: () => Ue(j(e10, I((t) => Ve(t) && t > 0))), negative: () => Ue(j(e10, I((t) => Ve(t) && t < 0))) });
Ue(I(Ve));
pe(I(function(e10) {
  return typeof e10 == "boolean";
}));
pe(I(function(e10) {
  return typeof e10 == "symbol";
}));
pe(I(function(e10) {
  return e10 == null;
}));
pe(I(function(e10) {
  return e10 != null;
}));
var Hn = { matched: false, value: void 0 };
function mt(e10) {
  return new Kn(e10, Hn);
}
var Kn = class e {
  constructor(t, r) {
    this.input = void 0, this.state = void 0, this.input = t, this.state = r;
  }
  with(...t) {
    if (this.state.matched) return this;
    let r = t[t.length - 1], n = [t[0]], i;
    t.length === 3 && typeof t[1] == "function" ? i = t[1] : t.length > 2 && n.push(...t.slice(1, t.length - 1));
    let o = false, s = {}, a = (u, c) => {
      o = true, s[u] = c;
    }, l = !n.some((u) => Ee(u, this.input, a)) || i && !i(this.input) ? Hn : { matched: true, value: r(o ? Vr in s ? s[Vr] : s : this.input, this.input) };
    return new e(this.input, l);
  }
  when(t, r) {
    if (this.state.matched) return this;
    let n = !!t(this.input);
    return new e(this.input, n ? { matched: true, value: r(this.input, this.input) } : Hn);
  }
  otherwise(t) {
    return this.state.matched ? this.state.value : t(this.input);
  }
  exhaustive() {
    if (this.state.matched) return this.state.value;
    let t;
    try {
      t = JSON.stringify(this.input);
    } catch {
      t = this.input;
    }
    throw new Error(`Pattern matching error: no pattern matches value ${t}`);
  }
  run() {
    return this.exhaustive();
  }
  returnType() {
    return this;
  }
};
var Fo = require$$1$1;
var Ou = { warn: ke("prisma:warn") }, ku = { warn: () => !process.env.PRISMA_DISABLE_WARNINGS };
function Br(e10, ...t) {
  ku.warn() && console.warn(`${Ou.warn} ${e10}`, ...t);
}
var Du = (0, Fo.promisify)(_o.default.exec), te = L("prisma:get-platform"), _u = ["1.0.x", "1.1.x", "3.0.x"];
async function Lo() {
  let e10 = Gr.default.platform(), t = process.arch;
  if (e10 === "freebsd") {
    let s = await Qr("freebsd-version");
    if (s && s.trim().length > 0) {
      let l = /^(\d+)\.?/.exec(s);
      if (l) return { platform: "freebsd", targetDistro: `freebsd${l[1]}`, arch: t };
    }
  }
  if (e10 !== "linux") return { platform: e10, arch: t };
  let r = await Lu(), n = await Uu(), i = Mu({ arch: t, archFromUname: n, familyDistro: r.familyDistro }), { libssl: o } = await $u(i);
  return { platform: "linux", libssl: o, arch: t, archFromUname: n, ...r };
}
function Fu(e10) {
  let t = /^ID="?([^"\n]*)"?$/im, r = /^ID_LIKE="?([^"\n]*)"?$/im, n = t.exec(e10), i = n && n[1] && n[1].toLowerCase() || "", o = r.exec(e10), s = o && o[1] && o[1].toLowerCase() || "", a = mt({ id: i, idLike: s }).with({ id: "alpine" }, ({ id: l }) => ({ targetDistro: "musl", familyDistro: l, originalDistro: l })).with({ id: "raspbian" }, ({ id: l }) => ({ targetDistro: "arm", familyDistro: "debian", originalDistro: l })).with({ id: "nixos" }, ({ id: l }) => ({ targetDistro: "nixos", originalDistro: l, familyDistro: "nixos" })).with({ id: "debian" }, { id: "ubuntu" }, ({ id: l }) => ({ targetDistro: "debian", familyDistro: "debian", originalDistro: l })).with({ id: "rhel" }, { id: "centos" }, { id: "fedora" }, ({ id: l }) => ({ targetDistro: "rhel", familyDistro: "rhel", originalDistro: l })).when(({ idLike: l }) => l.includes("debian") || l.includes("ubuntu"), ({ id: l }) => ({ targetDistro: "debian", familyDistro: "debian", originalDistro: l })).when(({ idLike: l }) => i === "arch" || l.includes("arch"), ({ id: l }) => ({ targetDistro: "debian", familyDistro: "arch", originalDistro: l })).when(({ idLike: l }) => l.includes("centos") || l.includes("fedora") || l.includes("rhel") || l.includes("suse"), ({ id: l }) => ({ targetDistro: "rhel", familyDistro: "rhel", originalDistro: l })).otherwise(({ id: l }) => ({ targetDistro: void 0, familyDistro: void 0, originalDistro: l }));
  return te(`Found distro info:
${JSON.stringify(a, null, 2)}`), a;
}
async function Lu() {
  let e10 = "/etc/os-release";
  try {
    let t = await zn.default.readFile(e10, { encoding: "utf-8" });
    return Fu(t);
  } catch {
    return { targetDistro: void 0, familyDistro: void 0, originalDistro: void 0 };
  }
}
function Nu(e10) {
  let t = /^OpenSSL\s(\d+\.\d+)\.\d+/.exec(e10);
  if (t) {
    let r = `${t[1]}.x`;
    return No(r);
  }
}
function ko(e10) {
  let t = /libssl\.so\.(\d)(\.\d)?/.exec(e10);
  if (t) {
    let r = `${t[1]}${t[2] ?? ".0"}.x`;
    return No(r);
  }
}
function No(e10) {
  let t = (() => {
    if ($o(e10)) return e10;
    let r = e10.split(".");
    return r[1] = "0", r.join(".");
  })();
  if (_u.includes(t)) return t;
}
function Mu(e10) {
  return mt(e10).with({ familyDistro: "musl" }, () => (te('Trying platform-specific paths for "alpine"'), ["/lib"])).with({ familyDistro: "debian" }, ({ archFromUname: t }) => (te('Trying platform-specific paths for "debian" (and "ubuntu")'), [`/usr/lib/${t}-linux-gnu`, `/lib/${t}-linux-gnu`])).with({ familyDistro: "rhel" }, () => (te('Trying platform-specific paths for "rhel"'), ["/lib64", "/usr/lib64"])).otherwise(({ familyDistro: t, arch: r, archFromUname: n }) => (te(`Don't know any platform-specific paths for "${t}" on ${r} (${n})`), []));
}
async function $u(e10) {
  let t = 'grep -v "libssl.so.0"', r = await Do(e10);
  if (r) {
    te(`Found libssl.so file using platform-specific paths: ${r}`);
    let o = ko(r);
    if (te(`The parsed libssl version is: ${o}`), o) return { libssl: o, strategy: "libssl-specific-path" };
  }
  te('Falling back to "ldconfig" and other generic paths');
  let n = await Qr(`ldconfig -p | sed "s/.*=>s*//" | sed "s|.*/||" | grep libssl | sort | ${t}`);
  if (n || (n = await Do(["/lib64", "/usr/lib64", "/lib"])), n) {
    te(`Found libssl.so file using "ldconfig" or other generic paths: ${n}`);
    let o = ko(n);
    if (te(`The parsed libssl version is: ${o}`), o) return { libssl: o, strategy: "ldconfig" };
  }
  let i = await Qr("openssl version -v");
  if (i) {
    te(`Found openssl binary with version: ${i}`);
    let o = Nu(i);
    if (te(`The parsed openssl version is: ${o}`), o) return { libssl: o, strategy: "openssl-binary" };
  }
  return te("Couldn't find any version of libssl or OpenSSL in the system"), {};
}
async function Do(e10) {
  for (let t of e10) {
    let r = await qu(t);
    if (r) return r;
  }
}
async function qu(e10) {
  try {
    return (await zn.default.readdir(e10)).find((r) => r.startsWith("libssl.so.") && !r.startsWith("libssl.so.0"));
  } catch (t) {
    if (t.code === "ENOENT") return;
    throw t;
  }
}
async function nt() {
  let { binaryTarget: e10 } = await Mo();
  return e10;
}
function ju(e10) {
  return e10.binaryTarget !== void 0;
}
async function Yn() {
  let { memoized: e10, ...t } = await Mo();
  return t;
}
var Ur = {};
async function Mo() {
  if (ju(Ur)) return Promise.resolve({ ...Ur, memoized: true });
  let e10 = await Lo(), t = Vu(e10);
  return Ur = { ...e10, binaryTarget: t }, { ...Ur, memoized: false };
}
function Vu(e10) {
  let { platform: t, arch: r, archFromUname: n, libssl: i, targetDistro: o, familyDistro: s, originalDistro: a } = e10;
  t === "linux" && !["x64", "arm64"].includes(r) && Br(`Prisma only officially supports Linux on amd64 (x86_64) and arm64 (aarch64) system architectures (detected "${r}" instead). If you are using your own custom Prisma engines, you can ignore this warning, as long as you've compiled the engines for your system architecture "${n}".`);
  let l = "1.1.x";
  if (t === "linux" && i === void 0) {
    let c = mt({ familyDistro: s }).with({ familyDistro: "debian" }, () => "Please manually install OpenSSL via `apt-get update -y && apt-get install -y openssl` and try installing Prisma again. If you're running Prisma on Docker, add this command to your Dockerfile, or switch to an image that already has OpenSSL installed.").otherwise(() => "Please manually install OpenSSL and try installing Prisma again.");
    Br(`Prisma failed to detect the libssl/openssl version to use, and may not work as expected. Defaulting to "openssl-${l}".
${c}`);
  }
  let u = "debian";
  if (t === "linux" && o === void 0 && te(`Distro is "${a}". Falling back to Prisma engines built for "${u}".`), t === "darwin" && r === "arm64") return "darwin-arm64";
  if (t === "darwin") return "darwin";
  if (t === "win32") return "windows";
  if (t === "freebsd") return o;
  if (t === "openbsd") return "openbsd";
  if (t === "netbsd") return "netbsd";
  if (t === "linux" && o === "nixos") return "linux-nixos";
  if (t === "linux" && r === "arm64") return `${o === "musl" ? "linux-musl-arm64" : "linux-arm64"}-openssl-${i || l}`;
  if (t === "linux" && r === "arm") return `linux-arm-openssl-${i || l}`;
  if (t === "linux" && o === "musl") {
    let c = "linux-musl";
    return !i || $o(i) ? c : `${c}-openssl-${i}`;
  }
  return t === "linux" && o && i ? `${o}-openssl-${i}` : (t !== "linux" && Br(`Prisma detected unknown OS "${t}" and may not work as expected. Defaulting to "linux".`), i ? `${u}-openssl-${i}` : o ? `${o}-openssl-${l}` : `${u}-openssl-${l}`);
}
async function Bu(e10) {
  try {
    return await e10();
  } catch {
    return;
  }
}
function Qr(e10) {
  return Bu(async () => {
    let t = await Du(e10);
    return te(`Command "${e10}" successfully returned "${t.stdout}"`), t.stdout;
  });
}
async function Uu() {
  var _a2;
  return typeof Gr.default.machine == "function" ? Gr.default.machine() : (_a2 = await Qr("uname -m")) == null ? void 0 : _a2.trim();
}
function $o(e10) {
  return e10.startsWith("1.");
}
var zo = k(Ko());
function ii(e10) {
  return (0, zo.default)(e10, e10, { fallback: X });
}
k(si());
var $ = k(path$2);
k(si());
L("prisma:engines");
function Yo() {
  return $.default.join(__dirname, "../");
}
$.default.join(__dirname, "../query-engine-darwin");
$.default.join(__dirname, "../query-engine-darwin-arm64");
$.default.join(__dirname, "../query-engine-debian-openssl-1.0.x");
$.default.join(__dirname, "../query-engine-debian-openssl-1.1.x");
$.default.join(__dirname, "../query-engine-debian-openssl-3.0.x");
$.default.join(__dirname, "../query-engine-linux-static-x64");
$.default.join(__dirname, "../query-engine-linux-static-arm64");
$.default.join(__dirname, "../query-engine-rhel-openssl-1.0.x");
$.default.join(__dirname, "../query-engine-rhel-openssl-1.1.x");
$.default.join(__dirname, "../query-engine-rhel-openssl-3.0.x");
$.default.join(__dirname, "../libquery_engine-darwin.dylib.node");
$.default.join(__dirname, "../libquery_engine-darwin-arm64.dylib.node");
$.default.join(__dirname, "../libquery_engine-debian-openssl-1.0.x.so.node");
$.default.join(__dirname, "../libquery_engine-debian-openssl-1.1.x.so.node");
$.default.join(__dirname, "../libquery_engine-debian-openssl-3.0.x.so.node");
$.default.join(__dirname, "../libquery_engine-linux-arm64-openssl-1.0.x.so.node");
$.default.join(__dirname, "../libquery_engine-linux-arm64-openssl-1.1.x.so.node");
$.default.join(__dirname, "../libquery_engine-linux-arm64-openssl-3.0.x.so.node");
$.default.join(__dirname, "../libquery_engine-linux-musl.so.node");
$.default.join(__dirname, "../libquery_engine-linux-musl-openssl-3.0.x.so.node");
$.default.join(__dirname, "../libquery_engine-rhel-openssl-1.0.x.so.node");
$.default.join(__dirname, "../libquery_engine-rhel-openssl-1.1.x.so.node");
$.default.join(__dirname, "../libquery_engine-rhel-openssl-3.0.x.so.node");
$.default.join(__dirname, "../query_engine-windows.dll.node");
k(fs$3);
L("chmodPlusX");
function ui(e10) {
  let t = e10.e, r = (a) => `Prisma cannot find the required \`${a}\` system library in your system`, n = t.message.includes("cannot open shared object file"), i = `Please refer to the documentation about Prisma's system requirements: ${ii("https://pris.ly/d/system-requirements")}`, o = `Unable to require(\`${Oe(e10.id)}\`).`, s = mt({ message: t.message, code: t.code }).with({ code: "ENOENT" }, () => "File does not exist.").when(({ message: a }) => n && a.includes("libz"), () => `${r("libz")}. Please install it and try again.`).when(({ message: a }) => n && a.includes("libgcc_s"), () => `${r("libgcc_s")}. Please install it and try again.`).when(({ message: a }) => n && a.includes("libssl"), () => {
    let a = e10.platformInfo.libssl ? `openssl-${e10.platformInfo.libssl}` : "openssl";
    return `${r("libssl")}. Please install ${a} and try again.`;
  }).when(({ message: a }) => a.includes("GLIBC"), () => `Prisma has detected an incompatible version of the \`glibc\` C standard library installed in your system. This probably means your system may be too old to run Prisma. ${i}`).when(({ message: a }) => e10.platformInfo.platform === "linux" && a.includes("symbol not found"), () => `The Prisma engines are not compatible with your system ${e10.platformInfo.originalDistro} on (${e10.platformInfo.archFromUname}) which uses the \`${e10.platformInfo.binaryTarget}\` binaryTarget by default. ${i}`).otherwise(() => `The Prisma engines do not seem to be compatible with your system. ${i}`);
  return `${o}
${s}

Details: ${t.message}`;
}
var di = k(ts()), zr = k(fs$3);
var ht = k(path$2);
function rs(e10) {
  let t = e10.ignoreProcessEnv ? {} : process.env, r = (n) => {
    var _a2;
    return ((_a2 = n.match(/(.?\${(?:[a-zA-Z0-9_]+)?})/g)) == null ? void 0 : _a2.reduce(function(o, s) {
      let a = /(.?)\${([a-zA-Z0-9_]+)?}/g.exec(s);
      if (!a) return o;
      let l = a[1], u, c;
      if (l === "\\") c = a[0], u = c.replace("\\$", "$");
      else {
        let p = a[2];
        c = a[0].substring(l.length), u = Object.hasOwnProperty.call(t, p) ? t[p] : e10.parsed[p] || "", u = r(u);
      }
      return o.replace(c, u);
    }, n)) ?? n;
  };
  for (let n in e10.parsed) {
    let i = Object.hasOwnProperty.call(t, n) ? t[n] : e10.parsed[n];
    e10.parsed[n] = r(i);
  }
  for (let n in e10.parsed) t[n] = e10.parsed[n];
  return e10;
}
var pi = L("prisma:tryLoadEnv");
function zt({ rootEnvPath: e10, schemaEnvPath: t }, r = { conflictCheck: "none" }) {
  var _a2, _b;
  let n = ns(e10);
  r.conflictCheck !== "none" && sc(n, t, r.conflictCheck);
  let i = null;
  return is(n == null ? void 0 : n.path, t) || (i = ns(t)), !n && !i && pi("No Environment variables loaded"), (i == null ? void 0 : i.dotenvResult.error) ? console.error(ce(H("Schema Env Error: ")) + i.dotenvResult.error) : { message: [n == null ? void 0 : n.message, i == null ? void 0 : i.message].filter(Boolean).join(`
`), parsed: { ...(_a2 = n == null ? void 0 : n.dotenvResult) == null ? void 0 : _a2.parsed, ...(_b = i == null ? void 0 : i.dotenvResult) == null ? void 0 : _b.parsed } };
}
function sc(e10, t, r) {
  let n = e10 == null ? void 0 : e10.dotenvResult.parsed, i = !is(e10 == null ? void 0 : e10.path, t);
  if (n && t && i && zr.default.existsSync(t)) {
    let o = di.default.parse(zr.default.readFileSync(t)), s = [];
    for (let a in o) n[a] === o[a] && s.push(a);
    if (s.length > 0) {
      let a = ht.default.relative(process.cwd(), e10.path), l = ht.default.relative(process.cwd(), t);
      if (r === "error") {
        let u = `There is a conflict between env var${s.length > 1 ? "s" : ""} in ${X(a)} and ${X(l)}
Conflicting env vars:
${s.map((c) => `  ${H(c)}`).join(`
`)}

We suggest to move the contents of ${X(l)} to ${X(a)} to consolidate your env vars.
`;
        throw new Error(u);
      } else if (r === "warn") {
        let u = `Conflict for env var${s.length > 1 ? "s" : ""} ${s.map((c) => H(c)).join(", ")} in ${X(a)} and ${X(l)}
Env vars from ${X(l)} overwrite the ones from ${X(a)}
      `;
        console.warn(`${ke("warn(prisma)")} ${u}`);
      }
    }
  }
}
function ns(e10) {
  if (ac(e10)) {
    pi(`Environment variables loaded from ${e10}`);
    let t = di.default.config({ path: e10, debug: process.env.DOTENV_CONFIG_DEBUG ? true : void 0 });
    return { dotenvResult: rs(t), message: Oe(`Environment variables loaded from ${ht.default.relative(process.cwd(), e10)}`), path: e10 };
  } else pi(`Environment variables not found at ${e10}`);
  return null;
}
function is(e10, t) {
  return e10 && t && ht.default.resolve(e10) === ht.default.resolve(t);
}
function ac(e10) {
  return !!(e10 && zr.default.existsSync(e10));
}
var os = "library";
function Yt(e10) {
  let t = lc();
  return t || ((e10 == null ? void 0 : e10.config.engineType) === "library" ? "library" : (e10 == null ? void 0 : e10.config.engineType) === "binary" ? "binary" : os);
}
function lc() {
  let e10 = process.env.PRISMA_CLIENT_ENGINE_TYPE;
  return e10 === "library" ? "library" : e10 === "binary" ? "binary" : void 0;
}
var Je;
((t) => {
  ((E) => (E.findUnique = "findUnique", E.findUniqueOrThrow = "findUniqueOrThrow", E.findFirst = "findFirst", E.findFirstOrThrow = "findFirstOrThrow", E.findMany = "findMany", E.create = "create", E.createMany = "createMany", E.createManyAndReturn = "createManyAndReturn", E.update = "update", E.updateMany = "updateMany", E.upsert = "upsert", E.delete = "delete", E.deleteMany = "deleteMany", E.groupBy = "groupBy", E.count = "count", E.aggregate = "aggregate", E.findRaw = "findRaw", E.aggregateRaw = "aggregateRaw"))(t.ModelAction || (t.ModelAction = {}));
})(Je || (Je = {}));
var Zt = k(path$2);
function mi(e10) {
  return Zt.default.sep === Zt.default.posix.sep ? e10 : e10.split(Zt.default.sep).join(Zt.default.posix.sep);
}
var ps = k(fi());
function hi(e10) {
  return String(new gi(e10));
}
var gi = class {
  constructor(t) {
    this.config = t;
  }
  toString() {
    let { config: t } = this, r = t.provider.fromEnvVar ? `env("${t.provider.fromEnvVar}")` : t.provider.value, n = JSON.parse(JSON.stringify({ provider: r, binaryTargets: cc(t.binaryTargets) }));
    return `generator ${t.name} {
${(0, ps.default)(pc(n), 2)}
}`;
  }
};
function cc(e10) {
  let t;
  if (e10.length > 0) {
    let r = e10.find((n) => n.fromEnvVar !== null);
    r ? t = `env("${r.fromEnvVar}")` : t = e10.map((n) => n.native ? "native" : n.value);
  } else t = void 0;
  return t;
}
function pc(e10) {
  let t = Object.keys(e10).reduce((r, n) => Math.max(r, n.length), 0);
  return Object.entries(e10).map(([r, n]) => `${r.padEnd(t)} = ${dc(n)}`).join(`
`);
}
function dc(e10) {
  return JSON.parse(JSON.stringify(e10, (t, r) => Array.isArray(r) ? `[${r.map((n) => JSON.stringify(n)).join(", ")}]` : JSON.stringify(r)));
}
var er = {};
Ut(er, { error: () => gc, info: () => fc, log: () => mc, query: () => hc, should: () => ds, tags: () => Xt, warn: () => yi });
var Xt = { error: ce("prisma:error"), warn: ke("prisma:warn"), info: De("prisma:info"), query: rt("prisma:query") }, ds = { warn: () => !process.env.PRISMA_DISABLE_WARNINGS };
function mc(...e10) {
  console.log(...e10);
}
function yi(e10, ...t) {
  ds.warn() && console.warn(`${Xt.warn} ${e10}`, ...t);
}
function fc(e10, ...t) {
  console.info(`${Xt.info} ${e10}`, ...t);
}
function gc(e10, ...t) {
  console.error(`${Xt.error} ${e10}`, ...t);
}
function hc(e10, ...t) {
  console.log(`${Xt.query} ${e10}`, ...t);
}
function Yr(e10, t) {
  if (!e10) throw new Error(`${t}. This should never happen. If you see this error, please, open an issue at https://pris.ly/prisma-prisma-bug-report`);
}
function Fe(e10, t) {
  throw new Error(t);
}
function Ei(e10, t) {
  return Object.prototype.hasOwnProperty.call(e10, t);
}
var wi = (e10, t) => e10.reduce((r, n) => (r[t(n)] = n, r), {});
function yt(e10, t) {
  let r = {};
  for (let n of Object.keys(e10)) r[n] = t(e10[n], n);
  return r;
}
function xi(e10, t) {
  if (e10.length === 0) return;
  let r = e10[0];
  for (let n = 1; n < e10.length; n++) t(r, e10[n]) < 0 && (r = e10[n]);
  return r;
}
function w(e10, t) {
  Object.defineProperty(e10, "name", { value: t, configurable: true });
}
var ys = /* @__PURE__ */ new Set(), tr = (e10, t, ...r) => {
  ys.has(e10) || (ys.add(e10), yi(t, ...r));
};
var V = class extends Error {
  constructor(t, { code: r, clientVersion: n, meta: i, batchRequestIdx: o }) {
    super(t), this.name = "PrismaClientKnownRequestError", this.code = r, this.clientVersion = n, this.meta = i, Object.defineProperty(this, "batchRequestIdx", { value: o, enumerable: false, writable: true });
  }
  get [Symbol.toStringTag]() {
    return "PrismaClientKnownRequestError";
  }
};
w(V, "PrismaClientKnownRequestError");
var Le = class extends V {
  constructor(t, r) {
    super(t, { code: "P2025", clientVersion: r }), this.name = "NotFoundError";
  }
};
w(Le, "NotFoundError");
var R = class e2 extends Error {
  constructor(t, r, n) {
    super(t), this.name = "PrismaClientInitializationError", this.clientVersion = r, this.errorCode = n, Error.captureStackTrace(e2);
  }
  get [Symbol.toStringTag]() {
    return "PrismaClientInitializationError";
  }
};
w(R, "PrismaClientInitializationError");
var le = class extends Error {
  constructor(t, r) {
    super(t), this.name = "PrismaClientRustPanicError", this.clientVersion = r;
  }
  get [Symbol.toStringTag]() {
    return "PrismaClientRustPanicError";
  }
};
w(le, "PrismaClientRustPanicError");
var B = class extends Error {
  constructor(t, { clientVersion: r, batchRequestIdx: n }) {
    super(t), this.name = "PrismaClientUnknownRequestError", this.clientVersion = r, Object.defineProperty(this, "batchRequestIdx", { value: n, writable: true, enumerable: false });
  }
  get [Symbol.toStringTag]() {
    return "PrismaClientUnknownRequestError";
  }
};
w(B, "PrismaClientUnknownRequestError");
var J = class extends Error {
  constructor(r, { clientVersion: n }) {
    super(r);
    this.name = "PrismaClientValidationError";
    this.clientVersion = n;
  }
  get [Symbol.toStringTag]() {
    return "PrismaClientValidationError";
  }
};
w(J, "PrismaClientValidationError");
var bt = 9e15, ze = 1e9, Pi = "0123456789abcdef", tn = "2.3025850929940456840179914546843642076011014886287729760333279009675726096773524802359972050895982983419677840422862486334095254650828067566662873690987816894829072083255546808437998948262331985283935053089653777326288461633662222876982198867465436674744042432743651550489343149393914796194044002221051017141748003688084012647080685567743216228355220114804663715659121373450747856947683463616792101806445070648000277502684916746550586856935673420670581136429224554405758925724208241314695689016758940256776311356919292033376587141660230105703089634572075440370847469940168269282808481184289314848524948644871927809676271275775397027668605952496716674183485704422507197965004714951050492214776567636938662976979522110718264549734772662425709429322582798502585509785265383207606726317164309505995087807523710333101197857547331541421808427543863591778117054309827482385045648019095610299291824318237525357709750539565187697510374970888692180205189339507238539205144634197265287286965110862571492198849978748873771345686209167058", rn = "3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679821480865132823066470938446095505822317253594081284811174502841027019385211055596446229489549303819644288109756659334461284756482337867831652712019091456485669234603486104543266482133936072602491412737245870066063155881748815209209628292540917153643678925903600113305305488204665213841469519415116094330572703657595919530921861173819326117931051185480744623799627495673518857527248912279381830119491298336733624406566430860213949463952247371907021798609437027705392171762931767523846748184676694051320005681271452635608277857713427577896091736371787214684409012249534301465495853710507922796892589235420199561121290219608640344181598136297747713099605187072113499999983729780499510597317328160963185950244594553469083026425223082533446850352619311881710100031378387528865875332083814206171776691473035982534904287554687311595628638823537875937519577818577805321712268066130019278766111959092164201989380952572010654858632789", vi = { precision: 20, rounding: 4, modulo: 1, toExpNeg: -7, toExpPos: 21, minE: -bt, maxE: bt, crypto: false }, xs, Ne, x = true, on = "[DecimalError] ", Ke = on + "Invalid argument: ", Ps = on + "Precision limit exceeded", vs = on + "crypto unavailable", Ts = "[object Decimal]", ee = Math.floor, G = Math.pow, bc = /^0b([01]+(\.[01]*)?|\.[01]+)(p[+-]?\d+)?$/i, Ec = /^0x([0-9a-f]+(\.[0-9a-f]*)?|\.[0-9a-f]+)(p[+-]?\d+)?$/i, wc = /^0o([0-7]+(\.[0-7]*)?|\.[0-7]+)(p[+-]?\d+)?$/i, Rs = /^(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i, ge = 1e7, b = 7, xc = 9007199254740991, Pc = tn.length - 1, Ti = rn.length - 1, m = { toStringTag: Ts };
m.absoluteValue = m.abs = function() {
  var e10 = new this.constructor(this);
  return e10.s < 0 && (e10.s = 1), y(e10);
};
m.ceil = function() {
  return y(new this.constructor(this), this.e + 1, 2);
};
m.clampedTo = m.clamp = function(e10, t) {
  var r, n = this, i = n.constructor;
  if (e10 = new i(e10), t = new i(t), !e10.s || !t.s) return new i(NaN);
  if (e10.gt(t)) throw Error(Ke + t);
  return r = n.cmp(e10), r < 0 ? e10 : n.cmp(t) > 0 ? t : new i(n);
};
m.comparedTo = m.cmp = function(e10) {
  var t, r, n, i, o = this, s = o.d, a = (e10 = new o.constructor(e10)).d, l = o.s, u = e10.s;
  if (!s || !a) return !l || !u ? NaN : l !== u ? l : s === a ? 0 : !s ^ l < 0 ? 1 : -1;
  if (!s[0] || !a[0]) return s[0] ? l : a[0] ? -u : 0;
  if (l !== u) return l;
  if (o.e !== e10.e) return o.e > e10.e ^ l < 0 ? 1 : -1;
  for (n = s.length, i = a.length, t = 0, r = n < i ? n : i; t < r; ++t) if (s[t] !== a[t]) return s[t] > a[t] ^ l < 0 ? 1 : -1;
  return n === i ? 0 : n > i ^ l < 0 ? 1 : -1;
};
m.cosine = m.cos = function() {
  var e10, t, r = this, n = r.constructor;
  return r.d ? r.d[0] ? (e10 = n.precision, t = n.rounding, n.precision = e10 + Math.max(r.e, r.sd()) + b, n.rounding = 1, r = vc(n, Os(n, r)), n.precision = e10, n.rounding = t, y(Ne == 2 || Ne == 3 ? r.neg() : r, e10, t, true)) : new n(1) : new n(NaN);
};
m.cubeRoot = m.cbrt = function() {
  var e10, t, r, n, i, o, s, a, l, u, c = this, p = c.constructor;
  if (!c.isFinite() || c.isZero()) return new p(c);
  for (x = false, o = c.s * G(c.s * c, 1 / 3), !o || Math.abs(o) == 1 / 0 ? (r = K(c.d), e10 = c.e, (o = (e10 - r.length + 1) % 3) && (r += o == 1 || o == -2 ? "0" : "00"), o = G(r, 1 / 3), e10 = ee((e10 + 1) / 3) - (e10 % 3 == (e10 < 0 ? -1 : 2)), o == 1 / 0 ? r = "5e" + e10 : (r = o.toExponential(), r = r.slice(0, r.indexOf("e") + 1) + e10), n = new p(r), n.s = c.s) : n = new p(o.toString()), s = (e10 = p.precision) + 3; ; ) if (a = n, l = a.times(a).times(a), u = l.plus(c), n = N(u.plus(c).times(a), u.plus(l), s + 2, 1), K(a.d).slice(0, s) === (r = K(n.d)).slice(0, s)) if (r = r.slice(s - 3, s + 1), r == "9999" || !i && r == "4999") {
    if (!i && (y(a, e10 + 1, 0), a.times(a).times(a).eq(c))) {
      n = a;
      break;
    }
    s += 4, i = 1;
  } else {
    (!+r || !+r.slice(1) && r.charAt(0) == "5") && (y(n, e10 + 1, 1), t = !n.times(n).times(n).eq(c));
    break;
  }
  return x = true, y(n, e10, p.rounding, t);
};
m.decimalPlaces = m.dp = function() {
  var e10, t = this.d, r = NaN;
  if (t) {
    if (e10 = t.length - 1, r = (e10 - ee(this.e / b)) * b, e10 = t[e10], e10) for (; e10 % 10 == 0; e10 /= 10) r--;
    r < 0 && (r = 0);
  }
  return r;
};
m.dividedBy = m.div = function(e10) {
  return N(this, new this.constructor(e10));
};
m.dividedToIntegerBy = m.divToInt = function(e10) {
  var t = this, r = t.constructor;
  return y(N(t, new r(e10), 0, 1, 1), r.precision, r.rounding);
};
m.equals = m.eq = function(e10) {
  return this.cmp(e10) === 0;
};
m.floor = function() {
  return y(new this.constructor(this), this.e + 1, 3);
};
m.greaterThan = m.gt = function(e10) {
  return this.cmp(e10) > 0;
};
m.greaterThanOrEqualTo = m.gte = function(e10) {
  var t = this.cmp(e10);
  return t == 1 || t === 0;
};
m.hyperbolicCosine = m.cosh = function() {
  var e10, t, r, n, i, o = this, s = o.constructor, a = new s(1);
  if (!o.isFinite()) return new s(o.s ? 1 / 0 : NaN);
  if (o.isZero()) return a;
  r = s.precision, n = s.rounding, s.precision = r + Math.max(o.e, o.sd()) + 4, s.rounding = 1, i = o.d.length, i < 32 ? (e10 = Math.ceil(i / 3), t = (1 / an(4, e10)).toString()) : (e10 = 16, t = "2.3283064365386962890625e-10"), o = Et(s, 1, o.times(t), new s(1), true);
  for (var l, u = e10, c = new s(8); u--; ) l = o.times(o), o = a.minus(l.times(c.minus(l.times(c))));
  return y(o, s.precision = r, s.rounding = n, true);
};
m.hyperbolicSine = m.sinh = function() {
  var e10, t, r, n, i = this, o = i.constructor;
  if (!i.isFinite() || i.isZero()) return new o(i);
  if (t = o.precision, r = o.rounding, o.precision = t + Math.max(i.e, i.sd()) + 4, o.rounding = 1, n = i.d.length, n < 3) i = Et(o, 2, i, i, true);
  else {
    e10 = 1.4 * Math.sqrt(n), e10 = e10 > 16 ? 16 : e10 | 0, i = i.times(1 / an(5, e10)), i = Et(o, 2, i, i, true);
    for (var s, a = new o(5), l = new o(16), u = new o(20); e10--; ) s = i.times(i), i = i.times(a.plus(s.times(l.times(s).plus(u))));
  }
  return o.precision = t, o.rounding = r, y(i, t, r, true);
};
m.hyperbolicTangent = m.tanh = function() {
  var e10, t, r = this, n = r.constructor;
  return r.isFinite() ? r.isZero() ? new n(r) : (e10 = n.precision, t = n.rounding, n.precision = e10 + 7, n.rounding = 1, N(r.sinh(), r.cosh(), n.precision = e10, n.rounding = t)) : new n(r.s);
};
m.inverseCosine = m.acos = function() {
  var e10, t = this, r = t.constructor, n = t.abs().cmp(1), i = r.precision, o = r.rounding;
  return n !== -1 ? n === 0 ? t.isNeg() ? fe(r, i, o) : new r(0) : new r(NaN) : t.isZero() ? fe(r, i + 4, o).times(0.5) : (r.precision = i + 6, r.rounding = 1, t = t.asin(), e10 = fe(r, i + 4, o).times(0.5), r.precision = i, r.rounding = o, e10.minus(t));
};
m.inverseHyperbolicCosine = m.acosh = function() {
  var e10, t, r = this, n = r.constructor;
  return r.lte(1) ? new n(r.eq(1) ? 0 : NaN) : r.isFinite() ? (e10 = n.precision, t = n.rounding, n.precision = e10 + Math.max(Math.abs(r.e), r.sd()) + 4, n.rounding = 1, x = false, r = r.times(r).minus(1).sqrt().plus(r), x = true, n.precision = e10, n.rounding = t, r.ln()) : new n(r);
};
m.inverseHyperbolicSine = m.asinh = function() {
  var e10, t, r = this, n = r.constructor;
  return !r.isFinite() || r.isZero() ? new n(r) : (e10 = n.precision, t = n.rounding, n.precision = e10 + 2 * Math.max(Math.abs(r.e), r.sd()) + 6, n.rounding = 1, x = false, r = r.times(r).plus(1).sqrt().plus(r), x = true, n.precision = e10, n.rounding = t, r.ln());
};
m.inverseHyperbolicTangent = m.atanh = function() {
  var e10, t, r, n, i = this, o = i.constructor;
  return i.isFinite() ? i.e >= 0 ? new o(i.abs().eq(1) ? i.s / 0 : i.isZero() ? i : NaN) : (e10 = o.precision, t = o.rounding, n = i.sd(), Math.max(n, e10) < 2 * -i.e - 1 ? y(new o(i), e10, t, true) : (o.precision = r = n - i.e, i = N(i.plus(1), new o(1).minus(i), r + e10, 1), o.precision = e10 + 4, o.rounding = 1, i = i.ln(), o.precision = e10, o.rounding = t, i.times(0.5))) : new o(NaN);
};
m.inverseSine = m.asin = function() {
  var e10, t, r, n, i = this, o = i.constructor;
  return i.isZero() ? new o(i) : (t = i.abs().cmp(1), r = o.precision, n = o.rounding, t !== -1 ? t === 0 ? (e10 = fe(o, r + 4, n).times(0.5), e10.s = i.s, e10) : new o(NaN) : (o.precision = r + 6, o.rounding = 1, i = i.div(new o(1).minus(i.times(i)).sqrt().plus(1)).atan(), o.precision = r, o.rounding = n, i.times(2)));
};
m.inverseTangent = m.atan = function() {
  var e10, t, r, n, i, o, s, a, l, u = this, c = u.constructor, p = c.precision, d = c.rounding;
  if (u.isFinite()) {
    if (u.isZero()) return new c(u);
    if (u.abs().eq(1) && p + 4 <= Ti) return s = fe(c, p + 4, d).times(0.25), s.s = u.s, s;
  } else {
    if (!u.s) return new c(NaN);
    if (p + 4 <= Ti) return s = fe(c, p + 4, d).times(0.5), s.s = u.s, s;
  }
  for (c.precision = a = p + 10, c.rounding = 1, r = Math.min(28, a / b + 2 | 0), e10 = r; e10; --e10) u = u.div(u.times(u).plus(1).sqrt().plus(1));
  for (x = false, t = Math.ceil(a / b), n = 1, l = u.times(u), s = new c(u), i = u; e10 !== -1; ) if (i = i.times(l), o = s.minus(i.div(n += 2)), i = i.times(l), s = o.plus(i.div(n += 2)), s.d[t] !== void 0) for (e10 = t; s.d[e10] === o.d[e10] && e10--; ) ;
  return r && (s = s.times(2 << r - 1)), x = true, y(s, c.precision = p, c.rounding = d, true);
};
m.isFinite = function() {
  return !!this.d;
};
m.isInteger = m.isInt = function() {
  return !!this.d && ee(this.e / b) > this.d.length - 2;
};
m.isNaN = function() {
  return !this.s;
};
m.isNegative = m.isNeg = function() {
  return this.s < 0;
};
m.isPositive = m.isPos = function() {
  return this.s > 0;
};
m.isZero = function() {
  return !!this.d && this.d[0] === 0;
};
m.lessThan = m.lt = function(e10) {
  return this.cmp(e10) < 0;
};
m.lessThanOrEqualTo = m.lte = function(e10) {
  return this.cmp(e10) < 1;
};
m.logarithm = m.log = function(e10) {
  var t, r, n, i, o, s, a, l, u = this, c = u.constructor, p = c.precision, d = c.rounding, f = 5;
  if (e10 == null) e10 = new c(10), t = true;
  else {
    if (e10 = new c(e10), r = e10.d, e10.s < 0 || !r || !r[0] || e10.eq(1)) return new c(NaN);
    t = e10.eq(10);
  }
  if (r = u.d, u.s < 0 || !r || !r[0] || u.eq(1)) return new c(r && !r[0] ? -1 / 0 : u.s != 1 ? NaN : r ? 0 : 1 / 0);
  if (t) if (r.length > 1) o = true;
  else {
    for (i = r[0]; i % 10 === 0; ) i /= 10;
    o = i !== 1;
  }
  if (x = false, a = p + f, s = He(u, a), n = t ? nn(c, a + 10) : He(e10, a), l = N(s, n, a, 1), rr(l.d, i = p, d)) do
    if (a += 10, s = He(u, a), n = t ? nn(c, a + 10) : He(e10, a), l = N(s, n, a, 1), !o) {
      +K(l.d).slice(i + 1, i + 15) + 1 == 1e14 && (l = y(l, p + 1, 0));
      break;
    }
  while (rr(l.d, i += 10, d));
  return x = true, y(l, p, d);
};
m.minus = m.sub = function(e10) {
  var t, r, n, i, o, s, a, l, u, c, p, d, f = this, g = f.constructor;
  if (e10 = new g(e10), !f.d || !e10.d) return !f.s || !e10.s ? e10 = new g(NaN) : f.d ? e10.s = -e10.s : e10 = new g(e10.d || f.s !== e10.s ? f : NaN), e10;
  if (f.s != e10.s) return e10.s = -e10.s, f.plus(e10);
  if (u = f.d, d = e10.d, a = g.precision, l = g.rounding, !u[0] || !d[0]) {
    if (d[0]) e10.s = -e10.s;
    else if (u[0]) e10 = new g(f);
    else return new g(l === 3 ? -0 : 0);
    return x ? y(e10, a, l) : e10;
  }
  if (r = ee(e10.e / b), c = ee(f.e / b), u = u.slice(), o = c - r, o) {
    for (p = o < 0, p ? (t = u, o = -o, s = d.length) : (t = d, r = c, s = u.length), n = Math.max(Math.ceil(a / b), s) + 2, o > n && (o = n, t.length = 1), t.reverse(), n = o; n--; ) t.push(0);
    t.reverse();
  } else {
    for (n = u.length, s = d.length, p = n < s, p && (s = n), n = 0; n < s; n++) if (u[n] != d[n]) {
      p = u[n] < d[n];
      break;
    }
    o = 0;
  }
  for (p && (t = u, u = d, d = t, e10.s = -e10.s), s = u.length, n = d.length - s; n > 0; --n) u[s++] = 0;
  for (n = d.length; n > o; ) {
    if (u[--n] < d[n]) {
      for (i = n; i && u[--i] === 0; ) u[i] = ge - 1;
      --u[i], u[n] += ge;
    }
    u[n] -= d[n];
  }
  for (; u[--s] === 0; ) u.pop();
  for (; u[0] === 0; u.shift()) --r;
  return u[0] ? (e10.d = u, e10.e = sn(u, r), x ? y(e10, a, l) : e10) : new g(l === 3 ? -0 : 0);
};
m.modulo = m.mod = function(e10) {
  var t, r = this, n = r.constructor;
  return e10 = new n(e10), !r.d || !e10.s || e10.d && !e10.d[0] ? new n(NaN) : !e10.d || r.d && !r.d[0] ? y(new n(r), n.precision, n.rounding) : (x = false, n.modulo == 9 ? (t = N(r, e10.abs(), 0, 3, 1), t.s *= e10.s) : t = N(r, e10, 0, n.modulo, 1), t = t.times(e10), x = true, r.minus(t));
};
m.naturalExponential = m.exp = function() {
  return Ri(this);
};
m.naturalLogarithm = m.ln = function() {
  return He(this);
};
m.negated = m.neg = function() {
  var e10 = new this.constructor(this);
  return e10.s = -e10.s, y(e10);
};
m.plus = m.add = function(e10) {
  var t, r, n, i, o, s, a, l, u, c, p = this, d = p.constructor;
  if (e10 = new d(e10), !p.d || !e10.d) return !p.s || !e10.s ? e10 = new d(NaN) : p.d || (e10 = new d(e10.d || p.s === e10.s ? p : NaN)), e10;
  if (p.s != e10.s) return e10.s = -e10.s, p.minus(e10);
  if (u = p.d, c = e10.d, a = d.precision, l = d.rounding, !u[0] || !c[0]) return c[0] || (e10 = new d(p)), x ? y(e10, a, l) : e10;
  if (o = ee(p.e / b), n = ee(e10.e / b), u = u.slice(), i = o - n, i) {
    for (i < 0 ? (r = u, i = -i, s = c.length) : (r = c, n = o, s = u.length), o = Math.ceil(a / b), s = o > s ? o + 1 : s + 1, i > s && (i = s, r.length = 1), r.reverse(); i--; ) r.push(0);
    r.reverse();
  }
  for (s = u.length, i = c.length, s - i < 0 && (i = s, r = c, c = u, u = r), t = 0; i; ) t = (u[--i] = u[i] + c[i] + t) / ge | 0, u[i] %= ge;
  for (t && (u.unshift(t), ++n), s = u.length; u[--s] == 0; ) u.pop();
  return e10.d = u, e10.e = sn(u, n), x ? y(e10, a, l) : e10;
};
m.precision = m.sd = function(e10) {
  var t, r = this;
  if (e10 !== void 0 && e10 !== !!e10 && e10 !== 1 && e10 !== 0) throw Error(Ke + e10);
  return r.d ? (t = Cs(r.d), e10 && r.e + 1 > t && (t = r.e + 1)) : t = NaN, t;
};
m.round = function() {
  var e10 = this, t = e10.constructor;
  return y(new t(e10), e10.e + 1, t.rounding);
};
m.sine = m.sin = function() {
  var e10, t, r = this, n = r.constructor;
  return r.isFinite() ? r.isZero() ? new n(r) : (e10 = n.precision, t = n.rounding, n.precision = e10 + Math.max(r.e, r.sd()) + b, n.rounding = 1, r = Rc(n, Os(n, r)), n.precision = e10, n.rounding = t, y(Ne > 2 ? r.neg() : r, e10, t, true)) : new n(NaN);
};
m.squareRoot = m.sqrt = function() {
  var e10, t, r, n, i, o, s = this, a = s.d, l = s.e, u = s.s, c = s.constructor;
  if (u !== 1 || !a || !a[0]) return new c(!u || u < 0 && (!a || a[0]) ? NaN : a ? s : 1 / 0);
  for (x = false, u = Math.sqrt(+s), u == 0 || u == 1 / 0 ? (t = K(a), (t.length + l) % 2 == 0 && (t += "0"), u = Math.sqrt(t), l = ee((l + 1) / 2) - (l < 0 || l % 2), u == 1 / 0 ? t = "5e" + l : (t = u.toExponential(), t = t.slice(0, t.indexOf("e") + 1) + l), n = new c(t)) : n = new c(u.toString()), r = (l = c.precision) + 3; ; ) if (o = n, n = o.plus(N(s, o, r + 2, 1)).times(0.5), K(o.d).slice(0, r) === (t = K(n.d)).slice(0, r)) if (t = t.slice(r - 3, r + 1), t == "9999" || !i && t == "4999") {
    if (!i && (y(o, l + 1, 0), o.times(o).eq(s))) {
      n = o;
      break;
    }
    r += 4, i = 1;
  } else {
    (!+t || !+t.slice(1) && t.charAt(0) == "5") && (y(n, l + 1, 1), e10 = !n.times(n).eq(s));
    break;
  }
  return x = true, y(n, l, c.rounding, e10);
};
m.tangent = m.tan = function() {
  var e10, t, r = this, n = r.constructor;
  return r.isFinite() ? r.isZero() ? new n(r) : (e10 = n.precision, t = n.rounding, n.precision = e10 + 10, n.rounding = 1, r = r.sin(), r.s = 1, r = N(r, new n(1).minus(r.times(r)).sqrt(), e10 + 10, 0), n.precision = e10, n.rounding = t, y(Ne == 2 || Ne == 4 ? r.neg() : r, e10, t, true)) : new n(NaN);
};
m.times = m.mul = function(e10) {
  var t, r, n, i, o, s, a, l, u, c = this, p = c.constructor, d = c.d, f = (e10 = new p(e10)).d;
  if (e10.s *= c.s, !d || !d[0] || !f || !f[0]) return new p(!e10.s || d && !d[0] && !f || f && !f[0] && !d ? NaN : !d || !f ? e10.s / 0 : e10.s * 0);
  for (r = ee(c.e / b) + ee(e10.e / b), l = d.length, u = f.length, l < u && (o = d, d = f, f = o, s = l, l = u, u = s), o = [], s = l + u, n = s; n--; ) o.push(0);
  for (n = u; --n >= 0; ) {
    for (t = 0, i = l + n; i > n; ) a = o[i] + f[n] * d[i - n - 1] + t, o[i--] = a % ge | 0, t = a / ge | 0;
    o[i] = (o[i] + t) % ge | 0;
  }
  for (; !o[--s]; ) o.pop();
  return t ? ++r : o.shift(), e10.d = o, e10.e = sn(o, r), x ? y(e10, p.precision, p.rounding) : e10;
};
m.toBinary = function(e10, t) {
  return Si(this, 2, e10, t);
};
m.toDecimalPlaces = m.toDP = function(e10, t) {
  var r = this, n = r.constructor;
  return r = new n(r), e10 === void 0 ? r : (ie(e10, 0, ze), t === void 0 ? t = n.rounding : ie(t, 0, 8), y(r, e10 + r.e + 1, t));
};
m.toExponential = function(e10, t) {
  var r, n = this, i = n.constructor;
  return e10 === void 0 ? r = we(n, true) : (ie(e10, 0, ze), t === void 0 ? t = i.rounding : ie(t, 0, 8), n = y(new i(n), e10 + 1, t), r = we(n, true, e10 + 1)), n.isNeg() && !n.isZero() ? "-" + r : r;
};
m.toFixed = function(e10, t) {
  var r, n, i = this, o = i.constructor;
  return e10 === void 0 ? r = we(i) : (ie(e10, 0, ze), t === void 0 ? t = o.rounding : ie(t, 0, 8), n = y(new o(i), e10 + i.e + 1, t), r = we(n, false, e10 + n.e + 1)), i.isNeg() && !i.isZero() ? "-" + r : r;
};
m.toFraction = function(e10) {
  var t, r, n, i, o, s, a, l, u, c, p, d, f = this, g = f.d, h = f.constructor;
  if (!g) return new h(f);
  if (u = r = new h(1), n = l = new h(0), t = new h(n), o = t.e = Cs(g) - f.e - 1, s = o % b, t.d[0] = G(10, s < 0 ? b + s : s), e10 == null) e10 = o > 0 ? t : u;
  else {
    if (a = new h(e10), !a.isInt() || a.lt(u)) throw Error(Ke + a);
    e10 = a.gt(t) ? o > 0 ? t : u : a;
  }
  for (x = false, a = new h(K(g)), c = h.precision, h.precision = o = g.length * b * 2; p = N(a, t, 0, 1, 1), i = r.plus(p.times(n)), i.cmp(e10) != 1; ) r = n, n = i, i = u, u = l.plus(p.times(i)), l = i, i = t, t = a.minus(p.times(i)), a = i;
  return i = N(e10.minus(r), n, 0, 1, 1), l = l.plus(i.times(u)), r = r.plus(i.times(n)), l.s = u.s = f.s, d = N(u, n, o, 1).minus(f).abs().cmp(N(l, r, o, 1).minus(f).abs()) < 1 ? [u, n] : [l, r], h.precision = c, x = true, d;
};
m.toHexadecimal = m.toHex = function(e10, t) {
  return Si(this, 16, e10, t);
};
m.toNearest = function(e10, t) {
  var r = this, n = r.constructor;
  if (r = new n(r), e10 == null) {
    if (!r.d) return r;
    e10 = new n(1), t = n.rounding;
  } else {
    if (e10 = new n(e10), t === void 0 ? t = n.rounding : ie(t, 0, 8), !r.d) return e10.s ? r : e10;
    if (!e10.d) return e10.s && (e10.s = r.s), e10;
  }
  return e10.d[0] ? (x = false, r = N(r, e10, 0, t, 1).times(e10), x = true, y(r)) : (e10.s = r.s, r = e10), r;
};
m.toNumber = function() {
  return +this;
};
m.toOctal = function(e10, t) {
  return Si(this, 8, e10, t);
};
m.toPower = m.pow = function(e10) {
  var t, r, n, i, o, s, a = this, l = a.constructor, u = +(e10 = new l(e10));
  if (!a.d || !e10.d || !a.d[0] || !e10.d[0]) return new l(G(+a, u));
  if (a = new l(a), a.eq(1)) return a;
  if (n = l.precision, o = l.rounding, e10.eq(1)) return y(a, n, o);
  if (t = ee(e10.e / b), t >= e10.d.length - 1 && (r = u < 0 ? -u : u) <= xc) return i = Ss(l, a, r, n), e10.s < 0 ? new l(1).div(i) : y(i, n, o);
  if (s = a.s, s < 0) {
    if (t < e10.d.length - 1) return new l(NaN);
    if (e10.d[t] & 1 || (s = 1), a.e == 0 && a.d[0] == 1 && a.d.length == 1) return a.s = s, a;
  }
  return r = G(+a, u), t = r == 0 || !isFinite(r) ? ee(u * (Math.log("0." + K(a.d)) / Math.LN10 + a.e + 1)) : new l(r + "").e, t > l.maxE + 1 || t < l.minE - 1 ? new l(t > 0 ? s / 0 : 0) : (x = false, l.rounding = a.s = 1, r = Math.min(12, (t + "").length), i = Ri(e10.times(He(a, n + r)), n), i.d && (i = y(i, n + 5, 1), rr(i.d, n, o) && (t = n + 10, i = y(Ri(e10.times(He(a, t + r)), t), t + 5, 1), +K(i.d).slice(n + 1, n + 15) + 1 == 1e14 && (i = y(i, n + 1, 0)))), i.s = s, x = true, l.rounding = o, y(i, n, o));
};
m.toPrecision = function(e10, t) {
  var r, n = this, i = n.constructor;
  return e10 === void 0 ? r = we(n, n.e <= i.toExpNeg || n.e >= i.toExpPos) : (ie(e10, 1, ze), t === void 0 ? t = i.rounding : ie(t, 0, 8), n = y(new i(n), e10, t), r = we(n, e10 <= n.e || n.e <= i.toExpNeg, e10)), n.isNeg() && !n.isZero() ? "-" + r : r;
};
m.toSignificantDigits = m.toSD = function(e10, t) {
  var r = this, n = r.constructor;
  return e10 === void 0 ? (e10 = n.precision, t = n.rounding) : (ie(e10, 1, ze), t === void 0 ? t = n.rounding : ie(t, 0, 8)), y(new n(r), e10, t);
};
m.toString = function() {
  var e10 = this, t = e10.constructor, r = we(e10, e10.e <= t.toExpNeg || e10.e >= t.toExpPos);
  return e10.isNeg() && !e10.isZero() ? "-" + r : r;
};
m.truncated = m.trunc = function() {
  return y(new this.constructor(this), this.e + 1, 1);
};
m.valueOf = m.toJSON = function() {
  var e10 = this, t = e10.constructor, r = we(e10, e10.e <= t.toExpNeg || e10.e >= t.toExpPos);
  return e10.isNeg() ? "-" + r : r;
};
function K(e10) {
  var t, r, n, i = e10.length - 1, o = "", s = e10[0];
  if (i > 0) {
    for (o += s, t = 1; t < i; t++) n = e10[t] + "", r = b - n.length, r && (o += We(r)), o += n;
    s = e10[t], n = s + "", r = b - n.length, r && (o += We(r));
  } else if (s === 0) return "0";
  for (; s % 10 === 0; ) s /= 10;
  return o + s;
}
function ie(e10, t, r) {
  if (e10 !== ~~e10 || e10 < t || e10 > r) throw Error(Ke + e10);
}
function rr(e10, t, r, n) {
  var i, o, s, a;
  for (o = e10[0]; o >= 10; o /= 10) --t;
  return --t < 0 ? (t += b, i = 0) : (i = Math.ceil((t + 1) / b), t %= b), o = G(10, b - t), a = e10[i] % o | 0, n == null ? t < 3 ? (t == 0 ? a = a / 100 | 0 : t == 1 && (a = a / 10 | 0), s = r < 4 && a == 99999 || r > 3 && a == 49999 || a == 5e4 || a == 0) : s = (r < 4 && a + 1 == o || r > 3 && a + 1 == o / 2) && (e10[i + 1] / o / 100 | 0) == G(10, t - 2) - 1 || (a == o / 2 || a == 0) && (e10[i + 1] / o / 100 | 0) == 0 : t < 4 ? (t == 0 ? a = a / 1e3 | 0 : t == 1 ? a = a / 100 | 0 : t == 2 && (a = a / 10 | 0), s = (n || r < 4) && a == 9999 || !n && r > 3 && a == 4999) : s = ((n || r < 4) && a + 1 == o || !n && r > 3 && a + 1 == o / 2) && (e10[i + 1] / o / 1e3 | 0) == G(10, t - 3) - 1, s;
}
function en(e10, t, r) {
  for (var n, i = [0], o, s = 0, a = e10.length; s < a; ) {
    for (o = i.length; o--; ) i[o] *= t;
    for (i[0] += Pi.indexOf(e10.charAt(s++)), n = 0; n < i.length; n++) i[n] > r - 1 && (i[n + 1] === void 0 && (i[n + 1] = 0), i[n + 1] += i[n] / r | 0, i[n] %= r);
  }
  return i.reverse();
}
function vc(e10, t) {
  var r, n, i;
  if (t.isZero()) return t;
  n = t.d.length, n < 32 ? (r = Math.ceil(n / 3), i = (1 / an(4, r)).toString()) : (r = 16, i = "2.3283064365386962890625e-10"), e10.precision += r, t = Et(e10, 1, t.times(i), new e10(1));
  for (var o = r; o--; ) {
    var s = t.times(t);
    t = s.times(s).minus(s).times(8).plus(1);
  }
  return e10.precision -= r, t;
}
var N = /* @__PURE__ */ function() {
  function e10(n, i, o) {
    var s, a = 0, l = n.length;
    for (n = n.slice(); l--; ) s = n[l] * i + a, n[l] = s % o | 0, a = s / o | 0;
    return a && n.unshift(a), n;
  }
  function t(n, i, o, s) {
    var a, l;
    if (o != s) l = o > s ? 1 : -1;
    else for (a = l = 0; a < o; a++) if (n[a] != i[a]) {
      l = n[a] > i[a] ? 1 : -1;
      break;
    }
    return l;
  }
  function r(n, i, o, s) {
    for (var a = 0; o--; ) n[o] -= a, a = n[o] < i[o] ? 1 : 0, n[o] = a * s + n[o] - i[o];
    for (; !n[0] && n.length > 1; ) n.shift();
  }
  return function(n, i, o, s, a, l) {
    var u, c, p, d, f, g, h, O, T, S, C, E, me, ae, Bt, U, ne, Ie, z, dt, Lr = n.constructor, qn = n.s == i.s ? 1 : -1, Y = n.d, _ = i.d;
    if (!Y || !Y[0] || !_ || !_[0]) return new Lr(!n.s || !i.s || (Y ? _ && Y[0] == _[0] : !_) ? NaN : Y && Y[0] == 0 || !_ ? qn * 0 : qn / 0);
    for (l ? (f = 1, c = n.e - i.e) : (l = ge, f = b, c = ee(n.e / f) - ee(i.e / f)), z = _.length, ne = Y.length, T = new Lr(qn), S = T.d = [], p = 0; _[p] == (Y[p] || 0); p++) ;
    if (_[p] > (Y[p] || 0) && c--, o == null ? (ae = o = Lr.precision, s = Lr.rounding) : a ? ae = o + (n.e - i.e) + 1 : ae = o, ae < 0) S.push(1), g = true;
    else {
      if (ae = ae / f + 2 | 0, p = 0, z == 1) {
        for (d = 0, _ = _[0], ae++; (p < ne || d) && ae--; p++) Bt = d * l + (Y[p] || 0), S[p] = Bt / _ | 0, d = Bt % _ | 0;
        g = d || p < ne;
      } else {
        for (d = l / (_[0] + 1) | 0, d > 1 && (_ = e10(_, d, l), Y = e10(Y, d, l), z = _.length, ne = Y.length), U = z, C = Y.slice(0, z), E = C.length; E < z; ) C[E++] = 0;
        dt = _.slice(), dt.unshift(0), Ie = _[0], _[1] >= l / 2 && ++Ie;
        do
          d = 0, u = t(_, C, z, E), u < 0 ? (me = C[0], z != E && (me = me * l + (C[1] || 0)), d = me / Ie | 0, d > 1 ? (d >= l && (d = l - 1), h = e10(_, d, l), O = h.length, E = C.length, u = t(h, C, O, E), u == 1 && (d--, r(h, z < O ? dt : _, O, l))) : (d == 0 && (u = d = 1), h = _.slice()), O = h.length, O < E && h.unshift(0), r(C, h, E, l), u == -1 && (E = C.length, u = t(_, C, z, E), u < 1 && (d++, r(C, z < E ? dt : _, E, l))), E = C.length) : u === 0 && (d++, C = [0]), S[p++] = d, u && C[0] ? C[E++] = Y[U] || 0 : (C = [Y[U]], E = 1);
        while ((U++ < ne || C[0] !== void 0) && ae--);
        g = C[0] !== void 0;
      }
      S[0] || S.shift();
    }
    if (f == 1) T.e = c, xs = g;
    else {
      for (p = 1, d = S[0]; d >= 10; d /= 10) p++;
      T.e = p + c * f - 1, y(T, a ? o + T.e + 1 : o, s, g);
    }
    return T;
  };
}();
function y(e10, t, r, n) {
  var i, o, s, a, l, u, c, p, d, f = e10.constructor;
  e: if (t != null) {
    if (p = e10.d, !p) return e10;
    for (i = 1, a = p[0]; a >= 10; a /= 10) i++;
    if (o = t - i, o < 0) o += b, s = t, c = p[d = 0], l = c / G(10, i - s - 1) % 10 | 0;
    else if (d = Math.ceil((o + 1) / b), a = p.length, d >= a) if (n) {
      for (; a++ <= d; ) p.push(0);
      c = l = 0, i = 1, o %= b, s = o - b + 1;
    } else break e;
    else {
      for (c = a = p[d], i = 1; a >= 10; a /= 10) i++;
      o %= b, s = o - b + i, l = s < 0 ? 0 : c / G(10, i - s - 1) % 10 | 0;
    }
    if (n = n || t < 0 || p[d + 1] !== void 0 || (s < 0 ? c : c % G(10, i - s - 1)), u = r < 4 ? (l || n) && (r == 0 || r == (e10.s < 0 ? 3 : 2)) : l > 5 || l == 5 && (r == 4 || n || r == 6 && (o > 0 ? s > 0 ? c / G(10, i - s) : 0 : p[d - 1]) % 10 & 1 || r == (e10.s < 0 ? 8 : 7)), t < 1 || !p[0]) return p.length = 0, u ? (t -= e10.e + 1, p[0] = G(10, (b - t % b) % b), e10.e = -t || 0) : p[0] = e10.e = 0, e10;
    if (o == 0 ? (p.length = d, a = 1, d--) : (p.length = d + 1, a = G(10, b - o), p[d] = s > 0 ? (c / G(10, i - s) % G(10, s) | 0) * a : 0), u) for (; ; ) if (d == 0) {
      for (o = 1, s = p[0]; s >= 10; s /= 10) o++;
      for (s = p[0] += a, a = 1; s >= 10; s /= 10) a++;
      o != a && (e10.e++, p[0] == ge && (p[0] = 1));
      break;
    } else {
      if (p[d] += a, p[d] != ge) break;
      p[d--] = 0, a = 1;
    }
    for (o = p.length; p[--o] === 0; ) p.pop();
  }
  return x && (e10.e > f.maxE ? (e10.d = null, e10.e = NaN) : e10.e < f.minE && (e10.e = 0, e10.d = [0])), e10;
}
function we(e10, t, r) {
  if (!e10.isFinite()) return Is(e10);
  var n, i = e10.e, o = K(e10.d), s = o.length;
  return t ? (r && (n = r - s) > 0 ? o = o.charAt(0) + "." + o.slice(1) + We(n) : s > 1 && (o = o.charAt(0) + "." + o.slice(1)), o = o + (e10.e < 0 ? "e" : "e+") + e10.e) : i < 0 ? (o = "0." + We(-i - 1) + o, r && (n = r - s) > 0 && (o += We(n))) : i >= s ? (o += We(i + 1 - s), r && (n = r - i - 1) > 0 && (o = o + "." + We(n))) : ((n = i + 1) < s && (o = o.slice(0, n) + "." + o.slice(n)), r && (n = r - s) > 0 && (i + 1 === s && (o += "."), o += We(n))), o;
}
function sn(e10, t) {
  var r = e10[0];
  for (t *= b; r >= 10; r /= 10) t++;
  return t;
}
function nn(e10, t, r) {
  if (t > Pc) throw x = true, r && (e10.precision = r), Error(Ps);
  return y(new e10(tn), t, 1, true);
}
function fe(e10, t, r) {
  if (t > Ti) throw Error(Ps);
  return y(new e10(rn), t, r, true);
}
function Cs(e10) {
  var t = e10.length - 1, r = t * b + 1;
  if (t = e10[t], t) {
    for (; t % 10 == 0; t /= 10) r--;
    for (t = e10[0]; t >= 10; t /= 10) r++;
  }
  return r;
}
function We(e10) {
  for (var t = ""; e10--; ) t += "0";
  return t;
}
function Ss(e10, t, r, n) {
  var i, o = new e10(1), s = Math.ceil(n / b + 4);
  for (x = false; ; ) {
    if (r % 2 && (o = o.times(t), Es(o.d, s) && (i = true)), r = ee(r / 2), r === 0) {
      r = o.d.length - 1, i && o.d[r] === 0 && ++o.d[r];
      break;
    }
    t = t.times(t), Es(t.d, s);
  }
  return x = true, o;
}
function bs(e10) {
  return e10.d[e10.d.length - 1] & 1;
}
function As(e10, t, r) {
  for (var n, i = new e10(t[0]), o = 0; ++o < t.length; ) if (n = new e10(t[o]), n.s) i[r](n) && (i = n);
  else {
    i = n;
    break;
  }
  return i;
}
function Ri(e10, t) {
  var r, n, i, o, s, a, l, u = 0, c = 0, p = 0, d = e10.constructor, f = d.rounding, g = d.precision;
  if (!e10.d || !e10.d[0] || e10.e > 17) return new d(e10.d ? e10.d[0] ? e10.s < 0 ? 0 : 1 / 0 : 1 : e10.s ? e10.s < 0 ? 0 : e10 : NaN);
  for (t == null ? (x = false, l = g) : l = t, a = new d(0.03125); e10.e > -2; ) e10 = e10.times(a), p += 5;
  for (n = Math.log(G(2, p)) / Math.LN10 * 2 + 5 | 0, l += n, r = o = s = new d(1), d.precision = l; ; ) {
    if (o = y(o.times(e10), l, 1), r = r.times(++c), a = s.plus(N(o, r, l, 1)), K(a.d).slice(0, l) === K(s.d).slice(0, l)) {
      for (i = p; i--; ) s = y(s.times(s), l, 1);
      if (t == null) if (u < 3 && rr(s.d, l - n, f, u)) d.precision = l += 10, r = o = a = new d(1), c = 0, u++;
      else return y(s, d.precision = g, f, x = true);
      else return d.precision = g, s;
    }
    s = a;
  }
}
function He(e10, t) {
  var r, n, i, o, s, a, l, u, c, p, d, f = 1, g = 10, h = e10, O = h.d, T = h.constructor, S = T.rounding, C = T.precision;
  if (h.s < 0 || !O || !O[0] || !h.e && O[0] == 1 && O.length == 1) return new T(O && !O[0] ? -1 / 0 : h.s != 1 ? NaN : O ? 0 : h);
  if (t == null ? (x = false, c = C) : c = t, T.precision = c += g, r = K(O), n = r.charAt(0), Math.abs(o = h.e) < 15e14) {
    for (; n < 7 && n != 1 || n == 1 && r.charAt(1) > 3; ) h = h.times(e10), r = K(h.d), n = r.charAt(0), f++;
    o = h.e, n > 1 ? (h = new T("0." + r), o++) : h = new T(n + "." + r.slice(1));
  } else return u = nn(T, c + 2, C).times(o + ""), h = He(new T(n + "." + r.slice(1)), c - g).plus(u), T.precision = C, t == null ? y(h, C, S, x = true) : h;
  for (p = h, l = s = h = N(h.minus(1), h.plus(1), c, 1), d = y(h.times(h), c, 1), i = 3; ; ) {
    if (s = y(s.times(d), c, 1), u = l.plus(N(s, new T(i), c, 1)), K(u.d).slice(0, c) === K(l.d).slice(0, c)) if (l = l.times(2), o !== 0 && (l = l.plus(nn(T, c + 2, C).times(o + ""))), l = N(l, new T(f), c, 1), t == null) if (rr(l.d, c - g, S, a)) T.precision = c += g, u = s = h = N(p.minus(1), p.plus(1), c, 1), d = y(h.times(h), c, 1), i = a = 1;
    else return y(l, T.precision = C, S, x = true);
    else return T.precision = C, l;
    l = u, i += 2;
  }
}
function Is(e10) {
  return String(e10.s * e10.s / 0);
}
function Ci(e10, t) {
  var r, n, i;
  for ((r = t.indexOf(".")) > -1 && (t = t.replace(".", "")), (n = t.search(/e/i)) > 0 ? (r < 0 && (r = n), r += +t.slice(n + 1), t = t.substring(0, n)) : r < 0 && (r = t.length), n = 0; t.charCodeAt(n) === 48; n++) ;
  for (i = t.length; t.charCodeAt(i - 1) === 48; --i) ;
  if (t = t.slice(n, i), t) {
    if (i -= n, e10.e = r = r - n - 1, e10.d = [], n = (r + 1) % b, r < 0 && (n += b), n < i) {
      for (n && e10.d.push(+t.slice(0, n)), i -= b; n < i; ) e10.d.push(+t.slice(n, n += b));
      t = t.slice(n), n = b - t.length;
    } else n -= i;
    for (; n--; ) t += "0";
    e10.d.push(+t), x && (e10.e > e10.constructor.maxE ? (e10.d = null, e10.e = NaN) : e10.e < e10.constructor.minE && (e10.e = 0, e10.d = [0]));
  } else e10.e = 0, e10.d = [0];
  return e10;
}
function Tc(e10, t) {
  var r, n, i, o, s, a, l, u, c;
  if (t.indexOf("_") > -1) {
    if (t = t.replace(/(\d)_(?=\d)/g, "$1"), Rs.test(t)) return Ci(e10, t);
  } else if (t === "Infinity" || t === "NaN") return +t || (e10.s = NaN), e10.e = NaN, e10.d = null, e10;
  if (Ec.test(t)) r = 16, t = t.toLowerCase();
  else if (bc.test(t)) r = 2;
  else if (wc.test(t)) r = 8;
  else throw Error(Ke + t);
  for (o = t.search(/p/i), o > 0 ? (l = +t.slice(o + 1), t = t.substring(2, o)) : t = t.slice(2), o = t.indexOf("."), s = o >= 0, n = e10.constructor, s && (t = t.replace(".", ""), a = t.length, o = a - o, i = Ss(n, new n(r), o, o * 2)), u = en(t, r, ge), c = u.length - 1, o = c; u[o] === 0; --o) u.pop();
  return o < 0 ? new n(e10.s * 0) : (e10.e = sn(u, c), e10.d = u, x = false, s && (e10 = N(e10, i, a * 4)), l && (e10 = e10.times(Math.abs(l) < 54 ? G(2, l) : it.pow(2, l))), x = true, e10);
}
function Rc(e10, t) {
  var r, n = t.d.length;
  if (n < 3) return t.isZero() ? t : Et(e10, 2, t, t);
  r = 1.4 * Math.sqrt(n), r = r > 16 ? 16 : r | 0, t = t.times(1 / an(5, r)), t = Et(e10, 2, t, t);
  for (var i, o = new e10(5), s = new e10(16), a = new e10(20); r--; ) i = t.times(t), t = t.times(o.plus(i.times(s.times(i).minus(a))));
  return t;
}
function Et(e10, t, r, n, i) {
  var o, s, a, l, c = e10.precision, p = Math.ceil(c / b);
  for (x = false, l = r.times(r), a = new e10(n); ; ) {
    if (s = N(a.times(l), new e10(t++ * t++), c, 1), a = i ? n.plus(s) : n.minus(s), n = N(s.times(l), new e10(t++ * t++), c, 1), s = a.plus(n), s.d[p] !== void 0) {
      for (o = p; s.d[o] === a.d[o] && o--; ) ;
      if (o == -1) break;
    }
    o = a, a = n, n = s, s = o;
  }
  return x = true, s.d.length = p + 1, s;
}
function an(e10, t) {
  for (var r = e10; --t; ) r *= e10;
  return r;
}
function Os(e10, t) {
  var r, n = t.s < 0, i = fe(e10, e10.precision, 1), o = i.times(0.5);
  if (t = t.abs(), t.lte(o)) return Ne = n ? 4 : 1, t;
  if (r = t.divToInt(i), r.isZero()) Ne = n ? 3 : 2;
  else {
    if (t = t.minus(r.times(i)), t.lte(o)) return Ne = bs(r) ? n ? 2 : 3 : n ? 4 : 1, t;
    Ne = bs(r) ? n ? 1 : 4 : n ? 3 : 2;
  }
  return t.minus(i).abs();
}
function Si(e10, t, r, n) {
  var i, o, s, a, l, u, c, p, d, f = e10.constructor, g = r !== void 0;
  if (g ? (ie(r, 1, ze), n === void 0 ? n = f.rounding : ie(n, 0, 8)) : (r = f.precision, n = f.rounding), !e10.isFinite()) c = Is(e10);
  else {
    for (c = we(e10), s = c.indexOf("."), g ? (i = 2, t == 16 ? r = r * 4 - 3 : t == 8 && (r = r * 3 - 2)) : i = t, s >= 0 && (c = c.replace(".", ""), d = new f(1), d.e = c.length - s, d.d = en(we(d), 10, i), d.e = d.d.length), p = en(c, 10, i), o = l = p.length; p[--l] == 0; ) p.pop();
    if (!p[0]) c = g ? "0p+0" : "0";
    else {
      if (s < 0 ? o-- : (e10 = new f(e10), e10.d = p, e10.e = o, e10 = N(e10, d, r, n, 0, i), p = e10.d, o = e10.e, u = xs), s = p[r], a = i / 2, u = u || p[r + 1] !== void 0, u = n < 4 ? (s !== void 0 || u) && (n === 0 || n === (e10.s < 0 ? 3 : 2)) : s > a || s === a && (n === 4 || u || n === 6 && p[r - 1] & 1 || n === (e10.s < 0 ? 8 : 7)), p.length = r, u) for (; ++p[--r] > i - 1; ) p[r] = 0, r || (++o, p.unshift(1));
      for (l = p.length; !p[l - 1]; --l) ;
      for (s = 0, c = ""; s < l; s++) c += Pi.charAt(p[s]);
      if (g) {
        if (l > 1) if (t == 16 || t == 8) {
          for (s = t == 16 ? 4 : 3, --l; l % s; l++) c += "0";
          for (p = en(c, i, t), l = p.length; !p[l - 1]; --l) ;
          for (s = 1, c = "1."; s < l; s++) c += Pi.charAt(p[s]);
        } else c = c.charAt(0) + "." + c.slice(1);
        c = c + (o < 0 ? "p" : "p+") + o;
      } else if (o < 0) {
        for (; ++o; ) c = "0" + c;
        c = "0." + c;
      } else if (++o > l) for (o -= l; o--; ) c += "0";
      else o < l && (c = c.slice(0, o) + "." + c.slice(o));
    }
    c = (t == 16 ? "0x" : t == 2 ? "0b" : t == 8 ? "0o" : "") + c;
  }
  return e10.s < 0 ? "-" + c : c;
}
function Es(e10, t) {
  if (e10.length > t) return e10.length = t, true;
}
function Cc(e10) {
  return new this(e10).abs();
}
function Sc(e10) {
  return new this(e10).acos();
}
function Ac(e10) {
  return new this(e10).acosh();
}
function Ic(e10, t) {
  return new this(e10).plus(t);
}
function Oc(e10) {
  return new this(e10).asin();
}
function kc(e10) {
  return new this(e10).asinh();
}
function Dc(e10) {
  return new this(e10).atan();
}
function _c(e10) {
  return new this(e10).atanh();
}
function Fc(e10, t) {
  e10 = new this(e10), t = new this(t);
  var r, n = this.precision, i = this.rounding, o = n + 4;
  return !e10.s || !t.s ? r = new this(NaN) : !e10.d && !t.d ? (r = fe(this, o, 1).times(t.s > 0 ? 0.25 : 0.75), r.s = e10.s) : !t.d || e10.isZero() ? (r = t.s < 0 ? fe(this, n, i) : new this(0), r.s = e10.s) : !e10.d || t.isZero() ? (r = fe(this, o, 1).times(0.5), r.s = e10.s) : t.s < 0 ? (this.precision = o, this.rounding = 1, r = this.atan(N(e10, t, o, 1)), t = fe(this, o, 1), this.precision = n, this.rounding = i, r = e10.s < 0 ? r.minus(t) : r.plus(t)) : r = this.atan(N(e10, t, o, 1)), r;
}
function Lc(e10) {
  return new this(e10).cbrt();
}
function Nc(e10) {
  return y(e10 = new this(e10), e10.e + 1, 2);
}
function Mc(e10, t, r) {
  return new this(e10).clamp(t, r);
}
function $c(e10) {
  if (!e10 || typeof e10 != "object") throw Error(on + "Object expected");
  var t, r, n, i = e10.defaults === true, o = ["precision", 1, ze, "rounding", 0, 8, "toExpNeg", -bt, 0, "toExpPos", 0, bt, "maxE", 0, bt, "minE", -bt, 0, "modulo", 0, 9];
  for (t = 0; t < o.length; t += 3) if (r = o[t], i && (this[r] = vi[r]), (n = e10[r]) !== void 0) if (ee(n) === n && n >= o[t + 1] && n <= o[t + 2]) this[r] = n;
  else throw Error(Ke + r + ": " + n);
  if (r = "crypto", i && (this[r] = vi[r]), (n = e10[r]) !== void 0) if (n === true || n === false || n === 0 || n === 1) if (n) if (typeof crypto < "u" && crypto && (crypto.getRandomValues || crypto.randomBytes)) this[r] = true;
  else throw Error(vs);
  else this[r] = false;
  else throw Error(Ke + r + ": " + n);
  return this;
}
function qc(e10) {
  return new this(e10).cos();
}
function jc(e10) {
  return new this(e10).cosh();
}
function ks(e10) {
  var t, r, n;
  function i(o) {
    var s, a, l, u = this;
    if (!(u instanceof i)) return new i(o);
    if (u.constructor = i, ws(o)) {
      u.s = o.s, x ? !o.d || o.e > i.maxE ? (u.e = NaN, u.d = null) : o.e < i.minE ? (u.e = 0, u.d = [0]) : (u.e = o.e, u.d = o.d.slice()) : (u.e = o.e, u.d = o.d ? o.d.slice() : o.d);
      return;
    }
    if (l = typeof o, l === "number") {
      if (o === 0) {
        u.s = 1 / o < 0 ? -1 : 1, u.e = 0, u.d = [0];
        return;
      }
      if (o < 0 ? (o = -o, u.s = -1) : u.s = 1, o === ~~o && o < 1e7) {
        for (s = 0, a = o; a >= 10; a /= 10) s++;
        x ? s > i.maxE ? (u.e = NaN, u.d = null) : s < i.minE ? (u.e = 0, u.d = [0]) : (u.e = s, u.d = [o]) : (u.e = s, u.d = [o]);
        return;
      } else if (o * 0 !== 0) {
        o || (u.s = NaN), u.e = NaN, u.d = null;
        return;
      }
      return Ci(u, o.toString());
    } else if (l !== "string") throw Error(Ke + o);
    return (a = o.charCodeAt(0)) === 45 ? (o = o.slice(1), u.s = -1) : (a === 43 && (o = o.slice(1)), u.s = 1), Rs.test(o) ? Ci(u, o) : Tc(u, o);
  }
  if (i.prototype = m, i.ROUND_UP = 0, i.ROUND_DOWN = 1, i.ROUND_CEIL = 2, i.ROUND_FLOOR = 3, i.ROUND_HALF_UP = 4, i.ROUND_HALF_DOWN = 5, i.ROUND_HALF_EVEN = 6, i.ROUND_HALF_CEIL = 7, i.ROUND_HALF_FLOOR = 8, i.EUCLID = 9, i.config = i.set = $c, i.clone = ks, i.isDecimal = ws, i.abs = Cc, i.acos = Sc, i.acosh = Ac, i.add = Ic, i.asin = Oc, i.asinh = kc, i.atan = Dc, i.atanh = _c, i.atan2 = Fc, i.cbrt = Lc, i.ceil = Nc, i.clamp = Mc, i.cos = qc, i.cosh = jc, i.div = Vc, i.exp = Bc, i.floor = Uc, i.hypot = Gc, i.ln = Qc, i.log = Jc, i.log10 = Hc, i.log2 = Wc, i.max = Kc, i.min = zc, i.mod = Yc, i.mul = Zc, i.pow = Xc, i.random = ep, i.round = tp, i.sign = rp, i.sin = np, i.sinh = ip, i.sqrt = op, i.sub = sp, i.sum = ap, i.tan = lp, i.tanh = up, i.trunc = cp, e10 === void 0 && (e10 = {}), e10 && e10.defaults !== true) for (n = ["precision", "rounding", "toExpNeg", "toExpPos", "maxE", "minE", "modulo", "crypto"], t = 0; t < n.length; ) e10.hasOwnProperty(r = n[t++]) || (e10[r] = this[r]);
  return i.config(e10), i;
}
function Vc(e10, t) {
  return new this(e10).div(t);
}
function Bc(e10) {
  return new this(e10).exp();
}
function Uc(e10) {
  return y(e10 = new this(e10), e10.e + 1, 3);
}
function Gc() {
  var e10, t, r = new this(0);
  for (x = false, e10 = 0; e10 < arguments.length; ) if (t = new this(arguments[e10++]), t.d) r.d && (r = r.plus(t.times(t)));
  else {
    if (t.s) return x = true, new this(1 / 0);
    r = t;
  }
  return x = true, r.sqrt();
}
function ws(e10) {
  return e10 instanceof it || e10 && e10.toStringTag === Ts || false;
}
function Qc(e10) {
  return new this(e10).ln();
}
function Jc(e10, t) {
  return new this(e10).log(t);
}
function Wc(e10) {
  return new this(e10).log(2);
}
function Hc(e10) {
  return new this(e10).log(10);
}
function Kc() {
  return As(this, arguments, "lt");
}
function zc() {
  return As(this, arguments, "gt");
}
function Yc(e10, t) {
  return new this(e10).mod(t);
}
function Zc(e10, t) {
  return new this(e10).mul(t);
}
function Xc(e10, t) {
  return new this(e10).pow(t);
}
function ep(e10) {
  var t, r, n, i, o = 0, s = new this(1), a = [];
  if (e10 === void 0 ? e10 = this.precision : ie(e10, 1, ze), n = Math.ceil(e10 / b), this.crypto) if (crypto.getRandomValues) for (t = crypto.getRandomValues(new Uint32Array(n)); o < n; ) i = t[o], i >= 429e7 ? t[o] = crypto.getRandomValues(new Uint32Array(1))[0] : a[o++] = i % 1e7;
  else if (crypto.randomBytes) {
    for (t = crypto.randomBytes(n *= 4); o < n; ) i = t[o] + (t[o + 1] << 8) + (t[o + 2] << 16) + ((t[o + 3] & 127) << 24), i >= 214e7 ? crypto.randomBytes(4).copy(t, o) : (a.push(i % 1e7), o += 4);
    o = n / 4;
  } else throw Error(vs);
  else for (; o < n; ) a[o++] = Math.random() * 1e7 | 0;
  for (n = a[--o], e10 %= b, n && e10 && (i = G(10, b - e10), a[o] = (n / i | 0) * i); a[o] === 0; o--) a.pop();
  if (o < 0) r = 0, a = [0];
  else {
    for (r = -1; a[0] === 0; r -= b) a.shift();
    for (n = 1, i = a[0]; i >= 10; i /= 10) n++;
    n < b && (r -= b - n);
  }
  return s.e = r, s.d = a, s;
}
function tp(e10) {
  return y(e10 = new this(e10), e10.e + 1, this.rounding);
}
function rp(e10) {
  return e10 = new this(e10), e10.d ? e10.d[0] ? e10.s : 0 * e10.s : e10.s || NaN;
}
function np(e10) {
  return new this(e10).sin();
}
function ip(e10) {
  return new this(e10).sinh();
}
function op(e10) {
  return new this(e10).sqrt();
}
function sp(e10, t) {
  return new this(e10).sub(t);
}
function ap() {
  var e10 = 0, t = arguments, r = new this(t[e10]);
  for (x = false; r.s && ++e10 < t.length; ) r = r.plus(t[e10]);
  return x = true, y(r, this.precision, this.rounding);
}
function lp(e10) {
  return new this(e10).tan();
}
function up(e10) {
  return new this(e10).tanh();
}
function cp(e10) {
  return y(e10 = new this(e10), e10.e + 1, 1);
}
m[Symbol.for("nodejs.util.inspect.custom")] = m.toString;
m[Symbol.toStringTag] = "Decimal";
var it = m.constructor = ks(vi);
tn = new it(tn);
rn = new it(rn);
var xe = it;
function wt(e10) {
  return e10 === null ? e10 : Array.isArray(e10) ? e10.map(wt) : typeof e10 == "object" ? pp(e10) ? dp(e10) : yt(e10, wt) : e10;
}
function pp(e10) {
  return e10 !== null && typeof e10 == "object" && typeof e10.$type == "string";
}
function dp({ $type: e10, value: t }) {
  switch (e10) {
    case "BigInt":
      return BigInt(t);
    case "Bytes":
      return Buffer.from(t, "base64");
    case "DateTime":
      return new Date(t);
    case "Decimal":
      return new xe(t);
    case "Json":
      return JSON.parse(t);
    default:
      Fe(t, "Unknown tagged value");
  }
}
function xt(e10) {
  return e10.substring(0, 1).toLowerCase() + e10.substring(1);
}
function Pt(e10) {
  return e10 instanceof Date || Object.prototype.toString.call(e10) === "[object Date]";
}
function ln(e10) {
  return e10.toString() !== "Invalid Date";
}
function vt(e10) {
  return it.isDecimal(e10) ? true : e10 !== null && typeof e10 == "object" && typeof e10.s == "number" && typeof e10.e == "number" && typeof e10.toFixed == "function" && Array.isArray(e10.d);
}
var Ms = k(fi());
var Ns = k(fs$3);
var Ds = { keyword: De, entity: De, value: (e10) => H(rt(e10)), punctuation: rt, directive: De, function: De, variable: (e10) => H(rt(e10)), string: (e10) => H(qe(e10)), boolean: ke, number: De, comment: Gt };
var mp = (e10) => e10, un = {}, fp = 0, P = { manual: un.Prism && un.Prism.manual, disableWorkerMessageHandler: un.Prism && un.Prism.disableWorkerMessageHandler, util: { encode: function(e10) {
  if (e10 instanceof he) {
    let t = e10;
    return new he(t.type, P.util.encode(t.content), t.alias);
  } else return Array.isArray(e10) ? e10.map(P.util.encode) : e10.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\u00a0/g, " ");
}, type: function(e10) {
  return Object.prototype.toString.call(e10).slice(8, -1);
}, objId: function(e10) {
  return e10.__id || Object.defineProperty(e10, "__id", { value: ++fp }), e10.__id;
}, clone: function e3(t, r) {
  let n, i, o = P.util.type(t);
  switch (r = r || {}, o) {
    case "Object":
      if (i = P.util.objId(t), r[i]) return r[i];
      n = {}, r[i] = n;
      for (let s in t) t.hasOwnProperty(s) && (n[s] = e3(t[s], r));
      return n;
    case "Array":
      return i = P.util.objId(t), r[i] ? r[i] : (n = [], r[i] = n, t.forEach(function(s, a) {
        n[a] = e3(s, r);
      }), n);
    default:
      return t;
  }
} }, languages: { extend: function(e10, t) {
  let r = P.util.clone(P.languages[e10]);
  for (let n in t) r[n] = t[n];
  return r;
}, insertBefore: function(e10, t, r, n) {
  n = n || P.languages;
  let i = n[e10], o = {};
  for (let a in i) if (i.hasOwnProperty(a)) {
    if (a == t) for (let l in r) r.hasOwnProperty(l) && (o[l] = r[l]);
    r.hasOwnProperty(a) || (o[a] = i[a]);
  }
  let s = n[e10];
  return n[e10] = o, P.languages.DFS(P.languages, function(a, l) {
    l === s && a != e10 && (this[a] = o);
  }), o;
}, DFS: function e4(t, r, n, i) {
  i = i || {};
  let o = P.util.objId;
  for (let s in t) if (t.hasOwnProperty(s)) {
    r.call(t, s, t[s], n || s);
    let a = t[s], l = P.util.type(a);
    l === "Object" && !i[o(a)] ? (i[o(a)] = true, e4(a, r, null, i)) : l === "Array" && !i[o(a)] && (i[o(a)] = true, e4(a, r, s, i));
  }
} }, plugins: {}, highlight: function(e10, t, r) {
  let n = { code: e10, grammar: t, language: r };
  return P.hooks.run("before-tokenize", n), n.tokens = P.tokenize(n.code, n.grammar), P.hooks.run("after-tokenize", n), he.stringify(P.util.encode(n.tokens), n.language);
}, matchGrammar: function(e10, t, r, n, i, o, s) {
  for (let h in r) {
    if (!r.hasOwnProperty(h) || !r[h]) continue;
    if (h == s) return;
    let O = r[h];
    O = P.util.type(O) === "Array" ? O : [O];
    for (let T = 0; T < O.length; ++T) {
      let S = O[T], C = S.inside, E = !!S.lookbehind, me = !!S.greedy, ae = 0, Bt = S.alias;
      if (me && !S.pattern.global) {
        let U = S.pattern.toString().match(/[imuy]*$/)[0];
        S.pattern = RegExp(S.pattern.source, U + "g");
      }
      S = S.pattern || S;
      for (let U = n, ne = i; U < t.length; ne += t[U].length, ++U) {
        let Ie = t[U];
        if (t.length > e10.length) return;
        if (Ie instanceof he) continue;
        if (me && U != t.length - 1) {
          S.lastIndex = ne;
          var p = S.exec(e10);
          if (!p) break;
          var c = p.index + (E ? p[1].length : 0), d = p.index + p[0].length, a = U, l = ne;
          for (let _ = t.length; a < _ && (l < d || !t[a].type && !t[a - 1].greedy); ++a) l += t[a].length, c >= l && (++U, ne = l);
          if (t[U] instanceof he) continue;
          u = a - U, Ie = e10.slice(ne, l), p.index -= ne;
        } else {
          S.lastIndex = 0;
          var p = S.exec(Ie), u = 1;
        }
        if (!p) {
          if (o) break;
          continue;
        }
        E && (ae = p[1] ? p[1].length : 0);
        var c = p.index + ae, p = p[0].slice(ae), d = c + p.length, f = Ie.slice(0, c), g = Ie.slice(d);
        let z = [U, u];
        f && (++U, ne += f.length, z.push(f));
        let dt = new he(h, C ? P.tokenize(p, C) : p, Bt, p, me);
        if (z.push(dt), g && z.push(g), Array.prototype.splice.apply(t, z), u != 1 && P.matchGrammar(e10, t, r, U, ne, true, h), o) break;
      }
    }
  }
}, tokenize: function(e10, t) {
  let r = [e10], n = t.rest;
  if (n) {
    for (let i in n) t[i] = n[i];
    delete t.rest;
  }
  return P.matchGrammar(e10, r, t, 0, 0, false), r;
}, hooks: { all: {}, add: function(e10, t) {
  let r = P.hooks.all;
  r[e10] = r[e10] || [], r[e10].push(t);
}, run: function(e10, t) {
  let r = P.hooks.all[e10];
  if (!(!r || !r.length)) for (var n = 0, i; i = r[n++]; ) i(t);
} }, Token: he };
P.languages.clike = { comment: [{ pattern: /(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/, lookbehind: true }, { pattern: /(^|[^\\:])\/\/.*/, lookbehind: true, greedy: true }], string: { pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/, greedy: true }, "class-name": { pattern: /((?:\b(?:class|interface|extends|implements|trait|instanceof|new)\s+)|(?:catch\s+\())[\w.\\]+/i, lookbehind: true, inside: { punctuation: /[.\\]/ } }, keyword: /\b(?:if|else|while|do|for|return|in|instanceof|function|new|try|throw|catch|finally|null|break|continue)\b/, boolean: /\b(?:true|false)\b/, function: /\w+(?=\()/, number: /\b0x[\da-f]+\b|(?:\b\d+\.?\d*|\B\.\d+)(?:e[+-]?\d+)?/i, operator: /--?|\+\+?|!=?=?|<=?|>=?|==?=?|&&?|\|\|?|\?|\*|\/|~|\^|%/, punctuation: /[{}[\];(),.:]/ };
P.languages.javascript = P.languages.extend("clike", { "class-name": [P.languages.clike["class-name"], { pattern: /(^|[^$\w\xA0-\uFFFF])[_$A-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\.(?:prototype|constructor))/, lookbehind: true }], keyword: [{ pattern: /((?:^|})\s*)(?:catch|finally)\b/, lookbehind: true }, { pattern: /(^|[^.])\b(?:as|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/, lookbehind: true }], number: /\b(?:(?:0[xX](?:[\dA-Fa-f](?:_[\dA-Fa-f])?)+|0[bB](?:[01](?:_[01])?)+|0[oO](?:[0-7](?:_[0-7])?)+)n?|(?:\d(?:_\d)?)+n|NaN|Infinity)\b|(?:\b(?:\d(?:_\d)?)+\.?(?:\d(?:_\d)?)*|\B\.(?:\d(?:_\d)?)+)(?:[Ee][+-]?(?:\d(?:_\d)?)+)?/, function: /[_$a-zA-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/, operator: /-[-=]?|\+[+=]?|!=?=?|<<?=?|>>?>?=?|=(?:==?|>)?|&[&=]?|\|[|=]?|\*\*?=?|\/=?|~|\^=?|%=?|\?|\.{3}/ });
P.languages.javascript["class-name"][0].pattern = /(\b(?:class|interface|extends|implements|instanceof|new)\s+)[\w.\\]+/;
P.languages.insertBefore("javascript", "keyword", { regex: { pattern: /((?:^|[^$\w\xA0-\uFFFF."'\])\s])\s*)\/(\[(?:[^\]\\\r\n]|\\.)*]|\\.|[^/\\\[\r\n])+\/[gimyus]{0,6}(?=\s*($|[\r\n,.;})\]]))/, lookbehind: true, greedy: true }, "function-variable": { pattern: /[_$a-zA-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|[_$a-zA-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*)\s*=>))/, alias: "function" }, parameter: [{ pattern: /(function(?:\s+[_$A-Za-z\xA0-\uFFFF][$\w\xA0-\uFFFF]*)?\s*\(\s*)(?!\s)(?:[^()]|\([^()]*\))+?(?=\s*\))/, lookbehind: true, inside: P.languages.javascript }, { pattern: /[_$a-z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\s*=>)/i, inside: P.languages.javascript }, { pattern: /(\(\s*)(?!\s)(?:[^()]|\([^()]*\))+?(?=\s*\)\s*=>)/, lookbehind: true, inside: P.languages.javascript }, { pattern: /((?:\b|\s|^)(?!(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)(?![$\w\xA0-\uFFFF]))(?:[_$A-Za-z\xA0-\uFFFF][$\w\xA0-\uFFFF]*\s*)\(\s*)(?!\s)(?:[^()]|\([^()]*\))+?(?=\s*\)\s*\{)/, lookbehind: true, inside: P.languages.javascript }], constant: /\b[A-Z](?:[A-Z_]|\dx?)*\b/ });
P.languages.markup && P.languages.markup.tag.addInlined("script", "javascript");
P.languages.js = P.languages.javascript;
P.languages.typescript = P.languages.extend("javascript", { keyword: /\b(?:abstract|as|async|await|break|case|catch|class|const|constructor|continue|debugger|declare|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|is|keyof|let|module|namespace|new|null|of|package|private|protected|public|readonly|return|require|set|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield)\b/, builtin: /\b(?:string|Function|any|number|boolean|Array|symbol|console|Promise|unknown|never)\b/ });
P.languages.ts = P.languages.typescript;
function he(e10, t, r, n, i) {
  this.type = e10, this.content = t, this.alias = r, this.length = (n || "").length | 0, this.greedy = !!i;
}
he.stringify = function(e10, t) {
  return typeof e10 == "string" ? e10 : Array.isArray(e10) ? e10.map(function(r) {
    return he.stringify(r, t);
  }).join("") : gp(e10.type)(e10.content);
};
function gp(e10) {
  return Ds[e10] || mp;
}
function _s(e10) {
  return hp(e10, P.languages.javascript);
}
function hp(e10, t) {
  return P.tokenize(e10, t).map((n) => he.stringify(n)).join("");
}
var Fs = k(us());
function Ls(e10) {
  return (0, Fs.default)(e10);
}
var cn = class e5 {
  static read(t) {
    let r;
    try {
      r = Ns.default.readFileSync(t, "utf-8");
    } catch {
      return null;
    }
    return e5.fromContent(r);
  }
  static fromContent(t) {
    let r = t.split(/\r?\n/);
    return new e5(1, r);
  }
  constructor(t, r) {
    this.firstLineNumber = t, this.lines = r;
  }
  get lastLineNumber() {
    return this.firstLineNumber + this.lines.length - 1;
  }
  mapLineAt(t, r) {
    if (t < this.firstLineNumber || t > this.lines.length + this.firstLineNumber) return this;
    let n = t - this.firstLineNumber, i = [...this.lines];
    return i[n] = r(i[n]), new e5(this.firstLineNumber, i);
  }
  mapLines(t) {
    return new e5(this.firstLineNumber, this.lines.map((r, n) => t(r, this.firstLineNumber + n)));
  }
  lineAt(t) {
    return this.lines[t - this.firstLineNumber];
  }
  prependSymbolAt(t, r) {
    return this.mapLines((n, i) => i === t ? `${r} ${n}` : `  ${n}`);
  }
  slice(t, r) {
    let n = this.lines.slice(t - 1, r).join(`
`);
    return new e5(t, Ls(n).split(`
`));
  }
  highlight() {
    let t = _s(this.toString());
    return new e5(this.firstLineNumber, t.split(`
`));
  }
  toString() {
    return this.lines.join(`
`);
  }
};
var yp = { red: ce, gray: Gt, dim: Oe, bold: H, underline: X, highlightSource: (e10) => e10.highlight() }, bp = { red: (e10) => e10, gray: (e10) => e10, dim: (e10) => e10, bold: (e10) => e10, underline: (e10) => e10, highlightSource: (e10) => e10 };
function Ep({ message: e10, originalMethod: t, isPanic: r, callArguments: n }) {
  return { functionName: `prisma.${t}()`, message: e10, isPanic: r ?? false, callArguments: n };
}
function wp({ callsite: e10, message: t, originalMethod: r, isPanic: n, callArguments: i }, o) {
  var _a2;
  let s = Ep({ message: t, originalMethod: r, isPanic: n, callArguments: i });
  if (!e10 || typeof window < "u" || process.env.NODE_ENV === "production") return s;
  let a = e10.getLocation();
  if (!a || !a.lineNumber || !a.columnNumber) return s;
  let l = Math.max(1, a.lineNumber - 3), u = (_a2 = cn.read(a.fileName)) == null ? void 0 : _a2.slice(l, a.lineNumber), c = u == null ? void 0 : u.lineAt(a.lineNumber);
  if (u && c) {
    let p = Pp(c), d = xp(c);
    if (!d) return s;
    s.functionName = `${d.code})`, s.location = a, n || (u = u.mapLineAt(a.lineNumber, (g) => g.slice(0, d.openingBraceIndex))), u = o.highlightSource(u);
    let f = String(u.lastLineNumber).length;
    if (s.contextLines = u.mapLines((g, h) => o.gray(String(h).padStart(f)) + " " + g).mapLines((g) => o.dim(g)).prependSymbolAt(a.lineNumber, o.bold(o.red("→"))), i) {
      let g = p + f + 1;
      g += 2, s.callArguments = (0, Ms.default)(i, g).slice(g);
    }
  }
  return s;
}
function xp(e10) {
  let t = Object.keys(Je.ModelAction).join("|"), n = new RegExp(String.raw`\.(${t})\(`).exec(e10);
  if (n) {
    let i = n.index + n[0].length, o = e10.lastIndexOf(" ", n.index) + 1;
    return { code: e10.slice(o, i), openingBraceIndex: i };
  }
  return null;
}
function Pp(e10) {
  let t = 0;
  for (let r = 0; r < e10.length; r++) {
    if (e10.charAt(r) !== " ") return t;
    t++;
  }
  return t;
}
function vp({ functionName: e10, location: t, message: r, isPanic: n, contextLines: i, callArguments: o }, s) {
  let a = [""], l = t ? " in" : ":";
  if (n ? (a.push(s.red(`Oops, an unknown error occurred! This is ${s.bold("on us")}, you did nothing wrong.`)), a.push(s.red(`It occurred in the ${s.bold(`\`${e10}\``)} invocation${l}`))) : a.push(s.red(`Invalid ${s.bold(`\`${e10}\``)} invocation${l}`)), t && a.push(s.underline(Tp(t))), i) {
    a.push("");
    let u = [i.toString()];
    o && (u.push(o), u.push(s.dim(")"))), a.push(u.join("")), o && a.push("");
  } else a.push(""), o && a.push(o), a.push("");
  return a.push(r), a.join(`
`);
}
function Tp(e10) {
  let t = [e10.fileName];
  return e10.lineNumber && t.push(String(e10.lineNumber)), e10.columnNumber && t.push(String(e10.columnNumber)), t.join(":");
}
function Tt(e10) {
  let t = e10.showColors ? yp : bp, r;
  return r = wp(e10, t), vp(r, t);
}
var Gs = k(Ai());
function Vs(e10, t, r) {
  let n = Bs(e10), i = Rp(n), o = Sp(i);
  o ? pn(o, t, r) : t.addErrorMessage(() => "Unknown error");
}
function Bs(e10) {
  return e10.errors.flatMap((t) => t.kind === "Union" ? Bs(t) : [t]);
}
function Rp(e10) {
  let t = /* @__PURE__ */ new Map(), r = [];
  for (let n of e10) {
    if (n.kind !== "InvalidArgumentType") {
      r.push(n);
      continue;
    }
    let i = `${n.selectionPath.join(".")}:${n.argumentPath.join(".")}`, o = t.get(i);
    o ? t.set(i, { ...n, argument: { ...n.argument, typeNames: Cp(o.argument.typeNames, n.argument.typeNames) } }) : t.set(i, n);
  }
  return r.push(...t.values()), r;
}
function Cp(e10, t) {
  return [...new Set(e10.concat(t))];
}
function Sp(e10) {
  return xi(e10, (t, r) => {
    let n = qs(t), i = qs(r);
    return n !== i ? n - i : js(t) - js(r);
  });
}
function qs(e10) {
  let t = 0;
  return Array.isArray(e10.selectionPath) && (t += e10.selectionPath.length), Array.isArray(e10.argumentPath) && (t += e10.argumentPath.length), t;
}
function js(e10) {
  switch (e10.kind) {
    case "InvalidArgumentValue":
    case "ValueTooLarge":
      return 20;
    case "InvalidArgumentType":
      return 10;
    case "RequiredArgumentMissing":
      return -10;
    default:
      return 0;
  }
}
var ue = class {
  constructor(t, r) {
    this.name = t;
    this.value = r;
    this.isRequired = false;
  }
  makeRequired() {
    return this.isRequired = true, this;
  }
  write(t) {
    let { colors: { green: r } } = t.context;
    t.addMarginSymbol(r(this.isRequired ? "+" : "?")), t.write(r(this.name)), this.isRequired || t.write(r("?")), t.write(r(": ")), typeof this.value == "string" ? t.write(r(this.value)) : t.write(this.value);
  }
};
var Rt = class {
  constructor(t = 0, r) {
    this.context = r;
    this.lines = [];
    this.currentLine = "";
    this.currentIndent = 0;
    this.currentIndent = t;
  }
  write(t) {
    return typeof t == "string" ? this.currentLine += t : t.write(this), this;
  }
  writeJoined(t, r, n = (i, o) => o.write(i)) {
    let i = r.length - 1;
    for (let o = 0; o < r.length; o++) n(r[o], this), o !== i && this.write(t);
    return this;
  }
  writeLine(t) {
    return this.write(t).newLine();
  }
  newLine() {
    this.lines.push(this.indentedCurrentLine()), this.currentLine = "", this.marginSymbol = void 0;
    let t = this.afterNextNewLineCallback;
    return this.afterNextNewLineCallback = void 0, t == null ? void 0 : t(), this;
  }
  withIndent(t) {
    return this.indent(), t(this), this.unindent(), this;
  }
  afterNextNewline(t) {
    return this.afterNextNewLineCallback = t, this;
  }
  indent() {
    return this.currentIndent++, this;
  }
  unindent() {
    return this.currentIndent > 0 && this.currentIndent--, this;
  }
  addMarginSymbol(t) {
    return this.marginSymbol = t, this;
  }
  toString() {
    return this.lines.concat(this.indentedCurrentLine()).join(`
`);
  }
  getCurrentLineLength() {
    return this.currentLine.length;
  }
  indentedCurrentLine() {
    let t = this.currentLine.padStart(this.currentLine.length + 2 * this.currentIndent);
    return this.marginSymbol ? this.marginSymbol + t.slice(1) : t;
  }
};
var dn = class {
  constructor(t) {
    this.value = t;
  }
  write(t) {
    t.write(this.value);
  }
  markAsError() {
    this.value.markAsError();
  }
};
var mn = (e10) => e10, fn = { bold: mn, red: mn, green: mn, dim: mn, enabled: false }, Us = { bold: H, red: ce, green: qe, dim: Oe, enabled: true }, Ct = { write(e10) {
  e10.writeLine(",");
} };
var Pe = class {
  constructor(t) {
    this.contents = t;
    this.isUnderlined = false;
    this.color = (t2) => t2;
  }
  underline() {
    return this.isUnderlined = true, this;
  }
  setColor(t) {
    return this.color = t, this;
  }
  write(t) {
    let r = t.getCurrentLineLength();
    t.write(this.color(this.contents)), this.isUnderlined && t.afterNextNewline(() => {
      t.write(" ".repeat(r)).writeLine(this.color("~".repeat(this.contents.length)));
    });
  }
};
var Ye = class {
  constructor() {
    this.hasError = false;
  }
  markAsError() {
    return this.hasError = true, this;
  }
};
var St = class extends Ye {
  constructor() {
    super(...arguments);
    this.items = [];
  }
  addItem(r) {
    return this.items.push(new dn(r)), this;
  }
  getField(r) {
    return this.items[r];
  }
  getPrintWidth() {
    return this.items.length === 0 ? 2 : Math.max(...this.items.map((n) => n.value.getPrintWidth())) + 2;
  }
  write(r) {
    if (this.items.length === 0) {
      this.writeEmpty(r);
      return;
    }
    this.writeWithItems(r);
  }
  writeEmpty(r) {
    let n = new Pe("[]");
    this.hasError && n.setColor(r.context.colors.red).underline(), r.write(n);
  }
  writeWithItems(r) {
    let { colors: n } = r.context;
    r.writeLine("[").withIndent(() => r.writeJoined(Ct, this.items).newLine()).write("]"), this.hasError && r.afterNextNewline(() => {
      r.writeLine(n.red("~".repeat(this.getPrintWidth())));
    });
  }
  asObject() {
  }
};
var At = class e6 extends Ye {
  constructor() {
    super(...arguments);
    this.fields = {};
    this.suggestions = [];
  }
  addField(r) {
    this.fields[r.name] = r;
  }
  addSuggestion(r) {
    this.suggestions.push(r);
  }
  getField(r) {
    return this.fields[r];
  }
  getDeepField(r) {
    let [n, ...i] = r, o = this.getField(n);
    if (!o) return;
    let s = o;
    for (let a of i) {
      let l;
      if (s.value instanceof e6 ? l = s.value.getField(a) : s.value instanceof St && (l = s.value.getField(Number(a))), !l) return;
      s = l;
    }
    return s;
  }
  getDeepFieldValue(r) {
    var _a2;
    return r.length === 0 ? this : (_a2 = this.getDeepField(r)) == null ? void 0 : _a2.value;
  }
  hasField(r) {
    return !!this.getField(r);
  }
  removeAllFields() {
    this.fields = {};
  }
  removeField(r) {
    delete this.fields[r];
  }
  getFields() {
    return this.fields;
  }
  isEmpty() {
    return Object.keys(this.fields).length === 0;
  }
  getFieldValue(r) {
    var _a2;
    return (_a2 = this.getField(r)) == null ? void 0 : _a2.value;
  }
  getDeepSubSelectionValue(r) {
    let n = this;
    for (let i of r) {
      if (!(n instanceof e6)) return;
      let o = n.getSubSelectionValue(i);
      if (!o) return;
      n = o;
    }
    return n;
  }
  getDeepSelectionParent(r) {
    let n = this.getSelectionParent();
    if (!n) return;
    let i = n;
    for (let o of r) {
      let s = i.value.getFieldValue(o);
      if (!s || !(s instanceof e6)) return;
      let a = s.getSelectionParent();
      if (!a) return;
      i = a;
    }
    return i;
  }
  getSelectionParent() {
    var _a2, _b;
    let r = (_a2 = this.getField("select")) == null ? void 0 : _a2.value.asObject();
    if (r) return { kind: "select", value: r };
    let n = (_b = this.getField("include")) == null ? void 0 : _b.value.asObject();
    if (n) return { kind: "include", value: n };
  }
  getSubSelectionValue(r) {
    var _a2;
    return (_a2 = this.getSelectionParent()) == null ? void 0 : _a2.value.fields[r].value;
  }
  getPrintWidth() {
    let r = Object.values(this.fields);
    return r.length == 0 ? 2 : Math.max(...r.map((i) => i.getPrintWidth())) + 2;
  }
  write(r) {
    let n = Object.values(this.fields);
    if (n.length === 0 && this.suggestions.length === 0) {
      this.writeEmpty(r);
      return;
    }
    this.writeWithContents(r, n);
  }
  asObject() {
    return this;
  }
  writeEmpty(r) {
    let n = new Pe("{}");
    this.hasError && n.setColor(r.context.colors.red).underline(), r.write(n);
  }
  writeWithContents(r, n) {
    r.writeLine("{").withIndent(() => {
      r.writeJoined(Ct, [...n, ...this.suggestions]).newLine();
    }), r.write("}"), this.hasError && r.afterNextNewline(() => {
      r.writeLine(r.context.colors.red("~".repeat(this.getPrintWidth())));
    });
  }
};
var W = class extends Ye {
  constructor(r) {
    super();
    this.text = r;
  }
  getPrintWidth() {
    return this.text.length;
  }
  write(r) {
    let n = new Pe(this.text);
    this.hasError && n.underline().setColor(r.context.colors.red), r.write(n);
  }
  asObject() {
  }
};
var nr = class {
  constructor() {
    this.fields = [];
  }
  addField(t, r) {
    return this.fields.push({ write(n) {
      let { green: i, dim: o } = n.context.colors;
      n.write(i(o(`${t}: ${r}`))).addMarginSymbol(i(o("+")));
    } }), this;
  }
  write(t) {
    let { colors: { green: r } } = t.context;
    t.writeLine(r("{")).withIndent(() => {
      t.writeJoined(Ct, this.fields).newLine();
    }).write(r("}")).addMarginSymbol(r("+"));
  }
};
function pn(e10, t, r) {
  switch (e10.kind) {
    case "MutuallyExclusiveFields":
      Ip(e10, t);
      break;
    case "IncludeOnScalar":
      Op(e10, t);
      break;
    case "EmptySelection":
      kp(e10, t, r);
      break;
    case "UnknownSelectionField":
      Lp(e10, t);
      break;
    case "InvalidSelectionValue":
      Np(e10, t);
      break;
    case "UnknownArgument":
      Mp(e10, t);
      break;
    case "UnknownInputField":
      $p(e10, t);
      break;
    case "RequiredArgumentMissing":
      qp(e10, t);
      break;
    case "InvalidArgumentType":
      jp(e10, t);
      break;
    case "InvalidArgumentValue":
      Vp(e10, t);
      break;
    case "ValueTooLarge":
      Bp(e10, t);
      break;
    case "SomeFieldsMissing":
      Up(e10, t);
      break;
    case "TooManyFieldsGiven":
      Gp(e10, t);
      break;
    case "Union":
      Vs(e10, t, r);
      break;
    default:
      throw new Error("not implemented: " + e10.kind);
  }
}
function Ip(e10, t) {
  var _a2, _b, _c2;
  let r = (_a2 = t.arguments.getDeepSubSelectionValue(e10.selectionPath)) == null ? void 0 : _a2.asObject();
  r && ((_b = r.getField(e10.firstField)) == null ? void 0 : _b.markAsError(), (_c2 = r.getField(e10.secondField)) == null ? void 0 : _c2.markAsError()), t.addErrorMessage((n) => `Please ${n.bold("either")} use ${n.green(`\`${e10.firstField}\``)} or ${n.green(`\`${e10.secondField}\``)}, but ${n.red("not both")} at the same time.`);
}
function Op(e10, t) {
  var _a2, _b;
  let [r, n] = ir(e10.selectionPath), i = e10.outputType, o = (_a2 = t.arguments.getDeepSelectionParent(r)) == null ? void 0 : _a2.value;
  if (o && ((_b = o.getField(n)) == null ? void 0 : _b.markAsError(), i)) for (let s of i.fields) s.isRelation && o.addSuggestion(new ue(s.name, "true"));
  t.addErrorMessage((s) => {
    let a = `Invalid scalar field ${s.red(`\`${n}\``)} for ${s.bold("include")} statement`;
    return i ? a += ` on model ${s.bold(i.name)}. ${or(s)}` : a += ".", a += `
Note that ${s.bold("include")} statements only accept relation fields.`, a;
  });
}
function kp(e10, t, r) {
  var _a2, _b;
  let n = (_a2 = t.arguments.getDeepSubSelectionValue(e10.selectionPath)) == null ? void 0 : _a2.asObject();
  if (n) {
    let i = (_b = n.getField("omit")) == null ? void 0 : _b.value.asObject();
    if (i) {
      Dp(e10, t, i);
      return;
    }
    if (n.hasField("select")) {
      _p(e10, t);
      return;
    }
  }
  if (r == null ? void 0 : r[xt(e10.outputType.name)]) {
    Fp(e10, t);
    return;
  }
  t.addErrorMessage(() => `Unknown field at "${e10.selectionPath.join(".")} selection"`);
}
function Dp(e10, t, r) {
  r.removeAllFields();
  for (let n of e10.outputType.fields) r.addSuggestion(new ue(n.name, "false"));
  t.addErrorMessage((n) => `The ${n.red("omit")} statement includes every field of the model ${n.bold(e10.outputType.name)}. At least one field must be included in the result`);
}
function _p(e10, t) {
  var _a2;
  let r = e10.outputType, n = (_a2 = t.arguments.getDeepSelectionParent(e10.selectionPath)) == null ? void 0 : _a2.value, i = (n == null ? void 0 : n.isEmpty()) ?? false;
  n && (n.removeAllFields(), Ws(n, r)), t.addErrorMessage((o) => i ? `The ${o.red("`select`")} statement for type ${o.bold(r.name)} must not be empty. ${or(o)}` : `The ${o.red("`select`")} statement for type ${o.bold(r.name)} needs ${o.bold("at least one truthy value")}.`);
}
function Fp(e10, t) {
  var _a2, _b;
  let r = new nr();
  for (let i of e10.outputType.fields) i.isRelation || r.addField(i.name, "false");
  let n = new ue("omit", r).makeRequired();
  if (e10.selectionPath.length === 0) t.arguments.addSuggestion(n);
  else {
    let [i, o] = ir(e10.selectionPath), a = (_b = (_a2 = t.arguments.getDeepSelectionParent(i)) == null ? void 0 : _a2.value.asObject()) == null ? void 0 : _b.getField(o);
    if (a) {
      let l = (a == null ? void 0 : a.value.asObject()) ?? new At();
      l.addSuggestion(n), a.value = l;
    }
  }
  t.addErrorMessage((i) => `The global ${i.red("omit")} configuration excludes every field of the model ${i.bold(e10.outputType.name)}. At least one field must be included in the result`);
}
function Lp(e10, t) {
  let r = Hs(e10.selectionPath, t);
  if (r.parentKind !== "unknown") {
    r.field.markAsError();
    let n = r.parent;
    switch (r.parentKind) {
      case "select":
        Ws(n, e10.outputType);
        break;
      case "include":
        Qp(n, e10.outputType);
        break;
      case "omit":
        Jp(n, e10.outputType);
        break;
    }
  }
  t.addErrorMessage((n) => {
    let i = [`Unknown field ${n.red(`\`${r.fieldName}\``)}`];
    return r.parentKind !== "unknown" && i.push(`for ${n.bold(r.parentKind)} statement`), i.push(`on model ${n.bold(`\`${e10.outputType.name}\``)}.`), i.push(or(n)), i.join(" ");
  });
}
function Np(e10, t) {
  let r = Hs(e10.selectionPath, t);
  r.parentKind !== "unknown" && r.field.value.markAsError(), t.addErrorMessage((n) => `Invalid value for selection field \`${n.red(r.fieldName)}\`: ${e10.underlyingError}`);
}
function Mp(e10, t) {
  var _a2, _b;
  let r = e10.argumentPath[0], n = (_a2 = t.arguments.getDeepSubSelectionValue(e10.selectionPath)) == null ? void 0 : _a2.asObject();
  n && ((_b = n.getField(r)) == null ? void 0 : _b.markAsError(), Wp(n, e10.arguments)), t.addErrorMessage((i) => Qs(i, r, e10.arguments.map((o) => o.name)));
}
function $p(e10, t) {
  var _a2, _b, _c2;
  let [r, n] = ir(e10.argumentPath), i = (_a2 = t.arguments.getDeepSubSelectionValue(e10.selectionPath)) == null ? void 0 : _a2.asObject();
  if (i) {
    (_b = i.getDeepField(e10.argumentPath)) == null ? void 0 : _b.markAsError();
    let o = (_c2 = i.getDeepFieldValue(r)) == null ? void 0 : _c2.asObject();
    o && Ks(o, e10.inputType);
  }
  t.addErrorMessage((o) => Qs(o, n, e10.inputType.fields.map((s) => s.name)));
}
function Qs(e10, t, r) {
  let n = [`Unknown argument \`${e10.red(t)}\`.`], i = Kp(t, r);
  return i && n.push(`Did you mean \`${e10.green(i)}\`?`), r.length > 0 && n.push(or(e10)), n.join(" ");
}
function qp(e10, t) {
  var _a2, _b;
  let r;
  t.addErrorMessage((l) => (r == null ? void 0 : r.value) instanceof W && r.value.text === "null" ? `Argument \`${l.green(o)}\` must not be ${l.red("null")}.` : `Argument \`${l.green(o)}\` is missing.`);
  let n = (_a2 = t.arguments.getDeepSubSelectionValue(e10.selectionPath)) == null ? void 0 : _a2.asObject();
  if (!n) return;
  let [i, o] = ir(e10.argumentPath), s = new nr(), a = (_b = n.getDeepFieldValue(i)) == null ? void 0 : _b.asObject();
  if (a) if (r = a.getField(o), r && a.removeField(o), e10.inputTypes.length === 1 && e10.inputTypes[0].kind === "object") {
    for (let l of e10.inputTypes[0].fields) s.addField(l.name, l.typeNames.join(" | "));
    a.addSuggestion(new ue(o, s).makeRequired());
  } else {
    let l = e10.inputTypes.map(Js).join(" | ");
    a.addSuggestion(new ue(o, l).makeRequired());
  }
}
function Js(e10) {
  return e10.kind === "list" ? `${Js(e10.elementType)}[]` : e10.name;
}
function jp(e10, t) {
  var _a2, _b;
  let r = e10.argument.name, n = (_a2 = t.arguments.getDeepSubSelectionValue(e10.selectionPath)) == null ? void 0 : _a2.asObject();
  n && ((_b = n.getDeepFieldValue(e10.argumentPath)) == null ? void 0 : _b.markAsError()), t.addErrorMessage((i) => {
    let o = gn("or", e10.argument.typeNames.map((s) => i.green(s)));
    return `Argument \`${i.bold(r)}\`: Invalid value provided. Expected ${o}, provided ${i.red(e10.inferredType)}.`;
  });
}
function Vp(e10, t) {
  var _a2, _b;
  let r = e10.argument.name, n = (_a2 = t.arguments.getDeepSubSelectionValue(e10.selectionPath)) == null ? void 0 : _a2.asObject();
  n && ((_b = n.getDeepFieldValue(e10.argumentPath)) == null ? void 0 : _b.markAsError()), t.addErrorMessage((i) => {
    let o = [`Invalid value for argument \`${i.bold(r)}\``];
    if (e10.underlyingError && o.push(`: ${e10.underlyingError}`), o.push("."), e10.argument.typeNames.length > 0) {
      let s = gn("or", e10.argument.typeNames.map((a) => i.green(a)));
      o.push(` Expected ${s}.`);
    }
    return o.join("");
  });
}
function Bp(e10, t) {
  var _a2, _b;
  let r = e10.argument.name, n = (_a2 = t.arguments.getDeepSubSelectionValue(e10.selectionPath)) == null ? void 0 : _a2.asObject(), i;
  if (n) {
    let s = (_b = n.getDeepField(e10.argumentPath)) == null ? void 0 : _b.value;
    s == null ? void 0 : s.markAsError(), s instanceof W && (i = s.text);
  }
  t.addErrorMessage((o) => {
    let s = ["Unable to fit value"];
    return i && s.push(o.red(i)), s.push(`into a 64-bit signed integer for field \`${o.bold(r)}\``), s.join(" ");
  });
}
function Up(e10, t) {
  var _a2, _b;
  let r = e10.argumentPath[e10.argumentPath.length - 1], n = (_a2 = t.arguments.getDeepSubSelectionValue(e10.selectionPath)) == null ? void 0 : _a2.asObject();
  if (n) {
    let i = (_b = n.getDeepFieldValue(e10.argumentPath)) == null ? void 0 : _b.asObject();
    i && Ks(i, e10.inputType);
  }
  t.addErrorMessage((i) => {
    let o = [`Argument \`${i.bold(r)}\` of type ${i.bold(e10.inputType.name)} needs`];
    return e10.constraints.minFieldCount === 1 ? e10.constraints.requiredFields ? o.push(`${i.green("at least one of")} ${gn("or", e10.constraints.requiredFields.map((s) => `\`${i.bold(s)}\``))} arguments.`) : o.push(`${i.green("at least one")} argument.`) : o.push(`${i.green(`at least ${e10.constraints.minFieldCount}`)} arguments.`), o.push(or(i)), o.join(" ");
  });
}
function Gp(e10, t) {
  var _a2, _b;
  let r = e10.argumentPath[e10.argumentPath.length - 1], n = (_a2 = t.arguments.getDeepSubSelectionValue(e10.selectionPath)) == null ? void 0 : _a2.asObject(), i = [];
  if (n) {
    let o = (_b = n.getDeepFieldValue(e10.argumentPath)) == null ? void 0 : _b.asObject();
    o && (o.markAsError(), i = Object.keys(o.getFields()));
  }
  t.addErrorMessage((o) => {
    let s = [`Argument \`${o.bold(r)}\` of type ${o.bold(e10.inputType.name)} needs`];
    return e10.constraints.minFieldCount === 1 && e10.constraints.maxFieldCount == 1 ? s.push(`${o.green("exactly one")} argument,`) : e10.constraints.maxFieldCount == 1 ? s.push(`${o.green("at most one")} argument,`) : s.push(`${o.green(`at most ${e10.constraints.maxFieldCount}`)} arguments,`), s.push(`but you provided ${gn("and", i.map((a) => o.red(a)))}. Please choose`), e10.constraints.maxFieldCount === 1 ? s.push("one.") : s.push(`${e10.constraints.maxFieldCount}.`), s.join(" ");
  });
}
function Ws(e10, t) {
  for (let r of t.fields) e10.hasField(r.name) || e10.addSuggestion(new ue(r.name, "true"));
}
function Qp(e10, t) {
  for (let r of t.fields) r.isRelation && !e10.hasField(r.name) && e10.addSuggestion(new ue(r.name, "true"));
}
function Jp(e10, t) {
  for (let r of t.fields) !e10.hasField(r.name) && !r.isRelation && e10.addSuggestion(new ue(r.name, "true"));
}
function Wp(e10, t) {
  for (let r of t) e10.hasField(r.name) || e10.addSuggestion(new ue(r.name, r.typeNames.join(" | ")));
}
function Hs(e10, t) {
  var _a2, _b, _c2, _d2;
  let [r, n] = ir(e10), i = (_a2 = t.arguments.getDeepSubSelectionValue(r)) == null ? void 0 : _a2.asObject();
  if (!i) return { parentKind: "unknown", fieldName: n };
  let o = (_b = i.getFieldValue("select")) == null ? void 0 : _b.asObject(), s = (_c2 = i.getFieldValue("include")) == null ? void 0 : _c2.asObject(), a = (_d2 = i.getFieldValue("omit")) == null ? void 0 : _d2.asObject(), l = o == null ? void 0 : o.getField(n);
  return o && l ? { parentKind: "select", parent: o, field: l, fieldName: n } : (l = s == null ? void 0 : s.getField(n), s && l ? { parentKind: "include", field: l, parent: s, fieldName: n } : (l = a == null ? void 0 : a.getField(n), a && l ? { parentKind: "omit", field: l, parent: a, fieldName: n } : { parentKind: "unknown", fieldName: n }));
}
function Ks(e10, t) {
  if (t.kind === "object") for (let r of t.fields) e10.hasField(r.name) || e10.addSuggestion(new ue(r.name, r.typeNames.join(" | ")));
}
function ir(e10) {
  let t = [...e10], r = t.pop();
  if (!r) throw new Error("unexpected empty path");
  return [t, r];
}
function or({ green: e10, enabled: t }) {
  return "Available options are " + (t ? `listed in ${e10("green")}` : "marked with ?") + ".";
}
function gn(e10, t) {
  if (t.length === 1) return t[0];
  let r = [...t], n = r.pop();
  return `${r.join(", ")} ${e10} ${n}`;
}
var Hp = 3;
function Kp(e10, t) {
  let r = 1 / 0, n;
  for (let i of t) {
    let o = (0, Gs.default)(e10, i);
    o > Hp || o < r && (r = o, n = i);
  }
  return n;
}
function zs(e10) {
  return e10.substring(0, 1).toLowerCase() + e10.substring(1);
}
var sr = class {
  constructor(t, r, n, i, o) {
    this.modelName = t, this.name = r, this.typeName = n, this.isList = i, this.isEnum = o;
  }
  _toGraphQLInputType() {
    let t = this.isList ? "List" : "", r = this.isEnum ? "Enum" : "";
    return `${t}${r}${this.typeName}FieldRefInput<${this.modelName}>`;
  }
};
function It(e10) {
  return e10 instanceof sr;
}
var hn = Symbol(), Ii = /* @__PURE__ */ new WeakMap(), Me = class {
  constructor(t) {
    t === hn ? Ii.set(this, `Prisma.${this._getName()}`) : Ii.set(this, `new Prisma.${this._getNamespace()}.${this._getName()}()`);
  }
  _getName() {
    return this.constructor.name;
  }
  toString() {
    return Ii.get(this);
  }
}, ar = class extends Me {
  _getNamespace() {
    return "NullTypes";
  }
}, lr = class extends ar {
};
Oi(lr, "DbNull");
var ur = class extends ar {
};
Oi(ur, "JsonNull");
var cr = class extends ar {
};
Oi(cr, "AnyNull");
var yn = { classes: { DbNull: lr, JsonNull: ur, AnyNull: cr }, instances: { DbNull: new lr(hn), JsonNull: new ur(hn), AnyNull: new cr(hn) } };
function Oi(e10, t) {
  Object.defineProperty(e10, "name", { value: t, configurable: true });
}
var Ys = ": ", bn = class {
  constructor(t, r) {
    this.name = t;
    this.value = r;
    this.hasError = false;
  }
  markAsError() {
    this.hasError = true;
  }
  getPrintWidth() {
    return this.name.length + this.value.getPrintWidth() + Ys.length;
  }
  write(t) {
    let r = new Pe(this.name);
    this.hasError && r.underline().setColor(t.context.colors.red), t.write(r).write(Ys).write(this.value);
  }
};
var ki = class {
  constructor(t) {
    this.errorMessages = [];
    this.arguments = t;
  }
  write(t) {
    t.write(this.arguments);
  }
  addErrorMessage(t) {
    this.errorMessages.push(t);
  }
  renderAllMessages(t) {
    return this.errorMessages.map((r) => r(t)).join(`
`);
  }
};
function Ot(e10) {
  return new ki(Zs(e10));
}
function Zs(e10) {
  let t = new At();
  for (let [r, n] of Object.entries(e10)) {
    let i = new bn(r, Xs(n));
    t.addField(i);
  }
  return t;
}
function Xs(e10) {
  if (typeof e10 == "string") return new W(JSON.stringify(e10));
  if (typeof e10 == "number" || typeof e10 == "boolean") return new W(String(e10));
  if (typeof e10 == "bigint") return new W(`${e10}n`);
  if (e10 === null) return new W("null");
  if (e10 === void 0) return new W("undefined");
  if (vt(e10)) return new W(`new Prisma.Decimal("${e10.toFixed()}")`);
  if (e10 instanceof Uint8Array) return Buffer.isBuffer(e10) ? new W(`Buffer.alloc(${e10.byteLength})`) : new W(`new Uint8Array(${e10.byteLength})`);
  if (e10 instanceof Date) {
    let t = ln(e10) ? e10.toISOString() : "Invalid Date";
    return new W(`new Date("${t}")`);
  }
  return e10 instanceof Me ? new W(`Prisma.${e10._getName()}`) : It(e10) ? new W(`prisma.${zs(e10.modelName)}.$fields.${e10.name}`) : Array.isArray(e10) ? zp(e10) : typeof e10 == "object" ? Zs(e10) : new W(Object.prototype.toString.call(e10));
}
function zp(e10) {
  let t = new St();
  for (let r of e10) t.addItem(Xs(r));
  return t;
}
function En(e10, t) {
  let r = t === "pretty" ? Us : fn, n = e10.renderAllMessages(r), i = new Rt(0, { colors: r }).write(e10).toString();
  return { message: n, args: i };
}
function wn({ args: e10, errors: t, errorFormat: r, callsite: n, originalMethod: i, clientVersion: o, globalOmit: s }) {
  let a = Ot(e10);
  for (let p of t) pn(p, a, s);
  let { message: l, args: u } = En(a, r), c = Tt({ message: l, callsite: n, originalMethod: i, showColors: r === "pretty", callArguments: u });
  throw new J(c, { clientVersion: o });
}
var ve = class {
  constructor() {
    this._map = /* @__PURE__ */ new Map();
  }
  get(t) {
    var _a2;
    return (_a2 = this._map.get(t)) == null ? void 0 : _a2.value;
  }
  set(t, r) {
    this._map.set(t, { value: r });
  }
  getOrCreate(t, r) {
    let n = this._map.get(t);
    if (n) return n.value;
    let i = r();
    return this.set(t, i), i;
  }
};
function pr(e10) {
  let t;
  return { get() {
    return t || (t = { value: e10() }), t.value;
  } };
}
function Te(e10) {
  return e10.replace(/^./, (t) => t.toLowerCase());
}
function ta(e10, t, r) {
  let n = Te(r);
  return !t.result || !(t.result.$allModels || t.result[n]) ? e10 : Yp({ ...e10, ...ea(t.name, e10, t.result.$allModels), ...ea(t.name, e10, t.result[n]) });
}
function Yp(e10) {
  let t = new ve(), r = (n, i) => t.getOrCreate(n, () => i.has(n) ? [n] : (i.add(n), e10[n] ? e10[n].needs.flatMap((o) => r(o, i)) : [n]));
  return yt(e10, (n) => ({ ...n, needs: r(n.name, /* @__PURE__ */ new Set()) }));
}
function ea(e10, t, r) {
  return r ? yt(r, ({ needs: n, compute: i }, o) => ({ name: o, needs: n ? Object.keys(n).filter((s) => n[s]) : [], compute: Zp(t, o, i) })) : {};
}
function Zp(e10, t, r) {
  var _a2;
  let n = (_a2 = e10 == null ? void 0 : e10[t]) == null ? void 0 : _a2.compute;
  return n ? (i) => r({ ...i, [t]: n(i) }) : r;
}
function ra(e10, t) {
  if (!t) return e10;
  let r = { ...e10 };
  for (let n of Object.values(t)) if (e10[n.name]) for (let i of n.needs) r[i] = true;
  return r;
}
function na(e10, t) {
  if (!t) return e10;
  let r = { ...e10 };
  for (let n of Object.values(t)) if (!e10[n.name]) for (let i of n.needs) delete r[i];
  return r;
}
var xn = class {
  constructor(t, r) {
    this.extension = t;
    this.previous = r;
    this.computedFieldsCache = new ve();
    this.modelExtensionsCache = new ve();
    this.queryCallbacksCache = new ve();
    this.clientExtensions = pr(() => {
      var _a2, _b;
      return this.extension.client ? { ...(_a2 = this.previous) == null ? void 0 : _a2.getAllClientExtensions(), ...this.extension.client } : (_b = this.previous) == null ? void 0 : _b.getAllClientExtensions();
    });
    this.batchCallbacks = pr(() => {
      var _a2, _b;
      let t2 = ((_a2 = this.previous) == null ? void 0 : _a2.getAllBatchQueryCallbacks()) ?? [], r2 = (_b = this.extension.query) == null ? void 0 : _b.$__internalBatch;
      return r2 ? t2.concat(r2) : t2;
    });
  }
  getAllComputedFields(t) {
    return this.computedFieldsCache.getOrCreate(t, () => {
      var _a2;
      return ta((_a2 = this.previous) == null ? void 0 : _a2.getAllComputedFields(t), this.extension, t);
    });
  }
  getAllClientExtensions() {
    return this.clientExtensions.get();
  }
  getAllModelExtensions(t) {
    return this.modelExtensionsCache.getOrCreate(t, () => {
      var _a2, _b;
      let r = Te(t);
      return !this.extension.model || !(this.extension.model[r] || this.extension.model.$allModels) ? (_a2 = this.previous) == null ? void 0 : _a2.getAllModelExtensions(t) : { ...(_b = this.previous) == null ? void 0 : _b.getAllModelExtensions(t), ...this.extension.model.$allModels, ...this.extension.model[r] };
    });
  }
  getAllQueryCallbacks(t, r) {
    return this.queryCallbacksCache.getOrCreate(`${t}:${r}`, () => {
      var _a2;
      let n = ((_a2 = this.previous) == null ? void 0 : _a2.getAllQueryCallbacks(t, r)) ?? [], i = [], o = this.extension.query;
      return !o || !(o[t] || o.$allModels || o[r] || o.$allOperations) ? n : (o[t] !== void 0 && (o[t][r] !== void 0 && i.push(o[t][r]), o[t].$allOperations !== void 0 && i.push(o[t].$allOperations)), t !== "$none" && o.$allModels !== void 0 && (o.$allModels[r] !== void 0 && i.push(o.$allModels[r]), o.$allModels.$allOperations !== void 0 && i.push(o.$allModels.$allOperations)), o[r] !== void 0 && i.push(o[r]), o.$allOperations !== void 0 && i.push(o.$allOperations), n.concat(i));
    });
  }
  getAllBatchQueryCallbacks() {
    return this.batchCallbacks.get();
  }
}, kt = class e7 {
  constructor(t) {
    this.head = t;
  }
  static empty() {
    return new e7();
  }
  static single(t) {
    return new e7(new xn(t));
  }
  isEmpty() {
    return this.head === void 0;
  }
  append(t) {
    return new e7(new xn(t, this.head));
  }
  getAllComputedFields(t) {
    var _a2;
    return (_a2 = this.head) == null ? void 0 : _a2.getAllComputedFields(t);
  }
  getAllClientExtensions() {
    var _a2;
    return (_a2 = this.head) == null ? void 0 : _a2.getAllClientExtensions();
  }
  getAllModelExtensions(t) {
    var _a2;
    return (_a2 = this.head) == null ? void 0 : _a2.getAllModelExtensions(t);
  }
  getAllQueryCallbacks(t, r) {
    var _a2;
    return ((_a2 = this.head) == null ? void 0 : _a2.getAllQueryCallbacks(t, r)) ?? [];
  }
  getAllBatchQueryCallbacks() {
    var _a2;
    return ((_a2 = this.head) == null ? void 0 : _a2.getAllBatchQueryCallbacks()) ?? [];
  }
};
var ia = Symbol(), dr = class {
  constructor(t) {
    if (t !== ia) throw new Error("Skip instance can not be constructed directly");
  }
  ifUndefined(t) {
    return t === void 0 ? Pn : t;
  }
}, Pn = new dr(ia);
function Re(e10) {
  return e10 instanceof dr;
}
var Xp = { findUnique: "findUnique", findUniqueOrThrow: "findUniqueOrThrow", findFirst: "findFirst", findFirstOrThrow: "findFirstOrThrow", findMany: "findMany", count: "aggregate", create: "createOne", createMany: "createMany", createManyAndReturn: "createManyAndReturn", update: "updateOne", updateMany: "updateMany", upsert: "upsertOne", delete: "deleteOne", deleteMany: "deleteMany", executeRaw: "executeRaw", queryRaw: "queryRaw", aggregate: "aggregate", groupBy: "groupBy", runCommandRaw: "runCommandRaw", findRaw: "findRaw", aggregateRaw: "aggregateRaw" }, oa = "explicitly `undefined` values are not allowed";
function vn({ modelName: e10, action: t, args: r, runtimeDataModel: n, extensions: i = kt.empty(), callsite: o, clientMethod: s, errorFormat: a, clientVersion: l, previewFeatures: u, globalOmit: c }) {
  let p = new Di({ runtimeDataModel: n, modelName: e10, action: t, rootArgs: r, callsite: o, extensions: i, selectionPath: [], argumentPath: [], originalMethod: s, errorFormat: a, clientVersion: l, previewFeatures: u, globalOmit: c });
  return { modelName: e10, action: Xp[t], query: mr(r, p) };
}
function mr({ select: e10, include: t, ...r } = {}, n) {
  let i;
  return n.isPreviewFeatureOn("omitApi") && (i = r.omit, delete r.omit), { arguments: aa(r, n), selection: ed(e10, t, i, n) };
}
function ed(e10, t, r, n) {
  return e10 ? (t ? n.throwValidationError({ kind: "MutuallyExclusiveFields", firstField: "include", secondField: "select", selectionPath: n.getSelectionPath() }) : r && n.isPreviewFeatureOn("omitApi") && n.throwValidationError({ kind: "MutuallyExclusiveFields", firstField: "omit", secondField: "select", selectionPath: n.getSelectionPath() }), id(e10, n)) : td(n, t, r);
}
function td(e10, t, r) {
  let n = {};
  return e10.modelOrType && !e10.isRawAction() && (n.$composites = true, n.$scalars = true), t && rd(n, t, e10), e10.isPreviewFeatureOn("omitApi") && nd(n, r, e10), n;
}
function rd(e10, t, r) {
  for (let [n, i] of Object.entries(t)) {
    if (Re(i)) continue;
    let o = r.nestSelection(n);
    if (_i(i, o), i === false || i === void 0) {
      e10[n] = false;
      continue;
    }
    let s = r.findField(n);
    if (s && s.kind !== "object" && r.throwValidationError({ kind: "IncludeOnScalar", selectionPath: r.getSelectionPath().concat(n), outputType: r.getOutputTypeDescription() }), s) {
      e10[n] = mr(i === true ? {} : i, o);
      continue;
    }
    if (i === true) {
      e10[n] = true;
      continue;
    }
    e10[n] = mr(i, o);
  }
}
function nd(e10, t, r) {
  let n = r.getComputedFields(), i = { ...r.getGlobalOmit(), ...t }, o = na(i, n);
  for (let [s, a] of Object.entries(o)) {
    if (Re(a)) continue;
    _i(a, r.nestSelection(s));
    let l = r.findField(s);
    (n == null ? void 0 : n[s]) && !l || (e10[s] = !a);
  }
}
function id(e10, t) {
  let r = {}, n = t.getComputedFields(), i = ra(e10, n);
  for (let [o, s] of Object.entries(i)) {
    if (Re(s)) continue;
    let a = t.nestSelection(o);
    _i(s, a);
    let l = t.findField(o);
    if (!((n == null ? void 0 : n[o]) && !l)) {
      if (s === false || s === void 0 || Re(s)) {
        r[o] = false;
        continue;
      }
      if (s === true) {
        (l == null ? void 0 : l.kind) === "object" ? r[o] = mr({}, a) : r[o] = true;
        continue;
      }
      r[o] = mr(s, a);
    }
  }
  return r;
}
function sa(e10, t) {
  if (e10 === null) return null;
  if (typeof e10 == "string" || typeof e10 == "number" || typeof e10 == "boolean") return e10;
  if (typeof e10 == "bigint") return { $type: "BigInt", value: String(e10) };
  if (Pt(e10)) {
    if (ln(e10)) return { $type: "DateTime", value: e10.toISOString() };
    t.throwValidationError({ kind: "InvalidArgumentValue", selectionPath: t.getSelectionPath(), argumentPath: t.getArgumentPath(), argument: { name: t.getArgumentName(), typeNames: ["Date"] }, underlyingError: "Provided Date object is invalid" });
  }
  if (It(e10)) return { $type: "FieldRef", value: { _ref: e10.name, _container: e10.modelName } };
  if (Array.isArray(e10)) return od(e10, t);
  if (ArrayBuffer.isView(e10)) return { $type: "Bytes", value: Buffer.from(e10).toString("base64") };
  if (sd(e10)) return e10.values;
  if (vt(e10)) return { $type: "Decimal", value: e10.toFixed() };
  if (e10 instanceof Me) {
    if (e10 !== yn.instances[e10._getName()]) throw new Error("Invalid ObjectEnumValue");
    return { $type: "Enum", value: e10._getName() };
  }
  if (ad(e10)) return e10.toJSON();
  if (typeof e10 == "object") return aa(e10, t);
  t.throwValidationError({ kind: "InvalidArgumentValue", selectionPath: t.getSelectionPath(), argumentPath: t.getArgumentPath(), argument: { name: t.getArgumentName(), typeNames: [] }, underlyingError: `We could not serialize ${Object.prototype.toString.call(e10)} value. Serialize the object to JSON or implement a ".toJSON()" method on it` });
}
function aa(e10, t) {
  if (e10.$type) return { $type: "Raw", value: e10 };
  let r = {};
  for (let n in e10) {
    let i = e10[n], o = t.nestArgument(n);
    Re(i) || (i !== void 0 ? r[n] = sa(i, o) : t.isPreviewFeatureOn("strictUndefinedChecks") && t.throwValidationError({ kind: "InvalidArgumentValue", argumentPath: o.getArgumentPath(), selectionPath: t.getSelectionPath(), argument: { name: t.getArgumentName(), typeNames: [] }, underlyingError: oa }));
  }
  return r;
}
function od(e10, t) {
  let r = [];
  for (let n = 0; n < e10.length; n++) {
    let i = t.nestArgument(String(n)), o = e10[n];
    if (o === void 0 || Re(o)) {
      let s = o === void 0 ? "undefined" : "Prisma.skip";
      t.throwValidationError({ kind: "InvalidArgumentValue", selectionPath: i.getSelectionPath(), argumentPath: i.getArgumentPath(), argument: { name: `${t.getArgumentName()}[${n}]`, typeNames: [] }, underlyingError: `Can not use \`${s}\` value within array. Use \`null\` or filter out \`${s}\` values` });
    }
    r.push(sa(o, i));
  }
  return r;
}
function sd(e10) {
  return typeof e10 == "object" && e10 !== null && e10.__prismaRawParameters__ === true;
}
function ad(e10) {
  return typeof e10 == "object" && e10 !== null && typeof e10.toJSON == "function";
}
function _i(e10, t) {
  e10 === void 0 && t.isPreviewFeatureOn("strictUndefinedChecks") && t.throwValidationError({ kind: "InvalidSelectionValue", selectionPath: t.getSelectionPath(), underlyingError: oa });
}
var Di = class e8 {
  constructor(t) {
    this.params = t;
    this.params.modelName && (this.modelOrType = this.params.runtimeDataModel.models[this.params.modelName] ?? this.params.runtimeDataModel.types[this.params.modelName]);
  }
  throwValidationError(t) {
    wn({ errors: [t], originalMethod: this.params.originalMethod, args: this.params.rootArgs ?? {}, callsite: this.params.callsite, errorFormat: this.params.errorFormat, clientVersion: this.params.clientVersion, globalOmit: this.params.globalOmit });
  }
  getSelectionPath() {
    return this.params.selectionPath;
  }
  getArgumentPath() {
    return this.params.argumentPath;
  }
  getArgumentName() {
    return this.params.argumentPath[this.params.argumentPath.length - 1];
  }
  getOutputTypeDescription() {
    if (!(!this.params.modelName || !this.modelOrType)) return { name: this.params.modelName, fields: this.modelOrType.fields.map((t) => ({ name: t.name, typeName: "boolean", isRelation: t.kind === "object" })) };
  }
  isRawAction() {
    return ["executeRaw", "queryRaw", "runCommandRaw", "findRaw", "aggregateRaw"].includes(this.params.action);
  }
  isPreviewFeatureOn(t) {
    return this.params.previewFeatures.includes(t);
  }
  getComputedFields() {
    if (this.params.modelName) return this.params.extensions.getAllComputedFields(this.params.modelName);
  }
  findField(t) {
    var _a2;
    return (_a2 = this.modelOrType) == null ? void 0 : _a2.fields.find((r) => r.name === t);
  }
  nestSelection(t) {
    let r = this.findField(t), n = (r == null ? void 0 : r.kind) === "object" ? r.type : void 0;
    return new e8({ ...this.params, modelName: n, selectionPath: this.params.selectionPath.concat(t) });
  }
  getGlobalOmit() {
    var _a2;
    return this.params.modelName && this.shouldApplyGlobalOmit() ? ((_a2 = this.params.globalOmit) == null ? void 0 : _a2[xt(this.params.modelName)]) ?? {} : {};
  }
  shouldApplyGlobalOmit() {
    switch (this.params.action) {
      case "findFirst":
      case "findFirstOrThrow":
      case "findUniqueOrThrow":
      case "findMany":
      case "upsert":
      case "findUnique":
      case "createManyAndReturn":
      case "create":
      case "update":
      case "delete":
        return true;
      case "executeRaw":
      case "aggregateRaw":
      case "runCommandRaw":
      case "findRaw":
      case "createMany":
      case "deleteMany":
      case "groupBy":
      case "updateMany":
      case "count":
      case "aggregate":
      case "queryRaw":
        return false;
      default:
        Fe(this.params.action, "Unknown action");
    }
  }
  nestArgument(t) {
    return new e8({ ...this.params, argumentPath: this.params.argumentPath.concat(t) });
  }
};
var Dt = class {
  constructor(t) {
    this._engine = t;
  }
  prometheus(t) {
    return this._engine.metrics({ format: "prometheus", ...t });
  }
  json(t) {
    return this._engine.metrics({ format: "json", ...t });
  }
};
function la(e10) {
  return { models: Fi(e10.models), enums: Fi(e10.enums), types: Fi(e10.types) };
}
function Fi(e10) {
  let t = {};
  for (let { name: r, ...n } of e10) t[r] = n;
  return t;
}
function ua(e10, t) {
  let r = pr(() => ld(t));
  Object.defineProperty(e10, "dmmf", { get: () => r.get() });
}
function ld(e10) {
  return { datamodel: { models: Li(e10.models), enums: Li(e10.enums), types: Li(e10.types) } };
}
function Li(e10) {
  return Object.entries(e10).map(([t, r]) => ({ name: t, ...r }));
}
var Ni = /* @__PURE__ */ new WeakMap(), Tn = "$$PrismaTypedSql", Mi = class {
  constructor(t, r) {
    Ni.set(this, { sql: t, values: r }), Object.defineProperty(this, Tn, { value: Tn });
  }
  get sql() {
    return Ni.get(this).sql;
  }
  get values() {
    return Ni.get(this).values;
  }
};
function ca(e10) {
  return (...t) => new Mi(e10, t);
}
function pa(e10) {
  return e10 != null && e10[Tn] === Tn;
}
function fr(e10) {
  return { ok: false, error: e10, map() {
    return fr(e10);
  }, flatMap() {
    return fr(e10);
  } };
}
var $i = class {
  constructor() {
    this.registeredErrors = [];
  }
  consumeError(t) {
    return this.registeredErrors[t];
  }
  registerNewError(t) {
    let r = 0;
    for (; this.registeredErrors[r] !== void 0; ) r++;
    return this.registeredErrors[r] = { error: t }, r;
  }
}, qi = (e10) => {
  let t = new $i(), r = Ce(t, e10.transactionContext.bind(e10)), n = { adapterName: e10.adapterName, errorRegistry: t, queryRaw: Ce(t, e10.queryRaw.bind(e10)), executeRaw: Ce(t, e10.executeRaw.bind(e10)), provider: e10.provider, transactionContext: async (...i) => (await r(...i)).map((s) => ud(t, s)) };
  return e10.getConnectionInfo && (n.getConnectionInfo = pd(t, e10.getConnectionInfo.bind(e10))), n;
}, ud = (e10, t) => {
  let r = Ce(e10, t.startTransaction.bind(t));
  return { adapterName: t.adapterName, provider: t.provider, queryRaw: Ce(e10, t.queryRaw.bind(t)), executeRaw: Ce(e10, t.executeRaw.bind(t)), startTransaction: async (...n) => (await r(...n)).map((o) => cd(e10, o)) };
}, cd = (e10, t) => ({ adapterName: t.adapterName, provider: t.provider, options: t.options, queryRaw: Ce(e10, t.queryRaw.bind(t)), executeRaw: Ce(e10, t.executeRaw.bind(t)), commit: Ce(e10, t.commit.bind(t)), rollback: Ce(e10, t.rollback.bind(t)) });
function Ce(e10, t) {
  return async (...r) => {
    try {
      return await t(...r);
    } catch (n) {
      let i = e10.registerNewError(n);
      return fr({ kind: "GenericJs", id: i });
    }
  };
}
function pd(e10, t) {
  return (...r) => {
    try {
      return t(...r);
    } catch (n) {
      let i = e10.registerNewError(n);
      return fr({ kind: "GenericJs", id: i });
    }
  };
}
var Wl = k(oi());
var Hl = require$$7, Kl = require$$8, zl = k(fs$3), Fr = k(path$2);
var oe = class e9 {
  constructor(t, r) {
    if (t.length - 1 !== r.length) throw t.length === 0 ? new TypeError("Expected at least 1 string") : new TypeError(`Expected ${t.length} strings to have ${t.length - 1} values`);
    let n = r.reduce((s, a) => s + (a instanceof e9 ? a.values.length : 1), 0);
    this.values = new Array(n), this.strings = new Array(n + 1), this.strings[0] = t[0];
    let i = 0, o = 0;
    for (; i < r.length; ) {
      let s = r[i++], a = t[i];
      if (s instanceof e9) {
        this.strings[o] += s.strings[0];
        let l = 0;
        for (; l < s.values.length; ) this.values[o++] = s.values[l++], this.strings[o] = s.strings[l];
        this.strings[o] += a;
      } else this.values[o++] = s, this.strings[o] = a;
    }
  }
  get sql() {
    let t = this.strings.length, r = 1, n = this.strings[0];
    for (; r < t; ) n += `?${this.strings[r++]}`;
    return n;
  }
  get statement() {
    let t = this.strings.length, r = 1, n = this.strings[0];
    for (; r < t; ) n += `:${r}${this.strings[r++]}`;
    return n;
  }
  get text() {
    let t = this.strings.length, r = 1, n = this.strings[0];
    for (; r < t; ) n += `$${r}${this.strings[r++]}`;
    return n;
  }
  inspect() {
    return { sql: this.sql, statement: this.statement, text: this.text, values: this.values };
  }
};
function da(e10, t = ",", r = "", n = "") {
  if (e10.length === 0) throw new TypeError("Expected `join([])` to be called with an array of multiple elements, but got an empty array");
  return new oe([r, ...Array(e10.length - 1).fill(t), n], e10);
}
function ji(e10) {
  return new oe([e10], []);
}
var ma = ji("");
function Vi(e10, ...t) {
  return new oe(e10, t);
}
function gr(e10) {
  return { getKeys() {
    return Object.keys(e10);
  }, getPropertyValue(t) {
    return e10[t];
  } };
}
function re(e10, t) {
  return { getKeys() {
    return [e10];
  }, getPropertyValue() {
    return t();
  } };
}
function ot(e10) {
  let t = new ve();
  return { getKeys() {
    return e10.getKeys();
  }, getPropertyValue(r) {
    return t.getOrCreate(r, () => e10.getPropertyValue(r));
  }, getPropertyDescriptor(r) {
    var _a2;
    return (_a2 = e10.getPropertyDescriptor) == null ? void 0 : _a2.call(e10, r);
  } };
}
var Rn = { enumerable: true, configurable: true, writable: true };
function Cn(e10) {
  let t = new Set(e10);
  return { getOwnPropertyDescriptor: () => Rn, has: (r, n) => t.has(n), set: (r, n, i) => t.add(n) && Reflect.set(r, n, i), ownKeys: () => [...t] };
}
var fa = Symbol.for("nodejs.util.inspect.custom");
function Se(e10, t) {
  let r = dd(t), n = /* @__PURE__ */ new Set(), i = new Proxy(e10, { get(o, s) {
    if (n.has(s)) return o[s];
    let a = r.get(s);
    return a ? a.getPropertyValue(s) : o[s];
  }, has(o, s) {
    var _a2;
    if (n.has(s)) return true;
    let a = r.get(s);
    return a ? ((_a2 = a.has) == null ? void 0 : _a2.call(a, s)) ?? true : Reflect.has(o, s);
  }, ownKeys(o) {
    let s = ga(Reflect.ownKeys(o), r), a = ga(Array.from(r.keys()), r);
    return [.../* @__PURE__ */ new Set([...s, ...a, ...n])];
  }, set(o, s, a) {
    var _a2, _b, _c2;
    return ((_c2 = (_b = (_a2 = r.get(s)) == null ? void 0 : _a2.getPropertyDescriptor) == null ? void 0 : _b.call(_a2, s)) == null ? void 0 : _c2.writable) === false ? false : (n.add(s), Reflect.set(o, s, a));
  }, getOwnPropertyDescriptor(o, s) {
    let a = Reflect.getOwnPropertyDescriptor(o, s);
    if (a && !a.configurable) return a;
    let l = r.get(s);
    return l ? l.getPropertyDescriptor ? { ...Rn, ...l == null ? void 0 : l.getPropertyDescriptor(s) } : Rn : a;
  }, defineProperty(o, s, a) {
    return n.add(s), Reflect.defineProperty(o, s, a);
  } });
  return i[fa] = function() {
    let o = { ...this };
    return delete o[fa], o;
  }, i;
}
function dd(e10) {
  let t = /* @__PURE__ */ new Map();
  for (let r of e10) {
    let n = r.getKeys();
    for (let i of n) t.set(i, r);
  }
  return t;
}
function ga(e10, t) {
  return e10.filter((r) => {
    var _a2, _b;
    return ((_b = (_a2 = t.get(r)) == null ? void 0 : _a2.has) == null ? void 0 : _b.call(_a2, r)) ?? true;
  });
}
function _t(e10) {
  return { getKeys() {
    return e10;
  }, has() {
    return false;
  }, getPropertyValue() {
  } };
}
function Ft(e10, t) {
  return { batch: e10, transaction: (t == null ? void 0 : t.kind) === "batch" ? { isolationLevel: t.options.isolationLevel } : void 0 };
}
function ha(e10) {
  if (e10 === void 0) return "";
  let t = Ot(e10);
  return new Rt(0, { colors: fn }).write(t).toString();
}
var md = "P2037";
function st({ error: e10, user_facing_error: t }, r, n) {
  return t.error_code ? new V(fd(t, n), { code: t.error_code, clientVersion: r, meta: t.meta, batchRequestIdx: t.batch_request_idx }) : new B(e10, { clientVersion: r, batchRequestIdx: t.batch_request_idx });
}
function fd(e10, t) {
  let r = e10.message;
  return (t === "postgresql" || t === "postgres" || t === "mysql") && e10.error_code === md && (r += `
Prisma Accelerate has built-in connection pooling to prevent such errors: https://pris.ly/client/error-accelerate`), r;
}
var hr = "<unknown>";
function ya(e10) {
  var t = e10.split(`
`);
  return t.reduce(function(r, n) {
    var i = yd(n) || Ed(n) || Pd(n) || Cd(n) || Td(n);
    return i && r.push(i), r;
  }, []);
}
var gd = /^\s*at (.*?) ?\(((?:file|https?|blob|chrome-extension|native|eval|webpack|<anonymous>|\/|[a-z]:\\|\\\\).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i, hd = /\((\S*)(?::(\d+))(?::(\d+))\)/;
function yd(e10) {
  var t = gd.exec(e10);
  if (!t) return null;
  var r = t[2] && t[2].indexOf("native") === 0, n = t[2] && t[2].indexOf("eval") === 0, i = hd.exec(t[2]);
  return n && i != null && (t[2] = i[1], t[3] = i[2], t[4] = i[3]), { file: r ? null : t[2], methodName: t[1] || hr, arguments: r ? [t[2]] : [], lineNumber: t[3] ? +t[3] : null, column: t[4] ? +t[4] : null };
}
var bd = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
function Ed(e10) {
  var t = bd.exec(e10);
  return t ? { file: t[2], methodName: t[1] || hr, arguments: [], lineNumber: +t[3], column: t[4] ? +t[4] : null } : null;
}
var wd = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|webpack|resource|\[native).*?|[^@]*bundle)(?::(\d+))?(?::(\d+))?\s*$/i, xd = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
function Pd(e10) {
  var t = wd.exec(e10);
  if (!t) return null;
  var r = t[3] && t[3].indexOf(" > eval") > -1, n = xd.exec(t[3]);
  return r && n != null && (t[3] = n[1], t[4] = n[2], t[5] = null), { file: t[3], methodName: t[1] || hr, arguments: t[2] ? t[2].split(",") : [], lineNumber: t[4] ? +t[4] : null, column: t[5] ? +t[5] : null };
}
var vd = /^\s*(?:([^@]*)(?:\((.*?)\))?@)?(\S.*?):(\d+)(?::(\d+))?\s*$/i;
function Td(e10) {
  var t = vd.exec(e10);
  return t ? { file: t[3], methodName: t[1] || hr, arguments: [], lineNumber: +t[4], column: t[5] ? +t[5] : null } : null;
}
var Rd = /^\s*at (?:((?:\[object object\])?[^\\/]+(?: \[as \S+\])?) )?\(?(.*?):(\d+)(?::(\d+))?\)?\s*$/i;
function Cd(e10) {
  var t = Rd.exec(e10);
  return t ? { file: t[2], methodName: t[1] || hr, arguments: [], lineNumber: +t[3], column: t[4] ? +t[4] : null } : null;
}
var Bi = class {
  getLocation() {
    return null;
  }
}, Ui = class {
  constructor() {
    this._error = new Error();
  }
  getLocation() {
    let t = this._error.stack;
    if (!t) return null;
    let n = ya(t).find((i) => {
      if (!i.file) return false;
      let o = mi(i.file);
      return o !== "<anonymous>" && !o.includes("@prisma") && !o.includes("/packages/client/src/runtime/") && !o.endsWith("/runtime/binary.js") && !o.endsWith("/runtime/library.js") && !o.endsWith("/runtime/edge.js") && !o.endsWith("/runtime/edge-esm.js") && !o.startsWith("internal/") && !i.methodName.includes("new ") && !i.methodName.includes("getCallSite") && !i.methodName.includes("Proxy.") && i.methodName.split(".").length < 4;
    });
    return !n || !n.file ? null : { fileName: n.file, lineNumber: n.lineNumber, columnNumber: n.column };
  }
};
function Ze(e10) {
  return e10 === "minimal" ? typeof $EnabledCallSite == "function" && e10 !== "minimal" ? new $EnabledCallSite() : new Bi() : new Ui();
}
var ba = { _avg: true, _count: true, _sum: true, _min: true, _max: true };
function Lt(e10 = {}) {
  let t = Ad(e10);
  return Object.entries(t).reduce((n, [i, o]) => (ba[i] !== void 0 ? n.select[i] = { select: o } : n[i] = o, n), { select: {} });
}
function Ad(e10 = {}) {
  return typeof e10._count == "boolean" ? { ...e10, _count: { _all: e10._count } } : e10;
}
function Sn(e10 = {}) {
  return (t) => (typeof e10._count == "boolean" && (t._count = t._count._all), t);
}
function Ea(e10, t) {
  let r = Sn(e10);
  return t({ action: "aggregate", unpacker: r, argsMapper: Lt })(e10);
}
function Id(e10 = {}) {
  let { select: t, ...r } = e10;
  return typeof t == "object" ? Lt({ ...r, _count: t }) : Lt({ ...r, _count: { _all: true } });
}
function Od(e10 = {}) {
  return typeof e10.select == "object" ? (t) => Sn(e10)(t)._count : (t) => Sn(e10)(t)._count._all;
}
function wa(e10, t) {
  return t({ action: "count", unpacker: Od(e10), argsMapper: Id })(e10);
}
function kd(e10 = {}) {
  let t = Lt(e10);
  if (Array.isArray(t.by)) for (let r of t.by) typeof r == "string" && (t.select[r] = true);
  else typeof t.by == "string" && (t.select[t.by] = true);
  return t;
}
function Dd(e10 = {}) {
  return (t) => (typeof (e10 == null ? void 0 : e10._count) == "boolean" && t.forEach((r) => {
    r._count = r._count._all;
  }), t);
}
function xa(e10, t) {
  return t({ action: "groupBy", unpacker: Dd(e10), argsMapper: kd })(e10);
}
function Pa(e10, t, r) {
  if (t === "aggregate") return (n) => Ea(n, r);
  if (t === "count") return (n) => wa(n, r);
  if (t === "groupBy") return (n) => xa(n, r);
}
function va(e10, t) {
  let r = t.fields.filter((i) => !i.relationName), n = wi(r, (i) => i.name);
  return new Proxy({}, { get(i, o) {
    if (o in i || typeof o == "symbol") return i[o];
    let s = n[o];
    if (s) return new sr(e10, o, s.type, s.isList, s.kind === "enum");
  }, ...Cn(Object.keys(n)) });
}
var Ta = (e10) => Array.isArray(e10) ? e10 : e10.split("."), Gi = (e10, t) => Ta(t).reduce((r, n) => r && r[n], e10), Ra = (e10, t, r) => Ta(t).reduceRight((n, i, o, s) => Object.assign({}, Gi(e10, s.slice(0, o)), { [i]: n }), r);
function _d(e10, t) {
  return e10 === void 0 || t === void 0 ? [] : [...t, "select", e10];
}
function Fd(e10, t, r) {
  return t === void 0 ? e10 ?? {} : Ra(t, r, e10 || true);
}
function Qi(e10, t, r, n, i, o) {
  let a = e10._runtimeDataModel.models[t].fields.reduce((l, u) => ({ ...l, [u.name]: u }), {});
  return (l) => {
    let u = Ze(e10._errorFormat), c = _d(n, i), p = Fd(l, o, c), d = r({ dataPath: c, callsite: u })(p), f = Ld(e10, t);
    return new Proxy(d, { get(g, h) {
      if (!f.includes(h)) return g[h];
      let T = [a[h].type, r, h], S = [c, p];
      return Qi(e10, ...T, ...S);
    }, ...Cn([...f, ...Object.getOwnPropertyNames(d)]) });
  };
}
function Ld(e10, t) {
  return e10._runtimeDataModel.models[t].fields.filter((r) => r.kind === "object").map((r) => r.name);
}
function Ca(e10, t, r, n) {
  return e10 === Je.ModelAction.findFirstOrThrow || e10 === Je.ModelAction.findUniqueOrThrow ? Nd(t, r, n) : n;
}
function Nd(e10, t, r) {
  return async (n) => {
    if ("rejectOnNotFound" in n.args) {
      let o = Tt({ originalMethod: n.clientMethod, callsite: n.callsite, message: "'rejectOnNotFound' option is not supported" });
      throw new J(o, { clientVersion: t });
    }
    return await r(n).catch((o) => {
      throw o instanceof V && o.code === "P2025" ? new Le(`No ${e10} found`, t) : o;
    });
  };
}
var Md = ["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "create", "update", "upsert", "delete"], $d = ["aggregate", "count", "groupBy"];
function Ji(e10, t) {
  let r = e10._extensions.getAllModelExtensions(t) ?? {}, n = [qd(e10, t), Vd(e10, t), gr(r), re("name", () => t), re("$name", () => t), re("$parent", () => e10._appliedParent)];
  return Se({}, n);
}
function qd(e10, t) {
  let r = Te(t), n = Object.keys(Je.ModelAction).concat("count");
  return { getKeys() {
    return n;
  }, getPropertyValue(i) {
    let o = i, s = (l) => e10._request(l);
    s = Ca(o, t, e10._clientVersion, s);
    let a = (l) => (u) => {
      let c = Ze(e10._errorFormat);
      return e10._createPrismaPromise((p) => {
        let d = { args: u, dataPath: [], action: o, model: t, clientMethod: `${r}.${i}`, jsModelName: r, transaction: p, callsite: c };
        return s({ ...d, ...l });
      });
    };
    return Md.includes(o) ? Qi(e10, t, a) : jd(i) ? Pa(e10, i, a) : a({});
  } };
}
function jd(e10) {
  return $d.includes(e10);
}
function Vd(e10, t) {
  return ot(re("fields", () => {
    let r = e10._runtimeDataModel.models[t];
    return va(t, r);
  }));
}
function Sa(e10) {
  return e10.replace(/^./, (t) => t.toUpperCase());
}
var Wi = Symbol();
function yr(e10) {
  let t = [Bd(e10), re(Wi, () => e10), re("$parent", () => e10._appliedParent)], r = e10._extensions.getAllClientExtensions();
  return r && t.push(gr(r)), Se(e10, t);
}
function Bd(e10) {
  let t = Object.keys(e10._runtimeDataModel.models), r = t.map(Te), n = [...new Set(t.concat(r))];
  return ot({ getKeys() {
    return n;
  }, getPropertyValue(i) {
    let o = Sa(i);
    if (e10._runtimeDataModel.models[o] !== void 0) return Ji(e10, o);
    if (e10._runtimeDataModel.models[i] !== void 0) return Ji(e10, i);
  }, getPropertyDescriptor(i) {
    if (!r.includes(i)) return { enumerable: false };
  } });
}
function Aa(e10) {
  return e10[Wi] ? e10[Wi] : e10;
}
function Ia(e10) {
  var _a2;
  if (typeof e10 == "function") return e10(this);
  if ((_a2 = e10.client) == null ? void 0 : _a2.__AccelerateEngine) {
    let r = e10.client.__AccelerateEngine;
    this._originalClient._engine = new r(this._originalClient._accelerateEngineConfig);
  }
  let t = Object.create(this._originalClient, { _extensions: { value: this._extensions.append(e10) }, _appliedParent: { value: this, configurable: true }, $use: { value: void 0 }, $on: { value: void 0 } });
  return yr(t);
}
function Oa({ result: e10, modelName: t, select: r, omit: n, extensions: i }) {
  let o = i.getAllComputedFields(t);
  if (!o) return e10;
  let s = [], a = [];
  for (let l of Object.values(o)) {
    if (n) {
      if (n[l.name]) continue;
      let u = l.needs.filter((c) => n[c]);
      u.length > 0 && a.push(_t(u));
    } else if (r) {
      if (!r[l.name]) continue;
      let u = l.needs.filter((c) => !r[c]);
      u.length > 0 && a.push(_t(u));
    }
    Ud(e10, l.needs) && s.push(Gd(l, Se(e10, s)));
  }
  return s.length > 0 || a.length > 0 ? Se(e10, [...s, ...a]) : e10;
}
function Ud(e10, t) {
  return t.every((r) => Ei(e10, r));
}
function Gd(e10, t) {
  return ot(re(e10.name, () => e10.compute(t)));
}
function An({ visitor: e10, result: t, args: r, runtimeDataModel: n, modelName: i }) {
  if (Array.isArray(t)) {
    for (let s = 0; s < t.length; s++) t[s] = An({ result: t[s], args: r, modelName: i, runtimeDataModel: n, visitor: e10 });
    return t;
  }
  let o = e10(t, i, r) ?? t;
  return r.include && ka({ includeOrSelect: r.include, result: o, parentModelName: i, runtimeDataModel: n, visitor: e10 }), r.select && ka({ includeOrSelect: r.select, result: o, parentModelName: i, runtimeDataModel: n, visitor: e10 }), o;
}
function ka({ includeOrSelect: e10, result: t, parentModelName: r, runtimeDataModel: n, visitor: i }) {
  for (let [o, s] of Object.entries(e10)) {
    if (!s || t[o] == null || Re(s)) continue;
    let l = n.models[r].fields.find((c) => c.name === o);
    if (!l || l.kind !== "object" || !l.relationName) continue;
    let u = typeof s == "object" ? s : {};
    t[o] = An({ visitor: i, result: t[o], args: u, modelName: l.type, runtimeDataModel: n });
  }
}
function Da({ result: e10, modelName: t, args: r, extensions: n, runtimeDataModel: i, globalOmit: o }) {
  return n.isEmpty() || e10 == null || typeof e10 != "object" || !i.models[t] ? e10 : An({ result: e10, args: r ?? {}, modelName: t, runtimeDataModel: i, visitor: (a, l, u) => {
    let c = Te(l);
    return Oa({ result: a, modelName: c, select: u.select, omit: u.select ? void 0 : { ...o == null ? void 0 : o[c], ...u.omit }, extensions: n });
  } });
}
function _a(e10) {
  if (e10 instanceof oe) return Qd(e10);
  if (Array.isArray(e10)) {
    let r = [e10[0]];
    for (let n = 1; n < e10.length; n++) r[n] = br(e10[n]);
    return r;
  }
  let t = {};
  for (let r in e10) t[r] = br(e10[r]);
  return t;
}
function Qd(e10) {
  return new oe(e10.strings, e10.values);
}
function br(e10) {
  if (typeof e10 != "object" || e10 == null || e10 instanceof Me || It(e10)) return e10;
  if (vt(e10)) return new xe(e10.toFixed());
  if (Pt(e10)) return /* @__PURE__ */ new Date(+e10);
  if (ArrayBuffer.isView(e10)) return e10.slice(0);
  if (Array.isArray(e10)) {
    let t = e10.length, r;
    for (r = Array(t); t--; ) r[t] = br(e10[t]);
    return r;
  }
  if (typeof e10 == "object") {
    let t = {};
    for (let r in e10) r === "__proto__" ? Object.defineProperty(t, r, { value: br(e10[r]), configurable: true, enumerable: true, writable: true }) : t[r] = br(e10[r]);
    return t;
  }
  Fe(e10, "Unknown value");
}
function La(e10, t, r, n = 0) {
  return e10._createPrismaPromise((i) => {
    var _a2;
    let o = t.customDataProxyFetch;
    return "transaction" in t && i !== void 0 && (((_a2 = t.transaction) == null ? void 0 : _a2.kind) === "batch" && t.transaction.lock.then(), t.transaction = i), n === r.length ? e10._executeRequest(t) : r[n]({ model: t.model, operation: t.model ? t.action : t.clientMethod, args: _a(t.args ?? {}), __internalParams: t, query: (s, a = t) => {
      let l = a.customDataProxyFetch;
      return a.customDataProxyFetch = qa(o, l), a.args = s, La(e10, a, r, n + 1);
    } });
  });
}
function Na(e10, t) {
  let { jsModelName: r, action: n, clientMethod: i } = t, o = r ? n : i;
  if (e10._extensions.isEmpty()) return e10._executeRequest(t);
  let s = e10._extensions.getAllQueryCallbacks(r ?? "$none", o);
  return La(e10, t, s);
}
function Ma(e10) {
  return (t) => {
    let r = { requests: t }, n = t[0].extensions.getAllBatchQueryCallbacks();
    return n.length ? $a(r, n, 0, e10) : e10(r);
  };
}
function $a(e10, t, r, n) {
  if (r === t.length) return n(e10);
  let i = e10.customDataProxyFetch, o = e10.requests[0].transaction;
  return t[r]({ args: { queries: e10.requests.map((s) => ({ model: s.modelName, operation: s.action, args: s.args })), transaction: o ? { isolationLevel: o.kind === "batch" ? o.isolationLevel : void 0 } : void 0 }, __internalParams: e10, query(s, a = e10) {
    let l = a.customDataProxyFetch;
    return a.customDataProxyFetch = qa(i, l), $a(a, t, r + 1, n);
  } });
}
var Fa = (e10) => e10;
function qa(e10 = Fa, t = Fa) {
  return (r) => e10(t(r));
}
var ja = L("prisma:client"), Va = { Vercel: "vercel", "Netlify CI": "netlify" };
function Ba({ postinstall: e10, ciName: t, clientVersion: r }) {
  if (ja("checkPlatformCaching:postinstall", e10), ja("checkPlatformCaching:ciName", t), e10 === true && t && t in Va) {
    let n = `Prisma has detected that this project was built on ${t}, which caches dependencies. This leads to an outdated Prisma Client because Prisma's auto-generation isn't triggered. To fix this, make sure to run the \`prisma generate\` command during the build process.

Learn how: https://pris.ly/d/${Va[t]}-build`;
    throw console.error(n), new R(n, r);
  }
}
function Ua(e10, t) {
  return e10 ? e10.datasources ? e10.datasources : e10.datasourceUrl ? { [t[0]]: { url: e10.datasourceUrl } } : {} : {};
}
var Jd = "Cloudflare-Workers", Wd = "node";
function Ga() {
  var _a2, _b, _c2;
  return typeof Netlify == "object" ? "netlify" : typeof EdgeRuntime == "string" ? "edge-light" : ((_a2 = globalThis.navigator) == null ? void 0 : _a2.userAgent) === Jd ? "workerd" : globalThis.Deno ? "deno" : globalThis.__lagon__ ? "lagon" : ((_c2 = (_b = globalThis.process) == null ? void 0 : _b.release) == null ? void 0 : _c2.name) === Wd ? "node" : globalThis.Bun ? "bun" : globalThis.fastly ? "fastly" : "unknown";
}
var Hd = { node: "Node.js", workerd: "Cloudflare Workers", deno: "Deno and Deno Deploy", netlify: "Netlify Edge Functions", "edge-light": "Edge Runtime (Vercel Edge Functions, Vercel Edge Middleware, Next.js (Pages Router) Edge API Routes, Next.js (App Router) Edge Route Handlers or Next.js Middleware)" };
function In() {
  let e10 = Ga();
  return { id: e10, prettyName: Hd[e10] || e10, isEdge: ["workerd", "deno", "netlify", "edge-light"].includes(e10) };
}
var Ka = k(fs$3), Er = k(path$2);
function On(e10) {
  let { runtimeBinaryTarget: t } = e10;
  return `Add "${t}" to \`binaryTargets\` in the "schema.prisma" file and run \`prisma generate\` after saving it:

${Kd(e10)}`;
}
function Kd(e10) {
  let { generator: t, generatorBinaryTargets: r, runtimeBinaryTarget: n } = e10, i = { fromEnvVar: null, value: n }, o = [...r, i];
  return hi({ ...t, binaryTargets: o });
}
function Xe(e10) {
  let { runtimeBinaryTarget: t } = e10;
  return `Prisma Client could not locate the Query Engine for runtime "${t}".`;
}
function et(e10) {
  let { searchedLocations: t } = e10;
  return `The following locations have been searched:
${[...new Set(t)].map((i) => `  ${i}`).join(`
`)}`;
}
function Qa(e10) {
  let { runtimeBinaryTarget: t } = e10;
  return `${Xe(e10)}

This happened because \`binaryTargets\` have been pinned, but the actual deployment also required "${t}".
${On(e10)}

${et(e10)}`;
}
function kn(e10) {
  return `We would appreciate if you could take the time to share some information with us.
Please help us by answering a few questions: https://pris.ly/${e10}`;
}
function Dn(e10) {
  let { errorStack: t } = e10;
  return (t == null ? void 0 : t.match(/\/\.next|\/next@|\/next\//)) ? `

We detected that you are using Next.js, learn how to fix this: https://pris.ly/d/engine-not-found-nextjs.` : "";
}
function Ja(e10) {
  let { queryEngineName: t } = e10;
  return `${Xe(e10)}${Dn(e10)}

This is likely caused by a bundler that has not copied "${t}" next to the resulting bundle.
Ensure that "${t}" has been copied next to the bundle or in "${e10.expectedLocation}".

${kn("engine-not-found-bundler-investigation")}

${et(e10)}`;
}
function Wa(e10) {
  let { runtimeBinaryTarget: t, generatorBinaryTargets: r } = e10, n = r.find((i) => i.native);
  return `${Xe(e10)}

This happened because Prisma Client was generated for "${(n == null ? void 0 : n.value) ?? "unknown"}", but the actual deployment required "${t}".
${On(e10)}

${et(e10)}`;
}
function Ha(e10) {
  let { queryEngineName: t } = e10;
  return `${Xe(e10)}${Dn(e10)}

This is likely caused by tooling that has not copied "${t}" to the deployment folder.
Ensure that you ran \`prisma generate\` and that "${t}" has been copied to "${e10.expectedLocation}".

${kn("engine-not-found-tooling-investigation")}

${et(e10)}`;
}
var zd = L("prisma:client:engines:resolveEnginePath"), Yd = () => new RegExp("runtime[\\\\/]library\\.m?js$");
async function za(e10, t) {
  var _a2;
  let r = { binary: process.env.PRISMA_QUERY_ENGINE_BINARY, library: process.env.PRISMA_QUERY_ENGINE_LIBRARY }[e10] ?? t.prismaPath;
  if (r !== void 0) return r;
  let { enginePath: n, searchedLocations: i } = await Zd(e10, t);
  if (zd("enginePath", n), n !== void 0) return t.prismaPath = n;
  let o = await nt(), s = ((_a2 = t.generator) == null ? void 0 : _a2.binaryTargets) ?? [], a = s.some((d) => d.native), l = !s.some((d) => d.value === o), u = __filename.match(Yd()) === null, c = { searchedLocations: i, generatorBinaryTargets: s, generator: t.generator, runtimeBinaryTarget: o, queryEngineName: Ya(e10, o), expectedLocation: Er.default.relative(process.cwd(), t.dirname), errorStack: new Error().stack }, p;
  throw a && l ? p = Wa(c) : l ? p = Qa(c) : u ? p = Ja(c) : p = Ha(c), new R(p, t.clientVersion);
}
async function Zd(engineType, config) {
  var _a2, _b;
  let binaryTarget = await nt(), searchedLocations = [], dirname = eval("__dirname"), searchLocations = [config.dirname, Er.default.resolve(dirname, ".."), ((_b = (_a2 = config.generator) == null ? void 0 : _a2.output) == null ? void 0 : _b.value) ?? dirname, Er.default.resolve(dirname, "../../../.prisma/client"), "/tmp/prisma-engines", config.cwd];
  __filename.includes("resolveEnginePath") && searchLocations.push(Yo());
  for (let e10 of searchLocations) {
    let t = Ya(engineType, binaryTarget), r = Er.default.join(e10, t);
    if (searchedLocations.push(e10), Ka.default.existsSync(r)) return { enginePath: r, searchedLocations };
  }
  return { enginePath: void 0, searchedLocations };
}
function Ya(e10, t) {
  return qr(t);
}
var Hi = k(bi());
function Za(e10) {
  return e10 ? e10.replace(/".*"/g, '"X"').replace(/[\s:\[]([+-]?([0-9]*[.])?[0-9]+)/g, (t) => `${t[0]}5`) : "";
}
function Xa(e10) {
  return e10.split(`
`).map((t) => t.replace(/^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)\s*/, "").replace(/\+\d+\s*ms$/, "")).join(`
`);
}
var el = k(hs());
function tl({ title: e10, user: t = "prisma", repo: r = "prisma", template: n = "bug_report.yml", body: i }) {
  return (0, el.default)({ user: t, repo: r, template: n, title: e10, body: i });
}
function rl({ version: e10, binaryTarget: t, title: r, description: n, engineVersion: i, database: o, query: s }) {
  var _a2;
  let a = So(6e3 - ((s == null ? void 0 : s.length) ?? 0)), l = Xa((0, Hi.default)(a)), u = n ? `# Description
\`\`\`
${n}
\`\`\`` : "", c = (0, Hi.default)(`Hi Prisma Team! My Prisma Client just crashed. This is the report:
## Versions

| Name            | Version            |
|-----------------|--------------------|
| Node            | ${(_a2 = process.version) == null ? void 0 : _a2.padEnd(19)}| 
| OS              | ${t == null ? void 0 : t.padEnd(19)}|
| Prisma Client   | ${e10 == null ? void 0 : e10.padEnd(19)}|
| Query Engine    | ${i == null ? void 0 : i.padEnd(19)}|
| Database        | ${o == null ? void 0 : o.padEnd(19)}|

${u}

## Logs
\`\`\`
${l}
\`\`\`

## Client Snippet
\`\`\`ts
// PLEASE FILL YOUR CODE SNIPPET HERE
\`\`\`

## Schema
\`\`\`prisma
// PLEASE ADD YOUR SCHEMA HERE IF POSSIBLE
\`\`\`

## Prisma Engine Query
\`\`\`
${s ? Za(s) : ""}
\`\`\`
`), p = tl({ title: r, body: c });
  return `${r}

This is a non-recoverable error which probably happens when the Prisma Query Engine has a panic.

${X(p)}

If you want the Prisma team to look into it, please open the link above 🙏
To increase the chance of success, please post your schema and a snippet of
how you used Prisma Client in the issue. 
`;
}
function Nt({ inlineDatasources: e10, overrideDatasources: t, env: r, clientVersion: n }) {
  var _a2, _b;
  let i, o = Object.keys(e10)[0], s = (_a2 = e10[o]) == null ? void 0 : _a2.url, a = (_b = t[o]) == null ? void 0 : _b.url;
  if (o === void 0 ? i = void 0 : a ? i = a : (s == null ? void 0 : s.value) ? i = s.value : (s == null ? void 0 : s.fromEnvVar) && (i = r[s.fromEnvVar]), (s == null ? void 0 : s.fromEnvVar) !== void 0 && i === void 0) throw new R(`error: Environment variable not found: ${s.fromEnvVar}.`, n);
  if (i === void 0) throw new R("error: Missing URL environment variable, value, or override.", n);
  return i;
}
var _n = class extends Error {
  constructor(t, r) {
    super(t), this.clientVersion = r.clientVersion, this.cause = r.cause;
  }
  get [Symbol.toStringTag]() {
    return this.name;
  }
};
var se = class extends _n {
  constructor(t, r) {
    super(t, r), this.isRetryable = r.isRetryable ?? true;
  }
};
function A(e10, t) {
  return { ...e10, isRetryable: t };
}
var Mt = class extends se {
  constructor(r) {
    super("This request must be retried", A(r, true));
    this.name = "ForcedRetryError";
    this.code = "P5001";
  }
};
w(Mt, "ForcedRetryError");
var at = class extends se {
  constructor(r, n) {
    super(r, A(n, false));
    this.name = "InvalidDatasourceError";
    this.code = "P6001";
  }
};
w(at, "InvalidDatasourceError");
var lt = class extends se {
  constructor(r, n) {
    super(r, A(n, false));
    this.name = "NotImplementedYetError";
    this.code = "P5004";
  }
};
w(lt, "NotImplementedYetError");
var q = class extends se {
  constructor(t, r) {
    super(t, r), this.response = r.response;
    let n = this.response.headers.get("prisma-request-id");
    if (n) {
      let i = `(The request id was: ${n})`;
      this.message = this.message + " " + i;
    }
  }
};
var ut = class extends q {
  constructor(r) {
    super("Schema needs to be uploaded", A(r, true));
    this.name = "SchemaMissingError";
    this.code = "P5005";
  }
};
w(ut, "SchemaMissingError");
var Ki = "This request could not be understood by the server", wr = class extends q {
  constructor(r, n, i) {
    super(n || Ki, A(r, false));
    this.name = "BadRequestError";
    this.code = "P5000";
    i && (this.code = i);
  }
};
w(wr, "BadRequestError");
var xr = class extends q {
  constructor(r, n) {
    super("Engine not started: healthcheck timeout", A(r, true));
    this.name = "HealthcheckTimeoutError";
    this.code = "P5013";
    this.logs = n;
  }
};
w(xr, "HealthcheckTimeoutError");
var Pr = class extends q {
  constructor(r, n, i) {
    super(n, A(r, true));
    this.name = "EngineStartupError";
    this.code = "P5014";
    this.logs = i;
  }
};
w(Pr, "EngineStartupError");
var vr = class extends q {
  constructor(r) {
    super("Engine version is not supported", A(r, false));
    this.name = "EngineVersionNotSupportedError";
    this.code = "P5012";
  }
};
w(vr, "EngineVersionNotSupportedError");
var zi = "Request timed out", Tr = class extends q {
  constructor(r, n = zi) {
    super(n, A(r, false));
    this.name = "GatewayTimeoutError";
    this.code = "P5009";
  }
};
w(Tr, "GatewayTimeoutError");
var Xd = "Interactive transaction error", Rr = class extends q {
  constructor(r, n = Xd) {
    super(n, A(r, false));
    this.name = "InteractiveTransactionError";
    this.code = "P5015";
  }
};
w(Rr, "InteractiveTransactionError");
var em = "Request parameters are invalid", Cr = class extends q {
  constructor(r, n = em) {
    super(n, A(r, false));
    this.name = "InvalidRequestError";
    this.code = "P5011";
  }
};
w(Cr, "InvalidRequestError");
var Yi = "Requested resource does not exist", Sr = class extends q {
  constructor(r, n = Yi) {
    super(n, A(r, false));
    this.name = "NotFoundError";
    this.code = "P5003";
  }
};
w(Sr, "NotFoundError");
var Zi = "Unknown server error", $t = class extends q {
  constructor(r, n, i) {
    super(n || Zi, A(r, true));
    this.name = "ServerError";
    this.code = "P5006";
    this.logs = i;
  }
};
w($t, "ServerError");
var Xi = "Unauthorized, check your connection string", Ar = class extends q {
  constructor(r, n = Xi) {
    super(n, A(r, false));
    this.name = "UnauthorizedError";
    this.code = "P5007";
  }
};
w(Ar, "UnauthorizedError");
var eo = "Usage exceeded, retry again later", Ir = class extends q {
  constructor(r, n = eo) {
    super(n, A(r, true));
    this.name = "UsageExceededError";
    this.code = "P5008";
  }
};
w(Ir, "UsageExceededError");
async function tm(e10) {
  let t;
  try {
    t = await e10.text();
  } catch {
    return { type: "EmptyError" };
  }
  try {
    let r = JSON.parse(t);
    if (typeof r == "string") switch (r) {
      case "InternalDataProxyError":
        return { type: "DataProxyError", body: r };
      default:
        return { type: "UnknownTextError", body: r };
    }
    if (typeof r == "object" && r !== null) {
      if ("is_panic" in r && "message" in r && "error_code" in r) return { type: "QueryEngineError", body: r };
      if ("EngineNotStarted" in r || "InteractiveTransactionMisrouted" in r || "InvalidRequestError" in r) {
        let n = Object.values(r)[0].reason;
        return typeof n == "string" && !["SchemaMissing", "EngineVersionNotSupported"].includes(n) ? { type: "UnknownJsonError", body: r } : { type: "DataProxyError", body: r };
      }
    }
    return { type: "UnknownJsonError", body: r };
  } catch {
    return t === "" ? { type: "EmptyError" } : { type: "UnknownTextError", body: t };
  }
}
async function Or(e10, t) {
  if (e10.ok) return;
  let r = { clientVersion: t, response: e10 }, n = await tm(e10);
  if (n.type === "QueryEngineError") throw new V(n.body.message, { code: n.body.error_code, clientVersion: t });
  if (n.type === "DataProxyError") {
    if (n.body === "InternalDataProxyError") throw new $t(r, "Internal Data Proxy error");
    if ("EngineNotStarted" in n.body) {
      if (n.body.EngineNotStarted.reason === "SchemaMissing") return new ut(r);
      if (n.body.EngineNotStarted.reason === "EngineVersionNotSupported") throw new vr(r);
      if ("EngineStartupError" in n.body.EngineNotStarted.reason) {
        let { msg: i, logs: o } = n.body.EngineNotStarted.reason.EngineStartupError;
        throw new Pr(r, i, o);
      }
      if ("KnownEngineStartupError" in n.body.EngineNotStarted.reason) {
        let { msg: i, error_code: o } = n.body.EngineNotStarted.reason.KnownEngineStartupError;
        throw new R(i, t, o);
      }
      if ("HealthcheckTimeout" in n.body.EngineNotStarted.reason) {
        let { logs: i } = n.body.EngineNotStarted.reason.HealthcheckTimeout;
        throw new xr(r, i);
      }
    }
    if ("InteractiveTransactionMisrouted" in n.body) {
      let i = { IDParseError: "Could not parse interactive transaction ID", NoQueryEngineFoundError: "Could not find Query Engine for the specified host and transaction ID", TransactionStartError: "Could not start interactive transaction" };
      throw new Rr(r, i[n.body.InteractiveTransactionMisrouted.reason]);
    }
    if ("InvalidRequestError" in n.body) throw new Cr(r, n.body.InvalidRequestError.reason);
  }
  if (e10.status === 401 || e10.status === 403) throw new Ar(r, qt(Xi, n));
  if (e10.status === 404) return new Sr(r, qt(Yi, n));
  if (e10.status === 429) throw new Ir(r, qt(eo, n));
  if (e10.status === 504) throw new Tr(r, qt(zi, n));
  if (e10.status >= 500) throw new $t(r, qt(Zi, n));
  if (e10.status >= 400) throw new wr(r, qt(Ki, n));
}
function qt(e10, t) {
  return t.type === "EmptyError" ? e10 : `${e10}: ${JSON.stringify(t)}`;
}
function nl(e10) {
  let t = Math.pow(2, e10) * 50, r = Math.ceil(Math.random() * t) - Math.ceil(t / 2), n = t + r;
  return new Promise((i) => setTimeout(() => i(n), n));
}
var $e = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function il(e10) {
  let t = new TextEncoder().encode(e10), r = "", n = t.byteLength, i = n % 3, o = n - i, s, a, l, u, c;
  for (let p = 0; p < o; p = p + 3) c = t[p] << 16 | t[p + 1] << 8 | t[p + 2], s = (c & 16515072) >> 18, a = (c & 258048) >> 12, l = (c & 4032) >> 6, u = c & 63, r += $e[s] + $e[a] + $e[l] + $e[u];
  return i == 1 ? (c = t[o], s = (c & 252) >> 2, a = (c & 3) << 4, r += $e[s] + $e[a] + "==") : i == 2 && (c = t[o] << 8 | t[o + 1], s = (c & 64512) >> 10, a = (c & 1008) >> 4, l = (c & 15) << 2, r += $e[s] + $e[a] + $e[l] + "="), r;
}
function ol(e10) {
  var _a2;
  if (!!((_a2 = e10.generator) == null ? void 0 : _a2.previewFeatures.some((r) => r.toLowerCase().includes("metrics")))) throw new R("The `metrics` preview feature is not yet available with Accelerate.\nPlease remove `metrics` from the `previewFeatures` in your schema.\n\nMore information about Accelerate: https://pris.ly/d/accelerate", e10.clientVersion);
}
function rm(e10) {
  return e10[0] * 1e3 + e10[1] / 1e6;
}
function sl(e10) {
  return new Date(rm(e10));
}
var al = { "@prisma/engines-version": "5.22.0-44.605197351a3c8bdd595af2d2a9bc3025bca48ea2" };
var kr = class extends se {
  constructor(r, n) {
    super(`Cannot fetch data from service:
${r}`, A(n, true));
    this.name = "RequestError";
    this.code = "P5010";
  }
};
w(kr, "RequestError");
async function ct(e10, t, r = (n) => n) {
  let n = t.clientVersion;
  try {
    return typeof fetch == "function" ? await r(fetch)(e10, t) : await r(to)(e10, t);
  } catch (i) {
    let o = i.message ?? "Unknown error";
    throw new kr(o, { clientVersion: n });
  }
}
function im(e10) {
  return { ...e10.headers, "Content-Type": "application/json" };
}
function om(e10) {
  return { method: e10.method, headers: im(e10) };
}
function sm(e10, t) {
  return { text: () => Promise.resolve(Buffer.concat(e10).toString()), json: () => Promise.resolve().then(() => JSON.parse(Buffer.concat(e10).toString())), ok: t.statusCode >= 200 && t.statusCode <= 299, status: t.statusCode, url: t.url, headers: new ro(t.headers) };
}
async function to(e10, t = {}) {
  let r = am("https"), n = om(t), i = [], { origin: o } = new URL(e10);
  return new Promise((s, a) => {
    let l = r.request(e10, n, (u) => {
      let { statusCode: c, headers: { location: p } } = u;
      c >= 301 && c <= 399 && p && (p.startsWith("http") === false ? s(to(`${o}${p}`, t)) : s(to(p, t))), u.on("data", (d) => i.push(d)), u.on("end", () => s(sm(i, u))), u.on("error", a);
    });
    l.on("error", a), l.end(t.body ?? "");
  });
}
var am = typeof commonjsRequire < "u" ? commonjsRequire : () => {
}, ro = class {
  constructor(t = {}) {
    this.headers = /* @__PURE__ */ new Map();
    for (let [r, n] of Object.entries(t)) if (typeof n == "string") this.headers.set(r, n);
    else if (Array.isArray(n)) for (let i of n) this.headers.set(r, i);
  }
  append(t, r) {
    this.headers.set(t, r);
  }
  delete(t) {
    this.headers.delete(t);
  }
  get(t) {
    return this.headers.get(t) ?? null;
  }
  has(t) {
    return this.headers.has(t);
  }
  set(t, r) {
    this.headers.set(t, r);
  }
  forEach(t, r) {
    for (let [n, i] of this.headers) t.call(r, i, n, this);
  }
};
var lm = /^[1-9][0-9]*\.[0-9]+\.[0-9]+$/, ll = L("prisma:client:dataproxyEngine");
async function um(e10, t) {
  let r = al["@prisma/engines-version"], n = t.clientVersion ?? "unknown";
  if (process.env.PRISMA_CLIENT_DATA_PROXY_CLIENT_VERSION) return process.env.PRISMA_CLIENT_DATA_PROXY_CLIENT_VERSION;
  if (e10.includes("accelerate") && n !== "0.0.0" && n !== "in-memory") return n;
  let [i, o] = (n == null ? void 0 : n.split("-")) ?? [];
  if (o === void 0 && lm.test(i)) return i;
  if (o !== void 0 || n === "0.0.0" || n === "in-memory") {
    if (e10.startsWith("localhost") || e10.startsWith("127.0.0.1")) return "0.0.0";
    let [s] = r.split("-") ?? [], [a, l, u] = s.split("."), c = cm(`<=${a}.${l}.${u}`), p = await ct(c, { clientVersion: n });
    if (!p.ok) throw new Error(`Failed to fetch stable Prisma version, unpkg.com status ${p.status} ${p.statusText}, response body: ${await p.text() || "<empty body>"}`);
    let d = await p.text();
    ll("length of body fetched from unpkg.com", d.length);
    let f;
    try {
      f = JSON.parse(d);
    } catch (g) {
      throw console.error("JSON.parse error: body fetched from unpkg.com: ", d), g;
    }
    return f.version;
  }
  throw new lt("Only `major.minor.patch` versions are supported by Accelerate.", { clientVersion: n });
}
async function ul(e10, t) {
  let r = await um(e10, t);
  return ll("version", r), r;
}
function cm(e10) {
  return encodeURI(`https://unpkg.com/prisma@${e10}/package.json`);
}
var cl = 3, no = L("prisma:client:dataproxyEngine"), io = class {
  constructor({ apiKey: t, tracingHelper: r, logLevel: n, logQueries: i, engineHash: o }) {
    this.apiKey = t, this.tracingHelper = r, this.logLevel = n, this.logQueries = i, this.engineHash = o;
  }
  build({ traceparent: t, interactiveTransaction: r } = {}) {
    let n = { Authorization: `Bearer ${this.apiKey}`, "Prisma-Engine-Hash": this.engineHash };
    this.tracingHelper.isEnabled() && (n.traceparent = t ?? this.tracingHelper.getTraceParent()), r && (n["X-transaction-id"] = r.id);
    let i = this.buildCaptureSettings();
    return i.length > 0 && (n["X-capture-telemetry"] = i.join(", ")), n;
  }
  buildCaptureSettings() {
    let t = [];
    return this.tracingHelper.isEnabled() && t.push("tracing"), this.logLevel && t.push(this.logLevel), this.logQueries && t.push("query"), t;
  }
}, Dr = class {
  constructor(t) {
    this.name = "DataProxyEngine";
    ol(t), this.config = t, this.env = { ...t.env, ...typeof process < "u" ? process.env : {} }, this.inlineSchema = il(t.inlineSchema), this.inlineDatasources = t.inlineDatasources, this.inlineSchemaHash = t.inlineSchemaHash, this.clientVersion = t.clientVersion, this.engineHash = t.engineVersion, this.logEmitter = t.logEmitter, this.tracingHelper = t.tracingHelper;
  }
  apiKey() {
    return this.headerBuilder.apiKey;
  }
  version() {
    return this.engineHash;
  }
  async start() {
    this.startPromise !== void 0 && await this.startPromise, this.startPromise = (async () => {
      let [t, r] = this.extractHostAndApiKey();
      this.host = t, this.headerBuilder = new io({ apiKey: r, tracingHelper: this.tracingHelper, logLevel: this.config.logLevel, logQueries: this.config.logQueries, engineHash: this.engineHash }), this.remoteClientVersion = await ul(t, this.config), no("host", this.host);
    })(), await this.startPromise;
  }
  async stop() {
  }
  propagateResponseExtensions(t) {
    var _a2, _b;
    ((_a2 = t == null ? void 0 : t.logs) == null ? void 0 : _a2.length) && t.logs.forEach((r) => {
      switch (r.level) {
        case "debug":
        case "error":
        case "trace":
        case "warn":
        case "info":
          break;
        case "query": {
          let n = typeof r.attributes.query == "string" ? r.attributes.query : "";
          if (!this.tracingHelper.isEnabled()) {
            let [i] = n.split("/* traceparent");
            n = i;
          }
          this.logEmitter.emit("query", { query: n, timestamp: sl(r.timestamp), duration: Number(r.attributes.duration_ms), params: r.attributes.params, target: r.attributes.target });
        }
      }
    }), ((_b = t == null ? void 0 : t.traces) == null ? void 0 : _b.length) && this.tracingHelper.createEngineSpan({ span: true, spans: t.traces });
  }
  onBeforeExit() {
    throw new Error('"beforeExit" hook is not applicable to the remote query engine');
  }
  async url(t) {
    return await this.start(), `https://${this.host}/${this.remoteClientVersion}/${this.inlineSchemaHash}/${t}`;
  }
  async uploadSchema() {
    let t = { name: "schemaUpload", internal: true };
    return this.tracingHelper.runInChildSpan(t, async () => {
      let r = await ct(await this.url("schema"), { method: "PUT", headers: this.headerBuilder.build(), body: this.inlineSchema, clientVersion: this.clientVersion });
      r.ok || no("schema response status", r.status);
      let n = await Or(r, this.clientVersion);
      if (n) throw this.logEmitter.emit("warn", { message: `Error while uploading schema: ${n.message}`, timestamp: /* @__PURE__ */ new Date(), target: "" }), n;
      this.logEmitter.emit("info", { message: `Schema (re)uploaded (hash: ${this.inlineSchemaHash})`, timestamp: /* @__PURE__ */ new Date(), target: "" });
    });
  }
  request(t, { traceparent: r, interactiveTransaction: n, customDataProxyFetch: i }) {
    return this.requestInternal({ body: t, traceparent: r, interactiveTransaction: n, customDataProxyFetch: i });
  }
  async requestBatch(t, { traceparent: r, transaction: n, customDataProxyFetch: i }) {
    let o = (n == null ? void 0 : n.kind) === "itx" ? n.options : void 0, s = Ft(t, n), { batchResult: a, elapsed: l } = await this.requestInternal({ body: s, customDataProxyFetch: i, interactiveTransaction: o, traceparent: r });
    return a.map((u) => "errors" in u && u.errors.length > 0 ? st(u.errors[0], this.clientVersion, this.config.activeProvider) : { data: u, elapsed: l });
  }
  requestInternal({ body: t, traceparent: r, customDataProxyFetch: n, interactiveTransaction: i }) {
    return this.withRetry({ actionGerund: "querying", callback: async ({ logHttpCall: o }) => {
      let s = i ? `${i.payload.endpoint}/graphql` : await this.url("graphql");
      o(s);
      let a = await ct(s, { method: "POST", headers: this.headerBuilder.build({ traceparent: r, interactiveTransaction: i }), body: JSON.stringify(t), clientVersion: this.clientVersion }, n);
      a.ok || no("graphql response status", a.status), await this.handleError(await Or(a, this.clientVersion));
      let l = await a.json(), u = l.extensions;
      if (u && this.propagateResponseExtensions(u), l.errors) throw l.errors.length === 1 ? st(l.errors[0], this.config.clientVersion, this.config.activeProvider) : new B(l.errors, { clientVersion: this.config.clientVersion });
      return l;
    } });
  }
  async transaction(t, r, n) {
    let i = { start: "starting", commit: "committing", rollback: "rolling back" };
    return this.withRetry({ actionGerund: `${i[t]} transaction`, callback: async ({ logHttpCall: o }) => {
      if (t === "start") {
        let s = JSON.stringify({ max_wait: n.maxWait, timeout: n.timeout, isolation_level: n.isolationLevel }), a = await this.url("transaction/start");
        o(a);
        let l = await ct(a, { method: "POST", headers: this.headerBuilder.build({ traceparent: r.traceparent }), body: s, clientVersion: this.clientVersion });
        await this.handleError(await Or(l, this.clientVersion));
        let u = await l.json(), c = u.extensions;
        c && this.propagateResponseExtensions(c);
        let p = u.id, d = u["data-proxy"].endpoint;
        return { id: p, payload: { endpoint: d } };
      } else {
        let s = `${n.payload.endpoint}/${t}`;
        o(s);
        let a = await ct(s, { method: "POST", headers: this.headerBuilder.build({ traceparent: r.traceparent }), clientVersion: this.clientVersion });
        await this.handleError(await Or(a, this.clientVersion));
        let u = (await a.json()).extensions;
        u && this.propagateResponseExtensions(u);
        return;
      }
    } });
  }
  extractHostAndApiKey() {
    let t = { clientVersion: this.clientVersion }, r = Object.keys(this.inlineDatasources)[0], n = Nt({ inlineDatasources: this.inlineDatasources, overrideDatasources: this.config.overrideDatasources, clientVersion: this.clientVersion, env: this.env }), i;
    try {
      i = new URL(n);
    } catch {
      throw new at(`Error validating datasource \`${r}\`: the URL must start with the protocol \`prisma://\``, t);
    }
    let { protocol: o, host: s, searchParams: a } = i;
    if (o !== "prisma:" && o !== "prisma+postgres:") throw new at(`Error validating datasource \`${r}\`: the URL must start with the protocol \`prisma://\``, t);
    let l = a.get("api_key");
    if (l === null || l.length < 1) throw new at(`Error validating datasource \`${r}\`: the URL must contain a valid API key`, t);
    return [s, l];
  }
  metrics() {
    throw new lt("Metrics are not yet supported for Accelerate", { clientVersion: this.clientVersion });
  }
  async withRetry(t) {
    for (let r = 0; ; r++) {
      let n = (i) => {
        this.logEmitter.emit("info", { message: `Calling ${i} (n=${r})`, timestamp: /* @__PURE__ */ new Date(), target: "" });
      };
      try {
        return await t.callback({ logHttpCall: n });
      } catch (i) {
        if (!(i instanceof se) || !i.isRetryable) throw i;
        if (r >= cl) throw i instanceof Mt ? i.cause : i;
        this.logEmitter.emit("warn", { message: `Attempt ${r + 1}/${cl} failed for ${t.actionGerund}: ${i.message ?? "(unknown)"}`, timestamp: /* @__PURE__ */ new Date(), target: "" });
        let o = await nl(r);
        this.logEmitter.emit("warn", { message: `Retrying after ${o}ms`, timestamp: /* @__PURE__ */ new Date(), target: "" });
      }
    }
  }
  async handleError(t) {
    if (t instanceof ut) throw await this.uploadSchema(), new Mt({ clientVersion: this.clientVersion, cause: t });
    if (t) throw t;
  }
  applyPendingMigrations() {
    throw new Error("Method not implemented.");
  }
};
function pl(e10) {
  if ((e10 == null ? void 0 : e10.kind) === "itx") return e10.options.id;
}
var so = k(require$$0$2), dl = k(path$2);
var oo = Symbol("PrismaLibraryEngineCache");
function pm() {
  let e10 = globalThis;
  return e10[oo] === void 0 && (e10[oo] = {}), e10[oo];
}
function dm(e10) {
  let t = pm();
  if (t[e10] !== void 0) return t[e10];
  let r = dl.default.toNamespacedPath(e10), n = { exports: {} }, i = 0;
  return process.platform !== "win32" && (i = so.default.constants.dlopen.RTLD_LAZY | so.default.constants.dlopen.RTLD_DEEPBIND), process.dlopen(n, r, i), t[e10] = n.exports, n.exports;
}
var ml = { async loadLibrary(e10) {
  let t = await Yn(), r = await za("library", e10);
  try {
    return e10.tracingHelper.runInChildSpan({ name: "loadLibrary", internal: true }, () => dm(r));
  } catch (n) {
    let i = ui({ e: n, platformInfo: t, id: r });
    throw new R(i, e10.clientVersion);
  }
} };
var ao, fl = { async loadLibrary(e10) {
  let { clientVersion: t, adapter: r, engineWasm: n } = e10;
  if (r === void 0) throw new R(`The \`adapter\` option for \`PrismaClient\` is required in this context (${In().prettyName})`, t);
  if (n === void 0) throw new R("WASM engine was unexpectedly `undefined`", t);
  ao === void 0 && (ao = (async () => {
    let o = n.getRuntime(), s = await n.getQueryEngineWasmModule();
    if (s == null) throw new R("The loaded wasm module was unexpectedly `undefined` or `null` once loaded", t);
    let a = { "./query_engine_bg.js": o }, l = new WebAssembly.Instance(s, a);
    return o.__wbg_set_wasm(l.exports), o.QueryEngine;
  })());
  let i = await ao;
  return { debugPanic() {
    return Promise.reject("{}");
  }, dmmf() {
    return Promise.resolve("{}");
  }, version() {
    return { commit: "unknown", version: "unknown" };
  }, QueryEngine: i };
} };
var mm = "P2036", Ae = L("prisma:client:libraryEngine");
function fm(e10) {
  return e10.item_type === "query" && "query" in e10;
}
function gm(e10) {
  return "level" in e10 ? e10.level === "error" && e10.message === "PANIC" : false;
}
var gl = [...Jn, "native"], _r = class {
  constructor(t, r) {
    var _a2;
    this.name = "LibraryEngine";
    this.libraryLoader = r ?? ml, t.engineWasm !== void 0 && (this.libraryLoader = r ?? fl), this.config = t, this.libraryStarted = false, this.logQueries = t.logQueries ?? false, this.logLevel = t.logLevel ?? "error", this.logEmitter = t.logEmitter, this.datamodel = t.inlineSchema, t.enableDebugLogs && (this.logLevel = "debug");
    let n = Object.keys(t.overrideDatasources)[0], i = (_a2 = t.overrideDatasources[n]) == null ? void 0 : _a2.url;
    n !== void 0 && i !== void 0 && (this.datasourceOverrides = { [n]: i }), this.libraryInstantiationPromise = this.instantiateLibrary();
  }
  async applyPendingMigrations() {
    throw new Error("Cannot call this method from this type of engine instance");
  }
  async transaction(t, r, n) {
    var _a2, _b, _c2;
    await this.start();
    let i = JSON.stringify(r), o;
    if (t === "start") {
      let a = JSON.stringify({ max_wait: n.maxWait, timeout: n.timeout, isolation_level: n.isolationLevel });
      o = await ((_a2 = this.engine) == null ? void 0 : _a2.startTransaction(a, i));
    } else t === "commit" ? o = await ((_b = this.engine) == null ? void 0 : _b.commitTransaction(n.id, i)) : t === "rollback" && (o = await ((_c2 = this.engine) == null ? void 0 : _c2.rollbackTransaction(n.id, i)));
    let s = this.parseEngineResponse(o);
    if (hm(s)) {
      let a = this.getExternalAdapterError(s);
      throw a ? a.error : new V(s.message, { code: s.error_code, clientVersion: this.config.clientVersion, meta: s.meta });
    }
    return s;
  }
  async instantiateLibrary() {
    if (Ae("internalSetup"), this.libraryInstantiationPromise) return this.libraryInstantiationPromise;
    Qn(), this.binaryTarget = await this.getCurrentBinaryTarget(), await this.loadEngine(), this.version();
  }
  async getCurrentBinaryTarget() {
    {
      if (this.binaryTarget) return this.binaryTarget;
      let t = await nt();
      if (!gl.includes(t)) throw new R(`Unknown ${ce("PRISMA_QUERY_ENGINE_LIBRARY")} ${ce(H(t))}. Possible binaryTargets: ${qe(gl.join(", "))} or a path to the query engine library.
You may have to run ${qe("prisma generate")} for your changes to take effect.`, this.config.clientVersion);
      return t;
    }
  }
  parseEngineResponse(t) {
    if (!t) throw new B("Response from the Engine was empty", { clientVersion: this.config.clientVersion });
    try {
      return JSON.parse(t);
    } catch {
      throw new B("Unable to JSON.parse response from engine", { clientVersion: this.config.clientVersion });
    }
  }
  async loadEngine() {
    if (!this.engine) {
      this.QueryEngineConstructor || (this.library = await this.libraryLoader.loadLibrary(this.config), this.QueryEngineConstructor = this.library.QueryEngine);
      try {
        let t = new WeakRef(this), { adapter: r } = this.config;
        r && Ae("Using driver adapter: %O", r), this.engine = new this.QueryEngineConstructor({ datamodel: this.datamodel, env: process.env, logQueries: this.config.logQueries ?? false, ignoreEnvVarErrors: true, datasourceOverrides: this.datasourceOverrides ?? {}, logLevel: this.logLevel, configDir: this.config.cwd, engineProtocol: "json" }, (n) => {
          var _a2;
          (_a2 = t.deref()) == null ? void 0 : _a2.logger(n);
        }, r);
      } catch (t) {
        let r = t, n = this.parseInitError(r.message);
        throw typeof n == "string" ? r : new R(n.message, this.config.clientVersion, n.error_code);
      }
    }
  }
  logger(t) {
    let r = this.parseEngineResponse(t);
    if (r) {
      if ("span" in r) {
        this.config.tracingHelper.createEngineSpan(r);
        return;
      }
      r.level = (r == null ? void 0 : r.level.toLowerCase()) ?? "unknown", fm(r) ? this.logEmitter.emit("query", { timestamp: /* @__PURE__ */ new Date(), query: r.query, params: r.params, duration: Number(r.duration_ms), target: r.module_path }) : gm(r) ? this.loggerRustPanic = new le(lo(this, `${r.message}: ${r.reason} in ${r.file}:${r.line}:${r.column}`), this.config.clientVersion) : this.logEmitter.emit(r.level, { timestamp: /* @__PURE__ */ new Date(), message: r.message, target: r.module_path });
    }
  }
  parseInitError(t) {
    try {
      return JSON.parse(t);
    } catch {
    }
    return t;
  }
  parseRequestError(t) {
    try {
      return JSON.parse(t);
    } catch {
    }
    return t;
  }
  onBeforeExit() {
    throw new Error('"beforeExit" hook is not applicable to the library engine since Prisma 5.0.0, it is only relevant and implemented for the binary engine. Please add your event listener to the `process` object directly instead.');
  }
  async start() {
    if (await this.libraryInstantiationPromise, await this.libraryStoppingPromise, this.libraryStartingPromise) return Ae(`library already starting, this.libraryStarted: ${this.libraryStarted}`), this.libraryStartingPromise;
    if (this.libraryStarted) return;
    let t = async () => {
      var _a2;
      Ae("library starting");
      try {
        let r = { traceparent: this.config.tracingHelper.getTraceParent() };
        await ((_a2 = this.engine) == null ? void 0 : _a2.connect(JSON.stringify(r))), this.libraryStarted = true, Ae("library started");
      } catch (r) {
        let n = this.parseInitError(r.message);
        throw typeof n == "string" ? r : new R(n.message, this.config.clientVersion, n.error_code);
      } finally {
        this.libraryStartingPromise = void 0;
      }
    };
    return this.libraryStartingPromise = this.config.tracingHelper.runInChildSpan("connect", t), this.libraryStartingPromise;
  }
  async stop() {
    if (await this.libraryStartingPromise, await this.executingQueryPromise, this.libraryStoppingPromise) return Ae("library is already stopping"), this.libraryStoppingPromise;
    if (!this.libraryStarted) return;
    let t = async () => {
      var _a2;
      await new Promise((n) => setTimeout(n, 5)), Ae("library stopping");
      let r = { traceparent: this.config.tracingHelper.getTraceParent() };
      await ((_a2 = this.engine) == null ? void 0 : _a2.disconnect(JSON.stringify(r))), this.libraryStarted = false, this.libraryStoppingPromise = void 0, Ae("library stopped");
    };
    return this.libraryStoppingPromise = this.config.tracingHelper.runInChildSpan("disconnect", t), this.libraryStoppingPromise;
  }
  version() {
    var _a2, _b;
    return this.versionInfo = (_a2 = this.library) == null ? void 0 : _a2.version(), ((_b = this.versionInfo) == null ? void 0 : _b.version) ?? "unknown";
  }
  debugPanic(t) {
    var _a2;
    return (_a2 = this.library) == null ? void 0 : _a2.debugPanic(t);
  }
  async request(t, { traceparent: r, interactiveTransaction: n }) {
    var _a2, _b;
    Ae(`sending request, this.libraryStarted: ${this.libraryStarted}`);
    let i = JSON.stringify({ traceparent: r }), o = JSON.stringify(t);
    try {
      await this.start(), this.executingQueryPromise = (_a2 = this.engine) == null ? void 0 : _a2.query(o, i, n == null ? void 0 : n.id), this.lastQuery = o;
      let s = this.parseEngineResponse(await this.executingQueryPromise);
      if (s.errors) throw s.errors.length === 1 ? this.buildQueryError(s.errors[0]) : new B(JSON.stringify(s.errors), { clientVersion: this.config.clientVersion });
      if (this.loggerRustPanic) throw this.loggerRustPanic;
      return { data: s, elapsed: 0 };
    } catch (s) {
      if (s instanceof R) throw s;
      if (s.code === "GenericFailure" && ((_b = s.message) == null ? void 0 : _b.startsWith("PANIC:"))) throw new le(lo(this, s.message), this.config.clientVersion);
      let a = this.parseRequestError(s.message);
      throw typeof a == "string" ? s : new B(`${a.message}
${a.backtrace}`, { clientVersion: this.config.clientVersion });
    }
  }
  async requestBatch(t, { transaction: r, traceparent: n }) {
    Ae("requestBatch");
    let i = Ft(t, r);
    await this.start(), this.lastQuery = JSON.stringify(i), this.executingQueryPromise = this.engine.query(this.lastQuery, JSON.stringify({ traceparent: n }), pl(r));
    let o = await this.executingQueryPromise, s = this.parseEngineResponse(o);
    if (s.errors) throw s.errors.length === 1 ? this.buildQueryError(s.errors[0]) : new B(JSON.stringify(s.errors), { clientVersion: this.config.clientVersion });
    let { batchResult: a, errors: l } = s;
    if (Array.isArray(a)) return a.map((u) => u.errors && u.errors.length > 0 ? this.loggerRustPanic ?? this.buildQueryError(u.errors[0]) : { data: u, elapsed: 0 });
    throw l && l.length === 1 ? new Error(l[0].error) : new Error(JSON.stringify(s));
  }
  buildQueryError(t) {
    if (t.user_facing_error.is_panic) return new le(lo(this, t.user_facing_error.message), this.config.clientVersion);
    let r = this.getExternalAdapterError(t.user_facing_error);
    return r ? r.error : st(t, this.config.clientVersion, this.config.activeProvider);
  }
  getExternalAdapterError(t) {
    var _a2;
    if (t.error_code === mm && this.config.adapter) {
      let r = (_a2 = t.meta) == null ? void 0 : _a2.id;
      Yr(typeof r == "number", "Malformed external JS error received from the engine");
      let n = this.config.adapter.errorRegistry.consumeError(r);
      return Yr(n, "External error with reported id was not registered"), n;
    }
  }
  async metrics(t) {
    await this.start();
    let r = await this.engine.metrics(JSON.stringify(t));
    return t.format === "prometheus" ? r : this.parseEngineResponse(r);
  }
};
function hm(e10) {
  return typeof e10 == "object" && e10 !== null && e10.error_code !== void 0;
}
function lo(e10, t) {
  var _a2;
  return rl({ binaryTarget: e10.binaryTarget, title: t, version: e10.config.clientVersion, engineVersion: (_a2 = e10.versionInfo) == null ? void 0 : _a2.commit, database: e10.config.activeProvider, query: e10.lastQuery });
}
function hl({ copyEngine: e10 = true }, t) {
  let r;
  try {
    r = Nt({ inlineDatasources: t.inlineDatasources, overrideDatasources: t.overrideDatasources, env: { ...t.env, ...process.env }, clientVersion: t.clientVersion });
  } catch {
  }
  let n = !!((r == null ? void 0 : r.startsWith("prisma://")) || (r == null ? void 0 : r.startsWith("prisma+postgres://")));
  e10 && n && tr("recommend--no-engine", "In production, we recommend using `prisma generate --no-engine` (See: `prisma generate --help`)");
  let i = Yt(t.generator), o = n || !e10, s = !!t.adapter, a = i === "library";
  if (o && s || s && false) {
    let u;
    throw e10 ? (r == null ? void 0 : r.startsWith("prisma://")) ? u = ["Prisma Client was configured to use the `adapter` option but the URL was a `prisma://` URL.", "Please either use the `prisma://` URL or remove the `adapter` from the Prisma Client constructor."] : u = ["Prisma Client was configured to use both the `adapter` and Accelerate, please chose one."] : u = ["Prisma Client was configured to use the `adapter` option but `prisma generate` was run with `--no-engine`.", "Please run `prisma generate` without `--no-engine` to be able to use Prisma Client with the adapter."], new J(u.join(`
`), { clientVersion: t.clientVersion });
  }
  if (o) return new Dr(t);
  if (a) return new _r(t);
  throw new J("Invalid client engine type, please use `library` or `binary`", { clientVersion: t.clientVersion });
}
function Fn({ generator: e10 }) {
  return (e10 == null ? void 0 : e10.previewFeatures) ?? [];
}
var yl = (e10) => ({ command: e10 });
var bl = (e10) => e10.strings.reduce((t, r, n) => `${t}@P${n}${r}`);
function jt(e10) {
  try {
    return El(e10, "fast");
  } catch {
    return El(e10, "slow");
  }
}
function El(e10, t) {
  return JSON.stringify(e10.map((r) => xl(r, t)));
}
function xl(e10, t) {
  return Array.isArray(e10) ? e10.map((r) => xl(r, t)) : typeof e10 == "bigint" ? { prisma__type: "bigint", prisma__value: e10.toString() } : Pt(e10) ? { prisma__type: "date", prisma__value: e10.toJSON() } : xe.isDecimal(e10) ? { prisma__type: "decimal", prisma__value: e10.toJSON() } : Buffer.isBuffer(e10) ? { prisma__type: "bytes", prisma__value: e10.toString("base64") } : ym(e10) || ArrayBuffer.isView(e10) ? { prisma__type: "bytes", prisma__value: Buffer.from(e10).toString("base64") } : typeof e10 == "object" && t === "slow" ? Pl(e10) : e10;
}
function ym(e10) {
  return e10 instanceof ArrayBuffer || e10 instanceof SharedArrayBuffer ? true : typeof e10 == "object" && e10 !== null ? e10[Symbol.toStringTag] === "ArrayBuffer" || e10[Symbol.toStringTag] === "SharedArrayBuffer" : false;
}
function Pl(e10) {
  if (typeof e10 != "object" || e10 === null) return e10;
  if (typeof e10.toJSON == "function") return e10.toJSON();
  if (Array.isArray(e10)) return e10.map(wl);
  let t = {};
  for (let r of Object.keys(e10)) t[r] = wl(e10[r]);
  return t;
}
function wl(e10) {
  return typeof e10 == "bigint" ? e10.toString() : Pl(e10);
}
var bm = ["$connect", "$disconnect", "$on", "$transaction", "$use", "$extends"], vl = bm;
var Em = /^(\s*alter\s)/i, Tl = L("prisma:client");
function uo(e10, t, r, n) {
  if (!(e10 !== "postgresql" && e10 !== "cockroachdb") && r.length > 0 && Em.exec(t)) throw new Error(`Running ALTER using ${n} is not supported
Using the example below you can still execute your query with Prisma, but please note that it is vulnerable to SQL injection attacks and requires you to take care of input sanitization.

Example:
  await prisma.$executeRawUnsafe(\`ALTER USER prisma WITH PASSWORD '\${password}'\`)

More Information: https://pris.ly/d/execute-raw
`);
}
var co = ({ clientMethod: e10, activeProvider: t }) => (r) => {
  let n = "", i;
  if (pa(r)) n = r.sql, i = { values: jt(r.values), __prismaRawParameters__: true };
  else if (Array.isArray(r)) {
    let [o, ...s] = r;
    n = o, i = { values: jt(s || []), __prismaRawParameters__: true };
  } else switch (t) {
    case "sqlite":
    case "mysql": {
      n = r.sql, i = { values: jt(r.values), __prismaRawParameters__: true };
      break;
    }
    case "cockroachdb":
    case "postgresql":
    case "postgres": {
      n = r.text, i = { values: jt(r.values), __prismaRawParameters__: true };
      break;
    }
    case "sqlserver": {
      n = bl(r), i = { values: jt(r.values), __prismaRawParameters__: true };
      break;
    }
    default:
      throw new Error(`The ${t} provider does not support ${e10}`);
  }
  return (i == null ? void 0 : i.values) ? Tl(`prisma.${e10}(${n}, ${i.values})`) : Tl(`prisma.${e10}(${n})`), { query: n, parameters: i };
}, Rl = { requestArgsToMiddlewareArgs(e10) {
  return [e10.strings, ...e10.values];
}, middlewareArgsToRequestArgs(e10) {
  let [t, ...r] = e10;
  return new oe(t, r);
} }, Cl = { requestArgsToMiddlewareArgs(e10) {
  return [e10];
}, middlewareArgsToRequestArgs(e10) {
  return e10[0];
} };
function po(e10) {
  return function(r) {
    let n, i = (o = e10) => {
      try {
        return o === void 0 || (o == null ? void 0 : o.kind) === "itx" ? n ?? (n = Sl(r(o))) : Sl(r(o));
      } catch (s) {
        return Promise.reject(s);
      }
    };
    return { then(o, s) {
      return i().then(o, s);
    }, catch(o) {
      return i().catch(o);
    }, finally(o) {
      return i().finally(o);
    }, requestTransaction(o) {
      let s = i(o);
      return s.requestTransaction ? s.requestTransaction(o) : s;
    }, [Symbol.toStringTag]: "PrismaPromise" };
  };
}
function Sl(e10) {
  return typeof e10.then == "function" ? e10 : Promise.resolve(e10);
}
var Al = { isEnabled() {
  return false;
}, getTraceParent() {
  return "00-10-10-00";
}, async createEngineSpan() {
}, getActiveContext() {
}, runInChildSpan(e10, t) {
  return t();
} }, mo = class {
  isEnabled() {
    return this.getGlobalTracingHelper().isEnabled();
  }
  getTraceParent(t) {
    return this.getGlobalTracingHelper().getTraceParent(t);
  }
  createEngineSpan(t) {
    return this.getGlobalTracingHelper().createEngineSpan(t);
  }
  getActiveContext() {
    return this.getGlobalTracingHelper().getActiveContext();
  }
  runInChildSpan(t, r) {
    return this.getGlobalTracingHelper().runInChildSpan(t, r);
  }
  getGlobalTracingHelper() {
    var _a2;
    return ((_a2 = globalThis.PRISMA_INSTRUMENTATION) == null ? void 0 : _a2.helper) ?? Al;
  }
};
function Il(e10) {
  return e10.includes("tracing") ? new mo() : Al;
}
function Ol(e10, t = () => {
}) {
  let r, n = new Promise((i) => r = i);
  return { then(i) {
    return --e10 === 0 && r(t()), i == null ? void 0 : i(n);
  } };
}
function kl(e10) {
  return typeof e10 == "string" ? e10 : e10.reduce((t, r) => {
    let n = typeof r == "string" ? r : r.level;
    return n === "query" ? t : t && (r === "info" || t === "info") ? "info" : n;
  }, void 0);
}
var Ln = class {
  constructor() {
    this._middlewares = [];
  }
  use(t) {
    this._middlewares.push(t);
  }
  get(t) {
    return this._middlewares[t];
  }
  has(t) {
    return !!this._middlewares[t];
  }
  length() {
    return this._middlewares.length;
  }
};
var Fl = k(bi());
function Nn(e10) {
  return typeof e10.batchRequestIdx == "number";
}
function Dl(e10) {
  if (e10.action !== "findUnique" && e10.action !== "findUniqueOrThrow") return;
  let t = [];
  return e10.modelName && t.push(e10.modelName), e10.query.arguments && t.push(fo(e10.query.arguments)), t.push(fo(e10.query.selection)), t.join("");
}
function fo(e10) {
  return `(${Object.keys(e10).sort().map((r) => {
    let n = e10[r];
    return typeof n == "object" && n !== null ? `(${r} ${fo(n)})` : r;
  }).join(" ")})`;
}
var wm = { aggregate: false, aggregateRaw: false, createMany: true, createManyAndReturn: true, createOne: true, deleteMany: true, deleteOne: true, executeRaw: true, findFirst: false, findFirstOrThrow: false, findMany: false, findRaw: false, findUnique: false, findUniqueOrThrow: false, groupBy: false, queryRaw: false, runCommandRaw: true, updateMany: true, updateOne: true, upsertOne: true };
function go(e10) {
  return wm[e10];
}
var Mn = class {
  constructor(t) {
    this.options = t;
    this.tickActive = false;
    this.batches = {};
  }
  request(t) {
    let r = this.options.batchBy(t);
    return r ? (this.batches[r] || (this.batches[r] = [], this.tickActive || (this.tickActive = true, process.nextTick(() => {
      this.dispatchBatches(), this.tickActive = false;
    }))), new Promise((n, i) => {
      this.batches[r].push({ request: t, resolve: n, reject: i });
    })) : this.options.singleLoader(t);
  }
  dispatchBatches() {
    for (let t in this.batches) {
      let r = this.batches[t];
      delete this.batches[t], r.length === 1 ? this.options.singleLoader(r[0].request).then((n) => {
        n instanceof Error ? r[0].reject(n) : r[0].resolve(n);
      }).catch((n) => {
        r[0].reject(n);
      }) : (r.sort((n, i) => this.options.batchOrder(n.request, i.request)), this.options.batchLoader(r.map((n) => n.request)).then((n) => {
        if (n instanceof Error) for (let i = 0; i < r.length; i++) r[i].reject(n);
        else for (let i = 0; i < r.length; i++) {
          let o = n[i];
          o instanceof Error ? r[i].reject(o) : r[i].resolve(o);
        }
      }).catch((n) => {
        for (let i = 0; i < r.length; i++) r[i].reject(n);
      }));
    }
  }
  get [Symbol.toStringTag]() {
    return "DataLoader";
  }
};
function pt(e10, t) {
  if (t === null) return t;
  switch (e10) {
    case "bigint":
      return BigInt(t);
    case "bytes":
      return Buffer.from(t, "base64");
    case "decimal":
      return new xe(t);
    case "datetime":
    case "date":
      return new Date(t);
    case "time":
      return /* @__PURE__ */ new Date(`1970-01-01T${t}Z`);
    case "bigint-array":
      return t.map((r) => pt("bigint", r));
    case "bytes-array":
      return t.map((r) => pt("bytes", r));
    case "decimal-array":
      return t.map((r) => pt("decimal", r));
    case "datetime-array":
      return t.map((r) => pt("datetime", r));
    case "date-array":
      return t.map((r) => pt("date", r));
    case "time-array":
      return t.map((r) => pt("time", r));
    default:
      return t;
  }
}
function _l(e10) {
  let t = [], r = xm(e10);
  for (let n = 0; n < e10.rows.length; n++) {
    let i = e10.rows[n], o = { ...r };
    for (let s = 0; s < i.length; s++) o[e10.columns[s]] = pt(e10.types[s], i[s]);
    t.push(o);
  }
  return t;
}
function xm(e10) {
  let t = {};
  for (let r = 0; r < e10.columns.length; r++) t[e10.columns[r]] = null;
  return t;
}
var Pm = L("prisma:client:request_handler"), $n = class {
  constructor(t, r) {
    this.logEmitter = r, this.client = t, this.dataloader = new Mn({ batchLoader: Ma(async ({ requests: n, customDataProxyFetch: i }) => {
      let { transaction: o, otelParentCtx: s } = n[0], a = n.map((p) => p.protocolQuery), l = this.client._tracingHelper.getTraceParent(s), u = n.some((p) => go(p.protocolQuery.action));
      return (await this.client._engine.requestBatch(a, { traceparent: l, transaction: vm(o), containsWrite: u, customDataProxyFetch: i })).map((p, d) => {
        if (p instanceof Error) return p;
        try {
          return this.mapQueryEngineResult(n[d], p);
        } catch (f) {
          return f;
        }
      });
    }), singleLoader: async (n) => {
      var _a2;
      let i = ((_a2 = n.transaction) == null ? void 0 : _a2.kind) === "itx" ? Ll(n.transaction) : void 0, o = await this.client._engine.request(n.protocolQuery, { traceparent: this.client._tracingHelper.getTraceParent(), interactiveTransaction: i, isWrite: go(n.protocolQuery.action), customDataProxyFetch: n.customDataProxyFetch });
      return this.mapQueryEngineResult(n, o);
    }, batchBy: (n) => {
      var _a2;
      return ((_a2 = n.transaction) == null ? void 0 : _a2.id) ? `transaction-${n.transaction.id}` : Dl(n.protocolQuery);
    }, batchOrder(n, i) {
      var _a2, _b;
      return ((_a2 = n.transaction) == null ? void 0 : _a2.kind) === "batch" && ((_b = i.transaction) == null ? void 0 : _b.kind) === "batch" ? n.transaction.index - i.transaction.index : 0;
    } });
  }
  async request(t) {
    try {
      return await this.dataloader.request(t);
    } catch (r) {
      let { clientMethod: n, callsite: i, transaction: o, args: s, modelName: a } = t;
      this.handleAndLogRequestError({ error: r, clientMethod: n, callsite: i, transaction: o, args: s, modelName: a, globalOmit: t.globalOmit });
    }
  }
  mapQueryEngineResult({ dataPath: t, unpacker: r }, n) {
    let i = n == null ? void 0 : n.data, o = n == null ? void 0 : n.elapsed, s = this.unpack(i, t, r);
    return process.env.PRISMA_CLIENT_GET_TIME ? { data: s, elapsed: o } : s;
  }
  handleAndLogRequestError(t) {
    try {
      this.handleRequestError(t);
    } catch (r) {
      throw this.logEmitter && this.logEmitter.emit("error", { message: r.message, target: t.clientMethod, timestamp: /* @__PURE__ */ new Date() }), r;
    }
  }
  handleRequestError({ error: t, clientMethod: r, callsite: n, transaction: i, args: o, modelName: s, globalOmit: a }) {
    if (Pm(t), Tm(t, i) || t instanceof Le) throw t;
    if (t instanceof V && Rm(t)) {
      let u = Nl(t.meta);
      wn({ args: o, errors: [u], callsite: n, errorFormat: this.client._errorFormat, originalMethod: r, clientVersion: this.client._clientVersion, globalOmit: a });
    }
    let l = t.message;
    if (n && (l = Tt({ callsite: n, originalMethod: r, isPanic: t.isPanic, showColors: this.client._errorFormat === "pretty", message: l })), l = this.sanitizeMessage(l), t.code) {
      let u = s ? { modelName: s, ...t.meta } : t.meta;
      throw new V(l, { code: t.code, clientVersion: this.client._clientVersion, meta: u, batchRequestIdx: t.batchRequestIdx });
    } else {
      if (t.isPanic) throw new le(l, this.client._clientVersion);
      if (t instanceof B) throw new B(l, { clientVersion: this.client._clientVersion, batchRequestIdx: t.batchRequestIdx });
      if (t instanceof R) throw new R(l, this.client._clientVersion);
      if (t instanceof le) throw new le(l, this.client._clientVersion);
    }
    throw t.clientVersion = this.client._clientVersion, t;
  }
  sanitizeMessage(t) {
    return this.client._errorFormat && this.client._errorFormat !== "pretty" ? (0, Fl.default)(t) : t;
  }
  unpack(t, r, n) {
    if (!t || (t.data && (t = t.data), !t)) return t;
    let i = Object.keys(t)[0], o = Object.values(t)[0], s = r.filter((u) => u !== "select" && u !== "include"), a = Gi(o, s), l = i === "queryRaw" ? _l(a) : wt(a);
    return n ? n(l) : l;
  }
  get [Symbol.toStringTag]() {
    return "RequestHandler";
  }
};
function vm(e10) {
  if (e10) {
    if (e10.kind === "batch") return { kind: "batch", options: { isolationLevel: e10.isolationLevel } };
    if (e10.kind === "itx") return { kind: "itx", options: Ll(e10) };
    Fe(e10, "Unknown transaction kind");
  }
}
function Ll(e10) {
  return { id: e10.id, payload: e10.payload };
}
function Tm(e10, t) {
  return Nn(e10) && (t == null ? void 0 : t.kind) === "batch" && e10.batchRequestIdx !== t.index;
}
function Rm(e10) {
  return e10.code === "P2009" || e10.code === "P2012";
}
function Nl(e10) {
  if (e10.kind === "Union") return { kind: "Union", errors: e10.errors.map(Nl) };
  if (Array.isArray(e10.selectionPath)) {
    let [, ...t] = e10.selectionPath;
    return { ...e10, selectionPath: t };
  }
  return e10;
}
var Ml = "5.22.0";
var $l = Ml;
var Ul = k(Ai());
var F = class extends Error {
  constructor(t) {
    super(t + `
Read more at https://pris.ly/d/client-constructor`), this.name = "PrismaClientConstructorValidationError";
  }
  get [Symbol.toStringTag]() {
    return "PrismaClientConstructorValidationError";
  }
};
w(F, "PrismaClientConstructorValidationError");
var ql = ["datasources", "datasourceUrl", "errorFormat", "adapter", "log", "transactionOptions", "omit", "__internal"], jl = ["pretty", "colorless", "minimal"], Vl = ["info", "query", "warn", "error"], Sm = { datasources: (e10, { datasourceNames: t }) => {
  if (e10) {
    if (typeof e10 != "object" || Array.isArray(e10)) throw new F(`Invalid value ${JSON.stringify(e10)} for "datasources" provided to PrismaClient constructor`);
    for (let [r, n] of Object.entries(e10)) {
      if (!t.includes(r)) {
        let i = Vt(r, t) || ` Available datasources: ${t.join(", ")}`;
        throw new F(`Unknown datasource ${r} provided to PrismaClient constructor.${i}`);
      }
      if (typeof n != "object" || Array.isArray(n)) throw new F(`Invalid value ${JSON.stringify(e10)} for datasource "${r}" provided to PrismaClient constructor.
It should have this form: { url: "CONNECTION_STRING" }`);
      if (n && typeof n == "object") for (let [i, o] of Object.entries(n)) {
        if (i !== "url") throw new F(`Invalid value ${JSON.stringify(e10)} for datasource "${r}" provided to PrismaClient constructor.
It should have this form: { url: "CONNECTION_STRING" }`);
        if (typeof o != "string") throw new F(`Invalid value ${JSON.stringify(o)} for datasource "${r}" provided to PrismaClient constructor.
It should have this form: { url: "CONNECTION_STRING" }`);
      }
    }
  }
}, adapter: (e10, t) => {
  if (e10 === null) return;
  if (e10 === void 0) throw new F('"adapter" property must not be undefined, use null to conditionally disable driver adapters.');
  if (!Fn(t).includes("driverAdapters")) throw new F('"adapter" property can only be provided to PrismaClient constructor when "driverAdapters" preview feature is enabled.');
  if (Yt() === "binary") throw new F('Cannot use a driver adapter with the "binary" Query Engine. Please use the "library" Query Engine.');
}, datasourceUrl: (e10) => {
  if (typeof e10 < "u" && typeof e10 != "string") throw new F(`Invalid value ${JSON.stringify(e10)} for "datasourceUrl" provided to PrismaClient constructor.
Expected string or undefined.`);
}, errorFormat: (e10) => {
  if (e10) {
    if (typeof e10 != "string") throw new F(`Invalid value ${JSON.stringify(e10)} for "errorFormat" provided to PrismaClient constructor.`);
    if (!jl.includes(e10)) {
      let t = Vt(e10, jl);
      throw new F(`Invalid errorFormat ${e10} provided to PrismaClient constructor.${t}`);
    }
  }
}, log: (e10) => {
  if (!e10) return;
  if (!Array.isArray(e10)) throw new F(`Invalid value ${JSON.stringify(e10)} for "log" provided to PrismaClient constructor.`);
  function t(r) {
    if (typeof r == "string" && !Vl.includes(r)) {
      let n = Vt(r, Vl);
      throw new F(`Invalid log level "${r}" provided to PrismaClient constructor.${n}`);
    }
  }
  for (let r of e10) {
    t(r);
    let n = { level: t, emit: (i) => {
      let o = ["stdout", "event"];
      if (!o.includes(i)) {
        let s = Vt(i, o);
        throw new F(`Invalid value ${JSON.stringify(i)} for "emit" in logLevel provided to PrismaClient constructor.${s}`);
      }
    } };
    if (r && typeof r == "object") for (let [i, o] of Object.entries(r)) if (n[i]) n[i](o);
    else throw new F(`Invalid property ${i} for "log" provided to PrismaClient constructor`);
  }
}, transactionOptions: (e10) => {
  if (!e10) return;
  let t = e10.maxWait;
  if (t != null && t <= 0) throw new F(`Invalid value ${t} for maxWait in "transactionOptions" provided to PrismaClient constructor. maxWait needs to be greater than 0`);
  let r = e10.timeout;
  if (r != null && r <= 0) throw new F(`Invalid value ${r} for timeout in "transactionOptions" provided to PrismaClient constructor. timeout needs to be greater than 0`);
}, omit: (e10, t) => {
  if (typeof e10 != "object") throw new F('"omit" option is expected to be an object.');
  if (e10 === null) throw new F('"omit" option can not be `null`');
  let r = [];
  for (let [n, i] of Object.entries(e10)) {
    let o = Im(n, t.runtimeDataModel);
    if (!o) {
      r.push({ kind: "UnknownModel", modelKey: n });
      continue;
    }
    for (let [s, a] of Object.entries(i)) {
      let l = o.fields.find((u) => u.name === s);
      if (!l) {
        r.push({ kind: "UnknownField", modelKey: n, fieldName: s });
        continue;
      }
      if (l.relationName) {
        r.push({ kind: "RelationInOmit", modelKey: n, fieldName: s });
        continue;
      }
      typeof a != "boolean" && r.push({ kind: "InvalidFieldValue", modelKey: n, fieldName: s });
    }
  }
  if (r.length > 0) throw new F(Om(e10, r));
}, __internal: (e10) => {
  if (!e10) return;
  let t = ["debug", "engine", "configOverride"];
  if (typeof e10 != "object") throw new F(`Invalid value ${JSON.stringify(e10)} for "__internal" to PrismaClient constructor`);
  for (let [r] of Object.entries(e10)) if (!t.includes(r)) {
    let n = Vt(r, t);
    throw new F(`Invalid property ${JSON.stringify(r)} for "__internal" provided to PrismaClient constructor.${n}`);
  }
} };
function Gl(e10, t) {
  for (let [r, n] of Object.entries(e10)) {
    if (!ql.includes(r)) {
      let i = Vt(r, ql);
      throw new F(`Unknown property ${r} provided to PrismaClient constructor.${i}`);
    }
    Sm[r](n, t);
  }
  if (e10.datasourceUrl && e10.datasources) throw new F('Can not use "datasourceUrl" and "datasources" options at the same time. Pick one of them');
}
function Vt(e10, t) {
  if (t.length === 0 || typeof e10 != "string") return "";
  let r = Am(e10, t);
  return r ? ` Did you mean "${r}"?` : "";
}
function Am(e10, t) {
  if (t.length === 0) return null;
  let r = t.map((i) => ({ value: i, distance: (0, Ul.default)(e10, i) }));
  r.sort((i, o) => i.distance < o.distance ? -1 : 1);
  let n = r[0];
  return n.distance < 3 ? n.value : null;
}
function Im(e10, t) {
  return Bl(t.models, e10) ?? Bl(t.types, e10);
}
function Bl(e10, t) {
  let r = Object.keys(e10).find((n) => xt(n) === t);
  if (r) return e10[r];
}
function Om(e10, t) {
  var _a2, _b, _c2, _d2;
  let r = Ot(e10);
  for (let o of t) switch (o.kind) {
    case "UnknownModel":
      (_a2 = r.arguments.getField(o.modelKey)) == null ? void 0 : _a2.markAsError(), r.addErrorMessage(() => `Unknown model name: ${o.modelKey}.`);
      break;
    case "UnknownField":
      (_b = r.arguments.getDeepField([o.modelKey, o.fieldName])) == null ? void 0 : _b.markAsError(), r.addErrorMessage(() => `Model "${o.modelKey}" does not have a field named "${o.fieldName}".`);
      break;
    case "RelationInOmit":
      (_c2 = r.arguments.getDeepField([o.modelKey, o.fieldName])) == null ? void 0 : _c2.markAsError(), r.addErrorMessage(() => 'Relations are already excluded by default and can not be specified in "omit".');
      break;
    case "InvalidFieldValue":
      (_d2 = r.arguments.getDeepFieldValue([o.modelKey, o.fieldName])) == null ? void 0 : _d2.markAsError(), r.addErrorMessage(() => "Omit field option value must be a boolean.");
      break;
  }
  let { message: n, args: i } = En(r, "colorless");
  return `Error validating "omit" option:

${i}

${n}`;
}
function Ql(e10) {
  return e10.length === 0 ? Promise.resolve([]) : new Promise((t, r) => {
    let n = new Array(e10.length), i = null, o = false, s = 0, a = () => {
      o || (s++, s === e10.length && (o = true, i ? r(i) : t(n)));
    }, l = (u) => {
      o || (o = true, r(u));
    };
    for (let u = 0; u < e10.length; u++) e10[u].then((c) => {
      n[u] = c, a();
    }, (c) => {
      if (!Nn(c)) {
        l(c);
        return;
      }
      c.batchRequestIdx === u ? l(c) : (i || (i = c), a());
    });
  });
}
var tt = L("prisma:client");
typeof globalThis == "object" && (globalThis.NODE_CLIENT = true);
var km = { requestArgsToMiddlewareArgs: (e10) => e10, middlewareArgsToRequestArgs: (e10) => e10 }, Dm = Symbol.for("prisma.client.transaction.id"), _m = { id: 0, nextId() {
  return ++this.id;
} };
function Yl(e10) {
  class t {
    constructor(n) {
      var _a2, _b, _c2, _d2, _e2, _f;
      this._originalClient = this;
      this._middlewares = new Ln();
      this._createPrismaPromise = po();
      this.$extends = Ia;
      e10 = ((_b = (_a2 = n == null ? void 0 : n.__internal) == null ? void 0 : _a2.configOverride) == null ? void 0 : _b.call(_a2, e10)) ?? e10, Ba(e10), n && Gl(n, e10);
      let i = new Kl.EventEmitter().on("error", () => {
      });
      this._extensions = kt.empty(), this._previewFeatures = Fn(e10), this._clientVersion = e10.clientVersion ?? $l, this._activeProvider = e10.activeProvider, this._globalOmit = n == null ? void 0 : n.omit, this._tracingHelper = Il(this._previewFeatures);
      let o = { rootEnvPath: e10.relativeEnvPaths.rootEnvPath && Fr.default.resolve(e10.dirname, e10.relativeEnvPaths.rootEnvPath), schemaEnvPath: e10.relativeEnvPaths.schemaEnvPath && Fr.default.resolve(e10.dirname, e10.relativeEnvPaths.schemaEnvPath) }, s;
      if (n == null ? void 0 : n.adapter) {
        s = qi(n.adapter);
        let l = e10.activeProvider === "postgresql" ? "postgres" : e10.activeProvider;
        if (s.provider !== l) throw new R(`The Driver Adapter \`${s.adapterName}\`, based on \`${s.provider}\`, is not compatible with the provider \`${l}\` specified in the Prisma schema.`, this._clientVersion);
        if (n.datasources || n.datasourceUrl !== void 0) throw new R("Custom datasource configuration is not compatible with Prisma Driver Adapters. Please define the database connection string directly in the Driver Adapter configuration.", this._clientVersion);
      }
      let a = !s && zt(o, { conflictCheck: "none" }) || ((_c2 = e10.injectableEdgeEnv) == null ? void 0 : _c2.call(e10));
      try {
        let l = n ?? {}, u = l.__internal ?? {}, c = u.debug === true;
        c && L.enable("prisma:client");
        let p = Fr.default.resolve(e10.dirname, e10.relativePath);
        zl.default.existsSync(p) || (p = e10.dirname), tt("dirname", e10.dirname), tt("relativePath", e10.relativePath), tt("cwd", p);
        let d = u.engine || {};
        if (l.errorFormat ? this._errorFormat = l.errorFormat : process.env.NODE_ENV === "production" ? this._errorFormat = "minimal" : process.env.NO_COLOR ? this._errorFormat = "colorless" : this._errorFormat = "colorless", this._runtimeDataModel = e10.runtimeDataModel, this._engineConfig = { cwd: p, dirname: e10.dirname, enableDebugLogs: c, allowTriggerPanic: d.allowTriggerPanic, datamodelPath: Fr.default.join(e10.dirname, e10.filename ?? "schema.prisma"), prismaPath: d.binaryPath ?? void 0, engineEndpoint: d.endpoint, generator: e10.generator, showColors: this._errorFormat === "pretty", logLevel: l.log && kl(l.log), logQueries: l.log && !!(typeof l.log == "string" ? l.log === "query" : l.log.find((f) => typeof f == "string" ? f === "query" : f.level === "query")), env: (a == null ? void 0 : a.parsed) ?? {}, flags: [], engineWasm: e10.engineWasm, clientVersion: e10.clientVersion, engineVersion: e10.engineVersion, previewFeatures: this._previewFeatures, activeProvider: e10.activeProvider, inlineSchema: e10.inlineSchema, overrideDatasources: Ua(l, e10.datasourceNames), inlineDatasources: e10.inlineDatasources, inlineSchemaHash: e10.inlineSchemaHash, tracingHelper: this._tracingHelper, transactionOptions: { maxWait: ((_d2 = l.transactionOptions) == null ? void 0 : _d2.maxWait) ?? 2e3, timeout: ((_e2 = l.transactionOptions) == null ? void 0 : _e2.timeout) ?? 5e3, isolationLevel: (_f = l.transactionOptions) == null ? void 0 : _f.isolationLevel }, logEmitter: i, isBundled: e10.isBundled, adapter: s }, this._accelerateEngineConfig = { ...this._engineConfig, accelerateUtils: { resolveDatasourceUrl: Nt, getBatchRequestPayload: Ft, prismaGraphQLToJSError: st, PrismaClientUnknownRequestError: B, PrismaClientInitializationError: R, PrismaClientKnownRequestError: V, debug: L("prisma:client:accelerateEngine"), engineVersion: Wl.version, clientVersion: e10.clientVersion } }, tt("clientVersion", e10.clientVersion), this._engine = hl(e10, this._engineConfig), this._requestHandler = new $n(this, i), l.log) for (let f of l.log) {
          let g = typeof f == "string" ? f : f.emit === "stdout" ? f.level : null;
          g && this.$on(g, (h) => {
            er.log(`${er.tags[g] ?? ""}`, h.message || h.query);
          });
        }
        this._metrics = new Dt(this._engine);
      } catch (l) {
        throw l.clientVersion = this._clientVersion, l;
      }
      return this._appliedParent = yr(this);
    }
    get [Symbol.toStringTag]() {
      return "PrismaClient";
    }
    $use(n) {
      this._middlewares.use(n);
    }
    $on(n, i) {
      n === "beforeExit" ? this._engine.onBeforeExit(i) : n && this._engineConfig.logEmitter.on(n, i);
    }
    $connect() {
      try {
        return this._engine.start();
      } catch (n) {
        throw n.clientVersion = this._clientVersion, n;
      }
    }
    async $disconnect() {
      try {
        await this._engine.stop();
      } catch (n) {
        throw n.clientVersion = this._clientVersion, n;
      } finally {
        Ao();
      }
    }
    $executeRawInternal(n, i, o, s) {
      let a = this._activeProvider;
      return this._request({ action: "executeRaw", args: o, transaction: n, clientMethod: i, argsMapper: co({ clientMethod: i, activeProvider: a }), callsite: Ze(this._errorFormat), dataPath: [], middlewareArgsMapper: s });
    }
    $executeRaw(n, ...i) {
      return this._createPrismaPromise((o) => {
        if (n.raw !== void 0 || n.sql !== void 0) {
          let [s, a] = Jl(n, i);
          return uo(this._activeProvider, s.text, s.values, Array.isArray(n) ? "prisma.$executeRaw`<SQL>`" : "prisma.$executeRaw(sql`<SQL>`)"), this.$executeRawInternal(o, "$executeRaw", s, a);
        }
        throw new J("`$executeRaw` is a tag function, please use it like the following:\n```\nconst result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`\n```\n\nOr read our docs at https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access#executeraw\n", { clientVersion: this._clientVersion });
      });
    }
    $executeRawUnsafe(n, ...i) {
      return this._createPrismaPromise((o) => (uo(this._activeProvider, n, i, "prisma.$executeRawUnsafe(<SQL>, [...values])"), this.$executeRawInternal(o, "$executeRawUnsafe", [n, ...i])));
    }
    $runCommandRaw(n) {
      if (e10.activeProvider !== "mongodb") throw new J(`The ${e10.activeProvider} provider does not support $runCommandRaw. Use the mongodb provider.`, { clientVersion: this._clientVersion });
      return this._createPrismaPromise((i) => this._request({ args: n, clientMethod: "$runCommandRaw", dataPath: [], action: "runCommandRaw", argsMapper: yl, callsite: Ze(this._errorFormat), transaction: i }));
    }
    async $queryRawInternal(n, i, o, s) {
      let a = this._activeProvider;
      return this._request({ action: "queryRaw", args: o, transaction: n, clientMethod: i, argsMapper: co({ clientMethod: i, activeProvider: a }), callsite: Ze(this._errorFormat), dataPath: [], middlewareArgsMapper: s });
    }
    $queryRaw(n, ...i) {
      return this._createPrismaPromise((o) => {
        if (n.raw !== void 0 || n.sql !== void 0) return this.$queryRawInternal(o, "$queryRaw", ...Jl(n, i));
        throw new J("`$queryRaw` is a tag function, please use it like the following:\n```\nconst result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`\n```\n\nOr read our docs at https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access#queryraw\n", { clientVersion: this._clientVersion });
      });
    }
    $queryRawTyped(n) {
      return this._createPrismaPromise((i) => {
        if (!this._hasPreviewFlag("typedSql")) throw new J("`typedSql` preview feature must be enabled in order to access $queryRawTyped API", { clientVersion: this._clientVersion });
        return this.$queryRawInternal(i, "$queryRawTyped", n);
      });
    }
    $queryRawUnsafe(n, ...i) {
      return this._createPrismaPromise((o) => this.$queryRawInternal(o, "$queryRawUnsafe", [n, ...i]));
    }
    _transactionWithArray({ promises: n, options: i }) {
      let o = _m.nextId(), s = Ol(n.length), a = n.map((l, u) => {
        var _a2;
        if ((l == null ? void 0 : l[Symbol.toStringTag]) !== "PrismaPromise") throw new Error("All elements of the array need to be Prisma Client promises. Hint: Please make sure you are not awaiting the Prisma client calls you intended to pass in the $transaction function.");
        let c = (i == null ? void 0 : i.isolationLevel) ?? this._engineConfig.transactionOptions.isolationLevel, p = { kind: "batch", id: o, index: u, isolationLevel: c, lock: s };
        return ((_a2 = l.requestTransaction) == null ? void 0 : _a2.call(l, p)) ?? l;
      });
      return Ql(a);
    }
    async _transactionWithCallback({ callback: n, options: i }) {
      let o = { traceparent: this._tracingHelper.getTraceParent() }, s = { maxWait: (i == null ? void 0 : i.maxWait) ?? this._engineConfig.transactionOptions.maxWait, timeout: (i == null ? void 0 : i.timeout) ?? this._engineConfig.transactionOptions.timeout, isolationLevel: (i == null ? void 0 : i.isolationLevel) ?? this._engineConfig.transactionOptions.isolationLevel }, a = await this._engine.transaction("start", o, s), l;
      try {
        let u = { kind: "itx", ...a };
        l = await n(this._createItxClient(u)), await this._engine.transaction("commit", o, a);
      } catch (u) {
        throw await this._engine.transaction("rollback", o, a).catch(() => {
        }), u;
      }
      return l;
    }
    _createItxClient(n) {
      return yr(Se(Aa(this), [re("_appliedParent", () => this._appliedParent._createItxClient(n)), re("_createPrismaPromise", () => po(n)), re(Dm, () => n.id), _t(vl)]));
    }
    $transaction(n, i) {
      var _a2;
      let o;
      typeof n == "function" ? ((_a2 = this._engineConfig.adapter) == null ? void 0 : _a2.adapterName) === "@prisma/adapter-d1" ? o = () => {
        throw new Error("Cloudflare D1 does not support interactive transactions. We recommend you to refactor your queries with that limitation in mind, and use batch transactions with `prisma.$transactions([])` where applicable.");
      } : o = () => this._transactionWithCallback({ callback: n, options: i }) : o = () => this._transactionWithArray({ promises: n, options: i });
      let s = { name: "transaction", attributes: { method: "$transaction" } };
      return this._tracingHelper.runInChildSpan(s, o);
    }
    _request(n) {
      n.otelParentCtx = this._tracingHelper.getActiveContext();
      let i = n.middlewareArgsMapper ?? km, o = { args: i.requestArgsToMiddlewareArgs(n.args), dataPath: n.dataPath, runInTransaction: !!n.transaction, action: n.action, model: n.model }, s = { middleware: { name: "middleware", middleware: true, attributes: { method: "$use" }, active: false }, operation: { name: "operation", attributes: { method: o.action, model: o.model, name: o.model ? `${o.model}.${o.action}` : o.action } } }, a = -1, l = async (u) => {
        let c = this._middlewares.get(++a);
        if (c) return this._tracingHelper.runInChildSpan(s.middleware, (O) => c(u, (T) => (O == null ? void 0 : O.end(), l(T))));
        let { runInTransaction: p, args: d, ...f } = u, g = { ...n, ...f };
        d && (g.args = i.middlewareArgsToRequestArgs(d)), n.transaction !== void 0 && p === false && delete g.transaction;
        let h = await Na(this, g);
        return g.model ? Da({ result: h, modelName: g.model, args: g.args, extensions: this._extensions, runtimeDataModel: this._runtimeDataModel, globalOmit: this._globalOmit }) : h;
      };
      return this._tracingHelper.runInChildSpan(s.operation, () => new Hl.AsyncResource("prisma-client-request").runInAsyncScope(() => l(o)));
    }
    async _executeRequest({ args: n, clientMethod: i, dataPath: o, callsite: s, action: a, model: l, argsMapper: u, transaction: c, unpacker: p, otelParentCtx: d, customDataProxyFetch: f }) {
      try {
        n = u ? u(n) : n;
        let g = { name: "serialize" }, h = this._tracingHelper.runInChildSpan(g, () => vn({ modelName: l, runtimeDataModel: this._runtimeDataModel, action: a, args: n, clientMethod: i, callsite: s, extensions: this._extensions, errorFormat: this._errorFormat, clientVersion: this._clientVersion, previewFeatures: this._previewFeatures, globalOmit: this._globalOmit }));
        return L.enabled("prisma:client") && (tt("Prisma Client call:"), tt(`prisma.${i}(${ha(n)})`), tt("Generated request:"), tt(JSON.stringify(h, null, 2) + `
`)), (c == null ? void 0 : c.kind) === "batch" && await c.lock, this._requestHandler.request({ protocolQuery: h, modelName: l, action: a, clientMethod: i, dataPath: o, callsite: s, args: n, extensions: this._extensions, transaction: c, unpacker: p, otelParentCtx: d, otelChildCtx: this._tracingHelper.getActiveContext(), globalOmit: this._globalOmit, customDataProxyFetch: f });
      } catch (g) {
        throw g.clientVersion = this._clientVersion, g;
      }
    }
    get $metrics() {
      if (!this._hasPreviewFlag("metrics")) throw new J("`metrics` preview feature must be enabled in order to access metrics API", { clientVersion: this._clientVersion });
      return this._metrics;
    }
    _hasPreviewFlag(n) {
      var _a2;
      return !!((_a2 = this._engineConfig.previewFeatures) == null ? void 0 : _a2.includes(n));
    }
    $applyPendingMigrations() {
      return this._engine.applyPendingMigrations();
    }
  }
  return t;
}
function Jl(e10, t) {
  return Fm(e10) ? [new oe(e10, t), Rl] : [e10, Cl];
}
function Fm(e10) {
  return Array.isArray(e10) && Array.isArray(e10.raw);
}
var Lm = /* @__PURE__ */ new Set(["toJSON", "$$typeof", "asymmetricMatch", Symbol.iterator, Symbol.toStringTag, Symbol.isConcatSpreadable, Symbol.toPrimitive]);
function Zl(e10) {
  return new Proxy(e10, { get(t, r) {
    if (r in t) return t[r];
    if (!Lm.has(r)) throw new TypeError(`Invalid enum value: ${String(r)}`);
  } });
}
function Xl(e10) {
  zt(e10, { conflictCheck: "warn" });
}
(function(exports$1) {
  Object.defineProperty(exports$1, "__esModule", { value: true });
  const {
    PrismaClientKnownRequestError,
    PrismaClientUnknownRequestError,
    PrismaClientRustPanicError,
    PrismaClientInitializationError,
    PrismaClientValidationError,
    NotFoundError,
    getPrismaClient,
    sqltag,
    empty,
    join,
    raw,
    skip,
    Decimal,
    Debug,
    objectEnumValues,
    makeStrictEnum,
    Extensions,
    warnOnce,
    defineDmmfProperty,
    Public,
    getRuntime
  } = library;
  const Prisma = {};
  exports$1.Prisma = Prisma;
  exports$1.$Enums = {};
  Prisma.prismaVersion = {
    client: "5.22.0",
    engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
  };
  Prisma.PrismaClientKnownRequestError = PrismaClientKnownRequestError;
  Prisma.PrismaClientUnknownRequestError = PrismaClientUnknownRequestError;
  Prisma.PrismaClientRustPanicError = PrismaClientRustPanicError;
  Prisma.PrismaClientInitializationError = PrismaClientInitializationError;
  Prisma.PrismaClientValidationError = PrismaClientValidationError;
  Prisma.NotFoundError = NotFoundError;
  Prisma.Decimal = Decimal;
  Prisma.sql = sqltag;
  Prisma.empty = empty;
  Prisma.join = join;
  Prisma.raw = raw;
  Prisma.validator = Public.validator;
  Prisma.getExtensionContext = Extensions.getExtensionContext;
  Prisma.defineExtension = Extensions.defineExtension;
  Prisma.DbNull = objectEnumValues.instances.DbNull;
  Prisma.JsonNull = objectEnumValues.instances.JsonNull;
  Prisma.AnyNull = objectEnumValues.instances.AnyNull;
  Prisma.NullTypes = {
    DbNull: objectEnumValues.classes.DbNull,
    JsonNull: objectEnumValues.classes.JsonNull,
    AnyNull: objectEnumValues.classes.AnyNull
  };
  const path2 = path$2;
  exports$1.Prisma.TransactionIsolationLevel = makeStrictEnum({
    Serializable: "Serializable"
  });
  exports$1.Prisma.LocalSettingsScalarFieldEnum = {
    id: "id",
    branchId: "branchId",
    printerName: "printerName",
    paperSize: "paperSize",
    autoPrint: "autoPrint",
    lastSync: "lastSync"
  };
  exports$1.Prisma.CompanySettingsScalarFieldEnum = {
    id: "id",
    name: "name",
    phone: "phone",
    address: "address",
    email: "email",
    website: "website",
    logoUrl: "logoUrl",
    taxNumber: "taxNumber",
    facebookUrl: "facebookUrl",
    instagramUrl: "instagramUrl",
    currency: "currency",
    loyaltyEnabled: "loyaltyEnabled",
    loyaltyPointsPerDinar: "loyaltyPointsPerDinar",
    loyaltyRedemptionValue: "loyaltyRedemptionValue",
    loyaltyMinRedemption: "loyaltyMinRedemption",
    maxDiscountPercent: "maxDiscountPercent",
    updatedAt: "updatedAt"
  };
  exports$1.Prisma.UserScalarFieldEnum = {
    id: "id",
    name: "name",
    email: "email",
    role: "role",
    password: "password",
    branchId: "branchId"
  };
  exports$1.Prisma.GlobalDrugScalarFieldEnum = {
    id: "id",
    barcode: "barcode",
    tradeName: "tradeName",
    scientificName: "scientificName",
    origin: "origin",
    price: "price",
    isActive: "isActive"
  };
  exports$1.Prisma.InventoryScalarFieldEnum = {
    id: "id",
    branchId: "branchId",
    drugId: "drugId",
    quantity: "quantity",
    costPrice: "costPrice",
    minStock: "minStock",
    maxStock: "maxStock"
  };
  exports$1.Prisma.BatchScalarFieldEnum = {
    id: "id",
    inventoryId: "inventoryId",
    batchNumber: "batchNumber",
    expiryDate: "expiryDate",
    quantity: "quantity",
    costPrice: "costPrice",
    supplierId: "supplierId"
  };
  exports$1.Prisma.SupplierScalarFieldEnum = {
    id: "id",
    name: "name",
    phone: "phone"
  };
  exports$1.Prisma.SaleScalarFieldEnum = {
    id: "id",
    total: "total",
    createdAt: "createdAt",
    synced: "synced",
    discount: "discount",
    userId: "userId",
    patientId: "patientId",
    safeId: "safeId"
  };
  exports$1.Prisma.PatientScalarFieldEnum = {
    id: "id",
    name: "name",
    phone: "phone",
    dateOfBirth: "dateOfBirth",
    gender: "gender",
    allergies: "allergies",
    chronicDiseases: "chronicDiseases",
    notes: "notes",
    balance: "balance",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    branchId: "branchId"
  };
  exports$1.Prisma.SaleItemScalarFieldEnum = {
    id: "id",
    saleId: "saleId",
    drugId: "drugId",
    quantity: "quantity",
    price: "price",
    cost: "cost"
  };
  exports$1.Prisma.SaleReturnScalarFieldEnum = {
    id: "id",
    saleId: "saleId",
    branchId: "branchId",
    safeId: "safeId",
    total: "total",
    createdAt: "createdAt",
    notes: "notes",
    synced: "synced"
  };
  exports$1.Prisma.SaleReturnItemScalarFieldEnum = {
    id: "id",
    saleReturnId: "saleReturnId",
    drugId: "drugId",
    quantity: "quantity",
    price: "price"
  };
  exports$1.Prisma.LoyaltyAccountScalarFieldEnum = {
    id: "id",
    patientId: "patientId",
    totalPoints: "totalPoints",
    lifetimePoints: "lifetimePoints",
    tier: "tier",
    createdAt: "createdAt",
    updatedAt: "updatedAt"
  };
  exports$1.Prisma.LoyaltyTransactionScalarFieldEnum = {
    id: "id",
    accountId: "accountId",
    type: "type",
    points: "points",
    description: "description",
    saleId: "saleId",
    createdAt: "createdAt",
    synced: "synced"
  };
  exports$1.Prisma.PaymentScalarFieldEnum = {
    id: "id",
    saleId: "saleId",
    amount: "amount",
    method: "method",
    status: "status",
    referenceNumber: "referenceNumber",
    createdAt: "createdAt"
  };
  exports$1.Prisma.DebtPaymentScalarFieldEnum = {
    id: "id",
    saleId: "saleId",
    amount: "amount",
    method: "method",
    note: "note",
    createdAt: "createdAt",
    synced: "synced"
  };
  exports$1.Prisma.BranchScalarFieldEnum = {
    id: "id",
    name: "name",
    location: "location",
    phone: "phone",
    createdAt: "createdAt",
    updatedAt: "updatedAt"
  };
  exports$1.Prisma.DrugInteractionScalarFieldEnum = {
    id: "id",
    drug1: "drug1",
    drug2: "drug2",
    severity: "severity",
    description: "description",
    createdAt: "createdAt"
  };
  exports$1.Prisma.ShiftScalarFieldEnum = {
    id: "id",
    userId: "userId",
    branchId: "branchId",
    safeId: "safeId",
    startTime: "startTime",
    endTime: "endTime",
    duration: "duration",
    startingCash: "startingCash",
    expectedCash: "expectedCash",
    actualCash: "actualCash",
    status: "status",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    synced: "synced"
  };
  exports$1.Prisma.SafeScalarFieldEnum = {
    id: "id",
    name: "name",
    type: "type",
    balance: "balance",
    branchId: "branchId",
    createdAt: "createdAt",
    updatedAt: "updatedAt"
  };
  exports$1.Prisma.TransactionScalarFieldEnum = {
    id: "id",
    safeId: "safeId",
    type: "type",
    amount: "amount",
    referenceType: "referenceType",
    referenceId: "referenceId",
    description: "description",
    userId: "userId",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    synced: "synced"
  };
  exports$1.Prisma.ExpenseScalarFieldEnum = {
    id: "id",
    branchId: "branchId",
    safeId: "safeId",
    amount: "amount",
    category: "category",
    description: "description",
    date: "date",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    synced: "synced"
  };
  exports$1.Prisma.SupplierPaymentScalarFieldEnum = {
    id: "id",
    supplierId: "supplierId",
    branchId: "branchId",
    safeId: "safeId",
    amount: "amount",
    method: "method",
    reference: "reference",
    notes: "notes",
    date: "date",
    createdAt: "createdAt",
    synced: "synced"
  };
  exports$1.Prisma.SyncFailureScalarFieldEnum = {
    id: "id",
    entityType: "entityType",
    entityId: "entityId",
    payload: "payload",
    errorMessage: "errorMessage",
    createdAt: "createdAt",
    updatedAt: "updatedAt"
  };
  exports$1.Prisma.StocktakeScalarFieldEnum = {
    id: "id",
    branchId: "branchId",
    status: "status",
    totalDiscrepancyAmount: "totalDiscrepancyAmount",
    notes: "notes",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    userId: "userId",
    synced: "synced"
  };
  exports$1.Prisma.StocktakeItemScalarFieldEnum = {
    id: "id",
    stocktakeId: "stocktakeId",
    batchId: "batchId",
    systemQuantity: "systemQuantity",
    actualQuantity: "actualQuantity",
    difference: "difference",
    costPrice: "costPrice",
    reason: "reason"
  };
  exports$1.Prisma.TransferScalarFieldEnum = {
    id: "id",
    fromBranchId: "fromBranchId",
    toBranchId: "toBranchId",
    status: "status",
    notes: "notes",
    synced: "synced",
    createdAt: "createdAt",
    updatedAt: "updatedAt"
  };
  exports$1.Prisma.TransferItemScalarFieldEnum = {
    id: "id",
    transferId: "transferId",
    drugId: "drugId",
    batchNumber: "batchNumber",
    expiryDate: "expiryDate",
    quantity: "quantity",
    costPrice: "costPrice"
  };
  exports$1.Prisma.LocalLicenseScalarFieldEnum = {
    id: "id",
    licenseKey: "licenseKey",
    hardwareId: "hardwareId",
    deviceName: "deviceName",
    isActive: "isActive",
    expiresAt: "expiresAt",
    lastChecked: "lastChecked",
    synced: "synced"
  };
  exports$1.Prisma.SortOrder = {
    asc: "asc",
    desc: "desc"
  };
  exports$1.Prisma.NullsOrder = {
    first: "first",
    last: "last"
  };
  exports$1.Prisma.ModelName = {
    LocalSettings: "LocalSettings",
    CompanySettings: "CompanySettings",
    User: "User",
    GlobalDrug: "GlobalDrug",
    Inventory: "Inventory",
    Batch: "Batch",
    Supplier: "Supplier",
    Sale: "Sale",
    Patient: "Patient",
    SaleItem: "SaleItem",
    SaleReturn: "SaleReturn",
    SaleReturnItem: "SaleReturnItem",
    LoyaltyAccount: "LoyaltyAccount",
    LoyaltyTransaction: "LoyaltyTransaction",
    Payment: "Payment",
    DebtPayment: "DebtPayment",
    Branch: "Branch",
    DrugInteraction: "DrugInteraction",
    Shift: "Shift",
    Safe: "Safe",
    Transaction: "Transaction",
    Expense: "Expense",
    SupplierPayment: "SupplierPayment",
    SyncFailure: "SyncFailure",
    Stocktake: "Stocktake",
    StocktakeItem: "StocktakeItem",
    Transfer: "Transfer",
    TransferItem: "TransferItem",
    LocalLicense: "LocalLicense"
  };
  const config2 = {
    "generator": {
      "name": "client",
      "provider": {
        "fromEnvVar": null,
        "value": "prisma-client-js"
      },
      "output": {
        "value": "D:\\Programming\\Faramace\\apps\\desktop\\node_modules\\.prisma\\desktop-client",
        "fromEnvVar": null
      },
      "config": {
        "engineType": "library"
      },
      "binaryTargets": [
        {
          "fromEnvVar": null,
          "value": "windows",
          "native": true
        },
        {
          "fromEnvVar": null,
          "value": "windows"
        }
      ],
      "previewFeatures": [],
      "sourceFilePath": "D:\\Programming\\Faramace\\apps\\desktop\\prisma\\schema.prisma",
      "isCustomOutput": true
    },
    "relativeEnvPaths": {
      "rootEnvPath": null,
      "schemaEnvPath": "../../../.env"
    },
    "relativePath": "../../../prisma",
    "clientVersion": "5.22.0",
    "engineVersion": "605197351a3c8bdd595af2d2a9bc3025bca48ea2",
    "datasourceNames": [
      "db"
    ],
    "activeProvider": "sqlite",
    "postinstall": false,
    "inlineDatasources": {
      "db": {
        "url": {
          "fromEnvVar": null,
          "value": "file:./local.db"
        }
      }
    },
    "inlineSchema": `generator client {
  provider      = "prisma-client-js"
  output        = "../node_modules/.prisma/desktop-client"
  binaryTargets = ["native", "windows"]
}

datasource db {
  provider = "sqlite"
  url      = "file:./local.db"
}

// Local models mirror cloud models but focused on this Branch

model LocalSettings {
  id          String    @id @default(uuid())
  branchId    String? // The branch this device is linked to
  printerName String? // Local printer name
  paperSize   String    @default("80mm") // 80mm or A4
  autoPrint   Boolean   @default(true)
  lastSync    DateTime?
}

model CompanySettings {
  id                     String   @id @default(uuid())
  name                   String   @default("Pharmacy System")
  phone                  String?
  address                String?
  email                  String?
  website                String?
  logoUrl                String?
  taxNumber              String?
  facebookUrl            String?
  instagramUrl           String?
  currency               String   @default("IQD")
  loyaltyEnabled         Boolean  @default(false)
  loyaltyPointsPerDinar  Float    @default(0.01)
  loyaltyRedemptionValue Float    @default(2.5)
  loyaltyMinRedemption   Int      @default(500)
  maxDiscountPercent     Float    @default(10)
  updatedAt              DateTime @updatedAt
}

model User {
  id         String      @id
  name       String
  email      String      @unique
  role       String
  password   String // Hashed
  branchId   String?
  branch     Branch?     @relation(fields: [branchId], references: [id])
  sales      Sale[]
  shifts     Shift[]
  stocktakes Stocktake[]
}

model GlobalDrug {
  id              String           @id
  barcode         String           @unique
  tradeName       String
  scientificName  String
  origin          String?
  price           Float            @default(0) // Local override or cached price
  isActive        Boolean          @default(true)
  inventory       Inventory[]
  saleItems       SaleItem[]
  saleReturnItems SaleReturnItem[]
  transferItems   TransferItem[]
}

model Inventory {
  id        String     @id @default(uuid())
  branchId  String? // Added to support branch filtering/Admin view
  branch    Branch?    @relation(fields: [branchId], references: [id])
  drugId    String
  drug      GlobalDrug @relation(fields: [drugId], references: [id])
  quantity  Int
  costPrice Float      @default(0) // Added for inventory management
  minStock  Int        @default(10)
  maxStock  Int        @default(100)
  batches   Batch[]
}

model Batch {
  id             String          @id @default(uuid())
  inventoryId    String
  inventory      Inventory       @relation(fields: [inventoryId], references: [id])
  batchNumber    String
  expiryDate     DateTime
  quantity       Int
  costPrice      Float           @default(0)
  supplierId     String?
  supplier       Supplier?       @relation(fields: [supplierId], references: [id])
  stocktakeItems StocktakeItem[]
}

model Supplier {
  id      String  @id
  name    String
  phone   String?
  batches Batch[]
}

model Sale {
  id                  String               @id @default(uuid())
  total               Float
  createdAt           DateTime             @default(now())
  items               SaleItem[]
  synced              Boolean              @default(false)
  discount            Float                @default(0)
  userId              String?
  user                User?                @relation(fields: [userId], references: [id])
  patientId           String?
  patient             Patient?             @relation(fields: [patientId], references: [id])
  safeId              String?
  safe                Safe?                @relation(fields: [safeId], references: [id])
  payment             Payment?
  debtPayments        DebtPayment[]
  loyaltyTransactions LoyaltyTransaction[]
  returns             SaleReturn[]
}

model Patient {
  id              String          @id @default(uuid())
  name            String
  phone           String          @unique
  dateOfBirth     DateTime?
  gender          String?
  allergies       String // Stored as comma-separated string or JSON since SQLite doesn't support arrays well
  chronicDiseases String // Stored as comma-separated string or JSON
  notes           String?
  balance         Float           @default(0)
  sales           Sale[]
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  loyaltyAccount  LoyaltyAccount?
  branchId        String?
  branch          Branch?         @relation(fields: [branchId], references: [id])
}

model SaleItem {
  id       String     @id @default(uuid())
  saleId   String
  sale     Sale       @relation(fields: [saleId], references: [id])
  drugId   String
  quantity Int
  price    Float
  cost     Float      @default(0)
  drug     GlobalDrug @relation(fields: [drugId], references: [id])
}

model SaleReturn {
  id        String   @id @default(uuid())
  saleId    String
  branchId  String?
  safeId    String? // The safe used to refund the customer, if CASH
  total     Float
  createdAt DateTime @default(now())
  notes     String?
  synced    Boolean  @default(false)

  sale   Sale             @relation(fields: [saleId], references: [id])
  branch Branch?          @relation(fields: [branchId], references: [id])
  safe   Safe?            @relation(fields: [safeId], references: [id])
  items  SaleReturnItem[]
}

model SaleReturnItem {
  id           String @id @default(uuid())
  saleReturnId String
  drugId       String
  quantity     Int
  price        Float // The price at which it was refunded

  saleReturn SaleReturn @relation(fields: [saleReturnId], references: [id], onDelete: Cascade)
  drug       GlobalDrug @relation(fields: [drugId], references: [id])
}

model LoyaltyAccount {
  id             String               @id @default(uuid())
  patientId      String               @unique
  totalPoints    Int                  @default(0)
  lifetimePoints Int                  @default(0)
  tier           String               @default("BRONZE")
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt
  patient        Patient              @relation(fields: [patientId], references: [id])
  transactions   LoyaltyTransaction[]
}

model LoyaltyTransaction {
  id          String         @id @default(uuid())
  accountId   String
  type        String // EARN or REDEEM
  points      Int
  description String?
  saleId      String?
  createdAt   DateTime       @default(now())
  synced      Boolean        @default(false)
  account     LoyaltyAccount @relation(fields: [accountId], references: [id])
  sale        Sale?          @relation(fields: [saleId], references: [id])
}

model Payment {
  id              String   @id @default(uuid())
  saleId          String   @unique
  amount          Float
  method          String // Store as string for SQLite (CASH, CREDIT, ZAIN_CASH, etc.)
  status          String   @default("PENDING") // PENDING, COMPLETED, FAILED
  referenceNumber String?
  createdAt       DateTime @default(now())
  sale            Sale     @relation(fields: [saleId], references: [id])
}

model DebtPayment {
  id        String   @id @default(uuid())
  saleId    String
  amount    Float
  method    String   @default("CASH")
  note      String?
  createdAt DateTime @default(now())
  synced    Boolean  @default(false)
  sale      Sale     @relation(fields: [saleId], references: [id])
}

model Branch {
  id           String       @id @default(uuid())
  name         String
  location     String?
  phone        String?
  users        User[]
  inventory    Inventory[]
  patients     Patient[]
  shifts       Shift[]
  safes        Safe[]
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  saleReturns  SaleReturn[]
  stocktakes   Stocktake[]
  transfersOut Transfer[]   @relation("BranchTransfersOut")
  transfersIn  Transfer[]   @relation("BranchTransfersIn")
}

// ==================== التفاعلات الدوائية ====================
model DrugInteraction {
  id          String   @id @default(uuid())
  drug1       String // Scientific Name 1
  drug2       String // Scientific Name 2
  severity    String // HIGH, MODERATE, LOW
  description String
  createdAt   DateTime @default(now())

  @@unique([drug1, drug2])
  @@index([drug1])
  @@index([drug2])
}

model Shift {
  id           String    @id @default(uuid())
  userId       String
  branchId     String
  safeId       String?
  startTime    DateTime  @default(now())
  endTime      DateTime?
  duration     Float     @default(0)
  startingCash Float     @default(0)
  expectedCash Float     @default(0)
  actualCash   Float?
  status       String    @default("OPEN")
  user         User      @relation(fields: [userId], references: [id])
  branch       Branch    @relation(fields: [branchId], references: [id])
  safe         Safe?     @relation(fields: [safeId], references: [id])
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  synced       Boolean   @default(false)
}

model Safe {
  id        String   @id @default(uuid())
  name      String
  type      String   @default("CASH_DRAWER") // CASH_DRAWER, BANK, VAULT, MOBILE_WALLET
  balance   Float    @default(0)
  branchId  String
  branch    Branch   @relation(fields: [branchId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  shifts           Shift[]
  transactions     Transaction[]
  sales            Sale[]
  expenses         Expense[]
  supplierPayments SupplierPayment[]
  saleReturns      SaleReturn[]
}

model Transaction {
  id            String   @id @default(uuid())
  safeId        String
  type          String // IN, OUT
  amount        Float
  referenceType String // SALE, EXPENSE, SUPPLIER_PAYMENT, CUSTOMER_RECEIPT, TRANSFER
  referenceId   String? // ID of the related record
  description   String?
  userId        String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  synced        Boolean  @default(false)

  safe Safe @relation(fields: [safeId], references: [id])
}

model Expense {
  id          String   @id @default(uuid())
  branchId    String
  safeId      String?
  amount      Float
  category    String
  description String?
  date        DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  synced      Boolean  @default(false)
  safe        Safe?    @relation(fields: [safeId], references: [id])
}

model SupplierPayment {
  id         String   @id @default(uuid())
  supplierId String
  branchId   String
  safeId     String?
  amount     Float
  method     String   @default("CASH")
  reference  String?
  notes      String?
  date       DateTime @default(now())
  createdAt  DateTime @default(now())
  synced     Boolean  @default(false)
  safe       Safe?    @relation(fields: [safeId], references: [id])
}

// ==================== Dead-Letter Queue (أخطاء المزامنة) ====================
model SyncFailure {
  id           String   @id @default(uuid())
  entityType   String // SALE, INVENTORY, DEBT, etc.
  entityId     String // The original local ID (e.g. saleId)
  payload      String // JSON Dump of what we tried to send
  errorMessage String // The exact error from the server/network
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([entityType])
}

// ==================== الجرد الفعلي ====================
model Stocktake {
  id                     String   @id @default(uuid())
  branchId               String
  status                 String   @default("PENDING") // PENDING, COMPLETED, CANCELLED
  totalDiscrepancyAmount Float    @default(0) // Financial value of the difference (+/-)
  notes                  String?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  userId                 String
  synced                 Boolean  @default(false)

  branch Branch          @relation(fields: [branchId], references: [id])
  user   User            @relation(fields: [userId], references: [id])
  items  StocktakeItem[]
}

model StocktakeItem {
  id             String  @id @default(uuid())
  stocktakeId    String
  batchId        String // Specific batch being counted
  systemQuantity Int // What the DB said
  actualQuantity Int // What the user counted
  difference     Int // actual - system
  costPrice      Float // Cost price at the time of stocktake to calculate financial impact
  reason         String? // EXPIRED, DAMAGED, MISSING, FOUND

  stocktake Stocktake @relation(fields: [stocktakeId], references: [id], onDelete: Cascade)
  batch     Batch     @relation(fields: [batchId], references: [id])
}

// =======================
// Branch Transfers Models
// =======================

model Transfer {
  id           String   @id @default(uuid())
  fromBranchId String
  toBranchId   String
  status       String   @default("PENDING") // PENDING, IN_TRANSIT, COMPLETED, CANCELLED
  notes        String?
  synced       Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  fromBranch Branch         @relation("BranchTransfersOut", fields: [fromBranchId], references: [id])
  toBranch   Branch         @relation("BranchTransfersIn", fields: [toBranchId], references: [id])
  items      TransferItem[]
}

model TransferItem {
  id          String   @id @default(uuid())
  transferId  String
  drugId      String
  batchNumber String
  expiryDate  DateTime
  quantity    Int
  costPrice   Float    @default(0)

  transfer Transfer   @relation(fields: [transferId], references: [id], onDelete: Cascade)
  drug     GlobalDrug @relation(fields: [drugId], references: [id])
}

// =======================
// Local Licensing State
// =======================
model LocalLicense {
  id          String    @id @default(uuid())
  licenseKey  String    @unique
  hardwareId  String?
  deviceName  String?
  isActive    Boolean   @default(false)
  expiresAt   DateTime?
  lastChecked DateTime? // Last time we verified with the cloud
  synced      Boolean   @default(true)
}
`,
    "inlineSchemaHash": "17869c765ff21cfb1f674497ee7b5dce8adb20b7d8585859234acbf2320141c2",
    "copyEngine": true
  };
  const fs2 = fs$3;
  config2.dirname = __dirname;
  if (!fs2.existsSync(path2.join(__dirname, "schema.prisma"))) {
    const alternativePaths = [
      "node_modules/.prisma/desktop-client",
      ".prisma/desktop-client"
    ];
    const alternativePath = alternativePaths.find((altPath) => {
      return fs2.existsSync(path2.join(process.cwd(), altPath, "schema.prisma"));
    }) ?? alternativePaths[0];
    config2.dirname = path2.join(process.cwd(), alternativePath);
    config2.isBundled = true;
  }
  config2.runtimeDataModel = JSON.parse('{"models":{"LocalSettings":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"branchId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"printerName","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"paperSize","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":"80mm","isGenerated":false,"isUpdatedAt":false},{"name":"autoPrint","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":true,"isGenerated":false,"isUpdatedAt":false},{"name":"lastSync","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"CompanySettings":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"name","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":"Pharmacy System","isGenerated":false,"isUpdatedAt":false},{"name":"phone","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"address","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"email","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"website","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"logoUrl","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"taxNumber","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"facebookUrl","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"instagramUrl","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"currency","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":"IQD","isGenerated":false,"isUpdatedAt":false},{"name":"loyaltyEnabled","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false},{"name":"loyaltyPointsPerDinar","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0.01,"isGenerated":false,"isUpdatedAt":false},{"name":"loyaltyRedemptionValue","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":2.5,"isGenerated":false,"isUpdatedAt":false},{"name":"loyaltyMinRedemption","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Int","default":500,"isGenerated":false,"isUpdatedAt":false},{"name":"maxDiscountPercent","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":10,"isGenerated":false,"isUpdatedAt":false},{"name":"updatedAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":true}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"User":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"name","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"email","kind":"scalar","isList":false,"isRequired":true,"isUnique":true,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"role","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"password","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"branchId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"branch","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Branch","relationName":"BranchToUser","relationFromFields":["branchId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"sales","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Sale","relationName":"SaleToUser","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"shifts","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Shift","relationName":"ShiftToUser","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"stocktakes","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Stocktake","relationName":"StocktakeToUser","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"GlobalDrug":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"barcode","kind":"scalar","isList":false,"isRequired":true,"isUnique":true,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"tradeName","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"scientificName","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"origin","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"price","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"isActive","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":true,"isGenerated":false,"isUpdatedAt":false},{"name":"inventory","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Inventory","relationName":"GlobalDrugToInventory","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"saleItems","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"SaleItem","relationName":"GlobalDrugToSaleItem","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"saleReturnItems","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"SaleReturnItem","relationName":"GlobalDrugToSaleReturnItem","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"transferItems","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"TransferItem","relationName":"GlobalDrugToTransferItem","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Inventory":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"branchId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"branch","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Branch","relationName":"BranchToInventory","relationFromFields":["branchId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"drugId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"drug","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"GlobalDrug","relationName":"GlobalDrugToInventory","relationFromFields":["drugId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"quantity","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false},{"name":"costPrice","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"minStock","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Int","default":10,"isGenerated":false,"isUpdatedAt":false},{"name":"maxStock","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Int","default":100,"isGenerated":false,"isUpdatedAt":false},{"name":"batches","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Batch","relationName":"BatchToInventory","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Batch":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"inventoryId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"inventory","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Inventory","relationName":"BatchToInventory","relationFromFields":["inventoryId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"batchNumber","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"expiryDate","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":false},{"name":"quantity","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false},{"name":"costPrice","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"supplierId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"supplier","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Supplier","relationName":"BatchToSupplier","relationFromFields":["supplierId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"stocktakeItems","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"StocktakeItem","relationName":"BatchToStocktakeItem","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Supplier":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"name","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"phone","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"batches","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Batch","relationName":"BatchToSupplier","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Sale":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"total","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"items","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"SaleItem","relationName":"SaleToSaleItem","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false},{"name":"discount","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"userId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"user","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"User","relationName":"SaleToUser","relationFromFields":["userId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"patientId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"patient","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Patient","relationName":"PatientToSale","relationFromFields":["patientId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"safeId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"safe","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Safe","relationName":"SafeToSale","relationFromFields":["safeId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"payment","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Payment","relationName":"PaymentToSale","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"debtPayments","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DebtPayment","relationName":"DebtPaymentToSale","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"loyaltyTransactions","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"LoyaltyTransaction","relationName":"LoyaltyTransactionToSale","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"returns","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"SaleReturn","relationName":"SaleToSaleReturn","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Patient":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"name","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"phone","kind":"scalar","isList":false,"isRequired":true,"isUnique":true,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"dateOfBirth","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":false},{"name":"gender","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"allergies","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"chronicDiseases","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"notes","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"balance","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"sales","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Sale","relationName":"PatientToSale","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"updatedAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":true},{"name":"loyaltyAccount","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"LoyaltyAccount","relationName":"LoyaltyAccountToPatient","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"branchId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"branch","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Branch","relationName":"BranchToPatient","relationFromFields":["branchId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"SaleItem":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"saleId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"sale","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Sale","relationName":"SaleToSaleItem","relationFromFields":["saleId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"drugId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"quantity","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false},{"name":"price","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"cost","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"drug","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"GlobalDrug","relationName":"GlobalDrugToSaleItem","relationFromFields":["drugId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"SaleReturn":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"saleId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"branchId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"safeId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"total","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"notes","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false},{"name":"sale","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Sale","relationName":"SaleToSaleReturn","relationFromFields":["saleId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"branch","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Branch","relationName":"BranchToSaleReturn","relationFromFields":["branchId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"safe","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Safe","relationName":"SafeToSaleReturn","relationFromFields":["safeId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"items","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"SaleReturnItem","relationName":"SaleReturnToSaleReturnItem","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"SaleReturnItem":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"saleReturnId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"drugId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"quantity","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false},{"name":"price","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"saleReturn","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"SaleReturn","relationName":"SaleReturnToSaleReturnItem","relationFromFields":["saleReturnId"],"relationToFields":["id"],"relationOnDelete":"Cascade","isGenerated":false,"isUpdatedAt":false},{"name":"drug","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"GlobalDrug","relationName":"GlobalDrugToSaleReturnItem","relationFromFields":["drugId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"LoyaltyAccount":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"patientId","kind":"scalar","isList":false,"isRequired":true,"isUnique":true,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"totalPoints","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Int","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"lifetimePoints","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Int","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"tier","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":"BRONZE","isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"updatedAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":true},{"name":"patient","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Patient","relationName":"LoyaltyAccountToPatient","relationFromFields":["patientId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"transactions","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"LoyaltyTransaction","relationName":"LoyaltyAccountToLoyaltyTransaction","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"LoyaltyTransaction":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"accountId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"type","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"points","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false},{"name":"description","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"saleId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false},{"name":"account","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"LoyaltyAccount","relationName":"LoyaltyAccountToLoyaltyTransaction","relationFromFields":["accountId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"sale","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Sale","relationName":"LoyaltyTransactionToSale","relationFromFields":["saleId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Payment":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"saleId","kind":"scalar","isList":false,"isRequired":true,"isUnique":true,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"amount","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"method","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"status","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":"PENDING","isGenerated":false,"isUpdatedAt":false},{"name":"referenceNumber","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"sale","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Sale","relationName":"PaymentToSale","relationFromFields":["saleId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"DebtPayment":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"saleId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"amount","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"method","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":"CASH","isGenerated":false,"isUpdatedAt":false},{"name":"note","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false},{"name":"sale","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Sale","relationName":"DebtPaymentToSale","relationFromFields":["saleId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Branch":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"name","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"location","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"phone","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"users","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"User","relationName":"BranchToUser","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"inventory","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Inventory","relationName":"BranchToInventory","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"patients","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Patient","relationName":"BranchToPatient","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"shifts","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Shift","relationName":"BranchToShift","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"safes","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Safe","relationName":"BranchToSafe","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"updatedAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":true},{"name":"saleReturns","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"SaleReturn","relationName":"BranchToSaleReturn","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"stocktakes","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Stocktake","relationName":"BranchToStocktake","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"transfersOut","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Transfer","relationName":"BranchTransfersOut","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"transfersIn","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Transfer","relationName":"BranchTransfersIn","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"DrugInteraction":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"drug1","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"drug2","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"severity","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"description","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[["drug1","drug2"]],"uniqueIndexes":[{"name":null,"fields":["drug1","drug2"]}],"isGenerated":false},"Shift":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"userId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"branchId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"safeId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"startTime","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"endTime","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":false},{"name":"duration","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"startingCash","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"expectedCash","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"actualCash","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"status","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":"OPEN","isGenerated":false,"isUpdatedAt":false},{"name":"user","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"User","relationName":"ShiftToUser","relationFromFields":["userId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"branch","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Branch","relationName":"BranchToShift","relationFromFields":["branchId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"safe","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Safe","relationName":"SafeToShift","relationFromFields":["safeId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"updatedAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":true},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Safe":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"name","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"type","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":"CASH_DRAWER","isGenerated":false,"isUpdatedAt":false},{"name":"balance","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"branchId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"branch","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Branch","relationName":"BranchToSafe","relationFromFields":["branchId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"updatedAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":true},{"name":"shifts","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Shift","relationName":"SafeToShift","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"transactions","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Transaction","relationName":"SafeToTransaction","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"sales","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Sale","relationName":"SafeToSale","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"expenses","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Expense","relationName":"ExpenseToSafe","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"supplierPayments","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"SupplierPayment","relationName":"SafeToSupplierPayment","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"saleReturns","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"SaleReturn","relationName":"SafeToSaleReturn","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Transaction":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"safeId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"type","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"amount","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"referenceType","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"referenceId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"description","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"userId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"updatedAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":true},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false},{"name":"safe","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Safe","relationName":"SafeToTransaction","relationFromFields":["safeId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Expense":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"branchId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"safeId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"amount","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"category","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"description","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"date","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"updatedAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":true},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false},{"name":"safe","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Safe","relationName":"ExpenseToSafe","relationFromFields":["safeId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"SupplierPayment":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"supplierId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"branchId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"safeId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"amount","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"method","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":"CASH","isGenerated":false,"isUpdatedAt":false},{"name":"reference","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"notes","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"date","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false},{"name":"safe","kind":"object","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Safe","relationName":"SafeToSupplierPayment","relationFromFields":["safeId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"SyncFailure":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"entityType","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"entityId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"payload","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"errorMessage","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"updatedAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":true}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Stocktake":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"branchId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"status","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":"PENDING","isGenerated":false,"isUpdatedAt":false},{"name":"totalDiscrepancyAmount","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"notes","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"updatedAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":true},{"name":"userId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false},{"name":"branch","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Branch","relationName":"BranchToStocktake","relationFromFields":["branchId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"user","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"User","relationName":"StocktakeToUser","relationFromFields":["userId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"items","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"StocktakeItem","relationName":"StocktakeToStocktakeItem","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"StocktakeItem":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"stocktakeId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"batchId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"systemQuantity","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false},{"name":"actualQuantity","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false},{"name":"difference","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false},{"name":"costPrice","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"reason","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"stocktake","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Stocktake","relationName":"StocktakeToStocktakeItem","relationFromFields":["stocktakeId"],"relationToFields":["id"],"relationOnDelete":"Cascade","isGenerated":false,"isUpdatedAt":false},{"name":"batch","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Batch","relationName":"BatchToStocktakeItem","relationFromFields":["batchId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Transfer":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"fromBranchId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"toBranchId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"status","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":"PENDING","isGenerated":false,"isUpdatedAt":false},{"name":"notes","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"updatedAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":true},{"name":"fromBranch","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Branch","relationName":"BranchTransfersOut","relationFromFields":["fromBranchId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"toBranch","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Branch","relationName":"BranchTransfersIn","relationFromFields":["toBranchId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"items","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"TransferItem","relationName":"TransferToTransferItem","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"TransferItem":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"transferId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"drugId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"batchNumber","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"expiryDate","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":false},{"name":"quantity","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false},{"name":"costPrice","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"transfer","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Transfer","relationName":"TransferToTransferItem","relationFromFields":["transferId"],"relationToFields":["id"],"relationOnDelete":"Cascade","isGenerated":false,"isUpdatedAt":false},{"name":"drug","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"GlobalDrug","relationName":"GlobalDrugToTransferItem","relationFromFields":["drugId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"LocalLicense":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"licenseKey","kind":"scalar","isList":false,"isRequired":true,"isUnique":true,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"hardwareId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"deviceName","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"isActive","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false},{"name":"expiresAt","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":false},{"name":"lastChecked","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":false},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":true,"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false}},"enums":{},"types":{}}');
  defineDmmfProperty(exports$1.Prisma, config2.runtimeDataModel);
  config2.engineWasm = void 0;
  const { warnEnvConflicts } = library;
  warnEnvConflicts({
    rootEnvPath: config2.relativeEnvPaths.rootEnvPath && path2.resolve(config2.dirname, config2.relativeEnvPaths.rootEnvPath),
    schemaEnvPath: config2.relativeEnvPaths.schemaEnvPath && path2.resolve(config2.dirname, config2.relativeEnvPaths.schemaEnvPath)
  });
  const PrismaClient = getPrismaClient(config2);
  exports$1.PrismaClient = PrismaClient;
  Object.assign(exports$1, Prisma);
  path2.join(__dirname, "query_engine-windows.dll.node");
  path2.join(process.cwd(), "node_modules/.prisma/desktop-client/query_engine-windows.dll.node");
  path2.join(__dirname, "schema.prisma");
  path2.join(process.cwd(), "node_modules/.prisma/desktop-client/schema.prisma");
})(desktopClient);
function getDbPath$1() {
  if (electron.app.isPackaged) {
    const userDataPath = electron.app.getPath("userData");
    const dbPath = path$2.join(userDataPath, "local.db");
    if (!fs$3.existsSync(dbPath)) {
      const seedDbPath = path$2.join(process.resourcesPath, "prisma", "local.db");
      if (fs$3.existsSync(seedDbPath)) {
        fs$3.mkdirSync(path$2.dirname(dbPath), { recursive: true });
        fs$3.copyFileSync(seedDbPath, dbPath);
        console.log("[DB] Copied initial database to userData:", dbPath);
      } else {
        console.warn("[DB] No seed database found at:", seedDbPath);
      }
    }
    return dbPath;
  } else {
    return path$2.join(__dirname, "../prisma/local.db");
  }
}
const dbUrl = `file:${getDbPath$1()}`;
const prisma = new desktopClient.PrismaClient({
  datasources: {
    db: {
      url: dbUrl
    }
  }
});
var randomFallback = null;
function randomBytes(len) {
  try {
    return crypto.getRandomValues(new Uint8Array(len));
  } catch {
  }
  try {
    return require$$1.randomBytes(len);
  } catch {
  }
  if (!randomFallback) {
    throw Error(
      "Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative"
    );
  }
  return randomFallback(len);
}
function setRandomFallback(random) {
  randomFallback = random;
}
function genSaltSync(rounds, seed_length) {
  rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
  if (typeof rounds !== "number")
    throw Error(
      "Illegal arguments: " + typeof rounds + ", " + typeof seed_length
    );
  if (rounds < 4) rounds = 4;
  else if (rounds > 31) rounds = 31;
  var salt = [];
  salt.push("$2b$");
  if (rounds < 10) salt.push("0");
  salt.push(rounds.toString());
  salt.push("$");
  salt.push(base64_encode(randomBytes(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN));
  return salt.join("");
}
function genSalt(rounds, seed_length, callback) {
  if (typeof seed_length === "function")
    callback = seed_length, seed_length = void 0;
  if (typeof rounds === "function") callback = rounds, rounds = void 0;
  if (typeof rounds === "undefined") rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
  else if (typeof rounds !== "number")
    throw Error("illegal arguments: " + typeof rounds);
  function _async(callback2) {
    nextTick(function() {
      try {
        callback2(null, genSaltSync(rounds));
      } catch (err) {
        callback2(err);
      }
    });
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
function hashSync(password, salt) {
  if (typeof salt === "undefined") salt = GENSALT_DEFAULT_LOG2_ROUNDS;
  if (typeof salt === "number") salt = genSaltSync(salt);
  if (typeof password !== "string" || typeof salt !== "string")
    throw Error("Illegal arguments: " + typeof password + ", " + typeof salt);
  return _hash(password, salt);
}
function hash(password, salt, callback, progressCallback) {
  function _async(callback2) {
    if (typeof password === "string" && typeof salt === "number")
      genSalt(salt, function(err, salt2) {
        _hash(password, salt2, callback2, progressCallback);
      });
    else if (typeof password === "string" && typeof salt === "string")
      _hash(password, salt, callback2, progressCallback);
    else
      nextTick(
        callback2.bind(
          this,
          Error("Illegal arguments: " + typeof password + ", " + typeof salt)
        )
      );
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
function safeStringCompare(known, unknown) {
  var diff = known.length ^ unknown.length;
  for (var i = 0; i < known.length; ++i) {
    diff |= known.charCodeAt(i) ^ unknown.charCodeAt(i);
  }
  return diff === 0;
}
function compareSync(password, hash2) {
  if (typeof password !== "string" || typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof password + ", " + typeof hash2);
  if (hash2.length !== 60) return false;
  return safeStringCompare(
    hashSync(password, hash2.substring(0, hash2.length - 31)),
    hash2
  );
}
function compare(password, hashValue, callback, progressCallback) {
  function _async(callback2) {
    if (typeof password !== "string" || typeof hashValue !== "string") {
      nextTick(
        callback2.bind(
          this,
          Error(
            "Illegal arguments: " + typeof password + ", " + typeof hashValue
          )
        )
      );
      return;
    }
    if (hashValue.length !== 60) {
      nextTick(callback2.bind(this, null, false));
      return;
    }
    hash(
      password,
      hashValue.substring(0, 29),
      function(err, comp) {
        if (err) callback2(err);
        else callback2(null, safeStringCompare(comp, hashValue));
      },
      progressCallback
    );
  }
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
function getRounds(hash2) {
  if (typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof hash2);
  return parseInt(hash2.split("$")[2], 10);
}
function getSalt(hash2) {
  if (typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof hash2);
  if (hash2.length !== 60)
    throw Error("Illegal hash length: " + hash2.length + " != 60");
  return hash2.substring(0, 29);
}
function truncates(password) {
  if (typeof password !== "string")
    throw Error("Illegal arguments: " + typeof password);
  return utf8Length(password) > 72;
}
var nextTick = typeof setImmediate === "function" ? setImmediate : typeof scheduler === "object" && typeof scheduler.postTask === "function" ? scheduler.postTask.bind(scheduler) : setTimeout;
function utf8Length(string) {
  var len = 0, c = 0;
  for (var i = 0; i < string.length; ++i) {
    c = string.charCodeAt(i);
    if (c < 128) len += 1;
    else if (c < 2048) len += 2;
    else if ((c & 64512) === 55296 && (string.charCodeAt(i + 1) & 64512) === 56320) {
      ++i;
      len += 4;
    } else len += 3;
  }
  return len;
}
function utf8Array(string) {
  var offset = 0, c1, c2;
  var buffer = new Array(utf8Length(string));
  for (var i = 0, k2 = string.length; i < k2; ++i) {
    c1 = string.charCodeAt(i);
    if (c1 < 128) {
      buffer[offset++] = c1;
    } else if (c1 < 2048) {
      buffer[offset++] = c1 >> 6 | 192;
      buffer[offset++] = c1 & 63 | 128;
    } else if ((c1 & 64512) === 55296 && ((c2 = string.charCodeAt(i + 1)) & 64512) === 56320) {
      c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
      ++i;
      buffer[offset++] = c1 >> 18 | 240;
      buffer[offset++] = c1 >> 12 & 63 | 128;
      buffer[offset++] = c1 >> 6 & 63 | 128;
      buffer[offset++] = c1 & 63 | 128;
    } else {
      buffer[offset++] = c1 >> 12 | 224;
      buffer[offset++] = c1 >> 6 & 63 | 128;
      buffer[offset++] = c1 & 63 | 128;
    }
  }
  return buffer;
}
var BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
var BASE64_INDEX = [
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  0,
  1,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
  61,
  62,
  63,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  -1,
  -1,
  -1,
  -1,
  -1
];
function base64_encode(b2, len) {
  var off = 0, rs2 = [], c1, c2;
  if (len <= 0 || len > b2.length) throw Error("Illegal len: " + len);
  while (off < len) {
    c1 = b2[off++] & 255;
    rs2.push(BASE64_CODE[c1 >> 2 & 63]);
    c1 = (c1 & 3) << 4;
    if (off >= len) {
      rs2.push(BASE64_CODE[c1 & 63]);
      break;
    }
    c2 = b2[off++] & 255;
    c1 |= c2 >> 4 & 15;
    rs2.push(BASE64_CODE[c1 & 63]);
    c1 = (c2 & 15) << 2;
    if (off >= len) {
      rs2.push(BASE64_CODE[c1 & 63]);
      break;
    }
    c2 = b2[off++] & 255;
    c1 |= c2 >> 6 & 3;
    rs2.push(BASE64_CODE[c1 & 63]);
    rs2.push(BASE64_CODE[c2 & 63]);
  }
  return rs2.join("");
}
function base64_decode(s, len) {
  var off = 0, slen = s.length, olen = 0, rs2 = [], c1, c2, c3, c4, o, code;
  if (len <= 0) throw Error("Illegal len: " + len);
  while (off < slen - 1 && olen < len) {
    code = s.charCodeAt(off++);
    c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    code = s.charCodeAt(off++);
    c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    if (c1 == -1 || c2 == -1) break;
    o = c1 << 2 >>> 0;
    o |= (c2 & 48) >> 4;
    rs2.push(String.fromCharCode(o));
    if (++olen >= len || off >= slen) break;
    code = s.charCodeAt(off++);
    c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    if (c3 == -1) break;
    o = (c2 & 15) << 4 >>> 0;
    o |= (c3 & 60) >> 2;
    rs2.push(String.fromCharCode(o));
    if (++olen >= len || off >= slen) break;
    code = s.charCodeAt(off++);
    c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    o = (c3 & 3) << 6 >>> 0;
    o |= c4;
    rs2.push(String.fromCharCode(o));
    ++olen;
  }
  var res = [];
  for (off = 0; off < olen; off++) res.push(rs2[off].charCodeAt(0));
  return res;
}
var BCRYPT_SALT_LEN = 16;
var GENSALT_DEFAULT_LOG2_ROUNDS = 10;
var BLOWFISH_NUM_ROUNDS = 16;
var MAX_EXECUTION_TIME = 100;
var P_ORIG = [
  608135816,
  2242054355,
  320440878,
  57701188,
  2752067618,
  698298832,
  137296536,
  3964562569,
  1160258022,
  953160567,
  3193202383,
  887688300,
  3232508343,
  3380367581,
  1065670069,
  3041331479,
  2450970073,
  2306472731
];
var S_ORIG = [
  3509652390,
  2564797868,
  805139163,
  3491422135,
  3101798381,
  1780907670,
  3128725573,
  4046225305,
  614570311,
  3012652279,
  134345442,
  2240740374,
  1667834072,
  1901547113,
  2757295779,
  4103290238,
  227898511,
  1921955416,
  1904987480,
  2182433518,
  2069144605,
  3260701109,
  2620446009,
  720527379,
  3318853667,
  677414384,
  3393288472,
  3101374703,
  2390351024,
  1614419982,
  1822297739,
  2954791486,
  3608508353,
  3174124327,
  2024746970,
  1432378464,
  3864339955,
  2857741204,
  1464375394,
  1676153920,
  1439316330,
  715854006,
  3033291828,
  289532110,
  2706671279,
  2087905683,
  3018724369,
  1668267050,
  732546397,
  1947742710,
  3462151702,
  2609353502,
  2950085171,
  1814351708,
  2050118529,
  680887927,
  999245976,
  1800124847,
  3300911131,
  1713906067,
  1641548236,
  4213287313,
  1216130144,
  1575780402,
  4018429277,
  3917837745,
  3693486850,
  3949271944,
  596196993,
  3549867205,
  258830323,
  2213823033,
  772490370,
  2760122372,
  1774776394,
  2652871518,
  566650946,
  4142492826,
  1728879713,
  2882767088,
  1783734482,
  3629395816,
  2517608232,
  2874225571,
  1861159788,
  326777828,
  3124490320,
  2130389656,
  2716951837,
  967770486,
  1724537150,
  2185432712,
  2364442137,
  1164943284,
  2105845187,
  998989502,
  3765401048,
  2244026483,
  1075463327,
  1455516326,
  1322494562,
  910128902,
  469688178,
  1117454909,
  936433444,
  3490320968,
  3675253459,
  1240580251,
  122909385,
  2157517691,
  634681816,
  4142456567,
  3825094682,
  3061402683,
  2540495037,
  79693498,
  3249098678,
  1084186820,
  1583128258,
  426386531,
  1761308591,
  1047286709,
  322548459,
  995290223,
  1845252383,
  2603652396,
  3431023940,
  2942221577,
  3202600964,
  3727903485,
  1712269319,
  422464435,
  3234572375,
  1170764815,
  3523960633,
  3117677531,
  1434042557,
  442511882,
  3600875718,
  1076654713,
  1738483198,
  4213154764,
  2393238008,
  3677496056,
  1014306527,
  4251020053,
  793779912,
  2902807211,
  842905082,
  4246964064,
  1395751752,
  1040244610,
  2656851899,
  3396308128,
  445077038,
  3742853595,
  3577915638,
  679411651,
  2892444358,
  2354009459,
  1767581616,
  3150600392,
  3791627101,
  3102740896,
  284835224,
  4246832056,
  1258075500,
  768725851,
  2589189241,
  3069724005,
  3532540348,
  1274779536,
  3789419226,
  2764799539,
  1660621633,
  3471099624,
  4011903706,
  913787905,
  3497959166,
  737222580,
  2514213453,
  2928710040,
  3937242737,
  1804850592,
  3499020752,
  2949064160,
  2386320175,
  2390070455,
  2415321851,
  4061277028,
  2290661394,
  2416832540,
  1336762016,
  1754252060,
  3520065937,
  3014181293,
  791618072,
  3188594551,
  3933548030,
  2332172193,
  3852520463,
  3043980520,
  413987798,
  3465142937,
  3030929376,
  4245938359,
  2093235073,
  3534596313,
  375366246,
  2157278981,
  2479649556,
  555357303,
  3870105701,
  2008414854,
  3344188149,
  4221384143,
  3956125452,
  2067696032,
  3594591187,
  2921233993,
  2428461,
  544322398,
  577241275,
  1471733935,
  610547355,
  4027169054,
  1432588573,
  1507829418,
  2025931657,
  3646575487,
  545086370,
  48609733,
  2200306550,
  1653985193,
  298326376,
  1316178497,
  3007786442,
  2064951626,
  458293330,
  2589141269,
  3591329599,
  3164325604,
  727753846,
  2179363840,
  146436021,
  1461446943,
  4069977195,
  705550613,
  3059967265,
  3887724982,
  4281599278,
  3313849956,
  1404054877,
  2845806497,
  146425753,
  1854211946,
  1266315497,
  3048417604,
  3681880366,
  3289982499,
  290971e4,
  1235738493,
  2632868024,
  2414719590,
  3970600049,
  1771706367,
  1449415276,
  3266420449,
  422970021,
  1963543593,
  2690192192,
  3826793022,
  1062508698,
  1531092325,
  1804592342,
  2583117782,
  2714934279,
  4024971509,
  1294809318,
  4028980673,
  1289560198,
  2221992742,
  1669523910,
  35572830,
  157838143,
  1052438473,
  1016535060,
  1802137761,
  1753167236,
  1386275462,
  3080475397,
  2857371447,
  1040679964,
  2145300060,
  2390574316,
  1461121720,
  2956646967,
  4031777805,
  4028374788,
  33600511,
  2920084762,
  1018524850,
  629373528,
  3691585981,
  3515945977,
  2091462646,
  2486323059,
  586499841,
  988145025,
  935516892,
  3367335476,
  2599673255,
  2839830854,
  265290510,
  3972581182,
  2759138881,
  3795373465,
  1005194799,
  847297441,
  406762289,
  1314163512,
  1332590856,
  1866599683,
  4127851711,
  750260880,
  613907577,
  1450815602,
  3165620655,
  3734664991,
  3650291728,
  3012275730,
  3704569646,
  1427272223,
  778793252,
  1343938022,
  2676280711,
  2052605720,
  1946737175,
  3164576444,
  3914038668,
  3967478842,
  3682934266,
  1661551462,
  3294938066,
  4011595847,
  840292616,
  3712170807,
  616741398,
  312560963,
  711312465,
  1351876610,
  322626781,
  1910503582,
  271666773,
  2175563734,
  1594956187,
  70604529,
  3617834859,
  1007753275,
  1495573769,
  4069517037,
  2549218298,
  2663038764,
  504708206,
  2263041392,
  3941167025,
  2249088522,
  1514023603,
  1998579484,
  1312622330,
  694541497,
  2582060303,
  2151582166,
  1382467621,
  776784248,
  2618340202,
  3323268794,
  2497899128,
  2784771155,
  503983604,
  4076293799,
  907881277,
  423175695,
  432175456,
  1378068232,
  4145222326,
  3954048622,
  3938656102,
  3820766613,
  2793130115,
  2977904593,
  26017576,
  3274890735,
  3194772133,
  1700274565,
  1756076034,
  4006520079,
  3677328699,
  720338349,
  1533947780,
  354530856,
  688349552,
  3973924725,
  1637815568,
  332179504,
  3949051286,
  53804574,
  2852348879,
  3044236432,
  1282449977,
  3583942155,
  3416972820,
  4006381244,
  1617046695,
  2628476075,
  3002303598,
  1686838959,
  431878346,
  2686675385,
  1700445008,
  1080580658,
  1009431731,
  832498133,
  3223435511,
  2605976345,
  2271191193,
  2516031870,
  1648197032,
  4164389018,
  2548247927,
  300782431,
  375919233,
  238389289,
  3353747414,
  2531188641,
  2019080857,
  1475708069,
  455242339,
  2609103871,
  448939670,
  3451063019,
  1395535956,
  2413381860,
  1841049896,
  1491858159,
  885456874,
  4264095073,
  4001119347,
  1565136089,
  3898914787,
  1108368660,
  540939232,
  1173283510,
  2745871338,
  3681308437,
  4207628240,
  3343053890,
  4016749493,
  1699691293,
  1103962373,
  3625875870,
  2256883143,
  3830138730,
  1031889488,
  3479347698,
  1535977030,
  4236805024,
  3251091107,
  2132092099,
  1774941330,
  1199868427,
  1452454533,
  157007616,
  2904115357,
  342012276,
  595725824,
  1480756522,
  206960106,
  497939518,
  591360097,
  863170706,
  2375253569,
  3596610801,
  1814182875,
  2094937945,
  3421402208,
  1082520231,
  3463918190,
  2785509508,
  435703966,
  3908032597,
  1641649973,
  2842273706,
  3305899714,
  1510255612,
  2148256476,
  2655287854,
  3276092548,
  4258621189,
  236887753,
  3681803219,
  274041037,
  1734335097,
  3815195456,
  3317970021,
  1899903192,
  1026095262,
  4050517792,
  356393447,
  2410691914,
  3873677099,
  3682840055,
  3913112168,
  2491498743,
  4132185628,
  2489919796,
  1091903735,
  1979897079,
  3170134830,
  3567386728,
  3557303409,
  857797738,
  1136121015,
  1342202287,
  507115054,
  2535736646,
  337727348,
  3213592640,
  1301675037,
  2528481711,
  1895095763,
  1721773893,
  3216771564,
  62756741,
  2142006736,
  835421444,
  2531993523,
  1442658625,
  3659876326,
  2882144922,
  676362277,
  1392781812,
  170690266,
  3921047035,
  1759253602,
  3611846912,
  1745797284,
  664899054,
  1329594018,
  3901205900,
  3045908486,
  2062866102,
  2865634940,
  3543621612,
  3464012697,
  1080764994,
  553557557,
  3656615353,
  3996768171,
  991055499,
  499776247,
  1265440854,
  648242737,
  3940784050,
  980351604,
  3713745714,
  1749149687,
  3396870395,
  4211799374,
  3640570775,
  1161844396,
  3125318951,
  1431517754,
  545492359,
  4268468663,
  3499529547,
  1437099964,
  2702547544,
  3433638243,
  2581715763,
  2787789398,
  1060185593,
  1593081372,
  2418618748,
  4260947970,
  69676912,
  2159744348,
  86519011,
  2512459080,
  3838209314,
  1220612927,
  3339683548,
  133810670,
  1090789135,
  1078426020,
  1569222167,
  845107691,
  3583754449,
  4072456591,
  1091646820,
  628848692,
  1613405280,
  3757631651,
  526609435,
  236106946,
  48312990,
  2942717905,
  3402727701,
  1797494240,
  859738849,
  992217954,
  4005476642,
  2243076622,
  3870952857,
  3732016268,
  765654824,
  3490871365,
  2511836413,
  1685915746,
  3888969200,
  1414112111,
  2273134842,
  3281911079,
  4080962846,
  172450625,
  2569994100,
  980381355,
  4109958455,
  2819808352,
  2716589560,
  2568741196,
  3681446669,
  3329971472,
  1835478071,
  660984891,
  3704678404,
  4045999559,
  3422617507,
  3040415634,
  1762651403,
  1719377915,
  3470491036,
  2693910283,
  3642056355,
  3138596744,
  1364962596,
  2073328063,
  1983633131,
  926494387,
  3423689081,
  2150032023,
  4096667949,
  1749200295,
  3328846651,
  309677260,
  2016342300,
  1779581495,
  3079819751,
  111262694,
  1274766160,
  443224088,
  298511866,
  1025883608,
  3806446537,
  1145181785,
  168956806,
  3641502830,
  3584813610,
  1689216846,
  3666258015,
  3200248200,
  1692713982,
  2646376535,
  4042768518,
  1618508792,
  1610833997,
  3523052358,
  4130873264,
  2001055236,
  3610705100,
  2202168115,
  4028541809,
  2961195399,
  1006657119,
  2006996926,
  3186142756,
  1430667929,
  3210227297,
  1314452623,
  4074634658,
  4101304120,
  2273951170,
  1399257539,
  3367210612,
  3027628629,
  1190975929,
  2062231137,
  2333990788,
  2221543033,
  2438960610,
  1181637006,
  548689776,
  2362791313,
  3372408396,
  3104550113,
  3145860560,
  296247880,
  1970579870,
  3078560182,
  3769228297,
  1714227617,
  3291629107,
  3898220290,
  166772364,
  1251581989,
  493813264,
  448347421,
  195405023,
  2709975567,
  677966185,
  3703036547,
  1463355134,
  2715995803,
  1338867538,
  1343315457,
  2802222074,
  2684532164,
  233230375,
  2599980071,
  2000651841,
  3277868038,
  1638401717,
  4028070440,
  3237316320,
  6314154,
  819756386,
  300326615,
  590932579,
  1405279636,
  3267499572,
  3150704214,
  2428286686,
  3959192993,
  3461946742,
  1862657033,
  1266418056,
  963775037,
  2089974820,
  2263052895,
  1917689273,
  448879540,
  3550394620,
  3981727096,
  150775221,
  3627908307,
  1303187396,
  508620638,
  2975983352,
  2726630617,
  1817252668,
  1876281319,
  1457606340,
  908771278,
  3720792119,
  3617206836,
  2455994898,
  1729034894,
  1080033504,
  976866871,
  3556439503,
  2881648439,
  1522871579,
  1555064734,
  1336096578,
  3548522304,
  2579274686,
  3574697629,
  3205460757,
  3593280638,
  3338716283,
  3079412587,
  564236357,
  2993598910,
  1781952180,
  1464380207,
  3163844217,
  3332601554,
  1699332808,
  1393555694,
  1183702653,
  3581086237,
  1288719814,
  691649499,
  2847557200,
  2895455976,
  3193889540,
  2717570544,
  1781354906,
  1676643554,
  2592534050,
  3230253752,
  1126444790,
  2770207658,
  2633158820,
  2210423226,
  2615765581,
  2414155088,
  3127139286,
  673620729,
  2805611233,
  1269405062,
  4015350505,
  3341807571,
  4149409754,
  1057255273,
  2012875353,
  2162469141,
  2276492801,
  2601117357,
  993977747,
  3918593370,
  2654263191,
  753973209,
  36408145,
  2530585658,
  25011837,
  3520020182,
  2088578344,
  530523599,
  2918365339,
  1524020338,
  1518925132,
  3760827505,
  3759777254,
  1202760957,
  3985898139,
  3906192525,
  674977740,
  4174734889,
  2031300136,
  2019492241,
  3983892565,
  4153806404,
  3822280332,
  352677332,
  2297720250,
  60907813,
  90501309,
  3286998549,
  1016092578,
  2535922412,
  2839152426,
  457141659,
  509813237,
  4120667899,
  652014361,
  1966332200,
  2975202805,
  55981186,
  2327461051,
  676427537,
  3255491064,
  2882294119,
  3433927263,
  1307055953,
  942726286,
  933058658,
  2468411793,
  3933900994,
  4215176142,
  1361170020,
  2001714738,
  2830558078,
  3274259782,
  1222529897,
  1679025792,
  2729314320,
  3714953764,
  1770335741,
  151462246,
  3013232138,
  1682292957,
  1483529935,
  471910574,
  1539241949,
  458788160,
  3436315007,
  1807016891,
  3718408830,
  978976581,
  1043663428,
  3165965781,
  1927990952,
  4200891579,
  2372276910,
  3208408903,
  3533431907,
  1412390302,
  2931980059,
  4132332400,
  1947078029,
  3881505623,
  4168226417,
  2941484381,
  1077988104,
  1320477388,
  886195818,
  18198404,
  3786409e3,
  2509781533,
  112762804,
  3463356488,
  1866414978,
  891333506,
  18488651,
  661792760,
  1628790961,
  3885187036,
  3141171499,
  876946877,
  2693282273,
  1372485963,
  791857591,
  2686433993,
  3759982718,
  3167212022,
  3472953795,
  2716379847,
  445679433,
  3561995674,
  3504004811,
  3574258232,
  54117162,
  3331405415,
  2381918588,
  3769707343,
  4154350007,
  1140177722,
  4074052095,
  668550556,
  3214352940,
  367459370,
  261225585,
  2610173221,
  4209349473,
  3468074219,
  3265815641,
  314222801,
  3066103646,
  3808782860,
  282218597,
  3406013506,
  3773591054,
  379116347,
  1285071038,
  846784868,
  2669647154,
  3771962079,
  3550491691,
  2305946142,
  453669953,
  1268987020,
  3317592352,
  3279303384,
  3744833421,
  2610507566,
  3859509063,
  266596637,
  3847019092,
  517658769,
  3462560207,
  3443424879,
  370717030,
  4247526661,
  2224018117,
  4143653529,
  4112773975,
  2788324899,
  2477274417,
  1456262402,
  2901442914,
  1517677493,
  1846949527,
  2295493580,
  3734397586,
  2176403920,
  1280348187,
  1908823572,
  3871786941,
  846861322,
  1172426758,
  3287448474,
  3383383037,
  1655181056,
  3139813346,
  901632758,
  1897031941,
  2986607138,
  3066810236,
  3447102507,
  1393639104,
  373351379,
  950779232,
  625454576,
  3124240540,
  4148612726,
  2007998917,
  544563296,
  2244738638,
  2330496472,
  2058025392,
  1291430526,
  424198748,
  50039436,
  29584100,
  3605783033,
  2429876329,
  2791104160,
  1057563949,
  3255363231,
  3075367218,
  3463963227,
  1469046755,
  985887462
];
var C_ORIG = [
  1332899944,
  1700884034,
  1701343084,
  1684370003,
  1668446532,
  1869963892
];
function _encipher(lr2, off, P2, S) {
  var n, l = lr2[off], r = lr2[off + 1];
  l ^= P2[0];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P2[1];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P2[2];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P2[3];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P2[4];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P2[5];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P2[6];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P2[7];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P2[8];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P2[9];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P2[10];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P2[11];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P2[12];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P2[13];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P2[14];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P2[15];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P2[16];
  lr2[off] = r ^ P2[BLOWFISH_NUM_ROUNDS + 1];
  lr2[off + 1] = l;
  return lr2;
}
function _streamtoword(data, offp) {
  for (var i = 0, word = 0; i < 4; ++i)
    word = word << 8 | data[offp] & 255, offp = (offp + 1) % data.length;
  return { key: word, offp };
}
function _key(key, P2, S) {
  var offset = 0, lr2 = [0, 0], plen = P2.length, slen = S.length, sw;
  for (var i = 0; i < plen; i++)
    sw = _streamtoword(key, offset), offset = sw.offp, P2[i] = P2[i] ^ sw.key;
  for (i = 0; i < plen; i += 2)
    lr2 = _encipher(lr2, 0, P2, S), P2[i] = lr2[0], P2[i + 1] = lr2[1];
  for (i = 0; i < slen; i += 2)
    lr2 = _encipher(lr2, 0, P2, S), S[i] = lr2[0], S[i + 1] = lr2[1];
}
function _ekskey(data, key, P2, S) {
  var offp = 0, lr2 = [0, 0], plen = P2.length, slen = S.length, sw;
  for (var i = 0; i < plen; i++)
    sw = _streamtoword(key, offp), offp = sw.offp, P2[i] = P2[i] ^ sw.key;
  offp = 0;
  for (i = 0; i < plen; i += 2)
    sw = _streamtoword(data, offp), offp = sw.offp, lr2[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr2[1] ^= sw.key, lr2 = _encipher(lr2, 0, P2, S), P2[i] = lr2[0], P2[i + 1] = lr2[1];
  for (i = 0; i < slen; i += 2)
    sw = _streamtoword(data, offp), offp = sw.offp, lr2[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr2[1] ^= sw.key, lr2 = _encipher(lr2, 0, P2, S), S[i] = lr2[0], S[i + 1] = lr2[1];
}
function _crypt(b2, salt, rounds, callback, progressCallback) {
  var cdata = C_ORIG.slice(), clen = cdata.length, err;
  if (rounds < 4 || rounds > 31) {
    err = Error("Illegal number of rounds (4-31): " + rounds);
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  if (salt.length !== BCRYPT_SALT_LEN) {
    err = Error(
      "Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN
    );
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  rounds = 1 << rounds >>> 0;
  var P2, S, i = 0, j2;
  if (typeof Int32Array === "function") {
    P2 = new Int32Array(P_ORIG);
    S = new Int32Array(S_ORIG);
  } else {
    P2 = P_ORIG.slice();
    S = S_ORIG.slice();
  }
  _ekskey(salt, b2, P2, S);
  function next() {
    if (progressCallback) progressCallback(i / rounds);
    if (i < rounds) {
      var start = Date.now();
      for (; i < rounds; ) {
        i = i + 1;
        _key(b2, P2, S);
        _key(salt, P2, S);
        if (Date.now() - start > MAX_EXECUTION_TIME) break;
      }
    } else {
      for (i = 0; i < 64; i++)
        for (j2 = 0; j2 < clen >> 1; j2++) _encipher(cdata, j2 << 1, P2, S);
      var ret = [];
      for (i = 0; i < clen; i++)
        ret.push((cdata[i] >> 24 & 255) >>> 0), ret.push((cdata[i] >> 16 & 255) >>> 0), ret.push((cdata[i] >> 8 & 255) >>> 0), ret.push((cdata[i] & 255) >>> 0);
      if (callback) {
        callback(null, ret);
        return;
      } else return ret;
    }
    if (callback) nextTick(next);
  }
  if (typeof callback !== "undefined") {
    next();
  } else {
    var res;
    while (true) if (typeof (res = next()) !== "undefined") return res || [];
  }
}
function _hash(password, salt, callback, progressCallback) {
  var err;
  if (typeof password !== "string" || typeof salt !== "string") {
    err = Error("Invalid string / salt: Not a string");
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  var minor, offset;
  if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
    err = Error("Invalid salt version: " + salt.substring(0, 2));
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  if (salt.charAt(2) === "$") minor = String.fromCharCode(0), offset = 3;
  else {
    minor = salt.charAt(2);
    if (minor !== "a" && minor !== "b" && minor !== "y" || salt.charAt(3) !== "$") {
      err = Error("Invalid salt revision: " + salt.substring(2, 4));
      if (callback) {
        nextTick(callback.bind(this, err));
        return;
      } else throw err;
    }
    offset = 4;
  }
  if (salt.charAt(offset + 2) > "$") {
    err = Error("Missing salt rounds");
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10, r2 = parseInt(salt.substring(offset + 1, offset + 2), 10), rounds = r1 + r2, real_salt = salt.substring(offset + 3, offset + 25);
  password += minor >= "a" ? "\0" : "";
  var passwordb = utf8Array(password), saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);
  function finish(bytes) {
    var res = [];
    res.push("$2");
    if (minor >= "a") res.push(minor);
    res.push("$");
    if (rounds < 10) res.push("0");
    res.push(rounds.toString());
    res.push("$");
    res.push(base64_encode(saltb, saltb.length));
    res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
    return res.join("");
  }
  if (typeof callback == "undefined")
    return finish(_crypt(passwordb, saltb, rounds));
  else {
    _crypt(
      passwordb,
      saltb,
      rounds,
      function(err2, bytes) {
        if (err2) callback(err2, null);
        else callback(null, finish(bytes));
      },
      progressCallback
    );
  }
}
function encodeBase64(bytes, length) {
  return base64_encode(bytes, length);
}
function decodeBase64(string, length) {
  return base64_decode(string, length);
}
const bcrypt = {
  setRandomFallback,
  genSaltSync,
  genSalt,
  hashSync,
  hash,
  compareSync,
  compare,
  getRounds,
  getSalt,
  truncates,
  encodeBase64,
  decodeBase64
};
const store = new Store({
  defaults: {
    branchId: "",
    organizationId: "",
    organizationName: "",
    lastSeenAt: "",
    pendingSyncActions: []
  }
});
function normalizeApiBase(url) {
  return url.replace(/\/+$/, "");
}
function unique(values) {
  return Array.from(new Set(values.map(normalizeApiBase)));
}
function computeApiCandidates() {
  const envCandidates = [
    process.env.FARAMACE_API_BASE_URL,
    process.env.FARAMACE_API_URL,
    process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api` : void 0
  ].filter(Boolean);
  const localCandidates = [
    "http://127.0.0.1:3000/api",
    "http://localhost:3000/api"
  ];
  const cloudCandidates = [
    "https://faramace.com/api"
  ];
  const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV !== "production";
  if (isDev) {
    return unique([...localCandidates]);
  }
  return unique([...envCandidates, ...cloudCandidates, ...localCandidates]);
}
const API_CANDIDATES = computeApiCandidates();
let activeApiBase = API_CANDIDATES[0] || "http://127.0.0.1:3000/api";
function getApiCandidates() {
  const rest = API_CANDIDATES.filter((base) => base !== activeApiBase);
  return [activeApiBase, ...rest];
}
function setApiBaseUrl(base) {
  activeApiBase = normalizeApiBase(base);
}
function buildApiUrl(pathname) {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${activeApiBase}${normalizedPath}`;
}
class SyncClientError extends Error {
  constructor(message2, status, payload) {
    super(message2);
    this.status = status;
    this.payload = payload;
    this.name = "SyncClientError";
  }
}
async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1e3) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15e3);
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) return response;
      if (response.status >= 500 || response.status === 429) {
        console.log(`[Sync] Server busy (${response.status}). Retry ${i + 1}/${retries} in ${backoff}ms...`);
        await new Promise((r) => setTimeout(r, backoff));
        backoff *= 2;
        continue;
      }
      let errorMsg = response.statusText;
      try {
        const errBody = await response.json();
        errorMsg = errBody.error || errorMsg;
      } catch (e10) {
        errorMsg = await response.text();
      }
      throw new SyncClientError(`Client Error ${response.status}: ${errorMsg}`, response.status);
    } catch (err) {
      if (err instanceof SyncClientError) {
        throw err;
      }
      const isNetworkError = err.name === "AbortError" || err.message.includes("fetch");
      if (i < retries - 1 && isNetworkError) {
        console.log(`[Sync] Network error. Retry ${i + 1}/${retries} in ${backoff}ms...`);
        await new Promise((r) => setTimeout(r, backoff));
        backoff *= 2;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed after ${retries} retries`);
}
function getBranchId() {
  return store.get("branchId");
}
let isOnline = false;
let wasOffline = true;
const runningSyncTasks = /* @__PURE__ */ new Set();
let syncServiceStarted = false;
function getConnectionStatus() {
  return isOnline;
}
function beginSyncTask(taskName) {
  if (runningSyncTasks.has(taskName)) {
    console.log(`[SyncLock] Skip '${taskName}' because it is already running.`);
    return false;
  }
  runningSyncTasks.add(taskName);
  return true;
}
function endSyncTask(taskName) {
  runningSyncTasks.delete(taskName);
}
async function checkConnection() {
  console.log("[Connection] Starting connectivity check...");
  for (const base of getApiCandidates()) {
    try {
      console.log(`[Connection] Checking candidate: ${base}/health`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5e3);
      const response = await fetch(`${base}/health`, {
        method: "GET",
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        console.log(`[Connection] Success! Connected to ${base}`);
        setApiBaseUrl(base);
        const justReconnected = wasOffline;
        isOnline = true;
        wasOffline = false;
        electron.BrowserWindow.getAllWindows().forEach((win2) => {
          win2.webContents.send("connection-status", true);
        });
        if (justReconnected) {
          setTimeout(() => void syncSettings(), 500);
        }
        return true;
      } else {
        console.log(`[Connection] Failed. Status: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.log(`[Connection] Error connecting to ${base}:`, error.message);
    }
  }
  console.log("[Connection] All candidates failed. Setting Offline.");
  isOnline = false;
  wasOffline = true;
  electron.BrowserWindow.getAllWindows().forEach((win2) => {
    win2.webContents.send("connection-status", false);
  });
  return false;
}
async function pushPatient(patient) {
  try {
    if (!isOnline) {
      console.log("[Sync] Offline. Patient created locally but not pushed.");
      return false;
    }
    console.log(`[Sync] Pushing patient ${patient.name} to cloud...`);
    const response = await fetchWithRetry(buildApiUrl("/patients"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patient)
    });
    if (response.ok) {
      console.log("[Sync] Patient pushed successfully.");
      return true;
    } else {
      console.error("[Sync] Failed to push patient:", response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.error("[Sync] Error pushing patient:", error);
    return false;
  }
}
async function syncSales() {
  const taskName = "sales";
  if (!beginSyncTask(taskName)) return;
  try {
    isOnline = await checkConnection();
    if (!isOnline) {
      console.log("[Sync] Server unavailable. Sales sync postponed.");
      return;
    }
    const unsyncedSales = await prisma.sale.findMany({
      where: { synced: false },
      include: { items: true, payment: true, patient: true },
      take: 10
    });
    if (unsyncedSales.length === 0) return;
    console.log(`[Sync] Syncing ${unsyncedSales.length} unsynced sale(s)...`);
    const branchId = getBranchId();
    if (!branchId) {
      console.log("[Sync] Branch ID missing. Login is required before sync.");
      return;
    }
    const salesPayload = unsyncedSales.map((sale) => {
      var _a2;
      return {
        id: sale.id,
        total: sale.total,
        discount: sale.discount || 0,
        createdAt: sale.createdAt,
        userId: sale.userId,
        patientId: sale.patientId,
        paymentMethod: ((_a2 = sale.payment) == null ? void 0 : _a2.method) || "CASH",
        items: sale.items.map((item) => ({
          drugId: item.drugId,
          quantity: item.quantity,
          price: item.price
        })),
        // Include patient snapshot so cloud can upsert before FK check
        patient: sale.patient ? {
          id: sale.patient.id,
          name: sale.patient.name,
          phone: sale.patient.phone ?? null,
          branchId: sale.patient.branchId ?? branchId
        } : null
      };
    });
    const salesIdempotencyKey = buildIdempotencyKey("sync-sales", `${branchId}-${Date.now()}`);
    const response = await fetchWithRetry(buildApiUrl("/sync/sales"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": salesIdempotencyKey
      },
      body: JSON.stringify({
        branchId,
        sales: salesPayload
      })
    });
    const result = await response.json();
    const syncedIds = result.syncedIds;
    if (syncedIds && syncedIds.length > 0) {
      await prisma.sale.updateMany({
        where: { id: { in: syncedIds } },
        data: { synced: true }
      });
      console.log(`[Sync] Sales sync completed. Marked ${syncedIds.length} sale(s) as synced.`);
    }
  } catch (error) {
    if (error.name === "SyncClientError") {
      console.error("[Sync DLQ] Permanent Client Error in Sales Sync:", error.message);
      const unsyncedSales = await prisma.sale.findMany({
        where: { synced: false },
        include: { items: true, payment: true },
        take: 10
      });
      for (const sale of unsyncedSales) {
        await prisma.syncFailure.create({
          data: {
            entityType: "SALE",
            entityId: sale.id,
            payload: JSON.stringify(sale),
            errorMessage: error.message
          }
        });
        await prisma.sale.update({
          where: { id: sale.id },
          data: { synced: true }
        });
      }
      store.set("syncFailureFlag", Date.now());
      electron.BrowserWindow.getAllWindows().forEach((win2) => {
        win2.webContents.send("sync-failure-recorded");
      });
    } else {
      console.log("[Sync] Sales sync paused (offline mode).", error.message);
    }
  } finally {
    endSyncTask(taskName);
  }
}
async function syncDebtPayments() {
  const taskName = "debtPayments";
  if (!beginSyncTask(taskName)) return;
  try {
    if (!getConnectionStatus()) return;
    const unsyncedPayments = await prisma.debtPayment.findMany({
      where: { synced: false },
      take: 20
    });
    const branchId = getBranchId();
    if (!branchId) return;
    if (unsyncedPayments.length > 0) {
      console.log(`[Sync] Pushing ${unsyncedPayments.length} debt payments...`);
      const payload = unsyncedPayments.map((p) => ({
        id: p.id,
        saleId: p.saleId,
        amount: p.amount,
        method: p.method,
        note: p.note,
        createdAt: p.createdAt
      }));
      const debtIdempotencyKey = buildIdempotencyKey("sync-debt", `${branchId}-${Date.now()}`);
      const response = await fetchWithRetry(buildApiUrl("/sync/debt-payments"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-idempotency-key": debtIdempotencyKey
        },
        body: JSON.stringify({
          branchId,
          payments: payload
        })
      });
      const result = await response.json();
      if (result.syncedIds && result.syncedIds.length > 0) {
        await prisma.debtPayment.updateMany({
          where: { id: { in: result.syncedIds } },
          data: { synced: true }
        });
        console.log(`[Sync] ${result.syncedIds.length} payments marked as synced.`);
      }
    }
    console.log(`[Sync] Pulling debt payments from cloud...`);
    const responsePull = await fetchWithRetry(buildApiUrl(`/sync/debt-payments?branchId=${branchId}`));
    if (responsePull.ok) {
      const data = await responsePull.json();
      const payments = data.payments || [];
      let pulled = 0;
      for (const payment of payments) {
        try {
          await prisma.$transaction(async (tx) => {
            const existing = await tx.debtPayment.findUnique({ where: { id: payment.id } });
            if (existing) return;
            const localSale = await tx.sale.findUnique({ where: { id: payment.saleId }, select: { id: true } });
            if (!localSale) return;
            await tx.debtPayment.create({
              data: {
                id: payment.id,
                saleId: payment.saleId,
                amount: payment.amount,
                method: payment.method,
                note: payment.note,
                createdAt: new Date(payment.createdAt),
                synced: true
              }
            });
            if (payment.patientId) {
              const patient = await tx.patient.findUnique({
                where: { id: payment.patientId },
                select: { balance: true }
              });
              if (patient) {
                await tx.patient.update({
                  where: { id: payment.patientId },
                  data: { balance: Math.max(0, patient.balance - payment.amount) }
                });
              }
            }
          });
          pulled++;
        } catch (pullErr) {
          console.warn(`[Sync] Skipping cloud payment ${payment.id}: ${pullErr.message}`);
        }
      }
      if (pulled > 0) {
        console.log(`[Sync] Pulled ${pulled} new debt payment(s) from cloud.`);
      }
    } else {
      console.error(`[Sync] Failed to pull debt payments: HTTP ${responsePull.status}`);
    }
  } catch (error) {
    if (error.name === "SyncClientError") {
      console.error("[Sync DLQ] Permanent Client Error in Debt Sync:", error.message);
      const unsyncedPayments = await prisma.debtPayment.findMany({ where: { synced: false }, take: 20 });
      for (const p of unsyncedPayments) {
        await prisma.syncFailure.create({
          data: {
            entityType: "DEBT_PAYMENT",
            entityId: p.id,
            payload: JSON.stringify(p),
            errorMessage: error.message
          }
        });
        await prisma.debtPayment.update({ where: { id: p.id }, data: { synced: true } });
      }
      BrowsersNotifyFailure();
    } else {
      console.error("[Sync] Error syncing debt payments:", error.message);
    }
  } finally {
    endSyncTask(taskName);
  }
}
function BrowsersNotifyFailure() {
  store.set("syncFailureFlag", Date.now());
  electron.BrowserWindow.getAllWindows().forEach((win2) => {
    win2.webContents.send("sync-failure-recorded");
  });
}
async function syncSaleReturns() {
  const taskName = "saleReturns";
  if (!beginSyncTask(taskName)) return;
  try {
    isOnline = await checkConnection();
    if (!isOnline) {
      console.log("[Sync] Server unavailable. Sale returns sync postponed.");
      return;
    }
    const unsyncedReturns = await prisma.saleReturn.findMany({
      where: { synced: false },
      include: { items: true },
      take: 10
    });
    if (unsyncedReturns.length === 0) return;
    console.log(`[Sync] Syncing ${unsyncedReturns.length} unsynced sale return(s)...`);
    const branchId = getBranchId();
    if (!branchId) {
      console.log("[Sync] Branch ID missing. Login is required before sync.");
      return;
    }
    const returnsPayload = unsyncedReturns.map((ret) => ({
      id: ret.id,
      saleId: ret.saleId,
      safeId: ret.safeId,
      total: ret.total,
      createdAt: ret.createdAt,
      notes: ret.notes,
      items: ret.items.map((item) => ({
        drugId: item.drugId,
        quantity: item.quantity,
        price: item.price
      }))
    }));
    const response = await fetchWithRetry(buildApiUrl("/sync/returns"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId, returns: returnsPayload })
    });
    const result = await response.json();
    const syncedIds = result.syncedIds;
    if (syncedIds && syncedIds.length > 0) {
      await prisma.saleReturn.updateMany({
        where: { id: { in: syncedIds } },
        data: { synced: true }
      });
      console.log(`[Sync] Sale returns sync completed. Marked ${syncedIds.length} return(s) as synced.`);
    }
  } catch (error) {
    if (error.name === "SyncClientError") {
      console.error("[Sync DLQ] Permanent Client Error in Sale Returns Sync:", error.message);
    } else {
      console.log("[Sync] Sale returns sync paused (offline mode).", error.message);
    }
  } finally {
    endSyncTask(taskName);
  }
}
function startSyncService() {
  if (syncServiceStarted) {
    console.log("[Sync] startSyncService was already initialized. Skipping duplicate startup.");
    return;
  }
  syncServiceStarted = true;
  console.log("--- Starting Sync Service ---");
  setTimeout(syncCurrentBranch, 1e3);
  setTimeout(syncSettings, 3e3);
  setTimeout(syncSuppliers, 4e3);
  setTimeout(syncProducts, 5e3);
  setTimeout(syncPatients, 8e3);
  setTimeout(syncUsers, 1e4);
  setTimeout(syncSales, 15e3);
  setTimeout(syncSaleReturns, 17e3);
  setTimeout(syncLoyalty, 2e4);
  setTimeout(syncDebtPayments, 25e3);
  setTimeout(syncTransfers, 3e4);
  setInterval(syncCurrentBranch, 60 * 60 * 1e3);
  setInterval(syncSales, 2 * 60 * 1e3);
  setInterval(syncSaleReturns, 2 * 60 * 1e3);
  setInterval(syncSuppliers, 15 * 60 * 1e3);
  setInterval(syncProducts, 5 * 60 * 1e3);
  setInterval(syncUsers, 5 * 60 * 1e3);
  setInterval(syncPatients, 2 * 60 * 1e3);
  setInterval(syncSettings, 2 * 60 * 1e3);
  setInterval(syncDebtPayments, 2 * 60 * 1e3);
  setInterval(syncLoyalty, 2 * 60 * 1e3);
  setInterval(syncShifts, 5 * 60 * 1e3);
  setInterval(syncTransactions, 5 * 60 * 1e3);
  setInterval(syncTransfers, 10 * 60 * 1e3);
  setTimeout(() => void refreshOfflineToken(), 2e4);
  setInterval(() => void refreshOfflineToken(), 6 * 60 * 60 * 1e3);
}
async function refreshOfflineToken() {
  const branchId = getBranchId();
  const licenseKey = store.get("licenseKey");
  if (!branchId || !licenseKey) return;
  try {
    const url = buildApiUrl(`/sync/offline-token?branchId=${encodeURIComponent(branchId)}&licenseKey=${encodeURIComponent(licenseKey)}`);
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      console.warn("[OfflineToken] Server returned", response.status, "— skipping token refresh.");
      return;
    }
    const data = await response.json();
    if (data.token) {
      storeOfflineToken(data.token);
      store.set("lastSeenAt", (/* @__PURE__ */ new Date()).toISOString());
      console.log("[OfflineToken] Offline token refreshed successfully.");
    }
  } catch (err) {
    console.warn("[OfflineToken] Could not refresh offline token:", err);
  }
}
async function syncTransfers() {
  const taskName = "transfers";
  if (!beginSyncTask(taskName)) return;
  try {
    if (!await checkConnection()) return;
    const branchId = getBranchId();
    if (!branchId) return;
    console.log(`[Sync] Pulling transfers for branch: ${branchId}...`);
    const response = await fetchWithRetry(
      buildApiUrl(`/inventory/transfers/sync?branchId=${branchId}`)
    );
    if (!response.ok) {
      console.error(`[Sync] Failed to fetch transfers: ${response.status}`);
      return;
    }
    const data = await response.json();
    const transfers = data.transfers || [];
    if (transfers.length === 0) {
      console.log("[Sync] No transfers to process.");
      return;
    }
    console.log(`[Sync] Retrieved ${transfers.length} transfer(s) from cloud.`);
    const existingTransfers = store.get("transfers", []);
    const existingIds = new Set(existingTransfers.map((t) => t.id));
    let newCount = 0;
    for (const transfer of transfers) {
      if (!existingIds.has(transfer.id)) {
        existingTransfers.push(transfer);
        existingIds.add(transfer.id);
        newCount++;
      } else {
        const idx = existingTransfers.findIndex((t) => t.id === transfer.id);
        if (idx >= 0) {
          existingTransfers[idx] = transfer;
        }
      }
    }
    store.set("transfers", existingTransfers);
    if (newCount > 0) {
      console.log(`[Sync] ${newCount} new transfer(s) synced from cloud.`);
      electron.BrowserWindow.getAllWindows().forEach((win2) => {
        win2.webContents.send("transfers-updated", { count: newCount });
      });
    }
  } catch (error) {
    console.error("[Sync] Error syncing transfers:", error.message);
  } finally {
    endSyncTask(taskName);
  }
}
async function syncShifts() {
  const taskName = "shifts";
  if (!beginSyncTask(taskName)) return;
  try {
    isOnline = await checkConnection();
    if (!isOnline) {
      console.log("[Sync] Server unavailable. Shifts sync postponed.");
      return;
    }
    const unsyncedShifts = await prisma.shift.findMany({
      // @ts-ignore
      where: { synced: false },
      take: 20
    });
    if (unsyncedShifts.length === 0) return;
    console.log(`[Sync] Syncing ${unsyncedShifts.length} unsynced shift(s)...`);
    const branchId = getBranchId();
    if (!branchId) return;
    const shiftsIdempotencyKey = buildIdempotencyKey("sync-shifts", `${branchId}-${Date.now()}`);
    const response = await fetchWithRetry(buildApiUrl("/sync/shifts"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": shiftsIdempotencyKey
      },
      body: JSON.stringify({
        branchId,
        shifts: unsyncedShifts
      })
    });
    const result = await response.json();
    const syncedIds = result.syncedIds;
    if (syncedIds && syncedIds.length > 0) {
      await prisma.shift.updateMany({
        where: { id: { in: syncedIds } },
        // @ts-ignore
        data: { synced: true }
      });
      console.log(`[Sync] Shifts sync completed. Marked ${syncedIds.length} shift(s) as synced.`);
    }
  } catch (error) {
    if (error.name === "SyncClientError") {
      console.error("[Sync DLQ] Permanent Client Error in Shifts Sync:", error.message);
    } else {
      console.error("[Sync] Error syncing shifts:", error.message);
    }
  } finally {
    endSyncTask(taskName);
  }
}
async function syncTransactions() {
  const taskName = "transactions";
  if (!beginSyncTask(taskName)) return;
  try {
    isOnline = await checkConnection();
    if (!isOnline) {
      console.log("[Sync] Server unavailable. Transactions sync postponed.");
      return;
    }
    const unsyncedTxns = await prisma.transaction.findMany({
      where: { synced: false },
      take: 20
    });
    if (unsyncedTxns.length === 0) return;
    console.log(`[Sync] Syncing ${unsyncedTxns.length} unsynced transaction(s)...`);
    const branchId = getBranchId();
    if (!branchId) return;
    const txnsIdempotencyKey = buildIdempotencyKey("sync-transactions", `${branchId}-${Date.now()}`);
    const response = await fetchWithRetry(buildApiUrl("/sync/transactions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": txnsIdempotencyKey
      },
      body: JSON.stringify({
        branchId,
        transactions: unsyncedTxns
      })
    });
    const result = await response.json();
    const syncedIds = result.syncedIds;
    if (syncedIds && syncedIds.length > 0) {
      await prisma.transaction.updateMany({
        where: { id: { in: syncedIds } },
        data: { synced: true }
      });
      console.log(`[Sync] Transactions sync completed. Marked ${syncedIds.length} transaction(s) as synced.`);
    }
  } catch (error) {
    if (error.name === "SyncClientError") {
      console.error("[Sync DLQ] Permanent Client Error in Transactions Sync:", error.message);
    } else {
      console.error("[Sync] Error syncing transactions:", error.message);
    }
  } finally {
    endSyncTask(taskName);
  }
}
async function syncCurrentBranch() {
  const taskName = "currentBranch";
  if (!beginSyncTask(taskName)) return;
  try {
    if (!await checkConnection()) return;
    const branchId = getBranchId();
    if (!branchId) {
      console.log("[Sync] No branch ID configured locally yet.");
      return;
    }
    console.log(`[Sync] Verifying local branch record for ID: ${branchId}...`);
    const response = await fetchWithRetry(buildApiUrl(`/branches?branchId=${encodeURIComponent(branchId)}`));
    if (!response.ok) throw new Error("Failed to fetch branches");
    const branches = await response.json();
    const myBranch = branches.find((b2) => b2.id === branchId);
    if (myBranch) {
      await prisma.branch.upsert({
        where: { id: myBranch.id },
        update: {
          name: myBranch.name
        },
        create: {
          id: myBranch.id,
          name: myBranch.name
        }
      });
      console.log(`[Sync] Branch verified/updated: ${myBranch.name}`);
    } else {
      console.warn(`[Sync] Branch ID ${branchId} not found in server response.`);
    }
  } catch (e10) {
    console.error("[Sync] Error syncing branch:", e10);
  } finally {
    endSyncTask(taskName);
  }
}
async function syncLoyalty() {
  const taskName = "loyalty";
  if (!beginSyncTask(taskName)) return;
  try {
    if (!await checkConnection()) return;
    const unsyncedTx = await prisma.loyaltyTransaction.findMany({
      where: { synced: false },
      include: { account: true }
    });
    if (unsyncedTx.length === 0) return;
    console.log(`[Sync] Syncing ${unsyncedTx.length} loyalty transaction(s)...`);
    const branchId = getBranchId();
    if (!branchId) return;
    const payload = unsyncedTx.map((tx) => ({
      id: tx.id,
      patientId: tx.account.patientId,
      type: tx.type,
      points: tx.points,
      description: tx.description,
      saleId: tx.saleId,
      createdAt: tx.createdAt
    }));
    const response = await fetchWithRetry(buildApiUrl("/sync/loyalty"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchId,
        transactions: payload
      })
    });
    if (!response.ok) throw new Error("Loyalty sync failed");
    const result = await response.json();
    const syncedIds = result.syncedIds;
    const accountBalances = result.accountBalances;
    if (syncedIds && syncedIds.length > 0) {
      await prisma.loyaltyTransaction.updateMany({
        where: { id: { in: syncedIds } },
        data: { synced: true }
      });
      console.log(`[Sync] Loyalty sync completed. Marked ${syncedIds.length} transaction(s) as synced.`);
    }
    if (accountBalances && accountBalances.length > 0) {
      for (const wb of accountBalances) {
        const localAccount = await prisma.loyaltyAccount.findUnique({
          where: { patientId: wb.patientId }
        });
        if (localAccount) {
          await prisma.loyaltyAccount.update({
            where: { patientId: wb.patientId },
            data: {
              totalPoints: wb.totalPoints,
              lifetimePoints: wb.lifetimePoints,
              tier: wb.tier
            }
          });
        }
      }
      console.log(`[Sync] Reconciled ${accountBalances.length} loyalty account(s) from web.`);
    }
  } catch (error) {
    console.error("[Sync] Loyalty sync error:", error);
  } finally {
    endSyncTask(taskName);
  }
}
async function syncSuppliers() {
  const taskName = "suppliers";
  if (!beginSyncTask(taskName)) return;
  try {
    if (!await checkConnection()) return;
    const branchId = getBranchId();
    if (!branchId) return;
    console.log("[Sync] Syncing suppliers list...");
    const response = await fetchWithRetry(buildApiUrl(`/suppliers?branchId=${encodeURIComponent(branchId)}`));
    if (!response.ok) throw new Error("Suppliers fetch failed");
    const suppliers = await response.json();
    if (Array.isArray(suppliers)) {
      for (const s of suppliers) {
        await prisma.supplier.upsert({
          where: { id: s.id },
          update: { name: s.name, phone: s.phone ?? null },
          create: { id: s.id, name: s.name, phone: s.phone ?? null }
        });
      }
      console.log(`[Sync] Suppliers synced: ${suppliers.length} records`);
    }
  } catch (err) {
    console.error("[Sync] Supplier sync failed:", err);
  } finally {
    endSyncTask(taskName);
  }
}
async function syncProducts() {
  const taskName = "products";
  if (!beginSyncTask(taskName)) return;
  try {
    if (!await checkConnection()) return;
    const branchId = getBranchId();
    if (!branchId) return;
    console.log(`[Sync] Starting product snapshot sync for branch: ${branchId}`);
    const response = await fetchWithRetry(buildApiUrl(`/sync/products?branchId=${branchId}`));
    if (!response.ok) throw new Error("Product sync failed");
    const data = await response.json();
    const drugs = Array.isArray(data == null ? void 0 : data.drugs) ? data.drugs : [];
    const fetchedDrugIds = [];
    const fetchedInventoryIds = [];
    const hasCompleteInventoryIds = drugs.length === 0 || drugs.every((drug) => String((drug == null ? void 0 : drug.inventoryId) || "").trim().length > 0);
    await prisma.$transaction(async (tx) => {
      var _a2;
      for (const drug of drugs) {
        if (!(drug == null ? void 0 : drug.id)) continue;
        const cloudInventoryId = String(drug.inventoryId || "").trim();
        fetchedDrugIds.push(drug.id);
        if (cloudInventoryId) {
          fetchedInventoryIds.push(cloudInventoryId);
        }
        const collision = await tx.globalDrug.findFirst({
          where: {
            barcode: drug.barcode,
            id: { not: drug.id }
          }
        });
        if (collision) {
          console.log(`[Sync] Barcode collision '${drug.barcode}'. Replacing local ID ${collision.id} with cloud ID ${drug.id}.`);
          const collisionInventories = await tx.inventory.findMany({
            where: { drugId: collision.id },
            select: { id: true }
          });
          const collisionInventoryIds = collisionInventories.map((row) => row.id);
          if (collisionInventoryIds.length > 0) {
            await tx.batch.deleteMany({
              where: { inventoryId: { in: collisionInventoryIds } }
            });
            await tx.inventory.deleteMany({
              where: { id: { in: collisionInventoryIds } }
            });
          }
          await tx.globalDrug.delete({ where: { id: collision.id } });
        }
        await tx.globalDrug.upsert({
          where: { id: drug.id },
          update: {
            barcode: drug.barcode,
            tradeName: drug.tradeName,
            scientificName: drug.scientificName,
            price: Number(drug.price || 0),
            isActive: true
          },
          create: {
            id: drug.id,
            barcode: drug.barcode,
            tradeName: drug.tradeName,
            scientificName: drug.scientificName,
            price: Number(drug.price || 0),
            isActive: true
          }
        });
        const branchInventories = await tx.inventory.findMany({
          where: { drugId: drug.id, branchId }
        });
        const cloudCost = Number(
          drug.costPrice && drug.costPrice > 0 ? drug.costPrice : drug.purchasePrice && drug.purchasePrice > 0 ? drug.purchasePrice : drug.buyPrice && drug.buyPrice > 0 ? drug.buyPrice : 0
        );
        const inventoryPayload = {
          quantity: Number(drug.stock || 0),
          branchId,
          costPrice: cloudCost,
          minStock: Number(drug.minStock || 10),
          maxStock: Number(drug.maxStock || 100)
        };
        let targetInventoryId = cloudInventoryId || ((_a2 = branchInventories[0]) == null ? void 0 : _a2.id) || "";
        if (targetInventoryId) {
          const existingById = branchInventories.find((row) => row.id === targetInventoryId);
          if (existingById) {
            await tx.inventory.update({
              where: { id: existingById.id },
              data: inventoryPayload
            });
          } else {
            await tx.inventory.create({
              data: {
                id: targetInventoryId,
                drugId: drug.id,
                ...inventoryPayload
              }
            });
          }
        } else {
          const newInv = await tx.inventory.create({
            data: {
              drugId: drug.id,
              ...inventoryPayload
            }
          });
          targetInventoryId = newInv.id;
        }
        if (drug.batches && Array.isArray(drug.batches) && targetInventoryId) {
          const existingBatches = await tx.batch.findMany({
            where: { inventoryId: targetInventoryId },
            select: { id: true }
          });
          const cloudBatchIds = drug.batches.map((b2) => b2.id);
          const staleBatchIds = existingBatches.map((b2) => b2.id).filter((id2) => !cloudBatchIds.includes(id2));
          if (staleBatchIds.length > 0) {
            await tx.batch.deleteMany({ where: { id: { in: staleBatchIds } } });
          }
          for (const b2 of drug.batches) {
            const batchPayload = {
              inventoryId: targetInventoryId,
              batchNumber: String(b2.batchNumber || ""),
              quantity: Number(b2.quantity || 0),
              expiryDate: new Date(b2.expiryDate),
              costPrice: Number(b2.costPrice || 0)
            };
            await tx.batch.upsert({
              where: { id: b2.id },
              update: batchPayload,
              create: {
                id: b2.id,
                ...batchPayload
              }
            });
          }
        }
        const duplicateInventoryIds = branchInventories.map((row) => row.id).filter((inventoryId) => inventoryId !== targetInventoryId);
        if (duplicateInventoryIds.length > 0) {
          await tx.batch.deleteMany({
            where: { inventoryId: { in: duplicateInventoryIds } }
          });
          await tx.inventory.deleteMany({
            where: { id: { in: duplicateInventoryIds } }
          });
        }
      }
      if (hasCompleteInventoryIds) {
        const staleInventories = await tx.inventory.findMany({
          where: fetchedInventoryIds.length > 0 ? { branchId, id: { notIn: fetchedInventoryIds } } : { branchId },
          select: { id: true }
        });
        const staleInventoryIds = staleInventories.map((row) => row.id);
        if (staleInventoryIds.length > 0) {
          await tx.batch.deleteMany({
            where: { inventoryId: { in: staleInventoryIds } }
          });
          await tx.inventory.deleteMany({
            where: { id: { in: staleInventoryIds } }
          });
        }
      } else if (fetchedDrugIds.length > 0) {
        const staleInventories = await tx.inventory.findMany({
          where: {
            branchId,
            drugId: { notIn: fetchedDrugIds }
          },
          select: { id: true }
        });
        const staleInventoryIds = staleInventories.map((row) => row.id);
        if (staleInventoryIds.length > 0) {
          await tx.batch.deleteMany({
            where: { inventoryId: { in: staleInventoryIds } }
          });
          await tx.inventory.deleteMany({
            where: { id: { in: staleInventoryIds } }
          });
        }
      } else {
        const staleInventories = await tx.inventory.findMany({
          where: { branchId },
          select: { id: true }
        });
        const staleInventoryIds = staleInventories.map((row) => row.id);
        if (staleInventoryIds.length > 0) {
          await tx.batch.deleteMany({
            where: { inventoryId: { in: staleInventoryIds } }
          });
          await tx.inventory.deleteMany({
            where: { id: { in: staleInventoryIds } }
          });
        }
      }
      await tx.globalDrug.updateMany({
        where: { id: { in: fetchedDrugIds } },
        data: { isActive: true }
      });
      await tx.globalDrug.updateMany({
        where: {
          id: { notIn: fetchedDrugIds },
          inventory: { none: {} }
        },
        data: { isActive: false }
      });
    });
    console.log(`[Sync] Product snapshot sync completed. ${drugs.length} cloud product(s) processed.`);
  } catch (error) {
    console.error("[Sync] Product sync error:", error);
  } finally {
    endSyncTask(taskName);
  }
}
async function syncUsers() {
  const taskName = "users";
  if (!beginSyncTask(taskName)) return;
  try {
    if (!await checkConnection()) return;
    const branchId = getBranchId();
    if (!branchId) return;
    const response = await fetch(buildApiUrl(`/sync/users?branchId=${branchId}`));
    if (!response.ok) throw new Error("User sync failed");
    const data = await response.json();
    const users = data.users;
    if (users.length > 0) {
      const cloudUserIds = users.map((u) => u.id);
      await prisma.$transaction(async (tx) => {
        for (const user of users) {
          if (!(user == null ? void 0 : user.id) || !(user == null ? void 0 : user.email)) {
            console.log("[Sync] Skipping invalid user payload:", user);
            continue;
          }
          const userData = {
            name: user.name,
            email: user.email,
            role: user.role,
            password: user.password,
            branchId: user.branchId
          };
          const existingById = await tx.user.findUnique({
            where: { id: user.id }
          });
          if (existingById) {
            await tx.user.update({
              where: { id: user.id },
              data: userData
            });
            continue;
          }
          const existingByEmail = await tx.user.findUnique({
            where: { email: user.email }
          });
          if (existingByEmail) {
            await tx.user.update({
              where: { id: existingByEmail.id },
              data: userData
            });
            if (existingByEmail.id !== user.id) {
              console.log(`[Sync] Email collision for ${user.email}. Keeping local ID ${existingByEmail.id} instead of cloud ID ${user.id}.`);
            }
            continue;
          }
          await tx.user.create({
            data: {
              id: user.id,
              ...userData
            }
          });
        }
        if (cloudUserIds.length > 0) {
          const deactivated = await tx.user.updateMany({
            where: {
              id: { notIn: cloudUserIds },
              role: { not: "INACTIVE" }
            },
            data: { role: "INACTIVE" }
          });
          if (deactivated.count > 0) {
            console.log(`[Sync] Deactivated ${deactivated.count} local user(s) missing from cloud.`);
          }
        }
      });
      console.log(`[Sync] User sync completed. ${users.length} user(s) processed.`);
    }
  } catch (error) {
    console.error("[Sync] User sync error:", error);
  } finally {
    endSyncTask(taskName);
  }
}
async function syncPatients() {
  const taskName = "patients";
  if (!beginSyncTask(taskName)) return;
  try {
    if (!await checkConnection()) return;
    const branchId = getBranchId();
    if (!branchId) return;
    const response = await fetchWithRetry(buildApiUrl(`/sync/patients?branchId=${branchId}`));
    if (!response.ok) throw new Error("Patient sync failed");
    const data = await response.json();
    const patients = data.patients;
    const cloudIds = patients.map((p) => p.id);
    await prisma.$transaction(async (tx) => {
      var _a2, _b, _c2, _d2;
      for (const patient of patients) {
        await tx.patient.upsert({
          where: { id: patient.id },
          update: {
            name: patient.name,
            phone: patient.phone,
            dateOfBirth: patient.dateOfBirth ? new Date(patient.dateOfBirth) : null,
            gender: patient.gender,
            allergies: ((_a2 = patient.allergies) == null ? void 0 : _a2.join(",")) || "",
            chronicDiseases: ((_b = patient.chronicDiseases) == null ? void 0 : _b.join(",")) || "",
            notes: patient.notes,
            branchId: patient.branchId || null
          },
          create: {
            id: patient.id,
            name: patient.name,
            phone: patient.phone,
            dateOfBirth: patient.dateOfBirth ? new Date(patient.dateOfBirth) : null,
            gender: patient.gender,
            allergies: ((_c2 = patient.allergies) == null ? void 0 : _c2.join(",")) || "",
            chronicDiseases: ((_d2 = patient.chronicDiseases) == null ? void 0 : _d2.join(",")) || "",
            notes: patient.notes,
            branchId: patient.branchId || null
          }
        });
      }
      await tx.sale.updateMany({
        where: {
          AND: [
            { patientId: { not: null } },
            ...cloudIds.length > 0 ? [{ patientId: { notIn: cloudIds } }] : []
          ]
        },
        data: { patientId: null }
      });
      const accountFilter = cloudIds.length > 0 ? { patientId: { notIn: cloudIds } } : {};
      const accountsToDelete = await tx.loyaltyAccount.findMany({
        where: accountFilter,
        select: { id: true }
      });
      const accountIds = accountsToDelete.map((a) => a.id);
      if (accountIds.length > 0) {
        await tx.loyaltyTransaction.deleteMany({
          where: { accountId: { in: accountIds } }
        });
        await tx.loyaltyAccount.deleteMany({
          where: { id: { in: accountIds } }
        });
      }
      const deleteWhere = cloudIds.length > 0 ? { id: { notIn: cloudIds } } : {};
      const deleted = await tx.patient.deleteMany({ where: deleteWhere });
      if (deleted.count > 0) {
        console.log(`[Sync] Removed ${deleted.count} local patient record(s) missing from cloud.`);
      }
    });
    if (patients.length > 0) {
      console.log(`[Sync] Patient sync completed. ${patients.length} patient(s) processed.`);
    }
  } catch (error) {
    console.error("[Sync] Patient sync error:", error);
  } finally {
    endSyncTask(taskName);
  }
}
async function syncSettings() {
  const taskName = "settings";
  if (!beginSyncTask(taskName)) return;
  try {
    if (!await checkConnection()) return;
    const branchId = getBranchId();
    const settingsUrl = branchId ? buildApiUrl(`/sync/settings?branchId=${encodeURIComponent(branchId)}`) : buildApiUrl("/sync/settings");
    const response = await fetch(settingsUrl);
    if (!response.ok) throw new Error("Settings sync failed");
    const settings = await response.json();
    if (!settings || !settings.id) return;
    await prisma.companySettings.upsert({
      where: { id: settings.id },
      update: {
        name: settings.name,
        phone: settings.phone,
        address: settings.address,
        email: settings.email,
        website: settings.website,
        logoUrl: settings.logoUrl,
        taxNumber: settings.taxNumber,
        facebookUrl: settings.facebookUrl,
        instagramUrl: settings.instagramUrl,
        currency: settings.currency,
        loyaltyEnabled: settings.loyaltyEnabled,
        loyaltyPointsPerDinar: settings.loyaltyPointsPerDinar,
        loyaltyRedemptionValue: settings.loyaltyRedemptionValue,
        loyaltyMinRedemption: settings.loyaltyMinRedemption,
        maxDiscountPercent: settings.maxDiscountPercent ?? 10
      },
      create: {
        id: settings.id,
        name: settings.name,
        phone: settings.phone,
        address: settings.address,
        email: settings.email,
        website: settings.website,
        logoUrl: settings.logoUrl,
        taxNumber: settings.taxNumber,
        facebookUrl: settings.facebookUrl,
        instagramUrl: settings.instagramUrl,
        currency: settings.currency,
        loyaltyEnabled: settings.loyaltyEnabled,
        loyaltyPointsPerDinar: settings.loyaltyPointsPerDinar,
        loyaltyRedemptionValue: settings.loyaltyRedemptionValue,
        loyaltyMinRedemption: settings.loyaltyMinRedemption,
        maxDiscountPercent: settings.maxDiscountPercent ?? 10
      }
    });
    await prisma.companySettings.deleteMany({
      where: { id: { not: settings.id } }
    });
    console.log("[Sync] Company settings synced successfully.");
  } catch (error) {
    console.error("[Sync] Settings sync error:", error);
  } finally {
    endSyncTask(taskName);
  }
}
function sanitizeIdempotencyPart(value) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 96);
}
function buildIdempotencyKey(prefix, value) {
  const safePrefix = sanitizeIdempotencyPart(prefix);
  const safeValue = sanitizeIdempotencyPart(value);
  return `${safePrefix}:${safeValue}`.slice(0, 120);
}
async function parseResponseBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
function isAckSuccess(ack) {
  const status = String((ack == null ? void 0 : ack.status) || "").toLowerCase();
  return status === "processed" || status === "duplicate" || status === "already_deleted" || status === "noop";
}
async function pushCreateDrugToCloud(data, options) {
  try {
    if (!await checkConnection()) return false;
    console.log(`[CloudSync] Pushing new drug to cloud: ${data.tradeName} (ID: ${data.id})`);
    const idempotencyKey = (options == null ? void 0 : options.actionId) ? buildIdempotencyKey("create-drug", options.actionId) : buildIdempotencyKey("create-drug", data.id);
    const response = await fetchWithRetry(buildApiUrl("/inventory/create-quick"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": idempotencyKey
      },
      body: JSON.stringify({
        clientActionId: idempotencyKey,
        id: data.id,
        barcode: data.barcode,
        tradeName: data.tradeName,
        scientificName: data.scientificName,
        origin: data.origin || "unknown",
        branchId: data.branchId,
        price: data.price,
        cost: data.cost,
        minStock: data.minStock,
        maxStock: data.maxStock,
        quantity: data.quantity || 0,
        expiryDate: data.expiryDate || new Date((/* @__PURE__ */ new Date()).setFullYear((/* @__PURE__ */ new Date()).getFullYear() + 1)).toISOString(),
        inventoryId: data.inventoryId
      })
    });
    const body = await parseResponseBody(response);
    const ack = body == null ? void 0 : body.ack;
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      errorMessage = (body == null ? void 0 : body.message) || errorMessage;
      console.error("[CloudSync] Failed to push drug:", errorMessage);
      return false;
    }
    if (isAckSuccess(ack)) {
      console.log(`[CloudSync] Drug push acknowledged (${(ack == null ? void 0 : ack.status) ?? "processed"}) [key=${(ack == null ? void 0 : ack.idempotencyKey) ?? idempotencyKey}]`);
      return true;
    }
    console.log("[CloudSync] Drug pushed successfully.");
    return true;
  } catch (error) {
    console.error("[CloudSync] Error pushing drug:", error);
    return false;
  }
}
async function pushAddToInventoryToCloud(data, options) {
  try {
    if (!await checkConnection()) return false;
    console.log(`[CloudSync] Pushing inventory addition to cloud for drug: ${data.drugId}`);
    const idempotencyKey = (options == null ? void 0 : options.actionId) ? buildIdempotencyKey("add-inventory", options.actionId) : buildIdempotencyKey("add-inventory", data.id);
    const response = await fetchWithRetry(buildApiUrl("/inventory/add-to-branch"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": idempotencyKey
      },
      body: JSON.stringify({
        clientActionId: idempotencyKey,
        id: data.id,
        drugId: data.drugId,
        branchId: data.branchId,
        cost: data.costPrice,
        price: data.price || 0,
        quantity: data.quantity,
        minStock: data.minStock,
        maxStock: data.maxStock,
        expiryDate: data.expiryDate || null
      })
    });
    const body = await parseResponseBody(response);
    const ack = body == null ? void 0 : body.ack;
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      errorMessage = (body == null ? void 0 : body.message) || errorMessage;
      console.error("[CloudSync] Failed to push inventory:", errorMessage);
      return false;
    }
    if (isAckSuccess(ack)) {
      console.log(`[CloudSync] Inventory addition acknowledged (${(ack == null ? void 0 : ack.status) ?? "processed"}) [key=${(ack == null ? void 0 : ack.idempotencyKey) ?? idempotencyKey}]`);
      return true;
    }
    console.log("[CloudSync] Inventory addition pushed successfully.");
    return true;
  } catch (error) {
    console.error("[CloudSync] Error pushing inventory:", error);
    return false;
  }
}
async function pushDeleteInventoryFromCloud(inventoryId, options) {
  try {
    if (!await checkConnection()) return false;
    console.log(`[CloudSync] Pushing inventory deletion to cloud: ${inventoryId}`);
    const idempotencyKey = (options == null ? void 0 : options.actionId) ? buildIdempotencyKey("delete-inventory", options.actionId) : buildIdempotencyKey("delete-inventory", inventoryId);
    let backoff = 1e3;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15e3);
      try {
        const response = await fetch(buildApiUrl("/inventory/delete"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-idempotency-key": idempotencyKey
          },
          body: JSON.stringify({
            inventoryId,
            clientActionId: idempotencyKey
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const body = await parseResponseBody(response);
        const ack = body == null ? void 0 : body.ack;
        if (response.ok) {
          if (isAckSuccess(ack)) {
            console.log(`[CloudSync] Inventory deletion acknowledged (${(ack == null ? void 0 : ack.status) ?? "processed"}) [key=${(ack == null ? void 0 : ack.idempotencyKey) ?? idempotencyKey}]`);
          } else {
            console.log("[CloudSync] Inventory deleted from cloud successfully.");
          }
          return true;
        }
        let errorMessage = `HTTP ${response.status}`;
        errorMessage = (body == null ? void 0 : body.message) || errorMessage;
        const lowerMessage = errorMessage.toLowerCase();
        if (response.status === 404 || lowerMessage.includes("not found") || lowerMessage.includes("record to delete does not exist") || lowerMessage.includes("p2025")) {
          console.log("[CloudSync] Inventory already absent in cloud. Treating delete as synced.");
          return true;
        }
        const shouldRetry = (response.status >= 500 || response.status === 429) && attempt < 3;
        if (shouldRetry) {
          console.log(`[Sync] Server busy (${response.status}). Retry ${attempt}/3 in ${backoff}ms...`);
          await new Promise((r) => setTimeout(r, backoff));
          backoff *= 2;
          continue;
        }
        console.error("[CloudSync] Failed to delete inventory from cloud:", errorMessage);
        return false;
      } catch (error) {
        clearTimeout(timeoutId);
        const shouldRetry = attempt < 3 && ((error == null ? void 0 : error.name) === "AbortError" || String((error == null ? void 0 : error.message) || "").includes("fetch"));
        if (shouldRetry) {
          console.log(`[Sync] Network error. Retry ${attempt}/3 in ${backoff}ms...`);
          await new Promise((r) => setTimeout(r, backoff));
          backoff *= 2;
          continue;
        }
        console.error("[CloudSync] Error deleting inventory from cloud:", error);
        return false;
      }
    }
    return false;
  } catch (error) {
    console.error("[CloudSync] Error deleting inventory from cloud:", error);
    return false;
  }
}
async function pushAddBatchToCloud(data, options) {
  try {
    if (!await checkConnection()) return false;
    console.log(`[CloudSync] Pushing batch to cloud: inventoryId=${data.inventoryId}, qty=${data.quantity}`);
    const idempotencyKey = (options == null ? void 0 : options.actionId) ? buildIdempotencyKey("add-batch", options.actionId) : buildIdempotencyKey("add-batch", `${data.inventoryId}-${data.batchNumber}`);
    const response = await fetchWithRetry(buildApiUrl("/inventory/add-batch"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": idempotencyKey
      },
      body: JSON.stringify({
        clientActionId: idempotencyKey,
        inventoryId: data.inventoryId,
        batchNumber: data.batchNumber,
        quantity: data.quantity,
        expiryDate: data.expiryDate,
        drugId: data.drugId || null,
        branchId: data.branchId || null,
        supplierId: data.supplierId ?? null
      })
    });
    const body = await parseResponseBody(response);
    const ack = body == null ? void 0 : body.ack;
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      errorMessage = (body == null ? void 0 : body.message) || errorMessage;
      console.error("[CloudSync] Failed to push batch:", errorMessage);
      return false;
    }
    if (isAckSuccess(ack)) {
      console.log(`[CloudSync] Batch push acknowledged (${(ack == null ? void 0 : ack.status) ?? "processed"}) [key=${(ack == null ? void 0 : ack.idempotencyKey) ?? idempotencyKey}]`);
      return true;
    }
    console.log("[CloudSync] Batch pushed successfully.");
    return true;
  } catch (error) {
    console.error("[CloudSync] Error pushing batch:", error);
    return false;
  }
}
async function pushUpdateInventoryToCloud(data, options) {
  try {
    if (!await checkConnection()) return false;
    console.log(`[CloudSync] Pushing inventory update: inventoryId=${data.inventoryId}`);
    const idempotencyKey = (options == null ? void 0 : options.actionId) ? buildIdempotencyKey("update-inventory", options.actionId) : buildIdempotencyKey("update-inventory", data.inventoryId);
    const response = await fetchWithRetry(buildApiUrl("/inventory/update-item"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-idempotency-key": idempotencyKey
      },
      body: JSON.stringify({
        clientActionId: idempotencyKey,
        inventoryId: data.inventoryId,
        drugId: data.drugId,
        branchId: data.branchId || null,
        price: data.price,
        costPrice: data.costPrice,
        minStock: data.minStock,
        maxStock: data.maxStock
      })
    });
    const body = await parseResponseBody(response);
    const ack = body == null ? void 0 : body.ack;
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      errorMessage = (body == null ? void 0 : body.message) || errorMessage;
      console.error("[CloudSync] Failed to push inventory update:", errorMessage);
      return false;
    }
    if (isAckSuccess(ack)) {
      console.log(`[CloudSync] Inventory update acknowledged (${(ack == null ? void 0 : ack.status) ?? "processed"}) [key=${(ack == null ? void 0 : ack.idempotencyKey) ?? idempotencyKey}]`);
      return true;
    }
    console.log("[CloudSync] Inventory update pushed successfully.");
    return true;
  } catch (error) {
    console.error("[CloudSync] Error pushing inventory update:", error);
    return false;
  }
}
const getDbPath = () => {
  return path$2.join(electron.app.getPath("userData"), "prisma", "local.db");
};
const getBackupDir = () => {
  const backupDir = path$2.join(electron.app.getPath("documents"), "Faramace Backups");
  if (!fs$3.existsSync(backupDir)) {
    fs$3.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
};
const createBackup = async () => {
  try {
    const dbPath = getDbPath();
    const backupDir = getBackupDir();
    const devDbPath = path$2.join(process.cwd(), "prisma", "local.db");
    const sourcePath = fs$3.existsSync(dbPath) ? dbPath : devDbPath;
    if (!fs$3.existsSync(sourcePath)) {
      return { success: false, error: "قاعدة البيانات غير موجودة" };
    }
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const backupFileName = `backup-${timestamp}.db`;
    const backupPath = path$2.join(backupDir, backupFileName);
    fs$3.copyFileSync(sourcePath, backupPath);
    console.log(`Backup created: ${backupPath}`);
    return { success: true, path: backupPath };
  } catch (error) {
    console.error("Backup failed:", error);
    return { success: false, error: error.message };
  }
};
const restoreBackup = async (backupPath) => {
  try {
    const dbPath = getDbPath();
    const devDbPath = path$2.join(process.cwd(), "prisma", "local.db");
    const targetPath = fs$3.existsSync(dbPath) ? dbPath : devDbPath;
    if (!fs$3.existsSync(backupPath)) {
      return { success: false, error: "ملف النسخة الاحتياطية غير موجود" };
    }
    fs$3.copyFileSync(backupPath, targetPath);
    console.log(`Backup restored from: ${backupPath}`);
    return { success: true };
  } catch (error) {
    console.error("Restore failed:", error);
    return { success: false, error: error.message };
  }
};
const getBackupList = () => {
  try {
    const backupDir = getBackupDir();
    const files = fs$3.readdirSync(backupDir);
    return files.filter((file) => file.endsWith(".db")).map((file) => {
      const filePath = path$2.join(backupDir, file);
      const stats = fs$3.statSync(filePath);
      return {
        name: file,
        path: filePath,
        date: stats.mtime,
        size: stats.size
      };
    }).sort((a, b2) => b2.date.getTime() - a.date.getTime());
  } catch (error) {
    console.error("Error getting backup list:", error);
    return [];
  }
};
const cleanupOldBackups = (keepCount = 10) => {
  try {
    const backups = getBackupList();
    if (backups.length > keepCount) {
      const toDelete = backups.slice(keepCount);
      toDelete.forEach((backup) => {
        fs$3.unlinkSync(backup.path);
        console.log(`Deleted old backup: ${backup.name}`);
      });
    }
  } catch (error) {
    console.error("Error cleaning up backups:", error);
  }
};
var Stream$2 = require$$0$3.Stream;
var util$2 = require$$1$1;
var delayed_stream = DelayedStream$1;
function DelayedStream$1() {
  this.source = null;
  this.dataSize = 0;
  this.maxDataSize = 1024 * 1024;
  this.pauseStream = true;
  this._maxDataSizeExceeded = false;
  this._released = false;
  this._bufferedEvents = [];
}
util$2.inherits(DelayedStream$1, Stream$2);
DelayedStream$1.create = function(source, options) {
  var delayedStream = new this();
  options = options || {};
  for (var option in options) {
    delayedStream[option] = options[option];
  }
  delayedStream.source = source;
  var realEmit = source.emit;
  source.emit = function() {
    delayedStream._handleEmit(arguments);
    return realEmit.apply(source, arguments);
  };
  source.on("error", function() {
  });
  if (delayedStream.pauseStream) {
    source.pause();
  }
  return delayedStream;
};
Object.defineProperty(DelayedStream$1.prototype, "readable", {
  configurable: true,
  enumerable: true,
  get: function() {
    return this.source.readable;
  }
});
DelayedStream$1.prototype.setEncoding = function() {
  return this.source.setEncoding.apply(this.source, arguments);
};
DelayedStream$1.prototype.resume = function() {
  if (!this._released) {
    this.release();
  }
  this.source.resume();
};
DelayedStream$1.prototype.pause = function() {
  this.source.pause();
};
DelayedStream$1.prototype.release = function() {
  this._released = true;
  this._bufferedEvents.forEach((function(args) {
    this.emit.apply(this, args);
  }).bind(this));
  this._bufferedEvents = [];
};
DelayedStream$1.prototype.pipe = function() {
  var r = Stream$2.prototype.pipe.apply(this, arguments);
  this.resume();
  return r;
};
DelayedStream$1.prototype._handleEmit = function(args) {
  if (this._released) {
    this.emit.apply(this, args);
    return;
  }
  if (args[0] === "data") {
    this.dataSize += args[1].length;
    this._checkIfMaxDataSizeExceeded();
  }
  this._bufferedEvents.push(args);
};
DelayedStream$1.prototype._checkIfMaxDataSizeExceeded = function() {
  if (this._maxDataSizeExceeded) {
    return;
  }
  if (this.dataSize <= this.maxDataSize) {
    return;
  }
  this._maxDataSizeExceeded = true;
  var message2 = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
  this.emit("error", new Error(message2));
};
var util$1 = require$$1$1;
var Stream$1 = require$$0$3.Stream;
var DelayedStream = delayed_stream;
var combined_stream = CombinedStream$1;
function CombinedStream$1() {
  this.writable = false;
  this.readable = true;
  this.dataSize = 0;
  this.maxDataSize = 2 * 1024 * 1024;
  this.pauseStreams = true;
  this._released = false;
  this._streams = [];
  this._currentStream = null;
  this._insideLoop = false;
  this._pendingNext = false;
}
util$1.inherits(CombinedStream$1, Stream$1);
CombinedStream$1.create = function(options) {
  var combinedStream = new this();
  options = options || {};
  for (var option in options) {
    combinedStream[option] = options[option];
  }
  return combinedStream;
};
CombinedStream$1.isStreamLike = function(stream) {
  return typeof stream !== "function" && typeof stream !== "string" && typeof stream !== "boolean" && typeof stream !== "number" && !Buffer.isBuffer(stream);
};
CombinedStream$1.prototype.append = function(stream) {
  var isStreamLike = CombinedStream$1.isStreamLike(stream);
  if (isStreamLike) {
    if (!(stream instanceof DelayedStream)) {
      var newStream = DelayedStream.create(stream, {
        maxDataSize: Infinity,
        pauseStream: this.pauseStreams
      });
      stream.on("data", this._checkDataSize.bind(this));
      stream = newStream;
    }
    this._handleErrors(stream);
    if (this.pauseStreams) {
      stream.pause();
    }
  }
  this._streams.push(stream);
  return this;
};
CombinedStream$1.prototype.pipe = function(dest, options) {
  Stream$1.prototype.pipe.call(this, dest, options);
  this.resume();
  return dest;
};
CombinedStream$1.prototype._getNext = function() {
  this._currentStream = null;
  if (this._insideLoop) {
    this._pendingNext = true;
    return;
  }
  this._insideLoop = true;
  try {
    do {
      this._pendingNext = false;
      this._realGetNext();
    } while (this._pendingNext);
  } finally {
    this._insideLoop = false;
  }
};
CombinedStream$1.prototype._realGetNext = function() {
  var stream = this._streams.shift();
  if (typeof stream == "undefined") {
    this.end();
    return;
  }
  if (typeof stream !== "function") {
    this._pipeNext(stream);
    return;
  }
  var getStream = stream;
  getStream((function(stream2) {
    var isStreamLike = CombinedStream$1.isStreamLike(stream2);
    if (isStreamLike) {
      stream2.on("data", this._checkDataSize.bind(this));
      this._handleErrors(stream2);
    }
    this._pipeNext(stream2);
  }).bind(this));
};
CombinedStream$1.prototype._pipeNext = function(stream) {
  this._currentStream = stream;
  var isStreamLike = CombinedStream$1.isStreamLike(stream);
  if (isStreamLike) {
    stream.on("end", this._getNext.bind(this));
    stream.pipe(this, { end: false });
    return;
  }
  var value = stream;
  this.write(value);
  this._getNext();
};
CombinedStream$1.prototype._handleErrors = function(stream) {
  var self2 = this;
  stream.on("error", function(err) {
    self2._emitError(err);
  });
};
CombinedStream$1.prototype.write = function(data) {
  this.emit("data", data);
};
CombinedStream$1.prototype.pause = function() {
  if (!this.pauseStreams) {
    return;
  }
  if (this.pauseStreams && this._currentStream && typeof this._currentStream.pause == "function") this._currentStream.pause();
  this.emit("pause");
};
CombinedStream$1.prototype.resume = function() {
  if (!this._released) {
    this._released = true;
    this.writable = true;
    this._getNext();
  }
  if (this.pauseStreams && this._currentStream && typeof this._currentStream.resume == "function") this._currentStream.resume();
  this.emit("resume");
};
CombinedStream$1.prototype.end = function() {
  this._reset();
  this.emit("end");
};
CombinedStream$1.prototype.destroy = function() {
  this._reset();
  this.emit("close");
};
CombinedStream$1.prototype._reset = function() {
  this.writable = false;
  this._streams = [];
  this._currentStream = null;
};
CombinedStream$1.prototype._checkDataSize = function() {
  this._updateDataSize();
  if (this.dataSize <= this.maxDataSize) {
    return;
  }
  var message2 = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
  this._emitError(new Error(message2));
};
CombinedStream$1.prototype._updateDataSize = function() {
  this.dataSize = 0;
  var self2 = this;
  this._streams.forEach(function(stream) {
    if (!stream.dataSize) {
      return;
    }
    self2.dataSize += stream.dataSize;
  });
  if (this._currentStream && this._currentStream.dataSize) {
    this.dataSize += this._currentStream.dataSize;
  }
};
CombinedStream$1.prototype._emitError = function(err) {
  this._reset();
  this.emit("error", err);
};
var mimeTypes = {};
const require$$0 = {
  "application/1d-interleaved-parityfec": {
    source: "iana"
  },
  "application/3gpdash-qoe-report+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/3gpp-ims+xml": {
    source: "iana",
    compressible: true
  },
  "application/3gpphal+json": {
    source: "iana",
    compressible: true
  },
  "application/3gpphalforms+json": {
    source: "iana",
    compressible: true
  },
  "application/a2l": {
    source: "iana"
  },
  "application/ace+cbor": {
    source: "iana"
  },
  "application/activemessage": {
    source: "iana"
  },
  "application/activity+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-costmap+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-costmapfilter+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-directory+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-endpointcost+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-endpointcostparams+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-endpointprop+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-endpointpropparams+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-error+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-networkmap+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-networkmapfilter+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-updatestreamcontrol+json": {
    source: "iana",
    compressible: true
  },
  "application/alto-updatestreamparams+json": {
    source: "iana",
    compressible: true
  },
  "application/aml": {
    source: "iana"
  },
  "application/andrew-inset": {
    source: "iana",
    extensions: [
      "ez"
    ]
  },
  "application/applefile": {
    source: "iana"
  },
  "application/applixware": {
    source: "apache",
    extensions: [
      "aw"
    ]
  },
  "application/at+jwt": {
    source: "iana"
  },
  "application/atf": {
    source: "iana"
  },
  "application/atfx": {
    source: "iana"
  },
  "application/atom+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "atom"
    ]
  },
  "application/atomcat+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "atomcat"
    ]
  },
  "application/atomdeleted+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "atomdeleted"
    ]
  },
  "application/atomicmail": {
    source: "iana"
  },
  "application/atomsvc+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "atomsvc"
    ]
  },
  "application/atsc-dwd+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "dwd"
    ]
  },
  "application/atsc-dynamic-event-message": {
    source: "iana"
  },
  "application/atsc-held+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "held"
    ]
  },
  "application/atsc-rdt+json": {
    source: "iana",
    compressible: true
  },
  "application/atsc-rsat+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "rsat"
    ]
  },
  "application/atxml": {
    source: "iana"
  },
  "application/auth-policy+xml": {
    source: "iana",
    compressible: true
  },
  "application/bacnet-xdd+zip": {
    source: "iana",
    compressible: false
  },
  "application/batch-smtp": {
    source: "iana"
  },
  "application/bdoc": {
    compressible: false,
    extensions: [
      "bdoc"
    ]
  },
  "application/beep+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/calendar+json": {
    source: "iana",
    compressible: true
  },
  "application/calendar+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xcs"
    ]
  },
  "application/call-completion": {
    source: "iana"
  },
  "application/cals-1840": {
    source: "iana"
  },
  "application/captive+json": {
    source: "iana",
    compressible: true
  },
  "application/cbor": {
    source: "iana"
  },
  "application/cbor-seq": {
    source: "iana"
  },
  "application/cccex": {
    source: "iana"
  },
  "application/ccmp+xml": {
    source: "iana",
    compressible: true
  },
  "application/ccxml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "ccxml"
    ]
  },
  "application/cdfx+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "cdfx"
    ]
  },
  "application/cdmi-capability": {
    source: "iana",
    extensions: [
      "cdmia"
    ]
  },
  "application/cdmi-container": {
    source: "iana",
    extensions: [
      "cdmic"
    ]
  },
  "application/cdmi-domain": {
    source: "iana",
    extensions: [
      "cdmid"
    ]
  },
  "application/cdmi-object": {
    source: "iana",
    extensions: [
      "cdmio"
    ]
  },
  "application/cdmi-queue": {
    source: "iana",
    extensions: [
      "cdmiq"
    ]
  },
  "application/cdni": {
    source: "iana"
  },
  "application/cea": {
    source: "iana"
  },
  "application/cea-2018+xml": {
    source: "iana",
    compressible: true
  },
  "application/cellml+xml": {
    source: "iana",
    compressible: true
  },
  "application/cfw": {
    source: "iana"
  },
  "application/city+json": {
    source: "iana",
    compressible: true
  },
  "application/clr": {
    source: "iana"
  },
  "application/clue+xml": {
    source: "iana",
    compressible: true
  },
  "application/clue_info+xml": {
    source: "iana",
    compressible: true
  },
  "application/cms": {
    source: "iana"
  },
  "application/cnrp+xml": {
    source: "iana",
    compressible: true
  },
  "application/coap-group+json": {
    source: "iana",
    compressible: true
  },
  "application/coap-payload": {
    source: "iana"
  },
  "application/commonground": {
    source: "iana"
  },
  "application/conference-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/cose": {
    source: "iana"
  },
  "application/cose-key": {
    source: "iana"
  },
  "application/cose-key-set": {
    source: "iana"
  },
  "application/cpl+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "cpl"
    ]
  },
  "application/csrattrs": {
    source: "iana"
  },
  "application/csta+xml": {
    source: "iana",
    compressible: true
  },
  "application/cstadata+xml": {
    source: "iana",
    compressible: true
  },
  "application/csvm+json": {
    source: "iana",
    compressible: true
  },
  "application/cu-seeme": {
    source: "apache",
    extensions: [
      "cu"
    ]
  },
  "application/cwt": {
    source: "iana"
  },
  "application/cybercash": {
    source: "iana"
  },
  "application/dart": {
    compressible: true
  },
  "application/dash+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "mpd"
    ]
  },
  "application/dash-patch+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "mpp"
    ]
  },
  "application/dashdelta": {
    source: "iana"
  },
  "application/davmount+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "davmount"
    ]
  },
  "application/dca-rft": {
    source: "iana"
  },
  "application/dcd": {
    source: "iana"
  },
  "application/dec-dx": {
    source: "iana"
  },
  "application/dialog-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/dicom": {
    source: "iana"
  },
  "application/dicom+json": {
    source: "iana",
    compressible: true
  },
  "application/dicom+xml": {
    source: "iana",
    compressible: true
  },
  "application/dii": {
    source: "iana"
  },
  "application/dit": {
    source: "iana"
  },
  "application/dns": {
    source: "iana"
  },
  "application/dns+json": {
    source: "iana",
    compressible: true
  },
  "application/dns-message": {
    source: "iana"
  },
  "application/docbook+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "dbk"
    ]
  },
  "application/dots+cbor": {
    source: "iana"
  },
  "application/dskpp+xml": {
    source: "iana",
    compressible: true
  },
  "application/dssc+der": {
    source: "iana",
    extensions: [
      "dssc"
    ]
  },
  "application/dssc+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xdssc"
    ]
  },
  "application/dvcs": {
    source: "iana"
  },
  "application/ecmascript": {
    source: "iana",
    compressible: true,
    extensions: [
      "es",
      "ecma"
    ]
  },
  "application/edi-consent": {
    source: "iana"
  },
  "application/edi-x12": {
    source: "iana",
    compressible: false
  },
  "application/edifact": {
    source: "iana",
    compressible: false
  },
  "application/efi": {
    source: "iana"
  },
  "application/elm+json": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/elm+xml": {
    source: "iana",
    compressible: true
  },
  "application/emergencycalldata.cap+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/emergencycalldata.comment+xml": {
    source: "iana",
    compressible: true
  },
  "application/emergencycalldata.control+xml": {
    source: "iana",
    compressible: true
  },
  "application/emergencycalldata.deviceinfo+xml": {
    source: "iana",
    compressible: true
  },
  "application/emergencycalldata.ecall.msd": {
    source: "iana"
  },
  "application/emergencycalldata.providerinfo+xml": {
    source: "iana",
    compressible: true
  },
  "application/emergencycalldata.serviceinfo+xml": {
    source: "iana",
    compressible: true
  },
  "application/emergencycalldata.subscriberinfo+xml": {
    source: "iana",
    compressible: true
  },
  "application/emergencycalldata.veds+xml": {
    source: "iana",
    compressible: true
  },
  "application/emma+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "emma"
    ]
  },
  "application/emotionml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "emotionml"
    ]
  },
  "application/encaprtp": {
    source: "iana"
  },
  "application/epp+xml": {
    source: "iana",
    compressible: true
  },
  "application/epub+zip": {
    source: "iana",
    compressible: false,
    extensions: [
      "epub"
    ]
  },
  "application/eshop": {
    source: "iana"
  },
  "application/exi": {
    source: "iana",
    extensions: [
      "exi"
    ]
  },
  "application/expect-ct-report+json": {
    source: "iana",
    compressible: true
  },
  "application/express": {
    source: "iana",
    extensions: [
      "exp"
    ]
  },
  "application/fastinfoset": {
    source: "iana"
  },
  "application/fastsoap": {
    source: "iana"
  },
  "application/fdt+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "fdt"
    ]
  },
  "application/fhir+json": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/fhir+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/fido.trusted-apps+json": {
    compressible: true
  },
  "application/fits": {
    source: "iana"
  },
  "application/flexfec": {
    source: "iana"
  },
  "application/font-sfnt": {
    source: "iana"
  },
  "application/font-tdpfr": {
    source: "iana",
    extensions: [
      "pfr"
    ]
  },
  "application/font-woff": {
    source: "iana",
    compressible: false
  },
  "application/framework-attributes+xml": {
    source: "iana",
    compressible: true
  },
  "application/geo+json": {
    source: "iana",
    compressible: true,
    extensions: [
      "geojson"
    ]
  },
  "application/geo+json-seq": {
    source: "iana"
  },
  "application/geopackage+sqlite3": {
    source: "iana"
  },
  "application/geoxacml+xml": {
    source: "iana",
    compressible: true
  },
  "application/gltf-buffer": {
    source: "iana"
  },
  "application/gml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "gml"
    ]
  },
  "application/gpx+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "gpx"
    ]
  },
  "application/gxf": {
    source: "apache",
    extensions: [
      "gxf"
    ]
  },
  "application/gzip": {
    source: "iana",
    compressible: false,
    extensions: [
      "gz"
    ]
  },
  "application/h224": {
    source: "iana"
  },
  "application/held+xml": {
    source: "iana",
    compressible: true
  },
  "application/hjson": {
    extensions: [
      "hjson"
    ]
  },
  "application/http": {
    source: "iana"
  },
  "application/hyperstudio": {
    source: "iana",
    extensions: [
      "stk"
    ]
  },
  "application/ibe-key-request+xml": {
    source: "iana",
    compressible: true
  },
  "application/ibe-pkg-reply+xml": {
    source: "iana",
    compressible: true
  },
  "application/ibe-pp-data": {
    source: "iana"
  },
  "application/iges": {
    source: "iana"
  },
  "application/im-iscomposing+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/index": {
    source: "iana"
  },
  "application/index.cmd": {
    source: "iana"
  },
  "application/index.obj": {
    source: "iana"
  },
  "application/index.response": {
    source: "iana"
  },
  "application/index.vnd": {
    source: "iana"
  },
  "application/inkml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "ink",
      "inkml"
    ]
  },
  "application/iotp": {
    source: "iana"
  },
  "application/ipfix": {
    source: "iana",
    extensions: [
      "ipfix"
    ]
  },
  "application/ipp": {
    source: "iana"
  },
  "application/isup": {
    source: "iana"
  },
  "application/its+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "its"
    ]
  },
  "application/java-archive": {
    source: "apache",
    compressible: false,
    extensions: [
      "jar",
      "war",
      "ear"
    ]
  },
  "application/java-serialized-object": {
    source: "apache",
    compressible: false,
    extensions: [
      "ser"
    ]
  },
  "application/java-vm": {
    source: "apache",
    compressible: false,
    extensions: [
      "class"
    ]
  },
  "application/javascript": {
    source: "iana",
    charset: "UTF-8",
    compressible: true,
    extensions: [
      "js",
      "mjs"
    ]
  },
  "application/jf2feed+json": {
    source: "iana",
    compressible: true
  },
  "application/jose": {
    source: "iana"
  },
  "application/jose+json": {
    source: "iana",
    compressible: true
  },
  "application/jrd+json": {
    source: "iana",
    compressible: true
  },
  "application/jscalendar+json": {
    source: "iana",
    compressible: true
  },
  "application/json": {
    source: "iana",
    charset: "UTF-8",
    compressible: true,
    extensions: [
      "json",
      "map"
    ]
  },
  "application/json-patch+json": {
    source: "iana",
    compressible: true
  },
  "application/json-seq": {
    source: "iana"
  },
  "application/json5": {
    extensions: [
      "json5"
    ]
  },
  "application/jsonml+json": {
    source: "apache",
    compressible: true,
    extensions: [
      "jsonml"
    ]
  },
  "application/jwk+json": {
    source: "iana",
    compressible: true
  },
  "application/jwk-set+json": {
    source: "iana",
    compressible: true
  },
  "application/jwt": {
    source: "iana"
  },
  "application/kpml-request+xml": {
    source: "iana",
    compressible: true
  },
  "application/kpml-response+xml": {
    source: "iana",
    compressible: true
  },
  "application/ld+json": {
    source: "iana",
    compressible: true,
    extensions: [
      "jsonld"
    ]
  },
  "application/lgr+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "lgr"
    ]
  },
  "application/link-format": {
    source: "iana"
  },
  "application/load-control+xml": {
    source: "iana",
    compressible: true
  },
  "application/lost+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "lostxml"
    ]
  },
  "application/lostsync+xml": {
    source: "iana",
    compressible: true
  },
  "application/lpf+zip": {
    source: "iana",
    compressible: false
  },
  "application/lxf": {
    source: "iana"
  },
  "application/mac-binhex40": {
    source: "iana",
    extensions: [
      "hqx"
    ]
  },
  "application/mac-compactpro": {
    source: "apache",
    extensions: [
      "cpt"
    ]
  },
  "application/macwriteii": {
    source: "iana"
  },
  "application/mads+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "mads"
    ]
  },
  "application/manifest+json": {
    source: "iana",
    charset: "UTF-8",
    compressible: true,
    extensions: [
      "webmanifest"
    ]
  },
  "application/marc": {
    source: "iana",
    extensions: [
      "mrc"
    ]
  },
  "application/marcxml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "mrcx"
    ]
  },
  "application/mathematica": {
    source: "iana",
    extensions: [
      "ma",
      "nb",
      "mb"
    ]
  },
  "application/mathml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "mathml"
    ]
  },
  "application/mathml-content+xml": {
    source: "iana",
    compressible: true
  },
  "application/mathml-presentation+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbms-associated-procedure-description+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbms-deregister+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbms-envelope+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbms-msk+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbms-msk-response+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbms-protection-description+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbms-reception-report+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbms-register+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbms-register-response+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbms-schedule+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbms-user-service-description+xml": {
    source: "iana",
    compressible: true
  },
  "application/mbox": {
    source: "iana",
    extensions: [
      "mbox"
    ]
  },
  "application/media-policy-dataset+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "mpf"
    ]
  },
  "application/media_control+xml": {
    source: "iana",
    compressible: true
  },
  "application/mediaservercontrol+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "mscml"
    ]
  },
  "application/merge-patch+json": {
    source: "iana",
    compressible: true
  },
  "application/metalink+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "metalink"
    ]
  },
  "application/metalink4+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "meta4"
    ]
  },
  "application/mets+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "mets"
    ]
  },
  "application/mf4": {
    source: "iana"
  },
  "application/mikey": {
    source: "iana"
  },
  "application/mipc": {
    source: "iana"
  },
  "application/missing-blocks+cbor-seq": {
    source: "iana"
  },
  "application/mmt-aei+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "maei"
    ]
  },
  "application/mmt-usd+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "musd"
    ]
  },
  "application/mods+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "mods"
    ]
  },
  "application/moss-keys": {
    source: "iana"
  },
  "application/moss-signature": {
    source: "iana"
  },
  "application/mosskey-data": {
    source: "iana"
  },
  "application/mosskey-request": {
    source: "iana"
  },
  "application/mp21": {
    source: "iana",
    extensions: [
      "m21",
      "mp21"
    ]
  },
  "application/mp4": {
    source: "iana",
    extensions: [
      "mp4s",
      "m4p"
    ]
  },
  "application/mpeg4-generic": {
    source: "iana"
  },
  "application/mpeg4-iod": {
    source: "iana"
  },
  "application/mpeg4-iod-xmt": {
    source: "iana"
  },
  "application/mrb-consumer+xml": {
    source: "iana",
    compressible: true
  },
  "application/mrb-publish+xml": {
    source: "iana",
    compressible: true
  },
  "application/msc-ivr+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/msc-mixer+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/msword": {
    source: "iana",
    compressible: false,
    extensions: [
      "doc",
      "dot"
    ]
  },
  "application/mud+json": {
    source: "iana",
    compressible: true
  },
  "application/multipart-core": {
    source: "iana"
  },
  "application/mxf": {
    source: "iana",
    extensions: [
      "mxf"
    ]
  },
  "application/n-quads": {
    source: "iana",
    extensions: [
      "nq"
    ]
  },
  "application/n-triples": {
    source: "iana",
    extensions: [
      "nt"
    ]
  },
  "application/nasdata": {
    source: "iana"
  },
  "application/news-checkgroups": {
    source: "iana",
    charset: "US-ASCII"
  },
  "application/news-groupinfo": {
    source: "iana",
    charset: "US-ASCII"
  },
  "application/news-transmission": {
    source: "iana"
  },
  "application/nlsml+xml": {
    source: "iana",
    compressible: true
  },
  "application/node": {
    source: "iana",
    extensions: [
      "cjs"
    ]
  },
  "application/nss": {
    source: "iana"
  },
  "application/oauth-authz-req+jwt": {
    source: "iana"
  },
  "application/oblivious-dns-message": {
    source: "iana"
  },
  "application/ocsp-request": {
    source: "iana"
  },
  "application/ocsp-response": {
    source: "iana"
  },
  "application/octet-stream": {
    source: "iana",
    compressible: false,
    extensions: [
      "bin",
      "dms",
      "lrf",
      "mar",
      "so",
      "dist",
      "distz",
      "pkg",
      "bpk",
      "dump",
      "elc",
      "deploy",
      "exe",
      "dll",
      "deb",
      "dmg",
      "iso",
      "img",
      "msi",
      "msp",
      "msm",
      "buffer"
    ]
  },
  "application/oda": {
    source: "iana",
    extensions: [
      "oda"
    ]
  },
  "application/odm+xml": {
    source: "iana",
    compressible: true
  },
  "application/odx": {
    source: "iana"
  },
  "application/oebps-package+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "opf"
    ]
  },
  "application/ogg": {
    source: "iana",
    compressible: false,
    extensions: [
      "ogx"
    ]
  },
  "application/omdoc+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "omdoc"
    ]
  },
  "application/onenote": {
    source: "apache",
    extensions: [
      "onetoc",
      "onetoc2",
      "onetmp",
      "onepkg"
    ]
  },
  "application/opc-nodeset+xml": {
    source: "iana",
    compressible: true
  },
  "application/oscore": {
    source: "iana"
  },
  "application/oxps": {
    source: "iana",
    extensions: [
      "oxps"
    ]
  },
  "application/p21": {
    source: "iana"
  },
  "application/p21+zip": {
    source: "iana",
    compressible: false
  },
  "application/p2p-overlay+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "relo"
    ]
  },
  "application/parityfec": {
    source: "iana"
  },
  "application/passport": {
    source: "iana"
  },
  "application/patch-ops-error+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xer"
    ]
  },
  "application/pdf": {
    source: "iana",
    compressible: false,
    extensions: [
      "pdf"
    ]
  },
  "application/pdx": {
    source: "iana"
  },
  "application/pem-certificate-chain": {
    source: "iana"
  },
  "application/pgp-encrypted": {
    source: "iana",
    compressible: false,
    extensions: [
      "pgp"
    ]
  },
  "application/pgp-keys": {
    source: "iana",
    extensions: [
      "asc"
    ]
  },
  "application/pgp-signature": {
    source: "iana",
    extensions: [
      "asc",
      "sig"
    ]
  },
  "application/pics-rules": {
    source: "apache",
    extensions: [
      "prf"
    ]
  },
  "application/pidf+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/pidf-diff+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/pkcs10": {
    source: "iana",
    extensions: [
      "p10"
    ]
  },
  "application/pkcs12": {
    source: "iana"
  },
  "application/pkcs7-mime": {
    source: "iana",
    extensions: [
      "p7m",
      "p7c"
    ]
  },
  "application/pkcs7-signature": {
    source: "iana",
    extensions: [
      "p7s"
    ]
  },
  "application/pkcs8": {
    source: "iana",
    extensions: [
      "p8"
    ]
  },
  "application/pkcs8-encrypted": {
    source: "iana"
  },
  "application/pkix-attr-cert": {
    source: "iana",
    extensions: [
      "ac"
    ]
  },
  "application/pkix-cert": {
    source: "iana",
    extensions: [
      "cer"
    ]
  },
  "application/pkix-crl": {
    source: "iana",
    extensions: [
      "crl"
    ]
  },
  "application/pkix-pkipath": {
    source: "iana",
    extensions: [
      "pkipath"
    ]
  },
  "application/pkixcmp": {
    source: "iana",
    extensions: [
      "pki"
    ]
  },
  "application/pls+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "pls"
    ]
  },
  "application/poc-settings+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/postscript": {
    source: "iana",
    compressible: true,
    extensions: [
      "ai",
      "eps",
      "ps"
    ]
  },
  "application/ppsp-tracker+json": {
    source: "iana",
    compressible: true
  },
  "application/problem+json": {
    source: "iana",
    compressible: true
  },
  "application/problem+xml": {
    source: "iana",
    compressible: true
  },
  "application/provenance+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "provx"
    ]
  },
  "application/prs.alvestrand.titrax-sheet": {
    source: "iana"
  },
  "application/prs.cww": {
    source: "iana",
    extensions: [
      "cww"
    ]
  },
  "application/prs.cyn": {
    source: "iana",
    charset: "7-BIT"
  },
  "application/prs.hpub+zip": {
    source: "iana",
    compressible: false
  },
  "application/prs.nprend": {
    source: "iana"
  },
  "application/prs.plucker": {
    source: "iana"
  },
  "application/prs.rdf-xml-crypt": {
    source: "iana"
  },
  "application/prs.xsf+xml": {
    source: "iana",
    compressible: true
  },
  "application/pskc+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "pskcxml"
    ]
  },
  "application/pvd+json": {
    source: "iana",
    compressible: true
  },
  "application/qsig": {
    source: "iana"
  },
  "application/raml+yaml": {
    compressible: true,
    extensions: [
      "raml"
    ]
  },
  "application/raptorfec": {
    source: "iana"
  },
  "application/rdap+json": {
    source: "iana",
    compressible: true
  },
  "application/rdf+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "rdf",
      "owl"
    ]
  },
  "application/reginfo+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "rif"
    ]
  },
  "application/relax-ng-compact-syntax": {
    source: "iana",
    extensions: [
      "rnc"
    ]
  },
  "application/remote-printing": {
    source: "iana"
  },
  "application/reputon+json": {
    source: "iana",
    compressible: true
  },
  "application/resource-lists+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "rl"
    ]
  },
  "application/resource-lists-diff+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "rld"
    ]
  },
  "application/rfc+xml": {
    source: "iana",
    compressible: true
  },
  "application/riscos": {
    source: "iana"
  },
  "application/rlmi+xml": {
    source: "iana",
    compressible: true
  },
  "application/rls-services+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "rs"
    ]
  },
  "application/route-apd+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "rapd"
    ]
  },
  "application/route-s-tsid+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "sls"
    ]
  },
  "application/route-usd+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "rusd"
    ]
  },
  "application/rpki-ghostbusters": {
    source: "iana",
    extensions: [
      "gbr"
    ]
  },
  "application/rpki-manifest": {
    source: "iana",
    extensions: [
      "mft"
    ]
  },
  "application/rpki-publication": {
    source: "iana"
  },
  "application/rpki-roa": {
    source: "iana",
    extensions: [
      "roa"
    ]
  },
  "application/rpki-updown": {
    source: "iana"
  },
  "application/rsd+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "rsd"
    ]
  },
  "application/rss+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "rss"
    ]
  },
  "application/rtf": {
    source: "iana",
    compressible: true,
    extensions: [
      "rtf"
    ]
  },
  "application/rtploopback": {
    source: "iana"
  },
  "application/rtx": {
    source: "iana"
  },
  "application/samlassertion+xml": {
    source: "iana",
    compressible: true
  },
  "application/samlmetadata+xml": {
    source: "iana",
    compressible: true
  },
  "application/sarif+json": {
    source: "iana",
    compressible: true
  },
  "application/sarif-external-properties+json": {
    source: "iana",
    compressible: true
  },
  "application/sbe": {
    source: "iana"
  },
  "application/sbml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "sbml"
    ]
  },
  "application/scaip+xml": {
    source: "iana",
    compressible: true
  },
  "application/scim+json": {
    source: "iana",
    compressible: true
  },
  "application/scvp-cv-request": {
    source: "iana",
    extensions: [
      "scq"
    ]
  },
  "application/scvp-cv-response": {
    source: "iana",
    extensions: [
      "scs"
    ]
  },
  "application/scvp-vp-request": {
    source: "iana",
    extensions: [
      "spq"
    ]
  },
  "application/scvp-vp-response": {
    source: "iana",
    extensions: [
      "spp"
    ]
  },
  "application/sdp": {
    source: "iana",
    extensions: [
      "sdp"
    ]
  },
  "application/secevent+jwt": {
    source: "iana"
  },
  "application/senml+cbor": {
    source: "iana"
  },
  "application/senml+json": {
    source: "iana",
    compressible: true
  },
  "application/senml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "senmlx"
    ]
  },
  "application/senml-etch+cbor": {
    source: "iana"
  },
  "application/senml-etch+json": {
    source: "iana",
    compressible: true
  },
  "application/senml-exi": {
    source: "iana"
  },
  "application/sensml+cbor": {
    source: "iana"
  },
  "application/sensml+json": {
    source: "iana",
    compressible: true
  },
  "application/sensml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "sensmlx"
    ]
  },
  "application/sensml-exi": {
    source: "iana"
  },
  "application/sep+xml": {
    source: "iana",
    compressible: true
  },
  "application/sep-exi": {
    source: "iana"
  },
  "application/session-info": {
    source: "iana"
  },
  "application/set-payment": {
    source: "iana"
  },
  "application/set-payment-initiation": {
    source: "iana",
    extensions: [
      "setpay"
    ]
  },
  "application/set-registration": {
    source: "iana"
  },
  "application/set-registration-initiation": {
    source: "iana",
    extensions: [
      "setreg"
    ]
  },
  "application/sgml": {
    source: "iana"
  },
  "application/sgml-open-catalog": {
    source: "iana"
  },
  "application/shf+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "shf"
    ]
  },
  "application/sieve": {
    source: "iana",
    extensions: [
      "siv",
      "sieve"
    ]
  },
  "application/simple-filter+xml": {
    source: "iana",
    compressible: true
  },
  "application/simple-message-summary": {
    source: "iana"
  },
  "application/simplesymbolcontainer": {
    source: "iana"
  },
  "application/sipc": {
    source: "iana"
  },
  "application/slate": {
    source: "iana"
  },
  "application/smil": {
    source: "iana"
  },
  "application/smil+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "smi",
      "smil"
    ]
  },
  "application/smpte336m": {
    source: "iana"
  },
  "application/soap+fastinfoset": {
    source: "iana"
  },
  "application/soap+xml": {
    source: "iana",
    compressible: true
  },
  "application/sparql-query": {
    source: "iana",
    extensions: [
      "rq"
    ]
  },
  "application/sparql-results+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "srx"
    ]
  },
  "application/spdx+json": {
    source: "iana",
    compressible: true
  },
  "application/spirits-event+xml": {
    source: "iana",
    compressible: true
  },
  "application/sql": {
    source: "iana"
  },
  "application/srgs": {
    source: "iana",
    extensions: [
      "gram"
    ]
  },
  "application/srgs+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "grxml"
    ]
  },
  "application/sru+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "sru"
    ]
  },
  "application/ssdl+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "ssdl"
    ]
  },
  "application/ssml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "ssml"
    ]
  },
  "application/stix+json": {
    source: "iana",
    compressible: true
  },
  "application/swid+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "swidtag"
    ]
  },
  "application/tamp-apex-update": {
    source: "iana"
  },
  "application/tamp-apex-update-confirm": {
    source: "iana"
  },
  "application/tamp-community-update": {
    source: "iana"
  },
  "application/tamp-community-update-confirm": {
    source: "iana"
  },
  "application/tamp-error": {
    source: "iana"
  },
  "application/tamp-sequence-adjust": {
    source: "iana"
  },
  "application/tamp-sequence-adjust-confirm": {
    source: "iana"
  },
  "application/tamp-status-query": {
    source: "iana"
  },
  "application/tamp-status-response": {
    source: "iana"
  },
  "application/tamp-update": {
    source: "iana"
  },
  "application/tamp-update-confirm": {
    source: "iana"
  },
  "application/tar": {
    compressible: true
  },
  "application/taxii+json": {
    source: "iana",
    compressible: true
  },
  "application/td+json": {
    source: "iana",
    compressible: true
  },
  "application/tei+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "tei",
      "teicorpus"
    ]
  },
  "application/tetra_isi": {
    source: "iana"
  },
  "application/thraud+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "tfi"
    ]
  },
  "application/timestamp-query": {
    source: "iana"
  },
  "application/timestamp-reply": {
    source: "iana"
  },
  "application/timestamped-data": {
    source: "iana",
    extensions: [
      "tsd"
    ]
  },
  "application/tlsrpt+gzip": {
    source: "iana"
  },
  "application/tlsrpt+json": {
    source: "iana",
    compressible: true
  },
  "application/tnauthlist": {
    source: "iana"
  },
  "application/token-introspection+jwt": {
    source: "iana"
  },
  "application/toml": {
    compressible: true,
    extensions: [
      "toml"
    ]
  },
  "application/trickle-ice-sdpfrag": {
    source: "iana"
  },
  "application/trig": {
    source: "iana",
    extensions: [
      "trig"
    ]
  },
  "application/ttml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "ttml"
    ]
  },
  "application/tve-trigger": {
    source: "iana"
  },
  "application/tzif": {
    source: "iana"
  },
  "application/tzif-leap": {
    source: "iana"
  },
  "application/ubjson": {
    compressible: false,
    extensions: [
      "ubj"
    ]
  },
  "application/ulpfec": {
    source: "iana"
  },
  "application/urc-grpsheet+xml": {
    source: "iana",
    compressible: true
  },
  "application/urc-ressheet+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "rsheet"
    ]
  },
  "application/urc-targetdesc+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "td"
    ]
  },
  "application/urc-uisocketdesc+xml": {
    source: "iana",
    compressible: true
  },
  "application/vcard+json": {
    source: "iana",
    compressible: true
  },
  "application/vcard+xml": {
    source: "iana",
    compressible: true
  },
  "application/vemmi": {
    source: "iana"
  },
  "application/vividence.scriptfile": {
    source: "apache"
  },
  "application/vnd.1000minds.decision-model+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "1km"
    ]
  },
  "application/vnd.3gpp-prose+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp-prose-pc3ch+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp-v2x-local-service-information": {
    source: "iana"
  },
  "application/vnd.3gpp.5gnas": {
    source: "iana"
  },
  "application/vnd.3gpp.access-transfer-events+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.bsf+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.gmop+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.gtpc": {
    source: "iana"
  },
  "application/vnd.3gpp.interworking-data": {
    source: "iana"
  },
  "application/vnd.3gpp.lpp": {
    source: "iana"
  },
  "application/vnd.3gpp.mc-signalling-ear": {
    source: "iana"
  },
  "application/vnd.3gpp.mcdata-affiliation-command+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcdata-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcdata-payload": {
    source: "iana"
  },
  "application/vnd.3gpp.mcdata-service-config+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcdata-signalling": {
    source: "iana"
  },
  "application/vnd.3gpp.mcdata-ue-config+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcdata-user-profile+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcptt-affiliation-command+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcptt-floor-request+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcptt-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcptt-location-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcptt-mbms-usage-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcptt-service-config+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcptt-signed+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcptt-ue-config+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcptt-ue-init-config+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcptt-user-profile+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcvideo-affiliation-command+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcvideo-affiliation-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcvideo-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcvideo-location-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcvideo-mbms-usage-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcvideo-service-config+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcvideo-transmission-request+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcvideo-ue-config+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mcvideo-user-profile+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.mid-call+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.ngap": {
    source: "iana"
  },
  "application/vnd.3gpp.pfcp": {
    source: "iana"
  },
  "application/vnd.3gpp.pic-bw-large": {
    source: "iana",
    extensions: [
      "plb"
    ]
  },
  "application/vnd.3gpp.pic-bw-small": {
    source: "iana",
    extensions: [
      "psb"
    ]
  },
  "application/vnd.3gpp.pic-bw-var": {
    source: "iana",
    extensions: [
      "pvb"
    ]
  },
  "application/vnd.3gpp.s1ap": {
    source: "iana"
  },
  "application/vnd.3gpp.sms": {
    source: "iana"
  },
  "application/vnd.3gpp.sms+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.srvcc-ext+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.srvcc-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.state-and-event-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp.ussd+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp2.bcmcsinfo+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.3gpp2.sms": {
    source: "iana"
  },
  "application/vnd.3gpp2.tcap": {
    source: "iana",
    extensions: [
      "tcap"
    ]
  },
  "application/vnd.3lightssoftware.imagescal": {
    source: "iana"
  },
  "application/vnd.3m.post-it-notes": {
    source: "iana",
    extensions: [
      "pwn"
    ]
  },
  "application/vnd.accpac.simply.aso": {
    source: "iana",
    extensions: [
      "aso"
    ]
  },
  "application/vnd.accpac.simply.imp": {
    source: "iana",
    extensions: [
      "imp"
    ]
  },
  "application/vnd.acucobol": {
    source: "iana",
    extensions: [
      "acu"
    ]
  },
  "application/vnd.acucorp": {
    source: "iana",
    extensions: [
      "atc",
      "acutc"
    ]
  },
  "application/vnd.adobe.air-application-installer-package+zip": {
    source: "apache",
    compressible: false,
    extensions: [
      "air"
    ]
  },
  "application/vnd.adobe.flash.movie": {
    source: "iana"
  },
  "application/vnd.adobe.formscentral.fcdt": {
    source: "iana",
    extensions: [
      "fcdt"
    ]
  },
  "application/vnd.adobe.fxp": {
    source: "iana",
    extensions: [
      "fxp",
      "fxpl"
    ]
  },
  "application/vnd.adobe.partial-upload": {
    source: "iana"
  },
  "application/vnd.adobe.xdp+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xdp"
    ]
  },
  "application/vnd.adobe.xfdf": {
    source: "iana",
    extensions: [
      "xfdf"
    ]
  },
  "application/vnd.aether.imp": {
    source: "iana"
  },
  "application/vnd.afpc.afplinedata": {
    source: "iana"
  },
  "application/vnd.afpc.afplinedata-pagedef": {
    source: "iana"
  },
  "application/vnd.afpc.cmoca-cmresource": {
    source: "iana"
  },
  "application/vnd.afpc.foca-charset": {
    source: "iana"
  },
  "application/vnd.afpc.foca-codedfont": {
    source: "iana"
  },
  "application/vnd.afpc.foca-codepage": {
    source: "iana"
  },
  "application/vnd.afpc.modca": {
    source: "iana"
  },
  "application/vnd.afpc.modca-cmtable": {
    source: "iana"
  },
  "application/vnd.afpc.modca-formdef": {
    source: "iana"
  },
  "application/vnd.afpc.modca-mediummap": {
    source: "iana"
  },
  "application/vnd.afpc.modca-objectcontainer": {
    source: "iana"
  },
  "application/vnd.afpc.modca-overlay": {
    source: "iana"
  },
  "application/vnd.afpc.modca-pagesegment": {
    source: "iana"
  },
  "application/vnd.age": {
    source: "iana",
    extensions: [
      "age"
    ]
  },
  "application/vnd.ah-barcode": {
    source: "iana"
  },
  "application/vnd.ahead.space": {
    source: "iana",
    extensions: [
      "ahead"
    ]
  },
  "application/vnd.airzip.filesecure.azf": {
    source: "iana",
    extensions: [
      "azf"
    ]
  },
  "application/vnd.airzip.filesecure.azs": {
    source: "iana",
    extensions: [
      "azs"
    ]
  },
  "application/vnd.amadeus+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.amazon.ebook": {
    source: "apache",
    extensions: [
      "azw"
    ]
  },
  "application/vnd.amazon.mobi8-ebook": {
    source: "iana"
  },
  "application/vnd.americandynamics.acc": {
    source: "iana",
    extensions: [
      "acc"
    ]
  },
  "application/vnd.amiga.ami": {
    source: "iana",
    extensions: [
      "ami"
    ]
  },
  "application/vnd.amundsen.maze+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.android.ota": {
    source: "iana"
  },
  "application/vnd.android.package-archive": {
    source: "apache",
    compressible: false,
    extensions: [
      "apk"
    ]
  },
  "application/vnd.anki": {
    source: "iana"
  },
  "application/vnd.anser-web-certificate-issue-initiation": {
    source: "iana",
    extensions: [
      "cii"
    ]
  },
  "application/vnd.anser-web-funds-transfer-initiation": {
    source: "apache",
    extensions: [
      "fti"
    ]
  },
  "application/vnd.antix.game-component": {
    source: "iana",
    extensions: [
      "atx"
    ]
  },
  "application/vnd.apache.arrow.file": {
    source: "iana"
  },
  "application/vnd.apache.arrow.stream": {
    source: "iana"
  },
  "application/vnd.apache.thrift.binary": {
    source: "iana"
  },
  "application/vnd.apache.thrift.compact": {
    source: "iana"
  },
  "application/vnd.apache.thrift.json": {
    source: "iana"
  },
  "application/vnd.api+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.aplextor.warrp+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.apothekende.reservation+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.apple.installer+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "mpkg"
    ]
  },
  "application/vnd.apple.keynote": {
    source: "iana",
    extensions: [
      "key"
    ]
  },
  "application/vnd.apple.mpegurl": {
    source: "iana",
    extensions: [
      "m3u8"
    ]
  },
  "application/vnd.apple.numbers": {
    source: "iana",
    extensions: [
      "numbers"
    ]
  },
  "application/vnd.apple.pages": {
    source: "iana",
    extensions: [
      "pages"
    ]
  },
  "application/vnd.apple.pkpass": {
    compressible: false,
    extensions: [
      "pkpass"
    ]
  },
  "application/vnd.arastra.swi": {
    source: "iana"
  },
  "application/vnd.aristanetworks.swi": {
    source: "iana",
    extensions: [
      "swi"
    ]
  },
  "application/vnd.artisan+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.artsquare": {
    source: "iana"
  },
  "application/vnd.astraea-software.iota": {
    source: "iana",
    extensions: [
      "iota"
    ]
  },
  "application/vnd.audiograph": {
    source: "iana",
    extensions: [
      "aep"
    ]
  },
  "application/vnd.autopackage": {
    source: "iana"
  },
  "application/vnd.avalon+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.avistar+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.balsamiq.bmml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "bmml"
    ]
  },
  "application/vnd.balsamiq.bmpr": {
    source: "iana"
  },
  "application/vnd.banana-accounting": {
    source: "iana"
  },
  "application/vnd.bbf.usp.error": {
    source: "iana"
  },
  "application/vnd.bbf.usp.msg": {
    source: "iana"
  },
  "application/vnd.bbf.usp.msg+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.bekitzur-stech+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.bint.med-content": {
    source: "iana"
  },
  "application/vnd.biopax.rdf+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.blink-idb-value-wrapper": {
    source: "iana"
  },
  "application/vnd.blueice.multipass": {
    source: "iana",
    extensions: [
      "mpm"
    ]
  },
  "application/vnd.bluetooth.ep.oob": {
    source: "iana"
  },
  "application/vnd.bluetooth.le.oob": {
    source: "iana"
  },
  "application/vnd.bmi": {
    source: "iana",
    extensions: [
      "bmi"
    ]
  },
  "application/vnd.bpf": {
    source: "iana"
  },
  "application/vnd.bpf3": {
    source: "iana"
  },
  "application/vnd.businessobjects": {
    source: "iana",
    extensions: [
      "rep"
    ]
  },
  "application/vnd.byu.uapi+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.cab-jscript": {
    source: "iana"
  },
  "application/vnd.canon-cpdl": {
    source: "iana"
  },
  "application/vnd.canon-lips": {
    source: "iana"
  },
  "application/vnd.capasystems-pg+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.cendio.thinlinc.clientconf": {
    source: "iana"
  },
  "application/vnd.century-systems.tcp_stream": {
    source: "iana"
  },
  "application/vnd.chemdraw+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "cdxml"
    ]
  },
  "application/vnd.chess-pgn": {
    source: "iana"
  },
  "application/vnd.chipnuts.karaoke-mmd": {
    source: "iana",
    extensions: [
      "mmd"
    ]
  },
  "application/vnd.ciedi": {
    source: "iana"
  },
  "application/vnd.cinderella": {
    source: "iana",
    extensions: [
      "cdy"
    ]
  },
  "application/vnd.cirpack.isdn-ext": {
    source: "iana"
  },
  "application/vnd.citationstyles.style+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "csl"
    ]
  },
  "application/vnd.claymore": {
    source: "iana",
    extensions: [
      "cla"
    ]
  },
  "application/vnd.cloanto.rp9": {
    source: "iana",
    extensions: [
      "rp9"
    ]
  },
  "application/vnd.clonk.c4group": {
    source: "iana",
    extensions: [
      "c4g",
      "c4d",
      "c4f",
      "c4p",
      "c4u"
    ]
  },
  "application/vnd.cluetrust.cartomobile-config": {
    source: "iana",
    extensions: [
      "c11amc"
    ]
  },
  "application/vnd.cluetrust.cartomobile-config-pkg": {
    source: "iana",
    extensions: [
      "c11amz"
    ]
  },
  "application/vnd.coffeescript": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.document": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.document-template": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.presentation": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.presentation-template": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.spreadsheet": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.spreadsheet-template": {
    source: "iana"
  },
  "application/vnd.collection+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.collection.doc+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.collection.next+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.comicbook+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.comicbook-rar": {
    source: "iana"
  },
  "application/vnd.commerce-battelle": {
    source: "iana"
  },
  "application/vnd.commonspace": {
    source: "iana",
    extensions: [
      "csp"
    ]
  },
  "application/vnd.contact.cmsg": {
    source: "iana",
    extensions: [
      "cdbcmsg"
    ]
  },
  "application/vnd.coreos.ignition+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.cosmocaller": {
    source: "iana",
    extensions: [
      "cmc"
    ]
  },
  "application/vnd.crick.clicker": {
    source: "iana",
    extensions: [
      "clkx"
    ]
  },
  "application/vnd.crick.clicker.keyboard": {
    source: "iana",
    extensions: [
      "clkk"
    ]
  },
  "application/vnd.crick.clicker.palette": {
    source: "iana",
    extensions: [
      "clkp"
    ]
  },
  "application/vnd.crick.clicker.template": {
    source: "iana",
    extensions: [
      "clkt"
    ]
  },
  "application/vnd.crick.clicker.wordbank": {
    source: "iana",
    extensions: [
      "clkw"
    ]
  },
  "application/vnd.criticaltools.wbs+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "wbs"
    ]
  },
  "application/vnd.cryptii.pipe+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.crypto-shade-file": {
    source: "iana"
  },
  "application/vnd.cryptomator.encrypted": {
    source: "iana"
  },
  "application/vnd.cryptomator.vault": {
    source: "iana"
  },
  "application/vnd.ctc-posml": {
    source: "iana",
    extensions: [
      "pml"
    ]
  },
  "application/vnd.ctct.ws+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.cups-pdf": {
    source: "iana"
  },
  "application/vnd.cups-postscript": {
    source: "iana"
  },
  "application/vnd.cups-ppd": {
    source: "iana",
    extensions: [
      "ppd"
    ]
  },
  "application/vnd.cups-raster": {
    source: "iana"
  },
  "application/vnd.cups-raw": {
    source: "iana"
  },
  "application/vnd.curl": {
    source: "iana"
  },
  "application/vnd.curl.car": {
    source: "apache",
    extensions: [
      "car"
    ]
  },
  "application/vnd.curl.pcurl": {
    source: "apache",
    extensions: [
      "pcurl"
    ]
  },
  "application/vnd.cyan.dean.root+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.cybank": {
    source: "iana"
  },
  "application/vnd.cyclonedx+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.cyclonedx+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.d2l.coursepackage1p0+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.d3m-dataset": {
    source: "iana"
  },
  "application/vnd.d3m-problem": {
    source: "iana"
  },
  "application/vnd.dart": {
    source: "iana",
    compressible: true,
    extensions: [
      "dart"
    ]
  },
  "application/vnd.data-vision.rdz": {
    source: "iana",
    extensions: [
      "rdz"
    ]
  },
  "application/vnd.datapackage+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dataresource+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dbf": {
    source: "iana",
    extensions: [
      "dbf"
    ]
  },
  "application/vnd.debian.binary-package": {
    source: "iana"
  },
  "application/vnd.dece.data": {
    source: "iana",
    extensions: [
      "uvf",
      "uvvf",
      "uvd",
      "uvvd"
    ]
  },
  "application/vnd.dece.ttml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "uvt",
      "uvvt"
    ]
  },
  "application/vnd.dece.unspecified": {
    source: "iana",
    extensions: [
      "uvx",
      "uvvx"
    ]
  },
  "application/vnd.dece.zip": {
    source: "iana",
    extensions: [
      "uvz",
      "uvvz"
    ]
  },
  "application/vnd.denovo.fcselayout-link": {
    source: "iana",
    extensions: [
      "fe_launch"
    ]
  },
  "application/vnd.desmume.movie": {
    source: "iana"
  },
  "application/vnd.dir-bi.plate-dl-nosuffix": {
    source: "iana"
  },
  "application/vnd.dm.delegation+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dna": {
    source: "iana",
    extensions: [
      "dna"
    ]
  },
  "application/vnd.document+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dolby.mlp": {
    source: "apache",
    extensions: [
      "mlp"
    ]
  },
  "application/vnd.dolby.mobile.1": {
    source: "iana"
  },
  "application/vnd.dolby.mobile.2": {
    source: "iana"
  },
  "application/vnd.doremir.scorecloud-binary-document": {
    source: "iana"
  },
  "application/vnd.dpgraph": {
    source: "iana",
    extensions: [
      "dpg"
    ]
  },
  "application/vnd.dreamfactory": {
    source: "iana",
    extensions: [
      "dfac"
    ]
  },
  "application/vnd.drive+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ds-keypoint": {
    source: "apache",
    extensions: [
      "kpxx"
    ]
  },
  "application/vnd.dtg.local": {
    source: "iana"
  },
  "application/vnd.dtg.local.flash": {
    source: "iana"
  },
  "application/vnd.dtg.local.html": {
    source: "iana"
  },
  "application/vnd.dvb.ait": {
    source: "iana",
    extensions: [
      "ait"
    ]
  },
  "application/vnd.dvb.dvbisl+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dvb.dvbj": {
    source: "iana"
  },
  "application/vnd.dvb.esgcontainer": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcdftnotifaccess": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcesgaccess": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcesgaccess2": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcesgpdd": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcroaming": {
    source: "iana"
  },
  "application/vnd.dvb.iptv.alfec-base": {
    source: "iana"
  },
  "application/vnd.dvb.iptv.alfec-enhancement": {
    source: "iana"
  },
  "application/vnd.dvb.notif-aggregate-root+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dvb.notif-container+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dvb.notif-generic+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dvb.notif-ia-msglist+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dvb.notif-ia-registration-request+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dvb.notif-ia-registration-response+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dvb.notif-init+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.dvb.pfr": {
    source: "iana"
  },
  "application/vnd.dvb.service": {
    source: "iana",
    extensions: [
      "svc"
    ]
  },
  "application/vnd.dxr": {
    source: "iana"
  },
  "application/vnd.dynageo": {
    source: "iana",
    extensions: [
      "geo"
    ]
  },
  "application/vnd.dzr": {
    source: "iana"
  },
  "application/vnd.easykaraoke.cdgdownload": {
    source: "iana"
  },
  "application/vnd.ecdis-update": {
    source: "iana"
  },
  "application/vnd.ecip.rlp": {
    source: "iana"
  },
  "application/vnd.eclipse.ditto+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ecowin.chart": {
    source: "iana",
    extensions: [
      "mag"
    ]
  },
  "application/vnd.ecowin.filerequest": {
    source: "iana"
  },
  "application/vnd.ecowin.fileupdate": {
    source: "iana"
  },
  "application/vnd.ecowin.series": {
    source: "iana"
  },
  "application/vnd.ecowin.seriesrequest": {
    source: "iana"
  },
  "application/vnd.ecowin.seriesupdate": {
    source: "iana"
  },
  "application/vnd.efi.img": {
    source: "iana"
  },
  "application/vnd.efi.iso": {
    source: "iana"
  },
  "application/vnd.emclient.accessrequest+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.enliven": {
    source: "iana",
    extensions: [
      "nml"
    ]
  },
  "application/vnd.enphase.envoy": {
    source: "iana"
  },
  "application/vnd.eprints.data+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.epson.esf": {
    source: "iana",
    extensions: [
      "esf"
    ]
  },
  "application/vnd.epson.msf": {
    source: "iana",
    extensions: [
      "msf"
    ]
  },
  "application/vnd.epson.quickanime": {
    source: "iana",
    extensions: [
      "qam"
    ]
  },
  "application/vnd.epson.salt": {
    source: "iana",
    extensions: [
      "slt"
    ]
  },
  "application/vnd.epson.ssf": {
    source: "iana",
    extensions: [
      "ssf"
    ]
  },
  "application/vnd.ericsson.quickcall": {
    source: "iana"
  },
  "application/vnd.espass-espass+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.eszigno3+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "es3",
      "et3"
    ]
  },
  "application/vnd.etsi.aoc+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.asic-e+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.etsi.asic-s+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.etsi.cug+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.iptvcommand+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.iptvdiscovery+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.iptvprofile+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.iptvsad-bc+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.iptvsad-cod+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.iptvsad-npvr+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.iptvservice+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.iptvsync+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.iptvueprofile+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.mcid+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.mheg5": {
    source: "iana"
  },
  "application/vnd.etsi.overload-control-policy-dataset+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.pstn+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.sci+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.simservs+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.timestamp-token": {
    source: "iana"
  },
  "application/vnd.etsi.tsl+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.etsi.tsl.der": {
    source: "iana"
  },
  "application/vnd.eu.kasparian.car+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.eudora.data": {
    source: "iana"
  },
  "application/vnd.evolv.ecig.profile": {
    source: "iana"
  },
  "application/vnd.evolv.ecig.settings": {
    source: "iana"
  },
  "application/vnd.evolv.ecig.theme": {
    source: "iana"
  },
  "application/vnd.exstream-empower+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.exstream-package": {
    source: "iana"
  },
  "application/vnd.ezpix-album": {
    source: "iana",
    extensions: [
      "ez2"
    ]
  },
  "application/vnd.ezpix-package": {
    source: "iana",
    extensions: [
      "ez3"
    ]
  },
  "application/vnd.f-secure.mobile": {
    source: "iana"
  },
  "application/vnd.familysearch.gedcom+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.fastcopy-disk-image": {
    source: "iana"
  },
  "application/vnd.fdf": {
    source: "iana",
    extensions: [
      "fdf"
    ]
  },
  "application/vnd.fdsn.mseed": {
    source: "iana",
    extensions: [
      "mseed"
    ]
  },
  "application/vnd.fdsn.seed": {
    source: "iana",
    extensions: [
      "seed",
      "dataless"
    ]
  },
  "application/vnd.ffsns": {
    source: "iana"
  },
  "application/vnd.ficlab.flb+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.filmit.zfc": {
    source: "iana"
  },
  "application/vnd.fints": {
    source: "iana"
  },
  "application/vnd.firemonkeys.cloudcell": {
    source: "iana"
  },
  "application/vnd.flographit": {
    source: "iana",
    extensions: [
      "gph"
    ]
  },
  "application/vnd.fluxtime.clip": {
    source: "iana",
    extensions: [
      "ftc"
    ]
  },
  "application/vnd.font-fontforge-sfd": {
    source: "iana"
  },
  "application/vnd.framemaker": {
    source: "iana",
    extensions: [
      "fm",
      "frame",
      "maker",
      "book"
    ]
  },
  "application/vnd.frogans.fnc": {
    source: "iana",
    extensions: [
      "fnc"
    ]
  },
  "application/vnd.frogans.ltf": {
    source: "iana",
    extensions: [
      "ltf"
    ]
  },
  "application/vnd.fsc.weblaunch": {
    source: "iana",
    extensions: [
      "fsc"
    ]
  },
  "application/vnd.fujifilm.fb.docuworks": {
    source: "iana"
  },
  "application/vnd.fujifilm.fb.docuworks.binder": {
    source: "iana"
  },
  "application/vnd.fujifilm.fb.docuworks.container": {
    source: "iana"
  },
  "application/vnd.fujifilm.fb.jfi+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.fujitsu.oasys": {
    source: "iana",
    extensions: [
      "oas"
    ]
  },
  "application/vnd.fujitsu.oasys2": {
    source: "iana",
    extensions: [
      "oa2"
    ]
  },
  "application/vnd.fujitsu.oasys3": {
    source: "iana",
    extensions: [
      "oa3"
    ]
  },
  "application/vnd.fujitsu.oasysgp": {
    source: "iana",
    extensions: [
      "fg5"
    ]
  },
  "application/vnd.fujitsu.oasysprs": {
    source: "iana",
    extensions: [
      "bh2"
    ]
  },
  "application/vnd.fujixerox.art-ex": {
    source: "iana"
  },
  "application/vnd.fujixerox.art4": {
    source: "iana"
  },
  "application/vnd.fujixerox.ddd": {
    source: "iana",
    extensions: [
      "ddd"
    ]
  },
  "application/vnd.fujixerox.docuworks": {
    source: "iana",
    extensions: [
      "xdw"
    ]
  },
  "application/vnd.fujixerox.docuworks.binder": {
    source: "iana",
    extensions: [
      "xbd"
    ]
  },
  "application/vnd.fujixerox.docuworks.container": {
    source: "iana"
  },
  "application/vnd.fujixerox.hbpl": {
    source: "iana"
  },
  "application/vnd.fut-misnet": {
    source: "iana"
  },
  "application/vnd.futoin+cbor": {
    source: "iana"
  },
  "application/vnd.futoin+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.fuzzysheet": {
    source: "iana",
    extensions: [
      "fzs"
    ]
  },
  "application/vnd.genomatix.tuxedo": {
    source: "iana",
    extensions: [
      "txd"
    ]
  },
  "application/vnd.gentics.grd+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.geo+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.geocube+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.geogebra.file": {
    source: "iana",
    extensions: [
      "ggb"
    ]
  },
  "application/vnd.geogebra.slides": {
    source: "iana"
  },
  "application/vnd.geogebra.tool": {
    source: "iana",
    extensions: [
      "ggt"
    ]
  },
  "application/vnd.geometry-explorer": {
    source: "iana",
    extensions: [
      "gex",
      "gre"
    ]
  },
  "application/vnd.geonext": {
    source: "iana",
    extensions: [
      "gxt"
    ]
  },
  "application/vnd.geoplan": {
    source: "iana",
    extensions: [
      "g2w"
    ]
  },
  "application/vnd.geospace": {
    source: "iana",
    extensions: [
      "g3w"
    ]
  },
  "application/vnd.gerber": {
    source: "iana"
  },
  "application/vnd.globalplatform.card-content-mgt": {
    source: "iana"
  },
  "application/vnd.globalplatform.card-content-mgt-response": {
    source: "iana"
  },
  "application/vnd.gmx": {
    source: "iana",
    extensions: [
      "gmx"
    ]
  },
  "application/vnd.google-apps.document": {
    compressible: false,
    extensions: [
      "gdoc"
    ]
  },
  "application/vnd.google-apps.presentation": {
    compressible: false,
    extensions: [
      "gslides"
    ]
  },
  "application/vnd.google-apps.spreadsheet": {
    compressible: false,
    extensions: [
      "gsheet"
    ]
  },
  "application/vnd.google-earth.kml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "kml"
    ]
  },
  "application/vnd.google-earth.kmz": {
    source: "iana",
    compressible: false,
    extensions: [
      "kmz"
    ]
  },
  "application/vnd.gov.sk.e-form+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.gov.sk.e-form+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.gov.sk.xmldatacontainer+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.grafeq": {
    source: "iana",
    extensions: [
      "gqf",
      "gqs"
    ]
  },
  "application/vnd.gridmp": {
    source: "iana"
  },
  "application/vnd.groove-account": {
    source: "iana",
    extensions: [
      "gac"
    ]
  },
  "application/vnd.groove-help": {
    source: "iana",
    extensions: [
      "ghf"
    ]
  },
  "application/vnd.groove-identity-message": {
    source: "iana",
    extensions: [
      "gim"
    ]
  },
  "application/vnd.groove-injector": {
    source: "iana",
    extensions: [
      "grv"
    ]
  },
  "application/vnd.groove-tool-message": {
    source: "iana",
    extensions: [
      "gtm"
    ]
  },
  "application/vnd.groove-tool-template": {
    source: "iana",
    extensions: [
      "tpl"
    ]
  },
  "application/vnd.groove-vcard": {
    source: "iana",
    extensions: [
      "vcg"
    ]
  },
  "application/vnd.hal+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.hal+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "hal"
    ]
  },
  "application/vnd.handheld-entertainment+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "zmm"
    ]
  },
  "application/vnd.hbci": {
    source: "iana",
    extensions: [
      "hbci"
    ]
  },
  "application/vnd.hc+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.hcl-bireports": {
    source: "iana"
  },
  "application/vnd.hdt": {
    source: "iana"
  },
  "application/vnd.heroku+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.hhe.lesson-player": {
    source: "iana",
    extensions: [
      "les"
    ]
  },
  "application/vnd.hl7cda+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/vnd.hl7v2+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/vnd.hp-hpgl": {
    source: "iana",
    extensions: [
      "hpgl"
    ]
  },
  "application/vnd.hp-hpid": {
    source: "iana",
    extensions: [
      "hpid"
    ]
  },
  "application/vnd.hp-hps": {
    source: "iana",
    extensions: [
      "hps"
    ]
  },
  "application/vnd.hp-jlyt": {
    source: "iana",
    extensions: [
      "jlt"
    ]
  },
  "application/vnd.hp-pcl": {
    source: "iana",
    extensions: [
      "pcl"
    ]
  },
  "application/vnd.hp-pclxl": {
    source: "iana",
    extensions: [
      "pclxl"
    ]
  },
  "application/vnd.httphone": {
    source: "iana"
  },
  "application/vnd.hydrostatix.sof-data": {
    source: "iana",
    extensions: [
      "sfd-hdstx"
    ]
  },
  "application/vnd.hyper+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.hyper-item+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.hyperdrive+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.hzn-3d-crossword": {
    source: "iana"
  },
  "application/vnd.ibm.afplinedata": {
    source: "iana"
  },
  "application/vnd.ibm.electronic-media": {
    source: "iana"
  },
  "application/vnd.ibm.minipay": {
    source: "iana",
    extensions: [
      "mpy"
    ]
  },
  "application/vnd.ibm.modcap": {
    source: "iana",
    extensions: [
      "afp",
      "listafp",
      "list3820"
    ]
  },
  "application/vnd.ibm.rights-management": {
    source: "iana",
    extensions: [
      "irm"
    ]
  },
  "application/vnd.ibm.secure-container": {
    source: "iana",
    extensions: [
      "sc"
    ]
  },
  "application/vnd.iccprofile": {
    source: "iana",
    extensions: [
      "icc",
      "icm"
    ]
  },
  "application/vnd.ieee.1905": {
    source: "iana"
  },
  "application/vnd.igloader": {
    source: "iana",
    extensions: [
      "igl"
    ]
  },
  "application/vnd.imagemeter.folder+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.imagemeter.image+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.immervision-ivp": {
    source: "iana",
    extensions: [
      "ivp"
    ]
  },
  "application/vnd.immervision-ivu": {
    source: "iana",
    extensions: [
      "ivu"
    ]
  },
  "application/vnd.ims.imsccv1p1": {
    source: "iana"
  },
  "application/vnd.ims.imsccv1p2": {
    source: "iana"
  },
  "application/vnd.ims.imsccv1p3": {
    source: "iana"
  },
  "application/vnd.ims.lis.v2.result+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ims.lti.v2.toolconsumerprofile+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ims.lti.v2.toolproxy+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ims.lti.v2.toolproxy.id+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ims.lti.v2.toolsettings+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ims.lti.v2.toolsettings.simple+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.informedcontrol.rms+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.informix-visionary": {
    source: "iana"
  },
  "application/vnd.infotech.project": {
    source: "iana"
  },
  "application/vnd.infotech.project+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.innopath.wamp.notification": {
    source: "iana"
  },
  "application/vnd.insors.igm": {
    source: "iana",
    extensions: [
      "igm"
    ]
  },
  "application/vnd.intercon.formnet": {
    source: "iana",
    extensions: [
      "xpw",
      "xpx"
    ]
  },
  "application/vnd.intergeo": {
    source: "iana",
    extensions: [
      "i2g"
    ]
  },
  "application/vnd.intertrust.digibox": {
    source: "iana"
  },
  "application/vnd.intertrust.nncp": {
    source: "iana"
  },
  "application/vnd.intu.qbo": {
    source: "iana",
    extensions: [
      "qbo"
    ]
  },
  "application/vnd.intu.qfx": {
    source: "iana",
    extensions: [
      "qfx"
    ]
  },
  "application/vnd.iptc.g2.catalogitem+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.iptc.g2.conceptitem+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.iptc.g2.knowledgeitem+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.iptc.g2.newsitem+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.iptc.g2.newsmessage+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.iptc.g2.packageitem+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.iptc.g2.planningitem+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ipunplugged.rcprofile": {
    source: "iana",
    extensions: [
      "rcprofile"
    ]
  },
  "application/vnd.irepository.package+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "irp"
    ]
  },
  "application/vnd.is-xpr": {
    source: "iana",
    extensions: [
      "xpr"
    ]
  },
  "application/vnd.isac.fcs": {
    source: "iana",
    extensions: [
      "fcs"
    ]
  },
  "application/vnd.iso11783-10+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.jam": {
    source: "iana",
    extensions: [
      "jam"
    ]
  },
  "application/vnd.japannet-directory-service": {
    source: "iana"
  },
  "application/vnd.japannet-jpnstore-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-payment-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-registration": {
    source: "iana"
  },
  "application/vnd.japannet-registration-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-setstore-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-verification": {
    source: "iana"
  },
  "application/vnd.japannet-verification-wakeup": {
    source: "iana"
  },
  "application/vnd.jcp.javame.midlet-rms": {
    source: "iana",
    extensions: [
      "rms"
    ]
  },
  "application/vnd.jisp": {
    source: "iana",
    extensions: [
      "jisp"
    ]
  },
  "application/vnd.joost.joda-archive": {
    source: "iana",
    extensions: [
      "joda"
    ]
  },
  "application/vnd.jsk.isdn-ngn": {
    source: "iana"
  },
  "application/vnd.kahootz": {
    source: "iana",
    extensions: [
      "ktz",
      "ktr"
    ]
  },
  "application/vnd.kde.karbon": {
    source: "iana",
    extensions: [
      "karbon"
    ]
  },
  "application/vnd.kde.kchart": {
    source: "iana",
    extensions: [
      "chrt"
    ]
  },
  "application/vnd.kde.kformula": {
    source: "iana",
    extensions: [
      "kfo"
    ]
  },
  "application/vnd.kde.kivio": {
    source: "iana",
    extensions: [
      "flw"
    ]
  },
  "application/vnd.kde.kontour": {
    source: "iana",
    extensions: [
      "kon"
    ]
  },
  "application/vnd.kde.kpresenter": {
    source: "iana",
    extensions: [
      "kpr",
      "kpt"
    ]
  },
  "application/vnd.kde.kspread": {
    source: "iana",
    extensions: [
      "ksp"
    ]
  },
  "application/vnd.kde.kword": {
    source: "iana",
    extensions: [
      "kwd",
      "kwt"
    ]
  },
  "application/vnd.kenameaapp": {
    source: "iana",
    extensions: [
      "htke"
    ]
  },
  "application/vnd.kidspiration": {
    source: "iana",
    extensions: [
      "kia"
    ]
  },
  "application/vnd.kinar": {
    source: "iana",
    extensions: [
      "kne",
      "knp"
    ]
  },
  "application/vnd.koan": {
    source: "iana",
    extensions: [
      "skp",
      "skd",
      "skt",
      "skm"
    ]
  },
  "application/vnd.kodak-descriptor": {
    source: "iana",
    extensions: [
      "sse"
    ]
  },
  "application/vnd.las": {
    source: "iana"
  },
  "application/vnd.las.las+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.las.las+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "lasxml"
    ]
  },
  "application/vnd.laszip": {
    source: "iana"
  },
  "application/vnd.leap+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.liberty-request+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.llamagraphics.life-balance.desktop": {
    source: "iana",
    extensions: [
      "lbd"
    ]
  },
  "application/vnd.llamagraphics.life-balance.exchange+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "lbe"
    ]
  },
  "application/vnd.logipipe.circuit+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.loom": {
    source: "iana"
  },
  "application/vnd.lotus-1-2-3": {
    source: "iana",
    extensions: [
      "123"
    ]
  },
  "application/vnd.lotus-approach": {
    source: "iana",
    extensions: [
      "apr"
    ]
  },
  "application/vnd.lotus-freelance": {
    source: "iana",
    extensions: [
      "pre"
    ]
  },
  "application/vnd.lotus-notes": {
    source: "iana",
    extensions: [
      "nsf"
    ]
  },
  "application/vnd.lotus-organizer": {
    source: "iana",
    extensions: [
      "org"
    ]
  },
  "application/vnd.lotus-screencam": {
    source: "iana",
    extensions: [
      "scm"
    ]
  },
  "application/vnd.lotus-wordpro": {
    source: "iana",
    extensions: [
      "lwp"
    ]
  },
  "application/vnd.macports.portpkg": {
    source: "iana",
    extensions: [
      "portpkg"
    ]
  },
  "application/vnd.mapbox-vector-tile": {
    source: "iana",
    extensions: [
      "mvt"
    ]
  },
  "application/vnd.marlin.drm.actiontoken+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.marlin.drm.conftoken+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.marlin.drm.license+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.marlin.drm.mdcf": {
    source: "iana"
  },
  "application/vnd.mason+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.maxar.archive.3tz+zip": {
    source: "iana",
    compressible: false
  },
  "application/vnd.maxmind.maxmind-db": {
    source: "iana"
  },
  "application/vnd.mcd": {
    source: "iana",
    extensions: [
      "mcd"
    ]
  },
  "application/vnd.medcalcdata": {
    source: "iana",
    extensions: [
      "mc1"
    ]
  },
  "application/vnd.mediastation.cdkey": {
    source: "iana",
    extensions: [
      "cdkey"
    ]
  },
  "application/vnd.meridian-slingshot": {
    source: "iana"
  },
  "application/vnd.mfer": {
    source: "iana",
    extensions: [
      "mwf"
    ]
  },
  "application/vnd.mfmp": {
    source: "iana",
    extensions: [
      "mfm"
    ]
  },
  "application/vnd.micro+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.micrografx.flo": {
    source: "iana",
    extensions: [
      "flo"
    ]
  },
  "application/vnd.micrografx.igx": {
    source: "iana",
    extensions: [
      "igx"
    ]
  },
  "application/vnd.microsoft.portable-executable": {
    source: "iana"
  },
  "application/vnd.microsoft.windows.thumbnail-cache": {
    source: "iana"
  },
  "application/vnd.miele+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.mif": {
    source: "iana",
    extensions: [
      "mif"
    ]
  },
  "application/vnd.minisoft-hp3000-save": {
    source: "iana"
  },
  "application/vnd.mitsubishi.misty-guard.trustweb": {
    source: "iana"
  },
  "application/vnd.mobius.daf": {
    source: "iana",
    extensions: [
      "daf"
    ]
  },
  "application/vnd.mobius.dis": {
    source: "iana",
    extensions: [
      "dis"
    ]
  },
  "application/vnd.mobius.mbk": {
    source: "iana",
    extensions: [
      "mbk"
    ]
  },
  "application/vnd.mobius.mqy": {
    source: "iana",
    extensions: [
      "mqy"
    ]
  },
  "application/vnd.mobius.msl": {
    source: "iana",
    extensions: [
      "msl"
    ]
  },
  "application/vnd.mobius.plc": {
    source: "iana",
    extensions: [
      "plc"
    ]
  },
  "application/vnd.mobius.txf": {
    source: "iana",
    extensions: [
      "txf"
    ]
  },
  "application/vnd.mophun.application": {
    source: "iana",
    extensions: [
      "mpn"
    ]
  },
  "application/vnd.mophun.certificate": {
    source: "iana",
    extensions: [
      "mpc"
    ]
  },
  "application/vnd.motorola.flexsuite": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.adsi": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.fis": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.gotap": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.kmr": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.ttc": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.wem": {
    source: "iana"
  },
  "application/vnd.motorola.iprm": {
    source: "iana"
  },
  "application/vnd.mozilla.xul+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xul"
    ]
  },
  "application/vnd.ms-3mfdocument": {
    source: "iana"
  },
  "application/vnd.ms-artgalry": {
    source: "iana",
    extensions: [
      "cil"
    ]
  },
  "application/vnd.ms-asf": {
    source: "iana"
  },
  "application/vnd.ms-cab-compressed": {
    source: "iana",
    extensions: [
      "cab"
    ]
  },
  "application/vnd.ms-color.iccprofile": {
    source: "apache"
  },
  "application/vnd.ms-excel": {
    source: "iana",
    compressible: false,
    extensions: [
      "xls",
      "xlm",
      "xla",
      "xlc",
      "xlt",
      "xlw"
    ]
  },
  "application/vnd.ms-excel.addin.macroenabled.12": {
    source: "iana",
    extensions: [
      "xlam"
    ]
  },
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": {
    source: "iana",
    extensions: [
      "xlsb"
    ]
  },
  "application/vnd.ms-excel.sheet.macroenabled.12": {
    source: "iana",
    extensions: [
      "xlsm"
    ]
  },
  "application/vnd.ms-excel.template.macroenabled.12": {
    source: "iana",
    extensions: [
      "xltm"
    ]
  },
  "application/vnd.ms-fontobject": {
    source: "iana",
    compressible: true,
    extensions: [
      "eot"
    ]
  },
  "application/vnd.ms-htmlhelp": {
    source: "iana",
    extensions: [
      "chm"
    ]
  },
  "application/vnd.ms-ims": {
    source: "iana",
    extensions: [
      "ims"
    ]
  },
  "application/vnd.ms-lrm": {
    source: "iana",
    extensions: [
      "lrm"
    ]
  },
  "application/vnd.ms-office.activex+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ms-officetheme": {
    source: "iana",
    extensions: [
      "thmx"
    ]
  },
  "application/vnd.ms-opentype": {
    source: "apache",
    compressible: true
  },
  "application/vnd.ms-outlook": {
    compressible: false,
    extensions: [
      "msg"
    ]
  },
  "application/vnd.ms-package.obfuscated-opentype": {
    source: "apache"
  },
  "application/vnd.ms-pki.seccat": {
    source: "apache",
    extensions: [
      "cat"
    ]
  },
  "application/vnd.ms-pki.stl": {
    source: "apache",
    extensions: [
      "stl"
    ]
  },
  "application/vnd.ms-playready.initiator+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ms-powerpoint": {
    source: "iana",
    compressible: false,
    extensions: [
      "ppt",
      "pps",
      "pot"
    ]
  },
  "application/vnd.ms-powerpoint.addin.macroenabled.12": {
    source: "iana",
    extensions: [
      "ppam"
    ]
  },
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": {
    source: "iana",
    extensions: [
      "pptm"
    ]
  },
  "application/vnd.ms-powerpoint.slide.macroenabled.12": {
    source: "iana",
    extensions: [
      "sldm"
    ]
  },
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": {
    source: "iana",
    extensions: [
      "ppsm"
    ]
  },
  "application/vnd.ms-powerpoint.template.macroenabled.12": {
    source: "iana",
    extensions: [
      "potm"
    ]
  },
  "application/vnd.ms-printdevicecapabilities+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ms-printing.printticket+xml": {
    source: "apache",
    compressible: true
  },
  "application/vnd.ms-printschematicket+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ms-project": {
    source: "iana",
    extensions: [
      "mpp",
      "mpt"
    ]
  },
  "application/vnd.ms-tnef": {
    source: "iana"
  },
  "application/vnd.ms-windows.devicepairing": {
    source: "iana"
  },
  "application/vnd.ms-windows.nwprinting.oob": {
    source: "iana"
  },
  "application/vnd.ms-windows.printerpairing": {
    source: "iana"
  },
  "application/vnd.ms-windows.wsd.oob": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.lic-chlg-req": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.lic-resp": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.meter-chlg-req": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.meter-resp": {
    source: "iana"
  },
  "application/vnd.ms-word.document.macroenabled.12": {
    source: "iana",
    extensions: [
      "docm"
    ]
  },
  "application/vnd.ms-word.template.macroenabled.12": {
    source: "iana",
    extensions: [
      "dotm"
    ]
  },
  "application/vnd.ms-works": {
    source: "iana",
    extensions: [
      "wps",
      "wks",
      "wcm",
      "wdb"
    ]
  },
  "application/vnd.ms-wpl": {
    source: "iana",
    extensions: [
      "wpl"
    ]
  },
  "application/vnd.ms-xpsdocument": {
    source: "iana",
    compressible: false,
    extensions: [
      "xps"
    ]
  },
  "application/vnd.msa-disk-image": {
    source: "iana"
  },
  "application/vnd.mseq": {
    source: "iana",
    extensions: [
      "mseq"
    ]
  },
  "application/vnd.msign": {
    source: "iana"
  },
  "application/vnd.multiad.creator": {
    source: "iana"
  },
  "application/vnd.multiad.creator.cif": {
    source: "iana"
  },
  "application/vnd.music-niff": {
    source: "iana"
  },
  "application/vnd.musician": {
    source: "iana",
    extensions: [
      "mus"
    ]
  },
  "application/vnd.muvee.style": {
    source: "iana",
    extensions: [
      "msty"
    ]
  },
  "application/vnd.mynfc": {
    source: "iana",
    extensions: [
      "taglet"
    ]
  },
  "application/vnd.nacamar.ybrid+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.ncd.control": {
    source: "iana"
  },
  "application/vnd.ncd.reference": {
    source: "iana"
  },
  "application/vnd.nearst.inv+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.nebumind.line": {
    source: "iana"
  },
  "application/vnd.nervana": {
    source: "iana"
  },
  "application/vnd.netfpx": {
    source: "iana"
  },
  "application/vnd.neurolanguage.nlu": {
    source: "iana",
    extensions: [
      "nlu"
    ]
  },
  "application/vnd.nimn": {
    source: "iana"
  },
  "application/vnd.nintendo.nitro.rom": {
    source: "iana"
  },
  "application/vnd.nintendo.snes.rom": {
    source: "iana"
  },
  "application/vnd.nitf": {
    source: "iana",
    extensions: [
      "ntf",
      "nitf"
    ]
  },
  "application/vnd.noblenet-directory": {
    source: "iana",
    extensions: [
      "nnd"
    ]
  },
  "application/vnd.noblenet-sealer": {
    source: "iana",
    extensions: [
      "nns"
    ]
  },
  "application/vnd.noblenet-web": {
    source: "iana",
    extensions: [
      "nnw"
    ]
  },
  "application/vnd.nokia.catalogs": {
    source: "iana"
  },
  "application/vnd.nokia.conml+wbxml": {
    source: "iana"
  },
  "application/vnd.nokia.conml+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.nokia.iptv.config+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.nokia.isds-radio-presets": {
    source: "iana"
  },
  "application/vnd.nokia.landmark+wbxml": {
    source: "iana"
  },
  "application/vnd.nokia.landmark+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.nokia.landmarkcollection+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.nokia.n-gage.ac+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "ac"
    ]
  },
  "application/vnd.nokia.n-gage.data": {
    source: "iana",
    extensions: [
      "ngdat"
    ]
  },
  "application/vnd.nokia.n-gage.symbian.install": {
    source: "iana",
    extensions: [
      "n-gage"
    ]
  },
  "application/vnd.nokia.ncd": {
    source: "iana"
  },
  "application/vnd.nokia.pcd+wbxml": {
    source: "iana"
  },
  "application/vnd.nokia.pcd+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.nokia.radio-preset": {
    source: "iana",
    extensions: [
      "rpst"
    ]
  },
  "application/vnd.nokia.radio-presets": {
    source: "iana",
    extensions: [
      "rpss"
    ]
  },
  "application/vnd.novadigm.edm": {
    source: "iana",
    extensions: [
      "edm"
    ]
  },
  "application/vnd.novadigm.edx": {
    source: "iana",
    extensions: [
      "edx"
    ]
  },
  "application/vnd.novadigm.ext": {
    source: "iana",
    extensions: [
      "ext"
    ]
  },
  "application/vnd.ntt-local.content-share": {
    source: "iana"
  },
  "application/vnd.ntt-local.file-transfer": {
    source: "iana"
  },
  "application/vnd.ntt-local.ogw_remote-access": {
    source: "iana"
  },
  "application/vnd.ntt-local.sip-ta_remote": {
    source: "iana"
  },
  "application/vnd.ntt-local.sip-ta_tcp_stream": {
    source: "iana"
  },
  "application/vnd.oasis.opendocument.chart": {
    source: "iana",
    extensions: [
      "odc"
    ]
  },
  "application/vnd.oasis.opendocument.chart-template": {
    source: "iana",
    extensions: [
      "otc"
    ]
  },
  "application/vnd.oasis.opendocument.database": {
    source: "iana",
    extensions: [
      "odb"
    ]
  },
  "application/vnd.oasis.opendocument.formula": {
    source: "iana",
    extensions: [
      "odf"
    ]
  },
  "application/vnd.oasis.opendocument.formula-template": {
    source: "iana",
    extensions: [
      "odft"
    ]
  },
  "application/vnd.oasis.opendocument.graphics": {
    source: "iana",
    compressible: false,
    extensions: [
      "odg"
    ]
  },
  "application/vnd.oasis.opendocument.graphics-template": {
    source: "iana",
    extensions: [
      "otg"
    ]
  },
  "application/vnd.oasis.opendocument.image": {
    source: "iana",
    extensions: [
      "odi"
    ]
  },
  "application/vnd.oasis.opendocument.image-template": {
    source: "iana",
    extensions: [
      "oti"
    ]
  },
  "application/vnd.oasis.opendocument.presentation": {
    source: "iana",
    compressible: false,
    extensions: [
      "odp"
    ]
  },
  "application/vnd.oasis.opendocument.presentation-template": {
    source: "iana",
    extensions: [
      "otp"
    ]
  },
  "application/vnd.oasis.opendocument.spreadsheet": {
    source: "iana",
    compressible: false,
    extensions: [
      "ods"
    ]
  },
  "application/vnd.oasis.opendocument.spreadsheet-template": {
    source: "iana",
    extensions: [
      "ots"
    ]
  },
  "application/vnd.oasis.opendocument.text": {
    source: "iana",
    compressible: false,
    extensions: [
      "odt"
    ]
  },
  "application/vnd.oasis.opendocument.text-master": {
    source: "iana",
    extensions: [
      "odm"
    ]
  },
  "application/vnd.oasis.opendocument.text-template": {
    source: "iana",
    extensions: [
      "ott"
    ]
  },
  "application/vnd.oasis.opendocument.text-web": {
    source: "iana",
    extensions: [
      "oth"
    ]
  },
  "application/vnd.obn": {
    source: "iana"
  },
  "application/vnd.ocf+cbor": {
    source: "iana"
  },
  "application/vnd.oci.image.manifest.v1+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oftn.l10n+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oipf.contentaccessdownload+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oipf.contentaccessstreaming+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oipf.cspg-hexbinary": {
    source: "iana"
  },
  "application/vnd.oipf.dae.svg+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oipf.dae.xhtml+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oipf.mippvcontrolmessage+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oipf.pae.gem": {
    source: "iana"
  },
  "application/vnd.oipf.spdiscovery+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oipf.spdlist+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oipf.ueprofile+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oipf.userprofile+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.olpc-sugar": {
    source: "iana",
    extensions: [
      "xo"
    ]
  },
  "application/vnd.oma-scws-config": {
    source: "iana"
  },
  "application/vnd.oma-scws-http-request": {
    source: "iana"
  },
  "application/vnd.oma-scws-http-response": {
    source: "iana"
  },
  "application/vnd.oma.bcast.associated-procedure-parameter+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.bcast.drm-trigger+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.bcast.imd+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.bcast.ltkm": {
    source: "iana"
  },
  "application/vnd.oma.bcast.notification+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.bcast.provisioningtrigger": {
    source: "iana"
  },
  "application/vnd.oma.bcast.sgboot": {
    source: "iana"
  },
  "application/vnd.oma.bcast.sgdd+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.bcast.sgdu": {
    source: "iana"
  },
  "application/vnd.oma.bcast.simple-symbol-container": {
    source: "iana"
  },
  "application/vnd.oma.bcast.smartcard-trigger+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.bcast.sprov+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.bcast.stkm": {
    source: "iana"
  },
  "application/vnd.oma.cab-address-book+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.cab-feature-handler+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.cab-pcc+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.cab-subs-invite+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.cab-user-prefs+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.dcd": {
    source: "iana"
  },
  "application/vnd.oma.dcdc": {
    source: "iana"
  },
  "application/vnd.oma.dd2+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "dd2"
    ]
  },
  "application/vnd.oma.drm.risd+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.group-usage-list+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.lwm2m+cbor": {
    source: "iana"
  },
  "application/vnd.oma.lwm2m+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.lwm2m+tlv": {
    source: "iana"
  },
  "application/vnd.oma.pal+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.poc.detailed-progress-report+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.poc.final-report+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.poc.groups+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.poc.invocation-descriptor+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.poc.optimized-progress-report+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.push": {
    source: "iana"
  },
  "application/vnd.oma.scidm.messages+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oma.xcap-directory+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.omads-email+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/vnd.omads-file+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/vnd.omads-folder+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/vnd.omaloc-supl-init": {
    source: "iana"
  },
  "application/vnd.onepager": {
    source: "iana"
  },
  "application/vnd.onepagertamp": {
    source: "iana"
  },
  "application/vnd.onepagertamx": {
    source: "iana"
  },
  "application/vnd.onepagertat": {
    source: "iana"
  },
  "application/vnd.onepagertatp": {
    source: "iana"
  },
  "application/vnd.onepagertatx": {
    source: "iana"
  },
  "application/vnd.openblox.game+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "obgx"
    ]
  },
  "application/vnd.openblox.game-binary": {
    source: "iana"
  },
  "application/vnd.openeye.oeb": {
    source: "iana"
  },
  "application/vnd.openofficeorg.extension": {
    source: "apache",
    extensions: [
      "oxt"
    ]
  },
  "application/vnd.openstreetmap.data+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "osm"
    ]
  },
  "application/vnd.opentimestamps.ots": {
    source: "iana"
  },
  "application/vnd.openxmlformats-officedocument.custom-properties+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.customxmlproperties+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.drawing+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.extended-properties+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.comments+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    source: "iana",
    compressible: false,
    extensions: [
      "pptx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slide": {
    source: "iana",
    extensions: [
      "sldx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": {
    source: "iana",
    extensions: [
      "ppsx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.tags+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.template": {
    source: "iana",
    extensions: [
      "potx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    source: "iana",
    compressible: false,
    extensions: [
      "xlsx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": {
    source: "iana",
    extensions: [
      "xltx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.theme+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.themeoverride+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.vmldrawing": {
    source: "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    source: "iana",
    compressible: false,
    extensions: [
      "docx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": {
    source: "iana",
    extensions: [
      "dotx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-package.core-properties+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.openxmlformats-package.relationships+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oracle.resource+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.orange.indata": {
    source: "iana"
  },
  "application/vnd.osa.netdeploy": {
    source: "iana"
  },
  "application/vnd.osgeo.mapguide.package": {
    source: "iana",
    extensions: [
      "mgp"
    ]
  },
  "application/vnd.osgi.bundle": {
    source: "iana"
  },
  "application/vnd.osgi.dp": {
    source: "iana",
    extensions: [
      "dp"
    ]
  },
  "application/vnd.osgi.subsystem": {
    source: "iana",
    extensions: [
      "esa"
    ]
  },
  "application/vnd.otps.ct-kip+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.oxli.countgraph": {
    source: "iana"
  },
  "application/vnd.pagerduty+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.palm": {
    source: "iana",
    extensions: [
      "pdb",
      "pqa",
      "oprc"
    ]
  },
  "application/vnd.panoply": {
    source: "iana"
  },
  "application/vnd.paos.xml": {
    source: "iana"
  },
  "application/vnd.patentdive": {
    source: "iana"
  },
  "application/vnd.patientecommsdoc": {
    source: "iana"
  },
  "application/vnd.pawaafile": {
    source: "iana",
    extensions: [
      "paw"
    ]
  },
  "application/vnd.pcos": {
    source: "iana"
  },
  "application/vnd.pg.format": {
    source: "iana",
    extensions: [
      "str"
    ]
  },
  "application/vnd.pg.osasli": {
    source: "iana",
    extensions: [
      "ei6"
    ]
  },
  "application/vnd.piaccess.application-licence": {
    source: "iana"
  },
  "application/vnd.picsel": {
    source: "iana",
    extensions: [
      "efif"
    ]
  },
  "application/vnd.pmi.widget": {
    source: "iana",
    extensions: [
      "wg"
    ]
  },
  "application/vnd.poc.group-advertisement+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.pocketlearn": {
    source: "iana",
    extensions: [
      "plf"
    ]
  },
  "application/vnd.powerbuilder6": {
    source: "iana",
    extensions: [
      "pbd"
    ]
  },
  "application/vnd.powerbuilder6-s": {
    source: "iana"
  },
  "application/vnd.powerbuilder7": {
    source: "iana"
  },
  "application/vnd.powerbuilder7-s": {
    source: "iana"
  },
  "application/vnd.powerbuilder75": {
    source: "iana"
  },
  "application/vnd.powerbuilder75-s": {
    source: "iana"
  },
  "application/vnd.preminet": {
    source: "iana"
  },
  "application/vnd.previewsystems.box": {
    source: "iana",
    extensions: [
      "box"
    ]
  },
  "application/vnd.proteus.magazine": {
    source: "iana",
    extensions: [
      "mgz"
    ]
  },
  "application/vnd.psfs": {
    source: "iana"
  },
  "application/vnd.publishare-delta-tree": {
    source: "iana",
    extensions: [
      "qps"
    ]
  },
  "application/vnd.pvi.ptid1": {
    source: "iana",
    extensions: [
      "ptid"
    ]
  },
  "application/vnd.pwg-multiplexed": {
    source: "iana"
  },
  "application/vnd.pwg-xhtml-print+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.qualcomm.brew-app-res": {
    source: "iana"
  },
  "application/vnd.quarantainenet": {
    source: "iana"
  },
  "application/vnd.quark.quarkxpress": {
    source: "iana",
    extensions: [
      "qxd",
      "qxt",
      "qwd",
      "qwt",
      "qxl",
      "qxb"
    ]
  },
  "application/vnd.quobject-quoxdocument": {
    source: "iana"
  },
  "application/vnd.radisys.moml+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-audit+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-audit-conf+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-audit-conn+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-audit-dialog+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-audit-stream+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-conf+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-dialog+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-dialog-base+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-dialog-fax-detect+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-dialog-fax-sendrecv+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-dialog-group+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-dialog-speech+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.radisys.msml-dialog-transform+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.rainstor.data": {
    source: "iana"
  },
  "application/vnd.rapid": {
    source: "iana"
  },
  "application/vnd.rar": {
    source: "iana",
    extensions: [
      "rar"
    ]
  },
  "application/vnd.realvnc.bed": {
    source: "iana",
    extensions: [
      "bed"
    ]
  },
  "application/vnd.recordare.musicxml": {
    source: "iana",
    extensions: [
      "mxl"
    ]
  },
  "application/vnd.recordare.musicxml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "musicxml"
    ]
  },
  "application/vnd.renlearn.rlprint": {
    source: "iana"
  },
  "application/vnd.resilient.logic": {
    source: "iana"
  },
  "application/vnd.restful+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.rig.cryptonote": {
    source: "iana",
    extensions: [
      "cryptonote"
    ]
  },
  "application/vnd.rim.cod": {
    source: "apache",
    extensions: [
      "cod"
    ]
  },
  "application/vnd.rn-realmedia": {
    source: "apache",
    extensions: [
      "rm"
    ]
  },
  "application/vnd.rn-realmedia-vbr": {
    source: "apache",
    extensions: [
      "rmvb"
    ]
  },
  "application/vnd.route66.link66+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "link66"
    ]
  },
  "application/vnd.rs-274x": {
    source: "iana"
  },
  "application/vnd.ruckus.download": {
    source: "iana"
  },
  "application/vnd.s3sms": {
    source: "iana"
  },
  "application/vnd.sailingtracker.track": {
    source: "iana",
    extensions: [
      "st"
    ]
  },
  "application/vnd.sar": {
    source: "iana"
  },
  "application/vnd.sbm.cid": {
    source: "iana"
  },
  "application/vnd.sbm.mid2": {
    source: "iana"
  },
  "application/vnd.scribus": {
    source: "iana"
  },
  "application/vnd.sealed.3df": {
    source: "iana"
  },
  "application/vnd.sealed.csf": {
    source: "iana"
  },
  "application/vnd.sealed.doc": {
    source: "iana"
  },
  "application/vnd.sealed.eml": {
    source: "iana"
  },
  "application/vnd.sealed.mht": {
    source: "iana"
  },
  "application/vnd.sealed.net": {
    source: "iana"
  },
  "application/vnd.sealed.ppt": {
    source: "iana"
  },
  "application/vnd.sealed.tiff": {
    source: "iana"
  },
  "application/vnd.sealed.xls": {
    source: "iana"
  },
  "application/vnd.sealedmedia.softseal.html": {
    source: "iana"
  },
  "application/vnd.sealedmedia.softseal.pdf": {
    source: "iana"
  },
  "application/vnd.seemail": {
    source: "iana",
    extensions: [
      "see"
    ]
  },
  "application/vnd.seis+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.sema": {
    source: "iana",
    extensions: [
      "sema"
    ]
  },
  "application/vnd.semd": {
    source: "iana",
    extensions: [
      "semd"
    ]
  },
  "application/vnd.semf": {
    source: "iana",
    extensions: [
      "semf"
    ]
  },
  "application/vnd.shade-save-file": {
    source: "iana"
  },
  "application/vnd.shana.informed.formdata": {
    source: "iana",
    extensions: [
      "ifm"
    ]
  },
  "application/vnd.shana.informed.formtemplate": {
    source: "iana",
    extensions: [
      "itp"
    ]
  },
  "application/vnd.shana.informed.interchange": {
    source: "iana",
    extensions: [
      "iif"
    ]
  },
  "application/vnd.shana.informed.package": {
    source: "iana",
    extensions: [
      "ipk"
    ]
  },
  "application/vnd.shootproof+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.shopkick+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.shp": {
    source: "iana"
  },
  "application/vnd.shx": {
    source: "iana"
  },
  "application/vnd.sigrok.session": {
    source: "iana"
  },
  "application/vnd.simtech-mindmapper": {
    source: "iana",
    extensions: [
      "twd",
      "twds"
    ]
  },
  "application/vnd.siren+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.smaf": {
    source: "iana",
    extensions: [
      "mmf"
    ]
  },
  "application/vnd.smart.notebook": {
    source: "iana"
  },
  "application/vnd.smart.teacher": {
    source: "iana",
    extensions: [
      "teacher"
    ]
  },
  "application/vnd.snesdev-page-table": {
    source: "iana"
  },
  "application/vnd.software602.filler.form+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "fo"
    ]
  },
  "application/vnd.software602.filler.form-xml-zip": {
    source: "iana"
  },
  "application/vnd.solent.sdkm+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "sdkm",
      "sdkd"
    ]
  },
  "application/vnd.spotfire.dxp": {
    source: "iana",
    extensions: [
      "dxp"
    ]
  },
  "application/vnd.spotfire.sfs": {
    source: "iana",
    extensions: [
      "sfs"
    ]
  },
  "application/vnd.sqlite3": {
    source: "iana"
  },
  "application/vnd.sss-cod": {
    source: "iana"
  },
  "application/vnd.sss-dtf": {
    source: "iana"
  },
  "application/vnd.sss-ntf": {
    source: "iana"
  },
  "application/vnd.stardivision.calc": {
    source: "apache",
    extensions: [
      "sdc"
    ]
  },
  "application/vnd.stardivision.draw": {
    source: "apache",
    extensions: [
      "sda"
    ]
  },
  "application/vnd.stardivision.impress": {
    source: "apache",
    extensions: [
      "sdd"
    ]
  },
  "application/vnd.stardivision.math": {
    source: "apache",
    extensions: [
      "smf"
    ]
  },
  "application/vnd.stardivision.writer": {
    source: "apache",
    extensions: [
      "sdw",
      "vor"
    ]
  },
  "application/vnd.stardivision.writer-global": {
    source: "apache",
    extensions: [
      "sgl"
    ]
  },
  "application/vnd.stepmania.package": {
    source: "iana",
    extensions: [
      "smzip"
    ]
  },
  "application/vnd.stepmania.stepchart": {
    source: "iana",
    extensions: [
      "sm"
    ]
  },
  "application/vnd.street-stream": {
    source: "iana"
  },
  "application/vnd.sun.wadl+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "wadl"
    ]
  },
  "application/vnd.sun.xml.calc": {
    source: "apache",
    extensions: [
      "sxc"
    ]
  },
  "application/vnd.sun.xml.calc.template": {
    source: "apache",
    extensions: [
      "stc"
    ]
  },
  "application/vnd.sun.xml.draw": {
    source: "apache",
    extensions: [
      "sxd"
    ]
  },
  "application/vnd.sun.xml.draw.template": {
    source: "apache",
    extensions: [
      "std"
    ]
  },
  "application/vnd.sun.xml.impress": {
    source: "apache",
    extensions: [
      "sxi"
    ]
  },
  "application/vnd.sun.xml.impress.template": {
    source: "apache",
    extensions: [
      "sti"
    ]
  },
  "application/vnd.sun.xml.math": {
    source: "apache",
    extensions: [
      "sxm"
    ]
  },
  "application/vnd.sun.xml.writer": {
    source: "apache",
    extensions: [
      "sxw"
    ]
  },
  "application/vnd.sun.xml.writer.global": {
    source: "apache",
    extensions: [
      "sxg"
    ]
  },
  "application/vnd.sun.xml.writer.template": {
    source: "apache",
    extensions: [
      "stw"
    ]
  },
  "application/vnd.sus-calendar": {
    source: "iana",
    extensions: [
      "sus",
      "susp"
    ]
  },
  "application/vnd.svd": {
    source: "iana",
    extensions: [
      "svd"
    ]
  },
  "application/vnd.swiftview-ics": {
    source: "iana"
  },
  "application/vnd.sycle+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.syft+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.symbian.install": {
    source: "apache",
    extensions: [
      "sis",
      "sisx"
    ]
  },
  "application/vnd.syncml+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true,
    extensions: [
      "xsm"
    ]
  },
  "application/vnd.syncml.dm+wbxml": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "bdm"
    ]
  },
  "application/vnd.syncml.dm+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true,
    extensions: [
      "xdm"
    ]
  },
  "application/vnd.syncml.dm.notification": {
    source: "iana"
  },
  "application/vnd.syncml.dmddf+wbxml": {
    source: "iana"
  },
  "application/vnd.syncml.dmddf+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true,
    extensions: [
      "ddf"
    ]
  },
  "application/vnd.syncml.dmtnds+wbxml": {
    source: "iana"
  },
  "application/vnd.syncml.dmtnds+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: true
  },
  "application/vnd.syncml.ds.notification": {
    source: "iana"
  },
  "application/vnd.tableschema+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.tao.intent-module-archive": {
    source: "iana",
    extensions: [
      "tao"
    ]
  },
  "application/vnd.tcpdump.pcap": {
    source: "iana",
    extensions: [
      "pcap",
      "cap",
      "dmp"
    ]
  },
  "application/vnd.think-cell.ppttc+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.tmd.mediaflex.api+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.tml": {
    source: "iana"
  },
  "application/vnd.tmobile-livetv": {
    source: "iana",
    extensions: [
      "tmo"
    ]
  },
  "application/vnd.tri.onesource": {
    source: "iana"
  },
  "application/vnd.trid.tpt": {
    source: "iana",
    extensions: [
      "tpt"
    ]
  },
  "application/vnd.triscape.mxs": {
    source: "iana",
    extensions: [
      "mxs"
    ]
  },
  "application/vnd.trueapp": {
    source: "iana",
    extensions: [
      "tra"
    ]
  },
  "application/vnd.truedoc": {
    source: "iana"
  },
  "application/vnd.ubisoft.webplayer": {
    source: "iana"
  },
  "application/vnd.ufdl": {
    source: "iana",
    extensions: [
      "ufd",
      "ufdl"
    ]
  },
  "application/vnd.uiq.theme": {
    source: "iana",
    extensions: [
      "utz"
    ]
  },
  "application/vnd.umajin": {
    source: "iana",
    extensions: [
      "umj"
    ]
  },
  "application/vnd.unity": {
    source: "iana",
    extensions: [
      "unityweb"
    ]
  },
  "application/vnd.uoml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "uoml"
    ]
  },
  "application/vnd.uplanet.alert": {
    source: "iana"
  },
  "application/vnd.uplanet.alert-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.bearer-choice": {
    source: "iana"
  },
  "application/vnd.uplanet.bearer-choice-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.cacheop": {
    source: "iana"
  },
  "application/vnd.uplanet.cacheop-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.channel": {
    source: "iana"
  },
  "application/vnd.uplanet.channel-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.list": {
    source: "iana"
  },
  "application/vnd.uplanet.list-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.listcmd": {
    source: "iana"
  },
  "application/vnd.uplanet.listcmd-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.signal": {
    source: "iana"
  },
  "application/vnd.uri-map": {
    source: "iana"
  },
  "application/vnd.valve.source.material": {
    source: "iana"
  },
  "application/vnd.vcx": {
    source: "iana",
    extensions: [
      "vcx"
    ]
  },
  "application/vnd.vd-study": {
    source: "iana"
  },
  "application/vnd.vectorworks": {
    source: "iana"
  },
  "application/vnd.vel+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.verimatrix.vcas": {
    source: "iana"
  },
  "application/vnd.veritone.aion+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.veryant.thin": {
    source: "iana"
  },
  "application/vnd.ves.encrypted": {
    source: "iana"
  },
  "application/vnd.vidsoft.vidconference": {
    source: "iana"
  },
  "application/vnd.visio": {
    source: "iana",
    extensions: [
      "vsd",
      "vst",
      "vss",
      "vsw"
    ]
  },
  "application/vnd.visionary": {
    source: "iana",
    extensions: [
      "vis"
    ]
  },
  "application/vnd.vividence.scriptfile": {
    source: "iana"
  },
  "application/vnd.vsf": {
    source: "iana",
    extensions: [
      "vsf"
    ]
  },
  "application/vnd.wap.sic": {
    source: "iana"
  },
  "application/vnd.wap.slc": {
    source: "iana"
  },
  "application/vnd.wap.wbxml": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "wbxml"
    ]
  },
  "application/vnd.wap.wmlc": {
    source: "iana",
    extensions: [
      "wmlc"
    ]
  },
  "application/vnd.wap.wmlscriptc": {
    source: "iana",
    extensions: [
      "wmlsc"
    ]
  },
  "application/vnd.webturbo": {
    source: "iana",
    extensions: [
      "wtb"
    ]
  },
  "application/vnd.wfa.dpp": {
    source: "iana"
  },
  "application/vnd.wfa.p2p": {
    source: "iana"
  },
  "application/vnd.wfa.wsc": {
    source: "iana"
  },
  "application/vnd.windows.devicepairing": {
    source: "iana"
  },
  "application/vnd.wmc": {
    source: "iana"
  },
  "application/vnd.wmf.bootstrap": {
    source: "iana"
  },
  "application/vnd.wolfram.mathematica": {
    source: "iana"
  },
  "application/vnd.wolfram.mathematica.package": {
    source: "iana"
  },
  "application/vnd.wolfram.player": {
    source: "iana",
    extensions: [
      "nbp"
    ]
  },
  "application/vnd.wordperfect": {
    source: "iana",
    extensions: [
      "wpd"
    ]
  },
  "application/vnd.wqd": {
    source: "iana",
    extensions: [
      "wqd"
    ]
  },
  "application/vnd.wrq-hp3000-labelled": {
    source: "iana"
  },
  "application/vnd.wt.stf": {
    source: "iana",
    extensions: [
      "stf"
    ]
  },
  "application/vnd.wv.csp+wbxml": {
    source: "iana"
  },
  "application/vnd.wv.csp+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.wv.ssp+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.xacml+json": {
    source: "iana",
    compressible: true
  },
  "application/vnd.xara": {
    source: "iana",
    extensions: [
      "xar"
    ]
  },
  "application/vnd.xfdl": {
    source: "iana",
    extensions: [
      "xfdl"
    ]
  },
  "application/vnd.xfdl.webform": {
    source: "iana"
  },
  "application/vnd.xmi+xml": {
    source: "iana",
    compressible: true
  },
  "application/vnd.xmpie.cpkg": {
    source: "iana"
  },
  "application/vnd.xmpie.dpkg": {
    source: "iana"
  },
  "application/vnd.xmpie.plan": {
    source: "iana"
  },
  "application/vnd.xmpie.ppkg": {
    source: "iana"
  },
  "application/vnd.xmpie.xlim": {
    source: "iana"
  },
  "application/vnd.yamaha.hv-dic": {
    source: "iana",
    extensions: [
      "hvd"
    ]
  },
  "application/vnd.yamaha.hv-script": {
    source: "iana",
    extensions: [
      "hvs"
    ]
  },
  "application/vnd.yamaha.hv-voice": {
    source: "iana",
    extensions: [
      "hvp"
    ]
  },
  "application/vnd.yamaha.openscoreformat": {
    source: "iana",
    extensions: [
      "osf"
    ]
  },
  "application/vnd.yamaha.openscoreformat.osfpvg+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "osfpvg"
    ]
  },
  "application/vnd.yamaha.remote-setup": {
    source: "iana"
  },
  "application/vnd.yamaha.smaf-audio": {
    source: "iana",
    extensions: [
      "saf"
    ]
  },
  "application/vnd.yamaha.smaf-phrase": {
    source: "iana",
    extensions: [
      "spf"
    ]
  },
  "application/vnd.yamaha.through-ngn": {
    source: "iana"
  },
  "application/vnd.yamaha.tunnel-udpencap": {
    source: "iana"
  },
  "application/vnd.yaoweme": {
    source: "iana"
  },
  "application/vnd.yellowriver-custom-menu": {
    source: "iana",
    extensions: [
      "cmp"
    ]
  },
  "application/vnd.youtube.yt": {
    source: "iana"
  },
  "application/vnd.zul": {
    source: "iana",
    extensions: [
      "zir",
      "zirz"
    ]
  },
  "application/vnd.zzazz.deck+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "zaz"
    ]
  },
  "application/voicexml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "vxml"
    ]
  },
  "application/voucher-cms+json": {
    source: "iana",
    compressible: true
  },
  "application/vq-rtcpxr": {
    source: "iana"
  },
  "application/wasm": {
    source: "iana",
    compressible: true,
    extensions: [
      "wasm"
    ]
  },
  "application/watcherinfo+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "wif"
    ]
  },
  "application/webpush-options+json": {
    source: "iana",
    compressible: true
  },
  "application/whoispp-query": {
    source: "iana"
  },
  "application/whoispp-response": {
    source: "iana"
  },
  "application/widget": {
    source: "iana",
    extensions: [
      "wgt"
    ]
  },
  "application/winhlp": {
    source: "apache",
    extensions: [
      "hlp"
    ]
  },
  "application/wita": {
    source: "iana"
  },
  "application/wordperfect5.1": {
    source: "iana"
  },
  "application/wsdl+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "wsdl"
    ]
  },
  "application/wspolicy+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "wspolicy"
    ]
  },
  "application/x-7z-compressed": {
    source: "apache",
    compressible: false,
    extensions: [
      "7z"
    ]
  },
  "application/x-abiword": {
    source: "apache",
    extensions: [
      "abw"
    ]
  },
  "application/x-ace-compressed": {
    source: "apache",
    extensions: [
      "ace"
    ]
  },
  "application/x-amf": {
    source: "apache"
  },
  "application/x-apple-diskimage": {
    source: "apache",
    extensions: [
      "dmg"
    ]
  },
  "application/x-arj": {
    compressible: false,
    extensions: [
      "arj"
    ]
  },
  "application/x-authorware-bin": {
    source: "apache",
    extensions: [
      "aab",
      "x32",
      "u32",
      "vox"
    ]
  },
  "application/x-authorware-map": {
    source: "apache",
    extensions: [
      "aam"
    ]
  },
  "application/x-authorware-seg": {
    source: "apache",
    extensions: [
      "aas"
    ]
  },
  "application/x-bcpio": {
    source: "apache",
    extensions: [
      "bcpio"
    ]
  },
  "application/x-bdoc": {
    compressible: false,
    extensions: [
      "bdoc"
    ]
  },
  "application/x-bittorrent": {
    source: "apache",
    extensions: [
      "torrent"
    ]
  },
  "application/x-blorb": {
    source: "apache",
    extensions: [
      "blb",
      "blorb"
    ]
  },
  "application/x-bzip": {
    source: "apache",
    compressible: false,
    extensions: [
      "bz"
    ]
  },
  "application/x-bzip2": {
    source: "apache",
    compressible: false,
    extensions: [
      "bz2",
      "boz"
    ]
  },
  "application/x-cbr": {
    source: "apache",
    extensions: [
      "cbr",
      "cba",
      "cbt",
      "cbz",
      "cb7"
    ]
  },
  "application/x-cdlink": {
    source: "apache",
    extensions: [
      "vcd"
    ]
  },
  "application/x-cfs-compressed": {
    source: "apache",
    extensions: [
      "cfs"
    ]
  },
  "application/x-chat": {
    source: "apache",
    extensions: [
      "chat"
    ]
  },
  "application/x-chess-pgn": {
    source: "apache",
    extensions: [
      "pgn"
    ]
  },
  "application/x-chrome-extension": {
    extensions: [
      "crx"
    ]
  },
  "application/x-cocoa": {
    source: "nginx",
    extensions: [
      "cco"
    ]
  },
  "application/x-compress": {
    source: "apache"
  },
  "application/x-conference": {
    source: "apache",
    extensions: [
      "nsc"
    ]
  },
  "application/x-cpio": {
    source: "apache",
    extensions: [
      "cpio"
    ]
  },
  "application/x-csh": {
    source: "apache",
    extensions: [
      "csh"
    ]
  },
  "application/x-deb": {
    compressible: false
  },
  "application/x-debian-package": {
    source: "apache",
    extensions: [
      "deb",
      "udeb"
    ]
  },
  "application/x-dgc-compressed": {
    source: "apache",
    extensions: [
      "dgc"
    ]
  },
  "application/x-director": {
    source: "apache",
    extensions: [
      "dir",
      "dcr",
      "dxr",
      "cst",
      "cct",
      "cxt",
      "w3d",
      "fgd",
      "swa"
    ]
  },
  "application/x-doom": {
    source: "apache",
    extensions: [
      "wad"
    ]
  },
  "application/x-dtbncx+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "ncx"
    ]
  },
  "application/x-dtbook+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "dtb"
    ]
  },
  "application/x-dtbresource+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "res"
    ]
  },
  "application/x-dvi": {
    source: "apache",
    compressible: false,
    extensions: [
      "dvi"
    ]
  },
  "application/x-envoy": {
    source: "apache",
    extensions: [
      "evy"
    ]
  },
  "application/x-eva": {
    source: "apache",
    extensions: [
      "eva"
    ]
  },
  "application/x-font-bdf": {
    source: "apache",
    extensions: [
      "bdf"
    ]
  },
  "application/x-font-dos": {
    source: "apache"
  },
  "application/x-font-framemaker": {
    source: "apache"
  },
  "application/x-font-ghostscript": {
    source: "apache",
    extensions: [
      "gsf"
    ]
  },
  "application/x-font-libgrx": {
    source: "apache"
  },
  "application/x-font-linux-psf": {
    source: "apache",
    extensions: [
      "psf"
    ]
  },
  "application/x-font-pcf": {
    source: "apache",
    extensions: [
      "pcf"
    ]
  },
  "application/x-font-snf": {
    source: "apache",
    extensions: [
      "snf"
    ]
  },
  "application/x-font-speedo": {
    source: "apache"
  },
  "application/x-font-sunos-news": {
    source: "apache"
  },
  "application/x-font-type1": {
    source: "apache",
    extensions: [
      "pfa",
      "pfb",
      "pfm",
      "afm"
    ]
  },
  "application/x-font-vfont": {
    source: "apache"
  },
  "application/x-freearc": {
    source: "apache",
    extensions: [
      "arc"
    ]
  },
  "application/x-futuresplash": {
    source: "apache",
    extensions: [
      "spl"
    ]
  },
  "application/x-gca-compressed": {
    source: "apache",
    extensions: [
      "gca"
    ]
  },
  "application/x-glulx": {
    source: "apache",
    extensions: [
      "ulx"
    ]
  },
  "application/x-gnumeric": {
    source: "apache",
    extensions: [
      "gnumeric"
    ]
  },
  "application/x-gramps-xml": {
    source: "apache",
    extensions: [
      "gramps"
    ]
  },
  "application/x-gtar": {
    source: "apache",
    extensions: [
      "gtar"
    ]
  },
  "application/x-gzip": {
    source: "apache"
  },
  "application/x-hdf": {
    source: "apache",
    extensions: [
      "hdf"
    ]
  },
  "application/x-httpd-php": {
    compressible: true,
    extensions: [
      "php"
    ]
  },
  "application/x-install-instructions": {
    source: "apache",
    extensions: [
      "install"
    ]
  },
  "application/x-iso9660-image": {
    source: "apache",
    extensions: [
      "iso"
    ]
  },
  "application/x-iwork-keynote-sffkey": {
    extensions: [
      "key"
    ]
  },
  "application/x-iwork-numbers-sffnumbers": {
    extensions: [
      "numbers"
    ]
  },
  "application/x-iwork-pages-sffpages": {
    extensions: [
      "pages"
    ]
  },
  "application/x-java-archive-diff": {
    source: "nginx",
    extensions: [
      "jardiff"
    ]
  },
  "application/x-java-jnlp-file": {
    source: "apache",
    compressible: false,
    extensions: [
      "jnlp"
    ]
  },
  "application/x-javascript": {
    compressible: true
  },
  "application/x-keepass2": {
    extensions: [
      "kdbx"
    ]
  },
  "application/x-latex": {
    source: "apache",
    compressible: false,
    extensions: [
      "latex"
    ]
  },
  "application/x-lua-bytecode": {
    extensions: [
      "luac"
    ]
  },
  "application/x-lzh-compressed": {
    source: "apache",
    extensions: [
      "lzh",
      "lha"
    ]
  },
  "application/x-makeself": {
    source: "nginx",
    extensions: [
      "run"
    ]
  },
  "application/x-mie": {
    source: "apache",
    extensions: [
      "mie"
    ]
  },
  "application/x-mobipocket-ebook": {
    source: "apache",
    extensions: [
      "prc",
      "mobi"
    ]
  },
  "application/x-mpegurl": {
    compressible: false
  },
  "application/x-ms-application": {
    source: "apache",
    extensions: [
      "application"
    ]
  },
  "application/x-ms-shortcut": {
    source: "apache",
    extensions: [
      "lnk"
    ]
  },
  "application/x-ms-wmd": {
    source: "apache",
    extensions: [
      "wmd"
    ]
  },
  "application/x-ms-wmz": {
    source: "apache",
    extensions: [
      "wmz"
    ]
  },
  "application/x-ms-xbap": {
    source: "apache",
    extensions: [
      "xbap"
    ]
  },
  "application/x-msaccess": {
    source: "apache",
    extensions: [
      "mdb"
    ]
  },
  "application/x-msbinder": {
    source: "apache",
    extensions: [
      "obd"
    ]
  },
  "application/x-mscardfile": {
    source: "apache",
    extensions: [
      "crd"
    ]
  },
  "application/x-msclip": {
    source: "apache",
    extensions: [
      "clp"
    ]
  },
  "application/x-msdos-program": {
    extensions: [
      "exe"
    ]
  },
  "application/x-msdownload": {
    source: "apache",
    extensions: [
      "exe",
      "dll",
      "com",
      "bat",
      "msi"
    ]
  },
  "application/x-msmediaview": {
    source: "apache",
    extensions: [
      "mvb",
      "m13",
      "m14"
    ]
  },
  "application/x-msmetafile": {
    source: "apache",
    extensions: [
      "wmf",
      "wmz",
      "emf",
      "emz"
    ]
  },
  "application/x-msmoney": {
    source: "apache",
    extensions: [
      "mny"
    ]
  },
  "application/x-mspublisher": {
    source: "apache",
    extensions: [
      "pub"
    ]
  },
  "application/x-msschedule": {
    source: "apache",
    extensions: [
      "scd"
    ]
  },
  "application/x-msterminal": {
    source: "apache",
    extensions: [
      "trm"
    ]
  },
  "application/x-mswrite": {
    source: "apache",
    extensions: [
      "wri"
    ]
  },
  "application/x-netcdf": {
    source: "apache",
    extensions: [
      "nc",
      "cdf"
    ]
  },
  "application/x-ns-proxy-autoconfig": {
    compressible: true,
    extensions: [
      "pac"
    ]
  },
  "application/x-nzb": {
    source: "apache",
    extensions: [
      "nzb"
    ]
  },
  "application/x-perl": {
    source: "nginx",
    extensions: [
      "pl",
      "pm"
    ]
  },
  "application/x-pilot": {
    source: "nginx",
    extensions: [
      "prc",
      "pdb"
    ]
  },
  "application/x-pkcs12": {
    source: "apache",
    compressible: false,
    extensions: [
      "p12",
      "pfx"
    ]
  },
  "application/x-pkcs7-certificates": {
    source: "apache",
    extensions: [
      "p7b",
      "spc"
    ]
  },
  "application/x-pkcs7-certreqresp": {
    source: "apache",
    extensions: [
      "p7r"
    ]
  },
  "application/x-pki-message": {
    source: "iana"
  },
  "application/x-rar-compressed": {
    source: "apache",
    compressible: false,
    extensions: [
      "rar"
    ]
  },
  "application/x-redhat-package-manager": {
    source: "nginx",
    extensions: [
      "rpm"
    ]
  },
  "application/x-research-info-systems": {
    source: "apache",
    extensions: [
      "ris"
    ]
  },
  "application/x-sea": {
    source: "nginx",
    extensions: [
      "sea"
    ]
  },
  "application/x-sh": {
    source: "apache",
    compressible: true,
    extensions: [
      "sh"
    ]
  },
  "application/x-shar": {
    source: "apache",
    extensions: [
      "shar"
    ]
  },
  "application/x-shockwave-flash": {
    source: "apache",
    compressible: false,
    extensions: [
      "swf"
    ]
  },
  "application/x-silverlight-app": {
    source: "apache",
    extensions: [
      "xap"
    ]
  },
  "application/x-sql": {
    source: "apache",
    extensions: [
      "sql"
    ]
  },
  "application/x-stuffit": {
    source: "apache",
    compressible: false,
    extensions: [
      "sit"
    ]
  },
  "application/x-stuffitx": {
    source: "apache",
    extensions: [
      "sitx"
    ]
  },
  "application/x-subrip": {
    source: "apache",
    extensions: [
      "srt"
    ]
  },
  "application/x-sv4cpio": {
    source: "apache",
    extensions: [
      "sv4cpio"
    ]
  },
  "application/x-sv4crc": {
    source: "apache",
    extensions: [
      "sv4crc"
    ]
  },
  "application/x-t3vm-image": {
    source: "apache",
    extensions: [
      "t3"
    ]
  },
  "application/x-tads": {
    source: "apache",
    extensions: [
      "gam"
    ]
  },
  "application/x-tar": {
    source: "apache",
    compressible: true,
    extensions: [
      "tar"
    ]
  },
  "application/x-tcl": {
    source: "apache",
    extensions: [
      "tcl",
      "tk"
    ]
  },
  "application/x-tex": {
    source: "apache",
    extensions: [
      "tex"
    ]
  },
  "application/x-tex-tfm": {
    source: "apache",
    extensions: [
      "tfm"
    ]
  },
  "application/x-texinfo": {
    source: "apache",
    extensions: [
      "texinfo",
      "texi"
    ]
  },
  "application/x-tgif": {
    source: "apache",
    extensions: [
      "obj"
    ]
  },
  "application/x-ustar": {
    source: "apache",
    extensions: [
      "ustar"
    ]
  },
  "application/x-virtualbox-hdd": {
    compressible: true,
    extensions: [
      "hdd"
    ]
  },
  "application/x-virtualbox-ova": {
    compressible: true,
    extensions: [
      "ova"
    ]
  },
  "application/x-virtualbox-ovf": {
    compressible: true,
    extensions: [
      "ovf"
    ]
  },
  "application/x-virtualbox-vbox": {
    compressible: true,
    extensions: [
      "vbox"
    ]
  },
  "application/x-virtualbox-vbox-extpack": {
    compressible: false,
    extensions: [
      "vbox-extpack"
    ]
  },
  "application/x-virtualbox-vdi": {
    compressible: true,
    extensions: [
      "vdi"
    ]
  },
  "application/x-virtualbox-vhd": {
    compressible: true,
    extensions: [
      "vhd"
    ]
  },
  "application/x-virtualbox-vmdk": {
    compressible: true,
    extensions: [
      "vmdk"
    ]
  },
  "application/x-wais-source": {
    source: "apache",
    extensions: [
      "src"
    ]
  },
  "application/x-web-app-manifest+json": {
    compressible: true,
    extensions: [
      "webapp"
    ]
  },
  "application/x-www-form-urlencoded": {
    source: "iana",
    compressible: true
  },
  "application/x-x509-ca-cert": {
    source: "iana",
    extensions: [
      "der",
      "crt",
      "pem"
    ]
  },
  "application/x-x509-ca-ra-cert": {
    source: "iana"
  },
  "application/x-x509-next-ca-cert": {
    source: "iana"
  },
  "application/x-xfig": {
    source: "apache",
    extensions: [
      "fig"
    ]
  },
  "application/x-xliff+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "xlf"
    ]
  },
  "application/x-xpinstall": {
    source: "apache",
    compressible: false,
    extensions: [
      "xpi"
    ]
  },
  "application/x-xz": {
    source: "apache",
    extensions: [
      "xz"
    ]
  },
  "application/x-zmachine": {
    source: "apache",
    extensions: [
      "z1",
      "z2",
      "z3",
      "z4",
      "z5",
      "z6",
      "z7",
      "z8"
    ]
  },
  "application/x400-bp": {
    source: "iana"
  },
  "application/xacml+xml": {
    source: "iana",
    compressible: true
  },
  "application/xaml+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "xaml"
    ]
  },
  "application/xcap-att+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xav"
    ]
  },
  "application/xcap-caps+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xca"
    ]
  },
  "application/xcap-diff+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xdf"
    ]
  },
  "application/xcap-el+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xel"
    ]
  },
  "application/xcap-error+xml": {
    source: "iana",
    compressible: true
  },
  "application/xcap-ns+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xns"
    ]
  },
  "application/xcon-conference-info+xml": {
    source: "iana",
    compressible: true
  },
  "application/xcon-conference-info-diff+xml": {
    source: "iana",
    compressible: true
  },
  "application/xenc+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xenc"
    ]
  },
  "application/xhtml+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xhtml",
      "xht"
    ]
  },
  "application/xhtml-voice+xml": {
    source: "apache",
    compressible: true
  },
  "application/xliff+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xlf"
    ]
  },
  "application/xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xml",
      "xsl",
      "xsd",
      "rng"
    ]
  },
  "application/xml-dtd": {
    source: "iana",
    compressible: true,
    extensions: [
      "dtd"
    ]
  },
  "application/xml-external-parsed-entity": {
    source: "iana"
  },
  "application/xml-patch+xml": {
    source: "iana",
    compressible: true
  },
  "application/xmpp+xml": {
    source: "iana",
    compressible: true
  },
  "application/xop+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xop"
    ]
  },
  "application/xproc+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "xpl"
    ]
  },
  "application/xslt+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xsl",
      "xslt"
    ]
  },
  "application/xspf+xml": {
    source: "apache",
    compressible: true,
    extensions: [
      "xspf"
    ]
  },
  "application/xv+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "mxml",
      "xhvml",
      "xvml",
      "xvm"
    ]
  },
  "application/yang": {
    source: "iana",
    extensions: [
      "yang"
    ]
  },
  "application/yang-data+json": {
    source: "iana",
    compressible: true
  },
  "application/yang-data+xml": {
    source: "iana",
    compressible: true
  },
  "application/yang-patch+json": {
    source: "iana",
    compressible: true
  },
  "application/yang-patch+xml": {
    source: "iana",
    compressible: true
  },
  "application/yin+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "yin"
    ]
  },
  "application/zip": {
    source: "iana",
    compressible: false,
    extensions: [
      "zip"
    ]
  },
  "application/zlib": {
    source: "iana"
  },
  "application/zstd": {
    source: "iana"
  },
  "audio/1d-interleaved-parityfec": {
    source: "iana"
  },
  "audio/32kadpcm": {
    source: "iana"
  },
  "audio/3gpp": {
    source: "iana",
    compressible: false,
    extensions: [
      "3gpp"
    ]
  },
  "audio/3gpp2": {
    source: "iana"
  },
  "audio/aac": {
    source: "iana"
  },
  "audio/ac3": {
    source: "iana"
  },
  "audio/adpcm": {
    source: "apache",
    extensions: [
      "adp"
    ]
  },
  "audio/amr": {
    source: "iana",
    extensions: [
      "amr"
    ]
  },
  "audio/amr-wb": {
    source: "iana"
  },
  "audio/amr-wb+": {
    source: "iana"
  },
  "audio/aptx": {
    source: "iana"
  },
  "audio/asc": {
    source: "iana"
  },
  "audio/atrac-advanced-lossless": {
    source: "iana"
  },
  "audio/atrac-x": {
    source: "iana"
  },
  "audio/atrac3": {
    source: "iana"
  },
  "audio/basic": {
    source: "iana",
    compressible: false,
    extensions: [
      "au",
      "snd"
    ]
  },
  "audio/bv16": {
    source: "iana"
  },
  "audio/bv32": {
    source: "iana"
  },
  "audio/clearmode": {
    source: "iana"
  },
  "audio/cn": {
    source: "iana"
  },
  "audio/dat12": {
    source: "iana"
  },
  "audio/dls": {
    source: "iana"
  },
  "audio/dsr-es201108": {
    source: "iana"
  },
  "audio/dsr-es202050": {
    source: "iana"
  },
  "audio/dsr-es202211": {
    source: "iana"
  },
  "audio/dsr-es202212": {
    source: "iana"
  },
  "audio/dv": {
    source: "iana"
  },
  "audio/dvi4": {
    source: "iana"
  },
  "audio/eac3": {
    source: "iana"
  },
  "audio/encaprtp": {
    source: "iana"
  },
  "audio/evrc": {
    source: "iana"
  },
  "audio/evrc-qcp": {
    source: "iana"
  },
  "audio/evrc0": {
    source: "iana"
  },
  "audio/evrc1": {
    source: "iana"
  },
  "audio/evrcb": {
    source: "iana"
  },
  "audio/evrcb0": {
    source: "iana"
  },
  "audio/evrcb1": {
    source: "iana"
  },
  "audio/evrcnw": {
    source: "iana"
  },
  "audio/evrcnw0": {
    source: "iana"
  },
  "audio/evrcnw1": {
    source: "iana"
  },
  "audio/evrcwb": {
    source: "iana"
  },
  "audio/evrcwb0": {
    source: "iana"
  },
  "audio/evrcwb1": {
    source: "iana"
  },
  "audio/evs": {
    source: "iana"
  },
  "audio/flexfec": {
    source: "iana"
  },
  "audio/fwdred": {
    source: "iana"
  },
  "audio/g711-0": {
    source: "iana"
  },
  "audio/g719": {
    source: "iana"
  },
  "audio/g722": {
    source: "iana"
  },
  "audio/g7221": {
    source: "iana"
  },
  "audio/g723": {
    source: "iana"
  },
  "audio/g726-16": {
    source: "iana"
  },
  "audio/g726-24": {
    source: "iana"
  },
  "audio/g726-32": {
    source: "iana"
  },
  "audio/g726-40": {
    source: "iana"
  },
  "audio/g728": {
    source: "iana"
  },
  "audio/g729": {
    source: "iana"
  },
  "audio/g7291": {
    source: "iana"
  },
  "audio/g729d": {
    source: "iana"
  },
  "audio/g729e": {
    source: "iana"
  },
  "audio/gsm": {
    source: "iana"
  },
  "audio/gsm-efr": {
    source: "iana"
  },
  "audio/gsm-hr-08": {
    source: "iana"
  },
  "audio/ilbc": {
    source: "iana"
  },
  "audio/ip-mr_v2.5": {
    source: "iana"
  },
  "audio/isac": {
    source: "apache"
  },
  "audio/l16": {
    source: "iana"
  },
  "audio/l20": {
    source: "iana"
  },
  "audio/l24": {
    source: "iana",
    compressible: false
  },
  "audio/l8": {
    source: "iana"
  },
  "audio/lpc": {
    source: "iana"
  },
  "audio/melp": {
    source: "iana"
  },
  "audio/melp1200": {
    source: "iana"
  },
  "audio/melp2400": {
    source: "iana"
  },
  "audio/melp600": {
    source: "iana"
  },
  "audio/mhas": {
    source: "iana"
  },
  "audio/midi": {
    source: "apache",
    extensions: [
      "mid",
      "midi",
      "kar",
      "rmi"
    ]
  },
  "audio/mobile-xmf": {
    source: "iana",
    extensions: [
      "mxmf"
    ]
  },
  "audio/mp3": {
    compressible: false,
    extensions: [
      "mp3"
    ]
  },
  "audio/mp4": {
    source: "iana",
    compressible: false,
    extensions: [
      "m4a",
      "mp4a"
    ]
  },
  "audio/mp4a-latm": {
    source: "iana"
  },
  "audio/mpa": {
    source: "iana"
  },
  "audio/mpa-robust": {
    source: "iana"
  },
  "audio/mpeg": {
    source: "iana",
    compressible: false,
    extensions: [
      "mpga",
      "mp2",
      "mp2a",
      "mp3",
      "m2a",
      "m3a"
    ]
  },
  "audio/mpeg4-generic": {
    source: "iana"
  },
  "audio/musepack": {
    source: "apache"
  },
  "audio/ogg": {
    source: "iana",
    compressible: false,
    extensions: [
      "oga",
      "ogg",
      "spx",
      "opus"
    ]
  },
  "audio/opus": {
    source: "iana"
  },
  "audio/parityfec": {
    source: "iana"
  },
  "audio/pcma": {
    source: "iana"
  },
  "audio/pcma-wb": {
    source: "iana"
  },
  "audio/pcmu": {
    source: "iana"
  },
  "audio/pcmu-wb": {
    source: "iana"
  },
  "audio/prs.sid": {
    source: "iana"
  },
  "audio/qcelp": {
    source: "iana"
  },
  "audio/raptorfec": {
    source: "iana"
  },
  "audio/red": {
    source: "iana"
  },
  "audio/rtp-enc-aescm128": {
    source: "iana"
  },
  "audio/rtp-midi": {
    source: "iana"
  },
  "audio/rtploopback": {
    source: "iana"
  },
  "audio/rtx": {
    source: "iana"
  },
  "audio/s3m": {
    source: "apache",
    extensions: [
      "s3m"
    ]
  },
  "audio/scip": {
    source: "iana"
  },
  "audio/silk": {
    source: "apache",
    extensions: [
      "sil"
    ]
  },
  "audio/smv": {
    source: "iana"
  },
  "audio/smv-qcp": {
    source: "iana"
  },
  "audio/smv0": {
    source: "iana"
  },
  "audio/sofa": {
    source: "iana"
  },
  "audio/sp-midi": {
    source: "iana"
  },
  "audio/speex": {
    source: "iana"
  },
  "audio/t140c": {
    source: "iana"
  },
  "audio/t38": {
    source: "iana"
  },
  "audio/telephone-event": {
    source: "iana"
  },
  "audio/tetra_acelp": {
    source: "iana"
  },
  "audio/tetra_acelp_bb": {
    source: "iana"
  },
  "audio/tone": {
    source: "iana"
  },
  "audio/tsvcis": {
    source: "iana"
  },
  "audio/uemclip": {
    source: "iana"
  },
  "audio/ulpfec": {
    source: "iana"
  },
  "audio/usac": {
    source: "iana"
  },
  "audio/vdvi": {
    source: "iana"
  },
  "audio/vmr-wb": {
    source: "iana"
  },
  "audio/vnd.3gpp.iufp": {
    source: "iana"
  },
  "audio/vnd.4sb": {
    source: "iana"
  },
  "audio/vnd.audiokoz": {
    source: "iana"
  },
  "audio/vnd.celp": {
    source: "iana"
  },
  "audio/vnd.cisco.nse": {
    source: "iana"
  },
  "audio/vnd.cmles.radio-events": {
    source: "iana"
  },
  "audio/vnd.cns.anp1": {
    source: "iana"
  },
  "audio/vnd.cns.inf1": {
    source: "iana"
  },
  "audio/vnd.dece.audio": {
    source: "iana",
    extensions: [
      "uva",
      "uvva"
    ]
  },
  "audio/vnd.digital-winds": {
    source: "iana",
    extensions: [
      "eol"
    ]
  },
  "audio/vnd.dlna.adts": {
    source: "iana"
  },
  "audio/vnd.dolby.heaac.1": {
    source: "iana"
  },
  "audio/vnd.dolby.heaac.2": {
    source: "iana"
  },
  "audio/vnd.dolby.mlp": {
    source: "iana"
  },
  "audio/vnd.dolby.mps": {
    source: "iana"
  },
  "audio/vnd.dolby.pl2": {
    source: "iana"
  },
  "audio/vnd.dolby.pl2x": {
    source: "iana"
  },
  "audio/vnd.dolby.pl2z": {
    source: "iana"
  },
  "audio/vnd.dolby.pulse.1": {
    source: "iana"
  },
  "audio/vnd.dra": {
    source: "iana",
    extensions: [
      "dra"
    ]
  },
  "audio/vnd.dts": {
    source: "iana",
    extensions: [
      "dts"
    ]
  },
  "audio/vnd.dts.hd": {
    source: "iana",
    extensions: [
      "dtshd"
    ]
  },
  "audio/vnd.dts.uhd": {
    source: "iana"
  },
  "audio/vnd.dvb.file": {
    source: "iana"
  },
  "audio/vnd.everad.plj": {
    source: "iana"
  },
  "audio/vnd.hns.audio": {
    source: "iana"
  },
  "audio/vnd.lucent.voice": {
    source: "iana",
    extensions: [
      "lvp"
    ]
  },
  "audio/vnd.ms-playready.media.pya": {
    source: "iana",
    extensions: [
      "pya"
    ]
  },
  "audio/vnd.nokia.mobile-xmf": {
    source: "iana"
  },
  "audio/vnd.nortel.vbk": {
    source: "iana"
  },
  "audio/vnd.nuera.ecelp4800": {
    source: "iana",
    extensions: [
      "ecelp4800"
    ]
  },
  "audio/vnd.nuera.ecelp7470": {
    source: "iana",
    extensions: [
      "ecelp7470"
    ]
  },
  "audio/vnd.nuera.ecelp9600": {
    source: "iana",
    extensions: [
      "ecelp9600"
    ]
  },
  "audio/vnd.octel.sbc": {
    source: "iana"
  },
  "audio/vnd.presonus.multitrack": {
    source: "iana"
  },
  "audio/vnd.qcelp": {
    source: "iana"
  },
  "audio/vnd.rhetorex.32kadpcm": {
    source: "iana"
  },
  "audio/vnd.rip": {
    source: "iana",
    extensions: [
      "rip"
    ]
  },
  "audio/vnd.rn-realaudio": {
    compressible: false
  },
  "audio/vnd.sealedmedia.softseal.mpeg": {
    source: "iana"
  },
  "audio/vnd.vmx.cvsd": {
    source: "iana"
  },
  "audio/vnd.wave": {
    compressible: false
  },
  "audio/vorbis": {
    source: "iana",
    compressible: false
  },
  "audio/vorbis-config": {
    source: "iana"
  },
  "audio/wav": {
    compressible: false,
    extensions: [
      "wav"
    ]
  },
  "audio/wave": {
    compressible: false,
    extensions: [
      "wav"
    ]
  },
  "audio/webm": {
    source: "apache",
    compressible: false,
    extensions: [
      "weba"
    ]
  },
  "audio/x-aac": {
    source: "apache",
    compressible: false,
    extensions: [
      "aac"
    ]
  },
  "audio/x-aiff": {
    source: "apache",
    extensions: [
      "aif",
      "aiff",
      "aifc"
    ]
  },
  "audio/x-caf": {
    source: "apache",
    compressible: false,
    extensions: [
      "caf"
    ]
  },
  "audio/x-flac": {
    source: "apache",
    extensions: [
      "flac"
    ]
  },
  "audio/x-m4a": {
    source: "nginx",
    extensions: [
      "m4a"
    ]
  },
  "audio/x-matroska": {
    source: "apache",
    extensions: [
      "mka"
    ]
  },
  "audio/x-mpegurl": {
    source: "apache",
    extensions: [
      "m3u"
    ]
  },
  "audio/x-ms-wax": {
    source: "apache",
    extensions: [
      "wax"
    ]
  },
  "audio/x-ms-wma": {
    source: "apache",
    extensions: [
      "wma"
    ]
  },
  "audio/x-pn-realaudio": {
    source: "apache",
    extensions: [
      "ram",
      "ra"
    ]
  },
  "audio/x-pn-realaudio-plugin": {
    source: "apache",
    extensions: [
      "rmp"
    ]
  },
  "audio/x-realaudio": {
    source: "nginx",
    extensions: [
      "ra"
    ]
  },
  "audio/x-tta": {
    source: "apache"
  },
  "audio/x-wav": {
    source: "apache",
    extensions: [
      "wav"
    ]
  },
  "audio/xm": {
    source: "apache",
    extensions: [
      "xm"
    ]
  },
  "chemical/x-cdx": {
    source: "apache",
    extensions: [
      "cdx"
    ]
  },
  "chemical/x-cif": {
    source: "apache",
    extensions: [
      "cif"
    ]
  },
  "chemical/x-cmdf": {
    source: "apache",
    extensions: [
      "cmdf"
    ]
  },
  "chemical/x-cml": {
    source: "apache",
    extensions: [
      "cml"
    ]
  },
  "chemical/x-csml": {
    source: "apache",
    extensions: [
      "csml"
    ]
  },
  "chemical/x-pdb": {
    source: "apache"
  },
  "chemical/x-xyz": {
    source: "apache",
    extensions: [
      "xyz"
    ]
  },
  "font/collection": {
    source: "iana",
    extensions: [
      "ttc"
    ]
  },
  "font/otf": {
    source: "iana",
    compressible: true,
    extensions: [
      "otf"
    ]
  },
  "font/sfnt": {
    source: "iana"
  },
  "font/ttf": {
    source: "iana",
    compressible: true,
    extensions: [
      "ttf"
    ]
  },
  "font/woff": {
    source: "iana",
    extensions: [
      "woff"
    ]
  },
  "font/woff2": {
    source: "iana",
    extensions: [
      "woff2"
    ]
  },
  "image/aces": {
    source: "iana",
    extensions: [
      "exr"
    ]
  },
  "image/apng": {
    compressible: false,
    extensions: [
      "apng"
    ]
  },
  "image/avci": {
    source: "iana",
    extensions: [
      "avci"
    ]
  },
  "image/avcs": {
    source: "iana",
    extensions: [
      "avcs"
    ]
  },
  "image/avif": {
    source: "iana",
    compressible: false,
    extensions: [
      "avif"
    ]
  },
  "image/bmp": {
    source: "iana",
    compressible: true,
    extensions: [
      "bmp"
    ]
  },
  "image/cgm": {
    source: "iana",
    extensions: [
      "cgm"
    ]
  },
  "image/dicom-rle": {
    source: "iana",
    extensions: [
      "drle"
    ]
  },
  "image/emf": {
    source: "iana",
    extensions: [
      "emf"
    ]
  },
  "image/fits": {
    source: "iana",
    extensions: [
      "fits"
    ]
  },
  "image/g3fax": {
    source: "iana",
    extensions: [
      "g3"
    ]
  },
  "image/gif": {
    source: "iana",
    compressible: false,
    extensions: [
      "gif"
    ]
  },
  "image/heic": {
    source: "iana",
    extensions: [
      "heic"
    ]
  },
  "image/heic-sequence": {
    source: "iana",
    extensions: [
      "heics"
    ]
  },
  "image/heif": {
    source: "iana",
    extensions: [
      "heif"
    ]
  },
  "image/heif-sequence": {
    source: "iana",
    extensions: [
      "heifs"
    ]
  },
  "image/hej2k": {
    source: "iana",
    extensions: [
      "hej2"
    ]
  },
  "image/hsj2": {
    source: "iana",
    extensions: [
      "hsj2"
    ]
  },
  "image/ief": {
    source: "iana",
    extensions: [
      "ief"
    ]
  },
  "image/jls": {
    source: "iana",
    extensions: [
      "jls"
    ]
  },
  "image/jp2": {
    source: "iana",
    compressible: false,
    extensions: [
      "jp2",
      "jpg2"
    ]
  },
  "image/jpeg": {
    source: "iana",
    compressible: false,
    extensions: [
      "jpeg",
      "jpg",
      "jpe"
    ]
  },
  "image/jph": {
    source: "iana",
    extensions: [
      "jph"
    ]
  },
  "image/jphc": {
    source: "iana",
    extensions: [
      "jhc"
    ]
  },
  "image/jpm": {
    source: "iana",
    compressible: false,
    extensions: [
      "jpm"
    ]
  },
  "image/jpx": {
    source: "iana",
    compressible: false,
    extensions: [
      "jpx",
      "jpf"
    ]
  },
  "image/jxr": {
    source: "iana",
    extensions: [
      "jxr"
    ]
  },
  "image/jxra": {
    source: "iana",
    extensions: [
      "jxra"
    ]
  },
  "image/jxrs": {
    source: "iana",
    extensions: [
      "jxrs"
    ]
  },
  "image/jxs": {
    source: "iana",
    extensions: [
      "jxs"
    ]
  },
  "image/jxsc": {
    source: "iana",
    extensions: [
      "jxsc"
    ]
  },
  "image/jxsi": {
    source: "iana",
    extensions: [
      "jxsi"
    ]
  },
  "image/jxss": {
    source: "iana",
    extensions: [
      "jxss"
    ]
  },
  "image/ktx": {
    source: "iana",
    extensions: [
      "ktx"
    ]
  },
  "image/ktx2": {
    source: "iana",
    extensions: [
      "ktx2"
    ]
  },
  "image/naplps": {
    source: "iana"
  },
  "image/pjpeg": {
    compressible: false
  },
  "image/png": {
    source: "iana",
    compressible: false,
    extensions: [
      "png"
    ]
  },
  "image/prs.btif": {
    source: "iana",
    extensions: [
      "btif"
    ]
  },
  "image/prs.pti": {
    source: "iana",
    extensions: [
      "pti"
    ]
  },
  "image/pwg-raster": {
    source: "iana"
  },
  "image/sgi": {
    source: "apache",
    extensions: [
      "sgi"
    ]
  },
  "image/svg+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "svg",
      "svgz"
    ]
  },
  "image/t38": {
    source: "iana",
    extensions: [
      "t38"
    ]
  },
  "image/tiff": {
    source: "iana",
    compressible: false,
    extensions: [
      "tif",
      "tiff"
    ]
  },
  "image/tiff-fx": {
    source: "iana",
    extensions: [
      "tfx"
    ]
  },
  "image/vnd.adobe.photoshop": {
    source: "iana",
    compressible: true,
    extensions: [
      "psd"
    ]
  },
  "image/vnd.airzip.accelerator.azv": {
    source: "iana",
    extensions: [
      "azv"
    ]
  },
  "image/vnd.cns.inf2": {
    source: "iana"
  },
  "image/vnd.dece.graphic": {
    source: "iana",
    extensions: [
      "uvi",
      "uvvi",
      "uvg",
      "uvvg"
    ]
  },
  "image/vnd.djvu": {
    source: "iana",
    extensions: [
      "djvu",
      "djv"
    ]
  },
  "image/vnd.dvb.subtitle": {
    source: "iana",
    extensions: [
      "sub"
    ]
  },
  "image/vnd.dwg": {
    source: "iana",
    extensions: [
      "dwg"
    ]
  },
  "image/vnd.dxf": {
    source: "iana",
    extensions: [
      "dxf"
    ]
  },
  "image/vnd.fastbidsheet": {
    source: "iana",
    extensions: [
      "fbs"
    ]
  },
  "image/vnd.fpx": {
    source: "iana",
    extensions: [
      "fpx"
    ]
  },
  "image/vnd.fst": {
    source: "iana",
    extensions: [
      "fst"
    ]
  },
  "image/vnd.fujixerox.edmics-mmr": {
    source: "iana",
    extensions: [
      "mmr"
    ]
  },
  "image/vnd.fujixerox.edmics-rlc": {
    source: "iana",
    extensions: [
      "rlc"
    ]
  },
  "image/vnd.globalgraphics.pgb": {
    source: "iana"
  },
  "image/vnd.microsoft.icon": {
    source: "iana",
    compressible: true,
    extensions: [
      "ico"
    ]
  },
  "image/vnd.mix": {
    source: "iana"
  },
  "image/vnd.mozilla.apng": {
    source: "iana"
  },
  "image/vnd.ms-dds": {
    compressible: true,
    extensions: [
      "dds"
    ]
  },
  "image/vnd.ms-modi": {
    source: "iana",
    extensions: [
      "mdi"
    ]
  },
  "image/vnd.ms-photo": {
    source: "apache",
    extensions: [
      "wdp"
    ]
  },
  "image/vnd.net-fpx": {
    source: "iana",
    extensions: [
      "npx"
    ]
  },
  "image/vnd.pco.b16": {
    source: "iana",
    extensions: [
      "b16"
    ]
  },
  "image/vnd.radiance": {
    source: "iana"
  },
  "image/vnd.sealed.png": {
    source: "iana"
  },
  "image/vnd.sealedmedia.softseal.gif": {
    source: "iana"
  },
  "image/vnd.sealedmedia.softseal.jpg": {
    source: "iana"
  },
  "image/vnd.svf": {
    source: "iana"
  },
  "image/vnd.tencent.tap": {
    source: "iana",
    extensions: [
      "tap"
    ]
  },
  "image/vnd.valve.source.texture": {
    source: "iana",
    extensions: [
      "vtf"
    ]
  },
  "image/vnd.wap.wbmp": {
    source: "iana",
    extensions: [
      "wbmp"
    ]
  },
  "image/vnd.xiff": {
    source: "iana",
    extensions: [
      "xif"
    ]
  },
  "image/vnd.zbrush.pcx": {
    source: "iana",
    extensions: [
      "pcx"
    ]
  },
  "image/webp": {
    source: "apache",
    extensions: [
      "webp"
    ]
  },
  "image/wmf": {
    source: "iana",
    extensions: [
      "wmf"
    ]
  },
  "image/x-3ds": {
    source: "apache",
    extensions: [
      "3ds"
    ]
  },
  "image/x-cmu-raster": {
    source: "apache",
    extensions: [
      "ras"
    ]
  },
  "image/x-cmx": {
    source: "apache",
    extensions: [
      "cmx"
    ]
  },
  "image/x-freehand": {
    source: "apache",
    extensions: [
      "fh",
      "fhc",
      "fh4",
      "fh5",
      "fh7"
    ]
  },
  "image/x-icon": {
    source: "apache",
    compressible: true,
    extensions: [
      "ico"
    ]
  },
  "image/x-jng": {
    source: "nginx",
    extensions: [
      "jng"
    ]
  },
  "image/x-mrsid-image": {
    source: "apache",
    extensions: [
      "sid"
    ]
  },
  "image/x-ms-bmp": {
    source: "nginx",
    compressible: true,
    extensions: [
      "bmp"
    ]
  },
  "image/x-pcx": {
    source: "apache",
    extensions: [
      "pcx"
    ]
  },
  "image/x-pict": {
    source: "apache",
    extensions: [
      "pic",
      "pct"
    ]
  },
  "image/x-portable-anymap": {
    source: "apache",
    extensions: [
      "pnm"
    ]
  },
  "image/x-portable-bitmap": {
    source: "apache",
    extensions: [
      "pbm"
    ]
  },
  "image/x-portable-graymap": {
    source: "apache",
    extensions: [
      "pgm"
    ]
  },
  "image/x-portable-pixmap": {
    source: "apache",
    extensions: [
      "ppm"
    ]
  },
  "image/x-rgb": {
    source: "apache",
    extensions: [
      "rgb"
    ]
  },
  "image/x-tga": {
    source: "apache",
    extensions: [
      "tga"
    ]
  },
  "image/x-xbitmap": {
    source: "apache",
    extensions: [
      "xbm"
    ]
  },
  "image/x-xcf": {
    compressible: false
  },
  "image/x-xpixmap": {
    source: "apache",
    extensions: [
      "xpm"
    ]
  },
  "image/x-xwindowdump": {
    source: "apache",
    extensions: [
      "xwd"
    ]
  },
  "message/cpim": {
    source: "iana"
  },
  "message/delivery-status": {
    source: "iana"
  },
  "message/disposition-notification": {
    source: "iana",
    extensions: [
      "disposition-notification"
    ]
  },
  "message/external-body": {
    source: "iana"
  },
  "message/feedback-report": {
    source: "iana"
  },
  "message/global": {
    source: "iana",
    extensions: [
      "u8msg"
    ]
  },
  "message/global-delivery-status": {
    source: "iana",
    extensions: [
      "u8dsn"
    ]
  },
  "message/global-disposition-notification": {
    source: "iana",
    extensions: [
      "u8mdn"
    ]
  },
  "message/global-headers": {
    source: "iana",
    extensions: [
      "u8hdr"
    ]
  },
  "message/http": {
    source: "iana",
    compressible: false
  },
  "message/imdn+xml": {
    source: "iana",
    compressible: true
  },
  "message/news": {
    source: "iana"
  },
  "message/partial": {
    source: "iana",
    compressible: false
  },
  "message/rfc822": {
    source: "iana",
    compressible: true,
    extensions: [
      "eml",
      "mime"
    ]
  },
  "message/s-http": {
    source: "iana"
  },
  "message/sip": {
    source: "iana"
  },
  "message/sipfrag": {
    source: "iana"
  },
  "message/tracking-status": {
    source: "iana"
  },
  "message/vnd.si.simp": {
    source: "iana"
  },
  "message/vnd.wfa.wsc": {
    source: "iana",
    extensions: [
      "wsc"
    ]
  },
  "model/3mf": {
    source: "iana",
    extensions: [
      "3mf"
    ]
  },
  "model/e57": {
    source: "iana"
  },
  "model/gltf+json": {
    source: "iana",
    compressible: true,
    extensions: [
      "gltf"
    ]
  },
  "model/gltf-binary": {
    source: "iana",
    compressible: true,
    extensions: [
      "glb"
    ]
  },
  "model/iges": {
    source: "iana",
    compressible: false,
    extensions: [
      "igs",
      "iges"
    ]
  },
  "model/mesh": {
    source: "iana",
    compressible: false,
    extensions: [
      "msh",
      "mesh",
      "silo"
    ]
  },
  "model/mtl": {
    source: "iana",
    extensions: [
      "mtl"
    ]
  },
  "model/obj": {
    source: "iana",
    extensions: [
      "obj"
    ]
  },
  "model/step": {
    source: "iana"
  },
  "model/step+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "stpx"
    ]
  },
  "model/step+zip": {
    source: "iana",
    compressible: false,
    extensions: [
      "stpz"
    ]
  },
  "model/step-xml+zip": {
    source: "iana",
    compressible: false,
    extensions: [
      "stpxz"
    ]
  },
  "model/stl": {
    source: "iana",
    extensions: [
      "stl"
    ]
  },
  "model/vnd.collada+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "dae"
    ]
  },
  "model/vnd.dwf": {
    source: "iana",
    extensions: [
      "dwf"
    ]
  },
  "model/vnd.flatland.3dml": {
    source: "iana"
  },
  "model/vnd.gdl": {
    source: "iana",
    extensions: [
      "gdl"
    ]
  },
  "model/vnd.gs-gdl": {
    source: "apache"
  },
  "model/vnd.gs.gdl": {
    source: "iana"
  },
  "model/vnd.gtw": {
    source: "iana",
    extensions: [
      "gtw"
    ]
  },
  "model/vnd.moml+xml": {
    source: "iana",
    compressible: true
  },
  "model/vnd.mts": {
    source: "iana",
    extensions: [
      "mts"
    ]
  },
  "model/vnd.opengex": {
    source: "iana",
    extensions: [
      "ogex"
    ]
  },
  "model/vnd.parasolid.transmit.binary": {
    source: "iana",
    extensions: [
      "x_b"
    ]
  },
  "model/vnd.parasolid.transmit.text": {
    source: "iana",
    extensions: [
      "x_t"
    ]
  },
  "model/vnd.pytha.pyox": {
    source: "iana"
  },
  "model/vnd.rosette.annotated-data-model": {
    source: "iana"
  },
  "model/vnd.sap.vds": {
    source: "iana",
    extensions: [
      "vds"
    ]
  },
  "model/vnd.usdz+zip": {
    source: "iana",
    compressible: false,
    extensions: [
      "usdz"
    ]
  },
  "model/vnd.valve.source.compiled-map": {
    source: "iana",
    extensions: [
      "bsp"
    ]
  },
  "model/vnd.vtu": {
    source: "iana",
    extensions: [
      "vtu"
    ]
  },
  "model/vrml": {
    source: "iana",
    compressible: false,
    extensions: [
      "wrl",
      "vrml"
    ]
  },
  "model/x3d+binary": {
    source: "apache",
    compressible: false,
    extensions: [
      "x3db",
      "x3dbz"
    ]
  },
  "model/x3d+fastinfoset": {
    source: "iana",
    extensions: [
      "x3db"
    ]
  },
  "model/x3d+vrml": {
    source: "apache",
    compressible: false,
    extensions: [
      "x3dv",
      "x3dvz"
    ]
  },
  "model/x3d+xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "x3d",
      "x3dz"
    ]
  },
  "model/x3d-vrml": {
    source: "iana",
    extensions: [
      "x3dv"
    ]
  },
  "multipart/alternative": {
    source: "iana",
    compressible: false
  },
  "multipart/appledouble": {
    source: "iana"
  },
  "multipart/byteranges": {
    source: "iana"
  },
  "multipart/digest": {
    source: "iana"
  },
  "multipart/encrypted": {
    source: "iana",
    compressible: false
  },
  "multipart/form-data": {
    source: "iana",
    compressible: false
  },
  "multipart/header-set": {
    source: "iana"
  },
  "multipart/mixed": {
    source: "iana"
  },
  "multipart/multilingual": {
    source: "iana"
  },
  "multipart/parallel": {
    source: "iana"
  },
  "multipart/related": {
    source: "iana",
    compressible: false
  },
  "multipart/report": {
    source: "iana"
  },
  "multipart/signed": {
    source: "iana",
    compressible: false
  },
  "multipart/vnd.bint.med-plus": {
    source: "iana"
  },
  "multipart/voice-message": {
    source: "iana"
  },
  "multipart/x-mixed-replace": {
    source: "iana"
  },
  "text/1d-interleaved-parityfec": {
    source: "iana"
  },
  "text/cache-manifest": {
    source: "iana",
    compressible: true,
    extensions: [
      "appcache",
      "manifest"
    ]
  },
  "text/calendar": {
    source: "iana",
    extensions: [
      "ics",
      "ifb"
    ]
  },
  "text/calender": {
    compressible: true
  },
  "text/cmd": {
    compressible: true
  },
  "text/coffeescript": {
    extensions: [
      "coffee",
      "litcoffee"
    ]
  },
  "text/cql": {
    source: "iana"
  },
  "text/cql-expression": {
    source: "iana"
  },
  "text/cql-identifier": {
    source: "iana"
  },
  "text/css": {
    source: "iana",
    charset: "UTF-8",
    compressible: true,
    extensions: [
      "css"
    ]
  },
  "text/csv": {
    source: "iana",
    compressible: true,
    extensions: [
      "csv"
    ]
  },
  "text/csv-schema": {
    source: "iana"
  },
  "text/directory": {
    source: "iana"
  },
  "text/dns": {
    source: "iana"
  },
  "text/ecmascript": {
    source: "iana"
  },
  "text/encaprtp": {
    source: "iana"
  },
  "text/enriched": {
    source: "iana"
  },
  "text/fhirpath": {
    source: "iana"
  },
  "text/flexfec": {
    source: "iana"
  },
  "text/fwdred": {
    source: "iana"
  },
  "text/gff3": {
    source: "iana"
  },
  "text/grammar-ref-list": {
    source: "iana"
  },
  "text/html": {
    source: "iana",
    compressible: true,
    extensions: [
      "html",
      "htm",
      "shtml"
    ]
  },
  "text/jade": {
    extensions: [
      "jade"
    ]
  },
  "text/javascript": {
    source: "iana",
    compressible: true
  },
  "text/jcr-cnd": {
    source: "iana"
  },
  "text/jsx": {
    compressible: true,
    extensions: [
      "jsx"
    ]
  },
  "text/less": {
    compressible: true,
    extensions: [
      "less"
    ]
  },
  "text/markdown": {
    source: "iana",
    compressible: true,
    extensions: [
      "markdown",
      "md"
    ]
  },
  "text/mathml": {
    source: "nginx",
    extensions: [
      "mml"
    ]
  },
  "text/mdx": {
    compressible: true,
    extensions: [
      "mdx"
    ]
  },
  "text/mizar": {
    source: "iana"
  },
  "text/n3": {
    source: "iana",
    charset: "UTF-8",
    compressible: true,
    extensions: [
      "n3"
    ]
  },
  "text/parameters": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/parityfec": {
    source: "iana"
  },
  "text/plain": {
    source: "iana",
    compressible: true,
    extensions: [
      "txt",
      "text",
      "conf",
      "def",
      "list",
      "log",
      "in",
      "ini"
    ]
  },
  "text/provenance-notation": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/prs.fallenstein.rst": {
    source: "iana"
  },
  "text/prs.lines.tag": {
    source: "iana",
    extensions: [
      "dsc"
    ]
  },
  "text/prs.prop.logic": {
    source: "iana"
  },
  "text/raptorfec": {
    source: "iana"
  },
  "text/red": {
    source: "iana"
  },
  "text/rfc822-headers": {
    source: "iana"
  },
  "text/richtext": {
    source: "iana",
    compressible: true,
    extensions: [
      "rtx"
    ]
  },
  "text/rtf": {
    source: "iana",
    compressible: true,
    extensions: [
      "rtf"
    ]
  },
  "text/rtp-enc-aescm128": {
    source: "iana"
  },
  "text/rtploopback": {
    source: "iana"
  },
  "text/rtx": {
    source: "iana"
  },
  "text/sgml": {
    source: "iana",
    extensions: [
      "sgml",
      "sgm"
    ]
  },
  "text/shaclc": {
    source: "iana"
  },
  "text/shex": {
    source: "iana",
    extensions: [
      "shex"
    ]
  },
  "text/slim": {
    extensions: [
      "slim",
      "slm"
    ]
  },
  "text/spdx": {
    source: "iana",
    extensions: [
      "spdx"
    ]
  },
  "text/strings": {
    source: "iana"
  },
  "text/stylus": {
    extensions: [
      "stylus",
      "styl"
    ]
  },
  "text/t140": {
    source: "iana"
  },
  "text/tab-separated-values": {
    source: "iana",
    compressible: true,
    extensions: [
      "tsv"
    ]
  },
  "text/troff": {
    source: "iana",
    extensions: [
      "t",
      "tr",
      "roff",
      "man",
      "me",
      "ms"
    ]
  },
  "text/turtle": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "ttl"
    ]
  },
  "text/ulpfec": {
    source: "iana"
  },
  "text/uri-list": {
    source: "iana",
    compressible: true,
    extensions: [
      "uri",
      "uris",
      "urls"
    ]
  },
  "text/vcard": {
    source: "iana",
    compressible: true,
    extensions: [
      "vcard"
    ]
  },
  "text/vnd.a": {
    source: "iana"
  },
  "text/vnd.abc": {
    source: "iana"
  },
  "text/vnd.ascii-art": {
    source: "iana"
  },
  "text/vnd.curl": {
    source: "iana",
    extensions: [
      "curl"
    ]
  },
  "text/vnd.curl.dcurl": {
    source: "apache",
    extensions: [
      "dcurl"
    ]
  },
  "text/vnd.curl.mcurl": {
    source: "apache",
    extensions: [
      "mcurl"
    ]
  },
  "text/vnd.curl.scurl": {
    source: "apache",
    extensions: [
      "scurl"
    ]
  },
  "text/vnd.debian.copyright": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/vnd.dmclientscript": {
    source: "iana"
  },
  "text/vnd.dvb.subtitle": {
    source: "iana",
    extensions: [
      "sub"
    ]
  },
  "text/vnd.esmertec.theme-descriptor": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/vnd.familysearch.gedcom": {
    source: "iana",
    extensions: [
      "ged"
    ]
  },
  "text/vnd.ficlab.flt": {
    source: "iana"
  },
  "text/vnd.fly": {
    source: "iana",
    extensions: [
      "fly"
    ]
  },
  "text/vnd.fmi.flexstor": {
    source: "iana",
    extensions: [
      "flx"
    ]
  },
  "text/vnd.gml": {
    source: "iana"
  },
  "text/vnd.graphviz": {
    source: "iana",
    extensions: [
      "gv"
    ]
  },
  "text/vnd.hans": {
    source: "iana"
  },
  "text/vnd.hgl": {
    source: "iana"
  },
  "text/vnd.in3d.3dml": {
    source: "iana",
    extensions: [
      "3dml"
    ]
  },
  "text/vnd.in3d.spot": {
    source: "iana",
    extensions: [
      "spot"
    ]
  },
  "text/vnd.iptc.newsml": {
    source: "iana"
  },
  "text/vnd.iptc.nitf": {
    source: "iana"
  },
  "text/vnd.latex-z": {
    source: "iana"
  },
  "text/vnd.motorola.reflex": {
    source: "iana"
  },
  "text/vnd.ms-mediapackage": {
    source: "iana"
  },
  "text/vnd.net2phone.commcenter.command": {
    source: "iana"
  },
  "text/vnd.radisys.msml-basic-layout": {
    source: "iana"
  },
  "text/vnd.senx.warpscript": {
    source: "iana"
  },
  "text/vnd.si.uricatalogue": {
    source: "iana"
  },
  "text/vnd.sosi": {
    source: "iana"
  },
  "text/vnd.sun.j2me.app-descriptor": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "jad"
    ]
  },
  "text/vnd.trolltech.linguist": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/vnd.wap.si": {
    source: "iana"
  },
  "text/vnd.wap.sl": {
    source: "iana"
  },
  "text/vnd.wap.wml": {
    source: "iana",
    extensions: [
      "wml"
    ]
  },
  "text/vnd.wap.wmlscript": {
    source: "iana",
    extensions: [
      "wmls"
    ]
  },
  "text/vtt": {
    source: "iana",
    charset: "UTF-8",
    compressible: true,
    extensions: [
      "vtt"
    ]
  },
  "text/x-asm": {
    source: "apache",
    extensions: [
      "s",
      "asm"
    ]
  },
  "text/x-c": {
    source: "apache",
    extensions: [
      "c",
      "cc",
      "cxx",
      "cpp",
      "h",
      "hh",
      "dic"
    ]
  },
  "text/x-component": {
    source: "nginx",
    extensions: [
      "htc"
    ]
  },
  "text/x-fortran": {
    source: "apache",
    extensions: [
      "f",
      "for",
      "f77",
      "f90"
    ]
  },
  "text/x-gwt-rpc": {
    compressible: true
  },
  "text/x-handlebars-template": {
    extensions: [
      "hbs"
    ]
  },
  "text/x-java-source": {
    source: "apache",
    extensions: [
      "java"
    ]
  },
  "text/x-jquery-tmpl": {
    compressible: true
  },
  "text/x-lua": {
    extensions: [
      "lua"
    ]
  },
  "text/x-markdown": {
    compressible: true,
    extensions: [
      "mkd"
    ]
  },
  "text/x-nfo": {
    source: "apache",
    extensions: [
      "nfo"
    ]
  },
  "text/x-opml": {
    source: "apache",
    extensions: [
      "opml"
    ]
  },
  "text/x-org": {
    compressible: true,
    extensions: [
      "org"
    ]
  },
  "text/x-pascal": {
    source: "apache",
    extensions: [
      "p",
      "pas"
    ]
  },
  "text/x-processing": {
    compressible: true,
    extensions: [
      "pde"
    ]
  },
  "text/x-sass": {
    extensions: [
      "sass"
    ]
  },
  "text/x-scss": {
    extensions: [
      "scss"
    ]
  },
  "text/x-setext": {
    source: "apache",
    extensions: [
      "etx"
    ]
  },
  "text/x-sfv": {
    source: "apache",
    extensions: [
      "sfv"
    ]
  },
  "text/x-suse-ymp": {
    compressible: true,
    extensions: [
      "ymp"
    ]
  },
  "text/x-uuencode": {
    source: "apache",
    extensions: [
      "uu"
    ]
  },
  "text/x-vcalendar": {
    source: "apache",
    extensions: [
      "vcs"
    ]
  },
  "text/x-vcard": {
    source: "apache",
    extensions: [
      "vcf"
    ]
  },
  "text/xml": {
    source: "iana",
    compressible: true,
    extensions: [
      "xml"
    ]
  },
  "text/xml-external-parsed-entity": {
    source: "iana"
  },
  "text/yaml": {
    compressible: true,
    extensions: [
      "yaml",
      "yml"
    ]
  },
  "video/1d-interleaved-parityfec": {
    source: "iana"
  },
  "video/3gpp": {
    source: "iana",
    extensions: [
      "3gp",
      "3gpp"
    ]
  },
  "video/3gpp-tt": {
    source: "iana"
  },
  "video/3gpp2": {
    source: "iana",
    extensions: [
      "3g2"
    ]
  },
  "video/av1": {
    source: "iana"
  },
  "video/bmpeg": {
    source: "iana"
  },
  "video/bt656": {
    source: "iana"
  },
  "video/celb": {
    source: "iana"
  },
  "video/dv": {
    source: "iana"
  },
  "video/encaprtp": {
    source: "iana"
  },
  "video/ffv1": {
    source: "iana"
  },
  "video/flexfec": {
    source: "iana"
  },
  "video/h261": {
    source: "iana",
    extensions: [
      "h261"
    ]
  },
  "video/h263": {
    source: "iana",
    extensions: [
      "h263"
    ]
  },
  "video/h263-1998": {
    source: "iana"
  },
  "video/h263-2000": {
    source: "iana"
  },
  "video/h264": {
    source: "iana",
    extensions: [
      "h264"
    ]
  },
  "video/h264-rcdo": {
    source: "iana"
  },
  "video/h264-svc": {
    source: "iana"
  },
  "video/h265": {
    source: "iana"
  },
  "video/iso.segment": {
    source: "iana",
    extensions: [
      "m4s"
    ]
  },
  "video/jpeg": {
    source: "iana",
    extensions: [
      "jpgv"
    ]
  },
  "video/jpeg2000": {
    source: "iana"
  },
  "video/jpm": {
    source: "apache",
    extensions: [
      "jpm",
      "jpgm"
    ]
  },
  "video/jxsv": {
    source: "iana"
  },
  "video/mj2": {
    source: "iana",
    extensions: [
      "mj2",
      "mjp2"
    ]
  },
  "video/mp1s": {
    source: "iana"
  },
  "video/mp2p": {
    source: "iana"
  },
  "video/mp2t": {
    source: "iana",
    extensions: [
      "ts"
    ]
  },
  "video/mp4": {
    source: "iana",
    compressible: false,
    extensions: [
      "mp4",
      "mp4v",
      "mpg4"
    ]
  },
  "video/mp4v-es": {
    source: "iana"
  },
  "video/mpeg": {
    source: "iana",
    compressible: false,
    extensions: [
      "mpeg",
      "mpg",
      "mpe",
      "m1v",
      "m2v"
    ]
  },
  "video/mpeg4-generic": {
    source: "iana"
  },
  "video/mpv": {
    source: "iana"
  },
  "video/nv": {
    source: "iana"
  },
  "video/ogg": {
    source: "iana",
    compressible: false,
    extensions: [
      "ogv"
    ]
  },
  "video/parityfec": {
    source: "iana"
  },
  "video/pointer": {
    source: "iana"
  },
  "video/quicktime": {
    source: "iana",
    compressible: false,
    extensions: [
      "qt",
      "mov"
    ]
  },
  "video/raptorfec": {
    source: "iana"
  },
  "video/raw": {
    source: "iana"
  },
  "video/rtp-enc-aescm128": {
    source: "iana"
  },
  "video/rtploopback": {
    source: "iana"
  },
  "video/rtx": {
    source: "iana"
  },
  "video/scip": {
    source: "iana"
  },
  "video/smpte291": {
    source: "iana"
  },
  "video/smpte292m": {
    source: "iana"
  },
  "video/ulpfec": {
    source: "iana"
  },
  "video/vc1": {
    source: "iana"
  },
  "video/vc2": {
    source: "iana"
  },
  "video/vnd.cctv": {
    source: "iana"
  },
  "video/vnd.dece.hd": {
    source: "iana",
    extensions: [
      "uvh",
      "uvvh"
    ]
  },
  "video/vnd.dece.mobile": {
    source: "iana",
    extensions: [
      "uvm",
      "uvvm"
    ]
  },
  "video/vnd.dece.mp4": {
    source: "iana"
  },
  "video/vnd.dece.pd": {
    source: "iana",
    extensions: [
      "uvp",
      "uvvp"
    ]
  },
  "video/vnd.dece.sd": {
    source: "iana",
    extensions: [
      "uvs",
      "uvvs"
    ]
  },
  "video/vnd.dece.video": {
    source: "iana",
    extensions: [
      "uvv",
      "uvvv"
    ]
  },
  "video/vnd.directv.mpeg": {
    source: "iana"
  },
  "video/vnd.directv.mpeg-tts": {
    source: "iana"
  },
  "video/vnd.dlna.mpeg-tts": {
    source: "iana"
  },
  "video/vnd.dvb.file": {
    source: "iana",
    extensions: [
      "dvb"
    ]
  },
  "video/vnd.fvt": {
    source: "iana",
    extensions: [
      "fvt"
    ]
  },
  "video/vnd.hns.video": {
    source: "iana"
  },
  "video/vnd.iptvforum.1dparityfec-1010": {
    source: "iana"
  },
  "video/vnd.iptvforum.1dparityfec-2005": {
    source: "iana"
  },
  "video/vnd.iptvforum.2dparityfec-1010": {
    source: "iana"
  },
  "video/vnd.iptvforum.2dparityfec-2005": {
    source: "iana"
  },
  "video/vnd.iptvforum.ttsavc": {
    source: "iana"
  },
  "video/vnd.iptvforum.ttsmpeg2": {
    source: "iana"
  },
  "video/vnd.motorola.video": {
    source: "iana"
  },
  "video/vnd.motorola.videop": {
    source: "iana"
  },
  "video/vnd.mpegurl": {
    source: "iana",
    extensions: [
      "mxu",
      "m4u"
    ]
  },
  "video/vnd.ms-playready.media.pyv": {
    source: "iana",
    extensions: [
      "pyv"
    ]
  },
  "video/vnd.nokia.interleaved-multimedia": {
    source: "iana"
  },
  "video/vnd.nokia.mp4vr": {
    source: "iana"
  },
  "video/vnd.nokia.videovoip": {
    source: "iana"
  },
  "video/vnd.objectvideo": {
    source: "iana"
  },
  "video/vnd.radgamettools.bink": {
    source: "iana"
  },
  "video/vnd.radgamettools.smacker": {
    source: "iana"
  },
  "video/vnd.sealed.mpeg1": {
    source: "iana"
  },
  "video/vnd.sealed.mpeg4": {
    source: "iana"
  },
  "video/vnd.sealed.swf": {
    source: "iana"
  },
  "video/vnd.sealedmedia.softseal.mov": {
    source: "iana"
  },
  "video/vnd.uvvu.mp4": {
    source: "iana",
    extensions: [
      "uvu",
      "uvvu"
    ]
  },
  "video/vnd.vivo": {
    source: "iana",
    extensions: [
      "viv"
    ]
  },
  "video/vnd.youtube.yt": {
    source: "iana"
  },
  "video/vp8": {
    source: "iana"
  },
  "video/vp9": {
    source: "iana"
  },
  "video/webm": {
    source: "apache",
    compressible: false,
    extensions: [
      "webm"
    ]
  },
  "video/x-f4v": {
    source: "apache",
    extensions: [
      "f4v"
    ]
  },
  "video/x-fli": {
    source: "apache",
    extensions: [
      "fli"
    ]
  },
  "video/x-flv": {
    source: "apache",
    compressible: false,
    extensions: [
      "flv"
    ]
  },
  "video/x-m4v": {
    source: "apache",
    extensions: [
      "m4v"
    ]
  },
  "video/x-matroska": {
    source: "apache",
    compressible: false,
    extensions: [
      "mkv",
      "mk3d",
      "mks"
    ]
  },
  "video/x-mng": {
    source: "apache",
    extensions: [
      "mng"
    ]
  },
  "video/x-ms-asf": {
    source: "apache",
    extensions: [
      "asf",
      "asx"
    ]
  },
  "video/x-ms-vob": {
    source: "apache",
    extensions: [
      "vob"
    ]
  },
  "video/x-ms-wm": {
    source: "apache",
    extensions: [
      "wm"
    ]
  },
  "video/x-ms-wmv": {
    source: "apache",
    compressible: false,
    extensions: [
      "wmv"
    ]
  },
  "video/x-ms-wmx": {
    source: "apache",
    extensions: [
      "wmx"
    ]
  },
  "video/x-ms-wvx": {
    source: "apache",
    extensions: [
      "wvx"
    ]
  },
  "video/x-msvideo": {
    source: "apache",
    extensions: [
      "avi"
    ]
  },
  "video/x-sgi-movie": {
    source: "apache",
    extensions: [
      "movie"
    ]
  },
  "video/x-smv": {
    source: "apache",
    extensions: [
      "smv"
    ]
  },
  "x-conference/x-cooltalk": {
    source: "apache",
    extensions: [
      "ice"
    ]
  },
  "x-shader/x-fragment": {
    compressible: true
  },
  "x-shader/x-vertex": {
    compressible: true
  }
};
/*!
 * mime-db
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015-2022 Douglas Christopher Wilson
 * MIT Licensed
 */
var mimeDb = require$$0;
/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
(function(exports$1) {
  var db = mimeDb;
  var extname = path$2.extname;
  var EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/;
  var TEXT_TYPE_REGEXP = /^text\//i;
  exports$1.charset = charset;
  exports$1.charsets = { lookup: charset };
  exports$1.contentType = contentType;
  exports$1.extension = extension;
  exports$1.extensions = /* @__PURE__ */ Object.create(null);
  exports$1.lookup = lookup;
  exports$1.types = /* @__PURE__ */ Object.create(null);
  populateMaps(exports$1.extensions, exports$1.types);
  function charset(type2) {
    if (!type2 || typeof type2 !== "string") {
      return false;
    }
    var match = EXTRACT_TYPE_REGEXP.exec(type2);
    var mime2 = match && db[match[1].toLowerCase()];
    if (mime2 && mime2.charset) {
      return mime2.charset;
    }
    if (match && TEXT_TYPE_REGEXP.test(match[1])) {
      return "UTF-8";
    }
    return false;
  }
  function contentType(str) {
    if (!str || typeof str !== "string") {
      return false;
    }
    var mime2 = str.indexOf("/") === -1 ? exports$1.lookup(str) : str;
    if (!mime2) {
      return false;
    }
    if (mime2.indexOf("charset") === -1) {
      var charset2 = exports$1.charset(mime2);
      if (charset2) mime2 += "; charset=" + charset2.toLowerCase();
    }
    return mime2;
  }
  function extension(type2) {
    if (!type2 || typeof type2 !== "string") {
      return false;
    }
    var match = EXTRACT_TYPE_REGEXP.exec(type2);
    var exts = match && exports$1.extensions[match[1].toLowerCase()];
    if (!exts || !exts.length) {
      return false;
    }
    return exts[0];
  }
  function lookup(path2) {
    if (!path2 || typeof path2 !== "string") {
      return false;
    }
    var extension2 = extname("x." + path2).toLowerCase().substr(1);
    if (!extension2) {
      return false;
    }
    return exports$1.types[extension2] || false;
  }
  function populateMaps(extensions, types) {
    var preference = ["nginx", "apache", void 0, "iana"];
    Object.keys(db).forEach(function forEachMimeType(type2) {
      var mime2 = db[type2];
      var exts = mime2.extensions;
      if (!exts || !exts.length) {
        return;
      }
      extensions[type2] = exts;
      for (var i = 0; i < exts.length; i++) {
        var extension2 = exts[i];
        if (types[extension2]) {
          var from = preference.indexOf(db[types[extension2]].source);
          var to2 = preference.indexOf(mime2.source);
          if (types[extension2] !== "application/octet-stream" && (from > to2 || from === to2 && types[extension2].substr(0, 12) === "application/")) {
            continue;
          }
        }
        types[extension2] = type2;
      }
    });
  }
})(mimeTypes);
var defer_1 = defer$1;
function defer$1(fn2) {
  var nextTick2 = typeof setImmediate == "function" ? setImmediate : typeof process == "object" && typeof process.nextTick == "function" ? process.nextTick : null;
  if (nextTick2) {
    nextTick2(fn2);
  } else {
    setTimeout(fn2, 0);
  }
}
var defer = defer_1;
var async_1 = async$2;
function async$2(callback) {
  var isAsync = false;
  defer(function() {
    isAsync = true;
  });
  return function async_callback(err, result) {
    if (isAsync) {
      callback(err, result);
    } else {
      defer(function nextTick_callback() {
        callback(err, result);
      });
    }
  };
}
var abort_1 = abort$2;
function abort$2(state2) {
  Object.keys(state2.jobs).forEach(clean.bind(state2));
  state2.jobs = {};
}
function clean(key) {
  if (typeof this.jobs[key] == "function") {
    this.jobs[key]();
  }
}
var async$1 = async_1, abort$1 = abort_1;
var iterate_1 = iterate$2;
function iterate$2(list, iterator, state2, callback) {
  var key = state2["keyedList"] ? state2["keyedList"][state2.index] : state2.index;
  state2.jobs[key] = runJob(iterator, key, list[key], function(error, output) {
    if (!(key in state2.jobs)) {
      return;
    }
    delete state2.jobs[key];
    if (error) {
      abort$1(state2);
    } else {
      state2.results[key] = output;
    }
    callback(error, state2.results);
  });
}
function runJob(iterator, key, item, callback) {
  var aborter;
  if (iterator.length == 2) {
    aborter = iterator(item, async$1(callback));
  } else {
    aborter = iterator(item, key, async$1(callback));
  }
  return aborter;
}
var state_1 = state;
function state(list, sortMethod) {
  var isNamedList = !Array.isArray(list), initState2 = {
    index: 0,
    keyedList: isNamedList || sortMethod ? Object.keys(list) : null,
    jobs: {},
    results: isNamedList ? {} : [],
    size: isNamedList ? Object.keys(list).length : list.length
  };
  if (sortMethod) {
    initState2.keyedList.sort(isNamedList ? sortMethod : function(a, b2) {
      return sortMethod(list[a], list[b2]);
    });
  }
  return initState2;
}
var abort = abort_1, async = async_1;
var terminator_1 = terminator$2;
function terminator$2(callback) {
  if (!Object.keys(this.jobs).length) {
    return;
  }
  this.index = this.size;
  abort(this);
  async(callback)(null, this.results);
}
var iterate$1 = iterate_1, initState$1 = state_1, terminator$1 = terminator_1;
var parallel_1 = parallel;
function parallel(list, iterator, callback) {
  var state2 = initState$1(list);
  while (state2.index < (state2["keyedList"] || list).length) {
    iterate$1(list, iterator, state2, function(error, result) {
      if (error) {
        callback(error, result);
        return;
      }
      if (Object.keys(state2.jobs).length === 0) {
        callback(null, state2.results);
        return;
      }
    });
    state2.index++;
  }
  return terminator$1.bind(state2, callback);
}
var serialOrdered$2 = { exports: {} };
var iterate = iterate_1, initState = state_1, terminator = terminator_1;
serialOrdered$2.exports = serialOrdered$1;
serialOrdered$2.exports.ascending = ascending;
serialOrdered$2.exports.descending = descending;
function serialOrdered$1(list, iterator, sortMethod, callback) {
  var state2 = initState(list, sortMethod);
  iterate(list, iterator, state2, function iteratorHandler(error, result) {
    if (error) {
      callback(error, result);
      return;
    }
    state2.index++;
    if (state2.index < (state2["keyedList"] || list).length) {
      iterate(list, iterator, state2, iteratorHandler);
      return;
    }
    callback(null, state2.results);
  });
  return terminator.bind(state2, callback);
}
function ascending(a, b2) {
  return a < b2 ? -1 : a > b2 ? 1 : 0;
}
function descending(a, b2) {
  return -1 * ascending(a, b2);
}
var serialOrderedExports = serialOrdered$2.exports;
var serialOrdered = serialOrderedExports;
var serial_1 = serial;
function serial(list, iterator, callback) {
  return serialOrdered(list, iterator, null, callback);
}
var asynckit$1 = {
  parallel: parallel_1,
  serial: serial_1,
  serialOrdered: serialOrderedExports
};
var esObjectAtoms = Object;
var esErrors = Error;
var _eval = EvalError;
var range = RangeError;
var ref = ReferenceError;
var syntax = SyntaxError;
var type = TypeError;
var uri = URIError;
var abs$1 = Math.abs;
var floor$1 = Math.floor;
var max$2 = Math.max;
var min$1 = Math.min;
var pow$1 = Math.pow;
var round$1 = Math.round;
var _isNaN = Number.isNaN || function isNaN2(a) {
  return a !== a;
};
var $isNaN = _isNaN;
var sign$1 = function sign2(number) {
  if ($isNaN(number) || number === 0) {
    return number;
  }
  return number < 0 ? -1 : 1;
};
var gOPD = Object.getOwnPropertyDescriptor;
var $gOPD$1 = gOPD;
if ($gOPD$1) {
  try {
    $gOPD$1([], "length");
  } catch (e10) {
    $gOPD$1 = null;
  }
}
var gopd = $gOPD$1;
var $defineProperty$2 = Object.defineProperty || false;
if ($defineProperty$2) {
  try {
    $defineProperty$2({}, "a", { value: 1 });
  } catch (e10) {
    $defineProperty$2 = false;
  }
}
var esDefineProperty = $defineProperty$2;
var shams$1;
var hasRequiredShams$1;
function requireShams$1() {
  if (hasRequiredShams$1) return shams$1;
  hasRequiredShams$1 = 1;
  shams$1 = function hasSymbols2() {
    if (typeof Symbol !== "function" || typeof Object.getOwnPropertySymbols !== "function") {
      return false;
    }
    if (typeof Symbol.iterator === "symbol") {
      return true;
    }
    var obj = {};
    var sym = Symbol("test");
    var symObj = Object(sym);
    if (typeof sym === "string") {
      return false;
    }
    if (Object.prototype.toString.call(sym) !== "[object Symbol]") {
      return false;
    }
    if (Object.prototype.toString.call(symObj) !== "[object Symbol]") {
      return false;
    }
    var symVal = 42;
    obj[sym] = symVal;
    for (var _ in obj) {
      return false;
    }
    if (typeof Object.keys === "function" && Object.keys(obj).length !== 0) {
      return false;
    }
    if (typeof Object.getOwnPropertyNames === "function" && Object.getOwnPropertyNames(obj).length !== 0) {
      return false;
    }
    var syms = Object.getOwnPropertySymbols(obj);
    if (syms.length !== 1 || syms[0] !== sym) {
      return false;
    }
    if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) {
      return false;
    }
    if (typeof Object.getOwnPropertyDescriptor === "function") {
      var descriptor = (
        /** @type {PropertyDescriptor} */
        Object.getOwnPropertyDescriptor(obj, sym)
      );
      if (descriptor.value !== symVal || descriptor.enumerable !== true) {
        return false;
      }
    }
    return true;
  };
  return shams$1;
}
var hasSymbols$1;
var hasRequiredHasSymbols;
function requireHasSymbols() {
  if (hasRequiredHasSymbols) return hasSymbols$1;
  hasRequiredHasSymbols = 1;
  var origSymbol = typeof Symbol !== "undefined" && Symbol;
  var hasSymbolSham = requireShams$1();
  hasSymbols$1 = function hasNativeSymbols() {
    if (typeof origSymbol !== "function") {
      return false;
    }
    if (typeof Symbol !== "function") {
      return false;
    }
    if (typeof origSymbol("foo") !== "symbol") {
      return false;
    }
    if (typeof Symbol("bar") !== "symbol") {
      return false;
    }
    return hasSymbolSham();
  };
  return hasSymbols$1;
}
var Reflect_getPrototypeOf;
var hasRequiredReflect_getPrototypeOf;
function requireReflect_getPrototypeOf() {
  if (hasRequiredReflect_getPrototypeOf) return Reflect_getPrototypeOf;
  hasRequiredReflect_getPrototypeOf = 1;
  Reflect_getPrototypeOf = typeof Reflect !== "undefined" && Reflect.getPrototypeOf || null;
  return Reflect_getPrototypeOf;
}
var Object_getPrototypeOf;
var hasRequiredObject_getPrototypeOf;
function requireObject_getPrototypeOf() {
  if (hasRequiredObject_getPrototypeOf) return Object_getPrototypeOf;
  hasRequiredObject_getPrototypeOf = 1;
  var $Object2 = esObjectAtoms;
  Object_getPrototypeOf = $Object2.getPrototypeOf || null;
  return Object_getPrototypeOf;
}
var ERROR_MESSAGE = "Function.prototype.bind called on incompatible ";
var toStr = Object.prototype.toString;
var max$1 = Math.max;
var funcType = "[object Function]";
var concatty = function concatty2(a, b2) {
  var arr = [];
  for (var i = 0; i < a.length; i += 1) {
    arr[i] = a[i];
  }
  for (var j2 = 0; j2 < b2.length; j2 += 1) {
    arr[j2 + a.length] = b2[j2];
  }
  return arr;
};
var slicy = function slicy2(arrLike, offset) {
  var arr = [];
  for (var i = offset, j2 = 0; i < arrLike.length; i += 1, j2 += 1) {
    arr[j2] = arrLike[i];
  }
  return arr;
};
var joiny = function(arr, joiner) {
  var str = "";
  for (var i = 0; i < arr.length; i += 1) {
    str += arr[i];
    if (i + 1 < arr.length) {
      str += joiner;
    }
  }
  return str;
};
var implementation$1 = function bind2(that) {
  var target = this;
  if (typeof target !== "function" || toStr.apply(target) !== funcType) {
    throw new TypeError(ERROR_MESSAGE + target);
  }
  var args = slicy(arguments, 1);
  var bound;
  var binder = function() {
    if (this instanceof bound) {
      var result = target.apply(
        this,
        concatty(args, arguments)
      );
      if (Object(result) === result) {
        return result;
      }
      return this;
    }
    return target.apply(
      that,
      concatty(args, arguments)
    );
  };
  var boundLength = max$1(0, target.length - args.length);
  var boundArgs = [];
  for (var i = 0; i < boundLength; i++) {
    boundArgs[i] = "$" + i;
  }
  bound = Function("binder", "return function (" + joiny(boundArgs, ",") + "){ return binder.apply(this,arguments); }")(binder);
  if (target.prototype) {
    var Empty = function Empty2() {
    };
    Empty.prototype = target.prototype;
    bound.prototype = new Empty();
    Empty.prototype = null;
  }
  return bound;
};
var implementation = implementation$1;
var functionBind = Function.prototype.bind || implementation;
var functionCall;
var hasRequiredFunctionCall;
function requireFunctionCall() {
  if (hasRequiredFunctionCall) return functionCall;
  hasRequiredFunctionCall = 1;
  functionCall = Function.prototype.call;
  return functionCall;
}
var functionApply;
var hasRequiredFunctionApply;
function requireFunctionApply() {
  if (hasRequiredFunctionApply) return functionApply;
  hasRequiredFunctionApply = 1;
  functionApply = Function.prototype.apply;
  return functionApply;
}
var reflectApply;
var hasRequiredReflectApply;
function requireReflectApply() {
  if (hasRequiredReflectApply) return reflectApply;
  hasRequiredReflectApply = 1;
  reflectApply = typeof Reflect !== "undefined" && Reflect && Reflect.apply;
  return reflectApply;
}
var actualApply;
var hasRequiredActualApply;
function requireActualApply() {
  if (hasRequiredActualApply) return actualApply;
  hasRequiredActualApply = 1;
  var bind3 = functionBind;
  var $apply2 = requireFunctionApply();
  var $call2 = requireFunctionCall();
  var $reflectApply = requireReflectApply();
  actualApply = $reflectApply || bind3.call($call2, $apply2);
  return actualApply;
}
var callBindApplyHelpers;
var hasRequiredCallBindApplyHelpers;
function requireCallBindApplyHelpers() {
  if (hasRequiredCallBindApplyHelpers) return callBindApplyHelpers;
  hasRequiredCallBindApplyHelpers = 1;
  var bind3 = functionBind;
  var $TypeError2 = type;
  var $call2 = requireFunctionCall();
  var $actualApply = requireActualApply();
  callBindApplyHelpers = function callBindBasic(args) {
    if (args.length < 1 || typeof args[0] !== "function") {
      throw new $TypeError2("a function is required");
    }
    return $actualApply(bind3, $call2, args);
  };
  return callBindApplyHelpers;
}
var get;
var hasRequiredGet;
function requireGet() {
  if (hasRequiredGet) return get;
  hasRequiredGet = 1;
  var callBind = requireCallBindApplyHelpers();
  var gOPD2 = gopd;
  var hasProtoAccessor;
  try {
    hasProtoAccessor = /** @type {{ __proto__?: typeof Array.prototype }} */
    [].__proto__ === Array.prototype;
  } catch (e10) {
    if (!e10 || typeof e10 !== "object" || !("code" in e10) || e10.code !== "ERR_PROTO_ACCESS") {
      throw e10;
    }
  }
  var desc = !!hasProtoAccessor && gOPD2 && gOPD2(
    Object.prototype,
    /** @type {keyof typeof Object.prototype} */
    "__proto__"
  );
  var $Object2 = Object;
  var $getPrototypeOf = $Object2.getPrototypeOf;
  get = desc && typeof desc.get === "function" ? callBind([desc.get]) : typeof $getPrototypeOf === "function" ? (
    /** @type {import('./get')} */
    function getDunder(value) {
      return $getPrototypeOf(value == null ? value : $Object2(value));
    }
  ) : false;
  return get;
}
var getProto$1;
var hasRequiredGetProto;
function requireGetProto() {
  if (hasRequiredGetProto) return getProto$1;
  hasRequiredGetProto = 1;
  var reflectGetProto = requireReflect_getPrototypeOf();
  var originalGetProto = requireObject_getPrototypeOf();
  var getDunderProto = requireGet();
  getProto$1 = reflectGetProto ? function getProto2(O) {
    return reflectGetProto(O);
  } : originalGetProto ? function getProto2(O) {
    if (!O || typeof O !== "object" && typeof O !== "function") {
      throw new TypeError("getProto: not an object");
    }
    return originalGetProto(O);
  } : getDunderProto ? function getProto2(O) {
    return getDunderProto(O);
  } : null;
  return getProto$1;
}
var call = Function.prototype.call;
var $hasOwn = Object.prototype.hasOwnProperty;
var bind$1 = functionBind;
var hasown = bind$1.call(call, $hasOwn);
var undefined$1;
var $Object = esObjectAtoms;
var $Error = esErrors;
var $EvalError = _eval;
var $RangeError = range;
var $ReferenceError = ref;
var $SyntaxError = syntax;
var $TypeError$1 = type;
var $URIError = uri;
var abs = abs$1;
var floor = floor$1;
var max = max$2;
var min = min$1;
var pow = pow$1;
var round = round$1;
var sign = sign$1;
var $Function = Function;
var getEvalledConstructor = function(expressionSyntax) {
  try {
    return $Function('"use strict"; return (' + expressionSyntax + ").constructor;")();
  } catch (e10) {
  }
};
var $gOPD = gopd;
var $defineProperty$1 = esDefineProperty;
var throwTypeError = function() {
  throw new $TypeError$1();
};
var ThrowTypeError = $gOPD ? function() {
  try {
    arguments.callee;
    return throwTypeError;
  } catch (calleeThrows) {
    try {
      return $gOPD(arguments, "callee").get;
    } catch (gOPDthrows) {
      return throwTypeError;
    }
  }
}() : throwTypeError;
var hasSymbols = requireHasSymbols()();
var getProto = requireGetProto();
var $ObjectGPO = requireObject_getPrototypeOf();
var $ReflectGPO = requireReflect_getPrototypeOf();
var $apply = requireFunctionApply();
var $call = requireFunctionCall();
var needsEval = {};
var TypedArray = typeof Uint8Array === "undefined" || !getProto ? undefined$1 : getProto(Uint8Array);
var INTRINSICS = {
  __proto__: null,
  "%AggregateError%": typeof AggregateError === "undefined" ? undefined$1 : AggregateError,
  "%Array%": Array,
  "%ArrayBuffer%": typeof ArrayBuffer === "undefined" ? undefined$1 : ArrayBuffer,
  "%ArrayIteratorPrototype%": hasSymbols && getProto ? getProto([][Symbol.iterator]()) : undefined$1,
  "%AsyncFromSyncIteratorPrototype%": undefined$1,
  "%AsyncFunction%": needsEval,
  "%AsyncGenerator%": needsEval,
  "%AsyncGeneratorFunction%": needsEval,
  "%AsyncIteratorPrototype%": needsEval,
  "%Atomics%": typeof Atomics === "undefined" ? undefined$1 : Atomics,
  "%BigInt%": typeof BigInt === "undefined" ? undefined$1 : BigInt,
  "%BigInt64Array%": typeof BigInt64Array === "undefined" ? undefined$1 : BigInt64Array,
  "%BigUint64Array%": typeof BigUint64Array === "undefined" ? undefined$1 : BigUint64Array,
  "%Boolean%": Boolean,
  "%DataView%": typeof DataView === "undefined" ? undefined$1 : DataView,
  "%Date%": Date,
  "%decodeURI%": decodeURI,
  "%decodeURIComponent%": decodeURIComponent,
  "%encodeURI%": encodeURI,
  "%encodeURIComponent%": encodeURIComponent,
  "%Error%": $Error,
  "%eval%": eval,
  // eslint-disable-line no-eval
  "%EvalError%": $EvalError,
  "%Float16Array%": typeof Float16Array === "undefined" ? undefined$1 : Float16Array,
  "%Float32Array%": typeof Float32Array === "undefined" ? undefined$1 : Float32Array,
  "%Float64Array%": typeof Float64Array === "undefined" ? undefined$1 : Float64Array,
  "%FinalizationRegistry%": typeof FinalizationRegistry === "undefined" ? undefined$1 : FinalizationRegistry,
  "%Function%": $Function,
  "%GeneratorFunction%": needsEval,
  "%Int8Array%": typeof Int8Array === "undefined" ? undefined$1 : Int8Array,
  "%Int16Array%": typeof Int16Array === "undefined" ? undefined$1 : Int16Array,
  "%Int32Array%": typeof Int32Array === "undefined" ? undefined$1 : Int32Array,
  "%isFinite%": isFinite,
  "%isNaN%": isNaN,
  "%IteratorPrototype%": hasSymbols && getProto ? getProto(getProto([][Symbol.iterator]())) : undefined$1,
  "%JSON%": typeof JSON === "object" ? JSON : undefined$1,
  "%Map%": typeof Map === "undefined" ? undefined$1 : Map,
  "%MapIteratorPrototype%": typeof Map === "undefined" || !hasSymbols || !getProto ? undefined$1 : getProto((/* @__PURE__ */ new Map())[Symbol.iterator]()),
  "%Math%": Math,
  "%Number%": Number,
  "%Object%": $Object,
  "%Object.getOwnPropertyDescriptor%": $gOPD,
  "%parseFloat%": parseFloat,
  "%parseInt%": parseInt,
  "%Promise%": typeof Promise === "undefined" ? undefined$1 : Promise,
  "%Proxy%": typeof Proxy === "undefined" ? undefined$1 : Proxy,
  "%RangeError%": $RangeError,
  "%ReferenceError%": $ReferenceError,
  "%Reflect%": typeof Reflect === "undefined" ? undefined$1 : Reflect,
  "%RegExp%": RegExp,
  "%Set%": typeof Set === "undefined" ? undefined$1 : Set,
  "%SetIteratorPrototype%": typeof Set === "undefined" || !hasSymbols || !getProto ? undefined$1 : getProto((/* @__PURE__ */ new Set())[Symbol.iterator]()),
  "%SharedArrayBuffer%": typeof SharedArrayBuffer === "undefined" ? undefined$1 : SharedArrayBuffer,
  "%String%": String,
  "%StringIteratorPrototype%": hasSymbols && getProto ? getProto(""[Symbol.iterator]()) : undefined$1,
  "%Symbol%": hasSymbols ? Symbol : undefined$1,
  "%SyntaxError%": $SyntaxError,
  "%ThrowTypeError%": ThrowTypeError,
  "%TypedArray%": TypedArray,
  "%TypeError%": $TypeError$1,
  "%Uint8Array%": typeof Uint8Array === "undefined" ? undefined$1 : Uint8Array,
  "%Uint8ClampedArray%": typeof Uint8ClampedArray === "undefined" ? undefined$1 : Uint8ClampedArray,
  "%Uint16Array%": typeof Uint16Array === "undefined" ? undefined$1 : Uint16Array,
  "%Uint32Array%": typeof Uint32Array === "undefined" ? undefined$1 : Uint32Array,
  "%URIError%": $URIError,
  "%WeakMap%": typeof WeakMap === "undefined" ? undefined$1 : WeakMap,
  "%WeakRef%": typeof WeakRef === "undefined" ? undefined$1 : WeakRef,
  "%WeakSet%": typeof WeakSet === "undefined" ? undefined$1 : WeakSet,
  "%Function.prototype.call%": $call,
  "%Function.prototype.apply%": $apply,
  "%Object.defineProperty%": $defineProperty$1,
  "%Object.getPrototypeOf%": $ObjectGPO,
  "%Math.abs%": abs,
  "%Math.floor%": floor,
  "%Math.max%": max,
  "%Math.min%": min,
  "%Math.pow%": pow,
  "%Math.round%": round,
  "%Math.sign%": sign,
  "%Reflect.getPrototypeOf%": $ReflectGPO
};
if (getProto) {
  try {
    null.error;
  } catch (e10) {
    var errorProto = getProto(getProto(e10));
    INTRINSICS["%Error.prototype%"] = errorProto;
  }
}
var doEval = function doEval2(name) {
  var value;
  if (name === "%AsyncFunction%") {
    value = getEvalledConstructor("async function () {}");
  } else if (name === "%GeneratorFunction%") {
    value = getEvalledConstructor("function* () {}");
  } else if (name === "%AsyncGeneratorFunction%") {
    value = getEvalledConstructor("async function* () {}");
  } else if (name === "%AsyncGenerator%") {
    var fn2 = doEval2("%AsyncGeneratorFunction%");
    if (fn2) {
      value = fn2.prototype;
    }
  } else if (name === "%AsyncIteratorPrototype%") {
    var gen = doEval2("%AsyncGenerator%");
    if (gen && getProto) {
      value = getProto(gen.prototype);
    }
  }
  INTRINSICS[name] = value;
  return value;
};
var LEGACY_ALIASES = {
  __proto__: null,
  "%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"],
  "%ArrayPrototype%": ["Array", "prototype"],
  "%ArrayProto_entries%": ["Array", "prototype", "entries"],
  "%ArrayProto_forEach%": ["Array", "prototype", "forEach"],
  "%ArrayProto_keys%": ["Array", "prototype", "keys"],
  "%ArrayProto_values%": ["Array", "prototype", "values"],
  "%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"],
  "%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"],
  "%AsyncGeneratorPrototype%": ["AsyncGeneratorFunction", "prototype", "prototype"],
  "%BooleanPrototype%": ["Boolean", "prototype"],
  "%DataViewPrototype%": ["DataView", "prototype"],
  "%DatePrototype%": ["Date", "prototype"],
  "%ErrorPrototype%": ["Error", "prototype"],
  "%EvalErrorPrototype%": ["EvalError", "prototype"],
  "%Float32ArrayPrototype%": ["Float32Array", "prototype"],
  "%Float64ArrayPrototype%": ["Float64Array", "prototype"],
  "%FunctionPrototype%": ["Function", "prototype"],
  "%Generator%": ["GeneratorFunction", "prototype"],
  "%GeneratorPrototype%": ["GeneratorFunction", "prototype", "prototype"],
  "%Int8ArrayPrototype%": ["Int8Array", "prototype"],
  "%Int16ArrayPrototype%": ["Int16Array", "prototype"],
  "%Int32ArrayPrototype%": ["Int32Array", "prototype"],
  "%JSONParse%": ["JSON", "parse"],
  "%JSONStringify%": ["JSON", "stringify"],
  "%MapPrototype%": ["Map", "prototype"],
  "%NumberPrototype%": ["Number", "prototype"],
  "%ObjectPrototype%": ["Object", "prototype"],
  "%ObjProto_toString%": ["Object", "prototype", "toString"],
  "%ObjProto_valueOf%": ["Object", "prototype", "valueOf"],
  "%PromisePrototype%": ["Promise", "prototype"],
  "%PromiseProto_then%": ["Promise", "prototype", "then"],
  "%Promise_all%": ["Promise", "all"],
  "%Promise_reject%": ["Promise", "reject"],
  "%Promise_resolve%": ["Promise", "resolve"],
  "%RangeErrorPrototype%": ["RangeError", "prototype"],
  "%ReferenceErrorPrototype%": ["ReferenceError", "prototype"],
  "%RegExpPrototype%": ["RegExp", "prototype"],
  "%SetPrototype%": ["Set", "prototype"],
  "%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"],
  "%StringPrototype%": ["String", "prototype"],
  "%SymbolPrototype%": ["Symbol", "prototype"],
  "%SyntaxErrorPrototype%": ["SyntaxError", "prototype"],
  "%TypedArrayPrototype%": ["TypedArray", "prototype"],
  "%TypeErrorPrototype%": ["TypeError", "prototype"],
  "%Uint8ArrayPrototype%": ["Uint8Array", "prototype"],
  "%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"],
  "%Uint16ArrayPrototype%": ["Uint16Array", "prototype"],
  "%Uint32ArrayPrototype%": ["Uint32Array", "prototype"],
  "%URIErrorPrototype%": ["URIError", "prototype"],
  "%WeakMapPrototype%": ["WeakMap", "prototype"],
  "%WeakSetPrototype%": ["WeakSet", "prototype"]
};
var bind = functionBind;
var hasOwn$2 = hasown;
var $concat = bind.call($call, Array.prototype.concat);
var $spliceApply = bind.call($apply, Array.prototype.splice);
var $replace = bind.call($call, String.prototype.replace);
var $strSlice = bind.call($call, String.prototype.slice);
var $exec = bind.call($call, RegExp.prototype.exec);
var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
var reEscapeChar = /\\(\\)?/g;
var stringToPath = function stringToPath2(string) {
  var first = $strSlice(string, 0, 1);
  var last = $strSlice(string, -1);
  if (first === "%" && last !== "%") {
    throw new $SyntaxError("invalid intrinsic syntax, expected closing `%`");
  } else if (last === "%" && first !== "%") {
    throw new $SyntaxError("invalid intrinsic syntax, expected opening `%`");
  }
  var result = [];
  $replace(string, rePropName, function(match, number, quote, subString) {
    result[result.length] = quote ? $replace(subString, reEscapeChar, "$1") : number || match;
  });
  return result;
};
var getBaseIntrinsic = function getBaseIntrinsic2(name, allowMissing) {
  var intrinsicName = name;
  var alias;
  if (hasOwn$2(LEGACY_ALIASES, intrinsicName)) {
    alias = LEGACY_ALIASES[intrinsicName];
    intrinsicName = "%" + alias[0] + "%";
  }
  if (hasOwn$2(INTRINSICS, intrinsicName)) {
    var value = INTRINSICS[intrinsicName];
    if (value === needsEval) {
      value = doEval(intrinsicName);
    }
    if (typeof value === "undefined" && !allowMissing) {
      throw new $TypeError$1("intrinsic " + name + " exists, but is not available. Please file an issue!");
    }
    return {
      alias,
      name: intrinsicName,
      value
    };
  }
  throw new $SyntaxError("intrinsic " + name + " does not exist!");
};
var getIntrinsic = function GetIntrinsic2(name, allowMissing) {
  if (typeof name !== "string" || name.length === 0) {
    throw new $TypeError$1("intrinsic name must be a non-empty string");
  }
  if (arguments.length > 1 && typeof allowMissing !== "boolean") {
    throw new $TypeError$1('"allowMissing" argument must be a boolean');
  }
  if ($exec(/^%?[^%]*%?$/, name) === null) {
    throw new $SyntaxError("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
  }
  var parts = stringToPath(name);
  var intrinsicBaseName = parts.length > 0 ? parts[0] : "";
  var intrinsic = getBaseIntrinsic("%" + intrinsicBaseName + "%", allowMissing);
  var intrinsicRealName = intrinsic.name;
  var value = intrinsic.value;
  var skipFurtherCaching = false;
  var alias = intrinsic.alias;
  if (alias) {
    intrinsicBaseName = alias[0];
    $spliceApply(parts, $concat([0, 1], alias));
  }
  for (var i = 1, isOwn = true; i < parts.length; i += 1) {
    var part = parts[i];
    var first = $strSlice(part, 0, 1);
    var last = $strSlice(part, -1);
    if ((first === '"' || first === "'" || first === "`" || (last === '"' || last === "'" || last === "`")) && first !== last) {
      throw new $SyntaxError("property names with quotes must have matching quotes");
    }
    if (part === "constructor" || !isOwn) {
      skipFurtherCaching = true;
    }
    intrinsicBaseName += "." + part;
    intrinsicRealName = "%" + intrinsicBaseName + "%";
    if (hasOwn$2(INTRINSICS, intrinsicRealName)) {
      value = INTRINSICS[intrinsicRealName];
    } else if (value != null) {
      if (!(part in value)) {
        if (!allowMissing) {
          throw new $TypeError$1("base intrinsic for " + name + " exists, but the property is not available.");
        }
        return void 0;
      }
      if ($gOPD && i + 1 >= parts.length) {
        var desc = $gOPD(value, part);
        isOwn = !!desc;
        if (isOwn && "get" in desc && !("originalValue" in desc.get)) {
          value = desc.get;
        } else {
          value = value[part];
        }
      } else {
        isOwn = hasOwn$2(value, part);
        value = value[part];
      }
      if (isOwn && !skipFurtherCaching) {
        INTRINSICS[intrinsicRealName] = value;
      }
    }
  }
  return value;
};
var shams;
var hasRequiredShams;
function requireShams() {
  if (hasRequiredShams) return shams;
  hasRequiredShams = 1;
  var hasSymbols2 = requireShams$1();
  shams = function hasToStringTagShams() {
    return hasSymbols2() && !!Symbol.toStringTag;
  };
  return shams;
}
var GetIntrinsic = getIntrinsic;
var $defineProperty = GetIntrinsic("%Object.defineProperty%", true);
var hasToStringTag = requireShams()();
var hasOwn$1 = hasown;
var $TypeError = type;
var toStringTag = hasToStringTag ? Symbol.toStringTag : null;
var esSetTostringtag = function setToStringTag2(object, value) {
  var overrideIfSet = arguments.length > 2 && !!arguments[2] && arguments[2].force;
  var nonConfigurable = arguments.length > 2 && !!arguments[2] && arguments[2].nonConfigurable;
  if (typeof overrideIfSet !== "undefined" && typeof overrideIfSet !== "boolean" || typeof nonConfigurable !== "undefined" && typeof nonConfigurable !== "boolean") {
    throw new $TypeError("if provided, the `overrideIfSet` and `nonConfigurable` options must be booleans");
  }
  if (toStringTag && (overrideIfSet || !hasOwn$1(object, toStringTag))) {
    if ($defineProperty) {
      $defineProperty(object, toStringTag, {
        configurable: !nonConfigurable,
        enumerable: false,
        value,
        writable: false
      });
    } else {
      object[toStringTag] = value;
    }
  }
};
var populate$1 = function(dst, src) {
  Object.keys(src).forEach(function(prop) {
    dst[prop] = dst[prop] || src[prop];
  });
  return dst;
};
var CombinedStream = combined_stream;
var util = require$$1$1;
var path = path$2;
var http = require$$3;
var https = require$$4;
var parseUrl = require$$5$1.parse;
var fs = fs$3;
var Stream = require$$0$3.Stream;
var crypto$1 = require$$1;
var mime = mimeTypes;
var asynckit = asynckit$1;
var setToStringTag = esSetTostringtag;
var hasOwn = hasown;
var populate = populate$1;
function FormData(options) {
  if (!(this instanceof FormData)) {
    return new FormData(options);
  }
  this._overheadLength = 0;
  this._valueLength = 0;
  this._valuesToMeasure = [];
  CombinedStream.call(this);
  options = options || {};
  for (var option in options) {
    this[option] = options[option];
  }
}
util.inherits(FormData, CombinedStream);
FormData.LINE_BREAK = "\r\n";
FormData.DEFAULT_CONTENT_TYPE = "application/octet-stream";
FormData.prototype.append = function(field, value, options) {
  options = options || {};
  if (typeof options === "string") {
    options = { filename: options };
  }
  var append = CombinedStream.prototype.append.bind(this);
  if (typeof value === "number" || value == null) {
    value = String(value);
  }
  if (Array.isArray(value)) {
    this._error(new Error("Arrays are not supported."));
    return;
  }
  var header = this._multiPartHeader(field, value, options);
  var footer = this._multiPartFooter();
  append(header);
  append(value);
  append(footer);
  this._trackLength(header, value, options);
};
FormData.prototype._trackLength = function(header, value, options) {
  var valueLength = 0;
  if (options.knownLength != null) {
    valueLength += Number(options.knownLength);
  } else if (Buffer.isBuffer(value)) {
    valueLength = value.length;
  } else if (typeof value === "string") {
    valueLength = Buffer.byteLength(value);
  }
  this._valueLength += valueLength;
  this._overheadLength += Buffer.byteLength(header) + FormData.LINE_BREAK.length;
  if (!value || !value.path && !(value.readable && hasOwn(value, "httpVersion")) && !(value instanceof Stream)) {
    return;
  }
  if (!options.knownLength) {
    this._valuesToMeasure.push(value);
  }
};
FormData.prototype._lengthRetriever = function(value, callback) {
  if (hasOwn(value, "fd")) {
    if (value.end != void 0 && value.end != Infinity && value.start != void 0) {
      callback(null, value.end + 1 - (value.start ? value.start : 0));
    } else {
      fs.stat(value.path, function(err, stat) {
        if (err) {
          callback(err);
          return;
        }
        var fileSize = stat.size - (value.start ? value.start : 0);
        callback(null, fileSize);
      });
    }
  } else if (hasOwn(value, "httpVersion")) {
    callback(null, Number(value.headers["content-length"]));
  } else if (hasOwn(value, "httpModule")) {
    value.on("response", function(response) {
      value.pause();
      callback(null, Number(response.headers["content-length"]));
    });
    value.resume();
  } else {
    callback("Unknown stream");
  }
};
FormData.prototype._multiPartHeader = function(field, value, options) {
  if (typeof options.header === "string") {
    return options.header;
  }
  var contentDisposition = this._getContentDisposition(value, options);
  var contentType = this._getContentType(value, options);
  var contents = "";
  var headers = {
    // add custom disposition as third element or keep it two elements if not
    "Content-Disposition": ["form-data", 'name="' + field + '"'].concat(contentDisposition || []),
    // if no content type. allow it to be empty array
    "Content-Type": [].concat(contentType || [])
  };
  if (typeof options.header === "object") {
    populate(headers, options.header);
  }
  var header;
  for (var prop in headers) {
    if (hasOwn(headers, prop)) {
      header = headers[prop];
      if (header == null) {
        continue;
      }
      if (!Array.isArray(header)) {
        header = [header];
      }
      if (header.length) {
        contents += prop + ": " + header.join("; ") + FormData.LINE_BREAK;
      }
    }
  }
  return "--" + this.getBoundary() + FormData.LINE_BREAK + contents + FormData.LINE_BREAK;
};
FormData.prototype._getContentDisposition = function(value, options) {
  var filename;
  if (typeof options.filepath === "string") {
    filename = path.normalize(options.filepath).replace(/\\/g, "/");
  } else if (options.filename || value && (value.name || value.path)) {
    filename = path.basename(options.filename || value && (value.name || value.path));
  } else if (value && value.readable && hasOwn(value, "httpVersion")) {
    filename = path.basename(value.client._httpMessage.path || "");
  }
  if (filename) {
    return 'filename="' + filename + '"';
  }
};
FormData.prototype._getContentType = function(value, options) {
  var contentType = options.contentType;
  if (!contentType && value && value.name) {
    contentType = mime.lookup(value.name);
  }
  if (!contentType && value && value.path) {
    contentType = mime.lookup(value.path);
  }
  if (!contentType && value && value.readable && hasOwn(value, "httpVersion")) {
    contentType = value.headers["content-type"];
  }
  if (!contentType && (options.filepath || options.filename)) {
    contentType = mime.lookup(options.filepath || options.filename);
  }
  if (!contentType && value && typeof value === "object") {
    contentType = FormData.DEFAULT_CONTENT_TYPE;
  }
  return contentType;
};
FormData.prototype._multiPartFooter = function() {
  return (function(next) {
    var footer = FormData.LINE_BREAK;
    var lastPart = this._streams.length === 0;
    if (lastPart) {
      footer += this._lastBoundary();
    }
    next(footer);
  }).bind(this);
};
FormData.prototype._lastBoundary = function() {
  return "--" + this.getBoundary() + "--" + FormData.LINE_BREAK;
};
FormData.prototype.getHeaders = function(userHeaders) {
  var header;
  var formHeaders = {
    "content-type": "multipart/form-data; boundary=" + this.getBoundary()
  };
  for (header in userHeaders) {
    if (hasOwn(userHeaders, header)) {
      formHeaders[header.toLowerCase()] = userHeaders[header];
    }
  }
  return formHeaders;
};
FormData.prototype.setBoundary = function(boundary) {
  if (typeof boundary !== "string") {
    throw new TypeError("FormData boundary must be a string");
  }
  this._boundary = boundary;
};
FormData.prototype.getBoundary = function() {
  if (!this._boundary) {
    this._generateBoundary();
  }
  return this._boundary;
};
FormData.prototype.getBuffer = function() {
  var dataBuffer = new Buffer.alloc(0);
  var boundary = this.getBoundary();
  for (var i = 0, len = this._streams.length; i < len; i++) {
    if (typeof this._streams[i] !== "function") {
      if (Buffer.isBuffer(this._streams[i])) {
        dataBuffer = Buffer.concat([dataBuffer, this._streams[i]]);
      } else {
        dataBuffer = Buffer.concat([dataBuffer, Buffer.from(this._streams[i])]);
      }
      if (typeof this._streams[i] !== "string" || this._streams[i].substring(2, boundary.length + 2) !== boundary) {
        dataBuffer = Buffer.concat([dataBuffer, Buffer.from(FormData.LINE_BREAK)]);
      }
    }
  }
  return Buffer.concat([dataBuffer, Buffer.from(this._lastBoundary())]);
};
FormData.prototype._generateBoundary = function() {
  this._boundary = "--------------------------" + crypto$1.randomBytes(12).toString("hex");
};
FormData.prototype.getLengthSync = function() {
  var knownLength = this._overheadLength + this._valueLength;
  if (this._streams.length) {
    knownLength += this._lastBoundary().length;
  }
  if (!this.hasKnownLength()) {
    this._error(new Error("Cannot calculate proper length in synchronous way."));
  }
  return knownLength;
};
FormData.prototype.hasKnownLength = function() {
  var hasKnownLength = true;
  if (this._valuesToMeasure.length) {
    hasKnownLength = false;
  }
  return hasKnownLength;
};
FormData.prototype.getLength = function(cb) {
  var knownLength = this._overheadLength + this._valueLength;
  if (this._streams.length) {
    knownLength += this._lastBoundary().length;
  }
  if (!this._valuesToMeasure.length) {
    process.nextTick(cb.bind(this, null, knownLength));
    return;
  }
  asynckit.parallel(this._valuesToMeasure, this._lengthRetriever, function(err, values) {
    if (err) {
      cb(err);
      return;
    }
    values.forEach(function(length) {
      knownLength += length;
    });
    cb(null, knownLength);
  });
};
FormData.prototype.submit = function(params, cb) {
  var request;
  var options;
  var defaults = { method: "post" };
  if (typeof params === "string") {
    params = parseUrl(params);
    options = populate({
      port: params.port,
      path: params.pathname,
      host: params.hostname,
      protocol: params.protocol
    }, defaults);
  } else {
    options = populate(params, defaults);
    if (!options.port) {
      options.port = options.protocol === "https:" ? 443 : 80;
    }
  }
  options.headers = this.getHeaders(params.headers);
  if (options.protocol === "https:") {
    request = https.request(options);
  } else {
    request = http.request(options);
  }
  this.getLength((function(err, length) {
    if (err && err !== "Unknown stream") {
      this._error(err);
      return;
    }
    if (length) {
      request.setHeader("Content-Length", length);
    }
    this.pipe(request);
    if (cb) {
      var onResponse;
      var callback = function(error, responce) {
        request.removeListener("error", callback);
        request.removeListener("response", onResponse);
        return cb.call(this, error, responce);
      };
      onResponse = callback.bind(this, null);
      request.on("error", callback);
      request.on("response", onResponse);
    }
  }).bind(this));
  return request;
};
FormData.prototype._error = function(err) {
  if (!this.error) {
    this.error = err;
    this.pause();
    this.emit("error", err);
  }
};
FormData.prototype.toString = function() {
  return "[object FormData]";
};
setToStringTag(FormData.prototype, "FormData");
var form_data = FormData;
const formData = /* @__PURE__ */ getDefaultExportFromCjs(form_data);
let backupInterval = null;
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1e3;
async function uploadBackup(filePath, branchId = "default") {
  try {
    if (!fs$3.existsSync(filePath)) {
      console.error(`Backup file not found for upload: ${filePath}`);
      return false;
    }
    const stats = fs$3.statSync(filePath);
    const fileSizeInMegabytes = stats.size / (1024 * 1024);
    console.log(`Starting upload of ${filePath} (${fileSizeInMegabytes.toFixed(2)} MB)`);
    const form = new formData();
    form.append("file", fs$3.createReadStream(filePath));
    form.append("branchId", branchId);
    const targetUrl = process.env.CLOUD_API_URL || "http://127.0.0.1:3000/api/backup/upload";
    const response = await fetch$1(targetUrl, {
      method: "POST",
      body: form,
      headers: {
        ...form.getHeaders(),
        "x-backup-secret": process.env.BACKUP_SECRET_KEY || "R$i1999s$a"
      }
    });
    if (response.ok) {
      const data = await response.json();
      console.log("Cloud backup upload successful:", data);
      return true;
    } else {
      console.error(`Cloud backup upload failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error("Response:", text);
      return false;
    }
  } catch (error) {
    console.error("Error uploading backup:", error);
    return false;
  }
}
function initBackupScheduler() {
  console.log("Initializing Cloud Backup Scheduler (Every 6 Hours)");
  if (backupInterval) {
    clearInterval(backupInterval);
  }
  setTimeout(async () => {
    await performCloudBackup();
  }, 1 * 60 * 1e3);
  backupInterval = setInterval(async () => {
    await performCloudBackup();
  }, BACKUP_INTERVAL_MS);
}
async function performCloudBackup() {
  try {
    console.log("Performing scheduled cloud backup...");
    const result = await createBackup();
    if (result.success && result.path) {
      await uploadBackup(result.path, "default-branch");
    } else {
      console.error("Scheduled backup creation failed:", result.error);
    }
  } catch (error) {
    console.error("Scheduled backup execution error:", error);
  }
}
const ZAINCASH_MERCHANT_ID = process.env.ZAINCASH_MERCHANT_ID || "5ffacf6612b5777c6d44d6d6";
const ZAINCASH_SECRET = process.env.ZAINCASH_SECRET || "$2y$10$hBbAZo2GfSSvyqAyV2SaqOfYnjJLUGwdahiZYuy2CI3af8v1YIDC6";
const ZAINCASH_BASE_URL = process.env.ZAINCASH_BASE_URL || "https://test.zaincash.iq";
function generateZainCashToken(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const base64Header = Buffer.from(JSON.stringify(header)).toString(
    "base64url"
  );
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );
  const signature = require$$1.createHmac("sha256", ZAINCASH_SECRET).update(`${base64Header}.${base64Payload}`).digest("base64url");
  return `${base64Header}.${base64Payload}.${signature}`;
}
const distPath = path$1.join(__dirname, "../dist");
process.env.DIST = distPath;
const publicPath = electron.app.isPackaged ? distPath : path$1.join(distPath, "../public");
process.env.VITE_PUBLIC = publicPath;
let win;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
function createWindow() {
  win = new electron.BrowserWindow({
    icon: path$1.join(publicPath, "electron-vite.svg"),
    webPreferences: {
      preload: path$1.join(__dirname, "preload.js")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path$1.join(distPath, "index.html"));
  }
}
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
electron.app.on("before-quit", async () => {
  console.log("Creating auto-backup before quit...");
  await createBackup();
  cleanupOldBackups(10);
});
let pendingSyncInProgress = false;
const MAX_PENDING_DELETE_ATTEMPTS = 8;
const RETRY_BASE_MS = 3e4;
const RETRY_MAX_MS = 15 * 6e4;
const AUTO_RETRY_INTERVAL_MS = 60 * 1e3;
function parseIsoDate(value) {
  if (!value) return 0;
  const ts2 = Date.parse(value);
  return Number.isFinite(ts2) ? ts2 : 0;
}
function computeNextRetryAt(attempts) {
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.max(1, attempts));
  return new Date(Date.now() + delay).toISOString();
}
async function fetchCloudProductsForBranch(branchId) {
  for (const base of getApiCandidates()) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8e3);
      const response = await fetch(
        `${base}/sync/products?branchId=${encodeURIComponent(branchId)}`,
        {
          method: "GET",
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);
      if (!response.ok) continue;
      setApiBaseUrl(base);
      const data = await response.json();
      return Array.isArray(data == null ? void 0 : data.drugs) ? data.drugs : [];
    } catch {
    }
  }
  return null;
}
async function isAddInventoryLikelyAlreadySynced(action) {
  if (action.type !== "add-inventory") return false;
  const drugId = String(action.payload.drugId || "").trim();
  const inventoryId = String(action.payload.id || "").trim();
  const branchId = String(action.payload.branchId || "").trim();
  const quantity = Number(action.payload.quantity || 0);
  if (!drugId || !branchId || !Number.isFinite(quantity) || quantity <= 0) {
    return false;
  }
  const drugs = await fetchCloudProductsForBranch(branchId);
  if (!drugs) return false;
  const cloudDrug = drugs.find((d) => String(d.id || "") === drugId);
  if (!cloudDrug) return false;
  if (inventoryId) {
    const cloudInventoryId = String(cloudDrug.inventoryId || "").trim();
    if (cloudInventoryId && cloudInventoryId !== inventoryId) {
      return false;
    }
  }
  const cloudStock = Number(cloudDrug.stock || 0);
  return cloudStock >= quantity;
}
async function isDeleteInventoryLikelyAlreadySynced(action) {
  if (action.type !== "delete-inventory") return false;
  const inventoryId = String(action.payload.inventoryId || "").trim();
  const drugId = String(action.payload.drugId || "").trim();
  const branchId = String(
    action.payload.branchId || store.get("branchId") || ""
  ).trim();
  if (!inventoryId || !branchId) {
    return false;
  }
  const drugs = await fetchCloudProductsForBranch(branchId);
  if (!drugs) return false;
  const sameInventory = drugs.find(
    (d) => String(d.inventoryId || "").trim() === inventoryId
  );
  if (sameInventory) {
    return false;
  }
  if (drugId) {
    const sameDrug = drugs.find((d) => String(d.id || "").trim() === drugId);
    if (sameDrug) {
      return false;
    }
  }
  return true;
}
function normalizePendingSyncActions(rawActions) {
  const createDrugById = /* @__PURE__ */ new Map();
  const addInventoryById = /* @__PURE__ */ new Map();
  const deleteInventoryById = /* @__PURE__ */ new Map();
  const addBatchById = /* @__PURE__ */ new Map();
  const updateInventoryById = /* @__PURE__ */ new Map();
  for (const action of rawActions) {
    if (!action || typeof action !== "object") continue;
    if (!action.id || !action.type || !action.payload || typeof action.payload !== "object")
      continue;
    if (action.type === "create-drug") {
      const drugId = String(action.payload.id || "").trim();
      if (!drugId) continue;
      createDrugById.set(drugId, action);
      continue;
    }
    if (action.type === "add-inventory") {
      const inventoryId = String(action.payload.id || "").trim();
      if (!inventoryId) continue;
      addInventoryById.set(inventoryId, action);
      continue;
    }
    if (action.type === "delete-inventory") {
      if (action.attempts >= MAX_PENDING_DELETE_ATTEMPTS) {
        continue;
      }
      const inventoryId = String(action.payload.inventoryId || "").trim();
      if (!inventoryId) continue;
      deleteInventoryById.set(inventoryId, action);
    }
    if (action.type === "add-batch") {
      addBatchById.set(action.id, action);
      continue;
    }
    if (action.type === "update-inventory") {
      const inventoryId = String(action.payload.inventoryId || "").trim();
      if (!inventoryId) continue;
      updateInventoryById.set(inventoryId, action);
      continue;
    }
  }
  for (const inventoryId of Array.from(addInventoryById.keys())) {
    if (deleteInventoryById.has(inventoryId)) {
      addInventoryById.delete(inventoryId);
      deleteInventoryById.delete(inventoryId);
    }
  }
  return [
    ...createDrugById.values(),
    ...addInventoryById.values(),
    ...deleteInventoryById.values(),
    ...addBatchById.values(),
    ...updateInventoryById.values()
  ].sort((a, b2) => parseIsoDate(a.createdAt) - parseIsoDate(b2.createdAt));
}
function getPendingSyncActions() {
  const actions = store.get("pendingSyncActions");
  return normalizePendingSyncActions(Array.isArray(actions) ? actions : []);
}
function buildSyncHealthSnapshot(actions = getPendingSyncActions()) {
  const now = Date.now();
  const byType = {
    "create-drug": 0,
    "add-inventory": 0,
    "delete-inventory": 0,
    "add-batch": 0,
    "update-inventory": 0
  };
  let failedCount = 0;
  let oldestTs = 0;
  let nextRetryTs = 0;
  let topErrorAction = null;
  for (const action of actions) {
    if (!action || !action.type) continue;
    byType[action.type] += 1;
    if (action.attempts > 0 || action.lastError) {
      failedCount += 1;
    }
    const createdTs = parseIsoDate(action.createdAt);
    if (createdTs > 0 && (oldestTs === 0 || createdTs < oldestTs)) {
      oldestTs = createdTs;
    }
    const retryTs = parseIsoDate(action.nextRetryAt);
    if (retryTs > now && (nextRetryTs === 0 || retryTs < nextRetryTs)) {
      nextRetryTs = retryTs;
    }
    if (action.lastError) {
      if (!topErrorAction || action.attempts > topErrorAction.attempts) {
        topErrorAction = action;
      }
    }
  }
  return {
    syncMode: "auto",
    pendingCount: actions.length,
    failedCount,
    inProgress: pendingSyncInProgress,
    oldestPendingAt: oldestTs > 0 ? new Date(oldestTs).toISOString() : null,
    oldestPendingAgeSec: oldestTs > 0 ? Math.max(0, Math.floor((now - oldestTs) / 1e3)) : 0,
    nextRetryAt: nextRetryTs > 0 ? new Date(nextRetryTs).toISOString() : null,
    nextRetryInSec: nextRetryTs > 0 ? Math.max(0, Math.ceil((nextRetryTs - now) / 1e3)) : null,
    byType,
    topError: (topErrorAction == null ? void 0 : topErrorAction.lastError) || null,
    autoRetryIntervalSec: Math.floor(AUTO_RETRY_INTERVAL_MS / 1e3),
    nextAutoRunAt: null,
    nextAutoRunInSec: null
  };
}
function setPendingSyncActions(actions) {
  const normalized = normalizePendingSyncActions(actions);
  store.set("pendingSyncActions", normalized);
  const count = normalized.length;
  const health = buildSyncHealthSnapshot(normalized);
  electron.BrowserWindow.getAllWindows().forEach((window2) => {
    window2.webContents.send("pending-sync-count", count);
    window2.webContents.send("sync-health-updated", health);
  });
}
function enqueuePendingSyncAction(type2, payload) {
  const actions = getPendingSyncActions();
  actions.push({
    id: node_crypto.randomUUID(),
    type: type2,
    payload,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    attempts: 0
  });
  setPendingSyncActions(actions);
}
async function executePendingSyncAction(action) {
  switch (action.type) {
    case "create-drug":
      return await pushCreateDrugToCloud(
        action.payload,
        { actionId: action.id }
      );
    case "add-inventory":
      return await pushAddToInventoryToCloud(
        action.payload,
        { actionId: action.id }
      );
    case "delete-inventory": {
      const inventoryId = String(action.payload.inventoryId || "");
      if (!inventoryId) return false;
      return await pushDeleteInventoryFromCloud(inventoryId, {
        actionId: action.id
      });
    }
    case "add-batch":
      return await pushAddBatchToCloud(
        action.payload,
        { actionId: action.id }
      );
    case "update-inventory":
      return await pushUpdateInventoryToCloud(
        action.payload,
        { actionId: action.id }
      );
    default:
      return false;
  }
}
async function processPendingSyncActions() {
  if (pendingSyncInProgress) {
    return {
      success: true,
      processed: 0,
      failed: 0,
      pending: getPendingSyncActions().length,
      health: buildSyncHealthSnapshot()
    };
  }
  const snapshot = getPendingSyncActions();
  if (snapshot.length === 0) {
    return {
      success: true,
      processed: 0,
      failed: 0,
      pending: 0,
      health: buildSyncHealthSnapshot(snapshot)
    };
  }
  pendingSyncInProgress = true;
  let processed = 0;
  let failed = 0;
  const succeededIds = /* @__PURE__ */ new Set();
  const failedUpdates = /* @__PURE__ */ new Map();
  try {
    for (const action of snapshot) {
      const nextRetryTs = parseIsoDate(action.nextRetryAt);
      if (nextRetryTs > Date.now()) {
        continue;
      }
      if (action.type === "delete-inventory" && action.attempts > 0) {
        const alreadySynced = await isDeleteInventoryLikelyAlreadySynced(action);
        if (alreadySynced) {
          console.log(
            "[SyncQueue] Dropping pending delete-inventory action because cloud snapshot no longer contains it.",
            action.payload
          );
          processed += 1;
          succeededIds.add(action.id);
          continue;
        }
      }
      if (action.type === "add-inventory" && action.attempts > 0) {
        const alreadySynced = await isAddInventoryLikelyAlreadySynced(action);
        if (alreadySynced) {
          console.log(
            "[SyncQueue] Dropping pending add-inventory action because cloud stock already reflects it.",
            action.payload
          );
          processed += 1;
          succeededIds.add(action.id);
          continue;
        }
      }
      try {
        const ok = await executePendingSyncAction(action);
        if (ok) {
          processed += 1;
          succeededIds.add(action.id);
        } else {
          if (action.type === "add-inventory") {
            const alreadySynced = await isAddInventoryLikelyAlreadySynced(action);
            if (alreadySynced) {
              console.log(
                "[SyncQueue] Add-inventory failed but cloud already has the stock. Marking as synced.",
                action.payload
              );
              processed += 1;
              succeededIds.add(action.id);
              continue;
            }
          }
          if (action.type === "delete-inventory") {
            const alreadySynced = await isDeleteInventoryLikelyAlreadySynced(action);
            if (alreadySynced) {
              console.log(
                "[SyncQueue] Delete-inventory failed but cloud snapshot no longer contains it. Marking as synced.",
                action.payload
              );
              processed += 1;
              succeededIds.add(action.id);
              continue;
            }
          }
          const nextAttempts = action.attempts + 1;
          if (action.type === "delete-inventory" && nextAttempts >= MAX_PENDING_DELETE_ATTEMPTS) {
            console.warn(
              `[SyncQueue] Dropping stale delete action after ${nextAttempts} failures`,
              action.payload
            );
            succeededIds.add(action.id);
            continue;
          }
          failed += 1;
          failedUpdates.set(action.id, {
            ...action,
            attempts: nextAttempts,
            lastError: "sync_failed",
            nextRetryAt: computeNextRetryAt(nextAttempts)
          });
        }
      } catch (error) {
        if (action.type === "add-inventory") {
          const alreadySynced = await isAddInventoryLikelyAlreadySynced(action);
          if (alreadySynced) {
            console.log(
              "[SyncQueue] Add-inventory errored but cloud already has the stock. Marking as synced.",
              action.payload
            );
            processed += 1;
            succeededIds.add(action.id);
            continue;
          }
        }
        if (action.type === "delete-inventory") {
          const alreadySynced = await isDeleteInventoryLikelyAlreadySynced(action);
          if (alreadySynced) {
            console.log(
              "[SyncQueue] Delete-inventory errored but cloud snapshot no longer contains it. Marking as synced.",
              action.payload
            );
            processed += 1;
            succeededIds.add(action.id);
            continue;
          }
        }
        const nextAttempts = action.attempts + 1;
        const isPermanentError = nextAttempts >= 5 || error instanceof Error && error.message.includes("Client Error 4");
        if (isPermanentError) {
          console.error(
            `[SyncQueue] Route to DLQ. Action ${action.type}. Attempts: ${nextAttempts}. Error:`,
            error
          );
          try {
            await prisma.syncFailure.create({
              data: {
                entityType: action.type.toUpperCase(),
                entityId: action.id,
                payload: JSON.stringify(action.payload),
                errorMessage: error instanceof Error ? error.message : String(error)
              }
            });
            succeededIds.add(action.id);
            store.set("syncFailureFlag", Date.now());
            electron.BrowserWindow.getAllWindows().forEach((win2) => {
              win2.webContents.send("sync-failure-recorded");
            });
          } catch (dlqErr) {
            console.error("[SyncQueue] Failed to save to DLQ:", dlqErr);
          }
          continue;
        }
        failed += 1;
        failedUpdates.set(action.id, {
          ...action,
          attempts: nextAttempts,
          lastError: error instanceof Error ? error.message : String(error),
          nextRetryAt: computeNextRetryAt(nextAttempts)
        });
      }
    }
    const latest = getPendingSyncActions().filter((action) => !succeededIds.has(action.id)).map((action) => failedUpdates.get(action.id) ?? action);
    setPendingSyncActions(latest);
    const health = buildSyncHealthSnapshot(latest);
    return {
      success: failed === 0,
      processed,
      failed,
      pending: latest.length,
      health
    };
  } finally {
    pendingSyncInProgress = false;
  }
}
const BUNDLED_PUBLIC_KEY = process.env.OFFLINE_TOKEN_PUBLIC_KEY || `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtklHweWPqIA+Itu55Y/q
SCY70KxHv/8l3XXmqTqPX7+AB1ACwHpZtUBNa5/pVgtf56saXBX50/WTVgoHqHAp
FukgB0JrZgArXM4ldbKGADLACup87JYdh1lwOz2C6xFuttWTrg5EqE75bkyjecI4
RHfz4PW2uBFBX1OfIi3KWzPha1JvbJ71QpRsOrg61uXvT+/cEcIiYpeVEyum818j
weItQoh1BAtZeTxLDt0Hu9XjqMszkgHuDZH8L9mdQnU/WWzefw5KjJrpa+a4zqw5
cIUKx7KdK9yNKScvEx0VoPjKouXQMkY+V50pm58uxKfZHQxf7r95v57X01Kzq/7E
9QIDAQAB
-----END PUBLIC KEY-----`;
async function checkOfflineSubscription() {
  const rawToken = loadOfflineToken();
  if (!rawToken) {
    console.warn(
      "[OfflineToken] No token found — subscription check skipped (first run or token missing)."
    );
    return;
  }
  const payload = await verifyAndDecodeToken(rawToken, BUNDLED_PUBLIC_KEY);
  if (!payload) {
    electron.BrowserWindow.getAllWindows().forEach(
      (w2) => w2.webContents.send("subscription:locked", { reason: "invalid-token" })
    );
    return;
  }
  const lastSeenAt = store.get("lastSeenAt") ? new Date(store.get("lastSeenAt")) : null;
  const state2 = evaluateSubscriptionState(payload, lastSeenAt);
  if (state2 !== "active") {
    electron.BrowserWindow.getAllWindows().forEach(
      (w2) => w2.webContents.send("subscription:locked", { reason: state2, payload })
    );
  }
}
electron.app.whenReady().then(() => {
  createWindow();
  setPendingSyncActions(getPendingSyncActions());
  if (win) {
    win.webContents.once("did-finish-load", () => {
      void checkOfflineSubscription();
    });
  }
  electron.powerMonitor.on("resume", () => {
    void checkOfflineSubscription();
  });
  startSyncService();
  setTimeout(() => {
    void processPendingSyncActions();
  }, 7e3);
  setInterval(() => {
    void processPendingSyncActions();
  }, AUTO_RETRY_INTERVAL_MS);
  electron.ipcMain.handle("get-connection-status", () => {
    return getConnectionStatus();
  });
  electron.ipcMain.handle("theme:get", () => store.get("theme", "system"));
  electron.ipcMain.handle("theme:set", (_, val) => {
    store.set("theme", val);
  });
  electron.ipcMain.handle("get-hardware-id", () => {
    return getDeviceIdentity();
  });
  electron.ipcMain.handle(
    "license:save-tenant-context",
    (_, context) => {
      store.set("organizationId", context.organizationId);
      store.set("organizationName", context.organizationName);
      store.set("branchId", context.branchId);
      console.log(
        `[License] Tenant context saved: org=${context.organizationName}, branch=${context.branchName}`
      );
      return { success: true };
    }
  );
  electron.ipcMain.handle(
    "license:activate",
    async (_, payload) => {
      for (const base of getApiCandidates()) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1e4);
          const res = await fetch(`${base}/license/activate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          setApiBaseUrl(base);
          const data = await res.json();
          return { ok: res.ok, status: res.status, data };
        } catch {
        }
      }
      return { ok: false, status: 0, data: { error: "SERVER_UNREACHABLE" } };
    }
  );
  electron.ipcMain.handle(
    "license:verify",
    async (_, payload) => {
      for (const base of getApiCandidates()) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8e3);
          const res = await fetch(`${base}/license/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          setApiBaseUrl(base);
          const data = await res.json();
          return { ok: res.ok, status: res.status, data };
        } catch {
        }
      }
      return { ok: false, status: 0, data: { error: "SERVER_UNREACHABLE" } };
    }
  );
  electron.ipcMain.handle("get-company-settings", async () => {
    try {
      return await prisma.companySettings.findFirst();
    } catch (error) {
      console.error("Failed to fetch company settings:", error);
      return null;
    }
  });
  electron.ipcMain.handle(
    "pos:check-interactions",
    async (_, scientificNames) => {
      if (!scientificNames || scientificNames.length < 2) return [];
      try {
        const interactions = await prisma.drugInteraction.findMany({
          where: {
            AND: [
              { drug1: { in: scientificNames } },
              { drug2: { in: scientificNames } }
            ]
          }
        });
        return interactions;
      } catch (error) {
        console.error("Failed to check interactions:", error);
        return [];
      }
    }
  );
  electron.ipcMain.handle(
    "pos:check-allergies",
    async (_, {
      scientificNames,
      patientId
    }) => {
      if (!patientId || !scientificNames || scientificNames.length === 0)
        return [];
      try {
        const patient = await prisma.patient.findUnique({
          where: { id: patientId },
          select: { allergies: true }
        });
        if (!patient || !patient.allergies) return [];
        const patientAllergyList = patient.allergies.toLowerCase().split(",").map((a) => a.trim()).filter(Boolean);
        if (patientAllergyList.length === 0) return [];
        const triggeredAllergies = scientificNames.filter(
          (name) => patientAllergyList.some(
            (allergy) => name.toLowerCase().includes(allergy) || allergy.includes(name.toLowerCase())
          )
        );
        return triggeredAllergies;
      } catch (error) {
        console.error("Failed to check allergies:", error);
        return [];
      }
    }
  );
  electron.ipcMain.handle(
    "check-drug-interaction",
    async (_, {
      newDrugScientificName,
      currentCartScientificNames
    }) => {
      try {
        if (!newDrugScientificName || !currentCartScientificNames || currentCartScientificNames.length === 0) {
          return { found: false, interactions: [] };
        }
        const target = newDrugScientificName.trim();
        const existing = currentCartScientificNames.map((d) => d.trim()).filter((d) => d !== target && d.length > 0);
        if (existing.length === 0) {
          return { found: false, interactions: [] };
        }
        const interactions = await prisma.drugInteraction.findMany({
          where: {
            OR: [
              {
                drug1: target,
                drug2: { in: existing }
              },
              {
                drug2: target,
                drug1: { in: existing }
              }
            ]
          }
        });
        if (interactions.length > 0) {
          return {
            found: true,
            interactions: interactions.map((i) => ({
              drug1: i.drug1,
              drug2: i.drug2,
              severity: i.severity,
              description: i.description
            }))
          };
        }
        return { found: false, interactions: [] };
      } catch (error) {
        console.error("Failed to check drug interactions:", error);
        return { found: false, interactions: [] };
      }
    }
  );
  electron.ipcMain.handle("get-users", async () => {
    return await prisma.user.findMany();
  });
  electron.ipcMain.handle("login", async (_event, { email, password }) => {
    try {
      console.log("IPC Login Request for:", email);
      try {
        let response = null;
        for (const base of getApiCandidates()) {
          try {
            const res = await fetch(`${base}/verify-user`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password })
            });
            if (res.ok) {
              setApiBaseUrl(base);
              response = res;
              break;
            }
          } catch {
          }
        }
        if (response == null ? void 0 : response.ok) {
          const data = await response.json();
          if (data.success && data.user) {
            const cloudUser = data.user;
            console.log(
              "Cloud Auth Success. Updating Local DB for:",
              cloudUser.email
            );
            console.log("Cloud Branch ID:", cloudUser.branchId);
            if (cloudUser.branchId) {
              const localBranch = await prisma.branch.findUnique({
                where: { id: cloudUser.branchId }
              });
              if (!localBranch) {
                console.log(
                  `Creating stub branch locally for ID: ${cloudUser.branchId}`
                );
                await prisma.branch.create({
                  data: {
                    id: cloudUser.branchId,
                    name: "Synced Branch"
                  }
                });
              }
            }
            const localUser = await prisma.user.findUnique({
              where: { email: cloudUser.email }
            });
            if (localUser) {
              const updateData = {
                name: cloudUser.name,
                role: cloudUser.role,
                branchId: cloudUser.branchId
              };
              if (localUser.id !== cloudUser.id) {
                console.log(
                  `Aligning local user ID ${localUser.id} -> ${cloudUser.id}`
                );
                updateData.id = cloudUser.id;
              }
              await prisma.user.update({
                where: { id: localUser.id },
                data: updateData
              });
            } else {
              await prisma.user.create({
                data: {
                  id: cloudUser.id,
                  email: cloudUser.email,
                  name: cloudUser.name,
                  password: bcrypt.hashSync(password, 10),
                  role: cloudUser.role,
                  branchId: cloudUser.branchId
                }
              });
            }
            const syncedUser = await prisma.user.findUnique({ where: { id: cloudUser.id } }) ?? await prisma.user.findUnique({
              where: { email: cloudUser.email }
            });
            if (!syncedUser) {
              return { success: false, error: "Failed to sync user locally" };
            }
            const { password: _password, ...safeUser } = syncedUser;
            if (safeUser.branchId) {
              store.set("branchId", safeUser.branchId);
              void processPendingSyncActions();
              try {
                console.log("Waiting for immediate sync...");
                await syncProducts();
                console.log("Immediate sync completed.");
              } catch (err) {
                console.error("Immediate product sync failed:", err);
              }
            }
            return { success: true, user: safeUser };
          }
        } else {
          console.log(
            "Cloud Auth Failed or Offline. Falling back to Local DB."
          );
        }
      } catch (netError) {
        console.error("Network Error during login (Offline Mode):", netError);
      }
      const user = await prisma.user.findFirst({ where: { email } });
      if (!user)
        return {
          success: false,
          error: "ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ط؛ظٹط± ظ…ظˆط¬ظˆط¯"
        };
      const isMatch = bcrypt.compareSync(password, user.password);
      if (isMatch) {
        const { password: password2, ...userWithoutPassword } = user;
        if (user.branchId) {
          console.log("Updating Store BranchID to:", user.branchId);
          store.set("branchId", user.branchId);
          void processPendingSyncActions();
        }
        return { success: true, user: userWithoutPassword };
      } else {
        return {
          success: false,
          error: "ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط؛ظٹط± طµط­ظٹط­ط©"
        };
      }
    } catch (error) {
      console.error("Login error:", error);
      return {
        success: false,
        error: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„"
      };
    }
  });
});
electron.ipcMain.handle("get-shift-status", async (_, { userId }) => {
  var _a2;
  try {
    const activeShift = await prisma.shift.findFirst({
      where: { userId, status: "OPEN" },
      include: { safe: true }
    });
    if (activeShift) {
      return {
        isWorking: true,
        startTime: activeShift.startTime,
        shiftId: activeShift.id,
        safeId: activeShift.safeId,
        safeName: (_a2 = activeShift.safe) == null ? void 0 : _a2.name
      };
    }
    return { isWorking: false };
  } catch (error) {
    console.error("Failed to get shift status:", error);
    return { isWorking: false };
  }
});
electron.ipcMain.handle("get-safes", async (_, { branchId }) => {
  try {
    return await prisma.safe.findMany({
      where: { branchId }
    });
  } catch (error) {
    console.error("Failed to get safes:", error);
    return [];
  }
});
electron.ipcMain.handle(
  "clock-in",
  async (_, { userId, branchId, safeId, startingCash }) => {
    try {
      const activeShift = await prisma.shift.findFirst({
        where: { userId, status: "OPEN" }
      });
      if (activeShift) {
        return { success: false, message: "لديك وردية مفتوحة بالفعل" };
      }
      await prisma.shift.create({
        data: {
          userId,
          branchId,
          safeId,
          startingCash: startingCash || 0,
          expectedCash: startingCash || 0,
          // Initial expected cash
          startTime: /* @__PURE__ */ new Date(),
          status: "OPEN"
        }
      });
      return { success: true };
    } catch (error) {
      console.error("Clock-in failed:", error);
      return { success: false, message: error.message };
    }
  }
);
electron.ipcMain.handle("get-shift-summary", async (_, { userId }) => {
  var _a2, _b;
  try {
    const activeShift = await prisma.shift.findFirst({
      where: { userId, status: "OPEN" },
      include: { safe: true }
    });
    if (!activeShift)
      return { success: false, message: "لا توجد وردية مفتوحة" };
    const safeBalance = ((_a2 = activeShift.safe) == null ? void 0 : _a2.balance) || 0;
    const salesCount = await prisma.sale.count({
      where: {
        userId,
        createdAt: { gte: activeShift.startTime }
      }
    });
    const salesTotal = await prisma.sale.aggregate({
      _sum: { total: true },
      where: {
        userId,
        createdAt: { gte: activeShift.startTime }
      }
    });
    return {
      success: true,
      summary: {
        startTime: activeShift.startTime,
        startingCash: activeShift.startingCash,
        expectedCash: safeBalance,
        // expected based on Safe current balance
        salesCount,
        salesTotalAmount: salesTotal._sum.total || 0,
        safeName: (_b = activeShift.safe) == null ? void 0 : _b.name
      }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});
electron.ipcMain.handle("clock-out", async (_, { userId, actualCash }) => {
  try {
    const activeShift = await prisma.shift.findFirst({
      where: { userId, status: "OPEN" },
      include: { safe: true }
    });
    if (!activeShift) {
      return { success: false, message: "لا توجد وردية مفتوحة" };
    }
    const endTime = /* @__PURE__ */ new Date();
    const durationMs = endTime.getTime() - activeShift.startTime.getTime();
    const durationHours = durationMs / (1e3 * 60 * 60);
    const expectedCash = activeShift.safe ? activeShift.safe.balance : 0;
    await prisma.shift.update({
      where: { id: activeShift.id },
      data: {
        endTime,
        status: "CLOSED",
        duration: durationHours,
        expectedCash,
        actualCash
      }
    });
    return { success: true };
  } catch (error) {
    console.error("Clock-out failed:", error);
    return { success: false, message: error.message };
  }
});
electron.ipcMain.handle(
  "process-cash-drop",
  async (_, { userId, amount, type: type2, note }) => {
    try {
      const activeShift = await prisma.shift.findFirst({
        where: { userId, status: "OPEN" },
        // @ts-ignore
        include: { safe: true }
      });
      if (!activeShift || !activeShift.safeId) {
        return { success: false, message: "لا توجد وردية مفتوحة بصندوق مخصص" };
      }
      const safeId = activeShift.safeId;
      const previousBalance = activeShift.safe ? activeShift.safe.balance : 0;
      const newBalance = type2 === "IN" ? previousBalance + amount : previousBalance - amount;
      await prisma.$transaction([
        // @ts-ignore
        prisma.transaction.create({
          data: {
            safeId,
            type: type2,
            amount,
            referenceType: "SHIFT_CASH_DROP",
            description: note || (type2 === "IN" ? "إيداع نقدي في الوردية" : "سحب نقدي من الوردية")
          }
        }),
        // @ts-ignore
        prisma.safe.update({
          where: { id: safeId },
          data: { balance: newBalance }
        })
      ]);
      return { success: true };
    } catch (error) {
      console.error("Cash drop failed:", error);
      return { success: false, message: error.message };
    }
  }
);
electron.ipcMain.handle("set-branch-id", (_, branchId) => {
  if (branchId) {
    console.log("Manual Sync: Setting BranchID to:", branchId);
    store.set("branchId", branchId);
    void processPendingSyncActions();
    return true;
  }
  return false;
});
electron.ipcMain.handle("trigger-sync", async () => {
  console.log("Manual Sync Triggered from Renderer");
  try {
    await syncSales();
    await syncProducts();
    void processPendingSyncActions();
    return { success: true };
  } catch (error) {
    console.error("trigger-sync failed:", error);
    return { success: false, error: error.message || String(error) };
  }
});
electron.ipcMain.handle("sync-debts", async () => {
  try {
    await syncDebtPayments();
    return { success: true };
  } catch (error) {
    console.error("sync-debts failed:", error);
    return { success: false, error: error.message || String(error) };
  }
});
electron.ipcMain.handle("get-products", async (_, arg) => {
  try {
    let searchTerm = "";
    let branchId = "";
    if (typeof arg === "string") {
      searchTerm = arg;
      branchId = String(store.get("branchId") || "");
    } else if (typeof arg === "object" && arg !== null) {
      searchTerm = arg.searchTerm || "";
      branchId = arg.branchId || "";
    }
    if (!branchId) {
      branchId = String(store.get("branchId") || "");
    }
    const effectiveBranchId = branchId;
    const term = searchTerm;
    const whereClause = {
      AND: [
        { isActive: true },
        term ? {
          OR: [
            { tradeName: { contains: term } },
            { scientificName: { contains: term } },
            { barcode: { contains: term } }
          ]
        } : {}
      ]
    };
    const products = await prisma.globalDrug.findMany({
      where: whereClause,
      include: {
        inventory: {
          where: effectiveBranchId ? { branchId: String(effectiveBranchId) } : {},
          include: {
            batches: {
              where: { quantity: { gt: 0 } },
              orderBy: { expiryDate: "asc" }
              // take: 1 // Don't limit here if we want to find the absolute nearest across multiple batches?
              // Actually take: 1 is per inventory item, which is fine if we only listed batches.
            }
          }
        }
      }
      // take: 50 // REMOVED LIMIT
    });
    return products.map((p) => {
      var _a2;
      const totalStock = p.inventory.reduce(
        (acc, inv) => acc + inv.quantity,
        0
      );
      const costPrice = ((_a2 = p.inventory[0]) == null ? void 0 : _a2.costPrice) || 0;
      const nearestBatch = p.inventory.flatMap((inv) => inv.batches).sort(
        (a, b2) => new Date(a.expiryDate).getTime() - new Date(b2.expiryDate).getTime()
      )[0];
      return {
        id: p.id,
        name: p.tradeName,
        scientificName: p.scientificName || "",
        origin: p.origin || "",
        price: p.price,
        costPrice,
        barcode: p.barcode,
        stock: totalStock,
        nearestExpiry: (nearestBatch == null ? void 0 : nearestBatch.expiryDate) || null
      };
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return [];
  }
});
electron.ipcMain.handle("sync-inventory", async () => {
  try {
    await syncProducts();
    return { success: true };
  } catch (error) {
    console.error("Manual sync failed:", error);
    return { success: false, error: error.message || String(error) };
  }
});
electron.ipcMain.handle("get-pending-sync-count", () => {
  return { count: getPendingSyncActions().length };
});
electron.ipcMain.handle("get-sync-health", () => {
  return buildSyncHealthSnapshot();
});
electron.ipcMain.handle("sync-pending-inventory", async () => {
  return await processPendingSyncActions();
});
electron.ipcMain.handle("get-today-sales", async (_, userId) => {
  try {
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const whereClause = {
      createdAt: { gte: today }
    };
    if (userId) {
      whereClause.userId = userId;
    }
    const sales = await prisma.sale.findMany({
      where: whereClause,
      include: {
        items: true,
        payment: true,
        returns: true
      },
      orderBy: { createdAt: "desc" },
      take: 10
    });
    const total = sales.reduce(
      (sum, s) => sum + (s.total || 0),
      0
    );
    const items = sales.reduce(
      (sum, s) => {
        var _a2;
        return sum + (((_a2 = s.items) == null ? void 0 : _a2.length) || 0);
      },
      0
    );
    return {
      sales: sales.slice(0, 5).map((s) => {
        var _a2, _b, _c2;
        return {
          id: s.id,
          total: s.total,
          createdAt: s.createdAt,
          paymentMethod: ((_a2 = s.payment) == null ? void 0 : _a2.method) || "CASH",
          itemCount: ((_b = s.items) == null ? void 0 : _b.length) || 0,
          returnsTotal: ((_c2 = s.returns) == null ? void 0 : _c2.reduce((sum, r) => sum + (r.total || 0), 0)) || 0
        };
      }),
      total,
      count: sales.length,
      items
    };
  } catch (error) {
    console.error("Error fetching today sales:", error);
    return { sales: [], total: 0, count: 0, items: 0 };
  }
});
electron.ipcMain.handle("get-inventory-items", async (_, { searchTerm, user }) => {
  try {
    const effectiveBranchId = String(
      (user == null ? void 0 : user.branchId) || store.get("branchId") || ""
    ).trim();
    if (!effectiveBranchId) {
      console.warn(
        "[Inventory] Branch ID is missing. Returning empty inventory list."
      );
      return [];
    }
    const whereClause = {
      AND: []
    };
    whereClause.AND.push({
      drug: {
        isActive: true
      }
    });
    whereClause.AND.push({ branchId: effectiveBranchId });
    if (searchTerm) {
      whereClause.AND.push({
        drug: {
          OR: [
            { tradeName: { contains: searchTerm } },
            { scientificName: { contains: searchTerm } },
            { barcode: { contains: searchTerm } }
          ]
        }
      });
    }
    const inventory = await prisma.inventory.findMany({
      where: whereClause,
      include: {
        drug: true,
        batches: true
      }
    });
    return inventory;
  } catch (error) {
    console.error("Error fetching inventory items:", error);
    return [];
  }
});
electron.ipcMain.handle("check-barcode-local", async (_, { barcode, branchId }) => {
  try {
    if (!barcode) return { exists: false };
    const drug = await prisma.globalDrug.findUnique({
      where: { barcode }
    });
    if (!drug || !drug.isActive) {
      return { exists: false };
    }
    const inventory = await prisma.inventory.findFirst({
      where: {
        drugId: drug.id,
        branchId
      },
      include: {
        drug: true
      }
    });
    return {
      exists: true,
      drug,
      inventory
    };
  } catch (error) {
    console.error("Error checking barcode locally:", error);
    return { exists: false, error: String(error) };
  }
});
electron.ipcMain.handle("create-global-drug-local", async (_, data) => {
  try {
    const parsedPrice = parseFloat(data.price) || 0;
    const parsedCost = parseFloat(data.costPrice) || 0;
    const parsedMinStock = parseInt(data.minStock, 10) || 10;
    const parsedMaxStock = parseInt(data.maxStock, 10) || 100;
    const parsedQuantity = data.quantity ? parseInt(data.quantity, 10) : 0;
    const drug = await prisma.globalDrug.create({
      data: {
        id: node_crypto.randomUUID(),
        tradeName: data.tradeName,
        scientificName: data.scientificName,
        barcode: data.barcode,
        origin: data.origin || "",
        price: parsedPrice,
        isActive: true
      }
    });
    const branchId = String(store.get("branchId") || "");
    if (branchId) {
      enqueuePendingSyncAction("create-drug", {
        id: drug.id,
        barcode: data.barcode,
        tradeName: data.tradeName,
        scientificName: data.scientificName,
        origin: data.origin,
        price: parsedPrice,
        cost: parsedCost,
        minStock: parsedMinStock,
        maxStock: parsedMaxStock,
        branchId,
        quantity: parsedQuantity,
        expiryDate: data.expiryDate
      });
      void processPendingSyncActions();
    }
    return {
      success: true,
      drug,
      pendingSyncCount: getPendingSyncActions().length
    };
  } catch (error) {
    console.error("Error creating global drug locally:", error);
    return { success: false, error: String(error) };
  }
});
electron.ipcMain.handle(
  "add-to-inventory-local",
  async (_, {
    drugId,
    branchId,
    costPrice,
    price,
    minStock,
    maxStock,
    quantity,
    expiryDate,
    skipCloudPush
  }) => {
    try {
      const parsedQuantity = parseInt(quantity, 10) || 0;
      const parsedCost = parseFloat(costPrice) || 0;
      const parsedPrice = parseFloat(price) || 0;
      const parsedMinStock = parseInt(minStock, 10) || 10;
      const parsedMaxStock = parseInt(maxStock, 10) || 100;
      const shouldSkipCloudPush = Boolean(skipCloudPush);
      const inventory = await prisma.inventory.create({
        data: {
          drugId,
          branchId,
          quantity: parsedQuantity,
          costPrice: parsedCost,
          minStock: parsedMinStock,
          maxStock: parsedMaxStock
        }
      });
      if (parsedQuantity > 0) {
        await prisma.batch.create({
          data: {
            inventoryId: inventory.id,
            quantity: parsedQuantity,
            costPrice: parsedCost,
            batchNumber: "INIT-" + (/* @__PURE__ */ new Date()).getTime().toString().slice(-6),
            expiryDate: expiryDate ? new Date(expiryDate) : new Date((/* @__PURE__ */ new Date()).setFullYear((/* @__PURE__ */ new Date()).getFullYear() + 1))
          }
        });
      }
      const effectiveBranchId = String(branchId || store.get("branchId") || "");
      if (effectiveBranchId && !shouldSkipCloudPush) {
        enqueuePendingSyncAction("add-inventory", {
          id: inventory.id,
          drugId,
          branchId: effectiveBranchId,
          costPrice: parsedCost,
          price: parsedPrice,
          quantity: parsedQuantity,
          minStock: parsedMinStock,
          maxStock: parsedMaxStock,
          expiryDate
        });
        void processPendingSyncActions();
      }
      return {
        success: true,
        inventory,
        pendingSyncCount: getPendingSyncActions().length
      };
    } catch (error) {
      console.error("Error adding to inventory locally:", error);
      return { success: false, error: String(error) };
    }
  }
);
electron.ipcMain.handle("update-inventory-item", async (_, data) => {
  const { id: id2, drugId, price, costPrice, minStock, maxStock } = data;
  try {
    console.log("!!! IPC: update-inventory-item received:", data);
    const updPrice = parseFloat(price);
    const updCost = parseFloat(costPrice);
    const updMin = parseInt(minStock, 10);
    const updMax = parseInt(maxStock, 10);
    const updatedDrug = await prisma.globalDrug.update({
      where: { id: drugId },
      data: { price: isNaN(updPrice) ? 0 : updPrice }
    });
    console.log(
      "!!! DB: Updated GlobalDrug:",
      updatedDrug.id,
      "Price:",
      updatedDrug.price
    );
    const updatedInventory = await prisma.inventory.update({
      where: { id: id2 },
      data: {
        costPrice: isNaN(updCost) ? 0 : updCost,
        minStock: isNaN(updMin) ? 10 : updMin,
        maxStock: isNaN(updMax) ? 100 : updMax
      }
    });
    console.log(
      "!!! DB: Updated Inventory:",
      updatedInventory.id,
      "CostPrice:",
      updatedInventory.costPrice
    );
    const branchId = updatedInventory.branchId || String(store.get("branchId") || "");
    enqueuePendingSyncAction("update-inventory", {
      inventoryId: id2,
      drugId,
      branchId,
      price: isNaN(updPrice) ? 0 : updPrice,
      costPrice: isNaN(updCost) ? 0 : updCost,
      minStock: isNaN(updMin) ? 10 : updMin,
      maxStock: isNaN(updMax) ? 100 : updMax
    });
    void processPendingSyncActions();
    return { success: true, pendingSyncCount: getPendingSyncActions().length };
  } catch (error) {
    console.error("!!! IPC Error updating inventory item:", error);
    return { success: false, error: String(error) };
  }
});
electron.ipcMain.handle("delete-inventory-item", async (_, id2) => {
  try {
    const existingInventory = await prisma.inventory.findUnique({
      where: { id: String(id2) },
      select: { id: true, branchId: true, drugId: true }
    });
    if (!existingInventory) {
      return {
        success: true,
        pendingSyncCount: getPendingSyncActions().length
      };
    }
    await prisma.batch.deleteMany({
      where: { inventoryId: existingInventory.id }
    });
    await prisma.inventory.delete({ where: { id: existingInventory.id } });
    enqueuePendingSyncAction("delete-inventory", {
      inventoryId: existingInventory.id,
      drugId: existingInventory.drugId,
      branchId: existingInventory.branchId || String(store.get("branchId") || "")
    });
    void processPendingSyncActions();
    return { success: true, pendingSyncCount: getPendingSyncActions().length };
  } catch (error) {
    console.error("Error deleting inventory item:", error);
    return { success: false, error: "Failed to delete item" };
  }
});
electron.ipcMain.handle(
  "add-inventory-batch",
  async (_event, { inventoryId, quantity, costPrice, expiryDate, supplierId }) => {
    try {
      const qty = parseInt(quantity, 10);
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const batchNumber = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      await prisma.$transaction([
        prisma.batch.create({
          data: {
            inventoryId,
            batchNumber,
            quantity: qty,
            costPrice: parseFloat(costPrice) || 0,
            expiryDate: new Date(expiryDate),
            supplierId: supplierId || null
          }
        }),
        prisma.inventory.update({
          where: { id: inventoryId },
          data: { quantity: { increment: qty } }
        })
      ]);
      const inventory = await prisma.inventory.findUnique({
        where: { id: inventoryId },
        select: { id: true, drugId: true, branchId: true }
      });
      if (inventory) {
        enqueuePendingSyncAction("add-batch", {
          inventoryId: inventory.id,
          batchNumber,
          quantity: qty,
          costPrice: parseFloat(costPrice) || 0,
          expiryDate: new Date(expiryDate).toISOString(),
          drugId: inventory.drugId,
          branchId: inventory.branchId || String(store.get("branchId") || ""),
          supplierId: supplierId || null
        });
        void processPendingSyncActions();
      }
      return {
        success: true,
        pendingSyncCount: getPendingSyncActions().length
      };
    } catch (error) {
      console.error("Error adding batch:", error);
      return { success: false, error: "Failed to add batch" };
    }
  }
);
electron.ipcMain.handle("get-local-suppliers", async () => {
  try {
    return await prisma.supplier.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    });
  } catch (error) {
    console.error("Error fetching local suppliers:", error);
    return [];
  }
});
electron.ipcMain.handle("get-settings", async () => {
  try {
    return await prisma.companySettings.findFirst();
  } catch (error) {
    console.error("Failed to fetch settings", error);
    return null;
  }
});
electron.ipcMain.handle(
  "get-patients",
  async (_event, { branchId } = {}) => {
    const where = {};
    if (branchId) {
      where.OR = [{ branchId }, { branchId: null }];
    }
    return await prisma.patient.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { loyaltyAccount: true }
    });
  }
);
electron.ipcMain.handle(
  "search-patients",
  async (_event, query, branchId) => {
    const where = {
      AND: [
        {
          OR: [{ name: { contains: query } }, { phone: { contains: query } }]
        }
      ]
    };
    if (branchId) {
      where.AND.push({ OR: [{ branchId }, { branchId: null }] });
    }
    return await prisma.patient.findMany({
      where,
      take: 10,
      include: { loyaltyAccount: true }
    });
  }
);
electron.ipcMain.handle("create-patient", async (_event, data) => {
  try {
    const patient = await prisma.patient.create({
      data: {
        name: data.name,
        phone: data.phone,
        gender: data.gender,
        allergies: "",
        chronicDiseases: "",
        branchId: data.branchId || null
      },
      include: { loyaltyAccount: true }
    });
    const settings = await prisma.companySettings.findFirst();
    if (settings == null ? void 0 : settings.loyaltyEnabled) {
      await prisma.loyaltyAccount.create({
        data: {
          patientId: patient.id,
          totalPoints: 0,
          lifetimePoints: 0,
          tier: "BRONZE"
        }
      });
    }
    pushPatient(patient).catch(
      (err) => console.error("Failed to push patient to cloud:", err)
    );
    const updated = await prisma.patient.findUnique({
      where: { id: patient.id },
      include: { loyaltyAccount: true }
    });
    return { success: true, patient: updated };
  } catch (error) {
    console.error("Failed to create patient:", error);
    return {
      success: false,
      error: "ظپط´ظ„ ط¥ظ†ط´ط§ط، ظ…ظ„ظپ ط§ظ„ظ…ط±ظٹط¶ (ظ‚ط¯ ظٹظƒظˆظ† ط±ظ‚ظ… ط§ظ„ظ‡ط§طھظپ ظ…ظƒط±ط±)"
    };
  }
});
electron.ipcMain.handle(
  "process-sale",
  async (_event, {
    items,
    total,
    userId,
    patientId,
    discount,
    pointsRedeemed,
    paymentMethod
  }) => {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const validUser = userId ? await tx.user.findUnique({ where: { id: userId } }) : null;
        const validPatient = patientId ? await tx.patient.findUnique({ where: { id: patientId } }) : null;
        const isCredit = paymentMethod === "CREDIT";
        if (isCredit && !validPatient) {
          throw new Error("ظٹط¬ط¨ طھط­ط¯ظٹط¯ ط¹ظ…ظٹظ„ ظ„ظ„ط¨ظٹط¹ ط¨ط§ظ„ط¢ط¬ظ„");
        }
        const incomingItems = Array.isArray(items) ? items : [];
        const requestedDrugIds = Array.from(
          new Set(incomingItems.map((item) => String(item.id)))
        );
        const existingDrugs = requestedDrugIds.length > 0 ? await tx.globalDrug.findMany({
          where: { id: { in: requestedDrugIds } },
          select: { id: true }
        }) : [];
        const validDrugIds = new Set(existingDrugs.map((d) => d.id));
        const validItems = incomingItems.filter(
          (item) => validDrugIds.has(String(item.id)) && Number(item.quantity) > 0 && Number(item.price) >= 0
        );
        if (validItems.length === 0) {
          throw new Error("No valid items to process");
        }
        const saleItemsData = [];
        for (const item of validItems) {
          let itemTotalCost = 0;
          let remainingToDeduct = item.quantity;
          const inventory = await tx.inventory.findFirst({
            where: { drugId: String(item.id) },
            include: {
              batches: {
                orderBy: { expiryDate: "asc" },
                where: { quantity: { gt: 0 } }
              }
            }
          });
          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: { quantity: { decrement: item.quantity } }
            });
            if (inventory.batches && inventory.batches.length > 0) {
              for (const batch of inventory.batches) {
                if (remainingToDeduct <= 0) break;
                const deduction = Math.min(batch.quantity, remainingToDeduct);
                itemTotalCost += deduction * batch.costPrice;
                if (deduction > 0) {
                  await tx.batch.update({
                    where: { id: batch.id },
                    data: { quantity: { decrement: deduction } }
                  });
                  remainingToDeduct -= deduction;
                }
              }
            }
            if (remainingToDeduct > 0 && inventory.costPrice) {
              itemTotalCost += remainingToDeduct * inventory.costPrice;
            }
          }
          const unitCost = item.quantity > 0 ? itemTotalCost / item.quantity : 0;
          saleItemsData.push({
            drugId: String(item.id),
            quantity: item.quantity,
            price: Number(item.price),
            cost: unitCost
          });
        }
        const sale = await tx.sale.create({
          data: {
            total,
            discount: discount || 0,
            userId: (validUser == null ? void 0 : validUser.id) ?? null,
            patientId: (validPatient == null ? void 0 : validPatient.id) ?? null,
            synced: false,
            payment: {
              create: {
                amount: total,
                method: paymentMethod || "CASH",
                status: isCredit ? "PENDING" : "COMPLETED"
              }
            },
            items: {
              create: saleItemsData
            }
          }
        });
        if (!isCredit && paymentMethod === "CASH" && (validUser == null ? void 0 : validUser.id)) {
          const activeShift = await tx.shift.findFirst({
            where: { userId: validUser.id, status: "OPEN" }
          });
          if (activeShift && activeShift.safeId) {
            await tx.transaction.create({
              data: {
                safeId: activeShift.safeId,
                type: "IN",
                amount: total,
                referenceType: "SALE",
                description: `مبيعات نقدية فاتورة #${sale.id.slice(0, 8)}`
              }
            });
            await tx.safe.update({
              where: { id: activeShift.safeId },
              data: { balance: { increment: total } }
            });
          }
        }
        if (isCredit && validPatient) {
          await tx.patient.update({
            where: { id: validPatient.id },
            data: {
              balance: { increment: total }
            }
          });
        }
        const settings = await tx.companySettings.findFirst();
        if ((settings == null ? void 0 : settings.loyaltyEnabled) && validPatient && pointsRedeemed > 0) {
          const loyaltyAccount = await tx.loyaltyAccount.findUnique({
            where: { patientId: validPatient.id }
          });
          if (loyaltyAccount) {
            if (loyaltyAccount.totalPoints >= pointsRedeemed) {
              await tx.loyaltyAccount.update({
                where: { id: loyaltyAccount.id },
                data: {
                  totalPoints: { decrement: pointsRedeemed }
                }
              });
              await tx.loyaltyTransaction.create({
                data: {
                  accountId: loyaltyAccount.id,
                  type: "REDEEM",
                  points: pointsRedeemed,
                  saleId: sale.id,
                  description: `ط§ط³طھط¨ط¯ط§ظ„ ${pointsRedeemed} ظ†ظ‚ط·ط© ظ…ظ‚ط§ط¨ظ„ ط®طµظ…`
                }
              });
            } else {
              console.warn("ATTEMPT TO REDEEM MORE POINTS THAN AVAILABLE");
            }
          }
        }
        if ((settings == null ? void 0 : settings.loyaltyEnabled) && validPatient && total > 0 && !isCredit) {
          const pointsPerDinar = settings.loyaltyPointsPerDinar || 0.01;
          const pointsEarned = Math.floor(total * pointsPerDinar);
          if (pointsEarned > 0) {
            let loyaltyAccount = await tx.loyaltyAccount.findUnique({
              where: { patientId: validPatient.id }
            });
            if (!loyaltyAccount) {
              loyaltyAccount = await tx.loyaltyAccount.create({
                data: { patientId: validPatient.id }
              });
            }
            const newLifetime = loyaltyAccount.lifetimePoints + pointsEarned;
            const newTotal = loyaltyAccount.totalPoints + pointsEarned;
            let newTier = "BRONZE";
            if (newLifetime >= 2e4) newTier = "GOLD";
            else if (newLifetime >= 5e3) newTier = "SILVER";
            await tx.loyaltyAccount.update({
              where: { id: loyaltyAccount.id },
              data: {
                totalPoints: newTotal,
                lifetimePoints: newLifetime,
                tier: newTier
              }
            });
            await tx.loyaltyTransaction.create({
              data: {
                accountId: loyaltyAccount.id,
                type: "EARN",
                points: pointsEarned,
                saleId: sale.id,
                description: "ظ†ظ‚ط§ط· ظ…ظƒطھط³ط¨ط© ظ…ظ† ط¹ظ…ظ„ظٹط© ط´ط±ط§ط،"
              }
            });
          }
        }
        return { success: true, saleId: sale.id, isCredit };
      });
      if (result.success) {
        syncSales().catch(
          (err) => console.error("Immediate sync failed:", err)
        );
      }
      return result;
    } catch (error) {
      console.error("Sale processing error:", error);
      return { success: false, error: "Transaction failed" };
    }
  }
);
electron.ipcMain.handle("seed-products", async () => {
  const count = await prisma.globalDrug.count();
  if (count === 0) {
    const drug1 = await prisma.globalDrug.create({
      data: {
        id: "1",
        barcode: "111",
        tradeName: "Panadol Extra",
        scientificName: "Paracetamol",
        price: 15
      }
    });
    await prisma.inventory.create({
      data: { drugId: drug1.id, quantity: 100 }
    });
    const drug2 = await prisma.globalDrug.create({
      data: {
        id: "2",
        barcode: "222",
        tradeName: "Cataflam",
        scientificName: "Diclofenac",
        price: 25
      }
    });
    await prisma.inventory.create({
      data: { drugId: drug2.id, quantity: 50 }
    });
    return "Seeded";
  }
  return "Already seeded";
});
electron.ipcMain.handle(
  "initiate-zain-cash-payment",
  async (_event, { amount, saleId }) => {
    try {
      const transactionData = {
        amount,
        serviceType: "pharmacy_payment",
        msisdn: ZAINCASH_MERCHANT_ID,
        orderId: saleId,
        redirectUrl: `${ZAINCASH_BASE_URL}/transaction/pay?id=`,
        // Not used for redirection in Desktop, but required payload
        iat: Math.floor(Date.now() / 1e3),
        exp: Math.floor(Date.now() / 1e3) + 3600
      };
      const token = generateZainCashToken(transactionData);
      const response = await fetch(`${ZAINCASH_BASE_URL}/transaction/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          merchantId: ZAINCASH_MERCHANT_ID,
          lang: "ar"
        })
      });
      const result = await response.json();
      if (result.err) {
        return {
          success: false,
          error: result.err.msg || "ظپط´ظ„ ظپظٹ ط¥ظ†ط´ط§ط، ظ…ط¹ط§ظ…ظ„ط© Zain Cash"
        };
      }
      const redirectUrl = `${ZAINCASH_BASE_URL}/transaction/pay?id=${result.id}`;
      return { success: true, transactionId: result.id, redirectUrl };
    } catch (error) {
      console.error("Zain Cash Init Error:", error);
      return { success: false, error: error.message };
    }
  }
);
electron.ipcMain.handle("check-zain-cash-status", async (_event, { transactionId }) => {
  try {
    const payload = {
      id: transactionId,
      msisdn: ZAINCASH_MERCHANT_ID,
      iat: Math.floor(Date.now() / 1e3),
      exp: Math.floor(Date.now() / 1e3) + 3600
    };
    const token = generateZainCashToken(payload);
    const response = await fetch(`${ZAINCASH_BASE_URL}/transaction/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        merchantId: ZAINCASH_MERCHANT_ID
      })
    });
    const result = await response.json();
    if (result.err) {
      return { success: false, error: result.err.msg };
    }
    return { success: true, status: result.status, amount: result.amount };
  } catch (error) {
    console.error("Zain Cash Check Error:", error);
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("open-external-url", async (_event, url) => {
  await electron.shell.openExternal(url);
  return true;
});
electron.ipcMain.handle("create-backup", async () => {
  const result = await createBackup();
  if (result.success && result.path) {
    return {
      success: true,
      message: "طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ظ†ط³ط®ط© ط§ظ„ط§ط­طھظٹط§ط·ظٹط© ط¨ظ†ط¬ط§ط­",
      path: result.path
    };
  }
  return { success: false, error: result.error };
});
electron.ipcMain.handle("get-backups", async () => {
  return getBackupList();
});
electron.ipcMain.handle("restore-backup", async (_event, backupPath) => {
  const result = await restoreBackup(backupPath);
  return result;
});
electron.ipcMain.handle("open-backup-folder", async () => {
  const backups = getBackupList();
  if (backups.length > 0) {
    const folderPath = path$1.dirname(backups[0].path);
    electron.shell.openPath(folderPath);
    return true;
  }
  return false;
});
electron.ipcMain.handle("get-debtors", async (_event, { branchId, term }) => {
  try {
    const whereClause = {
      balance: { gt: 0 }
    };
    if (branchId) {
      whereClause.branchId = branchId;
    }
    if (term) {
      whereClause.OR = [
        { name: { contains: term } },
        { phone: { contains: term } }
      ];
    }
    const debtors = await prisma.patient.findMany({
      where: whereClause,
      orderBy: { updatedAt: "desc" },
      take: 50
    });
    return debtors;
  } catch (error) {
    console.error("Failed to fetch debtors:", error);
    return [];
  }
});
electron.ipcMain.handle("get-debtor-details", async (_event, patientId) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId }
    });
    if (!patient) throw new Error("Patient not found");
    const creditSales = await prisma.sale.findMany({
      where: {
        patientId,
        OR: [
          { payment: null },
          // Credit sale might not have Payment record yet
          {
            // Or if we track payment status in Payment model
            payment: { status: { not: "COMPLETED" } }
          }
          // Note: In our schema, true credit sales might rely on matching total vs debt payments
        ]
      },
      include: {
        items: {
          include: { drug: true }
        },
        debtPayments: true
      },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    const payments = await prisma.debtPayment.findMany({
      where: {
        sale: { patientId }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    return { success: true, patient, sales: creditSales, payments };
  } catch (error) {
    console.error("Failed to fetch debtor details:", error);
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle(
  "add-debt-payment",
  async (_event, { patientId, amount, note }) => {
    try {
      const lastSale = await prisma.sale.findFirst({
        where: { patientId },
        orderBy: { createdAt: "desc" }
      });
      if (!lastSale) {
        return {
          success: false,
          error: "No sales record found for this patient to attach payment to"
        };
      }
      const result = await prisma.$transaction(async (tx) => {
        const payment = await tx.debtPayment.create({
          data: {
            saleId: lastSale.id,
            // Linking to last sale for reference
            amount,
            method: "CASH",
            note: note || "طھط³ط¯ظٹط¯ ط¯ظپط¹ط©",
            createdAt: /* @__PURE__ */ new Date()
          }
        });
        const patient = await tx.patient.update({
          where: { id: patientId },
          data: {
            balance: { decrement: amount }
          }
        });
        const settings = await tx.companySettings.findFirst();
        if ((settings == null ? void 0 : settings.loyaltyEnabled) && amount > 0) {
          const pointsPerDinar = settings.loyaltyPointsPerDinar || 0.01;
          const pointsEarned = Math.floor(amount * pointsPerDinar);
          if (pointsEarned > 0) {
            let loyaltyAccount = await tx.loyaltyAccount.findUnique({
              where: { patientId }
            });
            if (!loyaltyAccount) {
              loyaltyAccount = await tx.loyaltyAccount.create({
                data: { patientId }
              });
            }
            const newLifetime = loyaltyAccount.lifetimePoints + pointsEarned;
            const newTotal = loyaltyAccount.totalPoints + pointsEarned;
            let newTier = "BRONZE";
            if (newLifetime >= 2e4) newTier = "GOLD";
            else if (newLifetime >= 5e3) newTier = "SILVER";
            await tx.loyaltyAccount.update({
              where: { id: loyaltyAccount.id },
              data: {
                totalPoints: newTotal,
                lifetimePoints: newLifetime,
                tier: newTier
              }
            });
            await tx.loyaltyTransaction.create({
              data: {
                accountId: loyaltyAccount.id,
                type: "EARN",
                points: pointsEarned,
                saleId: lastSale.id,
                // Associate with the sale used for this payment
                description: "نقاط مكتسبة من تسديد دين"
              }
            });
          }
        }
        return { payment, patient };
      });
      return { success: true, newBalance: result.patient.balance };
    } catch (error) {
      console.error("Failed to add debt payment:", error);
      return { success: false, error: error.message };
    }
  }
);
electron.ipcMain.handle("get-sync-failures-count", async () => {
  try {
    return await prisma.syncFailure.count();
  } catch (e10) {
    console.error("Error getting DLQ count", e10);
    return 0;
  }
});
electron.ipcMain.handle("get-sync-failures", async () => {
  try {
    return await prisma.syncFailure.findMany({
      orderBy: { createdAt: "desc" }
    });
  } catch (e10) {
    console.error("Error getting DLQ items", e10);
    return [];
  }
});
electron.ipcMain.handle("delete-sync-failure", async (_event, id2) => {
  try {
    await prisma.syncFailure.delete({ where: { id: id2 } });
    store.set("syncFailureFlag", Date.now());
    electron.BrowserWindow.getAllWindows().forEach((win2) => {
      win2.webContents.send("sync-failure-recorded");
    });
    return true;
  } catch (e10) {
    console.error("Error deleting DLQ item", e10);
    return false;
  }
});
electron.ipcMain.handle("retry-sync-failure", async (_event, failureData) => {
  try {
    const { id: id2, entityType, payload } = failureData;
    const parsedPayload = JSON.parse(payload);
    if (entityType === "SALE") {
      await prisma.sale.update({
        where: { id: parsedPayload.id },
        data: { synced: false }
        // Trigger syncSales loop
      });
      if (parsedPayload.items) {
        await prisma.sale.update({
          where: { id: parsedPayload.id },
          data: {
            total: parsedPayload.total,
            discount: parsedPayload.discount
            // Updating items is complex deep-nested Prisma. So we rely on them fixing the primitive fields.
          }
        });
      }
    } else if (entityType === "DEBT_PAYMENT") {
      await prisma.debtPayment.update({
        where: { id: parsedPayload.id },
        data: {
          synced: false,
          amount: parsedPayload.amount,
          note: parsedPayload.note
        }
      });
    } else if (entityType === "ADD-INVENTORY" || entityType === "DELETE-INVENTORY" || entityType === "UPDATE-INVENTORY") {
      const existingQueue = getPendingSyncActions();
      existingQueue.push({
        id: `retry-${Date.now()}`,
        type: entityType.toLowerCase(),
        payload: parsedPayload,
        attempts: 0,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        nextRetryAt: (/* @__PURE__ */ new Date()).toISOString()
        // immediate
      });
      setPendingSyncActions(existingQueue);
    }
    await prisma.syncFailure.delete({ where: { id: id2 } });
    store.set("syncFailureFlag", Date.now());
    electron.BrowserWindow.getAllWindows().forEach((win2) => {
      win2.webContents.send("sync-failure-recorded");
    });
    void processPendingSyncActions();
    return true;
  } catch (e10) {
    console.error("Error retrying DLQ item", e10);
    try {
      await prisma.syncFailure.update({
        where: { id: failureData.id },
        data: { errorMessage: "JSON Parsing or DB Error: " + e10.message }
      });
    } catch {
    }
    return false;
  }
});
electron.ipcMain.handle("search-sale", async (_event, query) => {
  try {
    const sale = await prisma.sale.findFirst({
      where: { id: Object.assign({ startsWith: query }) },
      // Handle full or partial barcode/ID
      include: {
        items: { include: { drug: true } },
        patient: true,
        payment: true,
        returns: { include: { items: true } }
      }
    });
    if (!sale) return { success: false, error: "الفاتورة غير موجودة" };
    return { success: true, sale };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle(
  "return-sale",
  async (_event, { saleId, items, notes, safeId, branchId }) => {
    try {
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        include: { items: true, payment: true, patient: true }
      });
      if (!sale) throw new Error("Sale not found");
      const result = await prisma.$transaction(async (tx) => {
        var _a2;
        const returnAmount = items.reduce(
          (sum, item) => sum + item.quantity * item.price,
          0
        );
        const saleReturn = await tx.saleReturn.create({
          data: {
            saleId,
            branchId: branchId || "default",
            safeId: safeId || null,
            total: returnAmount,
            notes: notes || null,
            items: {
              create: items.map((item) => ({
                drugId: item.drugId,
                quantity: item.quantity,
                price: item.price
              }))
            }
          }
        });
        if (((_a2 = sale.payment) == null ? void 0 : _a2.method) === "CREDIT" && sale.patientId) {
          await tx.patient.update({
            where: { id: sale.patientId },
            data: { balance: { decrement: returnAmount } }
          });
        } else if (safeId) {
          await tx.safe.update({
            where: { id: safeId },
            data: { balance: { decrement: returnAmount } }
          });
          await tx.transaction.create({
            data: {
              safeId,
              type: "OUT",
              amount: returnAmount,
              referenceType: "SALE_RETURN",
              referenceId: saleReturn.id,
              description: `إرجاع فاتورة #${saleId.slice(0, 8)}`
            }
          });
        }
        for (const item of items) {
          const inventory = await tx.inventory.findFirst({
            where: { drugId: item.drugId },
            include: { batches: { orderBy: { expiryDate: "desc" }, take: 1 } }
          });
          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: { quantity: { increment: item.quantity } }
            });
            if (inventory.batches && inventory.batches.length > 0) {
              await tx.batch.update({
                where: { id: inventory.batches[0].id },
                data: { quantity: { increment: item.quantity } }
              });
            }
          }
        }
        return saleReturn;
      });
      return { success: true, returnId: result.id };
    } catch (error) {
      console.error("Sale return error:", error);
      return { success: false, error: error.message };
    }
  }
);
electron.app.whenReady().then(() => {
  initBackupScheduler();
});
