const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory
const logsDir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(logsDir, { recursive: true });

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const levelEmoji = {
      error: '❌',
      warn: '⚠️',
      info: '📌',
      debug: '🔍'
    };
    
    const emoji = levelEmoji[level] || '📝';
    let output = `${timestamp} ${emoji} ${message}`;
    
    if (Object.keys(meta).length > 0) {
      output += ` ${JSON.stringify(meta)}`;
    }
    
    return output;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'discovery-platform' },
  transports: [
    // Console transport with custom format
    new winston.transports.Console({
      format: consoleFormat
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'discovery.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5
    })
  ]
});

// Add performance logging
logger.time = (label) => {
  logger.profile(label);
};

logger.timeEnd = (label, meta = {}) => {
  logger.profile(label, meta);
};

// Export logger
module.exports = { logger };