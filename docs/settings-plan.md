# Plan: Minimal Home's Settings covering LG's Settings

Status: all phases are built and installed (Minimal Home 0.3.58): the hub and the Picture, Sound, Network, Power and energy, General, Accessibility and About this TV pages, with Phase 7's rows, each checked on the TV through Home with remote keys (`networkinput/sendSpecialKey`) and set back. Code references below are to commit `c4a7849` on `remote-buttons`, whose app code is the same as `d745ffd` (only `README.md` changed in between). Everything marked D, V, C or S below was read on the TV on 2026-10-24 with read-only calls.

## Decisions and checks (2026-10-24)

- **Hub rows (question 1):** the plan's five quick rows (Picture mode, Panel brightness, Energy saving, Sound mode, Sleep timer); Sleep timer joins with Phase 3.
- **Picture context (question 2):** a choice on the page, "Applies to", starting on the input that played last. The TV's current picture context is the last source that played video, not the app in front: right after a boot it is live TV (`input: "dtv"`) with Minimal Home in front, and switching to HDMI 2 without a signal, or opening Departures, left it unchanged. Sound followed HDMI 2 at once.
- **LG's rules (question 3 and in general):** copy what LG Settings does. Panel brightness is greyed while Energy saving is Auto or Maximum, on the hub and the page.
- **Steps and held keys (question 5):** 5 on ranges of 100 or more, 1 on smaller ones; while a value is written, the newest one asked for waits, so holding a key keeps changing it.
- **Writes with an explicit dimension (question 12, Phase 0 checks 4 and 5):** checked on the TV. Writing HDMI 3's sharpness with `{input: "hdmi3", pictureMode: "eco"}` changed only HDMI 3 (live TV's, the apps' and the current values stayed); it was set back. So pages write with the context's dimension and don't read before each write.
- **"(User Settings)" (question 13):** set as LG does. `pictureSettingModified` has the dimension `[input]`, so in the same `setSystemSettings` as a `[input, pictureMode]` key it is refused (`errorKey`); pages send it as a second operation in the same `settingsservice/batch`.
- **Transport (Phase 0 check 2):** one `settingsservice/batch` per read or write. Measured over SSH only (4.3); the Homebrew Channel exec hop is the same for both ways.
- De-Judder waits for TruMotion (Phase 7): LG shows it only under TruMotion's User Selection, which is per app.
- Energy saving, Reduce blue light and FILMMAKER MODE auto start have no dimension: they apply to every input, and the page says so.
- **Other pages (questions 4, 8, 9, 10, 14), taken from the recommendation in section 2:** Live Plus and Limit ad tracking are on General, and screensaver promotion on Power and energy; Sound out is read-only; Accessibility has the plan's rows; the power on and off timers stay in LG Settings; turning Wi-Fi off asks for OK twice. Energy saving is on both Picture and Power and energy.
- **Pages without "Applies to" write without a dimension,** as LG Settings does, so sound settings kept per input change the one playing now.
- **The sleep timer (Phase 3, checked on the TV):** `getRemainTime` answers the time left as `sleepTimeMinute` and `sleepTimeSecond` (9 and 58 two seconds after a 10 minute timer), not as seconds in all; with no timer only `sleepTimeSecond: 0`. `add` with `"10"` and `"0"` set and cancelled it.
- **LG's targets:** `picture`, `sound`, `general`, `EnergySaving`, `accessibility`, `TVInformation` and `SoftwareUpdate` are all in LG Settings' target table (`oV`). The screen capture leaves out LG Settings' overlay, so the panels it opens were not seen; `com.webos.app.firstuse-overlay` with `{target: "network"}` opened LG's Internet Connection screen.
- **The hub:** one-line link rows (6.4vh) keep both columns above the footer: five quick rows and two Minimal Home links on the left, seven page links and the LG card on the right.

Phase 7 (checked on the TV on 2026-10-24, each change set back):

