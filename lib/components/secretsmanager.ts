import * as secrets_manager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { Config } from '../config';

export class SecretRedash extends secrets_manager.Secret {
  constructor(scope: Construct, config: Config, name: String) {
    const id = `${config.stageName}-redash-${name}-secret`;
    super(scope, id, {
      secretName: id,
      generateSecretString: { passwordLength: 32 },
    });
  }
}
