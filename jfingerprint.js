/**
 * Hash the slow-moving browser signals a page can already read.
 * Browser version, the network, the window, and this site's storage stay
 * out of the hash. Nothing is uploaded.
 *
 * jFingerprint.getRAW(options)  -> the object that was hashed
 * jFingerprint.getJSON(options) -> canonical JSON of that object
 * jFingerprint.getHash(options) -> SHA-256 of that JSON
 *
 * Pass { build: true } to fold the browser version into the hash. Pass
 * { canvas: false } (or fonts, gpu, audio, emoji, voices, display,
 * hardware, locale, trust) to leave a section out.
 */
(() => {
  "use strict";

  const FONT_CANDIDATES = [
    "Segoe UI",
    "Calibri",
    "Cambria",
    "Candara",
    "Consolas",
    "Constantia",
    "Corbel",
    "Tahoma",
    "Verdana",
    "Trebuchet MS",
    "Georgia",
    "Impact",
    "Comic Sans MS",
    "Lucida Console",
    "Helvetica Neue",
    "Avenir",
    "Avenir Next",
    "Gill Sans",
    "Futura",
    "Baskerville",
    "Hoefler Text",
    "Didot",
    "American Typewriter",
    "Menlo",
    "Monaco",
    "PingFang SC",
    "Hiragino Sans",
    "Apple SD Gothic Neo",
    "Ubuntu",
    "Cantarell",
    "DejaVu Sans",
    "Liberation Sans",
    "Nimbus Sans",
    "FreeSans",
  ];

  /**
   * @param {string} text
   * @returns {Promise<string | null>}
   */
  const sha256 = async (text) => {
    if (!globalThis.crypto || !crypto.subtle) return null;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };

  /**
   * @param {Promise<unknown>} work
   * @param {number} ms
   * @returns {Promise<unknown>}
   */
  const within = (work, ms) =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), ms);
      Promise.resolve(work).then(
        (value) => {
          clearTimeout(timer);
          finish(value);
        },
        () => {
          clearTimeout(timer);
          finish(null);
        },
      );
    });

  /**
   * @param {unknown} value
   * @returns {string}
   */
  const canonical = (value) => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  };

  /**
   * @template T
   * @param {T} value
   * @returns {T}
   */
  const clone = (value) =>
    typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));

  const gamut = () => {
    if (window.matchMedia("(color-gamut: rec2020)").matches) return "rec2020";
    if (window.matchMedia("(color-gamut: p3)").matches) return "p3";
    if (window.matchMedia("(color-gamut: srgb)").matches) return "srgb";
    return null;
  };

  /**
   * @param {(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void} draw
   * @returns {Promise<string | null>}
   */
  const drawHash = async (draw) => {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return null;
      draw(context, canvas);
      return await sha256(canvas.toDataURL());
    } catch {
      return null;
    }
  };

  const readFonts = () => {
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return [];
      const sample = "mmmmmmmmmmlli";
      const baselines = ["monospace", "sans-serif", "serif"];
      /** @type {Record<string, number>} */
      const widths = {};
      for (const baseline of baselines) {
        context.font = `72px ${baseline}`;
        widths[baseline] = context.measureText(sample).width;
      }
      return FONT_CANDIDATES.filter((font) =>
        baselines.some((baseline) => {
          context.font = `72px "${font}", ${baseline}`;
          return context.measureText(sample).width !== widths[baseline];
        }),
      );
    } catch {
      return [];
    }
  };

  const readWebGl = () => {
    /** @type {{ extensions: string[], maxTextureSize: number | null, renderer: string | null, shadingLanguage: string | null, vendor: string | null, version: string | null }} */
    const empty = {
      extensions: [],
      maxTextureSize: null,
      renderer: null,
      shadingLanguage: null,
      vendor: null,
      version: null,
    };
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) return empty;
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const vendor = debug
        ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)
        : gl.getParameter(gl.VENDOR);
      const renderer = debug
        ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      return {
        extensions: (gl.getSupportedExtensions() || []).slice().sort(),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) || null,
        renderer: renderer ? String(renderer) : null,
        shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
          ? String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION))
          : null,
        vendor: vendor ? String(vendor) : null,
        version: gl.getParameter(gl.VERSION) ? String(gl.getParameter(gl.VERSION)) : null,
      };
    } catch {
      return empty;
    }
  };

  const readWebGpu = async () => {
    if (!navigator.gpu || typeof navigator.gpu.requestAdapter !== "function") return null;
    const adapter = await within(navigator.gpu.requestAdapter(), 2000);
    if (!adapter) return null;
    const info =
      adapter.info ||
      (typeof adapter.requestAdapterInfo === "function"
        ? await within(adapter.requestAdapterInfo(), 2000)
        : null);
    if (!info) return null;
    const text = [info.vendor, info.architecture, info.device, info.description]
      .filter(Boolean)
      .join(", ");
    return text || null;
  };

  const readAudioHash = async () => {
    if (typeof OfflineAudioContext !== "function") return null;
    const hashed = await within(
      (async () => {
        const context = new OfflineAudioContext(1, 44100, 44100);
        const oscillator = context.createOscillator();
        oscillator.type = "triangle";
        oscillator.frequency.value = 10000;
        const compressor = context.createDynamicsCompressor();
        oscillator.connect(compressor);
        compressor.connect(context.destination);
        oscillator.start(0);
        const buffer = await context.startRendering();
        const samples = [...buffer.getChannelData(0).slice(4500, 5000)];
        return sha256(samples.join(","));
      })(),
      3000,
    );
    return hashed || null;
  };

  const readAudioOutput = async () => {
    if (typeof AudioContext !== "function") return { channels: null, sampleRate: null };
    /** @type {AudioContext | null} */
    let context = null;
    try {
      context = new AudioContext();
      return {
        channels: context.destination ? context.destination.maxChannelCount : null,
        sampleRate: context.sampleRate || null,
      };
    } catch {
      return { channels: null, sampleRate: null };
    } finally {
      if (context) context.close().catch(() => {});
    }
  };

  const readVoices = async () => {
    if (!window.speechSynthesis) return [];
    const listed = await within(
      new Promise((resolve) => {
        const finish = () => {
          window.speechSynthesis.removeEventListener("voiceschanged", finish);
          resolve(window.speechSynthesis.getVoices());
        };
        const current = window.speechSynthesis.getVoices();
        if (current.length) {
          resolve(current);
          return;
        }
        window.speechSynthesis.addEventListener("voiceschanged", finish);
        setTimeout(finish, 1200);
      }),
      1500,
    );
    const voices = Array.isArray(listed) ? listed : [];
    return voices.map((voice) => `${voice.name} (${voice.lang})`).sort();
  };

  const readWidevineHardware = async () => {
    if (typeof navigator.requestMediaKeySystemAccess !== "function") return null;
    try {
      await navigator.requestMediaKeySystemAccess("com.widevine.alpha", [
        {
          initDataTypes: ["cenc"],
          videoCapabilities: [
            {
              contentType: 'video/mp4; codecs="avc1.42E01E"',
              robustness: "HW_SECURE_ALL",
            },
          ],
          audioCapabilities: [
            {
              contentType: 'audio/mp4; codecs="mp4a.40.2"',
              robustness: "HW_SECURE_ALL",
            },
          ],
        },
      ]);
      return true;
    } catch {
      return false;
    }
  };

  const readAuthenticator = async () => {
    if (
      typeof PublicKeyCredential === "undefined" ||
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function"
    ) {
      return null;
    }
    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return Boolean(available);
    } catch {
      return null;
    }
  };

  const readHints = async () => {
    const uaData = navigator.userAgentData;
    if (!uaData || typeof uaData.getHighEntropyValues !== "function") {
      return {
        architecture: null,
        bitness: null,
        brands: null,
        mobile: null,
        model: null,
        platform: navigator.platform || null,
        platformVersion: null,
      };
    }
    try {
      const hints = await uaData.getHighEntropyValues([
        "architecture",
        "bitness",
        "model",
        "platformVersion",
        "fullVersionList",
      ]);
      const brands = Array.isArray(hints.fullVersionList)
        ? hints.fullVersionList.map((item) => `${item.brand} ${item.version}`)
        : [];
      return {
        architecture: hints.architecture || null,
        bitness: hints.bitness || null,
        brands,
        mobile: Boolean(uaData.mobile),
        model: hints.model || null,
        platform: hints.platform || uaData.platform || navigator.platform || null,
        platformVersion: hints.platformVersion || null,
      };
    } catch {
      return {
        architecture: null,
        bitness: null,
        brands: null,
        mobile: uaData.mobile == null ? null : Boolean(uaData.mobile),
        model: null,
        platform: uaData.platform || navigator.platform || null,
        platformVersion: null,
      };
    }
  };

  const collect = async () => {
    const [hints, webgpu, audioHash, audioOutput, voices, widevineHardware, platformAuthenticator] =
      await Promise.all([
        readHints(),
        readWebGpu(),
        readAudioHash(),
        readAudioOutput(),
        readVoices(),
        readWidevineHardware(),
        readAuthenticator(),
      ]);
    const webgl = readWebGl();
    const canvas = await drawHash((context, surface) => {
      surface.width = 240;
      surface.height = 60;
      context.textBaseline = "top";
      context.font = "16px Arial";
      context.fillStyle = "#f60";
      context.fillRect(0, 0, 120, 28);
      context.fillStyle = "#069";
      context.fillText("Browser Interrogator", 2, 2);
      context.strokeStyle = "rgba(120, 180, 80, 0.7)";
      context.beginPath();
      context.arc(80, 40, 12, 0, Math.PI * 2);
      context.stroke();
    });
    const emoji = await drawHash((context, surface) => {
      surface.width = 80;
      surface.height = 32;
      context.font = "24px serif";
      context.fillText("😀👍🔒", 0, 24);
    });

    return {
      fingerprint: {
        audio: {
          channels: audioOutput.channels,
          hash: audioHash,
          sampleRate: audioOutput.sampleRate,
        },
        canvas,
        display: {
          colorDepth: screen.colorDepth || null,
          colorGamut: gamut(),
          height: screen.height || null,
          pixelRatio: window.devicePixelRatio || null,
          touchPoints: navigator.maxTouchPoints || 0,
          width: screen.width || null,
        },
        emoji,
        fonts: readFonts(),
        gpu: {
          extensions: webgl.extensions,
          maxTextureSize: webgl.maxTextureSize,
          renderer: webgl.renderer,
          vendor: webgl.vendor,
          webgpu,
        },
        hardware: {
          architecture: hints.architecture,
          bitness: hints.bitness,
          cores: navigator.hardwareConcurrency || null,
          memory: navigator.deviceMemory || null,
          model: hints.model,
          platform: hints.platform,
        },
        locale: {
          language: navigator.language || null,
          languages: [...(navigator.languages || [])],
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        },
        trust: {
          platformAuthenticator,
          widevineHardware,
        },
        voices,
      },
      build: {
        brands: hints.brands,
        mobile: hints.mobile,
        platformVersion: hints.platformVersion,
        shadingLanguage: webgl.shadingLanguage,
        userAgent: navigator.userAgent || null,
        webglVersion: webgl.version,
      },
    };
  };

  /** @type {Promise<{ fingerprint: Record<string, unknown>, build: Record<string, unknown> }> | null} */
  let reading = null;

  const read = () => {
    if (!reading) reading = collect();
    return reading;
  };

  /**
   * @param {Record<string, boolean> | undefined} options
   */
  const select = async (options) => {
    const record = await read();
    /** @type {Record<string, unknown>} */
    const chosen = {};
    for (const key of Object.keys(record.fingerprint)) {
      if (options && options[key] === false) continue;
      chosen[key] = record.fingerprint[key];
    }
    if (options && options.build === true) chosen.build = record.build;
    return clone(chosen);
  };

  /**
   * @param {Record<string, boolean> | undefined} options
   * @returns {Promise<Record<string, unknown>>}
   */
  async function getRAW(options) {
    return select(options);
  }

  /**
   * @param {Record<string, boolean> | undefined} options
   * @returns {Promise<string>}
   */
  async function getJSON(options) {
    return canonical(await select(options));
  }

  /**
   * @param {Record<string, boolean> | undefined} options
   * @returns {Promise<string | null>}
   */
  async function getHash(options) {
    return sha256(await getJSON(options));
  }

  /**
   * @param {Record<string, boolean> | undefined} options
   * @returns {Promise<string | null>}
   */
  function jFingerprint(options) {
    return getHash(options);
  }

  jFingerprint.version = "0.0.0";
  jFingerprint.getRAW = getRAW;
  jFingerprint.getJSON = getJSON;
  jFingerprint.getHash = getHash;

  globalThis.jFingerprint = jFingerprint;
})();
