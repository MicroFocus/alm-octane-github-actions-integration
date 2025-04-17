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

import OctaneClient from '../client/octaneClient';
import { Logger } from '../utils/logger';
import { isVersionGreaterOrEqual } from '../utils/utils';

const LOGGER: Logger = new Logger('experimentService');

const MINIMUM_OCTANE_VERSION_FOR_EXPERIMENTS = '25.1.12';

class Experiment {
  public static readonly RUN_GITHUB_PIPELINE_WITH_PARAMETERS = new Experiment(
    'run_github_pipeline_with_parameters'
  );
  public static readonly RUN_GITHUB_AUTOMATED_TESTS = new Experiment(
    'run_github_automated_tests'
  );

  private readonly name: string;
  private on: boolean = false;

  constructor(name: string) {
    this.name = name;
  }

  public getName(): string {
    return this.name;
  }

  public isOn(): boolean {
    return this.on;
  }

  public isOff(): boolean {
    return !this.on;
  }

  public setOn(on: boolean): void {
    this.on = on;
    LOGGER.info(`Feature '${this.name}' is ${this.on ? 'on' : 'off'}.`);
  }
}

const loadExperiments = async (): Promise<void> => {
  const currentOctaneVersion = await OctaneClient.getOctaneVersion();
  if (
    isVersionGreaterOrEqual(
      currentOctaneVersion,
      MINIMUM_OCTANE_VERSION_FOR_EXPERIMENTS
    )
  ) {
    LOGGER.debug(
      `${currentOctaneVersion} vs ${MINIMUM_OCTANE_VERSION_FOR_EXPERIMENTS}`
    );
    const experimentsMap = await OctaneClient.getFeatureToggles();

    Experiment.RUN_GITHUB_PIPELINE_WITH_PARAMETERS.setOn(
      experimentsMap[Experiment.RUN_GITHUB_PIPELINE_WITH_PARAMETERS.getName()]
    );
    Experiment.RUN_GITHUB_AUTOMATED_TESTS.setOn(
      experimentsMap[Experiment.RUN_GITHUB_AUTOMATED_TESTS.getName()]
    );
  } else {
    LOGGER.info(
      `The current version of Octane is older that ${MINIMUM_OCTANE_VERSION_FOR_EXPERIMENTS}. Turning off all experiments...`
    );
  }
};

export { Experiment, loadExperiments };
