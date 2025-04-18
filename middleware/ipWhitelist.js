const allowedIPs = [
  '23.227.38.32',
  '::ffff:192.168.0.106',
  '::1',
  '::ffff:127.0.0.1',
  '116.72.32.113',
  '116.72.18.198',
  '127.0.0.1', // Localhost
  '192.168.1.1', // Example IP
  // Add more IPs as needed
];

const ipWhitelist = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  

  if (allowedIPs.includes(clientIp)) {
    return next();
  }

  res.status(403).json({ error: 'Access denied' });
};

export default ipWhitelist; 