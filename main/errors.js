'use strict';

class CdoError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'CdoError';
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

function toIpcError(err) {
  if (err instanceof CdoError) {
    return {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      }
    };
  }
  return {
    ok: false,
    error: {
      code: err?.code || 'INTERNAL_ERROR',
      message: err?.message || String(err)
    }
  };
}

module.exports = {
  CdoError,
  toIpcError
};
