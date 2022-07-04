import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { Config } from '../config';

export class EcrRepository extends ecr.Repository {
  constructor(scope: Construct, config: Config) {
    const repo_name = `${config.stageName}-redash-ecr-repository`;
    super(scope, repo_name, {
      repositoryName: repo_name,
      lifecycleRules: [
        {
          maxImageCount: 10,
        },
      ],
    });
  }
}
