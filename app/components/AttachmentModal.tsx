import { useEffect, useRef, useState } from "react";
import { useBoard } from "~/context/BoardContext";
import { CloseIcon, ImageIcon } from "~/images/icons";

interface AttachmentModalProps {
  onClose: () => void;
}

type AttachmentMode = "link" | "image";

const MAX_IMAGE_SIZE = 250_000; // 250KB

/**
 * Compress an image file to fit within maxBytes by reducing quality and
 * dimensions. Returns a base64 data URL.
 */
async function compressImage(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let quality = 0.8;
        let scale = 1;

        const tryCompress = (): string => {
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Could not get canvas context");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", quality);
        };

        // Iteratively reduce quality and size
        let result = tryCompress();
        let attempts = 0;
        while (result.length > maxBytes && attempts < 20) {
          if (quality > 0.1) {
            quality -= 0.1;
          } else {
            scale *= 0.7;
          }
          result = tryCompress();
          attempts++;
        }

        if (result.length > maxBytes) {
          reject(new Error("Could not compress image to fit within size limit"));
        } else {
          resolve(result);
        }
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function AttachmentModal({ onClose }: AttachmentModalProps) {
  const { addLinkAttachment, addImageAttachment, attachments } = useBoard();
  const [mode, setMode] = useState<AttachmentMode>("link");
  const [filename, setFilename] = useState("");
  const [link, setLink] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const filenameRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageCount = attachments.filter((a) => a.type === "image").length;

  // Focus filename on open
  useEffect(() => {
    filenameRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Paste image from clipboard while image tab is active
  useEffect(() => {
    if (mode !== "image") return;
    function handleDocPaste(e: ClipboardEvent) {
      const imageItem = Array.from(e.clipboardData?.items ?? []).find(
        (item) => item.type.startsWith("image/")
      );
      if (!imageItem) return;
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) processImageFile(file, "pasted-image");
    }
    document.addEventListener("paste", handleDocPaste);
    return () => document.removeEventListener("paste", handleDocPaste);
  }, [mode, imageCount, filename]);

  async function processImageFile(file: File, defaultName?: string) {
    if (!file.type.startsWith("image/")) {
      setError("Only image files are supported for upload");
      return;
    }

    if (imageCount >= 5) {
      setError("Maximum of 5 uploaded images per board");
      return;
    }

    setError(null);
    setCompressing(true);

    try {
      const compressed = await compressImage(file, MAX_IMAGE_SIZE);
      setImageData(compressed);
      setImagePreview(compressed);
      if (!filename && defaultName) {
        setFilename(defaultName);
      }
    } catch {
      setError("Could not compress image to fit within size limit. Try a smaller image.");
    } finally {
      setCompressing(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await processImageFile(file, file.name);
  }


  function handleSave() {
    const trimmedFilename = filename.trim();
    if (!trimmedFilename) {
      setError("Filename is required");
      return;
    }

    if (mode === "link") {
      const trimmedLink = link.trim();
      if (!trimmedLink) {
        setError("Link is required");
        return;
      }
      addLinkAttachment(trimmedFilename, trimmedLink);
    } else {
      if (!imageData) {
        setError("Please select an image to upload");
        return;
      }
      addImageAttachment(trimmedFilename, imageData);
    }

    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        ref={modalRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Add Attachment</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <CloseIcon size="md" />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setMode("link"); setError(null); }}
            className={`px-3 py-1.5 text-sm rounded cursor-pointer transition-colors ${
              mode === "link"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            Link
          </button>
          <button
            type="button"
            onClick={() => { setMode("image"); setError(null); }}
            className={`px-3 py-1.5 text-sm rounded cursor-pointer transition-colors ${
              mode === "image"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            }`}
          >
            Image Upload
          </button>
        </div>

        <div className="space-y-4" onKeyDown={handleKeyDown}>
          {/* Filename — hidden when image tab is at limit */}
          {!(mode === "image" && imageCount >= 5) && (
            <div>
              <label htmlFor="attachment-filename" className="block text-sm font-medium mb-1">
                Filename
              </label>
              <input
                ref={filenameRef}
                id="attachment-filename"
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="e.g. sprint-review.pdf"
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700"
              />
            </div>
          )}

          {mode === "link" ? (
            /* Link input */
            <div>
              <label htmlFor="attachment-link" className="block text-sm font-medium mb-1">
                Link
              </label>
              <input
                id="attachment-link"
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://..."
                className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-700"
              />
            </div>
          ) : imageCount >= 5 ? (
            /* Image limit reached */
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
              <p className="text-sm mb-1">
                You've used <strong>5/5</strong> image uploads.
              </p>
              <p className="text-xs">
                Delete an existing image to upload a new one, or attach it as a link instead.
              </p>
            </div>
          ) : (
            /* Image upload */
            <div>
              <label className="block text-sm font-medium mb-1">
                Image ({imageCount}/5 used)
              </label>
              <div
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="max-h-32 mx-auto rounded"
                  />
                ) : compressing ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Compressing...</p>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400">
                    <ImageIcon size="xl" />
                    <p className="text-sm">Click to select or paste an image</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-6">
          {!(mode === "image" && imageCount >= 5) && (
            <button
              type="button"
              onClick={handleSave}
              disabled={compressing}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              Save
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
          >
            {mode === "image" && imageCount >= 5 ? "Close" : "Abort"}
          </button>
        </div>
      </div>
    </div>
  );
}
