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

import * as path from 'path';

const extractWorkflowFileName = (workflowPath: string): string => {
  return path.basename(workflowPath);
};

const isVersionGreaterOrEqual = (
  version1: string,
  version2: string
): boolean => {
  if (!version1 || !version2) {
    return false;
  }

  const version1Array = version1.split('.');
  const version2Array = version2.split('.');

  for (let i = 0; i < version1Array.length && i < version2Array.length; i++) {
    const version1Part = parseInt(version1Array[i]);
    const version2Part = parseInt(version2Array[i]);

    if (version1Part !== version2Part) {
      return version1Part > version2Part;
    }
  }

  return version1Array.length >= version2Array.length;
};

const sleep = async (milis: number): Promise<void> => {
  return new Promise<void>(resolve => {
    setTimeout(resolve, milis);
  });
};

export { extractWorkflowFileName, isVersionGreaterOrEqual, sleep };
