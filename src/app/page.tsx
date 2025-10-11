// src/app/page.tsx
import VideoUploader from "@/components/VideoUploader";
import Auth from "@/components/Auth";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-start px-4 py-10 gap-8">
      <header className="w-full max-w-4xl flex items-center justify-between">
        <h1 className="text-3xl font-bold text-indigo-600">🎬 ClipForge</h1>
        <Auth />
      </header>

      <p className="text-gray-600 dark:text-gray-300 mb-2 text-center max-w-2xl">
        Upload and process videos — only accessible to signed-in users.
      </p>

      <VideoUploader />
    </main>
  );
}