- **TruMotion** (`truMotionMode`): written with `{input: "hdmi3", pictureMode: "eco"}` it didn't read back that way; read with any `app_id` it answers, and written for YouTube it changed for every app and input. So the TV keeps one TruMotion for what plays, and Home reads and writes it with an `app_id` for the input that played last only. De-Judder (`truMotionJudder`) shows under TruMotion's User Selection, as in LG.
- **Aspect ratio** (`arcPerApp`, category `aspectRatio`): written for `com.webos.app.hdmi3` it also changed HDMI 2 and live TV, while web apps kept their own (`original`). Home shows it for the input that played last, and not for apps (it can't tell which app you came from).
- **Resets:** `resetSystemSettings` runs inside `settingsservice/batch`. A picture reset of HDMI 3's Eco (`{input, pictureMode}`; `_3dStatus` doesn't exist on this TV, and LG passes it only when it does) left every value as it was, and a sound reset of `audioBalance` and `soundModeModified` kept 0. LG offers the sound reset only in Standard (this TV lacks `supportSoundWizard`), with the keys of `soundResetKeys`.
- **Apply to all inputs** (`applyToAllInput: "picture"`, `applyToAllInputSSM: "sound"`) was not tried: it would copy one input's mode over the others'. Home writes it as LG does, the picture one with the chosen input's dimension.
- **Always Ready:** on is `lifeOnScreenMode` `allEnabled` or `alwaysReady` (now `none`); LG turns it on as `allEnabled` and in Europe records `erpUserConfirm: true` (already true here). **Power on screen:** `homeAutoLaunch` and `selectedInputApp` with `checkHomeAutoLaunchValue: "user"` (it exists: `"default"`); single inputs are China-only. **Sound out:** the TV speaker and `audio/getSoundOutput`'s `settingsSoundOutputs`, written to `soundOutput`. **Grayscale and Invert colours:** LG writes `screenMagnification: "off"`, then `adjustments` with `highContrast` and `focusEmphasis` off.
- **SIMPLINK, Turn on via Wi-Fi (Mobile TV On), Minimum brightness, Audio guidance and Extend pressing time** are plain keys; Turn on via Wi-Fi and Minimum brightness ask first, as LG does. Extend pressing time doesn't change Home's hold to arrange apps: with Long press time at 5 s, holding OK still started arranging after about a second (Home's own 0.6 s), tried with the remote on 2026-10-24. Home times the hold itself from keydown to keyup; the setting is for LG's long-press functions and key repeat.

Checked through Home on the TV after installing (each set back, and every input's Vivid and Eco compared with a snapshot afterwards):

- **Apply to all inputs copies what plays.** Named with HDMI 3's dimension while live TV played, it copied nothing; written as LG writes it (no dimension) from live TV's Vivid, it copied live TV's sharpness to every input's Vivid. So the row shows only for the input that played last.
- **Reset picture mode** of HDMI 3's Vivid (not playing) restored its sharpness and cleared its flag, and nothing else changed.
- **Screen zoom was taken out:** turned on, it zooms the whole screen at once and the arrows then pan the zoom, so Home could not turn it off again (it was turned off over Luna). It stays in LG Settings.
- **Sound out:** after a switch, `getSoundOutput` lists only the output in use (and `lastSoundOutput` the one before), so Home offers the TV speaker, optical with and without the TV speaker (which LG offers always) and those outputs, and can switch back.
- **Switches:** the TV lists on/off values as `on, off` or `true, false`; Home orders them off first, so Left turns a switch off and Right on.
- Power on screen, Always Ready (asks first; turned off it is written `off`, so it was put back to `none` over Luna), Turn on via Wi-Fi, Minimum brightness (asks once), SIMPLINK, Grayscale, Audio guidance, Extend pressing time, TruMotion, Sound out, and Sound's apply and reset all read back as written.

## Summary

- LG's Settings app on this TV (`com.palm.app.settings` 4.0.1) has four tabs: Picture, Sound, General and Support. General holds Accessibility, Always Ready, AI Service, Simple Mode, Game Optimizer, Curvature, Lighting, Usage Care, Channels, Network, External Devices, System and Energy Saving (plus OLED Care on OLED models). LG's Network item opens a separate LG app, `com.webos.app.firstuse-overlay`.
- Most of the items worth having are plain `com.webos.settingsservice` keys that Minimal Home can read and write the way it already does. Section 1 lists about 75 of them. The rest need a PIN, a keyboard, pairing, a reset or reboot, an LG account, or another service. Those stay in LG Settings.
- Proposal: the Settings view becomes a hub with five quick rows and links to seven category pages (Picture, Sound, Network, Power and energy, General, Accessibility, About this TV). Each page is a scrolling list built from a data table. It is read in one root call when it opens, never at Home's start.
- Four findings shape the code. All were checked on the TV:
  1. **Partial replies.** When a read names a key the TV lacks, the reply says `returnValue: false` but still carries the other values. `WebOS.readReply` throws those values away. For `getSystemSettingDesc`, `errorKey` then lists every key that was asked for, so only `results` shows which keys exist.
  2. **One description call per category.** A single `getSystemSettingDesc` call returns values, ranges and visibility for many keys at once. For today's four choice keys, its values match `getSystemSettingValues` exactly, and today Settings makes one of those calls per choice.
  3. **Batched reads.** `settingsservice/batch` runs many reads in one Luna call. Each read in it fails on its own without affecting the others, and LG Settings uses it itself. Over SSH, the seven reads Settings makes today took 48 ms in one batch, against 129 ms as seven parallel `luna-send`s, and about a tenth of the `luna-send` CPU. It still has to be measured from Home before it is adopted.
  4. **Home sees the apps' picture.** While Home is in front, settingsservice reports picture input `default` (apps). HDMI 2 keeps its own values: its SDR picture mode is `eco` while the apps' is `normal`. So today's Picture rows change the apps' picture, not the HDMI picture the user may have come from. Reading another input's values with an explicit dimension works.
- The plan has eight phases. Phase 0 finishes the checks (two were done while writing this) and changes nothing the user sees. Phase 1 adds the page engine and the Picture page. Each later phase adds one category.

## 0. Sources and method

The tables cite sources by letter.

| Ref | Source | How it was read |
|---|---|---|
| B | LG Settings bundle `/usr/palm/applications/com.palm.app.settings/main.js` (3.2 MB, Enact, minified). Panels are registered in objects such as `BHe` (`General:function…`). Deep-link targets map to panel paths in `oV`. Items read keys through hooks: `VH("key")` gives value and description, `BH("key")` a range, `KH("key")` the value labels. They write with `changeSetting({category, settings})`, mostly through `settingsservice/batch`. | Copied with `scp` and read with `grep` and small Python scripts. Minified names such as `VH`, `G$` and `oV` are from this build and change with any LG update. |
| F | LG's network screens `/usr/palm/applications/com.palm.app.firstuse/main.js`, launched as `com.webos.app.firstuse-overlay`. | Grepped for Luna methods. |
| D | `luna://com.webos.settingsservice/getSystemSettingDesc {category, keys:[…]}` | Type, values or range, `ui.visible`/`ui.active`, `dimension`. Every key in section 1 was read in one `settingsservice/batch` call (see the appendix). |
| V | `luna://com.webos.settingsservice/getSystemSettings {category, keys:[…]}`, optionally with `dimension` or `app_id` | Current values and the dimension in force. Same batch as D. |
| M | `/etc/palm/description.categorykeysmap.json` (category → keys), `/etc/palm/description.json` (descriptions with per-model `condition`), `/etc/palm/description.map.json` and `/etc/palm/dimensionFormat.json` (dimensions) | Copied and read. |
| C | `luna://com.webos.service.config/getConfigs` with the 115 config names B asks for (`configNames:[…]`) | One call. Six names are missing on this TV, including `profile.ledLighting` and `profile.lifeStyle`. |
| S | Other read-only calls, named where they are used | One call each. |

Facts about this TV:

- System: `getSystemInfo` gives model `65QNED80T6A.BEUFLJP`, firmware 33.31.75, SDK 10.3.2. `osInfo/query` gives "webOS TV Lite" 10.3.2.
- Configs (C):
  - Display: `tv.hw.displayType` "LCD", so B's `OLED` flag is false (B sets it as `displayType === "OLED"`). `tv.model.toolType` "QNED80".
  - Region: `languageCountrySel` "EU" and broadcast system DVB. V gives `country` "SWE".
  - Features: `supportPictureWizard` false, `supportScreenType` "none", `supportVRR` "vrr_off", `supportEARC` true, `supportWowCast` false, `supportWiSA` false, `com.palm.app.settings.supportIPv6` false, `system.arcPort` 2.
- Network: Wi-Fi is connected and Ethernet is unplugged (`connectionmanager/getstatus`, S). The TV is therefore reached over Wi-Fi.
- State at the time of reading:
  - The foreground app was `org.webosbrew.minimalhome` (`applicationManager/getForegroundAppInfo`), and `tvpower/power/getPowerState` said "Screen Saver".
  - Picture dimension: `{input:"default", pictureMode:"normal"}`, and `{input:"default", dynamicRange:"sdr"}` for `pictureMode` itself.
  - Sound dimension: `{audioInput:"media", soundOutput:"tv_external_speaker", audioOutput:"default"}`. The previous agent saw `audioInput: "hdmi2"`, so it follows what is playing. B labels `tv_external_speaker` "Optical Out Device + TV Speaker".
  - `free -m` showed 229 MB available.
- Temporary files: five request and timing files (and one scratch file the timing script wrote) went to `/tmp` on the TV. All were removed after use, and `ls /tmp` showed none left.

Limits:

- B shows what LG's code can show. Whether an item appears depends on D's `ui.visible` and on LG's own config checks. The config checks were followed for the model-specific items: OLED, lighting, curvature, SIGNATURE, Standby Light, Picture Wizard, captions, video description and sign language.
- The tree in section 1 was traced in B for General's top-level items and for the SIGNATURE and Standby Light items. For the items in sections 1.2–1.6 that are named in the Notes, the key was matched to LG's label next to its hook in B. Where an item sits deeper in a sub-panel comes from the earlier agent's parse of B and was not re-traced one by one.
- Everything was read with an app in front and an SDR picture. HDR-only items were not checked.
- No writes were made, so every write shape below comes from B and is untested.

## 1. Inventory

### 1.1 Legend

- **Key (category)**: a settingsservice key. Each one was found in M and read with D and V, unless the row says otherwise.
- **Dim**: the key's `dimension` from D. Keys with a dimension store one value per context (input, picture mode, sound output and so on), and a write must target the right context (see 1.9). A dash means none.
- **This TV**:
  - "shown": D says visible and active, and B shows the item.
  - "greyed": visible but not active when it was read.
  - "hidden": D says not visible.
  - "n/a": D has no description for the key (it is missing from `results`), or B hides the item because of a config named in the notes.

  These were read with an app in front and an SDR picture. HDR-only items may appear with an HDR signal (unverified).
- **R/W**:
  - "W": a plain `setSystemSettings` that setting the old value back undoes. B shows no side effects.
  - "W!": a write with side effects or interplay, described in the notes.
  - "R": show it read-only.
  - "LG": leave it to LG Settings.
  - "–": nothing to do on this TV.

  All reads listed here are read-only Luna calls.
- **Values**: from D, in D's order. Values D marks hidden are in brackets.
- "Now": the value V read on 2026-10-24.
- "MH": Minimal Home already has it.

### 1.2 Picture (LG panels `Picture`, `AdditionalPicture`, `Brightness`, `Color`, `ColorManagementSystem`, `WhiteBalance`, `Clarity`, `AspectRatioSettings`)

| LG item | Key (category) | Values | Dim | This TV | R/W | Notes |
|---|---|---|---|---|---|---|
| Select Mode | `pictureMode` (picture) | vivid, normal, eco, cinema, sports, game, filmMaker, expert1, expert2 [16 more: personalized, photo, HDR and Dolby Vision modes] | input, dynamicRange | shown | W | MH. Now `normal` for apps. With an explicit dimension, V gives HDMI 2 SDR `eco` and HDMI 2 HDR `hdrStandard`. Minimal Home writes it without a dimension (`settings.js:180`). On this TV LG calls `eco` "Auto Power Save" (B, `SG`: EU and eye sensor), and adds "(User Settings)" to a mode whose `pictureSettingModified` is true. |
| Display Type | `displayType` (picture) | – | – | n/a | – | M has it only under condition `hdmiTx: on`. |
| Personalized Picture Wizard | launches `com.webos.app.picturewizard` | – | – | n/a | – | `supportPictureWizard` is false (C). |
| Aspect Ratio | `aspectRatio` (picture) | 16x9, original, full_wide, 4x3, 14x9, zoom, cinema_zoom [just_scan inactive, zoom2] | input | shown | W! | Now `16x9`. For apps, B reads `arcPerApp` (category aspectRatio, dim input, twinMode) with the foreground app's `app_id`. With Home's id, V gave `original`, and without an `app_id` it gave no value. |
| Just Scan | `justScan` (aspectRatio) | on, off [auto] | input, resolution | shown | W! | Needs `app_id`. With Home's id, V gave `on` and dimension `{input:"default", resolution:"fhd", twinMode:"off"}`. |
| Panel Brightness | `backlight` (picture) | 0–100/1 | input, pictureMode | shown | W! | MH. Now 100. V gives a number for apps but text ("100") for HDMI 2. While `energySaving` is auto or max, LG greys the item and shows "Energy Saving" as its value. It also locks it in ISF-calibrated expert modes (`isfMode`, now `{expert1:"none", expert2:"none"}`) (B, hooks `G$` and `oG`). |
| Contrast | `contrast` (picture) | 0–100/1 | input, pictureMode | shown | W | MH. Now "95". |
| Black Level | `brightness` (picture) | 0–100/1 | input, pictureMode | shown | W | MH. Now 50. |
| Auto Dynamic Contrast | `dynamicContrast` (picture) | off, low, medium, high | input, pictureMode | shown | W | Now low. |
| Gamma | `gamma` (picture) | low, medium, high1, high2 [mediumHavingLevel] | input, pictureMode | shown | W | Now high1. |
| LED Local Dimming | `localDimming` (picture) | off, low, medium, high | input, pictureMode | shown | W | Now low. |
| Video Range | `blackLevel` (picture) | auto, low, high | input, pictureMode | greyed | W! | The value is an object per colour system (`{secam:"auto", ntsc:"auto", pal:"auto", …}`). B writes the whole object with the current colour system's field changed. |
| Motion Eye Care | `motionEyeCare` (picture) | off, on | input, pictureMode | shown | W | Now off. |
| Dynamic Tone Mapping | `hdrDynamicToneMapping` (on, off, HGIG); `DtmProfessional` (true, false) | | input, pictureMode | hidden / greyed | – | HDR only (guess). |
| Peak Brightness, Expression Enhancer, Near Black Detail | `peakBrightness` (off–high), `expressionEnhancer` (off, detail, highlight), `nearBlackDetail` (−3–3) | | input, pictureMode | hidden | – | |
| HGiG, FILMMAKER MODE Ambient Light, Precision HDR Master Pro, Response Time | `hgig`, `filmmakerAmbientLight`, `precisionHdrMasterPro`; Response Time has no key in M | – | – | n/a | – | No description on this TV. In M, `hgig` needs `turnKeyVersion: wee` and `filmmakerAmbientLight` needs `initialPlatformVersion: 10`; this TV's is 9 (C, `datamigrator.initialPlatformVersion`). |
| Color Depth | `color` (picture) | 0–100/1 | input, pictureMode | shown | W | Now "55". |
| Tint | `tint` (picture) | −50–50/1 | input, pictureMode | shown | W | Now "0". |
| Color Gamut | `colorGamut` (picture) | auto, native, adobeRGB [wide, extended, dynamic] | input, pictureMode | shown | W | Now native. |
| Color Adjustment | `dynamicColor` (picture) | off, low, medium, high, user | input, pictureMode | shown | W | Now low. The label is from B. |
| Fine Tune: color, saturation, tint, luminance, reset | `colorManagementColorSystem` (red, green, blue, cyan, magenta, yellow) selects the colour. `colorManagementSaturation<Colour>`, `colorManagementHue<Colour>` and `colorManagementLuminance<Colour>` (picture, from M) hold the values. | | input, pictureMode | shown | LG | Calibration. The per-colour keys were not read. |
| White Balance → Color Temperature | `colorTemperature` (picture) | −50–50/1 | input, pictureMode | shown | W | MH. Now "20". |
| White Balance → Method, Point, IRE, Red/Green/Blue, Luminance, Reset | `whiteBalanceMethod` (2, 10, 22 [10code, 22code]), `whiteBalancePoint` (low, high), `whiteBalanceIre`, `whiteBalanceIre10pt`, `whiteBalanceRed/Green/Blue` (arrays, −50–50), `whiteBalanceLuminance` (50–500), `adjustingLuminance` (array) | | input, pictureMode | shown | LG | Calibration with array values. `whiteBalanceCodeValue` is hidden. |
| Sharpness | `sharpness` (picture) | 0–50/1 | input, pictureMode | shown | W | Now "25". |
| Super Resolution | `superResolution` (picture) | off, low, medium, high | input, pictureMode | shown | W | |
| Noise Reduction | `noiseReduction` (picture) | off, low, medium, high, auto | input, pictureMode | shown | W | |
| MPEG Noise Reduction | `mpegNoiseReduction` (picture) | off, low, medium, high, auto | input, pictureMode | shown | W | |
| Smooth Gradation | `smoothGradation` (picture) | off, low, medium, high | input, pictureMode | shown | W | |
| Real Cinema | `realCinema` (picture) | on, off | input, pictureMode | shown | W | Now on. |
| TruMotion | `truMotionMode` (picture) | off, cinemaClear, natural, smooth, user [clear] | input, pictureMode | shown | W! | Per app. V gives no value without `app_id`; with Home's id it gave `natural`. B writes it with `current_app: true` and then writes `pictureSettingModified` in a second call. |
| TruMotion → De-Judder, De-Blur | `truMotionJudder` (shown), `truMotionBlur` (hidden) (picture, 0–10/1) | | input, pictureMode | shown / hidden | W | Probably only used in TruMotion "user" (guess). |
| Precision Detail | `dolbyPrecisionDetail` (picture) | on, off | input, pictureMode | hidden | – | |
| Apply to All Inputs | `applyToAllInput` (picture) | picture, done | input, pictureMode | shown | W! | Now "done". After a confirmation, B writes `{applyToAllInput:"picture"}`. |
| Reset | `settingsservice/resetSystemSettings {category:"picture", dimension:{input, _3dStatus, pictureMode}}`, then `pictureSettingModified[mode] = false` (and `isfMode[mode] = "none"` when ISF is on) (B) | action | – | shown | W! | Confirmation. B disables it only in ISF-locked modes (`oG`). |
| Reduce Blue Light | `eyeComfortMode` (picture) | on, off | – | shown | W | Label from B, found near the key. Likely, but not traced to the hook itself. |
| FILMMAKER MODE Auto Start | `filmMakerMode` (picture) | on, off | – | shown | W | Label from B, found near `eyeComfortMode`. Likely, but not traced to the hook itself. |
| DR Mode | `demandResponse` (picture) | on, off | – | hidden | – | |
| AI Brightness Settings (General → AI Service) | `ai_Brightness` (aiPicture) | on, off | input, pictureMode | shown | W | Label from B. |
| AI Picture Pro, AI Genre Selection | `ai_Picture`, `ai_Genre` (aiPicture) | on, off | input, pictureMode | hidden | – | |
| OLED Care (Screen Move, Pixel Cleaning, Logo Brightness) | `screenShift`, `scheduledPixelCleaning`, `logoLuminanceAdjust` (picture), `oledCareMode`, `oledCareRecommendation` (other) | | – | n/a | – | B's General panel renders OLED Care only when `OLED` is true, and this is an LCD. D still lists the three picture keys as visible, so D alone isn't enough. |

How LG writes picture values (B, hooks `G$`, `W$` and `PG`): `setSystemSettings {category:"picture", settings:{backlight: v, pictureSettingModified: {...current, [pictureMode]: true}}}`. It passes no dimension, and adds `pictureSettingModified` only on the first change in a mode. V shows `pictureSettingModified` false for every mode on input `default`. Minimal Home's changes therefore don't mark a mode as changed, and LG's mode list then lacks the "(User Settings)" tag. LG's Reset doesn't depend on the flag (`oG` checks `isfMode` only).

### 1.3 Sound (LG panels `Sound`, `SoundOut`, `AdditionalSound`, `AudioFormat`, `AvSync`, plus speaker, Bluetooth, WOWCAST and WiSA panels)

| LG item | Key (category) | Values | Dim | This TV | R/W | Notes |
|---|---|---|---|---|---|---|
| Select Mode | `soundMode` (sound) | aiSoundPlus, standard, movie, news, sports, music, game [aiSound, aiSound_soundbar, game_rts, game_fps, dtsVirtualX, custom, bassBlast and more] | audioInput, soundOutput | shown | W | MH. Now standard. AI Service's AI Sound Pro item writes this same key (B). |
| Personalized Sound Wizard | launches `com.webos.app.soundwizard` | – | – | not checked | LG | Measures with the remote's microphone. |
| Sound Out | `soundOutput` (sound) | D lists many values: tv_speaker, external_optical, external_arc, bt_soundbar, tv_external_speaker, … | audioOutput | shown | W! | Now `tv_external_speaker` ("Optical Out Device + TV Speaker" in B). The choice depends on what is connected. `audio/getSoundOutput` (S) gives `settingsSoundOutputs: ["tv_external_speaker"]`. |
| Dolby Atmos | `supportATMOS` (sound) | on, off | – | shown | W | Now on. |
| Balance | `audioBalance` (sound) | −50–50/1 | – | shown | W | Now "0". |
| Equalizer | `userEqualizer` (on, off); `userEqualizerValues` (5 bands, each −10–10/1) | | – | shown | W! | Now on, all zero. Works only in some sound modes (per LG's help text). The band frequencies were not traced. |
| Apply to All Inputs | `applyToAllInputSSM` (sound) | sound, done | – | shown | W! | After a confirmation, B writes `{applyToAllInputSSM:"sound"}`. |
| Reset | `resetSystemSettings {category:"sound", …}` (B) | action | – | shown | W! | Confirmation. The exact parameters were not traced. |
| Installation Type | `tvSetupConfiguration` (sound) | stand, wall_mount | – | shown | W | Now stand. |
| Automatic Volume Adjustment | `autoVolume` (sound) | on, off | – | shown | W | |
| DTV Audio Setting | `digitalAudioPriority` (sound) | mpeg, dolbyDigital, dobyDigitalPlus (sic), heAaC, auto | – | shown | W | Live TV only. |
| Match Screen and Sound → Delay | One of `avSyncSpeaker`, `avSyncSpdif`, `avSyncBtSurround`, `avSyncWisa` (sound), chosen by `soundOutput` (B, hook `bre`): external_optical, external_arc and wow_cast use Spdif; wisa_speaker uses Wisa; tv_speaker_bluetooth uses BtSurround; anything else uses Speaker. | 0–60/1 | audioInput | shown | W | All four are 0 now. The current output uses `avSyncSpeaker`. The delay is active only while `avSyncBypassInput` is inactive or off. |
| Match Screen and Sound → Bypass | `avSyncBypassInput` (sound) | on, off | audioInput | shown | W | |
| (Match Screen and Sound on/off) | `avSync` (sound) | on, off | audioInput | shown | W | Now on. B reads it, but its place in the menu was not traced (guess). |
| Select HDMI Input Audio Format | `inputAudioFormatHDMI1`–`HDMI3` (HDMI4 hidden) | bitstream, pcm | – | greyed | W | |
| TV Sound Mode Share | `soundAlive` (sound) | on, off | – | greyed | – | For a wireless LG soundbar. |
| LG Sound Sync | `lgSoundSync` (sound) | on, off | – | shown | W | Optical. |
| Digital Sound Output | `soundOutputDigital` (sound) | pcm, auto, passThrough | audioInput | greyed | W | Probably active with optical-only or ARC output (guess). |
| eARC Support | `eArcSupport` (sound) | on, off | – | hidden | – | `supportEARC` is true (C). Probably appears with ARC output (guess). |
| AC-4 Dialogue Enhancer | `ac4DialogueEnhancer` (sound) | on, off | – | shown | W | |
| Broadcasting on Auracast | `auracast` (sound) | on, off | – | hidden | – | |
| Bluetooth, WOWCAST, WiSA, Multi Speaker panels | `bluetoothMode` (surroundMode, speakerMode), `deviceCntOfBtGeneral`, `wisaSpeakerChannelType`, `blegattSoundbar`, plus the `btaudiosrc`, `bthidmanager`, `wowplay` and `wisa` services | | – | partly shown | LG | Pairing and device lists. `supportWowCast` and `supportWiSA` are false (C). |
| AI Acoustic Tuning (General → AI Service) | `magicSpaceSound` (sound) | off, standard, bass, treble | – | shown | LG | Needs a microphone measurement first. |

### 1.4 General (LG panel `General`)

B's General panel (`BHe.General`) renders, in this order: Accessibility, Always Ready, AI Service, Simple Mode Settings, Game Optimizer, Curvature Setting, Lighting Setting, OLED Care (only when `OLED`), Usage Care, Channels, Network, External Devices, System and Energy Saving.

Energy Saving (`EnergySaving` panel):

| LG item | Key (category) | Values | Dim | This TV | R/W | Notes |
|---|---|---|---|---|---|---|
| Energy Saving Step | `energySaving` (picture) | auto, off, min, med, max | – | shown | W! | MH. Now auto. Auto and max take over Panel Brightness (see 1.2). |
| Minimum Brightness | `energySavingAutoMin` (picture) | 0–10/1 | – | shown (D) | W! | Now 5. Only for Energy Saving auto. LG asks first, because energy use may rise (B). |
| Auto Power Off | `automaticStandBy` (time) | 0 (off), 2, 4, 6, 8 hours | – | shown | W | Now "4". |
| No Signal Auto Off | `autoOff15Min` (time) | on, off | – | shown | W | Now on. `noSignalAutoOff` is hidden. |
| No Operation Auto Off | `noOperationAutoOff` (time) | off, 3, 6, 12, 24 | – | hidden | – | |
| Screen Off | `ScreenOff` (picture) | action | – | shown (D) | – | V gives no value, with or without Home's `app_id`. Remote buttons already offer Screen on/off. |

Always Ready, AI Service and model-specific items:

| LG item | Key (category) | Values | Dim | This TV | R/W | Notes |
|---|---|---|---|---|---|---|
| Always Ready | `lifeOnScreenMode` (general) | off, lifeOnScreen, alwaysReady, allEnabled [none] | – | shown | W! | Now "none", a hidden value. It changes standby power and what shows when the TV is "off". |
| AI Service → Voice Recognition, AI Recommendation | voice apps, `aiNudge`, `aiSettingsNudge` (general, on/off) | | – | shown | LG | Voice, account and cloud. |
| Simple Mode Settings | `seniorMode` (option), `pqPlus`, `soundPlus` (option), `remotePointer`, `lifeAlarm` (general) | | – | hidden | – | |
| Game Optimizer | launches `com.webos.app.gameoptimizer`; `gameMode` (other) is an object per HDMI input | | – | shown | LG | Now `{hdmi1:"on", hdmi2:"off", hdmi3:"off", hdmi4:"off"}`. |
| Curvature Setting | `curvature` (option, object) | | – | n/a | – | B shows it only for `supportScreenType` "bendable" (hook `pz`); here it is "none". |
| Lighting Setting | `lighting*` (other) | | – | n/a | – | B needs `supportLedLighting`, and `profile.ledLighting` is missing (C). |
| SIGNATURE TV Settings (Opening, sound, Always On) | `tvOnScreen` (effect, liveTV), `tvOnSound`, `welcomeFeature`, `blueToothSpeakerMode` (general), `alwaysOn*`, `aodPictureSyncMode` (other) | | – | n/a | – | B shows it only for `supportScreenType` "aplus" (hook `Fle`). D still lists `tvOnScreen`, `tvOnSound`, `welcomeFeature`, `blueToothSpeakerMode` and `aodPictureSyncMode` as visible. That `aodPictureSyncMode` belongs to Always On is a guess. |
| Usage Care | `usageCare` (option, true/false); launches `com.webos.app.familycare` | | – | shown | LG | |
| Channels (tuning, channel manager, CI, HbbTV, …) | `channel` category, `hbbTV` (option: on, off, onByUser, offByUser), `thirdPartyCookie` (option, "Third-Party Cookies" for HbbTV) | | – | shown | LG | Live TV. A scan replaces the channel list. `thirdPartyCookie` is now on. |

System → Language, Location, Time and Timers (`System`, `Language`, `Location`, `TimeAndTimers`, `Timers` panels):

| LG item | Key (category) | Values | Dim | This TV | R/W | Notes |
|---|---|---|---|---|---|---|
| Menu Language, Audio Language, Keyboard Languages | `menuLanguage` (option, now "eng", D lists no values). The others were not traced. | | – | shown | LG | Changing the locale probably restarts the UI (guess). |
| Location: Country, Services Country, Address, Weather Location | `country` (option, a file list `/etc/palm/countryList.json`, now "SWE"), `smartServiceCountryCode3` (option, "SWE"); Weather Location launches `com.webos.app.weatherlocation` | | – | shown | LG | Can reset services or channels. |
| Time → Set Automatically | `autoClock` (time) | on, off | – | shown | W! | Now on. Off needs a manual time, set through `com.palm.systemservice/time/setSystemTime`. |
| Time → Time, Date, Time Zone | `com.palm.systemservice/time/getEffectiveBroadcastTime` (S, local time); `timeZone` (time, an object: `{ZoneID:"Europe/Stockholm", City:"Stockholm", …}`) | | – | shown | R, else LG | Show them read-only. |
| Timers → Sleep Timer | `com.webos.service.tvReservationAgent/timer/sleep/getRemainTime` (S: `{sleepTimeSecond: 0}`) and `…/add {sleepTimeMinute: "30"}` ("0" cancels) (B); labels from `sleepTimer` (time): off, 10, 20, 30, 60, 90, 120, 180, 240 | | – | shown | W | Not a settingsservice write in B. |
| Timers → Power On Timer | `onTimerEnable` (off, on), `onTimerHour` (0–24), `onTimerMinute` (0–59), `onTimerWeekday` (0–255), `onTimerAppId`, `onTimerChannel`, `onTimerVolume` (0–100) (time) | | – | shown | LG | Now off, with `onTimerAppId` `com.webos.app.livetv`. `onTimerWeekday` looks like a day bitmask (guess). |
| Timers → Power Off Timer | `offTimerEnable`, `offTimerHour`, `offTimerMinute`, `offTimerWeekday` (time) | | – | shown | LG | Now off. |
| Timers → Auto Power Off after 4 Hours | `autoOff2HourOnTimer` (time) | on, off | – | shown | W | Now on. Per B's help text, it turns the TV off 4 hours after a Power On Timer start without input. |

System → Additional Settings, Safety, Reset (`AdditionalSystem`, `HomeSettings`, `ScreenSaverSettings`, `PointerOptions`, `Safety` panels):

| LG item | Key (category) | Values | Dim | This TV | R/W | Notes |
|---|---|---|---|---|---|---|
| Safety (TV, app and input locks, password) | `lock` category, PIN prompt | | – | shown | LG | PIN. |
| Quick Start+ | `quickStartMode` (option) | on, off | – | shown | W | MH. Now on. Label from B. |
| Home Settings → Power On Screen ("Home" or "Recent Input") | `homeAutoLaunch` (general, on/off, now on), `selectedInputApp` (general: off, HDMI_1–HDMI_4, now off) | | – | shown | W! | Decides whether Home or an input appears at power on, which matters for Minimal Home. |
| Home Settings → Home Promotion, Content Recommendation, Wallpaper | `homePromotion` (general), `contentRecommendation` (other), `homeWallPaper` (option: opt1–opt3) | | – | shown | – | Only for LG's own Home, which Minimal Home replaces. Promotion and recommendation are now off. |
| Home Animation | `homeEffect` (general) | on, off | – | hidden | – | |
| Standby Light | `standByLight` (option) | on, off | – | shown | W | Now off. B shows it when the TV has no logo light, no atelier screen and no lifestyle profile, which is this TV (hook `Cae`). |
| Screen Saver Settings → Screen Saver Promotion | `screenSaverAd` (general) | on, off | – | shown | W | Now off. |
| Screen Saver Settings → Standby Time | `screenSaverTimer` (option) | 3, 10, 20, 30 minutes | – | shown | W | Now "3". |
| Pointer Options → Tracking Speed, Pointer Size | `pointerSpeed` (slow, normal, fast), `pointerSize` (small, medium, large) (option) | | – | shown | W | Now slow and small. `enablePointerOptions` is true (C). |
| Live Plus | `livePlus` (option) | on, off | – | shown | W | Content recognition, a privacy setting. Now off. |
| Live Promotion | `livePromotion` (option) | | – | hidden | – | |
| Settings Help | `helpOnSettings` (option) | on, off | – | shown | – | Only affects LG Settings. |
| Use Provided Remote Only | B item `remoteSetting` (`micomservice/setSpecialRemoconMode`); no settingsservice key in M | | – | not checked | – | |
| Battery, Touch lock, Motion sensor, Screen Off time, Mood Maker, No Signal Standby, Adaptive Power Delivery, Set ID, Zero Connect Box, Emergency information | `lowPowerMode` (other), `touchLock` (general), `motionSensorSensitivity`, `screenOffTime`, `artisticDisplayTimer`, `setId` (option), `dpmsAutoOff` (time), `adaptivePowerDelivery` (other) | | – | hidden or other models | – | D lists `touchLock`, `motionSensorSensitivity`, `screenOffTime` and `setId` as visible. They probably belong to models with that hardware (guess, LG's conditions not traced). `adaptivePowerDelivery` has no description. |
| Reset to Initial Settings | `com.webos.service.devicereset/doReset` (B) | action | – | shown | LG | Factory reset. |

External Devices (`ExternalDevice`, `ExternalDeviceSettings` and `MobileTvOn` panels):

| LG item | Key (category) | Values | Dim | This TV | R/W | Notes |
|---|---|---|---|---|---|---|
| Connect Bluetooth Controller | `bthidmanager` service | | – | shown | LG | Pairing. |
| HDMI Settings → SIMPLINK (HDMI-CEC) | `simplinkEnable` (other) | on, off | – | shown | W! | Now off. Turns HDMI-CEC power and control linking on or off. |
| HDMI Deep Color | `uhdDeepColor` (other: off, 4k; dim gameInput) is greyed; `uhdDeepColorHDMI1`–`4` are hidden. The per-port item was not traced. | | gameInput | – | LG | The device renegotiates the signal. |
| 4:4:4 Pass Through, Quick Media Switching, Dolby Vision PC | `444BypassHDMI1`–`4`, `qmsVrr`, `enableDolbyVisionPC` (other) | | – / gameInput | hidden | – | |
| Universal Control Settings | launches `com.webos.app.connectionwizard` | | – | shown | LG | |
| Mobile TV On | `wolwowlOnOff` (network) | true, false | – | shown | W! | Now "true". Wakes the TV over the network. |
| Delete Connection History | `ics/blaster/deleteIPConnectionHistory`, `miracast/deletePairedDeviceList`, … (B) | action | – | shown | LG | |

### 1.5 Accessibility (LG panel `Accessibility`)

LG treats High Contrast, Focus with High Contrast, Grayscale, Invert Colors and Screen Zoom as exclusive. Turning one on also writes the others off: for example `{highContrast:"on", adjustments:{blackAndWhite:"off", colorInversion:"off"}}` (B). Minimal Home has to send the same combined write.

| LG item | Key (category) | Values | Dim | This TV | R/W | Notes |
|---|---|---|---|---|---|---|
| Audio Guidance (+ Speed, Volume, Pitch) | `audioGuidance` (on, off), `audioGuidanceSpeed` (veryFast–verySlow), `audioGuidanceVolume` and `audioGuidancePitch` (veryLow–veryHigh) (option) | | – | shown | W! | The TV starts reading menus aloud. The high-quality voice pack goes through `tts/installAdvancedLanguagePack` and stays with LG. |
| Audio Description (+ Volume) | `audioDescription` (sound, on/off), `audioDescriptionVolume` (sound, −15–15/1, now "10") | | – | shown | W | Broadcasts. |
| Audio Type | `supplementaryAudio` (option) | off, audioDescription, spokenSubtitles, allType | – | shown | W | Broadcasts. |
| Additional Audio Selection | `additionalAudioSelection` (option) | none, audioDescription, cleanAudio, spokenSubtitles | – | shown | W | |
| Amplify Dialogue, Audio Description (ATSC 3.0) | `dialogEnhancementAtsc30`, `audioDescriptionAtsc30` (sound) | | – | hidden | – | |
| Video Description | `visualImpaired` (sound) | on, off | – | n/a | – | D says visible, but B needs `supportVideoDescription`, which is false (C). |
| Learn Remote Control | launches an LG app | | – | shown | LG | |
| Extend Pressing Time on Remote | `remoteSlowInput` (on, off), `longPressInterval` (basic, 1.5–5 s), `repeatInterval` (basic, 0.5–5 s) (option) | | – | shown | W! | Changes how presses register, so Home's hold-to-arrange (`HOLD_MS` 600, `app.js:48`) and the button hook may behave differently. |
| Device Power Sound | `tvPowerSound` (sound) | on, off | – | shown | W | Now off. |
| Screen Zoom | `screenMagnification` (option) | on, off | – | shown | W! | Turns on LG's magnifier overlay, and B writes `adjustments` off with it. |
| Listen simultaneously with a hearing aid | `hearingAid` (sound) | off, bluetooth, external_arc [auracast] | – | shown | W! | Needs a device. |
| Sign Language Zoom, Sign Language Guide | `autoSLZoomWithObjectDetection` (other), `signLanguageGuidance*` (option) | | – | n/a | – | `supportSignLanguageZoom` is false (C). |
| Subtitles | `subtitleLanguageFirst`, `subtitleLanguageSecond` (option, 32 languages, now swe and eng) | | – | shown | W | `supportDtvSubtitle` is true (C). Live TV only. |
| Hard of Hearing | `hardOfHearing` (caption) | on, off | – | shown | W | Now off. B needs `supportHardOfHearing`, which is true (C). |
| Closed Caption | `captionEnable`, `caption*` (caption) | | – | n/a | – | D says visible, but B needs `supportAtvCaption` or `supportDtvCaption`, and both are false (C). |
| Text with High Contrast | `highContrast` (option) | on, off | – | shown | W! | Exclusive, see above. |
| Focus with High Contrast | `focusEmphasis` (option) | on, off | – | shown | W! | Exclusive. |
| Grayscale, Invert Colors | `adjustments` (option), an object, now `{colorInversion:"off", blackAndWhite:"off"}` | | – | shown | W! | B always writes the whole object, with the other field off, together with `highContrast:"off"` and `focusEmphasis:"off"`. |

### 1.6 Support (LG panel `Support`)

| LG item | Key or service | This TV | R/W | Notes |
|---|---|---|---|---|
| Software Update | `com.webos.service.update` (`checkUpdate`, `startUpdate`, `getStatus`, …) | shown | LG | Downloads, installs and reboots. |
| User Guide, Quick Help, Customer Support | `com.webos.app.tvuserguide`, `com.webos.app.self-diagnosis` (title "Quick Help"), `com.webos.app.customersupport` | shown | LG (link) | App titles from each app's `appinfo.json`. |
| Memory Optimizer | LG panel `MemoryCleanup` | shown | LG | |
| Home/Store Mode | `storeMode` (option: home, store) | shown | LG | Now home. Store is a demo mode. |
| TV Information | `luna://com.webos.service.tv.systemproperty/getSystemInfo {keys:[modelName, firmwareVersion, sdkVersion]}`, `luna://com.palm.systemservice/osInfo/query` (S) | shown | R | |
| Privacy & Terms → Advertisement → Limit AD Tracking | `lmt` (general) | shown | W | Now off. Label and help text from B. Reset Advertising ID (`resetIfaId`) stays with LG. |
| Privacy & Terms: User Agreements, Legal Notice, App Permissions, Delete Personal Information, cookies and consent | `adCookie` (general, on/off, now on), `nativeConsentAd` (general, now `[]`), `ppm` permissions, `accountmanager` | shown | LG | Consent, account and cloud. See question 4. |
| User Report | `faultLogUpload` (option) | hidden | – | |

### 1.7 Network (LG's network screens, F)

LG's Network item launches `com.webos.app.firstuse-overlay` with `{"target":"network","appReturn":{"appId":"com.palm.app.settings","params":{"target":"general","item":"network"}}}` (B, component `Foe`).

| LG item | Service or key | R/W | Notes |
|---|---|---|---|
| Wired Connection: status, IP (automatic or manual), DNS | `connectionmanager/getinfo`, `getUserStatus`, `setipv4`, `setdns` (F) | R (MH shows the status), else LG | Ethernet is unplugged. A wrong IP or DNS cuts the TV off the network, and SSH with it. IPv6 is off on this model (`supportIPv6` false, C). |
| Wi-Fi Connection: on/off, list, connect | `wifi/getstatus`, `findnetworks`, `connect`, `setstate` (F); Minimal Home uses `connectionmanager/setstate {wifi}` | R and W! (on/off, MH), else LG | **The TV is on Wi-Fi.** Turning Wi-Fi off from Home cuts the network and SSH. Joining a network needs a password and the keyboard. |
| Advanced Wi-Fi Settings: hidden network, WPS, saved networks | `wifi/startwps`, `createwpspin`, `getprofilelist`, `deleteprofile` (F) | LG | |
| TV name | `deviceName` (network), now "[LG] webOS TV QNED80T6A" | R | Writing it needs the keyboard. |

### 1.8 Keys with no LG menu item found

These keys can be read (D and V), but no item for them was found in B: `screenSaverEnabled` and `noSignalScreenSaver` (general, both on), `aiSound` and `virtualSurround` (sound, off; B's item with id `aiSound` writes `soundMode`), `bleAdvertisingOnOff` (network) and `autoPowerOff` (timer, off). Don't offer them. `screenSaverEnabled` is tempting because of the screensaver that gets stuck, but switching off a screensaver that LG gives no switch for is untested ground.

### 1.9 Special handling

- **Partial replies.** For `getSystemSettings` with a key the TV lacks, the reply has `returnValue: false`, `settings` for the keys it has, and `errorKey` for the others. For `getSystemSettingDesc`, the reply has `returnValue: false` and `results` for the keys it knows, but `errorKey` lists every key asked for. Seen on the TV: `keys:["backlight","hgig"]` gave `errorKey:["backlight","hgig"]` with `backlight`'s description in `results`. A request with only unknown keys answers `"no result from DB"` (get) or `"no result in DB"` (desc). `WebOS.readReply` (`shared/webos.js:66–72`) turns any `returnValue: false` into an Error and drops the values.
- **A description but no value.** `truMotionMode`, `ScreenOff`, `arcPerApp` and `justScan` have a description but no value without `app_id`. Treat them as per-app (Phase 7).
- **Types vary.** `backlight` came back as the number 100 for apps but the text "100" for HDMI 2, and `brightness` as a number while most other ranges were text. Always convert ranges to numbers, as `settings-logic.js:54` already does.
- **Dimension.** Picture keys use `[input, pictureMode]` and `pictureMode` uses `[input, dynamicRange]`. `aspectRatio` uses `[input]`, `arcPerApp` `[input, twinMode]` and `justScan` `[input, resolution]`. `soundMode` uses `[audioInput, soundOutput]`, `soundOutput` `[audioOutput]`, and AV sync `[audioInput]`. Some HDMI keys use `[gameInput]` (D; for `pictureMode`, `soundMode` and `soundOutput`, M's `description.map.json` agrees).
  - Without a `dimension`, a read or write applies to the current context. LG's own writes pass none.
  - Minimal Home reads the key's current dimension right before writing and passes it back (`settings.js:180–186`), which targets the same context.
  - A `dimension` given explicitly must match the key's dimension list. `pictureMode` with `{input, pictureMode}` failed while `backlight` in the same call succeeded, and `avSyncSpeaker` failed when given `soundOutput` too. So reads of another context must group keys by dimension list, not only by category.
  - Input names in dimensions look like `hdmi2`. `HDMI_2` answered "There is no matched result from DB".
- **Foreground context.** Minimal Home is a full-screen app that isn't transparent. LG Settings is `"transparent": true, "defaultWindowType": "overlay"` (its `appinfo.json`), so it floats over the HDMI picture and probably edits that input. With Home in front, V reports picture input `default`, and the apps' picture differs from HDMI 2's (pictureMode `normal` against `eco`). The remaining step is to read the dimension right after switching from HDMI 2 to Home (Phase 0, check 4).
- **Per-app keys.** B reads `truMotionMode` (picture) and `arcPerApp`, `justScan` and the zoom keys (aspectRatio) with `app_id` set to the foreground app. It writes `truMotionMode` with `current_app: true`. With Home in front, that app is Home.
- **Interplay.**
  - Panel Brightness is greyed by LG while Energy Saving is auto or max, or while the expert mode is ISF-locked.
  - The AV sync delay key depends on Sound Out, and Bypass greys the delay.
  - Fine Tune needs Color Adjustment set.
  - De-Judder probably needs TruMotion "user".
  - The Equalizer works only in some sound modes.
  - The accessibility display options are exclusive (1.5).
- **Object values.** `blackLevel`, `adjustments`, `gameMode`, `timeZone`, `isfMode`, `pictureSettingModified` and `curvature` are objects. B writes `blackLevel` and `adjustments` whole.
- **Confirmation.** LG asks before picture and sound Reset, Apply to All Inputs, Minimum Brightness and Reset to Initial Settings.
- **Reboot or restart.** Reset to Initial Settings, software updates and probably language changes (guess).
- **Network changes.** IP, DNS, Wi-Fi joining and Wi-Fi off can lose the connection to the TV, which is on Wi-Fi. Mobile TV On changes network wake-up.
- **Account, cloud and consent.** AI Recommendation, voice, user agreements, consent, deleting personal information, Live Plus, advertising and cookies.

## 2. Recommendation

What decided each group:

| | Include | Include with care (later phase) | Leave to "Open LG Settings" |
|---|---|---|---|
| Risk | A plain write, undone by setting it back | Side effects the page must explain or confirm | PIN, keyboard, pairing, reset, reboot, network loss, account |
| Use for this TV (apps and HDMI 2, optical sound, privacy- and speed-minded) | Used often | Used now and then | Rare or one-off setup |
| Effort | A table row | A rule, an object value, a combined write or another service | A whole flow |

The "Use" row is a guess about the user, based on the README (Life's Good Without Spying in Tools, attention to start-up speed) and the TV state above.

**Include (Phases 1–6):**

- Picture (24 rows; MH has 6 of them today): picture mode, energy saving, panel brightness, contrast, black level, auto dynamic contrast, gamma, LED local dimming, motion eye care, colour depth, tint, colour gamut, colour adjustment, colour temperature, sharpness, super resolution, noise reduction, MPEG noise reduction, smooth gradation, Real Cinema, De-Judder, Reduce Blue Light, FILMMAKER MODE auto start, AI Brightness.
- Sound: sound mode, Sound Out as a read-only line, Dolby Atmos, balance, installation type, auto volume, AV sync delay and bypass, DTV audio, digital sound output, LG Sound Sync, AC-4 dialogue enhancer.
- Power and energy: sleep timer, auto power off, no-signal auto off, auto power off after 4 hours, energy saving, Quick Start+, standby light, screensaver standby time, screensaver promotion.
- General: pointer speed and size, Live Plus, Limit AD Tracking, time and time zone (read-only), menu language (read-only).
- Network: Wi-Fi on/off and status, Ethernet status (both MH today), TV name (read-only), and a link to LG's network screens.
- Accessibility: high-contrast text and focus (with the exclusive writes), device power sound, audio description and its volume, subtitle languages, hard of hearing.
- About this TV: model, software and webOS version, TV name, and links to LG's Software Update and User Guide.

**Include with care (Phase 7, or decide in the open questions):**

- Always Ready, Power On Screen, SIMPLINK, Mobile TV On, Minimum Brightness.
- Grayscale and invert colours (object value), Audio Guidance, Extend Pressing Time, Screen Zoom.
- TruMotion and aspect ratio (per app).
- Apply to All Inputs, and picture or sound reset (with a confirmation).
- Sound Out switching (only among the outputs the TV reports as available).
- An "Applies to" input choice for Picture (question 2).

**Leave to LG Settings:**

- Network setup: Wi-Fi join, WPS, IP and DNS.
- Bluetooth, WOWCAST and WiSA pairing, Universal Control, HDMI Deep Color.
- Channels (including HbbTV cookies) and locks (PIN).
- Language, location and setting the time by hand.
- Power On and Off timers (several linked fields, an input and a volume), unless question 10 says otherwise.
- Software update, Reset to Initial Settings, Memory Optimizer, store mode.
- Calibration: white balance, Fine Tune colours, wizards and self-diagnosis.
- Game Optimizer, AI voice and recommendations, privacy agreements, consent and app permissions.

Each page has an "Open in LG Settings" button that opens LG at that panel (see 4.5).

**Not on this TV:** OLED Care, Lighting, Curvature, SIGNATURE settings and Always On, Simple Mode, sign-language items, closed captions, video description, HGiG, FILMMAKER MODE Ambient Light, Response Time, Display Type and the Picture Wizard.

Why not everything:

- A large part of LG's items are flows: pairing, scanning, keyboard entry and PIN prompts. Rebuilding them would add far more code than the rest of Home has.
- Those flows are needed rarely. LG Settings is an overlay that opens in about a second; SKILL.md measured about 0.9 s for separate apps, but LG Settings itself was not timed.
- Some carry real risk on a TV that is reached over Wi-Fi (IP, DNS, Wi-Fi off) or has no easy recovery (reset, update).

## 3. Information architecture

Principles:

- Reuse the existing look (`.panel-view`, rows, footer hints) and the view-module pattern.
- Keep every screen usable with arrows, OK and Back.
- Never scroll the hub.

### 3.1 The hub (the Settings view)

Height budget at 1920x1080: `.panel-view` leaves about 73.8vh between header and footer (`style.css:227–252`: 100vh minus 7.2vh padding, a 12vh header and a 7vh footer). A row is at least 8.8vh (`settings.css:20–24`) and a heading about 4vh. Link rows get a new compact style of 7.2vh.

- Left column: a "Quick" heading and 5 rows (about 48vh), then a "Minimal Home" heading and 2 link rows (about 20.6vh with the gap). About 69vh in all.
- Right column: an "All settings" heading and 7 link rows (about 54.4vh), then the LG card (about 14–16vh, the size of today's card). About 69–71vh in all.

That fits, but with little room to spare. The existing "every Settings row fits above the footer" test decides (`test/browser/appearance.browser.js:83`).

```text
 12:04 Sat 24 Oct                                                              Settings
 Quick                                          All settings
 ┌──────────────────────────────────────────┐   ┌──────────────────────────────────────┐
 │ Picture mode                    Standard │   │ Picture              Standard · 100 › │
 │ Panel brightness   ━━━━━━━━━━━━━     100 │   │ Sound      Standard · Optical + TV › │
 │ Energy saving                       Auto │   │ Network               Wi-Fi on    › │
 │ Sound mode                      Standard │   │ Power and energy                    › │
 │ Sleep timer                          Off │   │ General                             › │
 └──────────────────────────────────────────┘   │ Accessibility                       › │
 Minimal Home                                   │ About this TV                       › │
 ┌──────────────────────────────────────────┐   └──────────────────────────────────────┘
 │ Remote buttons                         › │   ┌──────────────────────────────────────┐
 │ Appearance                       Ocean › │   │ Channels, Bluetooth, updates, locks   │
 └──────────────────────────────────────────┘   │ ( Open LG Settings )                  │
                                                └──────────────────────────────────────┘
 Arrows Move   OK Select   Back Home                                              Ready
```

- The quick rows behave exactly as today: OK starts editing, Left/Right change the value, and OK or Back finish.
- Link rows are `data-view` buttons, as Remote buttons and Appearance are today. Their summary goes through `host.setLinkValue`. Summaries use only what the hub already reads (picture mode, backlight, sound mode, Sound Out, network state). The rest show only "›".
- Left and Right between the columns keep the current geometry navigation (`verticalNeighbor` and `horizontalNeighbor`, `settings.js:270–321`) and its `data-nav-left`/`data-nav-right` pairs.
- Black level, contrast and colour temperature move into Picture. Quick Start+ moves to Power and energy. Wi-Fi and Ethernet move to Network.
- Each phase adds its link row and moves its rows, so the hub never overflows.

### 3.2 A category page

```text
 12:04 Sat 24 Oct                                                               Picture
 ┌──────────────────────────────────────────────────┐  ┌───────────────────────────────┐
 │ MODE                                             │  │ Panel brightness              │
 │ Picture mode                            Standard │  │ Backlight of the panel.       │
 │ Energy saving                               Auto │  │ Higher values are brighter.   │
 │ BRIGHTNESS                                       │  │                               │
 │▐Panel brightness     ━━━━━━━━━━━━━━━━━      100 ▌│  │ Applies to: Apps · Standard   │
 │ Contrast             ━━━━━━━━━━━━━━━━        95  │  │                               │
 │ Black level          ━━━━━━━━                50  │  │ Energy saving is Auto, so LG  │
 │ Auto dynamic contrast                        Low │  │ Settings greys this out.      │
 │ Gamma                                     High 1 │  │                               │
 │ LED local dimming                            Low │  │ ( Open in LG Settings )       │
 │ COLOUR                                         ▾ │  │                               │
 └──────────────────────────────────────────────────┘  └───────────────────────────────┘
 Arrows Move   OK Select   Back Settings                                       Reading…
```

- **List.** One scrolling list, in the same row styles as the hub, with section labels inside it, and a side card on the right.
  - The labels must be siblings of the rows in the scrolling container, because `UI.keepInView(element, margin)` scrolls `element.parentNode` (`shared/ui.js:24`).
  - Up and Down move to the previous or next shown row and skip labels, by list order rather than geometry, so the moves can be tested in Node.
- **Editing.** OK on a value row starts editing, Left/Right change the value, and OK or Back finish, as on the hub.
  - On a greyed row, OK only puts the reason in the status line.
  - On an action row, the first OK asks ("OK again resets Standard") and the second acts. Appearance's delete works the same way (`appearance.js`, `confirmingDelete`).
- **Moving.**
  - Right goes to the side card's button, and Left returns to the row it came from (the `horizontalReturn` idea in `settings.js:294–301`).
  - Back leaves editing, or returns to the hub with the focus still on this page's row (the hub keeps its `selected` across views).
  - The pointer moves the focus, and the wheel scrolls the list natively.
- **Side card.** It shows the row's help text in our own words (B's help strings are a reference), the context it applies to (from the dimension read), and why a row is greyed. "Open in LG Settings" opens LG at the matching panel.
- **What is shown.**
  - Rows the TV doesn't support are left out: no entry in D's `results`, `ui.visible` false, or no value in V.
  - Rows with `ui.active` false are greyed.
  - Values with `active` or `visible` false are skipped, as `allowedValues` already does (`settings-logic.js:8–18`).

### 3.3 Pages and sections

| Page | Sections and rows |
|---|---|
| Picture | Mode (picture mode, energy saving); Brightness (panel brightness, contrast, black level, auto dynamic contrast, gamma, LED local dimming, motion eye care); Colour (colour depth, tint, colour gamut, colour adjustment, colour temperature); Clarity (sharpness, super resolution, noise reduction, MPEG noise reduction, smooth gradation, Real Cinema, De-Judder); Options (Reduce Blue Light, FILMMAKER MODE auto start, AI Brightness) |
| Sound | Mode (sound mode, Sound Out read-only); Output (Dolby Atmos, balance, installation type, auto volume); Sync (AV sync delay, bypass); Digital (DTV audio, digital sound output, LG Sound Sync, AC-4 dialogue enhancer) |
| Network | Wi-Fi (on/off, status); Ethernet (status); This TV (name); a "Wi-Fi networks and IP settings" link |
| Power and energy | Timers (sleep timer, auto power off, no-signal auto off, auto power off after 4 hours); Energy (energy saving); Standby (Quick Start+, standby light); Screensaver (standby time, promotion) |
| General | Remote pointer (speed, size); Privacy (Live Plus, Limit AD Tracking); Time and language (time, time zone, menu language: read-only) |
| Accessibility | Display (high-contrast text, high-contrast focus); Audio (device power sound, audio description, its volume); Subtitles (first and second language, hard of hearing) |
| About this TV | Model, software version, webOS, TV name; links to Software Update and User Guide |

Energy saving appears in both Picture and Power and energy. LG also has it under General → Energy Saving and uses it in the Brightness panel's rule. If that is confusing, keep it in one place (question 3).

## 4. Architecture

### 4.1 What changes in the current code (line numbers at `c4a7849`)

- `app/settings.js`
  - `SPECS` (23–48) and `CHOICE_KEYS` (118) are data written as code. They move to a data file.
  - `load()` (122–150) builds one fixed batch: three category reads, one `getSystemSettingValues` per choice key, then two network reads. That becomes a read plan for the hub.
  - `writeSetting()` (167–203) special-cases `wifiEnabled`, `pictureMode` and the `option` category. That becomes row data (`source`, `dimension: false`).
  - `networkDetail` and `renderNetwork` (76–112) move to the logic file as pure formatters.
  - `openAdvanced()` (323–326) gains a target.
  - `preload()` (397–400) stays, for the hub's quick rows only.
- `app/settings-logic.js`
  - `READ_CATEGORIES` (34) is fixed, and `applyReadings` (46–70) reads replies by position (category reads, then choices, then network).
  - Both are replaced by plan-based functions.
  - `allowedValues` and `nextValue` stay.
- `shared/webos.js`: `readReply` (66–72) must keep partial replies. Proposal: return the Error with the parsed reply attached (`error.reply`), so callers can still use `settings` and `results`. `rootLunaBatch` (86–99) is otherwise unchanged. Its tests are in `shared/test/webos.test.js:59`.
  - `lunaSendCommand` (61–63) passes `-f`, which pretty-prints. A full Picture page reply is 40.5 KB with `-f` and 12.4 KB without. Whether to drop `-f` is a measured decision (Phase 0, check 2).
- `app/app.js`
  - `VIEWS` (60–67) gets one entry per page, for example `picture: { back: "settings", from: "settings", module: SettingsPage.create("picture") }`.
  - `viewFromParams` (469–475) then also opens pages from a launch with `{"view":"picture"}`, which Remote buttons could offer later (`remote-logic.js:63`, `HOME_VIEWS`).
  - `attach` runs for every module before the first `showView` (`app.js:586–594`).
- `app/index.html`
  - The `#settings-view` markup (143–231) is rewritten for the hub.
  - Each page gets an empty `<main id="NAME-view" class="panel-view settings-page" hidden>` shell with header and footer, as the other views have (SKILL.md, "Add a view to Minimal Home"). Its rows are built on the first `open()`.
  - Scripts `settings-specs.js` and `settings-page.js` load before `app.js`.
- `app/settings.css`: compact link rows, plus `.settings-page` styles (the scrolling list with section labels, and the side card), scoped like the existing rules.
- Tests: `test/browser/fake-tv.js`, `test/settings-logic.test.js`, `test/browser/settings.browser.js`, and `test/browser/appearance.browser.js:83–98`, which presses Down six times to reach Appearance and holds the fit test (see 4.6 and 4.7).
- Docs: the `apps/minimal-home/README.md` "Settings view" section, which also names the wrong test file (it says `test/home-logic.test.js` instead of `test/settings-logic.test.js`), and the root README's app line.

### 4.2 Spec tables (new `app/settings-specs.js`, data only)

One object per page. A row says what to read, how to show it and how to write it. Ranges and choices come from the TV's description, so the table holds only what the TV can't tell: labels, the step, the order, rules and help text.

```js
// app/settings-specs.js: the Settings pages as data. settings-page.js renders them; SettingsLogic reads
// and writes them. Labels follow LG's names in com.palm.app.settings.
var SettingsSpecs = (function () {
  "use strict";
  var LEVELS = { off: "Off", low: "Low", medium: "Medium", high: "High", auto: "Auto" };
  var PAGES = {
    picture: {
      title: "Picture", lg: { target: "picture" },
      sections: [
        { title: "Mode", rows: [
          { key: "pictureMode", category: "picture", kind: "choice", label: "Picture mode", labels: PICTURE_MODES,
            dimension: false },                        // written without one, as today
          { key: "energySaving", category: "picture", kind: "choice", label: "Energy saving", labels: ENERGY }
        ]},
        { title: "Brightness", rows: [
          { key: "backlight", category: "picture", kind: "range", label: "Panel brightness", step: 5,
            greyedWhen: { key: "energySaving", values: ["auto", "max"], reason: "Energy saving is on" } },
          { key: "dynamicContrast", category: "picture", kind: "choice", label: "Auto dynamic contrast", labels: LEVELS }
        ]}
      ]
    },
    sound: {
      title: "Sound", lg: { target: "sound" },
      sections: [{ title: "Sync", rows: [
        { id: "avSyncDelay", kind: "range", category: "sound", label: "Sound delay", step: 1,
          keyFrom: { key: "soundOutput", map: { external_optical: "avSyncSpdif", external_arc: "avSyncSpdif",
            wow_cast: "avSyncSpdif", wisa_speaker: "avSyncWisa", tv_speaker_bluetooth: "avSyncBtSurround" },
            otherwise: "avSyncSpeaker" },
          greyedWhen: { key: "avSyncBypassInput", values: ["on"], reason: "Bypass is on" } }
      ]}]
    },
    power: {
      title: "Power and energy", lg: { target: "EnergySaving" },
      sections: [{ title: "Timers", rows: [
        { id: "sleepTimer", kind: "choice", source: "sleepTimer", label: "Sleep timer",
          values: ["off", "10", "20", "30", "60", "90", "120", "180", "240"], labels: SLEEP }
      ]}]
    }
  };
  return { PAGES: PAGES, QUICK: [/* the hub's rows, same format */] };
}());
if (typeof module !== "undefined") { module.exports = SettingsSpecs; }
```

`PICTURE_MODES`, `ENERGY` and `SLEEP` are label tables like today's `SPECS` labels. The `keyFrom` map is B's hook `bre`.

Row fields:

- `key` + `category`: a settingsservice key.
- `id`: a row whose key comes from `keyFrom`, or whose data comes from a `source`.
- `kind`: one of range, choice, info, action, link.
- `labels`, `order`, `step`, `help`.
- `greyedWhen`: a rule on another key's value, with the reason to show.
- `dimension: false`: write without one (`pictureMode`).
- `with`: extra settings written in the same call, for the exclusive accessibility writes (1.5).
- `perApp`: needs `app_id` (Phase 7).
- `object`: the value is a field of an object key (Phase 7).
- `confirm`: ask before acting.
- `source`: one of `sleepTimer`, `wifi`, `network`, `systemInfo`, `lgLink`. Each is a named reader and writer in the logic file: pure functions that return `[uri, payload]` and parse replies.

### 4.3 Reads: one call per page, when it opens

- **Read plan.** `SettingsLogic.readPlan(rows)` returns a page's calls, grouped by category: one `getSystemSettings` and one `getSystemSettingDesc` (with a `keys` array) per category, plus each `source`'s read. Every `keyFrom` candidate is read too.
  - The description replaces `getSystemSettingValues`: one call per category instead of one per choice, and it also gives ranges and `ui.visible`/`active`.
  - On the TV, the description's values equalled `getSystemSettingValues`' for `pictureMode`, `energySaving`, `soundMode` and `quickStartMode` under SDR. Phase 0 check 6 repeats that under HDR.
  - Reads are made without a dimension (current context). An explicit dimension (question 2) needs keys grouped by dimension list (1.9).
- **Applying replies.** `SettingsLogic.applyReplies(rows, state, replies, plan, touched)` keeps today's guarantees: a failed read leaves its rows as they were, and a row changed during the read keeps its new value (`touched`). It adds:
  - partial replies: values from `settings` (get) and descriptions from `results` (desc). A row is unsupported when its key is missing from both. Desc's `errorKey` is ignored, because it lists every key;
  - `ui.visible` and `active`;
  - min and max from the range;
  - `keyFrom` resolution.
- **Transport.** One root call per page open: `WebOS.rootLunaBatch` with the calls above, or one `settingsservice/batch` carrying all the settingsservice reads plus the `source` reads beside it. Measured over SSH on the TV (10 rounds, twice each; wall time from `/proc/uptime`; CPU is the `luna-send` processes' user + sys from `times`, which leaves out settingsservice's own CPU and Homebrew Channel's exec hop):

  | Reads | Variant | Wall per round | luna-send CPU per round |
  |---|---|---|---|
  | Today's 7 settingsservice reads | 7 parallel `luna-send` (what `rootLunaBatch` runs) | 129 ms | 146–148 ms |
  | Today's 7 settingsservice reads | 1 `settingsservice/batch` | 48 ms | 14–16 ms |
  | Picture page (23 picture keys and `ai_Brightness`, get and desc) | 4 parallel `luna-send` | 105 ms | 92–94 ms |
  | Picture page (23 picture keys and `ai_Brightness`, get and desc) | 1 `settingsservice/batch` | 63–65 ms | 22–26 ms |

  Adopt the batch only if it also helps when measured from Home (Phase 0, check 2).
- **Nothing extra at Home's start.** Home's start reads only what the hub shows: the quick rows, Sound Out and the network state. Today that is one root call with 9 `luna-send`s (`settings.js:129–135`). With the batch it becomes 3 `luna-send`s (4 once the sleep timer is a quick row), still in one root call.
  - A page's values stay in memory, so reopening shows them at once while fresh ones are read, as Settings does today.
  - No `localStorage`: values change from LG Settings, the remote and the signal.
- **DOM.** A page builds its rows on its first `open()`, so Home's start does no extra work.
- **Back to the hub.** Returning to the hub re-reads the hub (today's `open()` → `load()`). Keep that.

### 4.4 Writes

- **Requests.** `SettingsLogic.writeRequest(row, value, context)` returns `[uri, payload]`.
  - A row passes the dimension when its description lists one and `dimension` isn't false. The dimension is read right before the write, as `settings.js:180–181` does today: one more root call per write, which reads the key and returns `dimension`.
  - LG writes with no dimension at all. Dropping the extra read would halve the root calls per write, but only measure and adopt that if a TV check shows the same context is written (question 12).
- **`pictureSettingModified`.** On the first change in a mode, LG also writes `pictureSettingModified` with that mode set to true, in the same payload (B, `PG`). Doing the same keeps LG's "(User Settings)" tag right. It costs no extra call when the page read includes `pictureSettingModified`. Recommended, but optional (question 13).
- **Combined writes.** Rows with `with` send their extra settings in the same payload, for example High Contrast together with `adjustments` off.
- **Other services.** Rows from a `source` write through that service: the sleep timer through `tvReservationAgent/timer/sleep/add {sleepTimeMinute: "<minutes>"}` ("0" for off), Wi-Fi through `connectionmanager/setstate` (as today).
- **One write at a time.** Today a press during a write is dropped (`writing`).
  - For ranges with step 1 (sharpness 0–50, sound delay 0–60), remember the last value asked for during a write, and write it when the current write ends. That keeps a held key responsive.
  - Check this on the TV (question 5).
- **Confirmation and greyed rows.** `confirm` rows use the two-OK pattern. Writes to `greyedWhen` rows are blocked with the reason, as LG blocks them.
- **Re-reading.** After a write that changes what else is offered, the page reads itself again. Today only `pictureMode` and Wi-Fi do this (`settings.js:195–196`). Rows that change the offer:
  - `pictureMode` (the values of everything);
  - `soundOutput` and `avSyncBypassInput` (the AV sync row);
  - `energySaving` (the backlight row);
  - `soundMode` (the equalizer).

### 4.5 The page module (new `app/settings-page.js`)

`SettingsPage.create(pageId)` returns `{ attach, open, close, handleKey, handlePointer }` for one page. There is no `preload`: pages read only when they are opened.

- It keeps its own `state`, `touched`, `loadRun` and `writing`, the same fields `settings.js` has (lines 13–21).
- `close()` stops editing and any pending write queue, and leaves nothing running.
- **Opening LG at a panel.** "Open in LG Settings" launches `com.palm.app.settings` with `{"target": "<panel>"}`, and optionally `"item": "<item id>"` to focus an item.
  - B handles `target` through `oV` both at launch and on `webOSRelaunch`. An unknown target falls back to Picture, and a launch with no parameters also opens Picture, which is what today's button does.
  - Targets found in B's `oV`: `picture`, `sound`, `general`, `support`, `Brightness`, `Color`, `Clarity`, `AspectRatioSettings`, `SoundOut`, `AdditionalSound`, `AvSync`, `EnergySaving`, `accessibility`, `Subtitles`, `AudioGuidance`, `RemoteSlowInput`, `System`, `HomeSettings`, `ScreenSaverSettings`, `PointerOptions`, `Timer`, `DateTime`, `Language`, `Location`, `ExternalDevice`, `MobileTVOn`, `TVInformation`, `SoftwareUpdate`, `Advertising`, `channel`, …
  - This is untested from Home. If it fails, fall back to the plain launch (`settings.js:323–326`).
- **Network link.** It launches `com.webos.app.firstuse-overlay` with `{"target":"network"}` (B), with `appReturn` left out or pointing back to Home. That is untested. The config `com.palm.app.settings.disableAppReturn` is true on this TV (C), and what it changes wasn't traced.

The hub stays its own module (`settings.js`, smaller). It takes its quick rows from `SettingsSpecs.QUICK` and reads and writes them through the same logic functions.

### 4.6 Fake TV (`test/browser/fake-tv.js`)

Today it knows three categories (30–35) and four value lists (54–57). Its `getSystemSettings` always answers `returnValue: true` with the fixed dimension `{input:"hdmi1", pictureMode:"normal"}` (67–72). `setSystemSettings` records only `[key, value]` (77–83). Batches are recognised by `& wait;` and named `settings` when they contain a settingsservice call (149–155). The Wi-Fi write isn't answered (no `connectionmanager/setstate`).

Phase 1 adds:

1. **Descriptions.** A `DESC` table per category and key, in the TV's shape: `{key, vtype, values:{arrayExt:[{value, visible, active}]} | {range:{min, max, interval}}, ui:{visible, active}, dimension:[…]}`. It covers every key in the spec tables, copied from D (the appendix has the reads). An option `desc: {"picture.localDimming": {visible:false}}` overrides entries.
2. **Values.** A larger `settings` store with every page key, typed as the TV reports them: `backlight` and `brightness` as numbers, the other ranges as text.
3. **Partial replies, as on the TV.**
   - `getSystemSettings`: unknown keys give `returnValue: false`, the known `settings`, and `errorKey` with only the unknown keys. Only unknown keys give `errorText: "no result from DB"`.
   - `getSystemSettingDesc`: an unknown key gives `returnValue: false`, `results` for the known keys, and `errorKey` with every key asked for. Only unknown keys give `"no result in DB"`.
4. **Dimensions.** A reply's `dimension` holds the fields of the dimension lists of the keys asked for, as on the TV (asking for `pictureMode` and `backlight` together gave `{input, pictureMode, dynamicRange}`). A read with an explicit `dimension` that doesn't match a key's list puts that key in `errorKey`. Defaults: picture `{input:"default", pictureMode:"normal"}`, with `{input:"default", dynamicRange:"sdr"}` for `pictureMode`; sound `{audioInput:"media", soundOutput:"tv_external_speaker", audioOutput:"default"}`. Writes are recorded as `tv.writes.push({category, settings, dimension})`, and `written` stays for the old tests.
5. **Failures.** `getSystemSettingDesc` with a `keys` array, and `fail` entries such as `getSystemSettingDesc:<category>`.
6. **Batch.** `settingsservice/batch {operations}`, if Phase 0 adopts it. It answers each operation in order inside `results`, each with its own `returnValue`. Name the call `settings` like today's batches, so `counts.settings` in the existing tests keeps working.

Later phases add:

| Phase | Fake TV addition |
|---|---|
| 2 | `audio/getSoundOutput`. Sound keys, including the four AV sync keys. |
| 3 | `tvReservationAgent/timer/sleep/getRemainTime` and `add`, keeping the remaining seconds. Time and option keys. |
| 4 | `connectionmanager/setstate`, and `deviceName` and `lmt`. |
| 5 | Option keys for accessibility, with `with` writes recorded. |
| 6 | `tv.systemproperty/getSystemInfo` and `systemservice/osInfo/query`. |
| 7 | `resetSystemSettings`, `app_id` reads, `current_app` writes, and object values (`adjustments`, `blackLevel`). |

### 4.7 Tests

**Node** (`test/settings-logic.test.js`, plus a new `test/settings-specs.test.js`):

- The read plan has one get and one desc per category of a page, plus the sources.
- Partial replies keep the known values. A key missing from both `settings` and `results` hides its row, whatever desc's `errorKey` says.
- A failed read leaves rows as they were, and `touched` rows keep their values. Port the current tests at lines 41–95.
- `greyedWhen` and `keyFrom` resolve correctly (`tv_external_speaker` → `avSyncSpeaker`, `external_arc` → `avSyncSpdif`).
- `writeRequest` includes the dimension only when the description lists one and the row allows it, and adds `with` settings and `pictureSettingModified` (only on the first change in a mode).
- `nextRow` skips labels and hidden rows, and stops at the ends.
- Every spec row has `kind`, a label, and either `key` and `category` or `id` and `source`. No key appears twice on a page, and every value the fake TV offers has a label.
- The network formatters (moved from `settings.js:76–112`).
- In `shared/test/webos.test.js`: a `returnValue: false` reply keeps its parsed body on the Error.

**Browser**, against the fake TV:

- A page opens from its hub row and reads in exactly one root call, the model of "Settings reads everything in one root call when it opens" (`settings.browser.js:45`).
- Home's start reads no page: compare call counts with and without the page.
- A key the TV lacks hides its row, and the others still show.
- A write passes the dimension read just before it.
- Back returns to the hub with the focus on the page's row.
- The focused row scrolls into view at the bottom of the list.
- A greyed row says why and writes nothing.
- A slow read doesn't undo a change, and reopening during a write keeps the write. Port `settings.browser.js:30` and `:55`.
- Every hub row fits above the footer. Update `appearance.browser.js:83`.

## 5. Phases

In every phase:

- Bump the version in `package.json` and `appinfo.json`, and update the README.
- Run `npm test` and `npm run test:browser` at the repository root.
- Deploy with `scripts/deploy.sh apps/minimal-home` and check on the TV.
- Keep a speed change only if before and after numbers show that it helps.

### Phase 0: checks, no visible change

Checks 1 and 4–6 are read-only calls through the `tv` helper (SKILL.md). Checks 2 and 3 need a temporary build of Home, deployed and then reverted. Checks 4 and 6 need the user at the TV.

1. **Partial replies in a batch. Done on 2026-10-24.** A batch with `getSystemSettings {picture: backlight, hgig}`, `getSystemSettings {option: quickStartMode}` and `getSystemSettingDesc {option: quickStartMode}` answered with an outer `returnValue: true` and `results` in order. The first result had `returnValue: false`, `settings: {backlight: 100}` and `errorKey: ["hgig"]`; the other two were complete.
2. **Cost from Home.** Not done from Home; the SSH numbers in 4.3 were measured.
   - In a temporary build, time Settings' current read (`rootLunaBatch`, 9 calls) against one `settingsservice/batch` call plus the two network calls, each with and without `-f`.
   - Measure wall time from `open()` to values shown (median of 5 opens), and CPU from `/proc/stat` deltas over 20 opens. Remove the instrumentation afterwards.
   - Adopt the batch, or dropping `-f`, only if it is faster. The SSH numbers in 4.3 suggest it will be.
3. **Reads without root.** Not done.
   - From the same build, try `WebOS.lunaCall("luna://com.webos.settingsservice/getSystemSettings", …)` without root.
   - `luna-send -a org.webosbrew.minimalhome` from the root shell works for both `getSystemSettings` and `batch`, but that runs as root and proves little.
   - If the page's own call works, measure it as in check 2, since it would skip Homebrew Channel's exec. Writes stay on root unless they are measured and checked too.
4. **Which input Home's picture rows change.** Half done.
   - With Home in front, V reports `input: "default"`. With explicit dimensions, HDMI 2 reads `pictureMode` `eco` (SDR) and `hdrStandard` (HDR), against `normal` for apps.
   - Remaining: with HDMI 2 playing, the user presses the remote's Settings button (Home opens its Settings). Then run `tv "luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings '{\"category\":\"picture\",\"keys\":[\"backlight\"]}'"` and read `dimension.input`. Repeat for sound (`soundMode`, `dimension.audioInput`).
   - Decide question 2 with the user before Phase 1's picture rows go further.
5. **Reading another input's values. Done on 2026-10-24.**
   - `getSystemSettings` with `"dimension":{"input":"hdmi2","pictureMode":"normal"}` returned HDMI 2's `backlight` and `contrast`. `pictureMode` with `{"input":"hdmi2","dynamicRange":"sdr"}` returned `eco`.
   - Input names look like `hdmi2`; `HDMI_2` failed. Keys in one call must share a dimension list (1.9).
   - Writes with an explicit dimension remain untested.
6. **HDR lists.** Not done. With an HDR source on HDMI, compare `getSystemSettingValues` and `getSystemSettingDesc` for `pictureMode`. Do the HDR modes become visible, and does `hdrDynamicToneMapping` become visible?

Done when: the remaining answers are written into this plan's open questions and the transport for Phase 1 is chosen.

### Phase 1: page engine and the Picture page

Scope:

- `settings-specs.js`, a generalised `settings-logic.js`, `settings-page.js`, and partial replies in `webos.js`.
- The Picture page with the rows in 3.3 (24).
- On the hub, black level, contrast and colour temperature move into Picture, and a Picture link row replaces them. The rest of the hub stays until its page exists.
- "Open in LG Settings" on the page, with `target: "picture"`.
- The context line in the side card ("Applies to: …"), from the dimension read.

Tests: the Node and browser tests in 4.7, fake TV items 1–5 in 4.6, and updates to the existing Settings and Appearance tests.

TV check:

- Open Picture from the hub, and from `{"view":"picture"}` (a remote button, or a relaunch).
- Ask the user to press Down to Sharpness, OK, then Right twice. The value should go up by 2 and the picture should sharpen. Check it with `getSystemSettings {category:"picture", keys:["sharpness"]}`, and set it back the same way.
- Check that every Picture row shows a value. A row that drops out means a spec key this TV lacks, which the read-only D/V batch should have caught before.
- Time the open (OK to values shown, median of 5) against the hub's current open.
- Check that "Open in LG Settings" lands on LG's Picture panel.

### Phase 2: Sound page

Scope: the Sound rows in 3.3. AV sync uses `keyFrom` and `greyedWhen`, and Sound Out is a read-only line from the `soundOutput` key with B's labels. A Sound link row joins the hub, and Sound mode stays as a quick row.

Tests:

- `keyFrom` picks `avSyncSpeaker` for `tv_external_speaker` and `avSyncSpdif` for `external_arc`.
- Bypass greys the delay.
- The sound dimension (`audioInput`) is passed on writes.

TV check:

- With today's output (optical device + TV speaker), change the sound delay and read `avSyncSpeaker` back. Ask the user whether the delay is audible, then set it back to 0.
- Check that Dolby Atmos and balance read correctly.

### Phase 3: Power and energy page

Scope:

- The Power rows in 3.3.
- The sleep timer through `tvReservationAgent`.
- Quick Start+ moves here from the hub, and the sleep timer becomes a quick row.

Tests:

- The sleep timer reads `sleepTimeSecond` and shows the minutes left (rounded up).
- Setting Off sends `sleepTimeMinute: "0"`.
- A failed agent call shows an error and leaves the row as it was.

TV check:

- Set 10 minutes and read `getRemainTime` (about 600 s). Set Off and read 0.
- Read the screensaver standby time back after a change. Ask the user whether the screensaver now starts at the new time. This matters for the screensaver that gets stuck (README, "Screensaver watchdog").

### Phase 4: Network and General pages

Scope:

- Network: Wi-Fi on/off and status, Ethernet status and TV name, moved from the hub with the existing `renderNetwork` logic, plus the LG network link. Turning Wi-Fi off asks first ("OK again turns Wi-Fi off; this TV is on Wi-Fi"), see question 14.
- General: pointer speed and size, Live Plus, Limit AD Tracking, and read-only time, time zone and language.

Tests:

- The network formatters (Node).
- Wi-Fi on/off through `connectionmanager/setstate` (browser, with the new fake method), including the confirmation before Off.
- Read-only rows don't enter editing.

TV check:

- Ask the user whether pointer speed changes the Magic Remote cursor.
- Check that the network link opens LG's network screen and that Back returns. Note where it returns to, since `appReturn` is untested.
- **Never toggle Wi-Fi during the check:** the TV is reached over Wi-Fi.

### Phase 5: Accessibility page

Scope: the Accessibility rows in 3.3, with the exclusive combined writes (`with`).

Tests:

- Rows whose configs say no stay hidden. This needs the fake description's `visible:false` for captions.
- Turning High Contrast on also writes `adjustments` off.

TV check: high-contrast text changes LG's own menus, not Home. Say so in the help text, then check with LG Settings open over Home.

### Phase 6: About this TV

Scope:

- Model, software version, webOS version and TV name, from `getSystemInfo`, `osInfo/query` and `deviceName`.
- Links to Software Update (LG target `SoftwareUpdate`) and User Guide (`com.webos.app.tvuserguide`).

Tests: formatting of the info replies; a failed read shows "—".

TV check: the values match LG's TV Information screen.

### Phase 7: rows with care, actions and per-app keys (each optional, see the questions)

Scope, one at a time:

- Always Ready, Power On Screen, SIMPLINK, Mobile TV On and Minimum Brightness, each with help text about its effect and a confirmation where LG asks.
- Grayscale and invert colours: the whole object, written as B writes it.
- Audio Guidance, and Extend Pressing Time with a check of Home's hold-to-arrange.
- TruMotion and aspect ratio per app (`app_id` of the app the user came from; writes with `current_app` or `app_id`, to be checked).
- Apply to All Inputs, and picture or sound reset, with a confirmation.
- Sound Out switching among the outputs the TV reports.
- An "Applies to" input choice, if question 2 asks for it. Reads with an explicit dimension work; writes with one need a TV check first.

Tests: a test of the rule or write shape for each item, and of the confirm pattern (the first OK asks, the second acts, and moving away cancels).

TV check: read each write back. For a reset, compare a few keys before and after, and reset only a mode the user agrees to.

## 6. Open questions

1. **Hub rows.** Should the quick rows be Picture mode, Panel brightness, Energy saving, Sound mode and Sleep timer? Or should Wi-Fi, Quick Start+ and the three picture ranges stay on the hub?
2. **Picture context.** Home's Picture rows change the apps' picture (input `default`). HDMI 2 has its own settings, and its SDR mode is now Eco while the apps' is Standard. What should happen?
   - (a) Target the last HDMI input explicitly, with an "Applies to" choice. Reads work this way; writes need a TV check.
   - (b) Keep it simple and say "Applies to apps".
   - (c) Leave input-specific tuning to LG Settings, which floats over the video and probably edits that input.
3. **Energy saving and brightness.** LG greys out Panel brightness while Energy saving is Auto or Maximum. Should Minimal Home do the same? Today it lets you change it, and the TV now has Auto with brightness 100. And should Energy saving appear in both Picture and Power?
4. **Privacy settings.** Should Live Plus, Limit AD Tracking (`lmt`, now off), the advertising cookie (`adCookie`, now on), HbbTV third-party cookies (`thirdPartyCookie`, now on) and screensaver promotion be in Home, or does "Life's Good Without Spying" in the Tools row cover them?
5. **Step size and held keys.** Keep 5 for 0–100 ranges and use 1 for small ranges? Should holding Left/Right keep changing the value (the write queue in 4.4)?
6. **Remote buttons.** Should Remote buttons offer "Open Picture settings" and the like, beside "Open Home settings"?
7. **Resets and Apply to All Inputs.** Wanted at all, with a confirmation?
8. **Sound Out.** Switch outputs from Home, or only show the current one?
9. **Accessibility.** Is the whole page useful, or only the display options?
10. **Power On and Off timers.** Wanted? They need an hour, a minute, weekdays, an app and a volume (keys in 1.4).
11. **"All of LG's settings".** Is leaving the flows in section 2 to LG Settings acceptable, or is one of them (Bluetooth pairing, Wi-Fi join, Software Update) worth building?
12. **The read before each write.** LG writes without a dimension, while Home reads the current one first, which costs one more root call per write. Test a dimension-less write on the TV (written and read back with the user's OK), and drop the extra read only if it measurably helps?
13. **LG's "(User Settings)" tag.** Should Home's picture writes set `pictureSettingModified` as LG does, so LG's mode list shows which modes were changed?
14. **Wi-Fi off.** The TV is on Wi-Fi, so Off cuts the network and SSH. Should Off ask first, or leave Minimal Home altogether?

## Appendix: read-only commands used

All run through the `tv` helper from `.claude/skills/webos-tv-app/SKILL.md`, that is `ssh -i ~/.ssh/tv_key root@TV_ADDRESS "exec </dev/null; …"`. Files went up with `ssh … 'cat > /tmp/<name>' < file`, which calls no `luna-send`, and were removed afterwards.

```sh
# Descriptions and values (the inventory used one batch: a getSystemSettingDesc and a getSystemSettings
# per category, with every key named in section 1; the request was uploaded as /tmp/claude-batch1.json)
tv 'luna-send -n 1 luna://com.webos.settingsservice/batch "$(cat /tmp/claude-batch1.json)"; rm -f /tmp/claude-batch1.json'
tv "luna-send -n 1 luna://com.webos.settingsservice/getSystemSettingDesc '{\"category\":\"picture\",\"keys\":[\"backlight\",\"hgig\"]}'"
tv "luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings '{\"category\":\"picture\",\"keys\":[\"backlight\",\"hgig\",\"contrast\"]}'"
tv "luna-send -n 1 luna://com.webos.settingsservice/getSystemSettingValues '{\"category\":\"picture\",\"key\":\"pictureMode\"}'"
# Partial failure inside a batch (Phase 0 check 1)
tv "luna-send -n 1 luna://com.webos.settingsservice/batch '{\"operations\":[{\"method\":\"getSystemSettings\",\"params\":{\"category\":\"picture\",\"keys\":[\"backlight\",\"hgig\"]}},{\"method\":\"getSystemSettings\",\"params\":{\"category\":\"option\",\"keys\":[\"quickStartMode\"]}},{\"method\":\"getSystemSettingDesc\",\"params\":{\"category\":\"option\",\"keys\":[\"quickStartMode\"]}}]}'"
# Another input's values (Phase 0 check 5)
tv "luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings '{\"category\":\"picture\",\"keys\":[\"backlight\",\"contrast\"],\"dimension\":{\"input\":\"hdmi2\",\"pictureMode\":\"normal\"}}'"
tv "luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings '{\"category\":\"picture\",\"keys\":[\"pictureMode\"],\"dimension\":{\"input\":\"hdmi2\",\"dynamicRange\":\"sdr\"}}'"
# Per-app keys, with Home's id
tv "luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings '{\"category\":\"picture\",\"keys\":[\"truMotionMode\"],\"app_id\":\"org.webosbrew.minimalhome\"}'"
tv "luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings '{\"category\":\"aspectRatio\",\"keys\":[\"arcPerApp\",\"justScan\"],\"app_id\":\"org.webosbrew.minimalhome\"}'"
# Configs LG Settings uses (the 115 names from main.js's configNames:[…], uploaded as a request file)
tv 'luna-send -n 1 luna://com.webos.service.config/getConfigs "$(cat /tmp/claude-configs.json)"; rm -f /tmp/claude-configs.json'
# Other services
tv "luna-send -n 1 luna://com.webos.applicationManager/getForegroundAppInfo '{}'"
tv "luna-send -n 1 luna://com.webos.service.tvReservationAgent/timer/sleep/getRemainTime '{}'"
tv "luna-send -n 1 luna://com.webos.service.tv.systemproperty/getSystemInfo '{\"keys\":[\"modelName\",\"firmwareVersion\",\"sdkVersion\"]}'"
tv "luna-send -n 1 luna://com.palm.systemservice/osInfo/query '{\"parameters\":[\"webos_name\",\"webos_release\"]}'"
tv "luna-send -n 1 luna://com.webos.service.audio/getSoundOutput '{}'"
tv "luna-send -n 1 luna://com.webos.service.eim/getLastInput '{}'"
tv "luna-send -n 1 luna://com.webos.service.connectionmanager/getstatus '{}'"
# LG's code and settingsservice's descriptions, copied for reading
scp -i ~/.ssh/tv_key root@TV_ADDRESS:/usr/palm/applications/com.palm.app.settings/main.js ./lg-settings-main.js
scp -i ~/.ssh/tv_key root@TV_ADDRESS:/usr/palm/applications/com.palm.app.firstuse/main.js ./lg-firstuse-main.js
scp -i ~/.ssh/tv_key root@TV_ADDRESS:/etc/palm/description.categorykeysmap.json .
scp -i ~/.ssh/tv_key root@TV_ADDRESS:/etc/palm/description.json .
```

The timing script (uploaded as `/tmp/claude-settings-timing.sh`, run as `sh … para 10` and `sh … batch 10` twice each, then removed):

```sh
# para: the reads as separate luna-sends side by side, as rootLunaBatch runs them; batch: one settingsservice/batch
t0=$(cut -d' ' -f1 /proc/uptime)
i=0; while [ $i -lt $2 ]; do $1; i=$((i+1)); done
t1=$(cut -d' ' -f1 /proc/uptime)
echo "$1 rounds=$2 start=$t0 end=$t1"
times   # second line: user and sys CPU of the luna-send child processes
```
