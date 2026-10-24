// The Settings pages as data: the rows of each page, what each reads and writes, and how it is shown.
// settings-page.js draws a page from them and SettingsLogic reads and writes them. Names, value names
// and help follow LG Settings on this TV (com.palm.app.settings); the TV says which rows and values it
// offers, their ranges, and which are greyed out.
var SettingsSpecs = (function () {
  "use strict";

  var ON_OFF = { on: "On", off: "Off" };
  var LEVELS = { off: "Off", low: "Low", medium: "Medium", high: "High", auto: "Auto" };
  // LG calls eco "Auto Power Save" in Europe.
  var PICTURE_MODES = {
    vivid: "Vivid", normal: "Standard", eco: "Auto Power Save", cinema: "Cinema", sports: "Sports",
    game: "Game Optimizer", filmMaker: "FILMMAKER MODE", photo: "Photo", personalized: "Personalised Picture",
    expert1: "Expert (Bright space, daytime)", expert2: "Expert (Dark space, night)",
    hdrVivid: "Vivid", hdrStandard: "Standard", hdrEco: "Auto Power Save", hdrCinema: "Cinema",
    hdrCinemaBright: "Cinema Home", hdrGame: "Game Optimizer", hdrFilmMaker: "FILMMAKER MODE",
    hdrPersonalized: "Personalised Picture", hdrEffect: "HDR Effect", hdrExternal: "Standard",
    dolbyHdrVivid: "Vivid", dolbyHdrStandard: "Standard", dolbyHdrCinema: "Cinema", dolbyHdrCinemaBright: "Cinema Home",
    dolbyHdrDarkAmazon: "Cinema Home", dolbyHdrGame: "Game Optimizer", dolbyHdrPersonalized: "Personalised Picture"
  };
  var ENERGY_SAVING = { auto: "Auto", off: "Off", min: "Minimum", med: "Medium", max: "Maximum" };
  var GAMMA = { low: "1.9", medium: "2.2", mediumHavingLevel: "2.2", high1: "2.4", high2: "BT.1886" };
  var COLOUR_GAMUT = {
    auto: "Auto Detect", native: "Native", dynamic: "Dynamic", adobeRGB: "Adobe RGB", wide: "Wide",
    extended: "Extended", normal: "Normal", srgb: "sRGB", "dci-p3": "Cinema"
  };
  var COLOUR_ADJUSTMENT = { off: "Off", low: "Low", medium: "Medium", high: "High", user: "User Selection" };
  var SOUND_MODES = {
    aiSoundPlus: "AI Sound Pro", aiSound: "AI Sound", aiSound_soundbar: "AI Sound Pro", standard: "Standard", news: "Clear Voice",
    music: "Music", movie: "Cinema", sports: "Sports", game: "Game Optimizer", game_rts: "Game RTS", game_fps: "Game FPS",
    dtsVirtualX: "DTS Virtual:X", custom: "Custom", bassBlast: "Bass Blast", personalized: "Personalised Sound",
    precision: "Precision Sound Master Pro", voiceEnhance: "Voice Enhance", bassBoost: "Bass Boost", customEq: "Custom EQ"
  };
  var SOUND_OUTPUTS = {
    tv_speaker: "TV Speaker", external_arc: "HDMI (ARC) Device", external_optical: "Optical Out Device", bt_soundbar: "Bluetooth Device",
    mobile_phone: "Mobile Device", lineout: "Audio Out Device", headphone: "Wired Headphones", usb_speaker: "USB Device",
    tv_speaker_bluetooth: "Bluetooth Device + TV Speaker", tv_external_speaker: "Optical Out Device + TV Speaker",
    tv_speaker_external_arc: "HDMI (ARC) Device + TV Speaker", tv_speaker_headphone: "Wired Headphones + TV Speaker",
    wisa_speaker: "WiSA Speakers", wow_cast: "LG WOWCAST"
  };
  // The outputs whose sound delay is kept in avSyncSpdif, avSyncWisa and avSyncBtSurround (LG's
  // choice of key); every other output's is in avSyncSpeaker.
  var SPDIF_OUTPUTS = ["external_optical", "external_arc", "wow_cast"];
  var OTHER_DELAY_OUTPUTS = SPDIF_OUTPUTS.concat(["wisa_speaker", "tv_speaker_bluetooth"]);
  var DTV_AUDIO = { mpeg: "MPEG", dra: "DRA", dolbyDigital: "Dolby Digital", dobyDigitalPlus: "Dolby Digital Plus", heAaC: "HE-AAC", auto: "Auto" };
  var MINUTES = { off: "Off", "10": "10 minutes", "20": "20 minutes", "30": "30 minutes", "60": "1 hour", "90": "1.5 hours",
    "120": "2 hours", "180": "3 hours", "240": "4 hours" };
  var HOURS = { "0": "Off", "2": "2 hours", "4": "4 hours", "6": "6 hours", "8": "8 hours" };
  var SCREEN_SAVER = { "3": "3 minutes", "10": "10 minutes", "20": "20 minutes", "30": "30 minutes" };
  var LANGUAGES = {
    alb: "Albanian", bos: "Bosnian", bul: "Bulgarian", scr: "Croatian", ces: "Czech", dan: "Danish", dut: "Dutch", eng: "English",
    est: "Estonian", fin: "Finnish", fre: "French", deu: "German", ger: "German", gre: "Greek", hun: "Hungarian", gle: "Irish",
    ita: "Italian", kaz: "Kazakh", lav: "Latvian", lit: "Lithuanian", mac: "Macedonian", nor: "Norwegian", pol: "Polish",
    por: "Portuguese", ron: "Romanian", rum: "Romanian", rus: "Russian", srp: "Serbian", slo: "Slovak", slv: "Slovenian",
    spa: "Spanish", swe: "Swedish", tur: "Turkish", ukr: "Ukrainian"
  };
  // Grayscale and Invert colours, which LG turns off with either high-contrast option, grey both out.
  var COLOUR_FILTERS = [
    { key: "adjustments", field: "blackAndWhite", values: ["on"], reason: "Grayscale is on (in LG Settings)" },
    { key: "adjustments", field: "colorInversion", values: ["on"], reason: "Invert colours is on (in LG Settings)" }
  ];
  var FILTERS_OFF = { adjustments: { blackAndWhite: "off", colorInversion: "off" } };

  // The inputs picture settings are kept for, by the name settingsservice gives them; HDMI inputs are
  // named by the TV.
  var INPUTS = { "default": "Apps", dtv: "Live TV", atv: "Analogue TV" };

  // A page: its title; where "Open in LG Settings" goes (`lg`: LG Settings' panel, its launch
  // parameter `target`, or { id, params } to launch); `extra` keys read for rules and writes but not
  // shown; and sections of rows. `context: "picture"` adds an "Applies to" row that chooses the input
  // whose picture settings the page changes (rows the TV keeps per input; the others apply to all).
  // A row: key and category in settingsservice, or `source` for a row another service reads and
  // writes (settings-logic.js, SOURCES); kind: range, choice, info (read-only, with an optional
  // `format`) or link (`launch`: { id, params }); label, help, value labels, order (of the choices);
  // greyedWhen: a rule or rules { key, field, values, reason } that grey it out while another key has
  // one of those values; showWhen and hideWhen: rules that show or hide it; `with`: settings LG writes
  // together with it; confirm: { values, prompt } to ask before writing those values; and reread: true
  // when a change alters what the other rows show.
  var PAGES = {
    picture: {
      title: "Picture",
      lg: "picture",
      context: "picture",
      extra: [{ key: "pictureSettingModified", category: "picture" }],
      sections: [
        { title: "Mode", rows: [
          { key: "pictureMode", category: "picture", kind: "choice", label: "Picture mode", labels: PICTURE_MODES, reread: true,
            help: "Depending on the picture mode, the energy saving step can change, and so can the energy used." },
          { key: "energySaving", category: "picture", kind: "choice", label: "Energy saving", labels: ENERGY_SAVING,
            order: ["auto", "off", "min", "med", "max"], reread: true,
            help: "Controls the screen's brightness to reduce the energy used. Auto and Maximum set the panel brightness." }
        ] },
        { title: "Brightness", rows: [
          { key: "backlight", category: "picture", kind: "range", label: "Panel brightness",
            help: "Brightens or darkens the whole screen with the panel's backlight. Higher values are brighter.",
            greyedWhen: { key: "energySaving", values: ["auto", "max"], reason: "Energy saving is Auto or Maximum, which sets the panel brightness" } },
          { key: "contrast", category: "picture", kind: "range", label: "Contrast",
            help: "The difference between bright and dark areas of the screen. Higher values make it larger." },
          { key: "brightness", category: "picture", kind: "range", label: "Black level",
            help: "The brightness of dark areas. Closer to 100 is lighter, closer to 0 darker." },
          { key: "dynamicContrast", category: "picture", kind: "choice", label: "Auto dynamic contrast", labels: LEVELS,
            help: "Adjusts the contrast to the brightness of the picture." },
          { key: "gamma", category: "picture", kind: "choice", label: "Gamma", labels: GAMMA,
            help: "A lower gamma brightens the mid-tones, a higher one darkens them." },
          { key: "localDimming", category: "picture", kind: "choice", label: "LED local dimming", labels: LEVELS,
            help: "Makes bright parts of the picture brighter and dark parts darker by dimming the backlight behind them." },
          { key: "motionEyeCare", category: "picture", kind: "choice", label: "Motion eye care", labels: ON_OFF,
            help: "Adjusts the brightness to the motion in the picture, for less glare and less energy." }
        ] },
        { title: "Colour", rows: [
          { key: "color", category: "picture", kind: "range", label: "Colour depth",
            help: "How saturated the colours are. Higher values are more saturated." },
          { key: "tint", category: "picture", kind: "range", label: "Tint",
            help: "The balance between red and green in the picture." },
          { key: "colorGamut", category: "picture", kind: "choice", label: "Colour gamut", labels: COLOUR_GAMUT,
            help: "The range of colours shown: chosen from the signal, or widened to suit the scene." },
          { key: "dynamicColor", category: "picture", kind: "choice", label: "Colour adjustment", labels: COLOUR_ADJUSTMENT,
            help: "Adjusts colour and saturation by itself for a brighter, more vivid picture." },
          { key: "colorTemperature", category: "picture", kind: "range", label: "Colour temperature",
            help: "From warmer (lower) to cooler (higher) whites." }
        ] },
        { title: "Clarity", rows: [
          { key: "sharpness", category: "picture", kind: "range", label: "Sharpness",
            help: "Sharpens edges for a more distinct picture. Higher values are crisper." },
          { key: "superResolution", category: "picture", kind: "choice", label: "Super resolution", labels: LEVELS,
            help: "Makes blurred parts of the picture clearer. Not available with a PC connected." },
          { key: "noiseReduction", category: "picture", kind: "choice", label: "Noise reduction", labels: LEVELS,
            help: "Removes irregular, flickering pixels for a cleaner picture." },
          { key: "mpegNoiseReduction", category: "picture", kind: "choice", label: "MPEG noise reduction", labels: LEVELS,
            help: "Removes the noise of compressed (MPEG) video." },
          { key: "smoothGradation", category: "picture", kind: "choice", label: "Smooth gradation", labels: LEVELS,
            help: "Smooths banding in colour gradients." },
          { key: "realCinema", category: "picture", kind: "choice", label: "Real Cinema", labels: ON_OFF,
            help: "Shows films at their own frame rate, as in a cinema." }
        ] },
        { title: "Options", rows: [
          { key: "eyeComfortMode", category: "picture", kind: "choice", label: "Reduce blue light", labels: ON_OFF,
            help: "Warms the colours to reduce blue light." },
          { key: "filmMakerMode", category: "picture", kind: "choice", label: "FILMMAKER MODE auto start", labels: ON_OFF,
            help: "Switches to FILMMAKER MODE by itself when what you watch asks for it." },
          { key: "ai_Brightness", category: "aiPicture", kind: "choice", label: "AI brightness", labels: ON_OFF,
            help: "Adjusts dark areas to the light around the TV and to what you watch." }
        ] }
      ]
    },

    sound: {
      title: "Sound",
      lg: "sound",
      sections: [
        { title: "Mode", rows: [
          { key: "soundMode", category: "sound", kind: "choice", label: "Sound mode", labels: SOUND_MODES, reread: true,
            help: "The sound mode for the input playing now and the sound output in use." },
          { key: "soundOutput", category: "sound", kind: "info", label: "Sound out", labels: SOUND_OUTPUTS,
            help: "Where the TV plays its sound. LG Settings lists the devices connected and switches between them." }
        ] },
        { title: "Output", rows: [
          { key: "supportATMOS", category: "sound", kind: "choice", label: "Dolby Atmos", labels: ON_OFF,
            help: "Plays Dolby Atmos content with a vivid surround effect." },
          { key: "audioBalance", category: "sound", kind: "range", label: "Balance",
            help: "The balance between the left and right TV speakers. At 0 both play at the same level." },
          { key: "tvSetupConfiguration", category: "sound", kind: "choice", label: "Installation type",
            labels: { stand: "Stand", wall_mount: "Wall-mounted" },
            help: "Tunes the sound to how the TV is installed. Applies only to the TV speakers." },
          { key: "autoVolume", category: "sound", kind: "choice", label: "Automatic volume adjustment", labels: ON_OFF,
            help: "Keeps the volume level when you switch between programmes and content." }
        ] },
        { title: "Match screen and sound", rows: [
          { key: "avSyncSpeaker", category: "sound", kind: "range", label: "Sound delay", hideWhen: { key: "soundOutput", values: OTHER_DELAY_OUTPUTS },
            greyedWhen: { key: "avSyncBypassInput", values: ["on"], reason: "Bypass is on" },
            help: "Delays the sound of the output in use to match the picture." },
          { key: "avSyncSpdif", category: "sound", kind: "range", label: "Sound delay", showWhen: { key: "soundOutput", values: SPDIF_OUTPUTS },
            greyedWhen: { key: "avSyncBypassInput", values: ["on"], reason: "Bypass is on" },
            help: "Delays the sound of the optical or HDMI (ARC) device to match the picture." },
          { key: "avSyncWisa", category: "sound", kind: "range", label: "Sound delay", showWhen: { key: "soundOutput", values: ["wisa_speaker"] },
            greyedWhen: { key: "avSyncBypassInput", values: ["on"], reason: "Bypass is on" },
            help: "Delays the sound of the WiSA speakers to match the picture." },
          { key: "avSyncBtSurround", category: "sound", kind: "range", label: "Sound delay",
            showWhen: { key: "soundOutput", values: ["tv_speaker_bluetooth"] }, greyedWhen: { key: "avSyncBypassInput", values: ["on"], reason: "Bypass is on" },
            help: "Delays the sound of the Bluetooth device to match the picture." },
          { key: "avSyncBypassInput", category: "sound", kind: "choice", label: "Bypass", labels: ON_OFF,
            help: "Plays the sound of external devices without the sound delay." }
        ] },
        { title: "Digital", rows: [
          { key: "digitalAudioPriority", category: "sound", kind: "choice", label: "DTV audio setting", labels: DTV_AUDIO,
            help: "The audio format for digital broadcasts. A programme without it plays its default." },
          { key: "soundOutputDigital", category: "sound", kind: "choice", label: "Digital sound output",
            labels: { auto: "Auto", pcm: "PCM", passThrough: "Pass Through" },
            help: "The format of the digital sound sent to an external device. Pass Through keeps the original sound, which some devices can't play." },
          { key: "lgSoundSync", category: "sound", kind: "choice", label: "LG Sound Sync", labels: ON_OFF,
            help: "Plays TV sound through a device on the optical output, and sets its volume with the remote." },
          { key: "ac4DialogueEnhancer", category: "sound", kind: "choice", label: "AC-4 dialogue enhancer", labels: ON_OFF,
            help: "Makes dialogue clearer in video with AC-4 audio." }
        ] }
      ]
    },

    network: {
      title: "Network",
      lg: { id: "com.webos.app.firstuse-overlay", params: { target: "network" } },
      sections: [
        { title: "Wi-Fi", rows: [
          { key: "wifiEnabled", source: "network", kind: "choice", label: "Wi-Fi", labels: { enabled: "On", disabled: "Off" },
            confirm: { values: ["disabled"], prompt: "OK again turns Wi-Fi off. Without a network cable the TV leaves the network." },
            help: "Turns the Wi-Fi radio on or off." },
          { key: "wifiStatus", source: "network", kind: "info", label: "Connection",
            help: "The network the TV is connected to, its address and its DNS server." }
        ] },
        { title: "Ethernet", rows: [
          { key: "ethernet", source: "network", kind: "info", label: "Ethernet", help: "The wired connection." }
        ] },
        { title: "This TV", rows: [
          { key: "deviceName", category: "network", kind: "info", label: "TV name",
            help: "The name other devices see. Change it in LG Settings, which has a keyboard." },
          { key: "networkSetup", kind: "link", label: "Networks and IP settings",
            launch: { id: "com.webos.app.firstuse-overlay", params: { target: "network" } },
            help: "LG's network screens: joining a Wi-Fi network, WPS, hidden networks, IP and DNS settings." }
        ] }
      ]
    },

    power: {
      title: "Power and energy",
      lg: "EnergySaving",
      sections: [
        { title: "Timers", rows: [
          { key: "sleepTimer", source: "sleepTimer", kind: "choice", label: "Sleep timer", labels: MINUTES,
            help: "Turns the TV off after the time chosen." },
          { key: "automaticStandBy", category: "time", kind: "choice", label: "Auto power off", labels: HOURS,
            help: "Turns the TV off when the TV and the remote aren't used for this long." },
          { key: "autoOff15Min", category: "time", kind: "choice", label: "No signal auto off", labels: ON_OFF,
            help: "Turns the TV off after 15 minutes without a signal." },
          { key: "autoOff2HourOnTimer", category: "time", kind: "choice", label: "Auto power off after 4 hours", labels: ON_OFF,
            help: "Turns the TV off if nothing is pressed for 4 hours after the power on timer turned it on." }
        ] },
        { title: "Energy", rows: [
          { key: "energySaving", category: "picture", kind: "choice", label: "Energy saving", labels: ENERGY_SAVING,
            order: ["auto", "off", "min", "med", "max"],
            help: "Controls the screen's brightness to reduce the energy used. Auto and Maximum set the panel brightness." }
        ] },
        { title: "Standby", rows: [
          { key: "quickStartMode", category: "option", kind: "choice", label: "Quick Start+", labels: ON_OFF, order: ["off", "on"],
            help: "Keeps the TV in a standby that wakes faster and starts apps and search sooner. It uses more energy." },
          { key: "standByLight", category: "option", kind: "choice", label: "Standby light", labels: ON_OFF,
            help: "The light on the TV while it is in standby." }
        ] },
        { title: "Screen saver", rows: [
          { key: "screenSaverTimer", category: "option", kind: "choice", label: "Screen saver standby time", labels: SCREEN_SAVER,
            help: "How long until the screen saver appears." },
          { key: "screenSaverAd", category: "general", kind: "choice", label: "Screen saver promotion", labels: ON_OFF,
            help: "Shows or hides the advertisements some apps put on the screen saver." }
        ] }
      ]
    },

    general: {
      title: "General",
      lg: "general",
      sections: [
        { title: "Remote pointer", rows: [
          { key: "pointerSpeed", category: "option", kind: "choice", label: "Tracking speed", labels: { slow: "Slow", normal: "Normal", fast: "Fast" },
            help: "How fast the Magic Remote's pointer moves." },
          { key: "pointerSize", category: "option", kind: "choice", label: "Pointer size", labels: { small: "Small", medium: "Medium", large: "Large" },
            help: "The size of the Magic Remote's pointer." }
        ] },
        { title: "Privacy", rows: [
          { key: "livePlus", category: "option", kind: "choice", label: "Live Plus", labels: ON_OFF,
            help: "Lets LG recognise what is on screen, for recommendations and advertisements." },
          { key: "lmt", category: "general", kind: "choice", label: "Limit ad tracking", labels: ON_OFF,
            help: "Stops tracking of ad-related personal data from this TV. You still get ads, but they may be different ones." }
        ] },
        { title: "Time and language", rows: [
          { key: "autoClock", category: "time", kind: "info", label: "Set time automatically", labels: ON_OFF,
            help: "Whether the TV takes its time from the network or broadcasts. Set it in LG Settings." },
          { key: "timeZone", category: "time", kind: "info", label: "Time zone", format: "timeZone",
            help: "Set it in LG Settings, under Time and timers." },
          { key: "menuLanguage", category: "option", kind: "info", label: "Menu language", labels: LANGUAGES,
            help: "The language of LG's menus. Changing it in LG Settings restarts the TV's interface." }
        ] }
      ]
    },

    accessibility: {
      title: "Accessibility",
      lg: "accessibility",
      extra: [{ key: "adjustments", category: "option" }],
      sections: [
        { title: "Display", rows: [
          { key: "highContrast", category: "option", kind: "choice", label: "Text with high contrast", labels: ON_OFF,
            "with": FILTERS_OFF, greyedWhen: COLOUR_FILTERS,
            help: "Makes the text of LG's menus clearer by changing its colours. Minimal Home keeps its own." },
          { key: "focusEmphasis", category: "option", kind: "choice", label: "Focus with high contrast", labels: ON_OFF,
            "with": FILTERS_OFF, greyedWhen: COLOUR_FILTERS,
            help: "Highlights the focused item in LG's menus more strongly." }
        ] },
        { title: "Audio", rows: [
          { key: "tvPowerSound", category: "sound", kind: "choice", label: "Device power sound", labels: ON_OFF,
            help: "Plays a sound when the TV turns on or off. Not with digital sound output set to Pass Through." },
          { key: "audioDescription", category: "sound", kind: "choice", label: "Audio description", labels: ON_OFF,
            help: "Describes what happens on screen, for broadcasts that offer it." },
          { key: "audioDescriptionVolume", category: "sound", kind: "range", label: "Audio description volume",
            showWhen: { key: "audioDescription", values: ["on"] }, help: "The volume of the description." }
        ] },
        { title: "Subtitles", rows: [
          { key: "subtitleLanguageFirst", category: "option", kind: "choice", label: "Subtitle language", labels: LANGUAGES,
            help: "The subtitles broadcasts show first." },
          { key: "subtitleLanguageSecond", category: "option", kind: "choice", label: "Second subtitle language", labels: LANGUAGES,
            help: "The subtitles shown when a broadcast lacks the first language." },
          { key: "hardOfHearing", category: "caption", kind: "choice", label: "Hard of hearing", labels: ON_OFF,
            help: "Shows the sound of broadcasts as subtitles, where they offer it." }
        ] }
      ]
    },

    about: {
      title: "About this TV",
      lg: "TVInformation",
      sections: [
        { title: "This TV", rows: [
          { key: "model", source: "tvInfo", kind: "info", label: "Model", help: "The TV's model number." },
          { key: "software", source: "tvInfo", kind: "info", label: "Software version", help: "The version of the TV's software." },
          { key: "webos", source: "tvInfo", kind: "info", label: "webOS", help: "The webOS version the software is built on." },
          { key: "deviceName", category: "network", kind: "info", label: "TV name", help: "The name other devices see." }
        ] },
        { title: "LG", rows: [
          { key: "softwareUpdate", kind: "link", label: "Software update", launch: { id: "com.palm.app.settings", params: { target: "SoftwareUpdate" } },
            help: "LG's software update, in LG Settings: it downloads, installs and restarts the TV." },
          { key: "userGuide", kind: "link", label: "User guide", launch: { id: "com.webos.app.tvuserguide" },
            help: "LG's user guide for this TV." }
        ] }
      ]
    }
  };

  return {
    INPUTS: INPUTS, PAGES: PAGES,
    LABELS: { pictureMode: PICTURE_MODES, energySaving: ENERGY_SAVING, soundMode: SOUND_MODES, sleepTimer: MINUTES, soundOutput: SOUND_OUTPUTS }
  };
}());

if (typeof module !== "undefined") { module.exports = SettingsSpecs; }
