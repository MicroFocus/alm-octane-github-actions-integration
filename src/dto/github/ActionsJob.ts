/*
© Copyright 2023 Micro Focus or one of its affiliates.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

interface JobStep {
  name: string;
  status: string;
  conclusion?: string | null;
  number: number;
  started_at?: string | null;
  completed_at?: string | null;
}

interface ActionsJob {
  id: number;
  run_id: number;
  node_id: string;
  status: string;
  conclusion?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  name: string;
  steps?: JobStep[];
  labels: string[];
  runner_id?: number | null;
  runner_name?: string | null;
  runner_group_id?: number | null;
}

export { JobStep, ActionsJob };
