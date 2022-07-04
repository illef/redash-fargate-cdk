import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

import { Config } from '../config';

export class RdsRedash extends rds.DatabaseInstance {
  constructor(scope: Construct, config: Config, vpc: ec2.IVpc) {
    const id = `${config.stageName}-redash-rds`;

    const parameterGroup = new RdsRedashParameterGroup(scope, config);
    const securityGroup = new Ec2RedashRdsSecurityGroup(scope, config, vpc);

    super(scope, id, {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_13_6,
      }),
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      databaseName: 'redash',
      instanceType: new ec2.InstanceType('t3.micro'),
      instanceIdentifier: id,
      port: 5432,
      parameterGroup: parameterGroup,
      securityGroups: [securityGroup],
    });
  }
}

class Ec2RedashRdsSecurityGroup extends ec2.SecurityGroup {
  constructor(scope: Construct, config: Config, vpc: ec2.IVpc) {
    const id = `${config.stageName}-redash-ec2-rds-sg`;
    super(scope, id, {
      securityGroupName: id,
      allowAllOutbound: true,
      description: 'Redash DB Security Group',
      vpc: vpc,
    });

    for (const subnet of vpc.privateSubnets) {
      this.addIngressRule(
        ec2.Peer.ipv4(subnet.ipv4CidrBlock),
        ec2.Port.tcp(5432),
      );
    }
  }
}

class RdsRedashParameterGroup extends rds.ParameterGroup {
  constructor(scope: Construct, config: Config) {
    const id = `${config.stageName}-redash-metadata-db-parameter-group`;
    super(scope, id, {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_13_6,
      }),
      description: 'Redash Metadata DB Parameter Group',
      parameters: {
        max_connections: '100',
      },
    });
  }
}
