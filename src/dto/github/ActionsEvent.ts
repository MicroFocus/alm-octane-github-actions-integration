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

import {
  PayloadRepository,
  WebhookPayload
} from '@actions/github/lib/interfaces';

interface GitHubRepository extends PayloadRepository {
  id?: string;
}

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

export default interface ActionsEvent extends WebhookPayload {
  repository?: GitHubRepository;
  workflow?: {
    name: string;
  };
  workflow_run?: {
    id: number;
    conclusion?: string;
    run_started_at: string;
    updated_at?: string;
    run_number?: number;
    head_branch?: string;
    event: string;
    triggering_actor: {
      login: string;
    };
  };
}
