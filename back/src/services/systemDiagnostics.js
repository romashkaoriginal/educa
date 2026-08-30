const fs = require('fs');
const os = require('os');

function parseMeminfo(value) {
  const fields = {};
  String(value || '').split('\n').forEach((line) => {
    const match = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB$/);
    if (match) fields[match[1]] = Number(match[2]) * 1024;
  });

  const totalBytes = fields.MemTotal || os.totalmem();
  const availableBytes = fields.MemAvailable ?? fields.MemFree ?? os.freemem();
  const usedBytes = Math.max(0, totalBytes - availableBytes);

  return {
    totalBytes,
    usedBytes,
    availableBytes,
    usagePercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0,
  };
}

function readServerMemory() {
  try {
    return parseMeminfo(fs.readFileSync('/proc/meminfo', 'utf8'));
  } catch {
    return parseMeminfo('');
  }
}

function countOnlineUsers(io) {
  if (!io?.sockets?.sockets) return 0;
  const userIds = new Set();
  for (const socket of io.sockets.sockets.values()) {
    const userId = socket.data?.dbUser?.id;
    if (userId != null) userIds.add(String(userId));
  }
  return userIds.size;
}

function getSystemDiagnostics(io) {
  return {
    memory: {
      ...readServerMemory(),
      processBytes: process.memoryUsage().rss,
    },
    onlineUsers: countOnlineUsers(io),
    measuredAt: new Date().toISOString(),
  };
}

module.exports = {
  countOnlineUsers,
  getSystemDiagnostics,
  parseMeminfo,
  readServerMemory,
};
