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
export async function saveFile(
  file: File,
  uploadDir: string = "./uploads",
): Promise<{ fileName: string; filePath: string; fileSize: number; mimeType: string }> {
  // Ensure upload directory exists
  try {
    await Bun.file(`${uploadDir}/.keep`).exists();
  } catch {
    await Bun.write(`${uploadDir}/.keep`, "");
  }

  // Generate unique filename: timestamp-randomhash-originalname
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const fileName = `${timestamp}-${random}-${baseName}.${ext}`;
  const filePath = `${uploadDir}/${fileName}`;

  // Save file
  const bytes = await file.arrayBuffer();
  await Bun.write(filePath, new Uint8Array(bytes));

  return {
    fileName,
    filePath,
    fileSize: file.size,
    mimeType: file.type,
  };
}
