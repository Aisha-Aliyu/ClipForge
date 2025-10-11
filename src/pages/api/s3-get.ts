// src/pages/api/s3-get.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const { authorization } = req.headers;
    if (!authorization) return res.status(401).json({ error: "Missing Authorization header" });

    const token = authorization.replace("Bearer ", "");
    const { data: userData, error: userErr } = await serverSupabase.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid token" });

    const key = req.query.key as string;
    if (!key) return res.status(400).json({ error: "Missing key query param" });

    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

    return res.status(200).json({ url: signedUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server error";
    console.error("s3-get error:", err);
    return res.status(500).json({ error: message });
  }
}