import { createOgImage, ogContentType, ogSize } from "../_components/createOgImage";

export const alt = "KPI·FIT Tonal Coach FAQ — Common Questions";
export const size = ogSize;
export const contentType = ogContentType;

export default async function OgImage() {
  return createOgImage("FAQ", "Common Questions About KPI·FIT Tonal Coach");
}
