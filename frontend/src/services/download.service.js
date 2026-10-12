import { apiDownload } from "./api.js";
import { saveBlob } from "../utils/download.js";

// Fetches a file from the API (with the normal auth and refresh handling)
// and saves it in the browser.
//
// `fallbackFilename` is used when the response's Content-Disposition
// header is not readable. Browsers hide that header from cross-origin
// pages unless the API lists it in Access-Control-Expose-Headers.
export async function downloadFile(endpoint, fallbackFilename) {
  const { blob, filename } = await apiDownload(endpoint);
  const name = filename || fallbackFilename;

  saveBlob(blob, name);

  return name;
}
