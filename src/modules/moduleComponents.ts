import { lazy, type ComponentType } from "react";

const lazyMod = <T extends Record<string, any>>(
  loader: () => Promise<T>,
  key: keyof T
) => lazy(() => loader().then((m) => ({ default: m[key] as ComponentType<any> })));

const PomodoroNavbarModule = lazyMod(() => import("./components/PomodoroNavbarModule"), "PomodoroNavbarModule");
const TodoNavbarModule = lazyMod(() => import("./components/TodoNavbarModule"), "TodoNavbarModule");
const EventNavbarModule = lazyMod(() => import("./components/EventNavbarModule"), "EventNavbarModule");
const SystemNavbarModule = lazyMod(() => import("./components/SystemNavbarModule"), "SystemNavbarModule");
const NetNavbarModule = lazyMod(() => import("./components/NetNavbarModule"), "NetNavbarModule");
const WeatherNavbarModule = lazyMod(() => import("./components/WeatherNavbarModule"), "WeatherNavbarModule");
const WaterNavbarModule = lazyMod(() => import("./components/WaterNavbarModule"), "WaterNavbarModule");
const PrayerNavbarModule = lazyMod(() => import("./components/PrayerNavbarModule"), "PrayerNavbarModule");
const QuickNoteNavbarModule = lazyMod(() => import("./components/QuickNoteNavbarModule"), "QuickNoteNavbarModule");
const DropZoneNavbarModule = lazyMod(() => import("./components/DropZoneNavbarModule"), "DropZoneNavbarModule");
const MediaNavbarModule = lazyMod(() => import("./components/MediaNavbarModule"), "MediaNavbarModule");
const MediaControlNavbarModule = lazyMod(() => import("./components/MediaControlNavbarModule"), "MediaControlNavbarModule");
const ClipboardNavbarModule = lazyMod(() => import("./components/ClipboardNavbarModule"), "ClipboardNavbarModule");
const FocusNavbarModule = lazyMod(() => import("./components/FocusNavbarModule"), "FocusNavbarModule");

const loadMixerModules = () => import("./components/MixerNavbarModule");
const MixerNavbarModule = lazyMod(loadMixerModules, "MixerNavbarModule");
const AudioOutputNavbarModule = lazyMod(loadMixerModules, "AudioOutputNavbarModule");

const JamDuniaNavbarModule = lazyMod(() => import("./components/JamDuniaNavbarModule"), "JamDuniaNavbarModule");
const KutipanHarianNavbarModule = lazyMod(() => import("./components/KutipanHarianNavbarModule"), "KutipanHarianNavbarModule");
const ProgresHariNavbarModule = lazyMod(() => import("./components/ProgresHariNavbarModule"), "ProgresHariNavbarModule");
const IstirahatMataNavbarModule = lazyMod(() => import("./components/IstirahatMataNavbarModule"), "IstirahatMataNavbarModule");
const StreakNavbarModule = lazyMod(() => import("./components/StreakNavbarModule"), "StreakNavbarModule");
const CountdownNavbarModule = lazyMod(() => import("./components/CountdownNavbarModule"), "CountdownNavbarModule");

const loadSystemExtraModules = () => import("./components/SystemExtraModules");
const BatteryPowerNavbarModule = lazyMod(loadSystemExtraModules, "BatteryPowerNavbarModule");
const VirtualDesktopNavbarModule = lazyMod(loadSystemExtraModules, "VirtualDesktopNavbarModule");
const GpuTempNavbarModule = lazyMod(loadSystemExtraModules, "GpuTempNavbarModule");
const StorageNavbarModule = lazyMod(loadSystemExtraModules, "StorageNavbarModule");
const PrivacyCamMicNavbarModule = lazyMod(loadSystemExtraModules, "PrivacyCamMicNavbarModule");
const DeviceBatteryNavbarModule = lazyMod(loadSystemExtraModules, "DeviceBatteryNavbarModule");
const HotspotVpnNavbarModule = lazyMod(loadSystemExtraModules, "HotspotVpnNavbarModule");

const loadProductivityExtraModules = () => import("./components/ProductivityExtraModules");
const MiniCalendarNavbarModule = lazyMod(loadProductivityExtraModules, "MiniCalendarNavbarModule");
const ScreenshotNavbarModule = lazyMod(loadProductivityExtraModules, "ScreenshotNavbarModule");
const QuickLauncherNavbarModule = lazyMod(loadProductivityExtraModules, "QuickLauncherNavbarModule");
const CalculatorNavbarModule = lazyMod(loadProductivityExtraModules, "CalculatorNavbarModule");
const ScreenTimeNavbarModule = lazyMod(loadProductivityExtraModules, "ScreenTimeNavbarModule");
const ClassScheduleNavbarModule = lazyMod(loadProductivityExtraModules, "ClassScheduleNavbarModule");
const TextSnippetNavbarModule = lazyMod(loadProductivityExtraModules, "TextSnippetNavbarModule");

const loadMediaLifestyleExtraModules = () => import("./components/MediaLifestyleExtraModules");
const VisualizerNavbarModule = lazyMod(loadMediaLifestyleExtraModules, "VisualizerNavbarModule");
const AmbientSoundNavbarModule = lazyMod(loadMediaLifestyleExtraModules, "AmbientSoundNavbarModule");
const AirQualityNavbarModule = lazyMod(loadMediaLifestyleExtraModules, "AirQualityNavbarModule");
const MoodCheckinNavbarModule = lazyMod(loadMediaLifestyleExtraModules, "MoodCheckinNavbarModule");

