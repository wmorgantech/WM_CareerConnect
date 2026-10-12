// Saves a Blob as a file download in the browser.
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoke after the click has been processed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
