/**
 * Detects the client's public IP address using various public IP detection services
 */
export async function detectClientPublicIP(): Promise<string | undefined> {
  console.log('Starting client public IP detection...');
  
  // Try our own server endpoint first (no CORS issues)
  try {
    const response = await fetch('/api/client-ip', {
      cache: 'no-cache',
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      const ip = data.ip;
      if (ip && isValidIP(ip)) {
        console.log(`Client public IP detected via own server: ${ip}`);
        return ip;
      }
    }
  } catch (error) {
    console.warn('Failed to get IP from own server:', error);
  }
  
  // Fallback to external IP detection services
  const ipDetectionServices = [
    { url: 'https://api.ipify.org?format=json', field: 'ip' },
    { url: 'https://ipapi.co/json/', field: 'ip' },
    { url: 'https://api.my-ip.io/ip.json', field: 'ip' },
    { url: 'https://api.ip.sb/jsonip', field: 'ip' },
    { url: 'https://jsonip.com/', field: 'ip' },
    { url: 'https://api.bigdatacloud.net/data/client-ip', field: 'ipString' },
  ];

  for (const service of ipDetectionServices) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(service.url, {
        signal: controller.signal,
        cache: 'no-cache',
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        
        // Handle both JSON and plain text responses
        let ip: string | undefined;
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          ip = data[service.field];
        } else {
          // Some services return plain text IP
          const text = await response.text();
          ip = text.trim();
        }
        
        if (ip && isValidIP(ip)) {
          console.log(`Client public IP detected: ${ip} (via ${service.url})`);
          return ip;
        }
      }
    } catch (error) {
      console.warn(`Failed to get IP from ${service.url}:`, error);
      continue;
    }
  }

  // Fallback: Try to get IP from WebRTC (works in some browsers)
  try {
    const ip = await getIPFromWebRTC();
    if (ip) {
      console.log(`Client public IP detected via WebRTC: ${ip}`);
      return ip;
    }
  } catch (error) {
    console.warn('WebRTC IP detection failed:', error);
  }

  console.warn('Unable to detect client public IP');
  return undefined;
}

/**
 * Validates if a string is a valid IP address
 */
function isValidIP(ip: string): boolean {
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(ip)) {
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  // IPv6 pattern (simplified)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Pattern.test(ip);
}

/**
 * Attempts to get IP using WebRTC (works in some browsers)
 * This is a fallback method and may not work in all environments
 */
async function getIPFromWebRTC(): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      const noop = () => {};
      
      pc.createDataChannel('');
      pc.createOffer().then(offer => pc.setLocalDescription(offer)).catch(noop);
      
      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate || !ice.candidate.candidate) {
          pc.close();
          resolve(undefined);
          return;
        }
        
        const candidate = ice.candidate.candidate;
        const ipMatch = candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
        
        if (ipMatch && ipMatch[0]) {
          const ip = ipMatch[0];
          // Filter out private IPs
          if (!ip.startsWith('10.') && 
              !ip.startsWith('192.168.') && 
              !ip.startsWith('172.') && 
              !ip.startsWith('127.')) {
            pc.close();
            resolve(ip);
            return;
          }
        }
      };
      
      // Timeout after 2 seconds
      setTimeout(() => {
        pc.close();
        resolve(undefined);
      }, 2000);
    } catch (error) {
      resolve(undefined);
    }
  });
}
