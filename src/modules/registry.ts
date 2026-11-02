import {
  NavbarModuleDefinition,
  NavbarModuleCategory,
  NavbarModuleContext,
} from "./types";

export type NavbarModuleProps = NavbarModuleContext;
import rawCatalog from "./modules.catalog.json";
import { PomodoroNavbarModule } from "./components/PomodoroNavbarModule";
import { TodoNavbarModule } from "./components/TodoNavbarModule";
import { EventNavbarModule } from "./components/EventNavbarModule";
import { SystemNavbarModule } from "./components/SystemNavbarModule";
import { NetNavbarModule } from "./components/NetNavbarModule";
import { WeatherNavbarModule } from "./components/WeatherNavbarModule";
import { WaterNavbarModule } from "./components/WaterNavbarModule";
import { PrayerNavbarModule } from "./components/PrayerNavbarModule";
import { QuickNoteNavbarModule } from "./components/QuickNoteNavbarModule";
import { DropZoneNavbarModule } from "./components/DropZoneNavbarModule";
import { MediaNavbarModule } from "./components/MediaNavbarModule";
import { MediaControlNavbarModule } from "./components/MediaControlNavbarModule";
import { ClipboardNavbarModule } from "./components/ClipboardNavbarModule";
import { FocusNavbarModule } from "./components/FocusNavbarModule";
import {
  MixerNavbarModule,
  AudioOutputNavbarModule,
} from "./components/MixerNavbarModule";
import { JamDuniaNavbarModule } from "./components/JamDuniaNavbarModule";
import { KutipanHarianNavbarModule } from "./components/KutipanHarianNavbarModule";
import { ProgresHariNavbarModule } from "./components/ProgresHariNavbarModule";
import { IstirahatMataNavbarModule } from "./components/IstirahatMataNavbarModule";
import { StreakNavbarModule } from "./components/StreakNavbarModule";
import { CountdownNavbarModule } from "./components/CountdownNavbarModule";
import {
  BatteryPowerNavbarModule,
  VirtualDesktopNavbarModule,
  GpuTempNavbarModule,
  StorageNavbarModule,
  PrivacyCamMicNavbarModule,
  DeviceBatteryNavbarModule,
  HotspotVpnNavbarModule,
} from "./components/SystemExtraModules";
import {
  MiniCalendarNavbarModule,
  ScreenshotNavbarModule,
  QuickLauncherNavbarModule,
  CalculatorNavbarModule,
  ScreenTimeNavbarModule,
  ClassScheduleNavbarModule,
  TextSnippetNavbarModule,
} from "./components/ProductivityExtraModules";
import {
  VisualizerNavbarModule,
  AmbientSoundNavbarModule,
  AirQualityNavbarModule,
  MoodCheckinNavbarModule,
} from "./components/MediaLifestyleExtraModules";
import { MODULE_ID_ALIASES } from "./components/NavbarModuleUnifiedPreview";

interface RawCatalogItem {
  index: number;
  id: string;
  name: string;
  description: string;
  category: "Produktif" | "Sistem" | "Media & estetika" | "Gaya hidup";
  categoryColor: string;
}

// Active dynamic components mapping for all 40 catalog modules + aliases
const COMPONENT_MAP: Record<string, any> = {
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

export const NAVBAR_MODULE_CATALOG: NavbarModuleDefinition[] = (
  rawCatalog as RawCatalogItem[]
).map((item) => {
  let group: 1 | 2 | 3 = 2;
  if (item.category === "Sistem") {
    group = 3;
  }

  const comp =
    COMPONENT_MAP[item.id] || COMPONENT_MAP[MODULE_ID_ALIASES[item.id]];

  return {
    id: item.id,
    name: item.name,
    category: item.category as NavbarModuleCategory,
    desc: item.description,
    group,
    defaultView: "compact",
    chipLabel: item.name,
    chipSub: item.category,
    accentColor: item.categoryColor,
    component: comp,
  };
});

export const getNavbarModuleById = (
  id: string
): NavbarModuleDefinition | undefined => {
  const canonicalId = MODULE_ID_ALIASES[id] || id;
  return (
    NAVBAR_MODULE_CATALOG.find((m) => m.id === canonicalId || m.id === id) ||
    NAVBAR_MODULE_CATALOG.find((m) => m.id.toLowerCase() === id.toLowerCase())
  );
};
