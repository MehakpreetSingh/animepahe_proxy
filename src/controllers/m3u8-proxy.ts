import axios from "axios";
import { Request, Response } from "express";
import { allowedExtensions, LineTransform } from "../utils/line-transform";

export const m3u8Proxy = async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    if (!url) return res.status(400).json({ error: "URL is required" });

    // Determine if this is a static file (segment, key, etc.) or an m3u8 manifest
    const isStaticFile = allowedExtensions.some(ext => url.toLowerCase().includes(ext));
    
    // Get base URL for resolving relative paths
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

    // Set request headers to mimic a browser request
    const headers = {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://kwik.si/',
      'Origin': 'https://kwik.si',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    // Make request to original server
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      headers: headers,
      timeout: 30000, // 30 second timeout
      maxRedirects: 5
    });

    // Set CORS headers to allow requests from any origin
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
    
    // Forward content type and other important headers
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type']);
    } else {
      // Set appropriate content type based on file extension
      if (url.endsWith('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      } else if (url.endsWith('.ts')) {
        res.setHeader('Content-Type', 'video/mp2t');
      } else if (url.endsWith('.jpg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (url.endsWith('.key')) {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
    }

    // Set caching headers
    if (response.headers['cache-control']) {
      res.setHeader('Cache-Control', response.headers['cache-control']);
    } else {
      // Enable caching for static segments
      if (isStaticFile) {
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      } else {
        res.setHeader('Cache-Control', 'public, max-age=60'); // Cache manifest for 1 minute
      }
    }

    // For static files, directly pipe the response
    if (isStaticFile) {
      return response.data.pipe(res);
    }

    // For m3u8 files, transform URLs inside the file
    const transform = new LineTransform(baseUrl);
    response.data.pipe(transform).pipe(res);
    
  } catch (error: any) {
    console.error("M3U8 Proxy Error:", error.message);
    console.error("Error details:", error.response?.status || "No status", error.response?.statusText || "No details");
    
    // Send appropriate error response
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: "Failed to proxy media content",
      details: error.message
    });
  }
};