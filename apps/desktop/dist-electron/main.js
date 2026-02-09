"use strict";
const electron = require("electron");
const path = require("node:path");
const require$$0 = require("os");
const require$$1 = require("tty");
const fs$1 = require("fs");
const require$$3 = require("path");
const require$$4 = require("child_process");
const require$$5 = require("fs/promises");
const require$$6 = require("util");
const require$$7 = require("async_hooks");
const require$$8 = require("events");
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
  var Gu = require$$0, Bo = require$$1, de = Xn(), { env: Q } = process, Qe;
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
  var Zu = fs$1, es = require$$3, Xu = require$$0, ec = Xo(), tc = ec.version, rc = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
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
var fs = Z((lg, ms) => {
  ms.exports = ({ onlyFirst: e10 = false } = {}) => {
    let t = ["[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)", "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))"].join("|");
    return new RegExp(t, e10 ? void 0 : "g");
  };
});
var bi = Z((ug, gs) => {
  var yc = fs();
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
var Io = k(fs$1);
function Qn() {
  let e10 = process.env.PRISMA_QUERY_ENGINE_LIBRARY;
  if (!(e10 && Io.default.existsSync(e10)) && process.arch === "ia32") throw new Error('The default query engine type (Node-API, "library") is currently not supported for 32bit Node. Please set `engineType = "binary"` in the "generator" block of your "schema.prisma" file (or use the environment variables "PRISMA_CLIENT_ENGINE_TYPE=binary" and/or "PRISMA_CLI_QUERY_ENGINE_TYPE=binary".)');
}
var Jn = ["darwin", "darwin-arm64", "debian-openssl-1.0.x", "debian-openssl-1.1.x", "debian-openssl-3.0.x", "rhel-openssl-1.0.x", "rhel-openssl-1.1.x", "rhel-openssl-3.0.x", "linux-arm64-openssl-1.1.x", "linux-arm64-openssl-1.0.x", "linux-arm64-openssl-3.0.x", "linux-arm-openssl-1.1.x", "linux-arm-openssl-1.0.x", "linux-arm-openssl-3.0.x", "linux-musl", "linux-musl-openssl-3.0.x", "linux-musl-arm64-openssl-1.1.x", "linux-musl-arm64-openssl-3.0.x", "linux-nixos", "linux-static-x64", "linux-static-arm64", "windows", "freebsd11", "freebsd12", "freebsd13", "freebsd14", "freebsd15", "openbsd", "netbsd", "arm"];
var $r = "libquery_engine";
function qr(e10, t) {
  return e10.includes("windows") ? `query_engine-${e10}.dll.node` : e10.includes("darwin") ? `${$r}-${e10}.dylib.node` : `${$r}-${e10}.so.node`;
}
var _o = k(require$$4), zn = k(require$$5), Gr = k(require$$0);
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
var Fo = require$$6;
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
var $ = k(require$$3);
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
k(fs$1);
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
var di = k(ts()), zr = k(fs$1);
var ht = k(require$$3);
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
var Zt = k(require$$3);
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
var Ns = k(fs$1);
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
var Hl = require$$7, Kl = require$$8, zl = k(fs$1), Fr = k(require$$3);
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
var Ka = k(fs$1), Er = k(require$$3);
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
var so = k(require$$0), dl = k(require$$3);
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
  const path2 = require$$3;
  exports$1.Prisma.TransactionIsolationLevel = makeStrictEnum({
    Serializable: "Serializable"
  });
  exports$1.Prisma.LocalSettingsScalarFieldEnum = {
    id: "id",
    branchId: "branchId",
    lastSync: "lastSync"
  };
  exports$1.Prisma.UserScalarFieldEnum = {
    id: "id",
    name: "name",
    email: "email",
    role: "role",
    password: "password"
  };
  exports$1.Prisma.GlobalDrugScalarFieldEnum = {
    id: "id",
    barcode: "barcode",
    tradeName: "tradeName",
    scientificName: "scientificName",
    price: "price",
    isActive: "isActive"
  };
  exports$1.Prisma.InventoryScalarFieldEnum = {
    id: "id",
    drugId: "drugId",
    quantity: "quantity"
  };
  exports$1.Prisma.BatchScalarFieldEnum = {
    id: "id",
    inventoryId: "inventoryId",
    batchNumber: "batchNumber",
    expiryDate: "expiryDate",
    quantity: "quantity"
  };
  exports$1.Prisma.SaleScalarFieldEnum = {
    id: "id",
    total: "total",
    createdAt: "createdAt",
    synced: "synced"
  };
  exports$1.Prisma.SaleItemScalarFieldEnum = {
    id: "id",
    saleId: "saleId",
    drugId: "drugId",
    quantity: "quantity",
    price: "price"
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
    User: "User",
    GlobalDrug: "GlobalDrug",
    Inventory: "Inventory",
    Batch: "Batch",
    Sale: "Sale",
    SaleItem: "SaleItem"
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
        }
      ],
      "previewFeatures": [],
      "sourceFilePath": "D:\\Programming\\Faramace\\apps\\desktop\\prisma\\schema.prisma",
      "isCustomOutput": true
    },
    "relativeEnvPaths": {
      "rootEnvPath": null
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
    "inlineSchema": 'generator client {\n  provider = "prisma-client-js"\n  output   = "../node_modules/.prisma/desktop-client"\n}\n\ndatasource db {\n  provider = "sqlite"\n  url      = "file:./local.db"\n}\n\n// Local models mirror cloud models but focused on this Branch\n\nmodel LocalSettings {\n  id       String    @id @default(uuid())\n  branchId String? // The branch this device is linked to\n  lastSync DateTime?\n}\n\nmodel User {\n  id       String @id\n  name     String\n  email    String\n  role     String\n  password String // Hashed\n}\n\nmodel GlobalDrug {\n  id             String      @id\n  barcode        String      @unique\n  tradeName      String\n  scientificName String\n  price          Float       @default(0) // Local override or cached price\n  isActive       Boolean     @default(true)\n  inventory      Inventory[]\n}\n\nmodel Inventory {\n  id       String     @id @default(uuid())\n  drugId   String\n  drug     GlobalDrug @relation(fields: [drugId], references: [id])\n  quantity Int\n  batches  Batch[]\n}\n\nmodel Batch {\n  id          String    @id @default(uuid())\n  inventoryId String\n  inventory   Inventory @relation(fields: [inventoryId], references: [id])\n  batchNumber String\n  expiryDate  DateTime\n  quantity    Int\n}\n\nmodel Sale {\n  id        String     @id @default(uuid())\n  total     Float\n  createdAt DateTime   @default(now())\n  items     SaleItem[]\n  synced    Boolean    @default(false)\n}\n\nmodel SaleItem {\n  id       String @id @default(uuid())\n  saleId   String\n  sale     Sale   @relation(fields: [saleId], references: [id])\n  drugId   String\n  quantity Int\n  price    Float\n}\n',
    "inlineSchemaHash": "1a575edddcb446f444504524f43d4ae0aaa053313ac0f37d264e74cc393fc014",
    "copyEngine": true
  };
  const fs2 = fs$1;
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
  config2.runtimeDataModel = JSON.parse('{"models":{"LocalSettings":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"branchId","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"lastSync","kind":"scalar","isList":false,"isRequired":false,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"User":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"name","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"email","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"role","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"password","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"GlobalDrug":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"barcode","kind":"scalar","isList":false,"isRequired":true,"isUnique":true,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"tradeName","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"scientificName","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"price","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Float","default":0,"isGenerated":false,"isUpdatedAt":false},{"name":"isActive","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":true,"isGenerated":false,"isUpdatedAt":false},{"name":"inventory","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Inventory","relationName":"GlobalDrugToInventory","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Inventory":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"drugId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"drug","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"GlobalDrug","relationName":"GlobalDrugToInventory","relationFromFields":["drugId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"quantity","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false},{"name":"batches","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Batch","relationName":"BatchToInventory","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Batch":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"inventoryId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"inventory","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Inventory","relationName":"BatchToInventory","relationFromFields":["inventoryId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"batchNumber","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"expiryDate","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"DateTime","isGenerated":false,"isUpdatedAt":false},{"name":"quantity","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"Sale":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"total","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false},{"name":"createdAt","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"DateTime","default":{"name":"now","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"items","kind":"object","isList":true,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"SaleItem","relationName":"SaleToSaleItem","relationFromFields":[],"relationToFields":[],"isGenerated":false,"isUpdatedAt":false},{"name":"synced","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":true,"type":"Boolean","default":false,"isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false},"SaleItem":{"dbName":null,"fields":[{"name":"id","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":true,"isReadOnly":false,"hasDefaultValue":true,"type":"String","default":{"name":"uuid(4)","args":[]},"isGenerated":false,"isUpdatedAt":false},{"name":"saleId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":true,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"sale","kind":"object","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Sale","relationName":"SaleToSaleItem","relationFromFields":["saleId"],"relationToFields":["id"],"isGenerated":false,"isUpdatedAt":false},{"name":"drugId","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"String","isGenerated":false,"isUpdatedAt":false},{"name":"quantity","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Int","isGenerated":false,"isUpdatedAt":false},{"name":"price","kind":"scalar","isList":false,"isRequired":true,"isUnique":false,"isId":false,"isReadOnly":false,"hasDefaultValue":false,"type":"Float","isGenerated":false,"isUpdatedAt":false}],"primaryKey":null,"uniqueFields":[],"uniqueIndexes":[],"isGenerated":false}},"enums":{},"types":{}}');
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
const prisma = new desktopClient.PrismaClient({
  datasources: {
    db: {
      url: "file:./local.db"
      // In dev, relative to CWD. In prod, needs handling.
    }
  }
});
const API_URL = "http://localhost:3000/api/sync/sales";
const BRANCH_ID = "e9e8f4c2-9547-4180-873b-555555555555";
let isOnline = false;
async function checkConnection() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3e3);
    const response = await fetch(API_URL.replace("/sync/sales", "/health"), {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
async function syncSales() {
  try {
    isOnline = await checkConnection();
    if (!isOnline) {
      console.log("الخادم غير متاح - سيتم المزامنة لاحقاً");
      return;
    }
    const unsyncedSales = await prisma.sale.findMany({
      where: { synced: false },
      include: { items: true },
      take: 10
    });
    if (unsyncedSales.length === 0) return;
    console.log(`جاري مزامنة ${unsyncedSales.length} عملية بيع...`);
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchId: BRANCH_ID,
        sales: unsyncedSales
      })
    });
    if (!response.ok) {
      throw new Error(`فشلت المزامنة: ${response.statusText}`);
    }
    const result = await response.json();
    const syncedIds = result.syncedIds;
    if (syncedIds && syncedIds.length > 0) {
      await prisma.sale.updateMany({
        where: { id: { in: syncedIds } },
        data: { synced: true }
      });
      console.log(`تمت مزامنة ${syncedIds.length} عملية بيع بنجاح.`);
    }
  } catch (error) {
    console.log("وضع العمل بدون إنترنت - المزامنة معلقة");
  }
}
function startSyncService() {
  setInterval(syncSales, 2 * 60 * 1e3);
  setTimeout(syncSales, 15e3);
}
const getDbPath = () => {
  return require$$3.join(electron.app.getPath("userData"), "prisma", "local.db");
};
const getBackupDir = () => {
  const backupDir = require$$3.join(electron.app.getPath("documents"), "Faramace Backups");
  if (!fs$1.existsSync(backupDir)) {
    fs$1.mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
};
const createBackup = async () => {
  try {
    const dbPath = getDbPath();
    const backupDir = getBackupDir();
    const devDbPath = require$$3.join(process.cwd(), "prisma", "local.db");
    const sourcePath = fs$1.existsSync(dbPath) ? dbPath : devDbPath;
    if (!fs$1.existsSync(sourcePath)) {
      return { success: false, error: "قاعدة البيانات غير موجودة" };
    }
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const backupFileName = `backup-${timestamp}.db`;
    const backupPath = require$$3.join(backupDir, backupFileName);
    fs$1.copyFileSync(sourcePath, backupPath);
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
    const devDbPath = require$$3.join(process.cwd(), "prisma", "local.db");
    const targetPath = fs$1.existsSync(dbPath) ? dbPath : devDbPath;
    if (!fs$1.existsSync(backupPath)) {
      return { success: false, error: "ملف النسخة الاحتياطية غير موجود" };
    }
    fs$1.copyFileSync(backupPath, targetPath);
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
    const files = fs$1.readdirSync(backupDir);
    return files.filter((file) => file.endsWith(".db")).map((file) => {
      const filePath = require$$3.join(backupDir, file);
      const stats = fs$1.statSync(filePath);
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
        fs$1.unlinkSync(backup.path);
        console.log(`Deleted old backup: ${backup.name}`);
      });
    }
  } catch (error) {
    console.error("Error cleaning up backups:", error);
  }
};
const distPath = path.join(__dirname, "../dist");
process.env.DIST = distPath;
const publicPath = electron.app.isPackaged ? distPath : path.join(distPath, "../public");
process.env.VITE_PUBLIC = publicPath;
let win;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
function createWindow() {
  win = new electron.BrowserWindow({
    icon: path.join(publicPath, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(distPath, "index.html"));
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
electron.app.whenReady().then(() => {
  createWindow();
  startSyncService();
  electron.ipcMain.handle("get-users", async () => {
    return await prisma.user.findMany();
  });
  electron.ipcMain.handle("get-products", async (event, searchTerm) => {
    try {
      const whereClause = searchTerm ? {
        OR: [
          { tradeName: { contains: searchTerm } },
          { barcode: { contains: searchTerm } }
        ]
      } : {};
      const products = await prisma.globalDrug.findMany({
        where: whereClause,
        include: {
          inventory: true
        },
        take: 50
      });
      return products.map((p) => ({
        id: p.id,
        name: p.tradeName,
        price: p.price,
        barcode: p.barcode,
        stock: p.inventory.reduce((acc, inv) => acc + inv.quantity, 0)
      }));
    } catch (error) {
      console.error("Error fetching products:", error);
      return [];
    }
  });
  electron.ipcMain.handle("process-sale", async (event, { items, total }) => {
    try {
      return await prisma.$transaction(async (tx) => {
        const sale = await tx.sale.create({
          data: {
            total,
            synced: false,
            items: {
              create: items.map((item) => ({
                drugId: item.id,
                quantity: item.quantity,
                price: item.price
              }))
            }
          }
        });
        for (const item of items) {
          const inventory = await tx.inventory.findFirst({
            where: { drugId: item.id }
          });
          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: { quantity: { decrement: item.quantity } }
            });
          }
        }
        return { success: true, saleId: sale.id };
      });
    } catch (error) {
      console.error("Sale processing error:", error);
      return { success: false, error: "Transaction failed" };
    }
  });
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
  electron.ipcMain.handle("create-backup", async () => {
    const result = await createBackup();
    if (result.success && result.path) {
      return { success: true, message: "تم إنشاء النسخة الاحتياطية بنجاح", path: result.path };
    }
    return { success: false, error: result.error };
  });
  electron.ipcMain.handle("get-backups", async () => {
    return getBackupList();
  });
  electron.ipcMain.handle("restore-backup", async (event, backupPath) => {
    const result = await restoreBackup(backupPath);
    return result;
  });
  electron.ipcMain.handle("open-backup-folder", async () => {
    const backups = getBackupList();
    if (backups.length > 0) {
      const folderPath = path.dirname(backups[0].path);
      electron.shell.openPath(folderPath);
      return true;
    }
    return false;
  });
  prisma.user.count().then(async (count) => {
    if (count === 0) {
      await prisma.user.create({
        data: {
          id: "1",
          name: "Admin",
          email: "admin@local",
          role: "ADMIN",
          password: "admin"
          // In real app, hash this
        }
      });
      console.log("Seeded local admin user.");
    }
  });
});
