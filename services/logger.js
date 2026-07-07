const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LOG_TYPE = {
  LOGIN: 'login',
  POST: 'post',
  ERROR: 'error',
  API: 'api',
  DATABASE: 'database',
  SYSTEM: 'system'
};

const currentLogLevel = LOG_LEVELS.DEBUG;

function shouldLog(level) {
  return level >= currentLogLevel;
}

function formatTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 23);
}

function formatLog(prefix, type, message, data) {
  const timestamp = formatTimestamp();
  let logString = `[${timestamp}] [${prefix}] [${type}] ${message}`;
  
  if (data) {
    try {
      logString += ` | Data: ${JSON.stringify(data)}`;
    } catch (e) {
      logString += ` | Data: ${String(data)}`;
    }
  }
  
  return logString;
}

let isLoggingError = false;

export const loggerService = {
  LOG_LEVELS,
  LOG_TYPE,
  
  debug(type, message, data = null) {
    if (shouldLog(LOG_LEVELS.DEBUG)) {
      console.debug(formatLog('DEBUG', type, message, data));
    }
  },
  
  info(type, message, data = null) {
    if (shouldLog(LOG_LEVELS.INFO)) {
      console.info(formatLog('INFO', type, message, data));
    }
  },
  
  warn(type, message, data = null) {
    if (shouldLog(LOG_LEVELS.WARN)) {
      console.warn(formatLog('WARN', type, message, data));
    }
  },
  
  error(type, message, data = null) {
    if (shouldLog(LOG_LEVELS.ERROR)) {
      console.error(formatLog('ERROR', type, message, data));
    }
  },
  
  async logLogin(userId, result, details = {}) {
    const logData = {
      userId,
      result,
      timestamp: formatTimestamp(),
      ip: details.ip || '',
      userAgent: details.userAgent || '',
      device: details.device || '',
      location: details.location || ''
    };
    
    this.info(LOG_TYPE.LOGIN, `User login ${result}`, logData);
  },
  
  async logPost(userId, postId, action, result, details = {}) {
    const logData = {
      userId,
      postId,
      action,
      result,
      timestamp: formatTimestamp(),
      ...details
    };
    
    this.info(LOG_TYPE.POST, `Post ${action} ${result}`, logData);
  },
  
  async logError(error, context = {}) {
    if (isLoggingError) {
      return;
    }
    
    isLoggingError = true;
    
    const logData = {
      error: {
        message: error.message || '',
        name: error.name || '',
        stack: error.stack || '',
        code: error.code || ''
      },
      context,
      timestamp: formatTimestamp(),
      userId: context.userId || null,
      operation: context.operation || '',
      table: context.table || '',
      action: context.action || ''
    };
    
    this.error(LOG_TYPE.ERROR, error.message || 'Unknown error', logData);
    
    isLoggingError = false;
  },
  
  async logApi(method, url, status, duration, details = {}) {
    const logData = {
      method,
      url,
      status,
      duration,
      timestamp: formatTimestamp(),
      ...details
    };
    
    if (status >= 400) {
      this.error(LOG_TYPE.API, `API ${method} ${url} failed`, logData);
    } else {
      this.debug(LOG_TYPE.API, `API ${method} ${url}`, logData);
    }
  },
  
  async logDatabase(table, action, result, details = {}) {
    if (isLoggingError && !result) {
      return;
    }
    
    const logData = {
      table,
      action,
      result: result ? 'success' : 'failed',
      timestamp: formatTimestamp(),
      ...details
    };
    
    if (!result) {
      this.error(LOG_TYPE.DATABASE, `DB ${action} ${table} failed`, logData);
    } else {
      this.debug(LOG_TYPE.DATABASE, `DB ${action} ${table}`, logData);
    }
  },
  
  async logSystem(message, details = {}) {
    const logData = {
      message,
      timestamp: formatTimestamp(),
      ...details
    };
    
    this.info(LOG_TYPE.SYSTEM, message, logData);
  }
};

export default loggerService;