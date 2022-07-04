#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { RedashStack } from "../lib/redash-stack";

const app = new cdk.App();

const config = {
  stageName: "dev",
  vpcId: null,
  accountId: "<accountId>",
  region: "<region>",
  redashImage: "redash/redash:10.1.0.b50633",
};

new RedashStack(app, config);
