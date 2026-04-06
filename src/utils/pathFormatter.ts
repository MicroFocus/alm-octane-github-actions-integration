/*
 * Copyright 2022-2025 Open Text.
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

import { GITHUB_ACTIONS_PLUGIN_VERSION } from './constants';
import OctaneClient from '../client/octaneClient';
import { isVersionGreaterOrEqual } from './utils';

class PathFormatterService {
  public static readonly NEW_SEPARATOR = '|~~|';

  private static readonly OLD_SEPARATOR = '/';
  private static readonly JOB_CI_ID_EXECUTOR = 'executor';
  private static readonly VERSION_THRESHOLD = '26.1.23';

  private static useNewFormat: boolean | undefined;

  private static async checkVersion(): Promise<void> {
    if (PathFormatterService.useNewFormat === undefined) {
      try {
        const octaneVersion = await OctaneClient.getOctaneVersion();
        PathFormatterService.useNewFormat = isVersionGreaterOrEqual(
          octaneVersion,
          PathFormatterService.VERSION_THRESHOLD
        );
      } catch (error) {
        console.error(
          'Failed to get Octane version, defaulting to new format',
          error
        );
        PathFormatterService.useNewFormat = true;
      }
    }
  }

  private static getSeparator(): string {
    return PathFormatterService.useNewFormat
      ? PathFormatterService.NEW_SEPARATOR
      : PathFormatterService.OLD_SEPARATOR;
  }

  private static getPrefix(): string {
    return PathFormatterService.useNewFormat
      ? `${GITHUB_ACTIONS_PLUGIN_VERSION}${PathFormatterService.NEW_SEPARATOR}`
      : '';
  }

  public static async buildJobCiIdPrefix(
    repositoryOwner: string,
    repositoryName: string,
    workflowFileName: string
  ): Promise<string> {
    await PathFormatterService.checkVersion();
    const separator = PathFormatterService.getSeparator();
    return `${PathFormatterService.getPrefix()}${repositoryOwner}${separator}${repositoryName}${separator}${workflowFileName}`;
  }

  public static async buildExecutorCiId(
    repositoryOwner: string,
    repositoryName: string,
    workflowFileName: string,
    branchName?: string
  ): Promise<string> {
    await PathFormatterService.checkVersion();
    const separator = PathFormatterService.getSeparator();
    const jobCiIdPrefix = await PathFormatterService.buildJobCiIdPrefix(
      repositoryOwner,
      repositoryName,
      workflowFileName
    );
    return branchName
      ? `${jobCiIdPrefix}${separator}${PathFormatterService.JOB_CI_ID_EXECUTOR}${separator}${branchName}`
      : `${jobCiIdPrefix}${separator}${PathFormatterService.JOB_CI_ID_EXECUTOR}`;
  }

  public static async appendBranchName(
    jobCiId: string,
    branchName: string
  ): Promise<string> {
    await PathFormatterService.checkVersion();
    return `${jobCiId}${PathFormatterService.getSeparator()}${branchName}`;
  }

  public static async appendJobName(
    jobCiId: string,
    jobName: string
  ): Promise<string> {
    await PathFormatterService.checkVersion();
    return `${jobCiId}${PathFormatterService.getSeparator()}${jobName}`;
  }
}

export const {
  NEW_SEPARATOR,
  buildJobCiIdPrefix,
  buildExecutorCiId,
  appendBranchName,
  appendJobName
} = PathFormatterService;
