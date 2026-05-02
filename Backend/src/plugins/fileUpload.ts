import { Elysia } from "elysia";

/**
 * File upload plugin.
 * Provides helper utilities for handling file uploads.
 *
 * In routes, use t.Files() in body validation for multipart requests:
 *   .post('/upload', ({ body }) => { ... }, {
 *     body: t.Object({ files: t.Files(), ticket_id: t.Numeric() })
 *   })
 *
 * Elysia automatically parses FormData when t.Files() is detected.
 */
export const fileUpload = new Elysia({ name: "fileUpload" });

/**
 * Helper: save uploaded file to disk
 * Returns the saved file metadata
 */
// saveFile - avoid the ArrayBuffer copy
export async function saveFile(
  file: File,
  uploadDir: string = "./uploads",
): Promise<{ fileName: string; filePath: string; fileSize: number; mimeType: string }> {
  await Bun.write(`${uploadDir}/.keep`, ""); // mkdir -p equivalent in Bun

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}-${baseName}.${ext}`;
  const filePath = `${uploadDir}/${fileName}`;

  await Bun.write(filePath, file); // ? no ArrayBuffer copy

  return { fileName, filePath, fileSize: file.size, mimeType: file.type };
}