// Alias map for legacy IDs to match canonical catalog IDs
export const MODULE_ID_ALIASES: Record<string, string> = {
  event: "acara_berikutnya",
  todo: "to_do_fokus",
  pomodoro: "pomodoro",
  quicknote: "catat_cepat",
  note: "catat_cepat",
  system: "pantau_sistem",
  net: "jaringan",
  weather: "cuaca",
  clock: "jam_dunia",
  battery: "baterai_daya",
  audiodevice: "output_audio",
  audio_output: "output_audio",
  virtual_desktop: "desktop_virtual",
  water: "water_tracker",
  prayer: "waktu_sholat",
  shelf: "drop_zone_mini",
  media: "sedang_diputar",
  media_control: "kontrol_media",
  focus: "mode_fokus",
  mixer: "mixer_suara",
  streak: "streak_kebiasaan",
  quote: "kutipan_harian",
  countdown: "hitung_mundur",
  day_progress: "progres_hari",
  eye_rest: "istirahat_mata",
  startSearch: "start_search",
  pinnedApps: "pinned_apps",
  runningApps: "running_apps",
  systemIcons: "output_audio",
  notifications: "notifications",
  clockDate: "jam_dunia",
};

export const COMPONENT_MAP: Record<string, ComponentType<any>> = {
  // 1..6 Produktif
  acara_berikutnya: EventNavbarModule,
  event: EventNavbarModule,
  to_do_fokus: TodoNavbarModule,
  todo: TodoNavbarModule,
  pomodoro: PomodoroNavbarModule,
  catat_cepat: QuickNoteNavbarModule,
  quicknote: QuickNoteNavbarModule,
  clipboard: ClipboardNavbarModule,
  water_tracker: WaterNavbarModule,
  water: WaterNavbarModule,

  // 7..12 Sistem
  pantau_sistem: SystemNavbarModule,
  system: SystemNavbarModule,
  jaringan: NetNavbarModule,
  net: NetNavbarModule,
  baterai_daya: BatteryPowerNavbarModule,
  battery: BatteryPowerNavbarModule,
  output_audio: AudioOutputNavbarModule,
  audiodevice: AudioOutputNavbarModule,
  audio_output: AudioOutputNavbarModule,
  desktop_virtual: VirtualDesktopNavbarModule,
  virtual_desktop: VirtualDesktopNavbarModule,
  mode_fokus: FocusNavbarModule,
  focus: FocusNavbarModule,

  // 13..16 Media & estetika
  sedang_diputar: MediaNavbarModule,
  media: MediaNavbarModule,
  cuaca: WeatherNavbarModule,
  weather: WeatherNavbarModule,
  jam_dunia: JamDuniaNavbarModule,
  clock: JamDuniaNavbarModule,
  visualizer: VisualizerNavbarModule,

  // 17..20 Produktif
  kalender_mini: MiniCalendarNavbarModule,
  streak_kebiasaan: StreakNavbarModule,
  streak: StreakNavbarModule,
  tangkap_layar: ScreenshotNavbarModule,
  peluncur_cepat: QuickLauncherNavbarModule,

  // 21..22 Sistem
  gpu_suhu: GpuTempNavbarModule,
  suhu_gpu: GpuTempNavbarModule,
  penyimpanan: StorageNavbarModule,

  // 23..24 Media & estetika
  kontrol_media: MediaControlNavbarModule,
  media_control: MediaControlNavbarModule,
  kutipan_harian: KutipanHarianNavbarModule,
  quote: KutipanHarianNavbarModule,

  // 25..28 Sistem
  privasi_kamera_mic: PrivacyCamMicNavbarModule,
  privasi_kamera_mik: PrivacyCamMicNavbarModule,
  mixer_suara: MixerNavbarModule,
  mixer: MixerNavbarModule,
  baterai_perangkat: DeviceBatteryNavbarModule,
  hotspot_vpn: HotspotVpnNavbarModule,

  // 29..34 Produktif
  hitung_mundur: CountdownNavbarModule,
  countdown: CountdownNavbarModule,
  kalkulator_konverter: CalculatorNavbarModule,
  waktu_layar: ScreenTimeNavbarModule,
  jadwal_kelas: ClassScheduleNavbarModule,
  text_snippet: TextSnippetNavbarModule,
  drop_zone_mini: DropZoneNavbarModule,
  drop_zone: DropZoneNavbarModule,
  shelf: DropZoneNavbarModule,

  // 35..36 Media & estetika
  suara_ambient: AmbientSoundNavbarModule,
  progres_hari: ProgresHariNavbarModule,
  day_progress: ProgresHariNavbarModule,

  // 37..40 Gaya hidup
  waktu_sholat: PrayerNavbarModule,
  prayer: PrayerNavbarModule,
  kualitas_udara: AirQualityNavbarModule,
  check_in_mood: MoodCheckinNavbarModule,
  istirahat_mata: IstirahatMataNavbarModule,
  eye_rest: IstirahatMataNavbarModule,
};

export const getNavbarModuleComponent = (id: string): ComponentType<any> | undefined => {
  const canonicalId = MODULE_ID_ALIASES[id] || id;
  return (
    COMPONENT_MAP[canonicalId] ||
    COMPONENT_MAP[id] ||
    COMPONENT_MAP[id.toLowerCase()]
  );
};
