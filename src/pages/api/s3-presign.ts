// src/pages/api/s3-presign.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serverSupabase } from "@/lib/serverSupabase";

const REGION = process.env.AWS_REGION!;
const BUCKET = process.env.AWS_S3_BUCKET!;

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { authorization } = req.headers;
    if (!authorization) return res.status(401).json({ error: "Missing Authorization header" });

    const token = authorization.replace("Bearer ", "");
    // Verify user via Supabase server client
    const { data: userData, error: userErr } = await serverSupabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    const user = userData.user;

    // Expect body: { path, contentType }
    const { path, contentType } = req.body as { path: string; contentType: string };
    if (!path || !contentType) return res.status(400).json({ error: "Missing path or contentType" });

    const key = path; // e.g. uploads/<user.id>/ts_filename.mp4

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: "private", // keep private; use presigned GET for downloads later
    });

    // Presigned PUT URL valid for 15 minutes
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

    // Return signed URL + key to client
    return res.status(200).json({ url: signedUrl, key, userId: user.id });
 } catch (err: unknown) {
  console.error("s3-presign error:", err);
  if (err instanceof Error) {
    return res.status(500).json({ error: err.message });
  }
  return res.status(500).json({ error: "Server error" });
}
}