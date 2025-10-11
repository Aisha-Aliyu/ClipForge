// src/pages/api/confirm-upload.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { serverSupabase } from "@/lib/serverSupabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { authorization } = req.headers;
    if (!authorization) {
      return res.status(401).json({ error: "Missing Authorization header" });
    }

    const token = authorization.replace("Bearer ", "");
    const { data: userData, error: userErr } = await serverSupabase.auth.getUser(token);

    if (userErr || !userData?.user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const user = userData.user;
    const { key, filename, contentType, size, publicUrl } = req.body;

    if (!key || !filename) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Insert metadata into videos table; serverSupabase uses service_role so bypasses RLS
    const { error: insertErr } = await serverSupabase.from("videos").insert([
      {
        filename,
        content_type: contentType || null,
        size: size || null,
        storage_path: key,
        public_url: publicUrl || null,
        user_id: user.id,
      },
    ]);

    if (insertErr) {
      console.error("insertErr", insertErr);
      return res.status(500).json({ error: "Failed to insert metadata" });
    }

    return res.status(200).json({ ok: true });
  } catch (err: unknown) {
    console.error("confirm-upload error:", err);

    if (err instanceof Error) {
      return res.status(500).json({ error: err.message });
    }

    return res.status(500).json({ error: "Server error" });
  }
}