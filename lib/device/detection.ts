// Best-effort device identification for the UI only. Never used for security: the
// server issues device identity, and users can edit everything detected here.
import type { DeviceType } from "@/types/device";

export interface DetectedDevice {
  type: DeviceType;
  browser: string;
  os: string;
}

export interface DetectionInput {
  userAgent: string;
  maxTouchPoints: number;
  screenShortSide: number;
  uaDataMobile?: boolean;
  uaDataPlatform?: string;
  uaDataBrands?: readonly { brand: string }[];
}

function detectOs(ua: string, platform: string | undefined, touch: number): string {
  const p = platform?.toLowerCase() ?? "";
  if (/iphone|ipod/i.test(ua)) return "iOS";
  if (/ipad/i.test(ua) || (/macintosh/i.test(ua) && touch > 1)) return "iPadOS";
  if (p === "android" || /android/i.test(ua)) return "Android";
  if (p === "chrome os" || /cros/i.test(ua)) return "ChromeOS";
  if (p === "windows" || /windows/i.test(ua)) return "Windows";
  if (p === "macos" || /macintosh|mac os x/i.test(ua)) return "macOS";
  if (p === "linux" || /linux/i.test(ua)) return "Linux";
  return "Unknown OS";
}

function detectBrowser(ua: string, brands: readonly { brand: string }[] | undefined): string {
  const names = brands?.map((b) => b.brand) ?? [];
  if (names.includes("Microsoft Edge")) return "Edge";
  if (names.includes("Opera")) return "Opera";
  if (names.includes("Brave")) return "Brave";
  if (/edg(e|a|ios)?\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/crios/i.test(ua)) return "Chrome";
  if (/chrome|chromium/i.test(ua) || names.includes("Google Chrome")) return "Chrome";
  if (/safari/i.test(ua)) return "Safari";
  return "Browser";
}

export function detectFrom(input: DetectionInput): DetectedDevice {
  const { userAgent: ua, maxTouchPoints: touch } = input;
  const os = detectOs(ua, input.uaDataPlatform, touch);
  const browser = detectBrowser(ua, input.uaDataBrands);

  let type: DeviceType;
  if (os === "iOS") type = "phone";
  else if (os === "iPadOS") type = "tablet";
  else if (os === "Android") {
    // Android tablets usually omit "Mobile" from the UA; a small screen means a phone anyway.
    const mobile = input.uaDataMobile ?? /mobile/i.test(ua);
    const smallScreen = input.screenShortSide > 0 && input.screenShortSide < 600;
    type = mobile || smallScreen ? "phone" : "tablet";
  } else if (os === "macOS" || os === "ChromeOS") type = "laptop";
  else if (os === "Windows" || os === "Linux") type = "desktop";
  else type = "unknown";

  return { type, browser, os };
}

interface NavigatorUAData {
  mobile?: boolean;
  platform?: string;
  brands?: { brand: string }[];
}

interface BatteryManagerLike {
  charging: boolean;
  level: number;
}

export function detectDevice(): DetectedDevice {
  if (typeof navigator === "undefined") return { type: "unknown", browser: "Browser", os: "Unknown OS" };
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  const screenShortSide =
    typeof screen === "undefined" ? 0 : Math.min(screen.width || 0, screen.height || 0);
  return detectFrom({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    screenShortSide,
    uaDataMobile: uaData?.mobile,
    uaDataPlatform: uaData?.platform,
    uaDataBrands: uaData?.brands,
  });
}

/**
 * Windows and Linux machines can't be told apart reliably. A battery that is not
 * "charging at 100%" (what desktops report) suggests a laptop. Chromium only.
 */
export async function refineDesktopOrLaptop(device: DetectedDevice): Promise<DetectedDevice> {
  if (device.type !== "desktop") return device;
  const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> })
    .getBattery;
  if (typeof getBattery !== "function") return device;
  try {
    const battery = await getBattery.call(navigator);
    const looksLikeDesktop = battery.charging && battery.level === 1;
    return looksLikeDesktop ? device : { ...device, type: "laptop" };
  } catch {
    return device;
  }
}
