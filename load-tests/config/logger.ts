type LogData = Record<string, unknown>;

const format = (message: string, data?: LogData) => {
  if (!data) return message;

  return `${message} ${JSON.stringify(data)}`;
};

const logger = {
  info(message: string, data?: LogData) {
    console.log(format(message, data));
  },

  warn(message: string, data?: LogData) {
    console.warn(format(message, data));
  },

  error(message: string, data?: LogData) {
    console.error(format(message, data));
  },

  debug(message: string, data?: LogData) {
    console.log(format(message, data));
  },
};

export default logger;
