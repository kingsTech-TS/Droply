import { describe, expect, it } from "vitest";
import { directDownloadUrl } from "@/config/env";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz_0123-";
const DIRECT = `https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`;

describe("directDownloadUrl", () => {
  it("turns Google Drive share links into direct downloads", () => {
    expect(directDownloadUrl(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toBe(DIRECT);
    expect(directDownloadUrl(`https://drive.google.com/file/d/${ID}/view?usp=drive_link`)).toBe(DIRECT);
    expect(directDownloadUrl(`https://drive.google.com/open?id=${ID}`)).toBe(DIRECT);
    expect(directDownloadUrl(`https://drive.google.com/uc?export=download&id=${ID}`)).toBe(DIRECT);
  });

  it("leaves other links alone", () => {
    const github = "https://github.com/me/droply/releases/download/v1.0.0/Droply.apk";
    expect(directDownloadUrl(github)).toBe(github);
    expect(directDownloadUrl("/app/Droply.apk")).toBe("/app/Droply.apk");
    expect(directDownloadUrl("https://drive.google.com/drive/folders/abc")).toBe("https://drive.google.com/drive/folders/abc");
  });
});
