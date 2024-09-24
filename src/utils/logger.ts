import { getConfig } from '../config/config';

enum LogLevel {
  TRACE = 1,
  DEBUG = 2,
  INFO = 3,
  WARN = 4,
  ERROR = 5
}

export class Logger {
  private minLevel: number;
  private module: string;
  private readonly levels: {
    [key: number]: { value: number; display: string };
  } = {
    1: { value: 1, display: 'TRACE' },
    2: { value: 2, display: 'DEBUG' },
    3: { value: 3, display: 'INFO' },
    4: { value: 4, display: 'WARN' },
    5: { value: 5, display: 'ERROR' }
  };

  constructor(module: string) {
    this.module = module;
    this.minLevel = getConfig().logLevel;
  }

  public trace(message: string): void {
    this.log(LogLevel.TRACE, message);
  }
  public debug(message: string): void {
    this.log(LogLevel.DEBUG, message);
  }
  public info(message: string): void {
    this.log(LogLevel.INFO, message);
  }
  public warn(message: string): void {
    this.log(LogLevel.WARN, message);
  }
  public error(message: string): void {
    this.log(LogLevel.ERROR, message);
  }

  /**
   * Log a message at a certain logging level.
   *
   * @param logLevel Level to log at
   * @param message Message to log
   */
  private log(logLevel: LogLevel, message: string): void {
    const level = this.getLevel(logLevel);
    if (!level || level.value < this.minLevel) return;

    this.emit(level.display, message);
  }

  /**
   * Converts a string level (trace/debug/info/warn/error) into a number and display value
   *
   * @param minLevel
   */
  private getLevel(
    minLevel: LogLevel
  ): { value: number; display: string } | undefined {
    if (minLevel in this.levels) return this.levels[minLevel];
    else return undefined;
  }

  /**
   * Emits a log message.
   *
   * @param logLevelPrefix Display name of the log level
   * @param message Message to log
   */
  private emit(logLevelPrefix: string, message: string): void {
    console.log(`[${logLevelPrefix}][${this.module}] ${message}`);
  }
}
