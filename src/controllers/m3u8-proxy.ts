import axios from "axios";
import { Request, Response } from "express";
import { allowedExtensions, LineTransform } from "../utils/line-transform";

export const m3u8Proxy = async (req: Request, res: Response) => {
  try {
    const url = req.query.url as string;
    if (!url) return res.status(400).json("url is required");

    const isStaticFiles = allowedExtensions.some(ext => url.endsWith(ext));
    const baseUrl = url.replace(/[^/]+$/, "");

    // Make request to the target server
    const response = await axios.get(url, {
      responseType: 'stream',
      headers: {
        Accept: "*/*", 
        Referer: "https://kwik.si/",
        // You can add additional headers that might be required by the target server
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    // Copy headers from the response
    const headers = { ...response.headers };
    
    // Remove content-length for m3u8 files as they might be modified
    if (!isStaticFiles) delete headers['content-length'];
    
    // Set cache control if needed
    if (headers['cache-control']) {
      res.cacheControl = { maxAge: headers['cache-control'] };
    }

    // IMPORTANT: Override CORS headers to allow your origin
    res.setHeader('Access-Control-Allow-Origin', '*');  // Or set to your specific origin
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
    
    // Set remaining response headers
    for (const [key, value] of Object.entries(headers)) {
      // Skip original CORS headers
      if (key.toLowerCase().startsWith('access-control-')) continue;
      res.set(key, value as string);
    }

    // Handle static files (direct stream)
    if (isStaticFiles) {
      return response.data.pipe(res);
    }

    // Process m3u8 content
    const transform = new LineTransform(baseUrl);
    response.data.pipe(transform).pipe(res);
    
  } catch (error: any) {
    console.error("M3U8 Proxy Error:", error.message, error.response?.status);
    res.status(error.response?.status || 500).send('Error accessing media stream');
  }
};