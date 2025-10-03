import { Router } from 'express';

const router = Router();

// Existing config endpoint
router.get('/config', (req, res) => {
  res.json({
    defaultSSHHost: process.env.SSH_HOST || '',
    defaultSSHPort: parseInt(process.env.SSH_PORT || '22', 10)
  });
});

// New endpoint to help with client IP detection
router.get('/client-ip', (req, res) => {
  // Get IP from various possible headers
  const ip = 
    req.headers['cf-connecting-ip'] as string ||
    req.headers['x-real-ip'] as string ||
    req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    '';

  // Clean up the IP
  let cleanIp = ip;
  
  // Remove IPv6 prefix if present
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }
  
  // Remove port if present
  const portIndex = cleanIp.lastIndexOf(':');
  if (portIndex > 0 && !cleanIp.includes('[')) {
    // Check if it's not IPv6 (which has multiple colons)
    const colonCount = (cleanIp.match(/:/g) || []).length;
    if (colonCount === 1) {
      cleanIp = cleanIp.substring(0, portIndex);
    }
  }

  console.log(`Client IP detection via /api/client-ip: ${cleanIp} (raw: ${ip})`);
  
  res.json({ ip: cleanIp });
});

export default router;
