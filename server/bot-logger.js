// In-memory rotating log buffer for bot console output.
// Singleton shared across bot-runner, bot.js, and bot2.js.

const MAX_LOGS = 2000;

class BotLogger {
  constructor() {
    this._logs = [];
  }

  write(name, msg) {
    const ts = new Date().toISOString();
    this._logs.push({ ts, name: String(name), msg: String(msg) });
    if (this._logs.length > MAX_LOGS) {
      this._logs.splice(0, this._logs.length - MAX_LOGS);
    }
  }

  read(since) {
    if (!since) return this._logs;
    const sinceTime = new Date(since).getTime();
    if (isNaN(sinceTime)) return this._logs;
    return this._logs.filter(e => new Date(e.ts).getTime() > sinceTime);
  }

  clear() {
    this._logs = [];
  }
}

const instance = new BotLogger();
module.exports = instance;
