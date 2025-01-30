/*
 * Copyright 2016-2024 Open Text.
 *
 * The only warranties for products and services of Open Text and
 * its affiliates and licensors (“Open Text”) are as may be set forth
 * in the express warranty statements accompanying such products and services.
 * Nothing herein should be construed as constituting an additional warranty.
 * Open Text shall not be liable for technical or editorial errors or
 * omissions contained herein. The information contained herein is subject
 * to change without notice.
 *
 * Except as specifically indicated otherwise, this document contains
 * confidential information and a valid license is required for possession,
 * use or copying. If this work is provided to the U.S. Government,
 * consistent with FAR 12.211 and 12.212, Commercial Computer Software,
 * Computer Software Documentation, and Technical Data for Commercial Items are
 * licensed to the U.S. Government under vendor's standard commercial license.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
    4: { value: 4, display: 'WARNING' },
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
