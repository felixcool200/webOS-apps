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

  // The inputs picture settings are kept for, by the name settingsservice gives them; HDMI inputs are
  // named by the TV.
  var INPUTS = { "default": "Apps", dtv: "Live TV", atv: "Analogue TV" };

  // A page: its title, LG Settings' panel for "Open in LG Settings" (launch parameter `target`), and
  // sections of rows. `context: "picture"` adds an "Applies to" row that chooses the input whose
  // picture settings the page changes (rows the TV keeps per input; the others apply to all inputs).
  // A row: key and category in settingsservice, kind (range or choice), label, help, value labels,
  // order (of the choices), greyedWhen: { key, values, reason } to grey it out while another row has
  // one of those values, and reread: true when a change alters what the other rows show.
  var PAGES = {
    picture: {
      title: "Picture",
      lg: "picture",
      context: "picture",
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
    }
  };

  return { INPUTS: INPUTS, PAGES: PAGES, LABELS: { pictureMode: PICTURE_MODES, energySaving: ENERGY_SAVING } };
}());

if (typeof module !== "undefined") { module.exports = SettingsSpecs; }
