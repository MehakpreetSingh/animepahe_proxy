import { Transform } from 'stream';

// Extensions that should be treated as static files (direct pass-through)
export const allowedExtensions = ['.ts', '.jpg', '.key', '.mp4', '.m4s', '.aac', '.mp3', '.webm'];

export class LineTransform extends Transform {
  private buffer: string = '';
  private baseUrl: string;
  private proxyEndpoint: string;

  constructor(baseUrl: string, proxyEndpoint: string = '/m3u8-proxy') {
    super();
    this.baseUrl = baseUrl;
    this.proxyEndpoint = proxyEndpoint;
  }

  _transform(chunk: any, encoding: string, callback: Function) {
    // Add new data to our buffer
    this.buffer += chunk.toString();
    
    // Process complete lines
    const lines = this.buffer.split('\n');
    // Keep the last (potentially incomplete) line in the buffer
    this.buffer = lines.pop() || '';
    
    // Process each complete line
    const processedLines = lines.map(line => this.processLine(line));
    
    // Push processed lines back to stream
    this.push(processedLines.join('\n') + (processedLines.length ? '\n' : ''));
    callback();
  }

  _flush(callback: Function) {
    // Process any remaining data
    if (this.buffer) {
      this.push(this.processLine(this.buffer));
    }
    callback();
  }

  private processLine(line: string): string {
    // Skip empty lines or comments that don't contain URLs
    if (!line || (line.startsWith('#') && !line.includes('URI='))) {
      return line;
    }

    // Handle lines with URI attribute (like encryption keys)
    if (line.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (match, url) => {
        const absoluteUrl = this.resolveUrl(url);
        return `URI="${this.proxyEndpoint}?url=${encodeURIComponent(absoluteUrl)}"`;
      });
    }
    
    // Handle segment URLs (non-comment lines)
    if (!line.startsWith('#')) {
      const absoluteUrl = this.resolveUrl(line);
      return `${this.proxyEndpoint}?url=${encodeURIComponent(absoluteUrl)}`;
    }
    
    return line;
  }

  private resolveUrl(url: string): string {
    // If the URL is already absolute, return it as is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // Handle relative URLs
    if (url.startsWith('/')) {
      // Absolute path relative to domain
      const baseUrlObj = new URL(this.baseUrl);
      return `${baseUrlObj.protocol}//${baseUrlObj.host}${url}`;
    }
    
    // Relative path
    return `${this.baseUrl}${url}`;
  }
}