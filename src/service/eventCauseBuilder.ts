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

import CiEventCause from '../dto/octane/events/CiEventCause';
import { CiCausesType } from '../dto/octane/events/CiTypes';

interface CauseJobData {
  jobName: string;
  causeType?: string;
  userId?: string;
  userName?: string;
  isRoot: boolean;
  parentJobData?: CauseJobData;
}

const getCiEventCauses = (
  jobData: CauseJobData,
  buildCiId: string
): CiEventCause[] => {
  if (jobData.isRoot) {
    if (!jobData.causeType) {
      throw new Error('Root job must always have a cause type!');
    }

    return [
      {
        type: convertRootCauseType(jobData.causeType),
        project: jobData.jobName,
        buildCiId,
        userId: jobData.userId,
        userName: jobData.userName
      }
    ];
  }
  if (!jobData?.parentJobData) {
    throw new Error('If not root cause then must have job data!');
  }
  return [
    {
      type: CiCausesType.UPSTREAM,
      project: jobData.parentJobData.jobName,
      buildCiId,
      causes: getCiEventCauses(jobData.parentJobData, buildCiId)
    }
  ];
};

const convertRootCauseType = (causeType: string | undefined): CiCausesType => {
  switch (causeType) {
    case 'workflow_dispatch':
      return CiCausesType.USER;
    case 'pull_request':
    case 'push':
    case 'create':
    case 'delete':
    case 'fork':
    case 'merge_group':
      return CiCausesType.SCM;
    case 'schedule':
      return CiCausesType.TIMER;
    case 'workflow_run':
    case 'workflow_call':
      return CiCausesType.UPSTREAM;
    default:
      return CiCausesType.UNDEFINED;
  }
};

export { CauseJobData, getCiEventCauses, convertRootCauseType };
