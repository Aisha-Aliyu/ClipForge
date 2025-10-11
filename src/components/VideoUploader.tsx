"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/lib/supabaseClient";
import { createFFmpeg, fetchFile, FFmpeg } from "@ffmpeg/ffmpeg";
import { User } from "@supabase/supabase-js";

type UploadState = "idle" | "uploading" | "done" | "error";

type FFmpegOptions = Parameters<typeof createFFmpeg>[0] & {
  locateFile?: (file: string) => string;
};

let ffmpegInstance: FFmpeg | null = null;

export async function getFFmpeg() {
  if (!ffmpegInstance) {
    const options: FFmpegOptions = {
      log: true,
      corePath: 'http://172.20.10.2:3000/ffmpeg/ffmpeg-core.js',
      locateFile: (file: string) => `http://172.20.10.2:3000/ffmpeg/${file}`,
    };

    ffmpegInstance = createFFmpeg(options);
    await ffmpegInstance.load();
  }
  return ffmpegInstance;
}

export default function VideoUploader() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [duration, setDuration] = useState<number>(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [ffmpegReady, setFfmpegReady] = useState(false);
  useEffect(() => {
    (async () => {
      await getFFmpeg();
      setFfmpegReady(true);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      alert("Please upload a valid video file.");
      return;
    }
    setVideoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setProgress(0);
    setUploadState("idle");
    setErrorMsg(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "video/*": [] },
  });

  const removeVideo = () => {
    setVideoFile(null);
    setPreviewUrl(null);
    setProgress(0);
    setUploadState("idle");
    setErrorMsg(null);
    setDuration(0);
    setStartTime(0);
    setEndTime(0);
  };

  const onLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    setDuration(el.duration);
    setStartTime(0);
    setEndTime(el.duration);
  };

  async function getPresignedUrl(key: string, contentType: string) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch("/api/s3-presign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ path: key, contentType }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? "Failed to get presigned URL");
    }
    return res.json();
  }

  async function confirmUpload(payload: {
    key: string;
    filename: string;
    contentType: string;
    size: number;
    publicUrl?: string | null;
  }) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch("/api/confirm-upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? "Failed to confirm upload");
    }
    return res.json();
  }

  async function uploadBlobWithProgress(url: string, blob: Blob, onProgress: (p: number) => void) {
    return new Promise<void>((resolve, reject) => {const xhr = new XMLHttpRequest();
      xhr.open("PUT", url, true);
      xhr.setRequestHeader("Content-Type", blob.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress((e.loaded / e.total) * 100);
        }
      };
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };
      xhr.onerror = function () {
        reject(new Error("Network error during upload"));
      };
      xhr.send(blob);
    });
  }

  async function trimVideoToBlob(file: File, start: number, end: number) {
    if (!ffmpegReady) throw new Error("FFmpeg not ready");
    const ffmpeg = await getFFmpeg();
    const inputName = `input_${Date.now()}.mp4`;
    const outputName = `out_${Date.now()}.mp4`;

    ffmpeg.FS("writeFile", inputName, await fetchFile(file));
    await ffmpeg.run("-ss", `${start}`, "-i", inputName, "-to", `${end}`, "-c", "copy", outputName);
    const data = ffmpeg.FS("readFile", outputName);
    const blob = new Blob([new Uint8Array(data)], { type: "video/mp4" });
    try {
      ffmpeg.FS("unlink", inputName);
      ffmpeg.FS("unlink", outputName);
    } catch {}

    return blob;
  }

  async function handleUpload(useTrim: boolean) {
    if (!videoFile) return setErrorMsg("No file selected");
    if (!user) return setErrorMsg("You must be signed in to upload");
    setErrorMsg(null);
    setUploadState("uploading");
    setProgress(0);

    try {
      let blobToUpload: Blob = videoFile;
      let filename = videoFile.name;

      if (useTrim) {
        if (startTime >= endTime || endTime <= startTime) {
          throw new Error("Invalid trim range");
        }
        const trimmed = await trimVideoToBlob(videoFile, startTime, endTime);
        blobToUpload = trimmed;
        filename = `${videoFile.name.replace(/\.[^/.]+$/, "")}_trimmed_${Math.floor(startTime)}-${Math.floor(endTime)}.mp4`;
      }

      const timestamp = Date.now();
      const sanitized = filename.replace(/\s+/g, "_");
      const key = `uploads/${user.id}/${timestamp}_${sanitized}`;

      const presign = await getPresignedUrl(key, blobToUpload.type ?? "video/mp4");
      const { url: signedUrl } = presign;

      await uploadBlobWithProgress(signedUrl, blobToUpload, (p) => setProgress(p));

      const publicUrl = null;
      await confirmUpload({
        key,
        filename,
        contentType: blobToUpload.type ?? "video/mp4",
        size: blobToUpload.size,
        publicUrl,
      });

      setUploadState("done");
      setProgress(100);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("upload error:", message);
      setErrorMsg(message);
      setUploadState("error");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-4xl mx-auto p-6 bg-white dark:bg-neutral-900 rounded-lg shadow-md">
      {/* Dropzone */}
      {!videoFile && (
        <div
          {...getRootProps()}
          className={`w-full h-56 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition ${isDragActive ? "border-indigo-500 bg-indigo-50 dark:bg-neutral-800" : "border-gray-400 dark:border-neutral-600"
            }`}
        >
          <input {...getInputProps()} />
          <p className="text-gray-600 dark:text-gray-300">
            {isDragActive ? "Drop the video here..." : "Drag & drop a video, or click to select"}
          </p>
          <p className="text-xs text-gray-400 mt-2">Sign in to upload. Trimming requires the browser to load ffmpeg (~25–50MB).</p>
        </div>
      )}

      {/* Preview & controls */}
      {previewUrl && (
        <div className="mt-6 w-full">
          <video ref={videoRef} src={previewUrl} controls onLoadedMetadata={onLoadedMetadata} className="w-full rounded-lg shadow-lg max-h-[480px]" />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-start"><div className="md:col-span-2">
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{videoFile?.name}</p>
              <p className="text-xs text-gray-400">{videoFile?.size ? `${Math.round(videoFile.size / 1024 / 1024)} MB` : ""}</p>

              {/* trimming UI */}
              <div className="mt-3">
                <label className="text-xs text-gray-500">Start: {startTime.toFixed(2)}s</label>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={startTime}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setStartTime(v);
                    if (v >= endTime) setEndTime(Math.min(duration, v + 0.5));
                  }}
                  className="w-full"
                />
                <label className="text-xs text-gray-500">End: {endTime.toFixed(2)}s</label>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={endTime}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setEndTime(v);
                    if (v <= startTime) setStartTime(Math.max(0, v - 0.5));
                  }}
                  className="w-full"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => {
                      const el = videoRef.current;
                      if (!el) return;
                      el.currentTime = startTime;
                      el.play();
                      const checker = setInterval(() => {
                        if (el.currentTime >= endTime) {
                          el.pause();
                          clearInterval(checker);
                        }
                      }, 100);
                    }}
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm"
                  >
                    Preview Trim
                  </button>

                  <button
                    onClick={() => handleUpload(true)}
                    disabled={!ffmpegReady || !user || uploadState === "uploading"}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm disabled:opacity-50"
                  >
                    Trim & Upload
                  </button>

                  <button
                    onClick={() => handleUpload(false)}
                    disabled={!user || uploadState === "uploading"}
                    className="px-3 py-1 bg-indigo-500 hover:bg-indigo-600 text-white rounded text-sm disabled:opacity-50"
                  >
                    Upload Original
                  </button>
                </div>
              </div>
            </div>

            <div className="md:col-span-1">
              <div className="w-full p-3 bg-gray-50 dark:bg-neutral-800 rounded">
                <p className="text-xs text-gray-500">User:</p>
                <p className="text-sm">{user?.email ?? "Not signed in"}</p>

                <div className="mt-3">
                  <p className="text-xs text-gray-500">Upload</p>
                  <div className="h-2 bg-gray-200 rounded overflow-hidden">
                    <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{Math.round(progress)}%</p>
                  <p className="text-xs mt-2 text-red-500">{errorMsg}</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={removeVideo} className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm">
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
    </div>
  );
}